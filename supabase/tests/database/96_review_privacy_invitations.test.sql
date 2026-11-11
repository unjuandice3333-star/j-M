-- 96 · Reseñas: columnas públicas sin identificadores internos + my_review_invitations (ejecución 72).
-- Seeds: c1 tiene O1 entregado (camiseta c001 + jean c003), O2 en preparación (camisa c002) y O7 reembolsado
-- (tenis c004); c2 tiene O3 pagado (camiseta c001) y O6 cancelado (jean c003).
BEGIN;
\ir _helpers.psql
SELECT plan(17);

CREATE FUNCTION pg_temp.err(p_who text, p_sql text) RETURNS text LANGUAGE sql AS $$ SELECT tests.exec_as(p_who, p_sql) ->> 'sqlstate' $$;
CREATE FUNCTION pg_temp.inv(p_who text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT tests.val(tests.exec_as(p_who, 'SELECT public.my_review_invitations()')) $$;

\set tee '''00000000-0000-4000-8000-00000000c001'''
\set jea '''00000000-0000-4000-8000-00000000c003'''

-- Columnas públicas: lo que la tienda muestra sí; identificadores internos no (ni para anon ni para clientes)
SELECT is(tests.nrows(tests.exec_as('anon', $$SELECT id, product_id, author_name, city, rating, title, comment,
                                                      is_verified_buyer, status, admin_reply, created_at
                                                 FROM public.product_reviews$$)), 2, 'anon lee las columnas públicas de las aprobadas');
SELECT is(pg_temp.err('anon', 'SELECT user_id FROM public.product_reviews'), '42501', 'anon no lee user_id');
SELECT is(pg_temp.err('anon', 'SELECT order_item_id FROM public.product_reviews'), '42501', 'anon no lee order_item_id');
SELECT is(pg_temp.err('anon', 'SELECT moderated_by FROM public.product_reviews'), '42501', 'anon no lee moderated_by');
SELECT is(pg_temp.err('c1', 'SELECT user_id FROM public.product_reviews'), '42501', 'cliente no lee user_id');
SELECT is(pg_temp.err('anon', 'SELECT * FROM public.product_reviews'), '42501', 'SELECT * no sirve para filtrar columnas ocultas');
SELECT is(pg_temp.err('anon', format('SELECT id FROM public.product_reviews WHERE user_id = %L', tests.uid('c1'))), '42501',
          'anon no puede filtrar por user_id (sin oráculo de autoría)');
-- La consulta de /admin/reviews sigue funcionando y la moderación también
SELECT is(tests.nrows(tests.exec_as('admin', $$SELECT r.id, r.status, r.admin_reply, p.name, p.slug
                                                  FROM public.product_reviews r JOIN public.products p ON p.id = r.product_id$$)), 4,
          'el admin lista todas las reseñas con las columnas de su página');
SELECT ok((tests.exec_as('admin', $$UPDATE public.product_reviews SET status = 'approved', admin_reply = 'Gracias por tu compra',
                                       moderated_by = '00000000-0000-4000-8000-00000000a002', moderated_at = now()
                                     WHERE id = '00000000-0000-4000-8000-00000000e003' RETURNING id$$) ->> 'ok')::boolean,
          'el admin modera (aprueba con respuesta)');
SELECT is(tests.val(tests.exec_as('anon', $$SELECT admin_reply FROM public.product_reviews WHERE id = '00000000-0000-4000-8000-00000000e003'$$)),
          '"Gracias por tu compra"'::jsonb, 'la respuesta del admin es pública en la reseña aprobada');
SELECT is(pg_temp.err('c1', $$UPDATE public.product_reviews SET admin_reply = 'X' RETURNING id$$), NULL,
          'cliente: UPDATE no falla por privilegio pero la RLS no le deja tocar filas');
SELECT is(tests.nrows(tests.exec_as('c1', $$UPDATE public.product_reviews SET admin_reply = 'X' RETURNING id$$)), 0,
          'cliente no modifica ninguna reseña');

-- Invitaciones a opinar
SELECT is(pg_temp.err('anon', 'SELECT public.my_review_invitations()'), '42501', 'anon no consulta invitaciones');
SELECT is((SELECT jsonb_agg(e ->> 'slug' ORDER BY e ->> 'slug') FROM jsonb_array_elements(pg_temp.inv('c1')) e),
          (SELECT jsonb_agg(slug ORDER BY slug) FROM public.products WHERE id IN (:tee, :jea)),
          'c1: solo los productos del pedido entregado (no en preparación ni reembolsado)');
SELECT is(jsonb_array_length(pg_temp.inv('c2')), 0, 'c2: pedido pagado sin entregar → sin invitaciones');
SELECT tests.exec_as('c1', format('SELECT public.submit_product_review(%L, 5, %L, %L)',
  (SELECT i.id FROM public.online_order_items i JOIN public.online_orders o ON o.id = i.order_id
    WHERE o.idempotency_key = 'qa-seed-order-01' AND i.product_id = :tee), 'Genial', 'La tela es excelente.'));
SELECT is((SELECT jsonb_agg(e ->> 'product_id') FROM jsonb_array_elements(pg_temp.inv('c1')) e),
          jsonb_build_array(:jea), 'tras opinar sobre la camiseta solo queda el jean');
UPDATE public.products SET status = 'archived' WHERE id = :jea;
SELECT is(jsonb_array_length(pg_temp.inv('c1')), 0, 'producto archivado → sin invitación');

SELECT * FROM finish();
