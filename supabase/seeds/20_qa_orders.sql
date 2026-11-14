-- =============================================================================
-- SEED QA — PEDIDOS EN TODOS LOS ESTADOS (solo local, CI y QA)
-- =============================================================================
-- Los pedidos se crean y avanzan con las RPC reales (create_order,
-- create_payment_attempt, apply_payment_event, admin_transition_order,
-- cancel_my_order, expire_pending_orders), así que los datos son coherentes
-- (stock, reservas, movimientos, eventos, cupones) por construcción.
-- Los eventos de Wompi son SINTÉTICOS (checksums de prueba).
-- =============================================================================

CREATE FUNCTION pg_temp.as_user(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    CASE WHEN p_user IS NULL THEN '' ELSE json_build_object('sub', p_user, 'role', 'authenticated')::text END, true);
$$;

CREATE FUNCTION pg_temp.variant(p_sku text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.variants WHERE sku = p_sku
$$;

CREATE FUNCTION pg_temp.order_by_key(p_key text) RETURNS public.online_orders LANGUAGE sql STABLE AS $$
  SELECT * FROM public.online_orders WHERE idempotency_key = p_key
$$;

-- Crea intento de pago y aplica un evento sintético de Wompi con el estado indicado.
CREATE FUNCTION pg_temp.pay(p_key text, p_status text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  o public.online_orders;
  att jsonb;
BEGIN
  o := pg_temp.order_by_key(p_key);
  att := public.create_payment_attempt(o.id, o.public_token);
  RETURN public.apply_payment_event(
    jsonb_build_object('event', 'transaction.updated', 'environment', 'test',
      'data', jsonb_build_object('transaction', jsonb_build_object(
        'id', 'qa-tx-' || (att ->> 'reference'), 'reference', att ->> 'reference', 'status', p_status,
        'amount_in_cents', (att ->> 'amount_in_cents')::bigint, 'currency', 'COP',
        'payment_method_type', 'CARD'))),
    'qa-checksum-' || (att ->> 'reference') || '-' || p_status);
END $$;

CREATE FUNCTION pg_temp.customer(p_name text, p_email text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('name', p_name, 'email', p_email, 'phone', '300 000 0000')
$$;
CREATE FUNCTION pg_temp.shipping() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('department', 'Cundinamarca', 'city', 'Bogotá D.C.',
                            'address', 'Calle de Prueba 1 # 2-3', 'neighborhood', 'Barrio QA')
$$;

-- O1 · cliente1 · entregado
SELECT pg_temp.as_user('00000000-0000-4000-8000-00000000a003');
SELECT public.create_order(pg_temp.customer('Cliente Uno QA', 'cliente1@qa.jm.test'), pg_temp.shipping(),
  jsonb_build_array(jsonb_build_object('variant_id', pg_temp.variant('JM-TEE-001-NEGRO-M'), 'quantity', 2),
                    jsonb_build_object('variant_id', pg_temp.variant('JM-JEA-001-AZUL-INDIGO-32'), 'quantity', 1)),
  NULL, 'standard', 'qa-seed-order-01');
SELECT pg_temp.pay('qa-seed-order-01', 'APPROVED');

-- O2 · cliente1 · en preparación
SELECT public.create_order(pg_temp.customer('Cliente Uno QA', 'cliente1@qa.jm.test'), pg_temp.shipping(),
  jsonb_build_array(jsonb_build_object('variant_id', pg_temp.variant('JM-SHI-001-BLANCO-M'), 'quantity', 1)),
  NULL, 'standard', 'qa-seed-order-02');
SELECT pg_temp.pay('qa-seed-order-02', 'APPROVED');

-- O3 · cliente2 · pagado con cupón QA10
SELECT pg_temp.as_user('00000000-0000-4000-8000-00000000a004');
SELECT public.create_order(pg_temp.customer('Cliente Dos QA', 'cliente2@qa.jm.test'), pg_temp.shipping(),
  jsonb_build_array(jsonb_build_object('variant_id', pg_temp.variant('JM-TEE-001-GRIS-OXFORD-M'), 'quantity', 1)),
  'QA10', 'standard', 'qa-seed-order-03');
SELECT pg_temp.pay('qa-seed-order-03', 'APPROVED');

-- O4 · invitado · pago pendiente
SELECT pg_temp.as_user(NULL);
SELECT public.create_order(pg_temp.customer('Invitado QA', 'invitado1@qa.jm.test'), pg_temp.shipping(),
  jsonb_build_array(jsonb_build_object('variant_id', pg_temp.variant('JM-SHO-001-BLANCO-41'), 'quantity', 1)),
  NULL, 'standard', 'qa-seed-order-04');

-- O5 · invitado · intento rechazado y luego vencido
SELECT public.create_order(pg_temp.customer('Invitado QA', 'invitado2@qa.jm.test'), pg_temp.shipping(),
  jsonb_build_array(jsonb_build_object('variant_id', pg_temp.variant('JM-SHI-001-AZUL-NAVY-L'), 'quantity', 1)),
  NULL, 'standard', 'qa-seed-order-05');
SELECT pg_temp.pay('qa-seed-order-05', 'DECLINED');
UPDATE public.online_orders SET payment_expires_at = now() - interval '1 minute' WHERE idempotency_key = 'qa-seed-order-05';
UPDATE public.inventory_reservations SET expires_at = now() - interval '1 minute'
 WHERE order_id = (pg_temp.order_by_key('qa-seed-order-05')).id;
SELECT public.expire_pending_orders();

-- O6 · cliente2 · pagado y cancelado por admin (reingreso de stock)
SELECT pg_temp.as_user('00000000-0000-4000-8000-00000000a004');
SELECT public.create_order(pg_temp.customer('Cliente Dos QA', 'cliente2@qa.jm.test'), pg_temp.shipping(),
  jsonb_build_array(jsonb_build_object('variant_id', pg_temp.variant('JM-JEA-001-NEGRO-32'), 'quantity', 1)),
  NULL, 'standard', 'qa-seed-order-06');
SELECT pg_temp.pay('qa-seed-order-06', 'APPROVED');

-- O7 · cliente1 · entregado y reembolsado
SELECT pg_temp.as_user('00000000-0000-4000-8000-00000000a003');
SELECT public.create_order(pg_temp.customer('Cliente Uno QA', 'cliente1@qa.jm.test'), pg_temp.shipping(),
  jsonb_build_array(jsonb_build_object('variant_id', pg_temp.variant('JM-SHO-001-BLANCO-40'), 'quantity', 1)),
  'QAFIJO20K', 'standard', 'qa-seed-order-07');
SELECT pg_temp.pay('qa-seed-order-07', 'APPROVED');

-- O8 · cliente2 · cancelado por el cliente antes de pagar
SELECT pg_temp.as_user('00000000-0000-4000-8000-00000000a004');
SELECT public.create_order(pg_temp.customer('Cliente Dos QA', 'cliente2@qa.jm.test'), pg_temp.shipping(),
  jsonb_build_array(jsonb_build_object('variant_id', pg_temp.variant('JM-TEE-001-BLANCO-CRUDO-S'), 'quantity', 1)),
  NULL, 'standard', 'qa-seed-order-08');
SELECT public.cancel_my_order((pg_temp.order_by_key('qa-seed-order-08')).id, NULL, 'Prueba de cancelación');

-- Avance administrativo
SELECT pg_temp.as_user('00000000-0000-4000-8000-00000000a002');
SELECT public.admin_transition_order((pg_temp.order_by_key('qa-seed-order-01')).id, 'processing');
SELECT public.admin_transition_order((pg_temp.order_by_key('qa-seed-order-01')).id, 'shipped', NULL,
  '{"carrier":"Transportadora QA","tracking_number":"QA-0001"}');
SELECT public.admin_transition_order((pg_temp.order_by_key('qa-seed-order-01')).id, 'delivered');
SELECT public.admin_transition_order((pg_temp.order_by_key('qa-seed-order-02')).id, 'processing');
SELECT public.admin_transition_order((pg_temp.order_by_key('qa-seed-order-06')).id, 'cancelled', 'Prueba de cancelación administrativa');
SELECT public.admin_transition_order((pg_temp.order_by_key('qa-seed-order-07')).id, 'processing');
SELECT public.admin_transition_order((pg_temp.order_by_key('qa-seed-order-07')).id, 'shipped', NULL,
  '{"carrier":"Transportadora QA","tracking_number":"QA-0007"}');
SELECT public.admin_transition_order((pg_temp.order_by_key('qa-seed-order-07')).id, 'delivered');
SELECT public.admin_transition_order((pg_temp.order_by_key('qa-seed-order-07')).id, 'refunded', 'Prueba de reembolso posventa');

-- O9 · cliente2 · pagado, cancelado por el admin con la devolución YA hecha en Wompi, y después Wompi aprueba un
-- segundo intento del mismo pedido (pago tardío) → otra devolución PENDIENTE (ejecución 135, D109).
-- Es el pedido con una devolución hecha y otra pendiente a la vez. Reingreso neto de stock: cero.
CREATE FUNCTION pg_temp.approve_attempt(p_att jsonb, p_tag text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.apply_payment_event(
    jsonb_build_object('event', 'transaction.updated', 'environment', 'test',
      'data', jsonb_build_object('transaction', jsonb_build_object(
        'id', 'qa-tx-' || (p_att ->> 'reference'), 'reference', p_att ->> 'reference', 'status', 'APPROVED',
        'amount_in_cents', (p_att ->> 'amount_in_cents')::bigint, 'currency', 'COP', 'payment_method_type', 'CARD'))),
    'qa-checksum-' || (p_att ->> 'reference') || '-' || p_tag)
$$;
CREATE TEMP TABLE qa_o9_att (n int PRIMARY KEY, att jsonb);
SELECT pg_temp.as_user('00000000-0000-4000-8000-00000000a004');
SELECT public.create_order(pg_temp.customer('Cliente Dos QA', 'cliente2@qa.jm.test'), pg_temp.shipping(),
  jsonb_build_array(jsonb_build_object('variant_id', pg_temp.variant('JM-TEE-001-NEGRO-L'), 'quantity', 1)),
  NULL, 'standard', 'qa-seed-order-09');
INSERT INTO qa_o9_att SELECT n, public.create_payment_attempt(o.id, o.public_token)
  FROM generate_series(1, 2) n, pg_temp.order_by_key('qa-seed-order-09') o ORDER BY n;
SELECT pg_temp.approve_attempt(att, 'APPROVED') FROM qa_o9_att WHERE n = 1;
SELECT pg_temp.as_user('00000000-0000-4000-8000-00000000a002');
SELECT public.admin_transition_order((pg_temp.order_by_key('qa-seed-order-09')).id, 'cancelled', 'Prueba: cliente desiste tras pagar');
SELECT public.admin_mark_refund_processed(r.id, 'qa-wompi-refund-o9-1')
  FROM public.order_refunds r WHERE r.order_id = (pg_temp.order_by_key('qa-seed-order-09')).id;
SELECT pg_temp.approve_attempt(att, 'APPROVED-late') FROM qa_o9_att WHERE n = 2;

SELECT pg_temp.as_user(NULL);
