-- 99b · Reembolsar y cerrar la revisión en un solo paso (ejecución 126).
-- Pedido D con DOS líneas: la camisa (había stock) se vende al pagar tarde; el polo (última unidad, ya
-- vendida a E) falta. Reembolsar D debe reingresar SOLO la camisa: el polo no se vendió a D y devolverlo
-- inflaría el inventario con una unidad que ya tiene E.
BEGIN;
\ir _helpers.psql
SELECT plan(21);

CREATE TEMP TABLE t_s0 AS SELECT stock AS s0 FROM tests.stock('JM-SHI-001-BLANCO-M');
SELECT ok((SELECT s0 FROM t_s0) >= 2, 'camisa: hay al menos 2 unidades al empezar');
SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-POL-001-BEIGE-M', '1', 'JM-SHI-001-BLANCO-M', '2'),
          'test-99b-d', NULL, 'd99b@qa.jm.test')) ->> 'ok')::boolean, 'pedido D (polo + 2 camisas)');
CREATE TEMP TABLE t_att (k text, att jsonb);
INSERT INTO t_att SELECT 'd1', tests.attempt('test-99b-d');
UPDATE public.online_orders SET payment_expires_at = now() - interval '1 second' WHERE idempotency_key = 'test-99b-d';
SELECT tests.exec_as('service', 'SELECT public.expire_pending_orders() AS n');
SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-POL-001-BEIGE-M', '1'), 'test-99b-e', NULL, 'e99b@qa.jm.test'));
INSERT INTO t_att SELECT 'e1', tests.attempt('test-99b-e');
SELECT tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'e1'), 'APPROVED',
                   (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'e1'), 'tx-99b-E'), 'chk-99b-E');
SELECT is(tests.val(tests.apply(tests.wompi_event((SELECT att ->> 'reference' FROM t_att WHERE k = 'd1'), 'APPROVED',
          (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att WHERE k = 'd1'), 'tx-99b-D'), 'chk-99b-D')) ->> 'order_status',
          'paid', 'pago tardío con una línea sin stock: paid');
CREATE TEMP TABLE t_d AS SELECT id, total FROM public.online_orders WHERE idempotency_key = 'test-99b-d';
SELECT is((SELECT needs_attention FROM public.online_orders WHERE id = (SELECT id FROM t_d)), true, 'requiere revisión');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-SHI-001-BLANCO-M')$$, format('VALUES (%s, 0)', (SELECT s0 - 2 FROM t_s0)), 'camisa vendida a D (−2)');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-POL-001-BEIGE-M')$$, $$VALUES (0, 0)$$, 'polo vendido a E (1 → 0)');

-- Permisos
SELECT is(tests.exec_as('anon', format('SELECT public.admin_refund_order_attention(%L, %L) AS r', (SELECT id FROM t_d), 'x')) ->> 'sqlstate',
          '42501', 'anon no puede');
SELECT is(tests.exec_as('c1', format('SELECT public.admin_refund_order_attention(%L, %L) AS r', (SELECT id FROM t_d), 'x')) ->> 'hint',
          'JM_FORBIDDEN', 'un cliente no puede');

-- Validación
SELECT is(tests.exec_as('admin', format('SELECT public.admin_refund_order_attention(%L, %L) AS r', (SELECT id FROM t_d), '  ')) ->> 'hint',
          'JM_NOTE_REQUIRED', 'sin motivo: rechazado');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_refund_order_attention(%L, %L) AS r', (SELECT id FROM t_d), repeat('a', 501))) ->> 'hint',
          'JM_NOTE_TOO_LONG', 'motivo de más de 500 caracteres: rechazado');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_refund_order_attention(%L, %L) AS r', gen_random_uuid(), 'x')) ->> 'hint',
          'JM_ORDER_NOT_FOUND', 'pedido inexistente');
SELECT results_eq(format($q$SELECT status::text, needs_attention FROM public.online_orders WHERE id = %L$q$, (SELECT id FROM t_d)),
                  $$VALUES ('paid', true)$$, 'los rechazos no cambian nada');

-- Reembolso + cierre
SELECT ok((tests.exec_as('admin', format('SELECT public.admin_refund_order_attention(%L, %L) AS r', (SELECT id FROM t_d),
          '  Sin polo para reponer: reembolsado en Wompi  ')) ->> 'ok')::boolean, 'admin reembolsa y cierra la revisión');
SELECT results_eq(format($q$SELECT status::text, needs_attention FROM public.online_orders WHERE id = %L$q$, (SELECT id FROM t_d)),
                  $$VALUES ('refunded', false)$$, 'reembolsado y sin marca');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-SHI-001-BLANCO-M')$$, format('VALUES (%s, 0)', (SELECT s0 FROM t_s0)), 'la camisa vendida vuelve al inventario (+2)');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-POL-001-BEIGE-M')$$, $$VALUES (0, 0)$$, 'el polo que faltó NO se reingresa (sigue 0: es de E)');
SELECT results_eq(format($q$SELECT v.sku, m.quantity_change FROM public.inventory_movements m JOIN public.variants v ON v.id = m.variant_id
                             WHERE m.reference_id = %L AND m.movement_type = 'cancel_restore'$q$, (SELECT id FROM t_d)),
                  $$VALUES ('JM-SHI-001-BLANCO-M', 2)$$, 'un solo movimiento de reingreso: la línea vendida');
SELECT results_eq(format($q$SELECT amount, reason, restock, requested_by FROM public.order_refunds WHERE order_id = %L$q$, (SELECT id FROM t_d)),
                  format($q$VALUES (%s::bigint, 'Sin polo para reponer: reembolsado en Wompi', true, %L::uuid)$q$, (SELECT total FROM t_d), tests.uid('admin')),
                  'reembolso registrado por el total con el motivo y el admin');
SELECT results_eq(format($q$SELECT event_type, note, metadata ->> 'previous_status', metadata ->> 'refunded' FROM public.order_events
                             WHERE order_id = %L AND event_type IN ('STATUS_CHANGED', 'ATTENTION_RESOLVED') AND (to_status = 'refunded' OR event_type = 'ATTENTION_RESOLVED')
                             ORDER BY event_type DESC$q$, (SELECT id FROM t_d)),
                  $$VALUES ('STATUS_CHANGED', 'Sin polo para reponer: reembolsado en Wompi', NULL, NULL),
                           ('ATTENTION_RESOLVED', 'Sin polo para reponer: reembolsado en Wompi', 'paid', 'true')$$,
                  'historial: cambio a reembolsado y cierre de la revisión con el mismo motivo');
-- Segunda vez (otro admin a la vez): ya no está en revisión; no se duplica el reembolso
SELECT is(tests.exec_as('superadmin', format('SELECT public.admin_refund_order_attention(%L, %L) AS r', (SELECT id FROM t_d), 'otra vez')) ->> 'hint',
          'JM_ATTENTION_NOT_REQUIRED', 'ya revisado: se informa');
SELECT is((SELECT count(*)::int FROM public.order_refunds WHERE order_id = (SELECT id FROM t_d)), 1, 'un solo reembolso registrado');

SELECT * FROM finish();
ROLLBACK;
