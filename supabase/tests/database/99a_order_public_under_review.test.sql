-- 99a · El cliente ve que su pedido pagado sin stock está «en revisión» (ejecución 125).
BEGIN;
\ir _helpers.psql
SELECT plan(6);

-- Pedido D: reserva la última unidad, vence, otro comprador (E) la compra y D se paga tarde → paid sin stock.
SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-POL-001-BEIGE-M', '1'), 'test-99a-d', NULL, 'd99a@qa.jm.test')) ->> 'ok')::boolean, 'pedido D (última unidad)');
CREATE TEMP TABLE t_att (k text, att jsonb);
INSERT INTO t_att SELECT 'd1', tests.attempt('test-99a-d');
UPDATE public.online_orders SET payment_expires_at = now() - interval '1 second' WHERE idempotency_key = 'test-99a-d';
SELECT tests.exec_as('service', 'SELECT public.expire_pending_orders() AS n');
SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-POL-001-BEIGE-M', '1'), 'test-99a-e', NULL, 'e99a@qa.jm.test'));
INSERT INTO t_att SELECT 'e1', tests.attempt('test-99a-e');
SELECT tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'e1'), 'APPROVED',
                   (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'e1'), 'tx-99a-E'), 'chk-99a-E');
SELECT tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'd1'), 'APPROVED',
                   (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'd1'), 'tx-99a-D'), 'chk-99a-D');
CREATE TEMP TABLE t_o AS SELECT idempotency_key AS k, id, order_number, public_token FROM public.online_orders
                          WHERE idempotency_key IN ('test-99a-d', 'test-99a-e');

SELECT is(tests.val(tests.exec_as('anon', (SELECT format('SELECT public.get_order_public(%L, %L::uuid) AS r', order_number, public_token)
                                             FROM t_o WHERE k = 'test-99a-d'))) ->> 'under_review',
          'true', 'enlace de seguimiento: el pedido pagado sin stock aparece en revisión');
SELECT is(tests.val(tests.exec_as('anon', (SELECT format('SELECT public.get_order_public(%L, %L::uuid) AS r', order_number, public_token)
                                             FROM t_o WHERE k = 'test-99a-d'))) ->> 'status',
          'paid', 'y sigue pagado');
SELECT is(tests.val(tests.exec_as('anon', (SELECT format('SELECT public.get_order_public(%L, %L::uuid) AS r', order_number, public_token)
                                             FROM t_o WHERE k = 'test-99a-e'))) ->> 'under_review',
          'false', 'un pedido pagado normal no está en revisión');
-- No expone el detalle interno de la revisión (faltantes, intentos de pago).
SELECT ok(NOT (tests.val(tests.exec_as('anon', (SELECT format('SELECT public.get_order_public(%L, %L::uuid) AS r', order_number, public_token)
                                                  FROM t_o WHERE k = 'test-99a-d'))) ?| ARRAY['shortages', 'needs_attention', 'requires_refund']),
          'sin faltantes ni datos de pago internos');
-- Cuando el admin cierra la revisión, el aviso desaparece.
SELECT tests.exec_as('admin', format('SELECT public.admin_resolve_order_attention(%L, %L) AS r',
                     (SELECT id FROM t_o WHERE k = 'test-99a-d'), 'Repuesta 1 unidad'));
SELECT is(tests.val(tests.exec_as('anon', (SELECT format('SELECT public.get_order_public(%L, %L::uuid) AS r', order_number, public_token)
                                             FROM t_o WHERE k = 'test-99a-d'))) ->> 'under_review',
          'false', 'tras cerrar la revisión ya no aparece');

SELECT * FROM finish();
ROLLBACK;
