-- 90 · Acceso diferenciado por roles (RLS + privilegios). Incluye las regresiones T9–T16 de la auditoría M23.
BEGIN;
\ir _helpers.psql
SELECT plan(59);

CREATE FUNCTION pg_temp.n(p_who text, p_sql text) RETURNS int LANGUAGE sql AS $$ SELECT tests.nrows(tests.exec_as(p_who, p_sql)) $$;
CREATE FUNCTION pg_temp.err(p_who text, p_sql text) RETURNS text LANGUAGE sql AS $$ SELECT tests.exec_as(p_who, p_sql) ->> 'sqlstate' $$;

-- ===================== anon =====================
SELECT is(pg_temp.n('anon', 'SELECT id FROM public.products'), 6, 'anon ve solo los 6 productos activos (no borrador ni archivado)');
SELECT is(pg_temp.n('anon', $q$SELECT v.id FROM public.variants v JOIN public.products p ON p.id = v.product_id WHERE p.reference = 'JM-BER-001'$q$), 0,
          'anon no ve variantes de productos en borrador');
SELECT is(pg_temp.n('anon', 'SELECT id FROM public.product_images'),
          (SELECT count(*)::int FROM public.product_images pi JOIN public.products p ON p.id = pi.product_id WHERE p.status = 'active'),
          'anon ve solo imágenes de productos activos');
SELECT is(pg_temp.n('anon', 'SELECT variant_id FROM public.v_variant_availability'),
          (SELECT count(*)::int FROM public.variants v JOIN public.products p ON p.id = v.product_id WHERE p.status = 'active' AND v.is_active),
          'anon consulta disponibilidad (vista) de variantes activas');
SELECT is(pg_temp.n('anon', 'SELECT id FROM public.product_reviews'), 2, 'anon ve solo reseñas aprobadas');
SELECT is(pg_temp.n('anon', 'SELECT code FROM public.shipping_methods'), 1, 'anon ve solo métodos de envío activos');
SELECT is(pg_temp.err('anon', 'SELECT id FROM public.online_orders'), '42501', 'T9: anon no lee pedidos');
SELECT is(pg_temp.err('anon', 'SELECT id FROM public.inventories'), '42501', 'anon no lee inventario');
SELECT is(pg_temp.err('anon', 'SELECT code FROM public.coupons'), '42501', 'T13: anon no enumera cupones');
SELECT is(pg_temp.err('anon', 'SELECT id FROM public.profiles'), '42501', 'anon no lee perfiles');
SELECT is(pg_temp.err('anon', $q$INSERT INTO public.online_orders (idempotency_key, branch_id, customer_name, customer_email,
            customer_phone, shipping_department, shipping_city, shipping_address, shipping_method_code, subtotal, total, status, payment_expires_at)
          VALUES ('hack-insert-01', '00000000-0000-4000-8000-000000001001', 'x', 'x@x.co', '1', 'd', 'c', 'a', 'standard', 1, 15001, 'paid', now())
          RETURNING id$q$), '42501', 'T11: anon no inserta pedidos "paid" directamente');
SELECT is(pg_temp.err('anon', $q$UPDATE public.products SET base_price = 1 RETURNING id$q$), '42501',
          'anon no modifica productos');

-- ===================== cliente 1 =====================
SELECT is(pg_temp.n('c1', 'SELECT id FROM public.online_orders'), 3, 'T10: el cliente ve solo sus 3 pedidos');
SELECT is(pg_temp.n('c1', 'SELECT id FROM public.online_order_items'),
          (SELECT count(*)::int FROM public.online_order_items oi JOIN public.online_orders o ON o.id = oi.order_id WHERE o.user_id = tests.uid('c1')),
          'T14: el cliente ve los ítems de sus pedidos (y solo esos)');
SELECT is(pg_temp.n('c1', format('SELECT id FROM public.online_orders WHERE id = %L',
          (SELECT id FROM public.online_orders WHERE user_id = tests.uid('c2') LIMIT 1))), 0, 'el cliente no ve un pedido ajeno por id');
SELECT is(pg_temp.n('c1', 'SELECT id FROM public.payment_transactions'),
          (SELECT count(*)::int FROM public.payment_transactions pt JOIN public.online_orders o ON o.id = pt.order_id WHERE o.user_id = tests.uid('c1')),
          'el cliente ve solo los pagos de sus pedidos');
SELECT is(pg_temp.n('c1', 'SELECT id FROM public.order_events'),
          (SELECT count(*)::int FROM public.order_events e JOIN public.online_orders o ON o.id = e.order_id WHERE o.user_id = tests.uid('c1')),
          'el cliente ve solo la línea de tiempo de sus pedidos');
SELECT is(pg_temp.err('c1', $q$UPDATE public.payment_transactions SET status = 'APPROVED' RETURNING id$q$), '42501',
          'T16: el cliente no puede modificar pagos');
SELECT is(pg_temp.err('c1', $q$UPDATE public.online_orders SET total = 1 RETURNING id$q$), '42501',
          'el cliente no puede modificar pedidos');
SELECT is(pg_temp.err('c1', $q$INSERT INTO public.order_events (order_id, event_type, actor)
          SELECT id, 'HACK', 'admin' FROM public.online_orders LIMIT 1 RETURNING id$q$), '42501',
          'el cliente no puede insertar eventos');
SELECT is(pg_temp.n('c1', 'SELECT id FROM public.inventories'), 0, 'el cliente no ve inventario');
SELECT is(pg_temp.n('c1', 'SELECT code FROM public.coupons'), 0, 'el cliente no ve cupones');
SELECT is(pg_temp.n('c1', 'SELECT id FROM public.webhook_events'), 0, 'el cliente no ve eventos de pasarela');
SELECT is(pg_temp.n('c1', 'SELECT id FROM public.audit_logs'), 0, 'el cliente no ve auditoría');
SELECT is(pg_temp.n('c1', 'SELECT id FROM public.profiles'), 1, 'el cliente ve solo su perfil');
SELECT is(pg_temp.n('c1', $q$UPDATE public.profiles SET full_name = 'Nuevo Nombre' RETURNING id$q$), 1,
          'el cliente actualiza su nombre (solo su fila)');
SELECT is(pg_temp.err('c1', $q$UPDATE public.profiles SET role = 'admin' RETURNING id$q$), '42501',
          'el cliente no puede cambiar su rol');
SELECT is(pg_temp.n('c1', 'SELECT id FROM public.customer_addresses'), 1, 'el cliente ve solo sus direcciones');
SELECT is(pg_temp.err('c1', format($q$INSERT INTO public.customer_addresses (user_id, recipient_name, phone, department, city, address_line)
          VALUES (%L, 'Otro', '3000000000', 'Dpto', 'Ciudad', 'Calle 1 # 2') RETURNING id$q$, tests.uid('c2'))), '42501',
          'el cliente no crea direcciones para otro usuario');
SELECT is(pg_temp.err('c1', $q$INSERT INTO public.products (reference, slug, name, category_id, base_price)
          VALUES ('JM-HACK', 'hack', 'Hack', '00000000-0000-4000-8000-000000004001', 1) RETURNING id$q$), '42501',
          'el cliente no crea productos');
SELECT is(pg_temp.n('c1', 'SELECT product_id FROM public.wishlist_items'), 0, 'favoritos: el cliente empieza sin favoritos');
SELECT is(pg_temp.n('c1', $q$INSERT INTO public.wishlist_items (user_id, product_id)
          VALUES (auth.uid(), '00000000-0000-4000-8000-00000000c001') RETURNING product_id$q$), 1,
          'favoritos: el cliente agrega a su lista');

-- ===================== admin / super_admin =====================
SELECT is(pg_temp.n('admin', 'SELECT id FROM public.online_orders'), (SELECT count(*)::int FROM public.online_orders), 'admin ve todos los pedidos');
SELECT is(pg_temp.n('admin', 'SELECT id FROM public.inventories'), (SELECT count(*)::int FROM public.inventories), 'admin ve todo el inventario');
SELECT is(pg_temp.n('admin', 'SELECT id FROM public.products'), 8, 'admin ve productos en borrador y archivados');
SELECT is(pg_temp.n('admin', 'SELECT code FROM public.coupons'), 7, 'admin gestiona cupones');
SELECT is(pg_temp.err('admin', $q$UPDATE public.inventories SET stock = 999 RETURNING id$q$), '42501',
          'ni el admin modifica inventario directamente (solo por RPC con movimiento)');
SELECT is(pg_temp.err('admin', $q$UPDATE public.online_orders SET status = 'delivered' RETURNING id$q$), '42501',
          'ni el admin cambia estados directamente (solo por la máquina de estados)');
SELECT is(pg_temp.n('admin', 'SELECT id FROM public.audit_logs'), 0, 'admin no ve auditoría (solo super_admin)');
SELECT ok(pg_temp.n('superadmin', 'SELECT id FROM public.audit_logs') > 0, 'super_admin ve auditoría');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_set_user_role(%L, ''admin'') AS r', tests.uid('c2'))) ->> 'sqlstate', '42501',
          'admin no puede asignar roles');
SELECT is(tests.val(tests.exec_as('superadmin', format('SELECT public.admin_set_user_role(%L, ''admin'') AS r', tests.uid('c2')))) ->> 'role', 'admin',
          'super_admin promueve a un cliente a admin');
SELECT is(tests.exec_as('superadmin', format('SELECT public.admin_set_user_role(%L, ''customer'') AS r', tests.uid('superadmin'))) ->> 'hint',
          'JM_LAST_SUPER_ADMIN', 'no se puede retirar el último super_admin');

-- ===================== colecciones y looks (panel /admin/colecciones) =====================
SELECT is(pg_temp.err('anon', $q$INSERT INTO public.collections (slug, name) VALUES ('hack-anon', 'Hack') RETURNING id$q$), '42501',
          'anon no crea colecciones');
SELECT is(pg_temp.err('c1', $q$INSERT INTO public.collections (slug, name) VALUES ('hack-c1', 'Hack') RETURNING id$q$), '42501',
          'el cliente no crea colecciones');
SELECT is(pg_temp.n('admin', $q$INSERT INTO public.collections (slug, name, kind, is_active) VALUES ('look-rls', 'Look RLS', 'look', false) RETURNING id$q$), 1,
          'admin crea un look');
SELECT is(pg_temp.n('admin', $q$INSERT INTO public.collection_products (collection_id, product_id, position)
          SELECT id, '00000000-0000-4000-8000-00000000c001', 0 FROM public.collections WHERE slug = 'look-rls'
          ON CONFLICT (collection_id, product_id) DO UPDATE SET position = EXCLUDED.position RETURNING product_id$q$), 1,
          'admin asigna productos al look (upsert por collection_id, product_id)');
SELECT is(pg_temp.n('anon', $q$SELECT id FROM public.collections WHERE slug = 'look-rls'$q$), 0, 'anon no ve colecciones inactivas');
SELECT is(pg_temp.n('c1', $q$DELETE FROM public.collection_products RETURNING product_id$q$), 0, 'el cliente no borra productos de colecciones');
SELECT is(pg_temp.n('admin', $q$DELETE FROM public.collections WHERE slug = 'look-rls' RETURNING id$q$), 1,
          'admin elimina la colección (sus productos se borran en cascada)');

-- ===================== métodos de envío (panel /admin/configuracion) =====================
SELECT is(pg_temp.err('anon', $q$UPDATE public.shipping_methods SET cost = 1 WHERE code = 'standard' RETURNING code$q$), '42501',
          'anon no cambia tarifas de envío (sin privilegio UPDATE)');
SELECT is(pg_temp.n('c1', $q$UPDATE public.shipping_methods SET free_over_subtotal = 1 WHERE code = 'standard' RETURNING code$q$), 0,
          'el cliente no cambia el umbral de envío gratis');
SELECT is(pg_temp.err('c1', $q$INSERT INTO public.shipping_methods (code, name, cost) VALUES ('hack', 'Hack', 1) RETURNING code$q$), '42501',
          'el cliente no crea métodos de envío');
SELECT is(pg_temp.n('admin', $q$UPDATE public.shipping_methods SET cost = 18000 WHERE code = 'standard' RETURNING code$q$), 1,
          'admin cambia la tarifa estándar');
SELECT is(pg_temp.n('admin', $q$INSERT INTO public.shipping_methods (code, name, cost, is_active) VALUES ('pickup_rls', 'Recogida', 0, false) RETURNING code$q$), 1,
          'admin crea un método inactivo con tarifa 0');
SELECT is(pg_temp.err('admin', $q$UPDATE public.shipping_methods SET is_active = true WHERE code = 'pickup_rls' RETURNING code$q$), '23514',
          'un método activo exige tarifa > 0 (CHECK, igual que la validación del panel)');

-- ===================== service_role y storage =====================
SELECT is(pg_temp.n('service', 'SELECT id FROM public.online_orders'), (SELECT count(*)::int FROM public.online_orders),
          'service_role (backend) omite RLS');
SELECT is(pg_temp.err('anon', $q$INSERT INTO storage.objects (bucket_id, name) VALUES ('product-images', 'hack.jpg') RETURNING id$q$),
          '42501', 'anon no sube imágenes al bucket');
SELECT is(pg_temp.n('admin', $q$INSERT INTO storage.objects (bucket_id, name) VALUES ('product-images', 'p/c001/negro-1.jpg') RETURNING id$q$),
          1, 'admin sube imágenes al bucket product-images');

SELECT * FROM finish();
ROLLBACK;
