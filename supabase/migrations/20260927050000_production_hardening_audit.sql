-- DB Migration: Security Hardening & Audit for Production (Phase 6)
-- File: supabase/migrations/20260927050000_production_hardening_audit.sql

-- 1. ORDER EVENTS LOGGING TABLE (Auditability & Event Sourcing)
CREATE TABLE IF NOT EXISTS public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.online_orders(id) ON DELETE CASCADE NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON public.order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON public.order_events(created_at);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

-- Order Events Policies: Admins can read all events; Customers can read events for their own orders
DROP POLICY IF EXISTS order_events_read ON public.order_events;
CREATE POLICY order_events_read ON public.order_events FOR SELECT USING (
  public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.online_orders
    WHERE online_orders.id = order_events.order_id
      AND online_orders.user_id = auth.uid()
  )
);

-- 2. HARDENING SECURITY DEFINER FUNCTIONS WITH EXPLICIT SEARCH_PATH

-- A. is_admin() Hardening
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN (v_role IN ('admin', 'super_admin'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- B. handle_new_user_profile() Hardening
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- C. get_available_stock() Hardening
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. SECURE ORDER STATUS TRANSITION FUNCTION (State Machine Validation)
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id UUID,
  p_new_status online_order_status,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_old_status online_order_status;
  v_user_id UUID := auth.uid();
BEGIN
  -- Solo administradores pueden cambiar estados manualmente
  IF NOT public.is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Operación denegada: Solo administradores autorizados pueden cambiar el estado de un pedido.';
  END IF;

  SELECT status INTO v_old_status
  FROM public.online_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado.';
  END IF;

  -- Impedir transiciones inválidas en la máquina de estados
  IF v_old_status = 'delivered' AND p_new_status != 'delivered' THEN
    RAISE EXCEPTION 'Transición inválida: Un pedido entregado no puede regresar a otro estado.';
  END IF;

  IF v_old_status = 'cancelled' AND p_new_status = 'paid' THEN
    RAISE EXCEPTION 'Transición inválida: Un pedido cancelado no puede marcarse directamente como pagado.';
  END IF;

  -- Actualizar estado de la orden
  UPDATE public.online_orders
  SET status = p_new_status, updated_at = NOW()
  WHERE id = p_order_id;

  -- Registrar evento en audit log order_events
  INSERT INTO public.order_events (order_id, actor_user_id, event_type, previous_status, new_status, metadata)
  VALUES (
    p_order_id,
    v_user_id,
    'status_change',
    v_old_status::text,
    p_new_status::text,
    jsonb_build_object('notes', p_notes)
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'previous_status', v_old_status, 'new_status', p_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. MISSING FOREIGN KEY INDEXES HARDENING
CREATE INDEX IF NOT EXISTS idx_online_order_items_order_id ON public.online_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_online_order_items_variant_id ON public.online_order_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON public.payment_transactions(order_id);
