-- 01 · Estructura, invariantes y privilegios de la línea base
BEGIN;
\ir _helpers.psql
SELECT plan(30);

-- Tablas del esquema objetivo
SELECT set_eq(
  $$SELECT tablename::text FROM pg_tables WHERE schemaname = 'public'$$,
  ARRAY['profiles','customer_addresses','categories','style_lines','occasions','brands','sizes','colors',
        'products','product_occasions','product_colors','product_images','variants','collections','collection_products',
        'branches','inventories','inventory_movements','inventory_reservations','shipping_methods','coupons',
        'online_orders','online_order_items','coupon_redemptions','order_status_catalog','order_status_transitions',
        'order_events','payment_transactions','webhook_events','order_refunds','product_reviews','site_content',
        'wishlist_items','audit_logs','newsletter_subscribers'],
  'el esquema public contiene exactamente las 35 tablas del diseño (sin objetos POS)');

SELECT is_empty($$SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity$$,
  'RLS activa en todas las tablas de public');

SELECT hasnt_table('public', t, 'objeto POS eliminado: ' || t)
  FROM unnest(ARRAY['employees','shifts','sales','sale_items','transfers','transfer_items','customers','role_permissions','carts']) t;

SELECT enum_has_labels('public', 'order_status',
  ARRAY['payment_pending','paid','processing','shipped','delivered','cancelled','expired','refunded'],
  'order_status con los 8 estados del diseño (sin pending/packed/preparing)');

SELECT set_eq($$SELECT status::text FROM public.order_status_catalog$$,
              $$SELECT unnest(enum_range(NULL::public.order_status))::text$$,
              'catálogo de estados alineado con el enum');

SELECT is_empty($$
  SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public','private') AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')$$,
  'toda función SECURITY DEFINER fija search_path');

SELECT set_eq($$
  SELECT p.proname::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')$$,
  ARRAY['is_admin','is_super_admin','get_order_status_catalog','validate_coupon','quote_cart',
        'create_order','get_order_public','cancel_my_order','subscribe_newsletter'],
  'anon solo puede ejecutar las RPC públicas de tienda');

SELECT set_eq($$
  SELECT p.proname::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')$$,
  ARRAY['is_admin','is_super_admin','get_order_status_catalog','validate_coupon','quote_cart',
        'create_order','get_order_public','cancel_my_order','subscribe_newsletter','admin_upsert_product','admin_set_product_status',
        'admin_adjust_inventory','admin_transition_order','admin_dashboard_metrics','admin_set_user_role'],
  'authenticated: RPC de tienda + RPC admin (que validan el rol internamente)');

SELECT ok(NOT has_function_privilege('authenticated', 'public.apply_payment_event(jsonb,text)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.apply_payment_event(jsonb,text)', 'EXECUTE'),
          'apply_payment_event solo para service_role');
SELECT ok(NOT has_function_privilege('anon', 'public.create_payment_attempt(uuid,uuid)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.expire_pending_orders()', 'EXECUTE'),
          'create_payment_attempt y expire_pending_orders no expuestas a clientes');
SELECT is_empty($$
  SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'private' AND (has_function_privilege('anon', p.oid, 'EXECUTE')
                                    OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))$$,
  'ninguna función privada es ejecutable por anon/authenticated');

SELECT ok(NOT has_table_privilege('authenticated', 'public.online_orders', 'INSERT')
          AND NOT has_table_privilege('authenticated', 'public.payment_transactions', 'UPDATE')
          AND NOT has_table_privilege('anon', 'public.inventories', 'UPDATE'),
          'sin privilegios de escritura directa en pedidos, pagos e inventario');
SELECT ok(NOT has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
          AND has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE'),
          'perfil: el cliente puede editar su nombre pero no su rol');

-- Datos de referencia
SELECT is((SELECT count(*)::int FROM public.branches WHERE is_default), 1, 'una sola bodega por defecto');
SELECT results_eq($$SELECT code, cost, free_over_subtotal, is_active FROM public.shipping_methods ORDER BY sort_order$$,
  $$VALUES ('standard'::text, 15000::bigint, 200000::bigint, true), ('express', 0, NULL, false)$$,
  'envío estándar $15.000, gratis desde $200.000; express inactivo');
SELECT is((SELECT count(*)::int FROM public.order_status_transitions), 13, '13 transiciones de estado definidas');
SELECT ok((SELECT bool_and(id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
             FROM (SELECT id FROM public.branches UNION ALL SELECT id FROM public.colors
                   UNION ALL SELECT id FROM public.sizes UNION ALL SELECT id FROM public.categories
                   UNION ALL SELECT id FROM public.variants) x),
          'UUID de datos de referencia y variantes pasan la validación del frontend (v1-5, variante 8-b)');

-- Restricciones clave
SELECT throws_ok($$INSERT INTO public.product_images (product_id, color_id, external_url)
                   VALUES ('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-000000003001', 'https://x.test/a.jpg')$$,
                 '23503', NULL, 'imagen con color no declarado en el producto: rechazada');
SELECT throws_ok($$UPDATE public.inventories SET reserved = stock + 1 WHERE stock > 0$$, '23514', NULL,
                 'reservado > stock: rechazado');
SELECT throws_ok($$UPDATE public.online_orders SET total = total + 1 WHERE order_number = 'JM-001000'$$, '23514', NULL,
                 'total inconsistente: rechazado');
SELECT throws_ok($$UPDATE public.inventory_movements SET reason = 'x'$$, 'P0001', NULL,
                 'inventory_movements es append-only');
SELECT throws_ok($$DELETE FROM public.order_events$$, 'P0001', NULL, 'order_events es append-only');

SELECT * FROM finish();
ROLLBACK;
