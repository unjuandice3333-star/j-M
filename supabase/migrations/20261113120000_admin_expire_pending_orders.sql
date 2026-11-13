-- =============================================================================
-- Ejecución 122 · Vencimiento de pedidos sin depender solo de pg_cron (aditiva)
-- =============================================================================
-- La línea base vence los pedidos `payment_pending` fuera de su ventana con
-- `public.expire_pending_orders()`, programada con pg_cron si existe. Si pg_cron no
-- está habilitado en el proyecto (la migración solo emite un WARNING), las reservas
-- de esos pedidos seguían bloqueando stock indefinidamente y el admin los veía como
-- «Pago pendiente». Esta función permite al panel del admin vencerlos al abrir
-- pedidos, inventario o el dashboard. Reutiliza exactamente la misma lógica
-- (private.transition_order → libera reservas y cupón). No borra datos.
-- =============================================================================

CREATE FUNCTION public.admin_expire_pending_orders() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  RETURN public.expire_pending_orders();
END $$;

COMMENT ON FUNCTION public.admin_expire_pending_orders() IS
  'Vence los pedidos payment_pending con la ventana de pago cumplida (misma lógica que expire_pending_orders). Solo administradores.';

REVOKE ALL ON FUNCTION public.admin_expire_pending_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_expire_pending_orders() TO authenticated;
