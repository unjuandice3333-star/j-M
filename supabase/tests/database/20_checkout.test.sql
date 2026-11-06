-- 20 · Cotización y creación de pedidos: precios desde BD, envío, idempotencia y validaciones
BEGIN;
\ir _helpers.psql
SELECT plan(34);

-- ---------- quote_cart (anon) ----------
SELECT is(tests.val(tests.exec_as('anon', format('SELECT public.quote_cart(%L::jsonb) AS r',
            tests.items('JM-TEE-001-NEGRO-S', '1')))) ->> 'total', '144900',
          'cotización: 129.900 + envío 15.000 = 144.900 (subtotal < 200.000)');
SELECT is(tests.val(tests.exec_as('anon', format('SELECT public.quote_cart(%L::jsonb) AS r',
            tests.items('JM-TEE-001-NEGRO-S', '1', 'JM-JEA-001-AZUL-INDIGO-34', '1')))) ->> 'shipping_cost', '0',
          'cotización: envío gratis con subtotal 319.800');
SELECT is(tests.val(tests.exec_as('anon', format('SELECT public.quote_cart(%L::jsonb) AS r',
            tests.items('JM-POL-001-BEIGE-M', '2')))) ->> 'shipping_cost', '15000',
          'cotización: 199.800 (< 200.000) paga envío');
SELECT is(tests.val(tests.exec_as('anon', format('SELECT public.quote_cart(%L::jsonb) AS r',
            tests.items('JM-SHO-001-BLANCO-42', '1')))) ->> 'shipping_cost', '0',
          'cotización: 249.900 (>= 200.000) envío gratis');
SELECT is(tests.val(tests.exec_as('anon', format('SELECT public.quote_cart(%L::jsonb) AS r',
            tests.items('JM-POL-001-BEIGE-M', '2')))) ->> 'can_checkout', 'false',
          'cotización marca falta de stock (2 pedidas, 1 disponible)');

-- ---------- create_order: precio manipulado ignorado ----------
SELECT ok((tests.exec_as('anon', tests.order_sql(
  jsonb_build_array(jsonb_build_object('variant_id', (SELECT id FROM public.variants WHERE sku = 'JM-TEE-001-NEGRO-S'),
                                       'quantity', 2, 'price', 1, 'unit_price', 1, 'name', 'HACK', 'size', 'XXL', 'color', 'Rojo')),
  'test-20-price-injection')) ->> 'ok')::boolean, 'anon crea pedido con campos manipulados en el payload');
SELECT results_eq($$SELECT subtotal, discount_total, shipping_cost, total FROM public.online_orders WHERE idempotency_key = 'test-20-price-injection'$$,
  $$VALUES (259800::bigint, 0::bigint, 0::bigint, 259800::bigint)$$,
  'cabecera con precios de BD (2 × 129.900) y envío gratis');
SELECT results_eq($$SELECT product_name, sku, size_code, color_name, unit_price, quantity, line_total
                      FROM public.online_order_items oi JOIN public.online_orders o ON o.id = oi.order_id
                     WHERE o.idempotency_key = 'test-20-price-injection'$$,
  $$VALUES ('Camiseta Heavyweight Oversize'::text, 'JM-TEE-001-NEGRO-S'::text, 'S'::text, 'Negro'::text, 129900::bigint, 2, 259800::bigint)$$,
  'línea con snapshot de BD: nombre, SKU, talla, color y precio (ignora price/name/size/color del cliente)');
SELECT is((SELECT image_url FROM public.online_order_items oi JOIN public.online_orders o ON o.id = oi.order_id
            WHERE o.idempotency_key = 'test-20-price-injection'),
          'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=1000',
          'imagen de la línea = primera imagen del color comprado');
SELECT is((SELECT user_id FROM public.online_orders WHERE idempotency_key = 'test-20-price-injection'), NULL,
          'pedido de invitado sin user_id');
SELECT matches((SELECT order_number FROM public.online_orders WHERE idempotency_key = 'test-20-price-injection'),
               '^JM-[0-9]{6}$', 'número de pedido secuencial JM-NNNNNN');
SELECT ok((SELECT payment_expires_at BETWEEN now() + interval '29 minutes' AND now() + interval '31 minutes'
             FROM public.online_orders WHERE idempotency_key = 'test-20-price-injection'),
          'ventana de pago de 30 minutos');
SELECT is((SELECT event_type FROM public.order_events e JOIN public.online_orders o ON o.id = e.order_id
            WHERE o.idempotency_key = 'test-20-price-injection'), 'ORDER_CREATED', 'evento ORDER_CREATED registrado');
SELECT is((SELECT customer_email FROM public.online_orders WHERE idempotency_key = 'test-20-price-injection'),
          'prueba@qa.jm.test', 'email normalizado');

-- user_id tomado de auth.uid(); la RPC no acepta user_id como parámetro
SELECT ok((tests.exec_as('c1', tests.order_sql(tests.items('JM-TEE-001-NEGRO-S', '1'), 'test-20-user')) ->> 'ok')::boolean,
          'cliente autenticado crea pedido');
SELECT is((SELECT user_id FROM public.online_orders WHERE idempotency_key = 'test-20-user'), tests.uid('c1'),
          'user_id = auth.uid() del JWT');
SELECT hasnt_function('public', 'create_order',
  ARRAY['jsonb','jsonb','jsonb','text','text','text','uuid'], 'create_order no expone un parámetro p_user_id');

-- Líneas duplicadas se agrupan
SELECT ok((tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '1', 'JM-TEE-001-NEGRO-L', '2'), 'test-20-merge')) ->> 'ok')::boolean,
          'pedido con la misma variante repetida');
SELECT results_eq($$SELECT count(*)::int, sum(quantity)::int FROM public.online_order_items oi JOIN public.online_orders o ON o.id = oi.order_id
                     WHERE o.idempotency_key = 'test-20-merge'$$, $$VALUES (1, 3)$$, 'una sola línea con cantidad 3');

-- ---------- idempotencia ----------
SELECT is(tests.val(tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-S', '1'), 'test-20-price-injection'))) ->> 'is_duplicate',
          'true', 'misma clave de idempotencia devuelve el pedido existente');
SELECT is((SELECT count(*)::int FROM public.online_orders WHERE idempotency_key = 'test-20-price-injection'), 1,
          'no se crea un segundo pedido');
SELECT is((SELECT reserved FROM tests.stock('JM-TEE-001-NEGRO-S')), 3, 'reservas: 2 (invitado) + 1 (cliente), sin duplicar por el reintento');

-- ---------- validaciones ----------
SELECT is(tests.exec_as('anon', format('SELECT public.create_order(%L::jsonb, %L::jsonb, %L::jsonb, NULL, ''standard'', ''test-20-bad-email'') AS r',
          jsonb_build_object('name','Comprador','email','no-es-correo','phone','3001234567'), tests.shipping(),
          tests.items('JM-TEE-001-NEGRO-S','1'))) ->> 'hint', 'JM_INVALID_EMAIL', 'email inválido rechazado');
SELECT is(tests.exec_as('anon', format('SELECT public.create_order(%L::jsonb, %L::jsonb, %L::jsonb, NULL, ''standard'', ''test-20-bad-phone'') AS r',
          jsonb_build_object('name','Comprador','email','a@b.co','phone','12'), tests.shipping(),
          tests.items('JM-TEE-001-NEGRO-S','1'))) ->> 'hint', 'JM_INVALID_PHONE', 'teléfono inválido rechazado');
SELECT is(tests.exec_as('anon', format('SELECT public.create_order(%L::jsonb, %L::jsonb, %L::jsonb, NULL, ''standard'', ''test-20-bad-ship'') AS r',
          tests.customer(), '{"department":"C","city":"","address":""}', tests.items('JM-TEE-001-NEGRO-S','1'))) ->> 'hint',
          'JM_INVALID_SHIPPING', 'dirección incompleta rechazada');
SELECT is(tests.exec_as('anon', tests.order_sql('[]'::jsonb, 'test-20-empty')) ->> 'hint', 'JM_EMPTY_CART', 'carrito vacío rechazado');
SELECT is(tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-S', '0'), 'test-20-qty0')) ->> 'hint',
          'JM_INVALID_QUANTITY', 'cantidad 0 rechazada');
SELECT is(tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-S', '21'), 'test-20-qty21')) ->> 'hint',
          'JM_INVALID_QUANTITY', 'cantidad 21 rechazada');
SELECT is(tests.exec_as('anon', tests.order_sql('[{"variant_id":"00000000-0000-4000-8000-0000000fffff","quantity":1}]', 'test-20-unknown')) ->> 'hint',
          'JM_VARIANT_UNAVAILABLE', 'variante inexistente rechazada');
SELECT is(tests.exec_as('anon', tests.order_sql(tests.items('JM-BER-001-VERDE-OLIVA-30', '1'), 'test-20-draft')) ->> 'hint',
          'JM_VARIANT_UNAVAILABLE', 'producto en borrador no se puede comprar');
SELECT is(tests.exec_as('anon', tests.order_sql(tests.items('JM-JAC-001-NEGRO-M', '1'), 'test-20-nostock')) ->> 'hint',
          'JM_OUT_OF_STOCK', 'producto agotado rechazado con mensaje de stock');
SELECT is(tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-S', '1'), 'test-20-express', NULL, 'prueba@qa.jm.test', 'express')) ->> 'hint',
          'JM_SHIPPING_UNAVAILABLE', 'envío express inactivo rechazado');
SELECT is(tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-S', '1'), 'corta')) ->> 'hint',
          'JM_IDEMPOTENCY_KEY', 'clave de idempotencia demasiado corta rechazada');
SELECT is((SELECT count(*)::int FROM public.online_orders WHERE idempotency_key LIKE 'test-20-%'), 3,
          'las solicitudes rechazadas no dejaron pedidos');

SELECT * FROM finish();
ROLLBACK;
