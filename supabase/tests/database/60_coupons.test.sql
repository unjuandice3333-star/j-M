-- 60 · Cupones: validación, aplicación en pedidos, límites y conteo de usos
BEGIN;
\ir _helpers.psql
SELECT plan(23);

CREATE FUNCTION pg_temp.vc(p_code text, p_subtotal bigint, p_email text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT tests.val(tests.exec_as('anon', format('SELECT public.validate_coupon(%L, %s, %L) AS r', p_code, p_subtotal, p_email)))
$$;

SELECT results_eq($$SELECT pg_temp.vc('QA10', 100000) ->> 'valid', pg_temp.vc('QA10', 100000) ->> 'discount_amount'$$,
                  $$VALUES ('true'::text, '10000'::text)$$, 'QA10: 10 % de 100.000');
SELECT is(pg_temp.vc('  qa10 ', 100000) ->> 'valid', 'true', 'código insensible a mayúsculas y espacios');
SELECT is(pg_temp.vc('QAFIJO20K', 99000) ->> 'reason', 'MIN_SUBTOTAL', 'fijo bajo el mínimo: inválido');
SELECT is(pg_temp.vc('QAFIJO20K', 150000) ->> 'discount_amount', '20000', 'fijo sobre el mínimo: 20.000');
SELECT is(pg_temp.vc('QAENVIO', 150000) ->> 'free_shipping', 'true', 'envío gratis desde 150.000');
SELECT is(pg_temp.vc('QAEXPIRADO', 100000) ->> 'reason', 'EXPIRED', 'vencido');
SELECT is(pg_temp.vc('QAFUTURO', 100000) ->> 'reason', 'NOT_STARTED', 'aún no inicia');
SELECT is(pg_temp.vc('QAAGOTADO', 100000) ->> 'reason', 'EXHAUSTED', 'usos agotados');
SELECT is(pg_temp.vc('NOEXISTE', 100000) ->> 'reason', 'NOT_FOUND', 'inexistente');
SELECT is(tests.exec_as('anon', 'SELECT code FROM public.coupons') ->> 'sqlstate', '42501', 'anon no puede listar cupones');

-- Cupón inválido en pedido: error explícito (no se ignora en silencio)
SELECT is(tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '1'), 'test-60-expired', 'QAEXPIRADO')) ->> 'hint',
          'JM_COUPON_EXPIRED', 'pedido con cupón vencido: rechazado con causa');

-- Porcentaje con prorrateo exacto entre líneas
SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '1', 'JM-SHI-001-AZUL-NAVY-S', '1'), 'test-60-pct', 'QA10'));
SELECT results_eq($$SELECT subtotal, discount_total, shipping_cost, total FROM public.online_orders WHERE idempotency_key = 'test-60-pct'$$,
                  $$VALUES (289800::bigint, 28980::bigint, 0::bigint, 260820::bigint)$$, 'QA10 sobre 289.800 = 28.980; neto ≥ 200.000 → envío gratis');
SELECT results_eq($$SELECT sum(line_discount)::bigint, sum(line_total)::bigint FROM public.online_order_items oi JOIN public.online_orders o ON o.id = oi.order_id
                     WHERE o.idempotency_key = 'test-60-pct'$$, $$VALUES (28980::bigint, 260820::bigint)$$,
                  'descuento prorrateado en líneas cuadra con la cabecera');

-- Fijo que baja el neto del umbral: el envío se cobra sobre el neto
SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-SHO-001-BLANCO-39', '1'), 'test-60-fixed', 'QAFIJO20K'));
SELECT results_eq($$SELECT subtotal, discount_total, shipping_cost, total FROM public.online_orders WHERE idempotency_key = 'test-60-fixed'$$,
                  $$VALUES (249900::bigint, 20000::bigint, 0::bigint, 229900::bigint)$$, 'QAFIJO20K: 249.900 − 20.000 = 229.900 (≥ 200.000, sin envío)');
SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-JEA-001-AZUL-INDIGO-30', '1'), 'test-60-fixed2', 'QAFIJO20K'));
SELECT results_eq($$SELECT subtotal, discount_total, shipping_cost, total FROM public.online_orders WHERE idempotency_key = 'test-60-fixed2'$$,
                  $$VALUES (189900::bigint, 20000::bigint, 15000::bigint, 184900::bigint)$$, 'QAFIJO20K: neto 169.900 < 200.000 → envío 15.000');

-- Envío gratis por cupón aunque el subtotal sea menor a 200.000
SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-JEA-001-NEGRO-34', '1'), 'test-60-ship', 'QAENVIO'));
SELECT results_eq($$SELECT subtotal, discount_total, shipping_cost, total FROM public.online_orders WHERE idempotency_key = 'test-60-ship'$$,
                  $$VALUES (189900::bigint, 0::bigint, 0::bigint, 189900::bigint)$$, 'QAENVIO: envío 0 con subtotal 189.900');

-- Límite por correo
SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '1'), 'test-60-u1', 'QAUNICO', 'unico@qa.jm.test')) ->> 'ok')::boolean,
          'QAUNICO primer uso del correo');
SELECT is(tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '1'), 'test-60-u2', 'QAUNICO', 'UNICO@qa.jm.test')) ->> 'hint',
          'JM_COUPON_EMAIL_LIMIT', 'QAUNICO segundo uso del mismo correo (otra capitalización): rechazado');
SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '1'), 'test-60-u3', 'QAUNICO', 'otro@qa.jm.test')) ->> 'ok')::boolean,
          'QAUNICO con otro correo: permitido');

-- Límite global cuenta reservas vigentes; se libera al cancelar; used_count solo al pagar
INSERT INTO public.coupons (code, discount_type, discount_value, max_uses) VALUES ('QAUNAVEZ', 'percent', 10, 1);
SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '1'), 'test-60-g1', 'QAUNAVEZ', 'g1@qa.jm.test'));
SELECT is(tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '1'), 'test-60-g2', 'QAUNAVEZ', 'g2@qa.jm.test')) ->> 'hint',
          'JM_COUPON_EXHAUSTED', 'max_uses=1 con una reserva vigente: segundo pedido rechazado');
SELECT tests.exec_as('anon', format('SELECT public.cancel_my_order(%L::uuid, %L::uuid) AS r',
       (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-60-g1'),
       (SELECT public_token FROM public.online_orders WHERE idempotency_key = 'test-60-g1')));
SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '1'), 'test-60-g3', 'QAUNAVEZ', 'g3@qa.jm.test')) ->> 'ok')::boolean,
          'al cancelar se libera el uso y otro cliente puede usarlo');
SELECT is((SELECT used_count FROM public.coupons WHERE code = 'QAUNAVEZ'), 0, 'used_count no aumenta mientras el pedido no se paga');
SELECT tests.apply(tests.wompi_event(tests.attempt('test-60-g3') ->> 'reference', 'APPROVED',
       (SELECT total * 100 FROM public.online_orders WHERE idempotency_key = 'test-60-g3'), 'tx-60-g3'), 'chk-60-g3');
SELECT results_eq($$SELECT c.used_count, r.status::text FROM public.coupons c JOIN public.coupon_redemptions r ON r.coupon_id = c.id
                     WHERE c.code = 'QAUNAVEZ' AND r.status <> 'released'$$, $$VALUES (1, 'confirmed'::text)$$,
                  'al pagar: used_count = 1 y redención confirmada');

SELECT * FROM finish();
ROLLBACK;
