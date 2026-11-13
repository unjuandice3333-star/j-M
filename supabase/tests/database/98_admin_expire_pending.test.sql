-- 98 · Vencimiento de pedidos desde el panel del admin (ejecución 122).
BEGIN;
\ir _helpers.psql
SELECT plan(11);

SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-POL-001-BEIGE-M', '1'), 'test-98-a', NULL, 'comprador.98@qa.jm.test')) ->> 'ok')::boolean,
          'un invitado reserva la última unidad');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-POL-001-BEIGE-M')$$, $$VALUES (1, 1)$$, '1 reservada');

-- Permisos: solo administradores
SELECT is(tests.exec_as('anon', 'SELECT public.admin_expire_pending_orders() AS n') ->> 'sqlstate', '42501', 'anon no puede');
SELECT is(tests.exec_as('c1', 'SELECT public.admin_expire_pending_orders() AS n') ->> 'hint', 'JM_FORBIDDEN', 'un cliente no puede');

-- Dentro de la ventana no se toca
SELECT is(tests.val(tests.exec_as('admin', 'SELECT public.admin_expire_pending_orders() AS n'))::int, 0,
          'admin: un pedido vigente no se vence');
SELECT is((SELECT status::text FROM public.online_orders WHERE idempotency_key = 'test-98-a'), 'payment_pending', 'sigue pendiente');

-- Ventana cumplida: el admin lo vence y libera la reserva
UPDATE public.online_orders SET payment_expires_at = now() - interval '1 second' WHERE idempotency_key = 'test-98-a';
SELECT is(tests.val(tests.exec_as('admin', 'SELECT public.admin_expire_pending_orders() AS n'))::int, 1, 'admin vence 1 pedido');
SELECT is((SELECT status::text FROM public.online_orders WHERE idempotency_key = 'test-98-a'), 'expired', 'pedido pasa a expired');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-POL-001-BEIGE-M')$$, $$VALUES (1, 0)$$, 'reserva liberada');
SELECT is((SELECT actor FROM public.order_events e JOIN public.online_orders o ON o.id = e.order_id
            WHERE o.idempotency_key = 'test-98-a' AND e.to_status = 'expired'), 'system', 'evento registrado como del sistema');
-- Idempotente
SELECT is(tests.val(tests.exec_as('superadmin', 'SELECT public.admin_expire_pending_orders() AS n'))::int, 0, 'segunda llamada: 0');

SELECT * FROM finish();
ROLLBACK;
