-- 99 · Cerrar la revisión de un pedido pagado tarde sin stock (ejecución 124).
BEGIN;
\ir _helpers.psql
SELECT plan(15);

-- Pedido D: reserva la última unidad, vence, otro comprador (E) la compra y D se paga tarde → paid sin stock.
SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-POL-001-BEIGE-M', '1'), 'test-99-d', NULL, 'd99@qa.jm.test')) ->> 'ok')::boolean, 'pedido D (última unidad)');
CREATE TEMP TABLE t_att (k text, att jsonb);
INSERT INTO t_att SELECT 'd1', tests.attempt('test-99-d');
UPDATE public.online_orders SET payment_expires_at = now() - interval '1 second' WHERE idempotency_key = 'test-99-d';
SELECT tests.exec_as('service', 'SELECT public.expire_pending_orders() AS n');
SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-POL-001-BEIGE-M', '1'), 'test-99-e', NULL, 'e99@qa.jm.test'));
INSERT INTO t_att SELECT 'e1', tests.attempt('test-99-e');
SELECT tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'e1'), 'APPROVED',
                   (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'e1'), 'tx-99-E'), 'chk-99-E');
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'd1'), 'APPROVED',
          (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'd1'), 'tx-99-D'), 'chk-99-D')) ->> 'order_status',
          'paid', 'pago tardío sin stock: paid');
CREATE TEMP TABLE t_d AS SELECT id FROM public.online_orders WHERE idempotency_key = 'test-99-d';
SELECT is((SELECT needs_attention FROM public.online_orders WHERE id = (SELECT id FROM t_d)), true, 'requiere revisión');
-- El admin puede leer el faltante (qué variante, cuántas unidades, cuántas había) para explicarlo en el panel.
SELECT is(tests.val(tests.exec_as('admin', format($q$SELECT (e.metadata -> 'shortages' -> 0 ->> 'quantity')::int AS q
            FROM public.order_events e WHERE e.order_id = %L AND e.event_type = 'PAID_WITHOUT_STOCK'$q$, (SELECT id FROM t_d))))::int,
          1, 'admin lee el detalle del faltante en el evento');

-- Permisos
SELECT is(tests.exec_as('anon', format('SELECT public.admin_resolve_order_attention(%L, %L) AS r', (SELECT id FROM t_d), 'x')) ->> 'sqlstate',
          '42501', 'anon no puede');
SELECT is(tests.exec_as('c1', format('SELECT public.admin_resolve_order_attention(%L, %L) AS r', (SELECT id FROM t_d), 'x')) ->> 'hint',
          'JM_FORBIDDEN', 'un cliente no puede');

-- Validación
SELECT is(tests.exec_as('admin', format('SELECT public.admin_resolve_order_attention(%L, %L) AS r', (SELECT id FROM t_d), '   ')) ->> 'hint',
          'JM_NOTE_REQUIRED', 'sin motivo: rechazado');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_resolve_order_attention(%L, %L) AS r', (SELECT id FROM t_d), repeat('a', 501))) ->> 'hint',
          'JM_NOTE_TOO_LONG', 'motivo de más de 500 caracteres: rechazado');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_resolve_order_attention(%L, %L) AS r', gen_random_uuid(), 'x')) ->> 'hint',
          'JM_ORDER_NOT_FOUND', 'pedido inexistente');
SELECT is((SELECT needs_attention FROM public.online_orders WHERE id = (SELECT id FROM t_d)), true, 'los rechazos no quitan la marca');

-- Cierre
SELECT ok((tests.exec_as('admin', format('SELECT public.admin_resolve_order_attention(%L, %L) AS r', (SELECT id FROM t_d),
          '  Repuesta 1 unidad y despachado  ')) ->> 'ok')::boolean, 'admin cierra la revisión');
SELECT results_eq(format($q$SELECT status::text, needs_attention FROM public.online_orders WHERE id = %L$q$, (SELECT id FROM t_d)),
                  $$VALUES ('paid', false)$$, 'sin marca y el estado no cambia');
SELECT results_eq(format($q$SELECT actor::text, actor_user_id, note FROM public.order_events
                             WHERE order_id = %L AND event_type = 'ATTENTION_RESOLVED'$q$, (SELECT id FROM t_d)),
                  format($q$VALUES ('admin', %L::uuid, 'Repuesta 1 unidad y despachado')$q$, tests.uid('admin')),
                  'evento con el admin y el motivo (sin espacios sobrantes)');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-POL-001-BEIGE-M')$$, $$VALUES (0, 0)$$, 'el stock no cambia');
-- Segunda vez (otro admin a la vez): se informa en lugar de duplicar el evento
SELECT is(tests.exec_as('superadmin', format('SELECT public.admin_resolve_order_attention(%L, %L) AS r', (SELECT id FROM t_d), 'otra vez')) ->> 'hint',
          'JM_ATTENTION_NOT_REQUIRED', 'ya revisado: se informa y no se duplica');

SELECT * FROM finish();
ROLLBACK;
