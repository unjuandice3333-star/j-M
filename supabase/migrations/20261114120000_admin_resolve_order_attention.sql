-- =============================================================================
-- Ejecución 124 · Cerrar la revisión de un pedido desde el panel (aditiva)
-- =============================================================================
-- La línea base marca `online_orders.needs_attention` cuando un pago aprobado no
-- se puede cumplir tal cual: pago tardío sin stock (PAID_WITHOUT_STOCK), pago que
-- hay que reembolsar (PAYMENT_REQUIRES_REFUND) o pago anulado después de pagado
-- (PAYMENT_VOIDED_AFTER_PAID). Nadie podía quitar la marca: el pedido seguía
-- «Requiere revisión» y el dashboard lo contaba para siempre aunque el admin ya
-- hubiera resuelto el caso (repuso stock, reembolsó en Wompi, habló con el cliente).
--
-- Esta función solo quita la marca y deja constancia (evento ATTENTION_RESOLVED con
-- el motivo y el admin que lo hizo). No cambia el estado del pedido, ni el stock,
-- ni el intento de pago (`requires_refund` sigue siendo un hecho del intento).
-- No borra datos.
-- =============================================================================

CREATE FUNCTION public.admin_resolve_order_attention(p_order_id uuid, p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  o public.online_orders%ROWTYPE;
  v_note text := btrim(COALESCE(p_note, ''));
BEGIN
  PERFORM private.require_admin();

  IF v_note = '' THEN
    RAISE EXCEPTION 'Escribe cómo se resolvió' USING ERRCODE = 'P0001', HINT = 'JM_NOTE_REQUIRED';
  END IF;
  IF length(v_note) > 500 THEN
    RAISE EXCEPTION 'La nota supera 500 caracteres' USING ERRCODE = 'P0001', HINT = 'JM_NOTE_TOO_LONG';
  END IF;

  SELECT * INTO o FROM public.online_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0001', HINT = 'JM_ORDER_NOT_FOUND';
  END IF;
  IF NOT o.needs_attention THEN
    RAISE EXCEPTION 'El pedido no está pendiente de revisión' USING ERRCODE = 'P0001', HINT = 'JM_ATTENTION_NOT_REQUIRED';
  END IF;

  UPDATE public.online_orders SET needs_attention = false WHERE id = o.id;
  INSERT INTO public.order_events (order_id, event_type, actor, actor_user_id, note, metadata)
  VALUES (o.id, 'ATTENTION_RESOLVED', 'admin', auth.uid(), v_note, jsonb_build_object('order_status', o.status));

  RETURN jsonb_build_object('order_id', o.id, 'status', o.status, 'needs_attention', false);
END $$;

COMMENT ON FUNCTION public.admin_resolve_order_attention(uuid, text) IS
  'Quita la marca «requiere revisión» de un pedido con un motivo obligatorio (evento ATTENTION_RESOLVED). No cambia estado, stock ni pagos. Solo administradores.';

REVOKE ALL ON FUNCTION public.admin_resolve_order_attention(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_order_attention(uuid, text) TO authenticated;
