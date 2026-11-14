-- 99d · Devolución pendiente para pagos duplicados o tardíos (ejecución 135).
-- A: pedido pagado con un intento, el admin lo cancela (devolución 1) y la marca hecha en Wompi; después Wompi
--    aprueba un SEGUNDO intento del mismo pedido → devolución 2 `requested` del monto de ese intento, sin reingreso.
--    El pedido queda con una devolución hecha y otra pendiente a la vez.
-- B: doble aprobación sobre un pedido pagado → devolución pendiente; cerrar la revisión no la borra; si Wompi
--    anula ese intento, la devolución pasa a `rejected` (no hay dinero que devolver).
BEGIN;
\ir _helpers.psql
SELECT plan(20);

CREATE TEMP TABLE t_att (k text PRIMARY KEY, att jsonb);
CREATE FUNCTION pg_temp.approve(p_k text, p_chk text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = p_k), 'APPROVED',
                   (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = p_k), 'tx-' || p_k), p_chk))
$$;
CREATE FUNCTION pg_temp.ord(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.online_orders WHERE idempotency_key = p_key
$$;
CREATE FUNCTION pg_temp.pay_id(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.payment_transactions WHERE reference = (SELECT att ->> 'reference' FROM t_att WHERE k = p_k)
$$;

-- ===================== A. Pago aprobado después de cancelar (con devolución ya hecha) =====================
SELECT tests.exec_as('c1', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '1'), 'test-99d-a', NULL));
INSERT INTO t_att SELECT 'a1', tests.attempt('test-99d-a');
INSERT INTO t_att SELECT 'a2', tests.attempt('test-99d-a');
SELECT is(pg_temp.approve('a1', 'chk-99d-a1') ->> 'detail', 'order_paid', 'A: primer intento aprobado → pagado');
SELECT ok((tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''cancelled'', ''Cliente desiste'') AS r',
          pg_temp.ord('test-99d-a'))) ->> 'ok')::boolean, 'A: el admin lo cancela');
SELECT ok((tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(r.id, %L) AS r FROM public.order_refunds r WHERE r.order_id = %L',
          'W-99D-1', pg_temp.ord('test-99d-a'))) ->> 'ok')::boolean, 'A: devolución de la cancelación hecha en Wompi');
CREATE TEMP TABLE t_s0 AS SELECT stock, reserved FROM tests.stock('JM-TEE-001-NEGRO-L');

SELECT is(pg_temp.approve('a2', 'chk-99d-a2') ->> 'detail', 'approved_requires_refund', 'A: segundo intento aprobado tras cancelar → a reembolsar');
SELECT results_eq(format($q$SELECT status::text, amount, restock, requested_by IS NULL, provider_refund_id IS NULL
                             FROM public.order_refunds WHERE payment_transaction_id = %L$q$, pg_temp.pay_id('a2')),
                  format($q$VALUES ('requested'::text, %s::bigint, false, true, true)$q$, (SELECT (att ->> 'amount_in_cents')::bigint / 100 FROM t_att WHERE k = 'a2')),
                  'A: devolución pendiente del monto cobrado por ese intento, sin reingreso de stock');
SELECT results_eq(format($q$SELECT status::text FROM public.order_refunds WHERE order_id = %L ORDER BY status::text$q$, pg_temp.ord('test-99d-a')),
                  $$VALUES ('processed'::text), ('requested'::text)$$, 'A: una devolución hecha y otra pendiente a la vez');
SELECT results_eq(format($q$SELECT actor::text, metadata ->> 'reference', (metadata ->> 'amount')::bigint
                             FROM public.order_events WHERE order_id = %L AND event_type = 'REFUND_REQUESTED'$q$, pg_temp.ord('test-99d-a')),
                  format($q$SELECT 'system'::text, %L::text, %s::bigint$q$, (SELECT att ->> 'reference' FROM t_att WHERE k = 'a2'),
                         (SELECT (att ->> 'amount_in_cents')::bigint / 100 FROM t_att WHERE k = 'a2')),
                  'A: evento REFUND_REQUESTED con la referencia y el monto');
SELECT results_eq(format($q$SELECT status::text, needs_attention FROM public.online_orders WHERE id = %L$q$, pg_temp.ord('test-99d-a')),
                  $$VALUES ('cancelled'::text, true)$$, 'A: el pedido sigue cancelado y requiere revisión');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-TEE-001-NEGRO-L')$$, $$SELECT stock, reserved FROM t_s0$$,
                  'A: el pago tardío no toca el inventario');

-- Reenvío del webhook (mismo evento) y otro evento APPROVED del mismo intento: no duplica la devolución
SELECT pg_temp.approve('a2', 'chk-99d-a2');
SELECT pg_temp.approve('a2', 'chk-99d-a2-bis');
SELECT is((SELECT count(*)::int FROM public.order_refunds WHERE payment_transaction_id = pg_temp.pay_id('a2')), 1,
          'A: reintentos del webhook no duplican la devolución');

-- Visible para el admin y para el dueño (RLS order_refunds_read); no para otro cliente
SELECT is(tests.nrows(tests.exec_as('admin', format($q$SELECT id FROM public.order_refunds WHERE order_id = %L AND status = 'requested'$q$,
          pg_temp.ord('test-99d-a')))), 1, 'A: el admin la ve como pendiente (dashboard, campana y filtro)');
SELECT is(tests.nrows(tests.exec_as('c2', format($q$SELECT id FROM public.order_refunds WHERE order_id = %L$q$, pg_temp.ord('test-99d-a')))), 0,
          'A: otro cliente no la ve');

-- Se marca hecha como cualquier otra
SELECT ok((tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(r.id, %L) AS r FROM public.order_refunds r WHERE r.payment_transaction_id = %L',
          'W-99D-2', pg_temp.pay_id('a2'))) ->> 'ok')::boolean, 'A: el admin marca la segunda devolución como hecha');
SELECT is((SELECT count(*)::int FROM public.order_refunds WHERE order_id = pg_temp.ord('test-99d-a') AND status = 'processed'), 2,
          'A: ambas devoluciones hechas');

-- ===================== B. Doble aprobación sobre pedido pagado, luego anulación del duplicado =====================
SELECT tests.exec_as('c1', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '1'), 'test-99d-b', NULL));
INSERT INTO t_att SELECT 'b1', tests.attempt('test-99d-b');
INSERT INTO t_att SELECT 'b2', tests.attempt('test-99d-b');
SELECT pg_temp.approve('b1', 'chk-99d-b1');
SELECT is(pg_temp.approve('b2', 'chk-99d-b2') ->> 'detail', 'approved_requires_refund', 'B: doble aprobación → a reembolsar');
SELECT results_eq(format($q$SELECT r.status::text, o.status::text FROM public.order_refunds r JOIN public.online_orders o ON o.id = r.order_id
                             WHERE r.order_id = %L$q$, pg_temp.ord('test-99d-b')),
                  $$VALUES ('requested'::text, 'paid'::text)$$, 'B: devolución pendiente del duplicado; el pedido sigue pagado');
SELECT ok((tests.exec_as('admin', format('SELECT public.admin_resolve_order_attention(%L, %L) AS r', pg_temp.ord('test-99d-b'),
          'Cliente avisado: se devuelve el cobro doble')) ->> 'ok')::boolean, 'B: el admin cierra la revisión');
SELECT is((SELECT status::text FROM public.order_refunds WHERE order_id = pg_temp.ord('test-99d-b')), 'requested',
          'B: cerrar la revisión no borra la devolución pendiente');

SELECT tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'b2'), 'VOIDED',
                   (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'b2'), 'tx-b2'), 'chk-99d-b2-void');
SELECT results_eq(format($q$SELECT r.status::text, (SELECT count(*)::int FROM public.order_events e WHERE e.order_id = r.order_id
                                                     AND e.event_type = 'REFUND_NOT_NEEDED' AND e.metadata ->> 'refund_id' = r.id::text)
                             FROM public.order_refunds r WHERE r.order_id = %L$q$, pg_temp.ord('test-99d-b')),
                  $$VALUES ('rejected'::text, 1)$$, 'B: Wompi anula el duplicado → devolución rechazada con evento REFUND_NOT_NEEDED');
SELECT is((SELECT status::text FROM public.online_orders WHERE id = pg_temp.ord('test-99d-b')), 'paid', 'B: el pedido sigue pagado');

SELECT * FROM finish();
ROLLBACK;
