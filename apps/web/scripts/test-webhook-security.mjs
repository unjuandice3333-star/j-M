// =============================================================================
// Pruebas de seguridad del webhook de Wompi (apps/web/api/wompi/webhook.js) — capa HTTP y criptográfica.
// M27: el handler verifica la firma (propiedades obligatorias, SHA-256 en tiempo constante) y delega TODA la lógica de
// pagos en la BD: rpc('apply_payment_event', { p_event, p_event_checksum }) (cubierta por pgTAP 40_payments y por la
// prueba de integración contra el stack local, scripts/ci/lib/payment_flow_check.mjs).
// Este archivo comprueba: (1) un evento no verificado NUNCA llega a la BD; (2) uno verificado llega exactamente una vez
// con el payload y el checksum recibidos; (3) cada resultado de la BD se traduce al código HTTP correcto.
// Antes (M24–M26) el mock simulaba columnas que no existen en el esquema (wompi_transaction_id, transaction_reference…).
// =============================================================================
import { mock } from 'node:test';
import crypto from 'crypto';
import assert from 'assert';

export const rpcMock = {
  calls: [], response: { data: { result: 'applied', detail: 'order_paid', order_status: 'paid' }, error: null },
  reset() { this.calls = []; this.response = { data: { result: 'applied', detail: 'order_paid', order_status: 'paid' }, error: null }; },
};

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => ({
      rpc: async (fn, args) => { rpcMock.calls.push({ fn, args }); return rpcMock.response; },
      from: () => { throw new Error('el webhook no debe acceder a tablas directamente'); },
    }),
  },
});

const { default: handler } = await import('../api/wompi/webhook.js');
const SECRET = ['test_', 'events_', 'secret_secure_123'].join('');

function createMockHttp(body = {}, method = 'POST') {
  const req = {
    method,
    body,
    headers: { 'content-type': 'application/json' }
  };

  const res = {
    statusCode: 200,
    headers: {},
    bodyData: null,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.bodyData = data;
      return this;
    },
    end() {
      return this;
    }
  };

  return { req, res };
}

// Generador de firmas criptográficas oficiales de Wompi
function generateWompiEventPayload({
  txId = 'tx_wompi_real_1001',
  reference = 'JM-ORD-REAL-1001',
  amountInCents = 18990000,
  currency = 'COP',
  status = 'APPROVED',
  timestamp = 1728800000,
  secret = 'test_events_secret_secure_123',
  tamperChecksum = false,
  omitSignature = false,
  properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
  omitProperties = false,
  omitTimestamp = false,
  extraTransactionData = {}
} = {}) {
  const payload = {
    event: 'transaction.updated',
    data: {
      transaction: {
        id: txId,
        reference,
        amount_in_cents: amountInCents,
        currency,
        status,
        payment_method_type: 'CARD',
        ...extraTransactionData
      }
    },
    timestamp: omitTimestamp ? undefined : timestamp
  };

  if (!omitSignature) {
    const finalProperties = omitProperties ? [] : properties;
    let concatString = '';
    for (const prop of finalProperties) {
      const parts = prop.split('.');
      let val = payload?.data;
      for (const p of parts) {
        if (val === undefined || val === null) break;
        val = val[p];
      }
      concatString += val !== undefined && val !== null ? String(val) : '';
    }
    concatString += String(timestamp) + secret;
    let checksum = crypto.createHash('sha256').update(concatString, 'utf8').digest('hex');

    if (tamperChecksum) {
      checksum = 'badc0ffee0000000000000000000000000000000000000000000000000000000';
    }

    payload.signature = {
      properties: finalProperties,
      checksum
    };
  }

  return payload;
}

let total = 0; let passed = 0;
async function runTest(name, fn) {
  total++; rpcMock.reset();
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.APP_ENV = 'local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key';
  process.env.WOMPI_EVENTS_SECRET = SECRET;
  try { await fn(); passed++; console.log(`[PASS] Escenario ${total}: ${name}`); }
  catch (err) { console.error(`[FAIL] Escenario ${total}: ${name}\n       ${err.message}`); }
}
const send = async (payload) => { const { req, res } = createMockHttp(payload); await handler(req, res); return res; };
const ev = (o = {}) => generateWompiEventPayload({ secret: SECRET, reference: 'JM-001001-1', ...o });

console.log('WOMPI WEBHOOK — capa HTTP/criptográfica (la lógica de pagos vive en apply_payment_event)\n');

await runTest('Propiedad firmada inexistente → 400 y la BD no se toca (SEC-01)', async () => {
  const r = await send(ev({ properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents', 'transaction.nonexistent_field'] }));
  assert.strictEqual(r.statusCode, 400); assert.strictEqual(rpcMock.calls.length, 0);
});
await runTest('Faltan propiedades obligatorias en la firma → 400 y la BD no se toca (SEC-01)', async () => {
  const r = await send(ev({ properties: ['transaction.id', 'transaction.status'] }));
  assert.strictEqual(r.statusCode, 400); assert.strictEqual(rpcMock.calls.length, 0);
});
await runTest('Checksum alterado → 401 y la BD no se toca', async () => {
  const r = await send(ev({ tamperChecksum: true }));
  assert.strictEqual(r.statusCode, 401); assert.strictEqual(rpcMock.calls.length, 0);
});
await runTest('Sin firma o sin timestamp → 401 y la BD no se toca', async () => {
  assert.strictEqual((await send(ev({ omitSignature: true }))).statusCode, 401);
  assert.strictEqual((await send(ev({ omitTimestamp: true }))).statusCode, 401);
  assert.strictEqual(rpcMock.calls.length, 0);
});
await runTest('Firmado con otro secreto (evento de otro entorno) → 401', async () => {
  const r = await send(generateWompiEventPayload({ secret: 'test_events_otro_entorno', reference: 'JM-001001-1' }));
  assert.strictEqual(r.statusCode, 401); assert.strictEqual(rpcMock.calls.length, 0);
});
await runTest('Evento válido → una sola llamada a apply_payment_event con el payload y el checksum recibidos → 200', async () => {
  const payload = ev({ status: 'APPROVED' });
  const r = await send(payload);
  assert.strictEqual(r.statusCode, 200); assert.strictEqual(rpcMock.calls.length, 1);
  assert.strictEqual(rpcMock.calls[0].fn, 'apply_payment_event');
  assert.deepStrictEqual(rpcMock.calls[0].args, { p_event: payload, p_event_checksum: payload.signature.checksum });
  assert.strictEqual(r.bodyData.order_status, 'paid');
});
await runTest('Evento duplicado (la BD responde duplicate) → 200 idempotente', async () => {
  rpcMock.response = { data: { result: 'duplicate', reference: 'JM-001001-1' }, error: null };
  const r = await send(ev()); assert.strictEqual(r.statusCode, 200); assert.strictEqual(r.bodyData.result, 'duplicate');
});
await runTest('Monto o moneda distintos al intento (rechazado por la BD) → 422', async () => {
  rpcMock.response = { data: { result: 'rejected', detail: 'amount_or_currency_mismatch' }, error: null };
  assert.strictEqual((await send(ev({ amountInCents: 1 }))).statusCode, 422);
});
await runTest('Referencia desconocida → 404; id de transacción reutilizado o distinto → 409', async () => {
  rpcMock.response = { data: { result: 'rejected', detail: 'unknown_reference' }, error: null };
  assert.strictEqual((await send(ev())).statusCode, 404);
  for (const d of ['transaction_id_mismatch', 'transaction_id_reused']) {
    rpcMock.response = { data: { result: 'rejected', detail: d }, error: null };
    assert.strictEqual((await send(ev())).statusCode, 409, d);
  }
});
await runTest('Error de la BD → 500 sin detalles internos (Wompi reintenta; nada quedó aplicado)', async () => {
  rpcMock.response = { data: null, error: { message: 'connection reset' } };
  const r = await send(ev());
  assert.strictEqual(r.statusCode, 500); assert.ok(!JSON.stringify(r.bodyData).includes('connection reset'));
});
await runTest('Pago rechazado (DECLINED) → 200 y el resultado de la BD se informa (el pedido sigue pendiente)', async () => {
  rpcMock.response = { data: { result: 'applied', detail: 'attempt_failed_order_unchanged', order_status: 'payment_pending' }, error: null };
  const r = await send(ev({ status: 'DECLINED' }));
  assert.strictEqual(r.statusCode, 200); assert.strictEqual(r.bodyData.order_status, 'payment_pending');
});
await runTest('Método distinto de POST → 405; OPTIONS → 200 sin tocar la BD', async () => {
  const a = createMockHttp({}, 'GET'); await handler(a.req, a.res); assert.strictEqual(a.res.statusCode, 405);
  const b = createMockHttp({}, 'OPTIONS'); await handler(b.req, b.res); assert.strictEqual(b.res.statusCode, 200);
  assert.strictEqual(rpcMock.calls.length, 0);
});
await runTest('Sin configuración de servidor (APP_ENV ausente) → 500 y la BD no se toca', async () => {
  delete process.env.APP_ENV;
  const r = await send(ev()); assert.strictEqual(r.statusCode, 500); assert.strictEqual(rpcMock.calls.length, 0);
});

console.log(`\nSUMMARY: ${passed}/${total} TESTS PASSED`);
process.exit(passed === total ? 0 : 1);
