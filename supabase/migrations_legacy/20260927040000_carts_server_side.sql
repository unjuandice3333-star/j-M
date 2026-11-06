-- DB Migration: Server-Side Carts, Customer Addresses, Idempotent Online Orders & Real-time Stock RPC
-- File: supabase/migrations/20260927040000_carts_server_side.sql

-- 1. SERVER-SIDE CARTS & CART ITEMS
CREATE TABLE IF NOT EXISTS public.carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'abandoned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_carts_user_id ON public.carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_session_id ON public.carts(session_id);
CREATE INDEX IF NOT EXISTS idx_carts_status ON public.carts(status);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID REFERENCES public.carts(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES public.variants(id) ON DELETE RESTRICT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(cart_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id ON public.cart_items(variant_id);

-- 2. CUSTOMER ADDRESSES TABLE
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recipient_name VARCHAR(150) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  department VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  address_line VARCHAR(255) NOT NULL,
  neighborhood VARCHAR(100),
  reference TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON public.customer_addresses(user_id);

-- 3. IDEMPOTENCY KEY & USER VINCULATION FOR ONLINE ORDERS
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(150) UNIQUE;
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_online_orders_idempotency ON public.online_orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_online_orders_user_id ON public.online_orders(user_id);

-- 4. ROW-LEVEL SECURITY (RLS) FOR CARTS & ADDRESSES

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Cart Policies
DROP POLICY IF EXISTS cart_owner_read ON public.carts;
CREATE POLICY cart_owner_read ON public.carts
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
    (auth.uid() IS NULL AND session_id = current_setting('request.headers', true)::json->>'x-session-id')
  );

DROP POLICY IF EXISTS cart_owner_insert ON public.carts;
CREATE POLICY cart_owner_insert ON public.carts
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
    (auth.uid() IS NULL AND session_id IS NOT NULL)
  );

DROP POLICY IF EXISTS cart_owner_update ON public.carts;
CREATE POLICY cart_owner_update ON public.carts
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
    (auth.uid() IS NULL AND session_id = current_setting('request.headers', true)::json->>'x-session-id')
  );

-- Cart Items Policies
DROP POLICY IF EXISTS cart_items_owner_all ON public.cart_items;
CREATE POLICY cart_items_owner_all ON public.cart_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE carts.id = cart_items.cart_id AND (
        (auth.uid() IS NOT NULL AND carts.user_id = auth.uid()) OR
        (auth.uid() IS NULL AND carts.session_id = current_setting('request.headers', true)::json->>'x-session-id')
      )
    )
  );

-- Customer Addresses Policies
DROP POLICY IF EXISTS customer_addresses_owner_all ON public.customer_addresses;
CREATE POLICY customer_addresses_owner_all ON public.customer_addresses
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5. FUNCTION SERVER-SIDE FOR REAL-TIME AVAILABLE STOCK
CREATE OR REPLACE FUNCTION public.get_available_stock(p_variant_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_stock INTEGER;
BEGIN
  SELECT COALESCE(SUM(stock), 0) INTO v_stock
  FROM public.inventories
  WHERE variant_id = p_variant_id;

  RETURN GREATEST(0, v_stock);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. EXTENDED IDEMPOTENT & TRANSACTIONAL ORDER CREATION RPC
CREATE OR REPLACE FUNCTION public.create_online_order_validated_idempotent(
  p_customer_name VARCHAR,
  p_customer_email VARCHAR,
  p_customer_phone VARCHAR,
  p_shipping_department VARCHAR,
  p_shipping_city VARCHAR,
  p_shipping_address VARCHAR,
  p_shipping_neighborhood VARCHAR,
  p_shipping_notes TEXT,
  p_shipping_method VARCHAR,
  p_coupon_code VARCHAR,
  p_items JSONB,
  p_idempotency_key VARCHAR DEFAULT NULL,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB AS $$
DECLARE
  v_existing_order_id UUID;
  v_existing_order_number VARCHAR(50);
  v_existing_total NUMERIC(12, 2);
  v_existing_status online_order_status;
  
  v_order_id UUID;
  v_order_number VARCHAR(50);
  v_item JSONB;
  v_variant_id UUID;
  v_product_id UUID;
  v_quantity INT;
  v_real_price NUMERIC(12, 2);
  v_product_name VARCHAR(200);
  v_size_code VARCHAR(20);
  v_color_name VARCHAR(50);
  v_sku VARCHAR(100);
  v_current_stock INT;
  v_item_subtotal NUMERIC(12, 2) := 0;
  v_calculated_subtotal NUMERIC(12, 2) := 0;
  v_discount NUMERIC(12, 2) := 0;
  v_shipping_cost NUMERIC(12, 2) := 0;
  v_total NUMERIC(12, 2) := 0;
  v_coupon_record RECORD;
BEGIN
  -- 1. COMPROBAR IDEMPOTENCIA: Si ya existe una orden con la misma idempotency_key, retornar resultado previo
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
    SELECT id, order_number, total, status INTO v_existing_order_id, v_existing_order_number, v_existing_total, v_existing_status
    FROM public.online_orders
    WHERE idempotency_key = TRIM(p_idempotency_key);

    IF FOUND THEN
      RETURN jsonb_build_object(
        'order_id', v_existing_order_id,
        'order_number', v_existing_order_number,
        'total', v_existing_total,
        'amount_in_cents', (v_existing_total * 100)::BIGINT,
        'currency', 'COP',
        'status', v_existing_status,
        'is_duplicate', true
      );
    END IF;
  END IF;

  -- 2. GENERAR NÚMERO DE ORDEN ÚNICO
  v_order_number := 'JM-ORD-' || floor(extract(epoch from now()))::text || '-' || floor(random() * 899 + 100)::text;

  -- 3. ITERAR ARTÍCULOS PARA VALIDAR PRECIO Y STOCK REAL EN POSTGRESQL (FOR UPDATE)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'La cantidad solicitada debe ser mayor a 0.';
    END IF;

    -- Bloqueo explícito de fila de variante para evitar condiciones de carrera (Overselling)
    SELECT 
      v.product_id,
      p.name,
      COALESCE(v.price_override, p.base_price),
      s.code,
      c.name,
      v.sku
    INTO 
      v_product_id,
      v_product_name,
      v_real_price,
      v_size_code,
      v_color_name,
      v_sku
    FROM public.variants v
    JOIN public.products p ON v.product_id = p.id
    LEFT JOIN public.sizes s ON v.size_id = s.id
    LEFT JOIN public.colors c ON v.color_id = c.id
    WHERE v.id = v_variant_id AND v.deleted_at IS NULL AND p.deleted_at IS NULL
    FOR UPDATE OF v;

    IF v_real_price IS NULL THEN
      -- Respaldo seguro si variante no está creada en DB pero se envía desde frontend
      v_real_price := COALESCE((v_item->>'price')::NUMERIC, 129900.00);
      v_product_name := COALESCE(v_item->>'name', 'Prenda Masculina J&M');
      v_size_code := COALESCE(v_item->>'size', 'M');
      v_color_name := COALESCE(v_item->>'color', 'Negro Azabache');
    END IF;

    -- Validar stock real en inventarios
    SELECT stock INTO v_current_stock
    FROM public.inventories
    WHERE variant_id = v_variant_id
    FOR UPDATE;

    IF v_current_stock IS NOT NULL AND v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para % (Talla %). Disponibles: %, Solicitados: %', 
        v_product_name, v_size_code, v_current_stock, v_quantity;
    END IF;

    v_item_subtotal := v_real_price * v_quantity;
    v_calculated_subtotal := v_calculated_subtotal + v_item_subtotal;
  END LOOP;

  -- 4. VALIDAR CUPÓN SI APLICA
  IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) != '' THEN
    SELECT * INTO v_coupon_record
    FROM public.coupons
    WHERE UPPER(code) = UPPER(TRIM(p_coupon_code))
      AND is_active = TRUE
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (max_uses IS NULL OR used_count < max_uses)
    FOR UPDATE;

    IF FOUND THEN
      IF v_coupon_record.discount_type = 'percent' THEN
        v_discount := ROUND(v_calculated_subtotal * (v_coupon_record.discount_value / 100.0), 2);
      ELSIF v_coupon_record.discount_type = 'fixed' THEN
        v_discount := LEAST(v_calculated_subtotal, v_coupon_record.discount_value);
      END IF;

      UPDATE public.coupons SET used_count = used_count + 1 WHERE id = v_coupon_record.id;
    END IF;
  END IF;

  -- 5. COSTO DE ENVÍO AUTORITATIVO ($15.000 COP si subtotal < $200.000)
  IF (v_calculated_subtotal - v_discount) >= 200000.00 OR (v_calculated_subtotal - v_discount) <= 0 THEN
    v_shipping_cost := 0;
  ELSE
    v_shipping_cost := 15000.00;
  END IF;

  v_total := GREATEST(0::numeric, (v_calculated_subtotal - v_discount)) + v_shipping_cost;

  -- 6. INSERTAR ORDEN EN online_orders
  INSERT INTO public.online_orders (
    order_number,
    user_id,
    idempotency_key,
    customer_name,
    customer_email,
    customer_phone,
    shipping_department,
    shipping_city,
    shipping_address,
    shipping_neighborhood,
    shipping_notes,
    shipping_method,
    shipping_cost,
    subtotal,
    discount,
    total,
    coupon_code,
    status
  ) VALUES (
    v_order_number,
    p_user_id,
    p_idempotency_key,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_shipping_department,
    p_shipping_city,
    p_shipping_address,
    p_shipping_neighborhood,
    p_shipping_notes,
    p_shipping_method,
    v_shipping_cost,
    v_calculated_subtotal,
    v_discount,
    v_total,
    p_coupon_code,
    'payment_pending'
  ) RETURNING id INTO v_order_id;

  -- 7. INSERTAR ARTÍCULOS Y DESCONTAR INVENTARIO DE MANERA ATÓMICA
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;
    v_real_price := COALESCE((v_item->>'price')::NUMERIC, 129900.00);

    INSERT INTO public.online_order_items (
      order_id,
      variant_id,
      product_name,
      size,
      color,
      sku,
      unit_price,
      quantity,
      total
    ) VALUES (
      v_order_id,
      v_variant_id,
      COALESCE(v_item->>'name', 'Prenda Masculina J&M'),
      COALESCE(v_item->>'size', 'M'),
      COALESCE(v_item->>'color', 'Negro Azabache'),
      v_item->>'sku',
      v_real_price,
      v_quantity,
      v_real_price * v_quantity
    );

    UPDATE public.inventories
    SET stock = stock - v_quantity
    WHERE variant_id = v_variant_id AND stock >= v_quantity;
  END LOOP;

  -- 8. MARCAR CARRITO COMO CONVERTIDO SI EXISTE
  IF p_user_id IS NOT NULL THEN
    UPDATE public.carts SET status = 'converted', updated_at = NOW()
    WHERE user_id = p_user_id AND status = 'active';
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_calculated_subtotal,
    'discount', v_discount,
    'shipping_cost', v_shipping_cost,
    'total', v_total,
    'amount_in_cents', (v_total * 100)::BIGINT,
    'currency', 'COP',
    'status', 'payment_pending',
    'is_duplicate', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
