-- 94 · Reseñas escritas por el cliente: my_product_reviewables / submit_product_review (ejecución 71).
-- Seeds: c1 tiene O1 entregado (camiseta c001 + jean c003), O2 en preparación (camisa c002) y O7 reembolsado
-- (tenis c004); c2 tiene O3 pagado (camiseta c001) y O6 cancelado (jean c003).
BEGIN;
\ir _helpers.psql
SELECT plan(26);

CREATE FUNCTION pg_temp.hint(p_who text, p_sql text) RETURNS text LANGUAGE sql AS $$ SELECT tests.exec_as(p_who, p_sql) ->> 'hint' $$;
CREATE FUNCTION pg_temp.err(p_who text, p_sql text) RETURNS text LANGUAGE sql AS $$ SELECT tests.exec_as(p_who, p_sql) ->> 'sqlstate' $$;
CREATE FUNCTION pg_temp.items(p_who text, p_product uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT tests.val(tests.exec_as(p_who, format('SELECT public.my_product_reviewables(%L)', p_product))) $$;
-- Artículo de un pedido sembrado para un producto
CREATE FUNCTION pg_temp.item(p_key text, p_product uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT i.id FROM public.online_order_items i JOIN public.online_orders o ON o.id = i.order_id
   WHERE o.idempotency_key = p_key AND i.product_id = p_product $$;
CREATE FUNCTION pg_temp.submit(p_item uuid, p_rating int, p_title text, p_comment text, p_city text DEFAULT NULL) RETURNS text
LANGUAGE sql AS $$
  SELECT format('SELECT public.submit_product_review(%L, %s, %L, %L, %L)', p_item, coalesce(p_rating::text, 'NULL'), p_title, p_comment, p_city) $$;

\set tee '''00000000-0000-4000-8000-00000000c001'''
\set shi '''00000000-0000-4000-8000-00000000c002'''
\set jea '''00000000-0000-4000-8000-00000000c003'''
\set sho '''00000000-0000-4000-8000-00000000c004'''

-- Permisos
SELECT is(pg_temp.err('anon', format('SELECT public.my_product_reviewables(%L)', :tee::uuid)), '42501', 'anon no consulta compras');
SELECT is(pg_temp.err('anon', pg_temp.submit(pg_temp.item('qa-seed-order-01', :tee), 5, 'Genial', 'Me encantó la tela.')), '42501',
          'anon no publica reseñas');
SELECT is(pg_temp.err('c1', $$INSERT INTO public.product_reviews (product_id, author_name, rating, title, comment, status)
                              VALUES ('00000000-0000-4000-8000-00000000c001', 'X', 5, 'Hola', 'Insert directo', 'approved') RETURNING id$$),
          '42501', 'el cliente no inserta en product_reviews directamente (RLS)');

-- Artículos reseñables: solo pedidos propios pagados o posteriores
SELECT is(jsonb_array_length(pg_temp.items('c1', :tee)), 1, 'c1: un artículo de la camiseta (O1 entregado)');
SELECT is(pg_temp.items('c1', :tee) -> 0 -> 'review', 'null'::jsonb, 'aún sin reseña');
SELECT is(jsonb_array_length(pg_temp.items('c1', :shi)), 1, 'pedido en preparación cuenta como compra');
SELECT is(jsonb_array_length(pg_temp.items('c1', :sho)), 0, 'pedido reembolsado no es reseñable');
SELECT is(jsonb_array_length(pg_temp.items('c2', :jea)), 0, 'pedido cancelado no es reseñable');
SELECT is(jsonb_array_length(pg_temp.items('c2', :shi)), 0, 'producto no comprado → lista vacía');

-- Validaciones
SELECT is(pg_temp.hint('c1', pg_temp.submit(pg_temp.item('qa-seed-order-01', :tee), 0, 'Genial', 'Me encantó la tela.')), 'JM_INVALID_INPUT', 'calificación 0 → inválida');
SELECT is(pg_temp.hint('c1', pg_temp.submit(pg_temp.item('qa-seed-order-01', :tee), NULL, 'Genial', 'Me encantó la tela.')), 'JM_INVALID_INPUT', 'sin calificación → inválida');
SELECT is(pg_temp.hint('c1', pg_temp.submit(pg_temp.item('qa-seed-order-01', :tee), 5, ' a ', 'Me encantó la tela.')), 'JM_INVALID_INPUT', 'título corto → inválido');
SELECT is(pg_temp.hint('c1', pg_temp.submit(pg_temp.item('qa-seed-order-01', :tee), 5, 'Genial', 'Corto')), 'JM_INVALID_INPUT', 'comentario corto → inválido');
SELECT is(pg_temp.hint('c1', pg_temp.submit(pg_temp.item('qa-seed-order-01', :tee), 5, 'Genial', repeat('x', 2001))), 'JM_INVALID_INPUT', 'comentario largo → inválido');

-- Solo compras propias y válidas
SELECT is(pg_temp.hint('c2', pg_temp.submit(pg_temp.item('qa-seed-order-01', :tee), 5, 'Genial', 'Me encantó la tela.')), 'JM_NOT_PURCHASED', 'c2 no reseña la compra de c1');
SELECT is(pg_temp.hint('c1', pg_temp.submit(pg_temp.item('qa-seed-order-07', :sho), 5, 'Genial', 'Me encantó el cuero.')), 'JM_NOT_PURCHASED', 'pedido reembolsado → no');
SELECT is(pg_temp.hint('c2', pg_temp.submit(pg_temp.item('qa-seed-order-06', :jea), 5, 'Genial', 'Me encantó el jean.')), 'JM_NOT_PURCHASED', 'pedido cancelado → no');

-- Alta válida: pendiente, compra verificada, nombre del perfil
SELECT is(tests.val(tests.exec_as('c1', pg_temp.submit(pg_temp.item('qa-seed-order-01', :tee), 4, '  Muy cómoda  ', '  La tela es gruesa y el corte perfecto.  ', ' Bogotá '))) ->> 'status',
          'pending', 'la reseña nace pendiente de moderación');
SELECT is((SELECT row(r.product_id, r.user_id, r.rating, r.title, r.comment, r.city, r.is_verified_buyer, r.author_name)::text
             FROM public.product_reviews r WHERE r.order_item_id = pg_temp.item('qa-seed-order-01', :tee)),
          row(:tee::uuid, tests.uid('c1'), 4, 'Muy cómoda', 'La tela es gruesa y el corte perfecto.', 'Bogotá', true, 'Cliente U.')::text,
          'fila con producto, usuario, textos recortados, compra verificada y nombre «Nombre I.»');
SELECT is(pg_temp.hint('c1', pg_temp.submit(pg_temp.item('qa-seed-order-01', :tee), 5, 'Otra vez', 'Quiero opinar de nuevo.')), 'JM_ALREADY_REVIEWED', 'una reseña por artículo comprado');
SELECT is(pg_temp.items('c1', :tee) -> 0 -> 'review' ->> 'status', 'pending', 'la lista devuelve la reseña propia pendiente');
SELECT is(tests.nrows(tests.exec_as('anon', format('SELECT id FROM public.product_reviews WHERE user_id = %L', tests.uid('c1')))), 0,
          'la reseña pendiente no es pública');
SELECT is(tests.nrows(tests.exec_as('admin', format('SELECT id FROM public.product_reviews WHERE user_id = %L', tests.uid('c1')))), 1,
          'el admin la ve para moderar');

-- Moderación existente: aprobada → pública y suma al promedio
UPDATE public.product_reviews SET status = 'approved' WHERE user_id = tests.uid('c1');
SELECT is(tests.nrows(tests.exec_as('anon', format('SELECT id FROM public.product_reviews WHERE user_id = %L AND is_verified_buyer', tests.uid('c1')))), 1,
          'aprobada → visible con compra verificada');
SELECT is(tests.val(tests.exec_as('anon', format('SELECT review_count FROM public.v_product_rating WHERE product_id = %L', :tee::uuid))), '3'::jsonb,
          'v_product_rating cuenta la nueva reseña aprobada');

-- Perfil sin nombre → nombre genérico
UPDATE public.profiles SET full_name = NULL WHERE id = tests.uid('c2');
SELECT tests.exec_as('c2', pg_temp.submit(pg_temp.item('qa-seed-order-03', :tee), 5, 'Perfecta', 'Me queda como esperaba.'));
SELECT is((SELECT author_name FROM public.product_reviews WHERE user_id = tests.uid('c2')), 'Cliente J&M', 'sin nombre en el perfil → «Cliente J&M»');

SELECT * FROM finish();
ROLLBACK;
