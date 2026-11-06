// M28 — Compra REAL en Wompi SANDBOX (sin dinero real). Requiere credenciales sandbox del propietario y red hacia Wompi.
// Nunca imprime valores de llaves ni secretos. Rechaza cualquier llave que no sea de sandbox.
//
// Qué verifica de punta a punta:
//   1. La llave pública es sandbox y Wompi la reconoce (comercio + tokens de aceptación).
//   2. La tienda crea el pedido (create_order) y prepara el pago con NUESTRO endpoint /api/wompi/signature
//      (referencia JM-…-n, monto de la BD y firma de integridad con WOMPI_INTEGRITY_SECRET).
//   3. Wompi ACEPTA la transacción con esa firma (si el secreto de integridad no corresponde, Wompi la rechaza).
//   4. Mientras la transacción está PENDING, el pedido sigue «pago pendiente».
//   5. Wompi envía el webhook (firmado con el secreto de eventos) a la URL configurada en el panel sandbox; el
//      pedido pasa a «pagado» (APPROVED) o sigue pendiente y admite reintento (DECLINED). Se comprueba en la BD de la
//      tienda (get_order_public) y en la página de confirmación del navegador.
//
// Uso (desde apps/web; la tienda debe estar sirviendo /api/wompi/* con las variables de servidor sandbox):
//   STORE_URL=http://localhost:3000 \
//   SUPABASE_URL=<url de la BD de la tienda> SUPABASE_ANON_KEY=<anon> \
//   WOMPI_PUBLIC_KEY=pub_test_… \
//   CASE=approved|declined|nequi   node e2e/wompi_sandbox.cjs
// El webhook solo llega si la URL de eventos del panel sandbox apunta a esta tienda por HTTPS público
// (QA en Vercel/Edge Function, o un túnel hacia el equipo local).
const crypto = require('crypto');
const WOMPI = 'https://sandbox.wompi.co/v1';
const CASES = {
  approved: { type: 'CARD', number: '4242424242424242', expect: 'paid' },
  declined: { type: 'CARD', number: '4111111111111111', expect: 'payment_pending' },
  nequi: { type: 'NEQUI', phone: '3991111111', expect: 'paid' },
};
const env = (k) => (process.env[k] || '').trim();
const STORE = env('STORE_URL') || 'http://localhost:3000';
const SB = env('SUPABASE_URL'); const ANON = env('SUPABASE_ANON_KEY'); const PUB = env('WOMPI_PUBLIC_KEY');
const C = CASES[env('CASE') || 'approved'];
let fails = 0; const ok = (c, m) => { console.log(`${c ? '  ✔' : '  ✘'} ${m}`); if (!c) fails++; return c; };
const die = (m) => { console.error(`BLOQUEADO: ${m}`); process.exit(3); };

async function rpc(fn, args) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${fn}: HTTP ${r.status} ${body?.hint || body?.message || ''}`);
  return body;
}
async function wompi(path, init = {}) {
  const r = await fetch(`${WOMPI}${path}`, { ...init, headers: { Authorization: `Bearer ${PUB}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

(async () => {
  console.log('▶ verificación previa (sin mostrar valores)');
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'WOMPI_PUBLIC_KEY'].filter((k) => !env(k));
  if (missing.length) die(`faltan variables: ${missing.join(', ')}`);
  if (!PUB.startsWith('pub_test_')) die('WOMPI_PUBLIC_KEY no es de sandbox (debe empezar por pub_test_). No se usan llaves de producción.');
  if (!C) die('CASE debe ser approved, declined o nequi');
  let merchant;
  try { merchant = await wompi(`/merchants/${PUB}`); } catch { die('sin conexión a sandbox.wompi.co'); }
  if (!ok(merchant.status === 200, `Wompi reconoce la llave sandbox (HTTP ${merchant.status})`)) die('llave pública sandbox no válida');
  const acceptance = merchant.body.data.presigned_acceptance?.acceptance_token;
  const personal = merchant.body.data.presigned_personal_data_auth?.acceptance_token;
  ok(Boolean(acceptance), 'token de aceptación obtenido');

  console.log('▶ pedido en la tienda');
  const variants = await (await fetch(`${SB}/rest/v1/v_variant_availability?select=variant_id,available&available=gt.0&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })).json();
  if (!variants.length) die('no hay variantes con stock en la tienda');
  const email = `sandbox+${Date.now()}@qa.jm.test`;
  const order = await rpc('create_order', {
    p_customer: { name: 'Prueba Sandbox Wompi', email, phone: '3001234567' },
    p_shipping: { department: 'Bogotá D.C.', city: 'Bogotá', address: 'Calle de prueba 1 # 2-3' },
    p_items: [{ variant_id: variants[0].variant_id, quantity: 1 }], p_coupon_code: null, p_shipping_method: 'standard', p_idempotency_key: crypto.randomUUID(),
  });
  ok(order.status === 'payment_pending', `pedido ${order.order_number} creado (pago pendiente)`);
  const sigR = await fetch(`${STORE}/api/wompi/signature`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: order.order_id, public_token: order.public_token }) });
  const pay = await sigR.json();
  if (!ok(sigR.status === 200 && pay.signature, `la tienda prepara el pago (HTTP ${sigR.status}, referencia ${pay.reference})`)) die(`endpoint de firma: ${pay.error || sigR.status}`);
  ok(pay.publicKey === PUB, 'el servidor de la tienda usa la misma llave pública sandbox');

  console.log(`▶ transacción sandbox (${env('CASE') || 'approved'})`);
  let method;
  if (C.type === 'CARD') {
    const tok = await wompi('/tokens/cards', { method: 'POST', body: JSON.stringify({ number: C.number, cvc: '123', exp_month: '12', exp_year: '29', card_holder: 'Prueba Sandbox' }) });
    if (!ok(tok.status === 201 || tok.status === 200, `tarjeta de prueba tokenizada (HTTP ${tok.status})`)) die('no se pudo tokenizar la tarjeta de prueba');
    method = { type: 'CARD', token: tok.body.data.id, installments: 1 };
  } else method = { type: 'NEQUI', phone_number: C.phone };
  const tx = await wompi('/transactions', { method: 'POST', body: JSON.stringify({
    acceptance_token: acceptance, ...(personal ? { accept_personal_auth: personal } : {}),
    amount_in_cents: pay.amount_in_cents, currency: pay.currency || 'COP', signature: pay.signature, reference: pay.reference,
    customer_email: email, payment_method: method, redirect_url: `${STORE}/checkout/confirmacion?order=${order.order_number}&token=${order.public_token}`,
  }) });
  if (!ok(tx.status === 201 || tx.status === 200, `Wompi acepta la transacción con nuestra firma de integridad (HTTP ${tx.status})`)) {
    console.error('  detalle:', JSON.stringify(tx.body?.error ?? {}).slice(0, 300)); die('transacción rechazada por Wompi (¿WOMPI_INTEGRITY_SECRET de otro comercio?)');
  }
  const txId = tx.body.data.id;
  const early = await rpc('get_order_public', { p_order_number: order.order_number, p_public_token: order.public_token });
  ok(early.status === 'payment_pending', `mientras Wompi procesa, el pedido sigue pendiente (${early.status})`);

  console.log('▶ esperar el resultado de Wompi y el webhook (máx. 3 min)');
  let final = null; let txStatus = null;
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    txStatus = (await wompi(`/transactions/${txId}`)).body?.data?.status;
    final = await rpc('get_order_public', { p_order_number: order.order_number, p_public_token: order.public_token });
    if (final.status === 'paid') break;                                   // webhook aplicado
    if (txStatus && txStatus !== 'PENDING' && txStatus !== 'APPROVED' && i >= 4) break; // rechazo: margen de 20 s
  }
  console.log(`  Wompi: ${txStatus}  ·  pedido: ${final?.status ?? '(sin cambio)'}`);
  ok(final && final.status === C.expect, `estado del pedido tras el webhook = ${C.expect}`);
  if (C.expect === 'paid' && final?.status !== 'paid') console.log('  Si Wompi dice APPROVED y el pedido sigue pendiente, el webhook no llegó: revise la URL de eventos del panel sandbox y WOMPI_EVENTS_SECRET.');
  if (C.expect === 'payment_pending') {
    const retry = await fetch(`${STORE}/api/wompi/signature`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: order.order_id, public_token: order.public_token }) });
    const r2 = await retry.json(); ok(retry.status === 200 && r2.reference !== pay.reference, `rechazado → el cliente puede reintentar (nueva referencia ${r2.reference})`);
  }
  console.log(`  confirmación: ${STORE}/checkout/confirmacion?order=${order.order_number}&token=<token del pedido>`);
  if (C.expect === 'payment_pending') await rpc('cancel_my_order', { p_order_id: order.order_id, p_public_token: order.public_token, p_reason: 'Prueba sandbox rechazada: liberar stock' }).catch(() => {});
  console.log(fails ? `RESULTADO: ${fails} FALLO(S)` : 'RESULTADO: PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
