-- 30 · Reserva de inventario (30 min), disponibilidad y expiración
BEGIN;
\ir _helpers.psql
SELECT plan(19);

SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-POL-001-BEIGE-M')$$, $$VALUES (1, 0)$$,
                  'estado inicial: 1 unidad, 0 reservadas');

SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-POL-001-BEIGE-M', '1'), 'test-30-a', NULL, 'comprador.a@qa.jm.test')) ->> 'ok')::boolean,
          'comprador A reserva la última unidad');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-POL-001-BEIGE-M')$$, $$VALUES (1, 1)$$,
                  'stock físico intacto y 1 reservada');
SELECT results_eq($$SELECT va.available FROM public.v_variant_availability va JOIN public.variants v ON v.id = va.variant_id
                     WHERE v.sku = 'JM-POL-001-BEIGE-M'$$, ARRAY[0], 'disponibilidad pública = 0');
SELECT results_eq($$SELECT r.status::text, r.quantity FROM public.inventory_reservations r JOIN public.online_orders o ON o.id = r.order_id
                     WHERE o.idempotency_key = 'test-30-a'$$, $$VALUES ('active'::text, 1)$$, 'reserva activa registrada');
SELECT is(tests.exec_as('anon', tests.order_sql(tests.items('JM-POL-001-BEIGE-M', '1'), 'test-30-b', NULL, 'comprador.b@qa.jm.test')) ->> 'hint',
          'JM_OUT_OF_STOCK', 'comprador B no puede comprar una unidad reservada');

-- Expiración: un pedido aún vigente no se toca
SELECT is(tests.val(tests.exec_as('service', 'SELECT public.expire_pending_orders() AS n'))::int, 0,
          'expire_pending_orders no afecta pedidos dentro de la ventana');

-- Vence la ventana
UPDATE public.online_orders SET payment_expires_at = now() - interval '1 second' WHERE idempotency_key = 'test-30-a';
SELECT is(tests.val(tests.exec_as('service', 'SELECT public.expire_pending_orders() AS n'))::int, 1,
          'expire_pending_orders vence 1 pedido');
SELECT is((SELECT status::text FROM public.online_orders WHERE idempotency_key = 'test-30-a'), 'expired', 'pedido pasa a expired');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-POL-001-BEIGE-M')$$, $$VALUES (1, 0)$$,
                  'reserva liberada: 1 unidad disponible otra vez');
SELECT is((SELECT r.status::text FROM public.inventory_reservations r JOIN public.online_orders o ON o.id = r.order_id
            WHERE o.idempotency_key = 'test-30-a'), 'expired', 'reserva marcada expired');
SELECT is((SELECT count(*)::int FROM public.inventory_movements m JOIN public.online_orders o ON o.id = m.reference_id
            WHERE o.idempotency_key = 'test-30-a'), 0, 'reservar/expirar no genera movimientos de stock físico');
SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-POL-001-BEIGE-M', '1'), 'test-30-c', NULL, 'comprador.b@qa.jm.test')) ->> 'ok')::boolean,
          'tras la expiración, comprador B sí puede reservar');

-- Pagos sobre pedidos vencidos o fuera de ventana
SELECT is(tests.exec_as('service', format('SELECT public.create_payment_attempt(%L::uuid, %L::uuid) AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-30-a'),
          (SELECT public_token FROM public.online_orders WHERE idempotency_key = 'test-30-a'))) ->> 'hint',
          'JM_ORDER_NOT_PAYABLE', 'no se crean intentos de pago para pedidos vencidos');
UPDATE public.online_orders SET payment_expires_at = now() - interval '1 second' WHERE idempotency_key = 'test-30-c';
SELECT is(tests.exec_as('service', format('SELECT public.create_payment_attempt(%L::uuid, %L::uuid) AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-30-c'),
          (SELECT public_token FROM public.online_orders WHERE idempotency_key = 'test-30-c'))) ->> 'hint',
          'JM_PAYMENT_WINDOW_EXPIRED', 'no se crean intentos fuera de la ventana aunque el job no haya corrido');
SELECT is(tests.exec_as('service', format('SELECT public.create_payment_attempt(%L::uuid, %L::uuid) AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-30-c'), gen_random_uuid())) ->> 'hint',
          'JM_ORDER_NOT_FOUND', 'token público incorrecto: pedido no encontrado');

-- Permisos y programación
SELECT is(tests.exec_as('anon', 'SELECT public.expire_pending_orders() AS n') ->> 'sqlstate', '42501',
          'anon no puede ejecutar expire_pending_orders');
SELECT is(tests.exec_as('c1', 'SELECT public.expire_pending_orders() AS n') ->> 'sqlstate', '42501',
          'cliente no puede ejecutar expire_pending_orders');
-- Consulta dinámica: con `cron.job` escrito literalmente, la sentencia falla al analizarse en una BD sin pg_cron
-- aunque la rama no se ejecute (ejecución 134).
CREATE FUNCTION pg_temp.jm_cron_job_ok() RETURNS boolean LANGUAGE plpgsql AS $f$
DECLARE r boolean;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN true; END IF;
  EXECUTE $q$SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'jm-expire-pending-orders' AND schedule = '*/5 * * * *')$q$ INTO r;
  RETURN r;
END $f$;
SELECT ok(pg_temp.jm_cron_job_ok(),
          'job pg_cron de expiración programado cada 5 minutos (si pg_cron está disponible)');

SELECT * FROM finish();
ROLLBACK;
