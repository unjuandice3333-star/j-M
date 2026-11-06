\set ON_ERROR_STOP 0
\echo '--- Seed: producto + variante + inventario'
INSERT INTO products (id, reference, name, category_id, brand_id, base_price, base_cost)
VALUES ('11111111-1111-4111-8111-111111111111','REF-T1','Camiseta Test','c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',100000,40000);
INSERT INTO variants (id, product_id, sku, barcode, size_id, color_id)
SELECT '22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','REF-T1-M-NEG','770000000001',(SELECT id FROM sizes WHERE code='M'),(SELECT id FROM colors LIMIT 1);
INSERT INTO inventories (branch_id, variant_id, stock) VALUES ('b1000000-0000-0000-0000-000000000001','22222222-2222-4222-8222-222222222222',3);
INSERT INTO coupons (code, discount_type, discount_value) VALUES ('JM10OFF','percent',10);

\echo '--- T1: checkout como anon con precio manipulado (price=1) en el payload'
SET ROLE anon;
SELECT create_online_order_validated_idempotent('Cliente','c@x.co','300','Cund','Bogota','Calle 1','Barrio','', 'Estandar', NULL,
  '[{"variant_id":"22222222-2222-4222-8222-222222222222","quantity":2,"price":1,"name":"X"}]'::jsonb, 'idem-1', NULL) AS t1;
RESET ROLE;
SELECT o.order_number, o.subtotal, o.total, i.unit_price AS item_unit_price, i.total AS item_total FROM online_orders o JOIN online_order_items i ON i.order_id=o.id;

\echo '--- T2: anon puede asignar el pedido a un user_id arbitrario (p_user_id)'
SET ROLE anon;
SELECT (create_online_order_validated_idempotent('Cliente','c@x.co','300','Cund','Bogota','Calle 1','Barrio','', 'Estandar', NULL,
  '[{"variant_id":"22222222-2222-4222-8222-222222222222","quantity":1}]'::jsonb, 'idem-2', '99999999-9999-4999-8999-999999999999'))->>'order_id' AS t2;
RESET ROLE;
SELECT order_number, user_id FROM online_orders WHERE idempotency_key='idem-2';

\echo '--- T3: cupón invalido/inexistente no falla, se ignora silenciosamente'
SET ROLE anon;
SELECT (create_online_order_validated_idempotent('C','c@x.co','3','C','B','A','N','', 'E', 'BIENVENIDO2026',
  '[{"variant_id":"22222222-2222-4222-8222-222222222222","quantity":1}]'::jsonb, 'idem-3', NULL))->>'discount' AS t3_discount;
RESET ROLE;

\echo '--- T4: webhook marca pedido como paid (UPDATE como service_role) -> trigger de inventario'
SET ROLE service_role;
UPDATE online_orders SET status='paid' WHERE idempotency_key='idem-1';
RESET ROLE;
SELECT stock FROM inventories WHERE variant_id='22222222-2222-4222-8222-222222222222';

\echo '--- T5: update_order_status_oms (cualquier llamada) — literal packed no existe en enum'
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin@x.co');
UPDATE profiles SET role='admin' WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT update_order_status_oms((SELECT id FROM online_orders WHERE idempotency_key='idem-2'),'cancelled');

\echo '--- T6: estado preparing usado por el admin UI no existe en el enum'
SELECT update_order_status((SELECT id FROM online_orders WHERE idempotency_key='idem-2'),'preparing');

\echo '--- T7: RPC get_order_status usado por OrderConfirmationPage'
SELECT get_order_status(NULL,'x');

\echo '--- T8: columnas usadas por admin productService (style_line_id, slug)'
SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name IN ('style_line_id','slug','images');
SELECT column_name FROM information_schema.columns WHERE table_name='online_orders' AND column_name='branch_id';

\echo '--- T9: anon lee online_orders (pagina de confirmacion invitado)'
SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE anon; SELECT count(*) AS anon_visible_orders FROM online_orders; RESET ROLE;

\echo '--- T10: cualquier usuario autenticado (cliente) ve TODAS las ordenes y payment_transactions'
INSERT INTO auth.users(id,email) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cliente@x.co');
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false), set_config('request.jwt.claim.role','authenticated',false);
SET ROLE authenticated; SELECT count(*) AS customer_visible_orders FROM online_orders; RESET ROLE;

\echo '--- T11: anon puede insertar ordenes directamente sin RPC (order_public_insert WITH CHECK TRUE)'
SELECT set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','',false);
SET ROLE anon;
INSERT INTO online_orders(order_number,customer_name,customer_email,customer_phone,shipping_department,shipping_city,shipping_address,subtotal,total,status)
VALUES ('FAKE-1','x','x@x','1','d','c','a',0,0,'paid');
RESET ROLE;
SELECT order_number,status,total FROM online_orders WHERE order_number='FAKE-1';
