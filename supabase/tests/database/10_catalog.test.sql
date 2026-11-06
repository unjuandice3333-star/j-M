-- 10 · Creación de productos, variantes, imágenes por color, publicación e inventario manual
BEGIN;
\ir _helpers.psql
SELECT plan(24);

-- Producto nuevo creado por admin
SELECT ok((tests.exec_as('admin', $q$SELECT public.admin_upsert_product('{
  "id": "00000000-0000-4000-8000-00000000f001",
  "reference": "jm-test-100", "slug": "camiseta-prueba", "name": "Camiseta Prueba",
  "category": "camisetas", "style_line": "urbana", "occasions": ["casual"],
  "base_price": 99000, "compare_at_price": 120000,
  "colors": [
    {"color": "negro", "images": [{"external_url": "https://x.test/negro-1.jpg"}, {"external_url": "https://x.test/negro-2.jpg"}]},
    {"color": "beige", "is_default": true, "images": [{"external_url": "https://x.test/beige-1.jpg"}]}],
  "general_images": [{"external_url": "https://x.test/general.jpg"}],
  "variants": [
    {"color": "negro", "size": "M", "initial_stock": 5},
    {"color": "negro", "size": "L", "initial_stock": 0},
    {"color": "beige", "size": "M", "initial_stock": 3, "price_override": 105000}]
}'::jsonb) AS r$q$) ->> 'ok')::boolean, 'admin crea producto completo en una llamada');

SELECT is((SELECT status::text FROM public.products WHERE id = '00000000-0000-4000-8000-00000000f001'), 'draft',
          'producto nuevo queda en borrador');
SELECT is((SELECT reference FROM public.products WHERE id = '00000000-0000-4000-8000-00000000f001'), 'JM-TEST-100',
          'referencia normalizada a mayúsculas');
SELECT results_eq($$SELECT sku FROM public.variants WHERE product_id = '00000000-0000-4000-8000-00000000f001' ORDER BY sku$$,
                  ARRAY['JM-TEST-100-BEIGE-M', 'JM-TEST-100-NEGRO-L', 'JM-TEST-100-NEGRO-M'],
                  'SKU generados REFERENCIA-COLOR-TALLA');
SELECT is((SELECT co.slug FROM public.product_colors pc JOIN public.colors co ON co.id = pc.color_id
            WHERE pc.product_id = '00000000-0000-4000-8000-00000000f001' AND pc.is_default), 'beige',
          'color por defecto respetado');
SELECT results_eq(
  $$SELECT COALESCE(co.slug, 'general') || ':' || pi.position FROM public.product_images pi
      LEFT JOIN public.colors co ON co.id = pi.color_id
     WHERE pi.product_id = '00000000-0000-4000-8000-00000000f001'
     ORDER BY pi.color_id NULLS LAST, pi.position$$,
  $$VALUES ('negro:0'), ('negro:1'), ('beige:0'), ('general:0')$$,
  'galería por color con orden y una imagen general');
SELECT results_eq($$SELECT stock FROM tests.stock('JM-TEST-100-NEGRO-M') UNION ALL SELECT stock FROM tests.stock('JM-TEST-100-BEIGE-M')$$,
                  ARRAY[5, 3], 'stock inicial cargado');
SELECT is((SELECT count(*)::int FROM public.inventory_movements m JOIN public.variants v ON v.id = m.variant_id
            WHERE v.product_id = '00000000-0000-4000-8000-00000000f001' AND m.movement_type = 'initial_load'), 2,
          'movimientos initial_load solo para stock > 0');

-- Visibilidad: borrador no visible para anon
SELECT is(tests.nrows(tests.exec_as('anon', $q$SELECT id FROM public.products WHERE id = '00000000-0000-4000-8000-00000000f001'$q$)), 0,
          'anon no ve productos en borrador');

-- Publicación
SELECT is(tests.exec_as('admin', $q$SELECT public.admin_set_product_status('00000000-0000-4000-8000-00000000f001', 'active') AS r$q$) ->> 'ok',
          'true', 'admin publica el producto');
SELECT isnt((SELECT published_at FROM public.products WHERE id = '00000000-0000-4000-8000-00000000f001'), NULL,
            'published_at asignado al publicar');
SELECT is(tests.nrows(tests.exec_as('anon', $q$SELECT id FROM public.variants WHERE product_id = '00000000-0000-4000-8000-00000000f001'$q$)), 3,
          'anon ve las variantes del producto publicado');
SELECT results_eq($$SELECT available FROM public.v_variant_availability va JOIN public.variants v ON v.id = va.variant_id
                     WHERE v.sku = 'JM-TEST-100-NEGRO-M'$$, ARRAY[5], 'vista de disponibilidad pública');

-- Actualización: quitar una variante la desactiva; colores con variantes no se pueden quitar
SELECT ok((tests.exec_as('admin', $q$SELECT public.admin_upsert_product('{
  "id": "00000000-0000-4000-8000-00000000f001",
  "reference": "JM-TEST-100", "slug": "camiseta-prueba", "name": "Camiseta Prueba v2",
  "category": "camisetas", "base_price": 95000,
  "colors": [{"color": "negro", "images": [{"external_url": "https://x.test/negro-1.jpg"}]},
             {"color": "beige", "images": [{"external_url": "https://x.test/beige-1.jpg"}]}],
  "variants": [{"color": "negro", "size": "M"}, {"color": "beige", "size": "M"}]
}'::jsonb) AS r$q$) ->> 'ok')::boolean, 'admin actualiza producto');
SELECT is((SELECT is_active FROM public.variants WHERE sku = 'JM-TEST-100-NEGRO-L'), false,
          'variante no listada queda desactivada (no se borra)');
SELECT is((SELECT stock FROM tests.stock('JM-TEST-100-NEGRO-M')), 5, 'actualizar no altera el stock existente');
SELECT is(tests.exec_as('admin', $q$SELECT public.admin_upsert_product('{
  "id": "00000000-0000-4000-8000-00000000f001", "reference": "JM-TEST-100", "slug": "camiseta-prueba",
  "name": "Camiseta sin beige", "category": "camisetas", "base_price": 95000,
  "colors": [{"color": "negro"}], "variants": [{"color": "negro", "size": "M"}]}'::jsonb) AS r$q$) ->> 'hint',
  'JM_COLOR_IN_USE', 'no se puede quitar un color que tiene variantes');

-- Validaciones
SELECT is(tests.exec_as('admin', $q$SELECT public.admin_upsert_product('{"reference":"JM-X","slug":"x","name":"xx",
  "category":"camisetas","base_price":1000,"colors":[{"color":"negro"}],"variants":[{"color":"beige","size":"M"}]}'::jsonb) AS r$q$) ->> 'hint',
  'JM_COLOR_NOT_DECLARED', 'variante con color no declarado: rechazada');
SELECT is(tests.exec_as('admin', $q$SELECT public.admin_upsert_product('{"reference":"JM-X","slug":"x","name":"xx",
  "category":"jeans","base_price":1000,"colors":[{"color":"negro"}],"variants":[{"color":"negro","size":"M"}]}'::jsonb) AS r$q$) ->> 'hint',
  'JM_UNKNOWN_SIZE', 'talla alfabética en categoría de tallas numéricas: rechazada');
SELECT is(tests.exec_as('admin', $q$SELECT public.admin_set_product_status(
  (SELECT (public.admin_upsert_product('{"reference":"JM-NOIMG","slug":"sin-imagen","name":"Sin imagen",
   "category":"camisetas","base_price":1000,"colors":[{"color":"negro"}],"variants":[{"color":"negro","size":"M"}]}'::jsonb)
   ->> 'product_id')::uuid), 'active') AS r$q$) ->> 'hint',
  'JM_PUBLISH_NO_IMAGES', 'no se publica un producto sin imágenes');

-- Permisos
SELECT is(tests.exec_as('c1', $q$SELECT public.admin_upsert_product('{}'::jsonb) AS r$q$) ->> 'sqlstate', '42501',
          'cliente no puede crear productos');
SELECT is(tests.exec_as('c1', $q$SELECT public.admin_adjust_inventory((SELECT id FROM public.variants WHERE sku='JM-TEST-100-NEGRO-M'), 10, 'restock', 'x') AS r$q$) ->> 'sqlstate',
          '42501', 'cliente no puede ajustar inventario');

-- Ajuste manual
SELECT is(tests.val(tests.exec_as('admin', $q$SELECT public.admin_adjust_inventory(
  (SELECT id FROM public.variants WHERE sku='JM-TEST-100-NEGRO-M'), 7, 'restock', 'Llegada proveedor') AS r$q$)) ->> 'stock_after',
  '12', 'restock suma al stock');
SELECT is(tests.exec_as('admin', $q$SELECT public.admin_adjust_inventory(
  (SELECT id FROM public.variants WHERE sku='JM-TEST-100-NEGRO-M'), 5, 'damage', 'x') AS r$q$) ->> 'hint',
  'JM_INVALID_MOVEMENT', 'signo incoherente con el tipo de movimiento: rechazado');

SELECT * FROM finish();
ROLLBACK;
