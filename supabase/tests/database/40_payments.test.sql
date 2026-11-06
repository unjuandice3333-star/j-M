-- 40 · Pagos Wompi: intentos, eventos idempotentes, aprobado, rechazado, duplicados y casos límite
BEGIN;
\ir _helpers.psql
SELECT plan(44);

-- ===================== A. Pago aprobado =====================
SELECT ok((tests.exec_as('c1', tests.order_sql(tests.items('JM-TEE-001-NEGRO-S', '2'), 'test-40-a')) ->> 'ok')::boolean, 'pedido A creado');
CREATE TEMP TABLE t_a AS SELECT * FROM public.online_orders WHERE idempotency_key = 'test-40-a';
CREATE TEMP TABLE t_att AS SELECT 'a1'::text AS k, tests.attempt('test-40-a') AS att;

SELECT is((SELECT att ->> 'reference' FROM t_att WHERE k = 'a1'), (SELECT order_number || '-1' FROM t_a),
          'intento 1 con referencia NUMERO-1');
SELECT is((SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'a1'), (SELECT total * 100 FROM t_a),
          'monto del intento = total × 100 (pesos enteros → centavos)');
SELECT is(tests.exec_as('anon', format('SELECT public.create_payment_attempt(%L::uuid, %L::uuid) AS r',
          (SELECT id FROM t_a), (SELECT public_token FROM t_a))) ->> 'sqlstate', '42501', 'anon no puede crear intentos');

CREATE TEMP TABLE t_ev AS SELECT tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'a1'), 'APPROVED',
                                                   (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'a1'), 'tx-A-1') AS ev;
SELECT is(tests.val(tests.apply((SELECT ev FROM t_ev), 'chk-A-approved')) ->> 'result', 'applied', 'evento APPROVED aplicado');
SELECT results_eq($$SELECT status::text, paid_at IS NOT NULL FROM public.online_orders WHERE idempotency_key = 'test-40-a'$$,
                  $$VALUES ('paid'::text, true)$$, 'pedido pagado con paid_at');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-TEE-001-NEGRO-S')$$, $$VALUES (3, 0)$$,
                  'stock descontado 5 → 3 y reserva consumida');
SELECT results_eq($$SELECT movement_type::text, quantity_change, quantity_before, quantity_after FROM public.inventory_movements
                     WHERE reference_id = (SELECT id FROM t_a)$$,
                  $$VALUES ('sale'::text, -2, 5, 3)$$, 'movimiento de venta con aritmética correcta');
SELECT is((SELECT r.status::text FROM public.inventory_reservations r WHERE r.order_id = (SELECT id FROM t_a)), 'consumed', 'reserva consumida');
SELECT results_eq($$SELECT status::text, provider_transaction_id FROM public.payment_transactions WHERE order_id = (SELECT id FROM t_a)$$,
                  $$VALUES ('APPROVED'::text, 'tx-A-1'::text)$$, 'intento aprobado con id de Wompi');

-- Webhook duplicado (mismo checksum) y reentrega (otro checksum, mismo estado)
SELECT is(tests.val(tests.apply((SELECT ev FROM t_ev), 'chk-A-approved')) ->> 'result', 'duplicate', 'mismo evento: duplicado sin efectos');
SELECT is(tests.val(tests.apply((SELECT ev FROM t_ev), 'chk-A-approved-retry')) ->> 'detail', 'status_unchanged', 'reentrega con otro checksum: ignorada');
SELECT is((SELECT count(*)::int FROM public.inventory_movements WHERE reference_id = (SELECT id FROM t_a)), 1, 'sigue habiendo un solo movimiento de venta');
SELECT is((SELECT stock FROM tests.stock('JM-TEE-001-NEGRO-S')), 3, 'stock no se descuenta dos veces');
SELECT is((SELECT count(*)::int FROM public.webhook_events WHERE reference = (SELECT att ->> 'reference' FROM t_att WHERE k = 'a1')), 2,
          'bandeja de webhooks registra los 2 eventos distintos (el duplicado no se reinserta)');

-- DECLINED tardío no degrada un pedido pagado
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'a1'), 'DECLINED',
          (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'a1'), 'tx-A-1'), 'chk-A-declined')) ->> 'detail',
          'attempt_already_approved', 'DECLINED después de APPROVED: ignorado');
SELECT is((SELECT status::text FROM public.online_orders WHERE idempotency_key = 'test-40-a'), 'paid', 'pedido sigue pagado');

-- ===================== B. Rechazado y reintento =====================
SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-SHI-001-AZUL-NAVY-M', '1'), 'test-40-b', NULL, 'b@qa.jm.test')) ->> 'ok')::boolean, 'pedido B creado');
CREATE TEMP TABLE t_b AS SELECT * FROM public.online_orders WHERE idempotency_key = 'test-40-b';
INSERT INTO t_att SELECT 'b1', tests.attempt('test-40-b');
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'b1'), 'DECLINED',
          (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'b1'), 'tx-B-1'), 'chk-B-1-declined')) ->> 'detail',
          'attempt_failed_order_unchanged', 'pago rechazado registrado');
SELECT results_eq($$SELECT o.status::text, r.status::text FROM public.online_orders o JOIN public.inventory_reservations r ON r.order_id = o.id
                     WHERE o.idempotency_key = 'test-40-b'$$, $$VALUES ('payment_pending'::text, 'active'::text)$$,
                  'tras el rechazo el pedido sigue pendiente y conserva la reserva');
INSERT INTO t_att SELECT 'b2', tests.attempt('test-40-b');
SELECT is((SELECT att ->> 'reference' FROM t_att WHERE k = 'b2'), (SELECT order_number || '-2' FROM t_b), 'reintento con nueva referencia NUMERO-2');
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'b2'), 'APPROVED',
          (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'b2'), 'tx-B-2'), 'chk-B-2-approved')) ->> 'detail',
          'order_paid', 'segundo intento aprobado');
SELECT results_eq($$SELECT attempt_number, status::text FROM public.payment_transactions WHERE order_id = (SELECT id FROM t_b) ORDER BY 1$$,
                  $$VALUES (1, 'DECLINED'::text), (2, 'APPROVED'::text)$$, 'historial de intentos conservado');
SELECT is((SELECT count(*)::int FROM public.order_events e WHERE e.order_id = (SELECT id FROM t_b) AND e.event_type = 'PAYMENT_ATTEMPT_FAILED'), 1,
          'evento PAYMENT_ATTEMPT_FAILED registrado');

-- ===================== C. Rechazos por validación =====================
SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-JEA-001-AZUL-INDIGO-34', '1'), 'test-40-c', NULL, 'c@qa.jm.test')) ->> 'ok')::boolean, 'pedido C creado');
CREATE TEMP TABLE t_c AS SELECT * FROM public.online_orders WHERE idempotency_key = 'test-40-c';
INSERT INTO t_att SELECT 'c1', tests.attempt('test-40-c');
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'c1'), 'APPROVED', 100, 'tx-C-1'),
          'chk-C-amount')) ->> 'detail', 'amount_or_currency_mismatch', 'monto distinto: rechazado');
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'c1'), 'APPROVED',
          (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'c1'), 'tx-C-1', 'USD'), 'chk-C-currency')) ->> 'detail',
          'amount_or_currency_mismatch', 'moneda distinta: rechazada');
SELECT is(tests.val(tests.apply(tests.wompi_event('JM-999999-1', 'APPROVED', 100, 'tx-unknown'), 'chk-unknown')) ->> 'detail',
          'unknown_reference', 'referencia desconocida: rechazada');
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'c1'), 'APPROVED',
          (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'c1'), 'tx-A-1'), 'chk-C-reuse')) ->> 'detail',
          'transaction_id_reused', 'id de transacción de otro pedido: rechazado');
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'c1'), 'APPROVED', 1, 'x', 'COP', 'nequi_token.updated'),
          'chk-C-other-event')) ->> 'detail', 'unsupported_event', 'tipo de evento no soportado: ignorado');
SELECT is(tests.val(tests.apply('{"event":"transaction.updated","data":{"transaction":{"reference":"x"}}}'::jsonb, 'chk-malformed')) ->> 'detail',
          'malformed_transaction', 'evento malformado: rechazado');
SELECT results_eq($$SELECT status::text FROM public.online_orders WHERE idempotency_key = 'test-40-c'$$, ARRAY['payment_pending'],
                  'ningún evento rechazado modificó el pedido C');
SELECT is((SELECT count(*)::int FROM public.webhook_events WHERE result = 'rejected' AND event_checksum LIKE 'chk-%'), 5,
          'eventos rechazados quedan registrados para auditoría');

-- ===================== D. Aprobación tardía (pedido vencido) =====================
INSERT INTO t_att SELECT 'c-late', tests.attempt('test-40-c');   -- intento 2 de C, luego vence
UPDATE public.online_orders SET payment_expires_at = now() - interval '1 second' WHERE idempotency_key = 'test-40-c';
SELECT is(tests.val(tests.exec_as('service', 'SELECT public.expire_pending_orders() AS n'))::int, 1, 'pedido C vencido');
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'c-late'), 'APPROVED',
          (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'c-late'), 'tx-C-2'), 'chk-C-late')) ->> 'order_status',
          'paid', 'aprobación tardía con stock disponible: expired → paid');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-JEA-001-AZUL-INDIGO-34')$$, $$VALUES (4, 0)$$,
                  'stock descontado directamente (sin reserva vigente)');

-- Aprobación tardía SIN stock: otro comprador se llevó la última unidad
SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-POL-001-BEIGE-M', '1'), 'test-40-d', NULL, 'd@qa.jm.test')) ->> 'ok')::boolean, 'pedido D (última unidad)');
CREATE TEMP TABLE t_d AS SELECT * FROM public.online_orders WHERE idempotency_key = 'test-40-d';
INSERT INTO t_att SELECT 'd1', tests.attempt('test-40-d');
UPDATE public.online_orders SET payment_expires_at = now() - interval '1 second' WHERE idempotency_key = 'test-40-d';
SELECT tests.exec_as('service', 'SELECT public.expire_pending_orders() AS n');
SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-POL-001-BEIGE-M', '1'), 'test-40-e', NULL, 'e@qa.jm.test'));
INSERT INTO t_att SELECT 'e1', tests.attempt('test-40-e');
SELECT tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'e1'), 'APPROVED',
                   (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'e1'), 'tx-E-1'), 'chk-E');
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'd1'), 'APPROVED',
          (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'd1'), 'tx-D-1'), 'chk-D-late')) ->> 'order_status',
          'paid', 'aprobación tardía sin stock: el pago se respeta (paid)');
SELECT results_eq($$SELECT needs_attention, (SELECT count(*)::int FROM public.order_events e WHERE e.order_id = o.id AND e.event_type = 'PAID_WITHOUT_STOCK')
                      FROM public.online_orders o WHERE idempotency_key = 'test-40-d'$$, $$VALUES (true, 1)$$,
                  'pedido marcado para atención con evento PAID_WITHOUT_STOCK');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-POL-001-BEIGE-M')$$, $$VALUES (0, 0)$$,
                  'el inventario nunca queda negativo');

-- ===================== E. Doble aprobación y pago sobre pedido cancelado =====================
SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-SHO-001-BLANCO-42', '1'), 'test-40-f', NULL, 'f@qa.jm.test'));
CREATE TEMP TABLE t_f AS SELECT * FROM public.online_orders WHERE idempotency_key = 'test-40-f';
INSERT INTO t_att SELECT 'f1', tests.attempt('test-40-f');
INSERT INTO t_att SELECT 'f2', tests.attempt('test-40-f');
SELECT tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'f1'), 'APPROVED',
                   (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'f1'), 'tx-F-1'), 'chk-F-1');
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'f2'), 'APPROVED',
          (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'f2'), 'tx-F-2'), 'chk-F-2')) ->> 'detail',
          'approved_requires_refund', 'segundo pago aprobado del mismo pedido: marcado para reembolso');
SELECT results_eq($$SELECT (count(*) FILTER (WHERE status = 'APPROVED'))::int, (count(*) FILTER (WHERE requires_refund))::int,
                           (SELECT count(*)::int FROM public.inventory_movements WHERE reference_id = (SELECT id FROM t_f))
                      FROM public.payment_transactions WHERE order_id = (SELECT id FROM t_f)$$,
                  $$VALUES (2, 1, 1)$$, 'dos aprobados, uno a reembolsar, stock descontado una sola vez');

SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-SHO-001-BLANCO-42', '1'), 'test-40-g', NULL, 'g@qa.jm.test'));
CREATE TEMP TABLE t_g AS SELECT * FROM public.online_orders WHERE idempotency_key = 'test-40-g';
INSERT INTO t_att SELECT 'g1', tests.attempt('test-40-g');
SELECT tests.exec_as('anon', format('SELECT public.cancel_my_order(%L::uuid, %L::uuid) AS r', (SELECT id FROM t_g), (SELECT public_token FROM t_g)));
SELECT results_eq($$SELECT (tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'g1'), 'APPROVED',
                      (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'g1'), 'tx-G-1'), 'chk-G-1')) ->> 'detail'),
                           (SELECT status::text FROM public.online_orders WHERE idempotency_key = 'test-40-g')$$,
                  $$VALUES ('approved_requires_refund'::text, 'cancelled'::text)$$,
                  'pago aprobado sobre pedido cancelado: el pedido sigue cancelado y el pago queda para reembolso');

-- VOIDED después de pagado: requiere revisión
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'a1'), 'VOIDED',
          (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'a1'), 'tx-A-1'), 'chk-A-voided')) ->> 'detail',
          'voided_after_paid_needs_review', 'anulación posterior al pago: pedido marcado para revisión');

SELECT * FROM finish();
ROLLBACK;
