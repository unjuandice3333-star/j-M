-- =============================================================================
-- Ejecución 126 · Reembolsar y cerrar la revisión en un solo paso (aditiva)
-- =============================================================================
-- Un pedido pagado tarde sin stock (PAID_WITHOUT_STOCK) queda `paid` y marcado
-- `needs_attention`. Si la tienda no puede reponer la prenda, la salida normal es
-- devolver el dinero: hasta ahora el admin tenía que (1) cambiar el estado a
-- «Reembolsado» con un motivo y (2) cerrar la revisión con OTRO motivo. Eran dos
-- llamadas separadas: si la segunda fallaba (o el admin la olvidaba), el pedido
-- quedaba reembolsado pero todavía «Requiere revisión» y contaba en el dashboard.
--
-- Esta función hace las dos cosas en la MISMA transacción:
--   1. private.transition_order(..., 'refunded', 'admin', ...): la única puerta de
--      cambio de estado (misma regla de transiciones, registro en order_refunds y
--      reingreso de stock SOLO de las líneas con movimiento de venta, vía
--      private.restore_stock_for_order: lo que faltó al pagar no infla el inventario).
--   2. Quita la marca y deja el evento ATTENTION_RESOLVED con el motivo y
--      `refunded: true` (mismo contrato que admin_resolve_order_attention, D97).
-- No mueve dinero: el reembolso en sí se hace en Wompi. No borra datos.
-- =============================================================================

CREATE FUNCTION public.admin_refund_order_attention(p_order_id uuid, p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  o public.online_orders%ROWTYPE;
  v_note text := btrim(COALESCE(p_note, ''));
  v_result jsonb;
BEGIN
  PERFORM private.require_admin();

  IF v_note = '' THEN
    RAISE EXCEPTION 'Escribe el motivo del reembolso' USING ERRCODE = 'P0001', HINT = 'JM_NOTE_REQUIRED';
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

  -- Valida la transición (paid/processing/delivered → refunded para 'admin') y aplica sus efectos.
  v_result := private.transition_order(o.id, 'refunded', 'admin', auth.uid(), v_note);

  UPDATE public.online_orders SET needs_attention = false WHERE id = o.id;
  INSERT INTO public.order_events (order_id, event_type, actor, actor_user_id, note, metadata)
  VALUES (o.id, 'ATTENTION_RESOLVED', 'admin', auth.uid(), v_note,
          jsonb_build_object('order_status', 'refunded', 'previous_status', o.status, 'refunded', true));

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object('order_id', o.id, 'status', 'refunded', 'needs_attention', false);
END $$;

COMMENT ON FUNCTION public.admin_refund_order_attention(uuid, text) IS
  'Registra el reembolso (transición refunded con motivo, reingreso solo de lo vendido) y cierra la revisión del pedido en una sola transacción. No mueve dinero (eso se hace en Wompi). Solo administradores.';

REVOKE ALL ON FUNCTION public.admin_refund_order_attention(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_order_attention(uuid, text) TO authenticated;
