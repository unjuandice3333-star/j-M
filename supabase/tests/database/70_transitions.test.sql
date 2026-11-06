-- 70 · Máquina de estados: transiciones válidas e inválidas, actores, notas y guía
BEGIN;
\ir _helpers.psql
SELECT plan(26);

CREATE FUNCTION pg_temp.paid(p_key text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE att jsonb;
BEGIN
  PERFORM tests.exec_as('c2', tests.order_sql(tests.items('JM-JEA-001-AZUL-INDIGO-32', '1'), p_key));
  att := tests.attempt(p_key);
  PERFORM tests.apply(tests.wompi_event(att ->> 'reference', 'APPROVED', (att ->> 'amount_in_cents')::bigint, 'tx-' || p_key), 'chk-' || p_key);
  RETURN (SELECT id FROM public.online_orders WHERE idempotency_key = p_key);
END $$;

CREATE FUNCTION pg_temp.tr(p_who text, p_order uuid, p_to text, p_note text DEFAULT NULL, p_tracking jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT tests.exec_as(p_who, format('SELECT public.admin_transition_order(%L::uuid, %L::public.order_status, %L, %L::jsonb) AS r',
                                     p_order, p_to, p_note, p_tracking))
$$;

-- Catálogo expuesto al frontend
SELECT is(jsonb_array_length(tests.val(tests.exec_as('anon', 'SELECT public.get_order_status_catalog() AS r')) -> 'statuses'), 8,
          'catálogo público: 8 estados');
SELECT is(jsonb_array_length(tests.val(tests.exec_as('anon', 'SELECT public.get_order_status_catalog() AS r')) -> 'transitions'), 13,
          'catálogo público: 13 transiciones');
SELECT is(tests.val(tests.exec_as('anon', 'SELECT public.get_order_status_catalog() AS r')) #>> '{statuses,2,label}', 'En preparación',
          'etiqueta de processing = "En preparación" (sustituye a preparing)');

-- Pedido pendiente
SELECT tests.exec_as('c1', tests.order_sql(tests.items('JM-JEA-001-AZUL-INDIGO-32', '1'), 'test-70-pending'));
CREATE TEMP TABLE t_p AS SELECT id FROM public.online_orders WHERE idempotency_key = 'test-70-pending';
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_p), 'paid') ->> 'hint', 'JM_INVALID_TRANSITION', 'admin no puede marcar pagado (solo webhook)');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_p), 'shipped') ->> 'hint', 'JM_INVALID_TRANSITION', 'payment_pending → shipped: inválida');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_p), 'processing') ->> 'hint', 'JM_INVALID_TRANSITION', 'payment_pending → processing: inválida');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_p), 'expired') ->> 'hint', 'JM_INVALID_TRANSITION', 'admin no puede vencer pedidos (solo system)');
SELECT is(pg_temp.tr('c1', (SELECT id FROM t_p), 'cancelled', 'x') ->> 'sqlstate', '42501', 'un cliente no puede usar admin_transition_order');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_p), 'cancelled') ->> 'hint', 'JM_NOTE_REQUIRED', 'admin cancela pendiente: nota obligatoria');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_p), 'cancelled', 'Duplicado') ->> 'ok', 'true', 'admin cancela pendiente con nota');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_p), 'processing') ->> 'hint', 'JM_INVALID_TRANSITION', 'cancelled es terminal');

-- Camino feliz completo
CREATE TEMP TABLE t_h AS SELECT pg_temp.paid('test-70-happy') AS id;
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_h), 'delivered') ->> 'hint', 'JM_INVALID_TRANSITION', 'paid → delivered: inválida (sin saltos)');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_h), 'processing') ->> 'ok', 'true', 'paid → processing');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_h), 'shipped') ->> 'hint', 'JM_TRACKING_REQUIRED', 'processing → shipped exige guía');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_h), 'shipped', NULL, '{"carrier":"Coordinadora","tracking_number":"123456"}') ->> 'ok', 'true',
          'processing → shipped con guía');
SELECT results_eq($$SELECT carrier, tracking_number, shipped_at IS NOT NULL FROM public.online_orders WHERE id = (SELECT id FROM t_h)$$,
                  $$VALUES ('Coordinadora'::text, '123456'::text, true)$$, 'guía y fecha de envío persistidas');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_h), 'processing') ->> 'hint', 'JM_INVALID_TRANSITION', 'shipped → processing: inválida (no retrocede)');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_h), 'delivered') ->> 'ok', 'true', 'shipped → delivered');
SELECT isnt((SELECT delivered_at FROM public.online_orders WHERE id = (SELECT id FROM t_h)), NULL, 'delivered_at asignado');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_h), 'cancelled', 'x') ->> 'hint', 'JM_INVALID_TRANSITION', 'delivered → cancelled: inválida');
SELECT is(pg_temp.tr('admin', (SELECT id FROM t_h), 'refunded') ->> 'hint', 'JM_NOTE_REQUIRED', 'delivered → refunded exige nota');

-- Línea de tiempo auditada
SELECT results_eq($$SELECT from_status::text, to_status::text, actor::text FROM public.order_events
                     WHERE order_id = (SELECT id FROM t_h) AND event_type = 'STATUS_CHANGED' ORDER BY created_at$$,
                  $$VALUES ('payment_pending'::text, 'paid'::text, 'webhook'::text), ('paid', 'processing', 'admin'),
                           ('processing', 'shipped', 'admin'), ('shipped', 'delivered', 'admin')$$,
                  'eventos de estado con actor (webhook y admin)');
SELECT is((SELECT count(*)::int FROM public.order_events WHERE order_id = (SELECT id FROM t_h) AND event_type = 'STATUS_CHANGED'
             AND actor = 'admin' AND actor_user_id = tests.uid('admin')), 3, 'acciones admin registran el usuario');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''processing'') AS r', gen_random_uuid())) ->> 'hint',
          'JM_ORDER_NOT_FOUND', 'pedido inexistente');

-- Pedido público: token correcto vs incorrecto
CREATE TEMP TABLE t_pub AS SELECT order_number, public_token FROM public.online_orders WHERE id = (SELECT id FROM t_h);
SELECT is(tests.val(tests.exec_as('anon', format('SELECT public.get_order_public(%L, %L::uuid) AS r',
          (SELECT order_number FROM t_pub), (SELECT public_token FROM t_pub)))) ->> 'status', 'delivered',
          'get_order_public con token correcto devuelve el estado');
SELECT ok(tests.val(tests.exec_as('anon', format('SELECT public.get_order_public(%L, %L::uuid) AS r',
          (SELECT order_number FROM t_pub), gen_random_uuid()))) = 'null'::jsonb,
          'get_order_public con token falso no devuelve nada (ni confirma que el número exista)');

SELECT * FROM finish();
ROLLBACK;
