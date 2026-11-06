-- 80 · Métricas comerciales del dashboard
BEGIN;
\ir _helpers.psql
SELECT plan(10);

CREATE TEMP TABLE t_m0 AS
  SELECT tests.val(tests.exec_as('admin', $q$SELECT public.admin_dashboard_metrics('2000-01-01', now() + interval '1 day') AS r$q$)) AS m;

SELECT is((SELECT (m ->> 'gross_sales')::bigint FROM t_m0),
          (SELECT COALESCE(sum(total), 0)::bigint FROM public.online_orders WHERE status IN ('paid','processing','shipped','delivered')),
          'ventas brutas = suma de pedidos pagados vigentes (excluye cancelados/reembolsados/pendientes)');
SELECT is((SELECT (m ->> 'paid_orders')::int FROM t_m0),
          (SELECT count(*)::int FROM public.online_orders WHERE status IN ('paid','processing','shipped','delivered')),
          'número de pedidos pagados vigentes');
SELECT is((SELECT (m ->> 'average_ticket')::bigint FROM t_m0),
          (SELECT round(avg(total))::bigint FROM public.online_orders WHERE status IN ('paid','processing','shipped','delivered')),
          'ticket promedio');
SELECT is((SELECT (m ->> 'units_sold')::int FROM t_m0),
          (SELECT sum(oi.quantity)::int FROM public.online_order_items oi JOIN public.online_orders o ON o.id = oi.order_id
            WHERE o.status IN ('paid','processing','shipped','delivered')), 'unidades vendidas');
SELECT is((SELECT jsonb_object_keys_count FROM (SELECT count(*)::int AS jsonb_object_keys_count FROM jsonb_object_keys((SELECT m -> 'orders_by_status' FROM t_m0))) x), 8,
          'conteo por estado incluye los 8 estados');
SELECT is((SELECT (m #>> '{orders_by_status,expired}')::int FROM t_m0), 1, 'pedidos vencidos contados (seed O5)');
SELECT is((SELECT (m ->> 'low_stock_variants')::int FROM t_m0),
          (SELECT count(*)::int FROM public.inventories i JOIN public.variants v ON v.id = i.variant_id
            WHERE v.is_active AND i.stock - i.reserved <= i.min_stock), 'variantes con stock bajo');

-- Un nuevo pago se refleja en las métricas
SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-SHO-001-BLANCO-43', '1'), 'test-80-new'));
SELECT tests.apply(tests.wompi_event(tests.attempt('test-80-new') ->> 'reference', 'APPROVED',
       (SELECT total * 100 FROM public.online_orders WHERE idempotency_key = 'test-80-new'), 'tx-80'), 'chk-80');
SELECT is((tests.val(tests.exec_as('admin', $q$SELECT public.admin_dashboard_metrics('2000-01-01', now() + interval '1 day') AS r$q$)) ->> 'gross_sales')::bigint,
          (SELECT (m ->> 'gross_sales')::bigint + 249900 FROM t_m0), 'nueva venta de 249.900 sumada a las ventas');

-- Permisos
SELECT is(tests.exec_as('c1', 'SELECT public.admin_dashboard_metrics() AS r') ->> 'sqlstate', '42501', 'cliente no accede a métricas');
SELECT is(tests.exec_as('anon', 'SELECT public.admin_dashboard_metrics() AS r') ->> 'sqlstate', '42501', 'anon no accede a métricas');

SELECT * FROM finish();
ROLLBACK;
