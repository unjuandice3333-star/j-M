/**
 * TEST SUITE: SUPABASE EDGE FUNCTION WOMPI WEBHOOK SECURITY AUDIT & HARDENING (SEC-01 & SEC-03)
 * J&M Fashion Store — Moda Masculina Colombia
 * 
 * M27: capa HTTP/criptográfica de la Edge Function (supabase/functions/wompi-webhook/index.ts). Un evento no
 * verificado nunca llega a la BD; uno verificado llega una sola vez a apply_payment_event; cada resultado de la BD se
 * traduce al código HTTP correcto. (Antes el mock simulaba columnas que no existen en el esquema M24.)
 */

import { capturedHandler } from './mock-server.ts';
import { rpcMock } from './mock-supabase.ts';

// Configurar variables de entorno antes de importar
Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:54321'); // M26-R1.1: perfil local (qa exige un host de la lista de QA)
Deno.env.set('APP_ENV', 'local'); // M26-R1: entorno obligatorio de la Edge Function
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'mock_service_key');
Deno.env.set('WOMPI_EVENTS_SECRET', 'test_events_secret_secure_123');

// Importar el entrypoint real de la Edge Function
await import('../../../supabase/functions/wompi-webhook/index.ts');

if (!capturedHandler) {
  console.error('ERROR: No se pudo capturar el handler de la Edge Function');
  Deno.exit(1);
}

// Helper para calcular SHA-256 en Deno (Web Crypto)
async function sha256Hex(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(str));
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Generador de payloads oficiales de Wompi
async function generateWompiEventPayload({
  txId = 'tx_wompi_edge_2001',
  reference = 'JM-ORD-EDGE-2001',
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
  const payload: any = {
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
    let checksum = await sha256Hex(concatString);

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

function createRequest(body: any, method = 'POST'): Request {
  return new Request('https://edge.supabase.co/functions/v1/wompi-webhook', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

console.log('================================================================');
console.log('EDGE FUNCTION WOMPI WEBHOOK HARDENING TEST SUITE (SEC-01 & SEC-03)');
console.log('Target: supabase/functions/wompi-webhook/index.ts (Real Deno Handler)');
console.log('================================================================\n');

let total = 0; let passed = 0;
async function runTest(name: string, fn: () => Promise<void>) {
  total++; rpcMock.reset();
  try { await fn(); passed++; console.log(`[PASS] Escenario ${total}: ${name}`); }
  catch (e) { console.log(`[FAIL] Escenario ${total}: ${name}\n       ${(e as Error).message}`); }
}
function check(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }
const send = (body: any, method = 'POST') => capturedHandler!(createRequest(body, method));
const ev = (o: Record<string, unknown> = {}) => generateWompiEventPayload({ reference: 'JM-001001-1', ...o });

await runTest('Propiedad firmada inexistente → 400 sin tocar la BD', async () => {
  const r = await send(await ev({ properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents', 'transaction.nope'] }));
  check(r.status === 400 && rpcMock.calls.length === 0, `status ${r.status}, rpc ${rpcMock.calls.length}`);
});
await runTest('Faltan propiedades obligatorias → 400 sin tocar la BD', async () => {
  const r = await send(await ev({ properties: ['transaction.id'] }));
  check(r.status === 400 && rpcMock.calls.length === 0, `status ${r.status}`);
});
await runTest('Checksum alterado → 401 sin tocar la BD', async () => {
  const r = await send(await ev({ tamperChecksum: true }));
  check(r.status === 401 && rpcMock.calls.length === 0, `status ${r.status}`);
});
await runTest('Sin firma / sin timestamp → 401', async () => {
  check((await send(await ev({ omitSignature: true }))).status === 401, 'sin firma');
  check((await send(await ev({ omitTimestamp: true }))).status === 401, 'sin timestamp');
  check(rpcMock.calls.length === 0, 'tocó la BD');
});
await runTest('Firmado con el secreto de otro entorno → 401', async () => {
  const r = await send(await ev({ secret: 'test_events_otro_entorno' }));
  check(r.status === 401 && rpcMock.calls.length === 0, `status ${r.status}`);
});
await runTest('JSON malformado → 400', async () => {
  const r = await send('{no es json'); check(r.status === 400 && rpcMock.calls.length === 0, `status ${r.status}`);
});
await runTest('Evento válido → una llamada a apply_payment_event con payload y checksum → 200', async () => {
  const payload = await ev();
  const r = await send(payload); const body = await r.json();
  check(r.status === 200 && rpcMock.calls.length === 1 && rpcMock.calls[0].fn === 'apply_payment_event', `status ${r.status}`);
  const args = rpcMock.calls[0].args as any;
  check(JSON.stringify(args.p_event) === JSON.stringify(payload) && args.p_event_checksum === payload.signature.checksum, 'argumentos');
  check(body.order_status === 'paid', 'order_status');
});
await runTest('Duplicado → 200; rechazos de la BD → 422 / 404 / 409', async () => {
  rpcMock.response = { data: { result: 'duplicate' }, error: null }; check((await send(await ev())).status === 200, 'duplicate');
  rpcMock.response = { data: { result: 'rejected', detail: 'amount_or_currency_mismatch' }, error: null }; check((await send(await ev())).status === 422, '422');
  rpcMock.response = { data: { result: 'rejected', detail: 'unknown_reference' }, error: null }; check((await send(await ev())).status === 404, '404');
  rpcMock.response = { data: { result: 'rejected', detail: 'transaction_id_reused' }, error: null }; check((await send(await ev())).status === 409, '409');
});
await runTest('Error de la BD → 500 sin detalles internos', async () => {
  rpcMock.response = { data: null, error: { message: 'connection reset' } };
  const r = await send(await ev()); const t = await r.text();
  check(r.status === 500 && !t.includes('connection reset'), `status ${r.status}`);
});
await runTest('GET → 405; OPTIONS → ok sin tocar la BD', async () => {
  check((await capturedHandler!(new Request('https://x/f', { method: 'GET' }))).status === 405, 'GET');
  check((await capturedHandler!(new Request('https://x/f', { method: 'OPTIONS' }))).status === 200, 'OPTIONS');
  check(rpcMock.calls.length === 0, 'tocó la BD');
});

console.log(`\nSUMMARY: ${passed}/${total} TESTS PASSED`);
if (passed !== total) Deno.exit(1);
