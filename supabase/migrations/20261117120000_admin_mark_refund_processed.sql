-- =============================================================================
-- Ejecución 130 · Marcar una devolución como hecha en Wompi (aditiva)
-- =============================================================================
-- Al cancelar/reembolsar un pedido pagado, private.transition_order inserta una
-- fila en `order_refunds` con estado `requested` (registrada). El dinero se
-- devuelve desde el panel de Wompi, pero nadie podía dejar constancia de ello:
-- la devolución quedaba «pendiente de hacer en Wompi» para siempre y el admin no
-- distinguía las ya pagadas de las pendientes.
--
-- Esta función pasa UNA devolución de `requested` a `processed` con el id de la
-- devolución en Wompi (obligatorio), guarda quién lo hizo (`processed_by`) y deja
-- el evento REFUND_PROCESSED en el historial del pedido. No mueve dinero, no
-- cambia el estado del pedido ni el inventario. No borra datos.
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
  IF length(v_ref) > 100 OR v_ref !~ '^[A-Za-z0-9._:-]+$' THEN
    RAISE EXCEPTION 'El id de Wompi no es válido' USING ERRCODE = 'P0001', HINT = 'JM_PROVIDER_REFUND_ID_INVALID';
  END IF;

  SELECT * INTO r FROM public.order_refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolución no encontrada' USING ERRCODE = 'P0001', HINT = 'JM_REFUND_NOT_FOUND';
  END IF;
  IF r.status <> 'requested' THEN
    RAISE EXCEPTION 'La devolución ya no está pendiente' USING ERRCODE = 'P0001', HINT = 'JM_REFUND_NOT_PENDING';
  END IF;
  -- Un mismo id de Wompi no puede justificar dos devoluciones distintas.
  IF EXISTS (SELECT 1 FROM public.order_refunds WHERE provider_refund_id = v_ref AND id <> r.id) THEN
    RAISE EXCEPTION 'Ese id de Wompi ya está registrado en otra devolución' USING ERRCODE = 'P0001', HINT = 'JM_PROVIDER_REFUND_ID_IN_USE';
  END IF;

  UPDATE public.order_refunds
     SET status = 'processed', provider_refund_id = v_ref, processed_by = auth.uid()
   WHERE id = r.id;
  INSERT INTO public.order_events (order_id, event_type, actor, actor_user_id, note, metadata)
  VALUES (r.order_id, 'REFUND_PROCESSED', 'admin', auth.uid(), v_ref,
          jsonb_build_object('refund_id', r.id, 'amount', r.amount, 'provider_refund_id', v_ref));

  RETURN jsonb_build_object('refund_id', r.id, 'order_id', r.order_id, 'status', 'processed', 'provider_refund_id', v_ref);
END $$;

COMMENT ON FUNCTION public.admin_mark_refund_processed(uuid, text) IS
  'Marca una devolución registrada (requested) como hecha en Wompi (processed) con el id de Wompi; evento REFUND_PROCESSED. No mueve dinero, estado ni stock. Solo administradores.';

REVOKE ALL ON FUNCTION public.admin_mark_refund_processed(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_refund_processed(uuid, text) TO authenticated;
