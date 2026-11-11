-- 92 · Boletín: subscribe_newsletter (anon/cliente), idempotencia, validación, límite y RLS de newsletter_subscribers.
BEGIN;
\ir _helpers.psql
SELECT plan(16);

CREATE FUNCTION pg_temp.n(p_who text, p_sql text) RETURNS int LANGUAGE sql AS $$ SELECT tests.nrows(tests.exec_as(p_who, p_sql)) $$;
CREATE FUNCTION pg_temp.err(p_who text, p_sql text) RETURNS text LANGUAGE sql AS $$ SELECT tests.exec_as(p_who, p_sql) ->> 'sqlstate' $$;
CREATE FUNCTION pg_temp.hint(p_who text, p_sql text) RETURNS text LANGUAGE sql AS $$ SELECT tests.exec_as(p_who, p_sql) ->> 'hint' $$;

SELECT is(tests.val(tests.exec_as('anon', $q$SELECT public.subscribe_newsletter('  Ana.Club@Example.co ')$q$)) -> 'ok',
          'true'::jsonb, 'anon se suscribe');
SELECT is((SELECT email_normalized FROM public.newsletter_subscribers WHERE email_normalized = 'ana.club@example.co'),
          'ana.club@example.co', 'el correo se guarda normalizado (minúsculas, sin espacios)');
SELECT is(tests.val(tests.exec_as('anon', $q$SELECT public.subscribe_newsletter('ANA.CLUB@example.co')$q$)) -> 'ok',
          'true'::jsonb, 'repetir la suscripción responde igual (no revela si ya existía)');
SELECT is((SELECT count(*)::int FROM public.newsletter_subscribers WHERE email_normalized = 'ana.club@example.co'), 1,
          'idempotente: una sola fila por correo');
SELECT is(pg_temp.hint('anon', $q$SELECT public.subscribe_newsletter('no-es-correo')$q$), 'JM_INVALID_EMAIL',
          'correo inválido → JM_INVALID_EMAIL');
SELECT is(pg_temp.hint('anon', $q$SELECT public.subscribe_newsletter(NULL)$q$), 'JM_INVALID_EMAIL', 'correo nulo → JM_INVALID_EMAIL');

-- Cliente autenticado: queda asociado a su usuario
SELECT is(tests.val(tests.exec_as('c1', $q$SELECT public.subscribe_newsletter('cliente1.club@example.co', 'footer')$q$)) -> 'ok',
          'true'::jsonb, 'el cliente se suscribe');
SELECT is((SELECT user_id FROM public.newsletter_subscribers WHERE email_normalized = 'cliente1.club@example.co'), tests.uid('c1'),
          'la suscripción del cliente queda ligada a su usuario');
SELECT is((SELECT source FROM public.newsletter_subscribers WHERE email_normalized = 'cliente1.club@example.co'), 'footer',
          'se guarda el origen');

-- RLS
SELECT is(pg_temp.err('anon', 'SELECT id FROM public.newsletter_subscribers'), '42501', 'anon no lee suscriptores');
SELECT is(pg_temp.err('anon', $q$INSERT INTO public.newsletter_subscribers (email) VALUES ('x@y.co') RETURNING id$q$), '42501',
          'anon no inserta directamente');
SELECT is(pg_temp.n('c1', 'SELECT id FROM public.newsletter_subscribers'), 0, 'el cliente no ve suscriptores (ni el suyo)');
SELECT is(pg_temp.n('admin', 'SELECT id FROM public.newsletter_subscribers'), 2, 'el admin ve todos los suscriptores');
SELECT is(pg_temp.n('admin', $q$UPDATE public.newsletter_subscribers SET unsubscribed_at = now()
                                WHERE email_normalized = 'ana.club@example.co' RETURNING id$q$), 1, 'el admin da de baja');

-- Reactivación tras la baja
SELECT tests.exec_as('anon', $q$SELECT public.subscribe_newsletter('ana.club@example.co')$q$);
SELECT ok((SELECT unsubscribed_at IS NULL FROM public.newsletter_subscribers WHERE email_normalized = 'ana.club@example.co'),
          'volver a suscribirse reactiva la baja');

-- Límite: 30 altas nuevas por minuto
INSERT INTO public.newsletter_subscribers (email) SELECT format('lote%s@example.co', g) FROM generate_series(1, 30) g;
SELECT is(pg_temp.hint('anon', $q$SELECT public.subscribe_newsletter('uno.mas@example.co')$q$), 'JM_RATE_LIMITED',
          'más de 30 altas en un minuto → JM_RATE_LIMITED');

SELECT * FROM finish();
ROLLBACK;
