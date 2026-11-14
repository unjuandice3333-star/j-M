-- =============================================================================
-- Ejecución 130 · Marcar una devolución como hecha en Wompi (aditiva)
-- =============================================================================
-- Al cancelar/reembolsar un pedido pagado, private.transition_order registra la
-- devolución en public.order_refunds con status `requested`. El dinero se devuelve
-- FUERA del panel (en Wompi), pero nada permitía dejar constancia: la fila quedaba
-- `requested` para siempre y el panel seguía avisando «pendiente de hacer en Wompi».
--
-- Esta función, solo para administradores:
--   * exige el id de la devolución en Wompi (texto, 1–100 caracteres);
--   * pasa `requested`/`approved` → `processed`, con processed_by = admin;
--   * rechaza una devolución ya procesada o rechazada (sin sobrescribir el id);
--   * deja el evento REFUND_PROCESSED en order_events (append-only) en la MISMA
--     transacción.
-- No mueve dinero, no cambia el estado del pedido ni el inventario. No borra datos.
-- =============================================================================

CREATE FUNCTION public.admin_mark_refund_processed(p_refund_id uuid, p_provider_refund_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.order_refunds%ROWTYPE;
  v_ref text := btrim(COALESCE(p_provider_refund_id, ''));
BEGIN
  PERFORM private.require_admin();

  IF v_ref = '' THEN
    RAISE EXCEPTION 'Escribe el id de la devolución en Wompi' USING ERRCODE = 'P0001', HINT = 'JM_PROVIDER_REFUND_ID_REQUIRED';
  END IF;
  IF length(v_ref) > 100 THEN
    RAISE EXCEPTION 'El id de Wompi supera 100 caracteres' USING ERRCODE = 'P0001', HINT = 'JM_PROVIDER_REFUND_ID_TOO_LONG';
  END IF;

  SELECT * INTO r FROM public.order_refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolución no encontrada' USING ERRCODE = 'P0001', HINT = 'JM_REFUND_NOT_FOUND';
  END IF;
  IF r.status = 'processed' THEN
    RAISE EXCEPTION 'Esta devolución ya está marcada como hecha' USING ERRCODE = 'P0001', HINT = 'JM_REFUND_ALREADY_PROCESSED';
  END IF;
  IF r.status NOT IN ('requested', 'approved') THEN
    RAISE EXCEPTION 'Esta devolución fue rechazada' USING ERRCODE = 'P0001', HINT = 'JM_REFUND_NOT_PENDING';
  END IF;

  UPDATE public.order_refunds
     SET status = 'processed', provider_refund_id = v_ref, processed_by = auth.uid()
   WHERE id = r.id;

  INSERT INTO public.order_events (order_id, event_type, actor, actor_user_id, note, metadata)
  VALUES (r.order_id, 'REFUND_PROCESSED', 'admin', auth.uid(), 'Devolución hecha en Wompi',
          jsonb_build_object('refund_id', r.id, 'amount', r.amount, 'provider_refund_id', v_ref,
                             'previous_status', r.status));

  RETURN jsonb_build_object('ok', true, 'refund_id', r.id, 'order_id', r.order_id,
                            'status', 'processed', 'provider_refund_id', v_ref);
END $$;

COMMENT ON FUNCTION public.admin_mark_refund_processed(uuid, text) IS
  'Marca una devolución registrada como hecha en Wompi (requested/approved → processed) con el id del proveedor y deja el evento REFUND_PROCESSED. No mueve dinero. Solo administradores.';

REVOKE ALL ON FUNCTION public.admin_mark_refund_processed(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_refund_processed(uuid, text) TO authenticated;
