-- 93 · Boletín desde «Mi cuenta»: my_newsletter_subscription / set_my_newsletter_subscription (ejecución 70).
BEGIN;
\ir _helpers.psql
SELECT plan(20);

CREATE FUNCTION pg_temp.hint(p_who text, p_sql text) RETURNS text LANGUAGE sql AS $$ SELECT tests.exec_as(p_who, p_sql) ->> 'hint' $$;
CREATE FUNCTION pg_temp.err(p_who text, p_sql text) RETURNS text LANGUAGE sql AS $$ SELECT tests.exec_as(p_who, p_sql) ->> 'sqlstate' $$;
CREATE FUNCTION pg_temp.st(p_who text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT tests.val(tests.exec_as(p_who, 'SELECT public.my_newsletter_subscription()')) $$;
CREATE FUNCTION pg_temp.set(p_who text, p_on boolean) RETURNS jsonb LANGUAGE sql AS $$
  SELECT tests.val(tests.exec_as(p_who, format('SELECT public.set_my_newsletter_subscription(%L)', p_on))) $$;
CREATE FUNCTION pg_temp.row_active(p_email text) RETURNS boolean LANGUAGE sql AS $$
  SELECT unsubscribed_at IS NULL FROM public.newsletter_subscribers WHERE email_normalized = p_email $$;

-- Permisos
SELECT is(pg_temp.err('anon', 'SELECT public.my_newsletter_subscription()'), '42501', 'anon no consulta el estado');
SELECT is(pg_temp.err('anon', 'SELECT public.set_my_newsletter_subscription(false)'), '42501', 'anon no da de baja');

-- Estado inicial: sin fila y sin consentimiento
SELECT is(pg_temp.st('c1') -> 'email', '"cliente1@qa.jm.test"'::jsonb, 'el estado usa el correo de la cuenta');
SELECT is(pg_temp.st('c1') -> 'subscribed', 'false'::jsonb, 'sin fila ni consentimiento → no suscrito');
SELECT is(pg_temp.st('c1') -> 'on_list', 'false'::jsonb, 'sin fila → on_list false');

-- Consentimiento antiguo del perfil sin fila → se muestra como suscrito
UPDATE public.profiles SET marketing_opt_in = true WHERE id = tests.uid('c2');
SELECT is(pg_temp.st('c2') -> 'subscribed', 'true'::jsonb, 'marketing_opt_in previo sin fila → suscrito');

-- Alta desde la cuenta
SELECT is(pg_temp.set('c1', true) -> 'subscribed', 'true'::jsonb, 'el cliente se suscribe desde su cuenta');
SELECT is((SELECT source || '|' || user_id::text FROM public.newsletter_subscribers WHERE email_normalized = 'cliente1@qa.jm.test'),
          'account|' || tests.uid('c1')::text, 'fila con origen account ligada al usuario');
SELECT ok((SELECT marketing_opt_in FROM public.profiles WHERE id = tests.uid('c1')), 'alta sincroniza marketing_opt_in');
SELECT is(pg_temp.set('c1', true) -> 'on_list', 'true'::jsonb, 'repetir el alta es idempotente');
SELECT is((SELECT count(*)::int FROM public.newsletter_subscribers WHERE email_normalized = 'cliente1@qa.jm.test'), 1, 'una sola fila');

-- Baja desde la cuenta (también de una suscripción hecha en la portada con otra capitalización)
SELECT tests.exec_as('anon', $q$SELECT public.subscribe_newsletter(' Cliente2@QA.jm.test ')$q$);
SELECT is(pg_temp.set('c2', false) -> 'subscribed', 'false'::jsonb, 'el cliente se da de baja del boletín de la portada');
SELECT is(pg_temp.row_active('cliente2@qa.jm.test'), false, 'la fila de la portada queda dada de baja (no se borra)');
SELECT is((SELECT marketing_opt_in FROM public.profiles WHERE id = tests.uid('c2')), false, 'baja sincroniza marketing_opt_in');
SELECT is(pg_temp.set('c2', true) -> 'subscribed', 'true'::jsonb, 'volver a suscribirse reactiva la fila');

-- Solo el correo propio: un correo ajeno que c1 escribió en la portada (user_id = c1) no se toca
SELECT tests.exec_as('c1', $q$SELECT public.subscribe_newsletter('ajeno@example.co')$q$);
SELECT tests.exec_as('c1', 'SELECT public.set_my_newsletter_subscription(false)');
SELECT is(pg_temp.row_active('ajeno@example.co'), true, 'la baja no afecta correos ajenos ligados al usuario');
SELECT is(pg_temp.row_active('cliente2@qa.jm.test'), true, 'la baja de c1 no afecta a c2');

-- Correo sin confirmar → no gestiona el boletín
UPDATE auth.users SET email_confirmed_at = NULL WHERE id = tests.uid('c2');
SELECT is(pg_temp.hint('c2', 'SELECT public.set_my_newsletter_subscription(false)'), 'JM_EMAIL_UNCONFIRMED',
          'correo sin confirmar → JM_EMAIL_UNCONFIRMED');
SELECT is(pg_temp.row_active('cliente2@qa.jm.test'), true, 'sin confirmar no se da de baja');
SELECT is(pg_temp.hint('c1', 'SELECT public.set_my_newsletter_subscription(NULL)'), 'JM_INVALID_INPUT', 'valor nulo → JM_INVALID_INPUT');

SELECT * FROM finish();
ROLLBACK;
