-- ============================================================================
-- MIGRACIÓN DE CORRECCIÓN: RLS PÚBLICO SIZES/COLORS Y BRANCH_ID EN ÓRDENES
-- Archivo: supabase/migrations/20260930010000_fix_sizes_colors_rls_and_order_branch.sql
-- Propósito: 
--   1. Permitir lectura pública (SELECT) de tallas (sizes) y colores (colors) al rol anon
--      sin abrir permisos de escritura (INSERT, UPDATE, DELETE).
--   2. Garantizar que online_orders.branch_id tenga DEFAULT 'b1000000-0000-0000-0000-000000000001'::UUID.
--   3. Vincular explícitamente branch_id en create_online_order_validated_idempotent()
--      para que nunca llegue NULL a process_online_order_inventory().
--   4. Fortalecer process_online_order_inventory() y restore_online_order_inventory()
--      con COALESCE(v_order.branch_id, 'b1000000-0000-0000-0000-000000000001'::UUID).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. POLÍTICAS DE LECTURA PÚBLICA (SELECT ONLY) PARA SIZES Y COLORS
-- ----------------------------------------------------------------------------

-- Habilitar RLS defensivo en sizes y colors
ALTER TABLE public.sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colors ENABLE ROW LEVEL SECURITY;

-- Política de solo lectura pública en sizes para clientes del storefront (anon y authenticated)
DROP POLICY IF EXISTS sizes_public_read ON public.sizes;
CREATE POLICY sizes_public_read ON public.sizes
  FOR SELECT TO public
  USING (TRUE);

GRANT SELECT ON public.sizes TO anon, authenticated;

-- Política de solo lectura pública en colors para clientes del storefront (anon y authenticated)
DROP POLICY IF EXISTS colors_public_read ON public.colors;
CREATE POLICY colors_public_read ON public.colors
  FOR SELECT TO public
  USING (TRUE);

GRANT SELECT ON public.colors TO anon, authenticated;

-- Revocar cualquier permiso de mutación para usuarios anónimos o no administradores
REVOKE INSERT, UPDATE, DELETE ON public.sizes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.colors FROM anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. ASEGURAR DEFAULT AUTORITATIVO PARA ONLINE_ORDERS.BRANCH_ID
-- ----------------------------------------------------------------------------

ALTER TABLE public.online_orders 
  ALTER COLUMN branch_id SET DEFAULT 'b1000000-0000-0000-0000-000000000001'::UUID;

-- Garantizar que cualquier orden histórica sin branch_id apunte a la Bodega Principal E-Commerce
UPDATE public.online_orders
SET branch_id = 'b1000000-0000-0000-0000-000000000001'::UUID
WHERE branch_id IS NULL;


-- ----------------------------------------------------------------------------
-- 3. ACTUALIZAR CREATE_ONLINE_ORDER_VALIDATED_IDEMPOTENT()
--    (Inserta explícitamente branch_id en online_orders)
-- ----------------------------------------------------------------------------

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
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  v_branch_id UUID := 'b1000000-0000-0000-0000-000000000001'::UUID; -- Bodega Principal E-Commerce
BEGIN
  -- A. COMPROBAR IDEMPOTENCIA
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

  -- B. GENERAR NÚMERO DE ORDEN ÚNICO
  v_order_number := 'JM-ORD-' || floor(extract(epoch from now()))::text || '-' || floor(random() * 899 + 100)::text;

  -- C. ITERAR ARTÍCULOS PARA VALIDAR PRECIO Y DISPONIBILIDAD CON BLOQUEO FOR UPDATE
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'La cantidad solicitada debe ser mayor a 0.';
    END IF;

    IF v_variant_id IS NULL THEN
      RAISE EXCEPTION 'La variante de producto no fue especificada. Por favor re-selecciona la prenda en el catálogo.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.variants WHERE id = v_variant_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'La variante de producto (ID: %) no existe o se encuentra descontinuada en el catálogo.', v_variant_id;
    END IF;

    -- Bloqueo pesimista de variante
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
      v_real_price := COALESCE((v_item->>'price')::NUMERIC, 129900.00);
      v_product_name := COALESCE(v_item->>'name', 'Prenda Masculina J&M');
      v_size_code := COALESCE(v_item->>'size', 'M');
      v_color_name := COALESCE(v_item->>'color', 'Negro Azabache');
    END IF;

    -- Bloqueo pesimista de inventario y verificación estricta de stock en la Bodega Principal
    SELECT stock INTO v_current_stock
    FROM public.inventories
    WHERE variant_id = v_variant_id AND branch_id = v_branch_id
    FOR UPDATE;

    IF v_current_stock IS NULL OR v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para % (Talla %). Disponibles: %, Solicitados: %', 
        v_product_name, v_size_code, COALESCE(v_current_stock, 0), v_quantity;
    END IF;

    v_item_subtotal := v_real_price * v_quantity;
    v_calculated_subtotal := v_calculated_subtotal + v_item_subtotal;
  END LOOP;

  -- D. VALIDAR CUPÓN SI APLICA
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

  -- E. COSTO DE ENVÍO AUTORITATIVO
  IF (v_calculated_subtotal - v_discount) >= 200000.00 OR (v_calculated_subtotal - v_discount) <= 0 THEN
    v_shipping_cost := 0;
  ELSE
    v_shipping_cost := 15000.00;
  END IF;

  v_total := GREATEST(0::numeric, (v_calculated_subtotal - v_discount)) + v_shipping_cost;

  -- F. INSERTAR ORDEN CON BRANCH_ID AUTORITATIVO (payment_pending, SIN RESTAR INVENTARIO)
  INSERT INTO public.online_orders (
    order_number,
    user_id,
    branch_id,
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
    v_branch_id,
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

  -- G. INSERTAR ÍTEMS USANDO EL UUID REAL DE VARIANTS.ID
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
  END LOOP;

  -- H. MARCAR CARRITO COMO CONVERTIDO SI EXISTE
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
$$;


-- ----------------------------------------------------------------------------
-- 4. ACTUALIZAR PROCESS_ONLINE_ORDER_INVENTORY()
--    (Defensiva con COALESCE en branch_id)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_online_order_inventory(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_inv RECORD;
  v_target_branch UUID;
  v_stock_before INT;
  v_stock_after INT;
  v_already_deducted BOOLEAN;
BEGIN
  -- A. Idempotencia: Verificar si la orden ya registró la deducción
  SELECT EXISTS (
    SELECT 1 FROM public.order_events
    WHERE order_id = p_order_id AND event_type = 'INVENTORY_DEDUCTED'
  ) INTO v_already_deducted;

  IF v_already_deducted THEN
    RETURN TRUE;
  END IF;

  -- B. Bloquear y verificar la orden
  SELECT * INTO v_order
  FROM public.online_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden % no encontrada para deducción de inventario.', p_order_id;
  END IF;

  v_target_branch := COALESCE(v_order.branch_id, 'b1000000-0000-0000-0000-000000000001'::UUID);

  -- C. Iterar artículos y aplicar deducción pesimista en inventories
  FOR v_item IN 
    SELECT variant_id, quantity 
    FROM public.online_order_items 
    WHERE order_id = p_order_id 
  LOOP
    SELECT id, stock INTO v_inv
    FROM public.inventories
    WHERE variant_id = v_item.variant_id 
      AND branch_id = v_target_branch
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Registro de inventario inexistente para variante % en bodega %', 
        v_item.variant_id, v_target_branch;
    END IF;

    IF v_inv.stock < v_item.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para variante %. Disponibles: %, Solicitados: %', 
        v_item.variant_id, v_inv.stock, v_item.quantity;
    END IF;

    v_stock_before := v_inv.stock;
    v_stock_after := v_inv.stock - v_item.quantity;

    -- Descuenta inventario definitivamente
    UPDATE public.inventories
    SET stock = v_stock_after,
        updated_at = NOW()
    WHERE id = v_inv.id;

    -- Registrar movimiento auditado
    INSERT INTO public.inventory_movements (
      id,
      inventory_id,
      variant_id,
      branch_id,
      movement_type,
      quantity_change,
      quantity_before,
      quantity_after,
      reference_id,
      notes,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_inv.id,
      v_item.variant_id,
      v_target_branch,
      'ONLINE_SALE',
      -v_item.quantity,
      v_stock_before,
      v_stock_after,
      p_order_id,
      'Deducción automática por pago confirmado vía Wompi',
      NOW()
    );
  END LOOP;

  -- D. Registrar hito en order_events para idempotencia estricta
  INSERT INTO public.order_events (
    id,
    order_id,
    event_type,
    previous_status,
    new_status,
    metadata,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_order_id,
    'INVENTORY_DEDUCTED',
    v_order.status,
    v_order.status,
    jsonb_build_object('branch_id', v_target_branch),
    NOW()
  );

  RETURN TRUE;
END;
$$;


-- ----------------------------------------------------------------------------
-- 5. ACTUALIZAR RESTORE_ONLINE_ORDER_INVENTORY()
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restore_online_order_inventory(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_inv RECORD;
  v_target_branch UUID;
  v_stock_before INT;
  v_stock_after INT;
  v_is_deducted BOOLEAN;
  v_already_restored BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.order_events
    WHERE order_id = p_order_id AND event_type = 'INVENTORY_DEDUCTED'
  ) INTO v_is_deducted;

  IF NOT v_is_deducted THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.order_events
    WHERE order_id = p_order_id AND event_type = 'INVENTORY_RESTORED'
  ) INTO v_already_restored;

  IF v_already_restored THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO v_order
  FROM public.online_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden % no encontrada para restauración de inventario.', p_order_id;
  END IF;

  v_target_branch := COALESCE(v_order.branch_id, 'b1000000-0000-0000-0000-000000000001'::UUID);

  FOR v_item IN 
    SELECT variant_id, quantity 
    FROM public.online_order_items 
    WHERE order_id = p_order_id 
  LOOP
    SELECT id, stock INTO v_inv
    FROM public.inventories
    WHERE variant_id = v_item.variant_id 
      AND branch_id = v_target_branch
    FOR UPDATE;

    IF FOUND THEN
      v_stock_before := v_inv.stock;
      v_stock_after := v_inv.stock + v_item.quantity;

      UPDATE public.inventories
      SET stock = v_stock_after,
          updated_at = NOW()
      WHERE id = v_inv.id;

      INSERT INTO public.inventory_movements (
        id,
        inventory_id,
        variant_id,
        branch_id,
        movement_type,
        quantity_change,
        quantity_before,
        quantity_after,
        reference_id,
        notes,
        created_at
      ) VALUES (
        gen_random_uuid(),
        v_inv.id,
        v_item.variant_id,
        v_target_branch,
        'RETURN_CANCEL',
        v_item.quantity,
        v_stock_before,
        v_stock_after,
        p_order_id,
        'Reversión automática de inventario por cancelación/reembolso',
        NOW()
      );
    END IF;
  END LOOP;

  INSERT INTO public.order_events (
    id,
    order_id,
    event_type,
    previous_status,
    new_status,
    metadata,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_order_id,
    'INVENTORY_RESTORED',
    v_order.status,
    v_order.status,
    jsonb_build_object('branch_id', v_target_branch),
    NOW()
  );

  RETURN TRUE;
END;
$$;

-- Permisos sobre las funciones
GRANT EXECUTE ON FUNCTION public.create_online_order_validated_idempotent(
  VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, JSONB, VARCHAR, UUID
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_online_order_inventory(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_online_order_inventory(UUID) TO service_role;

COMMIT;
