-- DB Migration: OMS Operational System, Inventory Movements, Refunds and Timeline Events
-- File: supabase/migrations/20260927060000_oms_inventory_movements_refunds.sql

-- 1. INVENTORY MOVEMENTS TABLE FOR AUDITABLE STOCK TRACEABILITY
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID REFERENCES public.variants(id) ON DELETE RESTRICT NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
  quantity_before INT NOT NULL,
  quantity_change INT NOT NULL,
  quantity_after INT NOT NULL,
  movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'adjustment', 'return', 'damage', 'restock')),
  reason TEXT,
  reference_type VARCHAR(50), -- 'online_order', 'manual_adjustment', 'pos_sale'
  reference_id UUID,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant_id ON public.inventory_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON public.inventory_movements(created_at);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Inventory Movements RLS: Read/Write restricted to admins
DROP POLICY IF EXISTS inventory_movements_admin_all ON public.inventory_movements;
CREATE POLICY inventory_movements_admin_all ON public.inventory_movements
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 2. RETURNS AND REFUNDS SYSTEM FOR OMS
CREATE TABLE IF NOT EXISTS public.order_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.online_orders(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processed', 'rejected')),
  wompi_refund_id VARCHAR(150),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_refunds_order_id ON public.order_refunds(order_id);

ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_refunds_read ON public.order_refunds;
CREATE POLICY order_refunds_read ON public.order_refunds
  FOR SELECT USING (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.online_orders
      WHERE online_orders.id = order_refunds.order_id AND online_orders.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS order_refunds_admin_write ON public.order_refunds;
CREATE POLICY order_refunds_admin_write ON public.order_refunds
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3. SECURE INVENTORY ADJUSTMENT RPC WITH MOVEMENTS TRACEABILITY
CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
  p_variant_id UUID,
  p_quantity_change INT,
  p_movement_type VARCHAR,
  p_reason TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_current_stock INT;
  v_new_stock INT;
  v_target_branch_id UUID := COALESCE(p_branch_id, 'b1000000-0000-0000-0000-000000000001'::UUID);
  v_user_id UUID := auth.uid();
BEGIN
  IF NOT public.is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Operación denegada: Solo administradores autorizados pueden realizar ajustes de inventario.';
  END IF;

  SELECT stock INTO v_current_stock
  FROM public.inventories
  WHERE variant_id = p_variant_id AND branch_id = v_target_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_current_stock := 0;
    INSERT INTO public.inventories (branch_id, variant_id, stock)
    VALUES (v_target_branch_id, p_variant_id, GREATEST(0, p_quantity_change));
    v_new_stock := GREATEST(0, p_quantity_change);
  ELSE
    v_new_stock := GREATEST(0, v_current_stock + p_quantity_change);
    UPDATE public.inventories
    SET stock = v_new_stock, updated_at = NOW()
    WHERE variant_id = p_variant_id AND branch_id = v_target_branch_id;
  END IF;

  -- Registrar movimiento en inventory_movements
  INSERT INTO public.inventory_movements (
    variant_id,
    branch_id,
    quantity_before,
    quantity_change,
    quantity_after,
    movement_type,
    reason,
    reference_type,
    actor_user_id
  ) VALUES (
    p_variant_id,
    v_target_branch_id,
    v_current_stock,
    p_quantity_change,
    v_new_stock,
    p_movement_type,
    p_reason,
    'manual_adjustment',
    v_user_id
  );

  RETURN jsonb_build_object(
    'variant_id', p_variant_id,
    'quantity_before', v_current_stock,
    'quantity_change', p_quantity_change,
    'quantity_after', v_new_stock
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. HARDENED OMS STATE MACHINE UPDATE (Support for processing, packed, shipped, delivered, cancelled, refunded)
CREATE OR REPLACE FUNCTION public.update_order_status_oms(
  p_order_id UUID,
  p_new_status online_order_status,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_old_status online_order_status;
  v_user_id UUID := auth.uid();
  v_item RECORD;
BEGIN
  IF NOT public.is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Operación denegada: Solo administradores autorizados pueden operar cambios en el OMS.';
  END IF;

  SELECT status INTO v_old_status
  FROM public.online_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado.';
  END IF;

  -- Reglas estrictas de transición en la máquina de estados OMS
  IF v_old_status = 'delivered' AND p_new_status NOT IN ('delivered', 'refunded') THEN
    RAISE EXCEPTION 'Transición inválida: Un pedido entregado únicamente puede cambiar a procesando reembolso.';
  END IF;

  IF v_old_status = 'cancelled' THEN
    RAISE EXCEPTION 'Transición inválida: Un pedido cancelado es terminal y no puede cambiar de estado.';
  END IF;

  -- Si el pedido se cancela desde un estado pagado/procesando, devolver el stock a inventario automáticamente
  IF p_new_status = 'cancelled' AND v_old_status IN ('paid', 'processing', 'packed') THEN
    FOR v_item IN SELECT variant_id, quantity FROM public.online_order_items WHERE order_id = p_order_id LOOP
      IF v_item.variant_id IS NOT NULL THEN
        UPDATE public.inventories
        SET stock = stock + v_item.quantity
        WHERE variant_id = v_item.variant_id;

        INSERT INTO public.inventory_movements (
          variant_id,
          quantity_before,
          quantity_change,
          quantity_after,
          movement_type,
          reason,
          reference_type,
          reference_id,
          actor_user_id
        ) VALUES (
          v_item.variant_id,
          0,
          v_item.quantity,
          v_item.quantity,
          'restock',
          'Restablecimiento automático por cancelación de pedido',
          'online_order',
          p_order_id,
          v_user_id
        );
      END IF;
    END LOOP;
  END IF;

  -- Actualizar estado
  UPDATE public.online_orders
  SET status = p_new_status, updated_at = NOW()
  WHERE id = p_order_id;

  -- Registrar en order_events
  INSERT INTO public.order_events (order_id, actor_user_id, event_type, previous_status, new_status, metadata)
  VALUES (
    p_order_id,
    v_user_id,
    'oms_status_update',
    v_old_status::text,
    p_new_status::text,
    jsonb_build_object('notes', p_notes)
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'previous_status', v_old_status,
    'new_status', p_new_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
