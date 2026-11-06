-- Comprobaciones del borrador: seeds mínimos + restricciones clave
\set ON_ERROR_STOP 0
INSERT INTO branches(id,code,name,is_default) VALUES ('00000000-0000-4000-8000-000000000001','BOD-PRINCIPAL','Bodega Principal',true);
INSERT INTO categories(id,slug,name,size_group) VALUES ('00000000-0000-4000-8000-000000000101','camisetas','Camisetas','alpha');
INSERT INTO sizes(id,size_group,code,name,sort_order) VALUES
 ('00000000-0000-4000-8000-000000000201','alpha','M','Mediana',2),('00000000-0000-4000-8000-000000000202','alpha','L','Grande',3);
INSERT INTO colors(id,slug,name,hex_code) VALUES
 ('00000000-0000-4000-8000-000000000301','negro','Negro','#000000'),('00000000-0000-4000-8000-000000000302','blanco','Blanco','#FFFFFF'),
 ('00000000-0000-4000-8000-000000000303','beige','Beige','#E2D3C4');
INSERT INTO products(id,reference,slug,name,category_id,base_price,status,published_at)
 VALUES ('00000000-0000-4000-8000-000000000401','JM-TEE-001','camiseta-essential','Camiseta Essential','00000000-0000-4000-8000-000000000101',129900,'active',now());
INSERT INTO product_colors(product_id,color_id,position,is_default) VALUES
 ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000301',0,true),
 ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000302',1,false);
INSERT INTO product_images(product_id,color_id,external_url,position) VALUES
 ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000301','https://x/negro-1.jpg',0),
 ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000302','https://x/blanco-1.jpg',0),
 ('00000000-0000-4000-8000-000000000401',NULL,'https://x/general.jpg',9);
INSERT INTO variants(id,product_id,color_id,size_id,sku) VALUES
 ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000201','JM-TEE-001-NEG-M');
INSERT INTO inventories(branch_id,variant_id,stock) VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000501',1);
INSERT INTO shipping_methods(code,name,cost,free_over_subtotal) VALUES ('standard','Envío estándar nacional',15000,200000),('express','Envío expreso 24h',25000,NULL);

\echo 'C1 debe FALLAR: imagen con color no declarado en el producto (beige)'
INSERT INTO product_images(product_id,color_id,external_url) VALUES ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000303','https://x/beige.jpg');
\echo 'C2 debe FALLAR: variante con color no declarado'
INSERT INTO variants(product_id,color_id,size_id,sku) VALUES ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000201','X-1');
\echo 'C3 debe FALLAR: variante duplicada producto+color+talla'
INSERT INTO variants(product_id,color_id,size_id,sku) VALUES ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000201','X-2');
\echo 'C4 debe FALLAR: reservado > stock'
UPDATE inventories SET reserved = 2;
\echo 'C5 debe FALLAR: total inconsistente'
INSERT INTO online_orders(idempotency_key,branch_id,customer_name,customer_email,customer_phone,shipping_department,shipping_city,shipping_address,shipping_method_code,subtotal,discount_total,shipping_cost,total)
 VALUES ('k0','00000000-0000-4000-8000-000000000001','A','a@a.co','3','D','C','X','standard',100000,0,15000,1);
\echo 'C6 OK: pedido consistente con número secuencial'
INSERT INTO online_orders(idempotency_key,branch_id,customer_name,customer_email,customer_phone,shipping_department,shipping_city,shipping_address,shipping_method_code,subtotal,discount_total,shipping_cost,total)
 VALUES ('k1','00000000-0000-4000-8000-000000000001','A','a@a.co','3','D','C','X','standard',129900,0,15000,144900) RETURNING order_number;
\echo 'C7 debe FALLAR: línea con total inconsistente'
INSERT INTO online_order_items(order_id,product_id,variant_id,product_name,sku,size_code,color_name,unit_price,quantity,line_total)
 SELECT id,'00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000501','Camiseta','JM-TEE-001-NEG-M','M','Negro',129900,1,1 FROM online_orders WHERE idempotency_key='k1';
\echo 'C8 debe FALLAR: segundo pago APPROVED para el mismo pedido'
INSERT INTO payment_transactions(order_id,attempt_number,reference,amount_in_cents,status) SELECT id,1,order_number||'-1',14490000,'APPROVED' FROM online_orders WHERE idempotency_key='k1';
INSERT INTO payment_transactions(order_id,attempt_number,reference,amount_in_cents,status) SELECT id,2,order_number||'-2',14490000,'APPROVED' FROM online_orders WHERE idempotency_key='k1';
\echo 'C9 debe FALLAR: movimiento con aritmética inconsistente'
INSERT INTO inventory_movements(inventory_id,variant_id,branch_id,movement_type,quantity_change,quantity_before,quantity_after)
 SELECT id,variant_id,branch_id,'sale',-1,1,5 FROM inventories;
\echo 'C10 debe FALLAR: cupón en minúsculas'
INSERT INTO coupons(code,discount_type,discount_value) VALUES ('jm10off','percent',10);
\echo 'C11 vistas: disponibilidad y galería por color'
SELECT * FROM v_variant_availability;
SELECT c.slug color, i.external_url FROM product_images i LEFT JOIN colors c ON c.id=i.color_id ORDER BY i.color_id NULLS LAST, position;
\echo 'C12 debe FALLAR: segundo producto activo sin published_at'
INSERT INTO products(reference,slug,name,category_id,base_price,status) VALUES ('R2','r2','R2','00000000-0000-4000-8000-000000000101',1000,'active');
