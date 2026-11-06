-- 95 · Concurrencia REAL con dos conexiones independientes (dblink).
-- A diferencia de las demás pruebas, las conexiones A y B hacen COMMIT: ejecutar al final
-- (orden alfabético de `supabase test db`) y siempre tras `supabase db reset` / run_local.sh.
--
-- Infraestructura de la prueba (M24D, H2), autocontenida y versionada aquí:
--   * habilita dblink (idempotente);
--   * crea un rol de prueba efímero `jm_test_concurrency` con contraseña ALEATORIA generada
--     en la propia prueba (sin credenciales fijas ni cambios manuales) y lo elimina al final;
--   * las conexiones A y B usan ese rol: como compradores con SET ROLE anon y como webhook
--     con SET ROLE service_role (igual que la función de Vercel).
-- Por qué: en Supabase `postgres` no es superusuario y dblink exige que el servidor solicite
-- contraseña. Por eso se conecta a la dirección de red del propio servidor (inet_server_addr(),
-- cubierta por scram-sha-256 en pg_hba). En PostgreSQL local (run_local.sh), donde la sesión
-- llega por socket y es superusuario, se usa el socket.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TEMP TABLE t_infra AS SELECT encode(extensions.gen_random_bytes(24), 'hex') AS password;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jm_test_concurrency') THEN
    DROP ROLE jm_test_concurrency;   -- restos de una ejecución interrumpida
  END IF;
  EXECUTE format('CREATE ROLE jm_test_concurrency LOGIN NOINHERIT PASSWORD %L', (SELECT password FROM t_infra));
  GRANT anon, service_role TO jm_test_concurrency;
END $$;
CREATE TEMP TABLE t_conn AS
SELECT format('dbname=%s host=%s port=%s user=jm_test_concurrency password=%s', current_database(),
              COALESCE(host(inet_server_addr()), split_part(current_setting('unix_socket_directories'), ',', 1)),
              current_setting('port'), (SELECT password FROM t_infra)) AS c;

BEGIN;
\ir _helpers.psql
SELECT plan(12);

-- La única unidad del polo (P5) debe estar disponible al empezar
SELECT results_eq($$SELECT stock - reserved FROM tests.stock('JM-POL-001-BEIGE-M')$$, ARRAY[1], 'precondición: 1 unidad disponible');

SELECT dblink_connect('a', (SELECT c FROM t_conn));
SELECT dblink_connect('b', (SELECT c FROM t_conn));
SELECT dblink_exec('a', 'SET ROLE anon');
SELECT dblink_exec('b', 'SET ROLE anon');

-- ===================== 1. Dos compradores, una unidad =====================
SELECT dblink_exec('a', 'BEGIN');
SELECT ok((SELECT r IS NOT NULL FROM dblink('a', format('SELECT public.create_order(%L::jsonb, %L::jsonb, %L::jsonb, NULL, ''standard'', ''conc-buyer-a'')::text',
            tests.customer('a@qa.jm.test'), tests.shipping(), tests.items('JM-POL-001-BEIGE-M', '1'))) AS t(r text)),
          'A crea su pedido dentro de una transacción abierta (bloquea la fila de inventario)');

SELECT is(dblink_send_query('b', format('SELECT public.create_order(%L::jsonb, %L::jsonb, %L::jsonb, NULL, ''standard'', ''conc-buyer-b'')::text',
            tests.customer('b@qa.jm.test'), tests.shipping(), tests.items('JM-POL-001-BEIGE-M', '1'))), 1,
          'B envía su pedido en paralelo');
SELECT pg_sleep(1);
SELECT is(dblink_is_busy('b'), 1, 'B queda en espera del bloqueo de A (no lee un stock obsoleto)');

SELECT dblink_exec('a', 'COMMIT');
SELECT pg_sleep(0.5);
SELECT is(dblink_is_busy('b'), 0, 'B continúa al confirmar A');
CREATE TEMP TABLE t_b AS SELECT * FROM dblink_get_result('b', false) AS t(r text);
SELECT is(dblink_error_message('b') ~ 'Stock insuficiente', true, 'B recibe "Stock insuficiente" tras el commit de A');
SELECT * FROM dblink_get_result('b', false) AS t(r text);   -- vacía la cola de resultados de B

SELECT results_eq($$SELECT idempotency_key FROM public.online_orders WHERE idempotency_key LIKE 'conc-buyer-%'$$,
                  ARRAY['conc-buyer-a'], 'existe un solo pedido (el de A)');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-POL-001-BEIGE-M')$$, $$VALUES (1, 1)$$,
                  'stock 1, reservada 1: sin sobreventa');

-- ===================== 2. Webhook entregado dos veces en paralelo =====================
CREATE TEMP TABLE t_att AS SELECT tests.attempt('conc-buyer-a') AS att;
COMMIT;   -- el intento debe ser visible para las conexiones A y B
BEGIN;
SET LOCAL search_path = public, extensions;
SELECT dblink_exec('a', 'SET ROLE service_role');   -- el webhook corre con service_role (Vercel)
SELECT dblink_exec('b', 'SET ROLE service_role');
CREATE TEMP TABLE t_ev AS SELECT tests.wompi_event((SELECT att ->> 'reference' FROM t_att), 'APPROVED',
                                                   (SELECT (att ->> 'amount_in_cents')::bigint FROM t_att), 'tx-conc-1') AS ev;
SELECT dblink_exec('a', 'BEGIN');
SELECT ok((SELECT r::jsonb ->> 'result' = 'applied' FROM dblink('a',
            format('SELECT public.apply_payment_event(%L::jsonb, ''chk-conc-1'')::text', (SELECT ev FROM t_ev))) AS t(r text)),
          'A procesa el evento (transacción abierta)');
SELECT dblink_send_query('b', format('SELECT public.apply_payment_event(%L::jsonb, ''chk-conc-1'')::text', (SELECT ev FROM t_ev)));
SELECT pg_sleep(1);
SELECT dblink_exec('a', 'COMMIT');
SELECT is((SELECT r::jsonb ->> 'result' FROM dblink_get_result('b') AS t(r text)), 'duplicate',
          'B, con el mismo evento en paralelo, obtiene "duplicate"');
SELECT results_eq($$SELECT o.status::text, (SELECT count(*)::int FROM public.inventory_movements m WHERE m.reference_id = o.id)
                     FROM public.online_orders o WHERE o.idempotency_key = 'conc-buyer-a'$$,
                  $$VALUES ('paid'::text, 1)$$, 'pedido pagado una sola vez con un solo movimiento de venta');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-POL-001-BEIGE-M')$$, $$VALUES (0, 0)$$, 'stock final 0, sin negativos');

SELECT dblink_disconnect('a');
SELECT dblink_disconnect('b');
SELECT * FROM finish();
ROLLBACK;
DROP ROLE IF EXISTS jm_test_concurrency;
