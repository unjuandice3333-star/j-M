-- 99c · Marcar una devolución como hecha en Wompi (ejecución 130).
-- Pedido pagado → el admin lo cancela (registra la devolución `requested`) → el admin la marca `processed`
-- con el id de Wompi. Solo admin, id obligatorio, sin sobrescribir una ya procesada, evento en el historial.
BEGIN;
\ir _helpers.psql
SELECT plan(18);

SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-SHI-001-BLANCO-M', '1'),
          'test-99c-a', NULL, 'a99c@qa.jm.test')) ->> 'ok')::boolean, 'pedido A');
CREATE TEMP TABLE t_att AS SELECT tests.attempt('test-99c-a') AS att;
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att), 'APPROVED',
          (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att), 'tx-99c-A'), 'chk-99c-A')) ->> 'order_status',
          'paid', 'pedido A pagado');
CREATE TEMP TABLE t_a AS SELECT id, total FROM public.online_orders WHERE idempotency_key = 'test-99c-a';
SELECT ok((tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''cancelled'', ''Sin tela'') AS r',
          (SELECT id FROM t_a))) ->> 'ok')::boolean, 'admin cancela el pedido pagado');
CREATE TEMP TABLE t_r AS SELECT id FROM public.order_refunds WHERE order_id = (SELECT id FROM t_a);
SELECT results_eq(format($q$SELECT status::text, provider_refund_id, processed_by FROM public.order_refunds WHERE id = %L$q$, (SELECT id FROM t_r)),
                  $$VALUES ('requested', NULL::text, NULL::uuid)$$, 'devolución registrada como requested');

-- Permisos
SELECT is(tests.exec_as('anon', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r), 'rf-1')) ->> 'sqlstate',
          '42501', 'anon no puede');
SELECT is(tests.exec_as('c1', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r), 'rf-1')) ->> 'hint',
          'JM_FORBIDDEN', 'un cliente no puede');

-- Validación
SELECT is(tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r), '   ')) ->> 'hint',
          'JM_PROVIDER_REFUND_ID_REQUIRED', 'sin id de Wompi: rechazado');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(%L, NULL) AS r', (SELECT id FROM t_r))) ->> 'hint',
          'JM_PROVIDER_REFUND_ID_REQUIRED', 'id nulo: rechazado');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r), repeat('x', 101))) ->> 'hint',
          'JM_PROVIDER_REFUND_ID_TOO_LONG', 'id de más de 100 caracteres: rechazado');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', gen_random_uuid(), 'rf-1')) ->> 'hint',
          'JM_REFUND_NOT_FOUND', 'devolución inexistente');
SELECT is((SELECT status::text FROM public.order_refunds WHERE id = (SELECT id FROM t_r)), 'requested', 'los rechazos no cambian nada');

-- Marcar como hecha
SELECT ok((tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r),
          '  rf-wompi-99c  ')) ->> 'ok')::boolean, 'admin marca la devolución como hecha');
SELECT results_eq(format($q$SELECT status::text, provider_refund_id, processed_by FROM public.order_refunds WHERE id = %L$q$, (SELECT id FROM t_r)),
                  format($q$VALUES ('processed', 'rf-wompi-99c', %L::uuid)$q$, tests.uid('admin')), 'processed, id de Wompi recortado y admin');
SELECT results_eq(format($q$SELECT event_type, actor::text, metadata ->> 'provider_refund_id', (metadata ->> 'amount')::bigint, metadata ->> 'previous_status'
                             FROM public.order_events WHERE order_id = %L AND event_type = 'REFUND_PROCESSED'$q$, (SELECT id FROM t_a)),
                  format($q$VALUES ('REFUND_PROCESSED', 'admin', 'rf-wompi-99c', %s::bigint, 'requested')$q$, (SELECT total FROM t_a)),
                  'evento REFUND_PROCESSED con monto e id');
SELECT is((SELECT status::text FROM public.online_orders WHERE id = (SELECT id FROM t_a)), 'cancelled', 'el estado del pedido no cambia');

-- Segunda vez: no se sobrescribe el id
SELECT is(tests.exec_as('superadmin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r), 'otro-id')) ->> 'hint',
          'JM_REFUND_ALREADY_PROCESSED', 'ya hecha: se informa');
SELECT is((SELECT provider_refund_id FROM public.order_refunds WHERE id = (SELECT id FROM t_r)), 'rf-wompi-99c', 'el id original se conserva');

-- Rechazada: no se puede marcar como hecha
UPDATE public.order_refunds SET status = 'rejected', provider_refund_id = NULL WHERE id = (SELECT id FROM t_r);
SELECT is(tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r), 'rf-2')) ->> 'hint',
          'JM_REFUND_NOT_PENDING', 'rechazada: no se marca');

SELECT * FROM finish();
ROLLBACK;
