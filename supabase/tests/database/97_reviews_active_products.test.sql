-- 97 · Reseñas y productos retirados del catálogo (ejecución 74).
-- Seeds (ver 94): c1 tiene O1 entregado (camiseta c001 + jean c003) y O2 en preparación (camisa c002).
BEGIN;
\ir _helpers.psql
SELECT plan(8);

CREATE FUNCTION pg_temp.hint(p_who text, p_sql text) RETURNS text LANGUAGE sql AS $$ SELECT tests.exec_as(p_who, p_sql) ->> 'hint' $$;
CREATE FUNCTION pg_temp.items(p_who text, p_product uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT tests.val(tests.exec_as(p_who, format('SELECT public.my_product_reviewables(%L)', p_product))) $$;
CREATE FUNCTION pg_temp.item(p_key text, p_product uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT i.id FROM public.online_order_items i JOIN public.online_orders o ON o.id = i.order_id
   WHERE o.idempotency_key = p_key AND i.product_id = p_product $$;
CREATE FUNCTION pg_temp.submit(p_item uuid) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.submit_product_review(%L, 5, %L, %L)', p_item, 'Muy buena', 'La recomiendo, buena tela.') $$;

\set shi '''00000000-0000-4000-8000-00000000c002'''
\set jea '''00000000-0000-4000-8000-00000000c003'''

-- Estado de partida: ambos activos y reseñables
SELECT is(jsonb_array_length(pg_temp.items('c1', :jea)), 1, 'jean activo: reseñable');
SELECT is(jsonb_array_length(pg_temp.items('c1', :shi)), 1, 'camisa activa: reseñable');

-- Archivar el jean: deja de listarse y no se puede opinar
UPDATE public.products SET status = 'archived' WHERE id = :jea::uuid;
SELECT is(jsonb_array_length(pg_temp.items('c1', :jea)), 0, 'producto archivado → fuera de my_product_reviewables');
SELECT is(pg_temp.hint('c1', pg_temp.submit(pg_temp.item('qa-seed-order-01', :jea))), 'JM_PRODUCT_INACTIVE',
          'producto archivado → submit_product_review rechaza con JM_PRODUCT_INACTIVE');
SELECT is((SELECT count(*)::int FROM public.product_reviews WHERE product_id = :jea::uuid AND user_id = tests.uid('c1')), 0,
          'no se creó ninguna reseña');
-- Coherencia con my_review_invitations (ya ocultaba productos no activos)
SELECT is((SELECT count(*)::int FROM jsonb_array_elements(coalesce(tests.val(tests.exec_as('c1', 'SELECT public.my_review_invitations()')), '[]'::jsonb)) e
            WHERE e ->> 'product_id' = '00000000-0000-4000-8000-00000000c003'), 0,
          'tampoco aparece en las invitaciones');

-- Reactivar: vuelve a ser reseñable (el filtro es por estado actual, no definitivo)
UPDATE public.products SET status = 'active' WHERE id = :jea::uuid;
SELECT is(jsonb_array_length(pg_temp.items('c1', :jea)), 1, 'reactivado → vuelve a listarse');
SELECT is(tests.val(tests.exec_as('c1', pg_temp.submit(pg_temp.item('qa-seed-order-01', :jea)))) ->> 'status', 'pending',
          'reactivado → la reseña se crea pendiente');

SELECT * FROM finish();
ROLLBACK;
