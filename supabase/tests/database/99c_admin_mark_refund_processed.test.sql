-- 99c · Marcar una devolución como hecha en Wompi (ejecución 130).
-- El admin cancela dos pedidos pagados (A y B) → dos devoluciones `requested`. Marca A con el id de Wompi:
-- pasa a `processed`, guarda quién lo hizo y deja REFUND_PROCESSED; no cambia estado ni stock.
BEGIN;
\ir _helpers.psql
SELECT plan(18);

CREATE FUNCTION pg_temp.paid_order(p_key text, p_who text, p_items jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE att jsonb;
BEGIN
  PERFORM tests.exec_as(p_who, tests.order_sql(p_items, p_key, NULL));
  att := tests.attempt(p_key);
  PERFORM tests.apply(tests.wompi_event(att ->> 'reference', 'APPROVED', (att ->> 'amount_in_cents')::bigint, 'tx-' || p_key), 'chk-' || p_key);
END $$;

SELECT pg_temp.paid_order('test-99c-a', 'c1', tests.items('JM-TEE-001-NEGRO-L', '1'));
SELECT pg_temp.paid_order('test-99c-b', 'c1', tests.items('JM-TEE-001-NEGRO-L', '1'));
SELECT ok((tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''cancelled'', ''Cliente desiste'') AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-99c-a'))) ->> 'ok')::boolean, 'A cancelado (pagado)');
SELECT ok((tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''cancelled'', ''Sin talla'') AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-99c-b'))) ->> 'ok')::boolean, 'B cancelado (pagado)');
CREATE TEMP TABLE t_r AS
  SELECT o.idempotency_key AS k, r.id, o.id AS order_id, o.status FROM public.order_refunds r
    JOIN public.online_orders o ON o.id = r.order_id WHERE o.idempotency_key IN ('test-99c-a', 'test-99c-b');
SELECT is((SELECT count(*)::int FROM t_r), 2, 'dos devoluciones registradas');
CREATE TEMP TABLE t_s0 AS SELECT stock, reserved FROM tests.stock('JM-TEE-001-NEGRO-L');

-- Permisos
SELECT is(tests.exec_as('anon', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r WHERE k = 'test-99c-a'), 'W-1')) ->> 'sqlstate',
          '42501', 'anon no puede');
SELECT is(tests.exec_as('c1', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r WHERE k = 'test-99c-a'), 'W-1')) ->> 'hint',
          'JM_FORBIDDEN', 'el cliente (dueño del pedido) no puede');
SELECT is(tests.exec_as('c1', format($q$UPDATE public.order_refunds SET status = 'processed' WHERE id = %L RETURNING id$q$,
          (SELECT id FROM t_r WHERE k = 'test-99c-a'))) ->> 'sqlstate', '42501', 'nadie actualiza order_refunds directamente');

-- Validación
SELECT is(tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r WHERE k = 'test-99c-a'), '   ')) ->> 'hint',
          'JM_PROVIDER_REFUND_ID_REQUIRED', 'sin id de Wompi: rechazado');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r WHERE k = 'test-99c-a'), 'id con espacios')) ->> 'hint',
          'JM_PROVIDER_REFUND_ID_INVALID', 'id con caracteres no válidos: rechazado');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r WHERE k = 'test-99c-a'), repeat('a', 101))) ->> 'hint',
          'JM_PROVIDER_REFUND_ID_INVALID', 'id de más de 100 caracteres: rechazado');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', gen_random_uuid(), 'W-1')) ->> 'hint',
          'JM_REFUND_NOT_FOUND', 'devolución inexistente');
SELECT is((SELECT count(*)::int FROM public.order_refunds WHERE id IN (SELECT id FROM t_r) AND status = 'requested'), 2,
          'los rechazos no cambian nada');

-- Marcar A
SELECT ok((tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r WHERE k = 'test-99c-a'),
          '  12345-1700000000-99999  ')) ->> 'ok')::boolean, 'admin marca A como devuelta');
SELECT results_eq(format($q$SELECT status::text, provider_refund_id, processed_by FROM public.order_refunds WHERE id = %L$q$, (SELECT id FROM t_r WHERE k = 'test-99c-a')),
                  format($q$VALUES ('processed', '12345-1700000000-99999', %L::uuid)$q$, tests.uid('admin')),
                  'processed con el id (sin espacios) y el admin que lo hizo');
SELECT results_eq(format($q$SELECT actor::text, actor_user_id, note, (metadata ->> 'amount')::bigint, metadata ->> 'refund_id'
                             FROM public.order_events WHERE order_id = %L AND event_type = 'REFUND_PROCESSED'$q$, (SELECT order_id FROM t_r WHERE k = 'test-99c-a')),
                  format($q$SELECT 'admin'::text, %L::uuid, '12345-1700000000-99999'::text, amount, id::text FROM public.order_refunds WHERE id = %L$q$,
                         tests.uid('admin'), (SELECT id FROM t_r WHERE k = 'test-99c-a')),
                  'evento REFUND_PROCESSED con admin, id de Wompi, monto y devolución');
SELECT results_eq(format($q$SELECT status::text FROM public.online_orders WHERE id = %L$q$, (SELECT order_id FROM t_r WHERE k = 'test-99c-a')),
                  $$VALUES ('cancelled')$$, 'el estado del pedido no cambia');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-TEE-001-NEGRO-L')$$, $$SELECT stock, reserved FROM t_s0$$, 'el stock no cambia');

-- Segunda vez y reutilización del id
SELECT is(tests.exec_as('superadmin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r WHERE k = 'test-99c-a'), 'W-2')) ->> 'hint',
          'JM_REFUND_NOT_PENDING', 'ya devuelta (otro admin a la vez): se informa');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_mark_refund_processed(%L, %L) AS r', (SELECT id FROM t_r WHERE k = 'test-99c-b'), '12345-1700000000-99999')) ->> 'hint',
          'JM_PROVIDER_REFUND_ID_IN_USE', 'el mismo id de Wompi no justifica otra devolución');

SELECT * FROM finish();
ROLLBACK;
