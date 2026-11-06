-- 50 · Cancelaciones, reembolsos y restauración de inventario
BEGIN;
\ir _helpers.psql
SELECT plan(22);

CREATE FUNCTION pg_temp.paid_order(p_key text, p_who text, p_items jsonb, p_coupon text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE att jsonb;
BEGIN
  PERFORM tests.exec_as(p_who, tests.order_sql(p_items, p_key, p_coupon));
  att := tests.attempt(p_key);
  PERFORM tests.apply(tests.wompi_event(att ->> 'reference', 'APPROVED', (att ->> 'amount_in_cents')::bigint, 'tx-' || p_key), 'chk-' || p_key);
END $$;

-- ---------- Cancelación por el cliente antes de pagar ----------
SELECT tests.exec_as('c1', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '2'), 'test-50-a', 'QA10'));
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-TEE-001-NEGRO-L')$$, $$VALUES (8, 2)$$, 'reserva de 2 unidades');
SELECT is(tests.exec_as('c2', format('SELECT public.cancel_my_order(%L::uuid) AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-a'))) ->> 'hint',
          'JM_ORDER_NOT_FOUND', 'otro cliente no puede cancelar el pedido');
SELECT is(tests.exec_as('anon', format('SELECT public.cancel_my_order(%L::uuid, %L::uuid) AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-a'), gen_random_uuid())) ->> 'hint',
          'JM_ORDER_NOT_FOUND', 'token incorrecto no permite cancelar');
SELECT is(tests.exec_as('c1', format('SELECT public.cancel_my_order(%L::uuid) AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-a'))) ->> 'ok', 'true', 'el propietario cancela');
SELECT results_eq($$SELECT status::text, cancelled_at IS NOT NULL FROM public.online_orders WHERE idempotency_key = 'test-50-a'$$,
                  $$VALUES ('cancelled'::text, true)$$, 'pedido cancelado');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-TEE-001-NEGRO-L')$$, $$VALUES (8, 0)$$, 'reserva liberada sin tocar el stock físico');
SELECT results_eq($$SELECT r.status::text, c.used_count FROM public.coupon_redemptions r JOIN public.coupons c ON c.id = r.coupon_id
                     WHERE r.order_id = (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-a')$$,
                  $$VALUES ('released'::text, 1)$$, 'redención del cupón liberada; used_count no aumenta (1 = uso del seed O3)');

-- Invitado cancela con su token
SELECT tests.exec_as('anon', tests.order_sql(tests.items('JM-TEE-001-NEGRO-L', '1'), 'test-50-guest'));
SELECT is(tests.exec_as('anon', format('SELECT public.cancel_my_order(%L::uuid, %L::uuid) AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-guest'),
          (SELECT public_token FROM public.online_orders WHERE idempotency_key = 'test-50-guest'))) ->> 'ok', 'true',
          'invitado cancela con su token público');

-- ---------- Cancelación de pedido pagado (admin) ----------
SELECT pg_temp.paid_order('test-50-b', 'c1', tests.items('JM-TEE-001-NEGRO-L', '3'));
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-TEE-001-NEGRO-L')$$, $$VALUES (5, 0)$$, 'pago aprobado descuenta 3');
SELECT is(tests.exec_as('c1', format('SELECT public.cancel_my_order(%L::uuid) AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-b'))) ->> 'hint',
          'JM_INVALID_TRANSITION', 'el cliente no puede cancelar un pedido pagado');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''cancelled'') AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-b'))) ->> 'hint',
          'JM_NOTE_REQUIRED', 'cancelar un pedido pagado exige nota');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''cancelled'', ''Cliente desiste'') AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-b'))) ->> 'ok', 'true', 'admin cancela con nota');
SELECT results_eq($$SELECT stock, reserved FROM tests.stock('JM-TEE-001-NEGRO-L')$$, $$VALUES (8, 0)$$, 'stock restaurado (5 → 8)');
SELECT results_eq($$SELECT movement_type::text, quantity_change, quantity_before, quantity_after FROM public.inventory_movements
                     WHERE reference_id = (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-b') ORDER BY created_at$$,
                  $$VALUES ('sale'::text, -3, 8, 5), ('cancel_restore'::text, 3, 5, 8)$$, 'libro de movimientos: venta y reingreso');
SELECT results_eq($$SELECT status::text, amount, restock, payment_transaction_id IS NOT NULL FROM public.order_refunds
                     WHERE order_id = (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-b')$$,
                  $$SELECT 'requested'::text, total, true, true FROM public.online_orders WHERE idempotency_key = 'test-50-b'$$,
                  'solicitud de reembolso por el total ligada al pago aprobado');
SELECT is(tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''refunded'', ''x'') AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-b'))) ->> 'hint',
          'JM_INVALID_TRANSITION', 'cancelado es terminal: no se puede reembolsar de nuevo ni reingresar dos veces');

-- ---------- Reembolso desde preparación ----------
SELECT pg_temp.paid_order('test-50-c', 'c2', tests.items('JM-SHI-001-BLANCO-L', '1'));
SELECT tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''processing'') AS r',
       (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-c')));
SELECT is(tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''refunded'', ''Defecto de fábrica'') AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-c'))) ->> 'ok', 'true', 'reembolso desde processing');
SELECT is((SELECT stock FROM tests.stock('JM-SHI-001-BLANCO-L')), 6, 'stock restaurado tras reembolso desde processing');

-- ---------- Reembolso posventa (entregado): sin reingreso automático ----------
SELECT pg_temp.paid_order('test-50-d', 'c2', tests.items('JM-SHI-001-BLANCO-S', '1'));
SELECT tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, %L) AS r',
       (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-d'), s))
  FROM unnest(ARRAY['processing']) s;
SELECT tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''shipped'', NULL, ''{"carrier":"QA","tracking_number":"G-1"}''::jsonb) AS r',
       (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-d')));
SELECT tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''delivered'') AS r',
       (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-d')));
SELECT is(tests.exec_as('admin', format('SELECT public.admin_transition_order(%L::uuid, ''refunded'', ''Devolución posventa'') AS r',
          (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-d'))) ->> 'ok', 'true', 'reembolso desde delivered');
SELECT results_eq($$SELECT stock FROM tests.stock('JM-SHI-001-BLANCO-S')$$, ARRAY[3],
                  'entregado → reembolsado no reingresa stock automáticamente (mercancía en poder del cliente)');
SELECT is((SELECT restock FROM public.order_refunds WHERE order_id = (SELECT id FROM public.online_orders WHERE idempotency_key = 'test-50-d')),
          false, 'reembolso registrado sin reingreso');
SELECT is(tests.val(tests.exec_as('admin', $q$SELECT public.admin_adjust_inventory(
          (SELECT id FROM public.variants WHERE sku = 'JM-SHI-001-BLANCO-S'), 1, 'return', 'Devolución recibida') AS r$q$)) ->> 'stock_after',
          '4', 'reingreso manual de la devolución con tipo return');

SELECT * FROM finish();
ROLLBACK;
