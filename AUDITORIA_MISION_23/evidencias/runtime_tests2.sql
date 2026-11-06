SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
\echo '--- T5b: update_order_status_oms sobre pedido existente'
SELECT update_order_status_oms((SELECT id FROM online_orders WHERE idempotency_key='idem-3'),'cancelled');
SELECT update_order_status_oms((SELECT id FROM online_orders WHERE idempotency_key='idem-3'),'processing');
\echo '--- T12: total del pedido vs suma de items (consistencia)'
SELECT o.order_number, o.subtotal, SUM(i.total) items_sum FROM online_orders o JOIN online_order_items i ON i.order_id=o.id GROUP BY 1,2;
\echo '--- T13: anon puede leer inventarios/coupons'
SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE anon; SELECT count(*) inv FROM inventories; SELECT code FROM coupons; RESET ROLE;
