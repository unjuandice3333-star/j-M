// =============================================================================
// M27 — Prueba de INTEGRACIÓN del flujo de pedido y pago contra el stack LOCAL de Supabase (sin mocks).
//   create_order (anon) → /api/wompi/signature (handler real, service_role local) → /api/wompi/webhook (handler real,
//   evento firmado con un secreto de eventos LOCAL ficticio) → estado en la BD.
// Solo loopback: aborta si la URL no es 127.0.0.1. Nunca contacta a Wompi. Uso (lo ejecuta scripts/ci/db_supabase.sh):
//   node apps/web/scripts/test-payment-flow.mjs <status.json>
// =============================================================================
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const st = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!String(st.API_URL).startsWith('http://127.0.0.1')) { console.error('solo se permite el stack local'); process.exit(2); }
const j = (...p) => p.join('');
Object.assign(process.env, {
  APP_ENV: 'local', SUPABASE_URL: st.API_URL, SUPABASE_SERVICE_ROLE_KEY: st.SERVICE_ROLE_KEY,
  WOMPI_PUBLIC_KEY: j('pub_', 'test_', crypto.randomBytes(12).toString('hex')),
  WOMPI_INTEGRITY_SECRET: j('test_', 'integrity_', crypto.randomBytes(12).toString('hex')),
  WOMPI_EVENTS_SECRET: j('test_', 'events_', crypto.randomBytes(12).toString('hex')),
});
for (const k of ['VERCEL', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'VERCEL_GIT_COMMIT_REF', 'VITE_APP_ENV']) delete process.env[k];

const { default: signature } = await import('../api/wompi/signature.js');
const { default: webhook } = await import('../api/wompi/webhook.js');
const anon = createClient(st.API_URL, st.ANON_KEY, { auth: { persistSession: false } });
const admin = createClient(st.API_URL, st.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  [${detail}]` : ''}`); };
const call = async (h, body) => {
  const res = { statusCode: 200, body: null, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await h({ method: 'POST', body, headers: {} }, res);
  return res;
};
const event = (reference, amount, status, txId) => {
  const t = Math.floor(Date.now() / 1000);
  const tx = { id: txId, reference, amount_in_cents: amount, currency: 'COP', status, payment_method_type: 'CARD' };
  const checksum = crypto.createHash('sha256').update(`${tx.id}${tx.status}${tx.amount_in_cents}${t}${process.env.WOMPI_EVENTS_SECRET}`).digest('hex');
  return { event: 'transaction.updated', data: { transaction: tx }, timestamp: t, signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], checksum } };
};
const orderRow = async (id) => (await admin.from('online_orders').select('status, total').eq('id', id).single()).data;

// Variante con stock (catálogo público)
const { data: avail } = await anon.from('v_variant_availability').select('variant_id, available').gte('available', 3).limit(1);
const variant = avail?.[0]?.variant_id;
check('catálogo: hay una variante con stock para la prueba', Boolean(variant));
const newOrder = async (key) => anon.rpc('create_order', {
  p_customer: { name: 'Integración Pagos', email: 'pagos.integracion@qa.jm.test', phone: '3000000099' },
  p_shipping: { department: 'Antioquia', city: 'Medellín', address: 'Calle de Prueba 10 # 20-30' },
  p_items: [{ variant_id: variant, quantity: 1 }], p_idempotency_key: key,
});

// 1. Pedido + idempotencia
const key = `it-pay-${crypto.randomUUID()}`;
const o1 = await newOrder(key); const o1b = await newOrder(key);
check('create_order (anon) crea el pedido pendiente', !o1.error && o1.data?.status === 'payment_pending', o1.error?.message);
check('create_order con la misma clave devuelve el mismo pedido (sin duplicar)', o1b.data?.order_id === o1.data?.order_id && o1b.data?.is_duplicate === true);
const order = o1.data;

// 2. Firma: token incorrecto → 404; correcto → intento con referencia y monto de la BD
const bad = await call(signature, { order_id: order.order_id, public_token: crypto.randomUUID() });
check('firma con token público incorrecto → 404 (no revela el pedido)', bad.statusCode === 404, `HTTP ${bad.statusCode}`);
const sig = await call(signature, { order_id: order.order_id, public_token: order.public_token });
const expectedSig = crypto.createHash('sha256').update(`${sig.body?.reference}${sig.body?.amount_in_cents}COP${process.env.WOMPI_INTEGRITY_SECRET}`).digest('hex');
check('firma: referencia del intento, monto de la BD y firma de integridad correcta',
  sig.statusCode === 200 && sig.body.reference === `${order.order_number}-1` && sig.body.amount_in_cents === Number(order.total) * 100 && sig.body.signature === expectedSig,
  `HTTP ${sig.statusCode}`);

// 3. Evento con monto alterado → rechazado; el pedido sigue pendiente
const tamper = await call(webhook, event(sig.body.reference, sig.body.amount_in_cents - 100, 'APPROVED', `it-${crypto.randomUUID()}`));
check('webhook con monto distinto al intento → 422 y el pedido sigue pendiente', tamper.statusCode === 422 && (await orderRow(order.order_id)).status === 'payment_pending', `HTTP ${tamper.statusCode}`);

// 4. Pago rechazado → el pedido sigue pendiente; nuevo intento → aprobado → pagado; duplicado → idempotente
const dec = await call(webhook, event(sig.body.reference, sig.body.amount_in_cents, 'DECLINED', `it-${crypto.randomUUID()}`));
check('webhook DECLINED → 200 y el pedido sigue pendiente (puede reintentar)', dec.statusCode === 200 && (await orderRow(order.order_id)).status === 'payment_pending', `HTTP ${dec.statusCode} ${dec.body?.detail}`);
const sig2 = await call(signature, { order_id: order.order_id, public_token: order.public_token });
check('reintento: segundo intento con referencia -2', sig2.statusCode === 200 && sig2.body.reference === `${order.order_number}-2`);
const approved = event(sig2.body.reference, sig2.body.amount_in_cents, 'APPROVED', `it-${crypto.randomUUID()}`);
const ok = await call(webhook, approved);
check('webhook APPROVED firmado → pedido pagado', ok.statusCode === 200 && (await orderRow(order.order_id)).status === 'paid', `HTTP ${ok.statusCode} ${ok.body?.detail}`);
const dup = await call(webhook, approved);
check('mismo evento otra vez → duplicate (idempotente)', dup.statusCode === 200 && dup.body?.result === 'duplicate');
const after = await call(signature, { order_id: order.order_id, public_token: order.public_token });
check('pedido pagado ya no admite nuevos intentos de pago → 409', after.statusCode === 409, `HTTP ${after.statusCode}`);

// 5. Evento con firma falsa → 401 y sin registro en webhook_events
const forged = event(sig2.body.reference, sig2.body.amount_in_cents, 'APPROVED', `it-${crypto.randomUUID()}`); forged.signature.checksum = 'f'.repeat(64);
const { count: before } = await admin.from('webhook_events').select('id', { count: 'exact', head: true });
const fr = await call(webhook, forged);
const { count: after2 } = await admin.from('webhook_events').select('id', { count: 'exact', head: true });
check('evento con firma falsa → 401 y no se registra', fr.statusCode === 401 && before === after2, `HTTP ${fr.statusCode}`);

// 6. Pedido cancelado por el cliente libera la reserva y no admite pago
const o2 = (await newOrder(`it-pay-${crypto.randomUUID()}`)).data;
const cancel = await anon.rpc('cancel_my_order', { p_order_id: o2.order_id, p_public_token: o2.public_token, p_reason: 'prueba' });
const s3 = await call(signature, { order_id: o2.order_id, public_token: o2.public_token });
check('pedido cancelado por el cliente → no admite pago (409)', !cancel.error && s3.statusCode === 409, cancel.error?.message ?? `HTTP ${s3.statusCode}`);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} PASS`);
process.exit(passed === results.length ? 0 : 1);
