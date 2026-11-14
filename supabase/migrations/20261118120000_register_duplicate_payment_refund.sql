-- =============================================================================
-- Ejecución 135 · Devolución pendiente para pagos duplicados o tardíos (aditiva)
-- =============================================================================
-- Cuando Wompi aprueba un pago que el pedido no puede aceptar (segundo pago
-- aprobado del mismo pedido, o pago aprobado sobre un pedido ya cancelado /
-- reembolsado), `apply_payment_event` marca el intento con `requires_refund` y
-- el pedido con `needs_attention`, pero NO registraba la devolución en
-- `order_refunds`. Consecuencia: ese dinero nunca aparecía en «devoluciones
-- pendientes en Wompi» (dashboard, campana, `/admin/pedidos?devolucion=pendiente`)
-- y al cerrar la revisión con una nota desaparecía de todo aviso.
--
-- Este trigger registra UNA devolución `requested` por cada intento aprobado
-- marcado para reembolso (monto = lo cobrado por ese intento, restock = false:
-- no hay prenda que reingresar) y deja el evento REFUND_REQUESTED. Si Wompi anula
-- (VOIDED) ese intento después, la devolución pendiente pasa a `rejected` (ya no
-- hay dinero que devolver) con el evento REFUND_NOT_NEEDED. Las devoluciones ya
-- hechas (`processed`) no se tocan.
--
-- También registra, una sola vez, las devoluciones que faltan para intentos que
-- ya estaban marcados antes de esta migración. No mueve dinero, no cambia el
-- estado del pedido ni el inventario. No borra datos.
-- =============================================================================

CREATE FUNCTION private.register_payment_refund() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND NEW.requires_refund THEN
    IF NOT EXISTS (SELECT 1 FROM public.order_refunds WHERE payment_transaction_id = NEW.id) THEN
      INSERT INTO public.order_refunds (order_id, payment_transaction_id, amount, reason, restock, requested_by)
      VALUES (NEW.order_id, NEW.id, NEW.amount_in_cents / 100,
              'Pago aprobado que el pedido no puede usar (duplicado o posterior a la cancelación): devolver en Wompi',
              false, NULL);
      INSERT INTO public.order_events (order_id, event_type, actor, metadata)
      VALUES (NEW.order_id, 'REFUND_REQUESTED', 'system',
              jsonb_build_object('reference', NEW.reference, 'amount', NEW.amount_in_cents / 100, 'cause', 'payment_requires_refund'));
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.requires_refund AND NEW.status = 'VOIDED' THEN
    WITH upd AS (
      UPDATE public.order_refunds SET status = 'rejected'
       WHERE payment_transaction_id = NEW.id AND status = 'requested'
      RETURNING id, amount)
    INSERT INTO public.order_events (order_id, event_type, actor, metadata)
    SELECT NEW.order_id, 'REFUND_NOT_NEEDED', 'system',
           jsonb_build_object('reference', NEW.reference, 'refund_id', upd.id, 'amount', upd.amount, 'cause', 'payment_voided')
      FROM upd;
  END IF;
  RETURN NULL;
END $$;

COMMENT ON FUNCTION private.register_payment_refund() IS
  'Registra en order_refunds (requested) la devolución de un intento aprobado marcado requires_refund; la rechaza si Wompi anula ese intento. No mueve dinero.';

REVOKE ALL ON FUNCTION private.register_payment_refund() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_payment_transactions_register_refund
  AFTER INSERT OR UPDATE OF status, requires_refund ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION private.register_payment_refund();

-- Intentos ya marcados antes de esta migración (idempotente: solo los que no tienen devolución).
WITH ins AS (
  INSERT INTO public.order_refunds (order_id, payment_transaction_id, amount, reason, restock, requested_by)
  SELECT p.order_id, p.id, p.amount_in_cents / 100,
         'Pago aprobado que el pedido no puede usar (duplicado o posterior a la cancelación): devolver en Wompi', false, NULL
    FROM public.payment_transactions p
   WHERE p.status = 'APPROVED' AND p.requires_refund
     AND NOT EXISTS (SELECT 1 FROM public.order_refunds r WHERE r.payment_transaction_id = p.id)
  RETURNING order_id, payment_transaction_id, amount)
INSERT INTO public.order_events (order_id, event_type, actor, metadata)
SELECT ins.order_id, 'REFUND_REQUESTED', 'system',
       jsonb_build_object('reference', p.reference, 'amount', ins.amount, 'cause', 'payment_requires_refund', 'backfill', true)
  FROM ins JOIN public.payment_transactions p ON p.id = ins.payment_transaction_id;
