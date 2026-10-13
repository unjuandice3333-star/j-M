/**
 * TEST SUITE: WOMPI WEBHOOK SECURITY AUDIT & HARDENING VERIFICATION
 * J&M Fashion Store — Moda Masculina Colombia
 * 
 * Verifica los 9 escenarios obligatorios de seguridad, idempotencia y reconciliación:
 * 1. Propiedad firmada inexistente -> HTTP 400, 0 escrituras.
 * 2. Propiedades obligatorias ausentes -> HTTP 400, 0 escrituras.
 * 3. Firma válida y evento legítimo -> HTTP 200, orden pagada, tx registrada, 1 update, 1 event, 1 upsert.
 * 4. Firma inválida -> HTTP 401, 0 escrituras.
 * 5. Evento duplicado -> HTTP 200 (Idempotente), 0 escrituras.
 * 6. Transacción aprobada con orden todavía pendiente -> HTTP 200, orden reconciliada a paid, 1 update, 1 event, 0 tx writes.
 * 7. Fallo en cada escritura de base de datos y reintento:
 *    - 7A: Fallo en update de online_orders -> HTTP 500, aborta antes de tx.
 *    - 7B: Fallo en insert de order_events -> Warning, no bloquea pago ni tx.
 *    - 7C: Fallo en upsert de payment_transactions -> HTTP 500.
 *    - 7D: Reintento tras fallo previo -> HTTP 200, reconcilia tx sin duplicar orden ni evento.
 * 8. Referencia o ID asociado a otra orden -> HTTP 409 (Conflicto), 0 escrituras.
 * 9. Importe o moneda incorrectos -> HTTP 422, 0 escrituras.
 */

import { mock } from 'node:test';
import crypto from 'crypto';
import assert from 'assert';

// Estado mutable para configurar las respuestas simuladas de Supabase y registrar escrituras exactas
export const dbMock = {
  existingTx: null,
  existingTxErr: null,
  orderRecord: null,
  orderErr: null,
  updateErr: null,
  eventErr: null,
  upsertErr: null,
  orderUpdates: [],
  orderEvents: [],
  txUpserts: [],
  reset() {
    this.existingTx = null;
    this.existingTxErr = null;
    this.orderRecord = null;
    this.orderErr = null;
    this.updateErr = null;
    this.eventErr = null;
    this.upsertErr = null;
    this.orderUpdates = [];
    this.orderEvents = [];
    this.txUpserts = [];
  }
};

// Mock de @supabase/supabase-js inyectado antes de importar el handler real
mock.module('@supabase/supabase-js', {
  exports: {
    createClient: () => ({
      from: (table) => {
        if (table === 'payment_transactions') {
          return {
            select: () => ({
              or: () => ({
                maybeSingle: async () => ({
                  data: dbMock.existingTx,
                  error: dbMock.existingTxErr
                })
              })
            }),
            upsert: async (record) => {
              dbMock.txUpserts.push({ ...record });
              if (dbMock.upsertErr) return { error: dbMock.upsertErr };
              // Simular persistencia
              dbMock.existingTx = { ...record, id: dbMock.existingTx?.id || 'tx-persisted-uuid' };
              return { error: null };
            }
          };
        }
        if (table === 'online_orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: dbMock.orderRecord,
                  error: dbMock.orderErr
                })
              })
            }),
            update: (updateData) => ({
              eq: async () => {
                dbMock.orderUpdates.push({ ...updateData });
                if (dbMock.updateErr) return { error: dbMock.updateErr };
                if (dbMock.orderRecord) {
                  dbMock.orderRecord.status = updateData.status;
                }
                return { error: null };
              }
            })
          };
        }
        if (table === 'order_events') {
          return {
            insert: async (eventData) => {
              dbMock.orderEvents.push({ ...eventData });
              return { error: dbMock.eventErr };
            }
          };
        }
        throw new Error(`Tabla no manejada en mock: ${table}`);
      }
    })
  }
});

// Importar el handler REAL del webhook de producción
const { default: handler } = await import('../api/wompi/webhook.js');

// Utilidad para simular req y res de Node.js / Vercel Serverless
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

// ----------------------------------------------------------------------------
// EJECUCIÓN DE PRUEBAS
// ----------------------------------------------------------------------------
console.log('================================================================');
console.log('WOMPI WEBHOOK HARDENING & DEEP AUDIT TEST SUITE (SEC-01 & SEC-03)');
console.log('Target: apps/web/api/wompi/webhook.js (Production Handler)');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
const results = [];

async function runTest(name, fn) {
  totalTests++;
  dbMock.reset();
  process.env.VITE_SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key';
  process.env.WOMPI_EVENTS_SECRET = 'test_events_secret_secure_123';

  try {
    await fn();
    console.log(`[PASS] Escenario ${totalTests}: ${name}`);
    passedTests++;
    results.push({ id: totalTests, name, status: 'PASS' });
  } catch (err) {
    console.error(`[FAIL] Escenario ${totalTests}: ${name}`);
    console.error(`       Detalle: ${err.message}\n`);
    results.push({ id: totalTests, name, status: 'FAIL', error: err.message });
  }
}

// 1. Propiedad firmada inexistente
await runTest('1. Propiedad firmada inexistente: rechazo con HTTP 400 y 0 escrituras (SEC-01)', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-REAL-1001', status: 'payment_pending', total: 189900 };
  const payload = generateWompiEventPayload({
    properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents', 'transaction.nonexistent_field']
  });

  const { req, res } = createMockHttp(payload);
  await handler(req, res);

  assert.strictEqual(res.statusCode, 400, `Esperado 400, recibido ${res.statusCode}`);
  assert.ok(res.bodyData.error.includes('nonexistent_field') || res.bodyData.error.includes('no existe'));
  assert.strictEqual(dbMock.orderUpdates.length, 0, 'No debe escribir en online_orders');
  assert.strictEqual(dbMock.orderEvents.length, 0, 'No debe escribir en order_events');
  assert.strictEqual(dbMock.txUpserts.length, 0, 'No debe escribir en payment_transactions');
  assert.strictEqual(dbMock.orderRecord.status, 'payment_pending', 'Estado de la orden debe permanecer intacto');
});

// 2. Propiedades obligatorias ausentes en signature.properties
await runTest('2. Propiedades obligatorias ausentes en firma: rechazo con HTTP 400 y 0 escrituras (SEC-01)', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-REAL-1001', status: 'payment_pending', total: 189900 };
  // Firma que solo incluye transaction.id omitiendo status y amount_in_cents
  const payload = generateWompiEventPayload({
    properties: ['transaction.id']
  });

  const { req, res } = createMockHttp(payload);
  await handler(req, res);

  assert.strictEqual(res.statusCode, 400, `Esperado 400, recibido ${res.statusCode}`);
  assert.ok(res.bodyData.error.includes('obligatorias') || res.bodyData.error.includes('incompleta'));
  assert.strictEqual(dbMock.orderUpdates.length, 0);
  assert.strictEqual(dbMock.orderEvents.length, 0);
  assert.strictEqual(dbMock.txUpserts.length, 0);
  assert.strictEqual(dbMock.orderRecord.status, 'payment_pending');
});

// 3. Firma válida y evento legítimo
await runTest('3. Firma válida y evento legítimo: HTTP 200, orden pagada y transacción registrada', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-REAL-1001', status: 'payment_pending', total: 189900 };
  const payload = generateWompiEventPayload();

  const { req, res } = createMockHttp(payload);
  await handler(req, res);

  assert.strictEqual(res.statusCode, 200, `Esperado 200, recibido ${res.statusCode}`);
  assert.strictEqual(res.bodyData.success, true);
  assert.strictEqual(res.bodyData.status, 'APPROVED');
  assert.strictEqual(res.bodyData.order_status, 'paid');
  assert.strictEqual(dbMock.orderUpdates.length, 1, 'Debe haber exactamente 1 update a online_orders');
  assert.strictEqual(dbMock.orderUpdates[0].status, 'paid');
  assert.strictEqual(dbMock.orderEvents.length, 1, 'Debe haber exactamente 1 insert a order_events');
  assert.strictEqual(dbMock.txUpserts.length, 1, 'Debe haber exactamente 1 upsert a payment_transactions');
  assert.strictEqual(dbMock.txUpserts[0].wompi_transaction_id, 'tx_wompi_real_1001');
  assert.strictEqual(dbMock.orderRecord.status, 'paid', 'La orden debe quedar marcada como paid');
});

// 4. Firma inválida (checksum incorrecto)
await runTest('4. Firma inválida: rechazo criptográfico con HTTP 401 y 0 escrituras', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-REAL-1001', status: 'payment_pending', total: 189900 };
  const payload = generateWompiEventPayload({ tamperChecksum: true });

  const { req, res } = createMockHttp(payload);
  await handler(req, res);

  assert.strictEqual(res.statusCode, 401, `Esperado 401, recibido ${res.statusCode}`);
  assert.ok(res.bodyData.error.includes('inválida'));
  assert.strictEqual(dbMock.orderUpdates.length, 0);
  assert.strictEqual(dbMock.orderEvents.length, 0);
  assert.strictEqual(dbMock.txUpserts.length, 0);
  assert.strictEqual(dbMock.orderRecord.status, 'payment_pending');
});

// 5. Evento duplicado (Idempotencia estricta sin escrituras)
await runTest('5. Evento duplicado: HTTP 200 Idempotente sin escrituras redundantes', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-REAL-1001', status: 'paid', total: 189900 };
  dbMock.existingTx = {
    id: 'tx-existing-uuid',
    order_id: 'ord-1',
    status: 'APPROVED',
    wompi_transaction_id: 'tx_wompi_real_1001',
    transaction_reference: 'JM-ORD-REAL-1001',
    amount_in_cents: 18990000,
    currency: 'COP'
  };
  const payload = generateWompiEventPayload();

  const { req, res } = createMockHttp(payload);
  await handler(req, res);

  assert.strictEqual(res.statusCode, 200, `Esperado 200, recibido ${res.statusCode}`);
  assert.ok(res.bodyData.message.includes('Idempotente'));
  assert.strictEqual(dbMock.orderUpdates.length, 0, 'No debe escribir en online_orders');
  assert.strictEqual(dbMock.orderEvents.length, 0, 'No debe escribir en order_events');
  assert.strictEqual(dbMock.txUpserts.length, 0, 'No debe escribir en payment_transactions');
  assert.strictEqual(dbMock.orderRecord.status, 'paid');
});

// 6. Transacción aprobada con orden todavía pendiente (Reconciliación segura SEC-03)
await runTest('6. Transacción aprobada con orden pendiente: reconciliación a paid (SEC-03)', async () => {
  // Simular que payment_transactions ya estaba en APPROVED pero online_orders seguía en payment_pending
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-REAL-1001', status: 'payment_pending', total: 189900 };
  dbMock.existingTx = {
    id: 'tx-existing-uuid',
    order_id: 'ord-1',
    status: 'APPROVED',
    wompi_transaction_id: 'tx_wompi_real_1001',
    transaction_reference: 'JM-ORD-REAL-1001',
    amount_in_cents: 18990000,
    currency: 'COP'
  };
  const payload = generateWompiEventPayload();

  const { req, res } = createMockHttp(payload);
  await handler(req, res);

  assert.strictEqual(res.statusCode, 200, `Esperado 200, recibido ${res.statusCode}`);
  assert.strictEqual(res.bodyData.order_status, 'paid');
  // Se debe haber reconciliado la orden
  assert.strictEqual(dbMock.orderUpdates.length, 1, 'Debe actualizar online_orders a paid');
  assert.strictEqual(dbMock.orderUpdates[0].status, 'paid');
  assert.strictEqual(dbMock.orderEvents.length, 1, 'Debe registrar order_event');
  assert.strictEqual(dbMock.txUpserts.length, 0, 'No debe re-escribir payment_transactions porque ya era APPROVED');
  assert.strictEqual(dbMock.orderRecord.status, 'paid', 'La orden debe quedar en paid');
});

// 7. Fallo en cada escritura de base de datos y reintento
await runTest('7. Fallo en escrituras de base de datos y reintento (Resiliencia transaccional)', async () => {
  const payload = generateWompiEventPayload();

  // 7A: Fallo en online_orders.update
  dbMock.reset();
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-REAL-1001', status: 'payment_pending', total: 189900 };
  dbMock.updateErr = { message: 'DB connection timeout on online_orders' };
  const { req: reqA, res: resA } = createMockHttp(payload);
  await handler(reqA, resA);
  assert.strictEqual(resA.statusCode, 500);
  assert.strictEqual(dbMock.orderUpdates.length, 1);
  assert.strictEqual(dbMock.orderEvents.length, 0);
  assert.strictEqual(dbMock.txUpserts.length, 0);
  assert.strictEqual(dbMock.orderRecord.status, 'payment_pending');

  // 7B: Fallo no bloqueante en order_events.insert
  dbMock.reset();
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-REAL-1001', status: 'payment_pending', total: 189900 };
  dbMock.eventErr = { message: 'Audit event dead letter queue error' };
  const { req: reqB, res: resB } = createMockHttp(payload);
  await handler(reqB, resB);
  assert.strictEqual(resB.statusCode, 200, 'Fallo en auditoria no bloquea confirmacion de pago');
  assert.strictEqual(dbMock.orderUpdates.length, 1);
  assert.strictEqual(dbMock.txUpserts.length, 1);
  assert.strictEqual(dbMock.orderRecord.status, 'paid');

  // 7C: Fallo en payment_transactions.upsert
  dbMock.reset();
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-REAL-1001', status: 'payment_pending', total: 189900 };
  dbMock.upsertErr = { message: 'Constraint violation on payment_transactions' };
  const { req: reqC, res: resC } = createMockHttp(payload);
  await handler(reqC, resC);
  assert.strictEqual(resC.statusCode, 500);
  assert.strictEqual(dbMock.orderUpdates.length, 1, 'online_orders se actualizo a paid');
  assert.strictEqual(dbMock.txUpserts.length, 1, 'payment_transactions se intento y fallo');

  // 7D: Reintento de Wompi tras 7C (reconciliacion de tx sin duplicar orden)
  dbMock.upsertErr = null; // En el reintento la base de datos se restablece
  const { req: reqD, res: resD } = createMockHttp(payload);
  await handler(reqD, resD);
  assert.strictEqual(resD.statusCode, 200);
  assert.strictEqual(dbMock.orderUpdates.length, 1, 'No debe re-ejecutar update en online_orders');
  assert.strictEqual(dbMock.orderEvents.length, 1, 'No debe re-ejecutar order_events');
  assert.strictEqual(dbMock.txUpserts.length, 2, 'payment_transactions se escribe exitosamente en el reintento');
});

// 8. Referencia o ID asociado a otra orden (Anti-secuestro / Colisión SEC-03)
await runTest('8. Intento de secuestro de transacción o ID vinculado a otra orden: HTTP 409 (SEC-03)', async () => {
  dbMock.orderRecord = { id: 'ord-2', order_number: 'JM-ORD-REAL-1002', status: 'payment_pending', total: 189900 };
  // Simular que el wompiTxId ya estaba asignado a JM-ORD-REAL-1001 (otra referencia)
  dbMock.existingTx = {
    id: 'tx-existing-uuid',
    order_id: 'ord-1',
    status: 'APPROVED',
    wompi_transaction_id: 'tx_wompi_real_1001',
    transaction_reference: 'JM-ORD-REAL-1001',
    amount_in_cents: 18990000,
    currency: 'COP'
  };

  const payload = generateWompiEventPayload({
    txId: 'tx_wompi_real_1001',
    reference: 'JM-ORD-REAL-1002' // Referencia diferente
  });

  const { req, res } = createMockHttp(payload);
  await handler(req, res);

  assert.strictEqual(res.statusCode, 409, `Esperado 409, recibido ${res.statusCode}`);
  assert.ok(res.bodyData.error.includes('Conflicto') || res.bodyData.error.includes('distinta'));
  assert.strictEqual(dbMock.orderUpdates.length, 0);
  assert.strictEqual(dbMock.orderEvents.length, 0);
  assert.strictEqual(dbMock.txUpserts.length, 0);
  assert.strictEqual(dbMock.orderRecord.status, 'payment_pending');
});

// 9. Importe o moneda incorrectos (Prevención de Fraude)
await runTest('9. Importe o moneda incorrectos: rechazo con HTTP 422 y 0 escrituras', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-REAL-1001', status: 'payment_pending', total: 189900 };

  // 9A: Monto adulterado ($5.000 COP vs $189.900 COP)
  const payloadAmount = generateWompiEventPayload({ amountInCents: 500000 });
  const { req: reqA, res: resA } = createMockHttp(payloadAmount);
  await handler(reqA, resA);
  assert.strictEqual(resA.statusCode, 422);
  assert.ok(resA.bodyData.error.includes('Discrepancia financiera'));
  assert.strictEqual(dbMock.orderUpdates.length, 0);

  // 9B: Moneda adulterada (USD vs COP)
  const payloadCurrency = generateWompiEventPayload({ currency: 'USD' });
  const { req: reqB, res: resB } = createMockHttp(payloadCurrency);
  await handler(reqB, resB);
  assert.strictEqual(resB.statusCode, 422);
  assert.ok(resB.bodyData.error.includes('Moneda'));
  assert.strictEqual(dbMock.orderUpdates.length, 0);
});

// 10. Eventos concurrentes simultáneos (Carrera de webhooks)
await runTest('10. Eventos concurrentes simultáneos: consistencia garantizada sin estado corrupto', async () => {
  dbMock.orderRecord = { id: 'ord-concurrent', order_number: 'JM-ORD-CONCURRENT-1', status: 'payment_pending', total: 189900 };
  const payload1 = generateWompiEventPayload({ txId: 'tx_conc_1', reference: 'JM-ORD-CONCURRENT-1' });
  const payload2 = generateWompiEventPayload({ txId: 'tx_conc_1', reference: 'JM-ORD-CONCURRENT-1' });

  const { req: req1, res: res1 } = createMockHttp(payload1);
  const { req: req2, res: res2 } = createMockHttp(payload2);

  await Promise.all([handler(req1, res1), handler(req2, res2)]);

  assert.strictEqual(res1.statusCode, 200);
  assert.strictEqual(res2.statusCode, 200);
  assert.strictEqual(dbMock.orderRecord.status, 'paid');
  assert.strictEqual(dbMock.existingTx.status, 'APPROVED');
  assert.strictEqual(dbMock.existingTx.wompi_transaction_id, 'tx_conc_1');
});

// 11. Transacción cruzada: Orden ya aprobada intenta ser sobrescrita por otra transacción
await runTest('11. Transacción cruzada: orden aprobada no puede ser sobrescrita por otro tx ID (HTTP 409)', async () => {
  dbMock.orderRecord = { id: 'ord-approved', order_number: 'JM-ORD-APPROVED-1', status: 'paid', total: 189900 };
  dbMock.existingTx = {
    id: 'tx-approved-orig',
    order_id: 'ord-approved',
    status: 'APPROVED',
    wompi_transaction_id: 'tx_orig_approved',
    transaction_reference: 'JM-ORD-APPROVED-1',
    amount_in_cents: 18990000,
    currency: 'COP'
  };

  // Llega un webhook para la misma orden pero con un nuevo txId diferente
  const payloadDifferentTx = generateWompiEventPayload({
    txId: 'tx_intruder_second',
    reference: 'JM-ORD-APPROVED-1'
  });

  const { req, res } = createMockHttp(payloadDifferentTx);
  await handler(req, res);

  assert.strictEqual(res.statusCode, 409, `Esperado 409, recibido ${res.statusCode}`);
  assert.ok(res.bodyData.error.includes('Conflicto'));
  assert.strictEqual(dbMock.orderUpdates.length, 0, 'No debe modificar la orden');
  assert.strictEqual(dbMock.orderEvents.length, 0, 'No debe insertar evento');
  assert.strictEqual(dbMock.txUpserts.length, 0, 'No debe sobreescribir la transacción');
  assert.strictEqual(dbMock.existingTx.wompi_transaction_id, 'tx_orig_approved', 'Tx original permanece intacta');
});

// 12. Transiciones de estado DECLINED / ERROR / VOIDED
await runTest('12. Transiciones no aprobadas: orden pendiente cancela; orden pagada no se degrada', async () => {
  // 12A: Orden en payment_pending recibe DECLINED -> orden cancelada
  dbMock.reset();
  dbMock.orderRecord = { id: 'ord-declined', order_number: 'JM-ORD-DEC-1', status: 'payment_pending', total: 189900 };
  const payloadDeclined = generateWompiEventPayload({
    txId: 'tx_dec_1',
    reference: 'JM-ORD-DEC-1',
    status: 'DECLINED'
  });
  const { req: reqA, res: resA } = createMockHttp(payloadDeclined);
  await handler(reqA, resA);
  assert.strictEqual(resA.statusCode, 200);
  assert.strictEqual(resA.bodyData.order_status, 'cancelled');
  assert.strictEqual(dbMock.orderRecord.status, 'cancelled');
  assert.strictEqual(dbMock.orderUpdates.length, 1);
  assert.strictEqual(dbMock.orderUpdates[0].status, 'cancelled');
  assert.strictEqual(dbMock.txUpserts.length, 1);
  assert.strictEqual(dbMock.txUpserts[0].status, 'DECLINED');

  // 12B: Orden que ya estaba en 'paid' recibe DECLINED tardío -> NO se cancela
  dbMock.reset();
  dbMock.orderRecord = { id: 'ord-already-paid', order_number: 'JM-ORD-PAID-1', status: 'paid', total: 189900 };
  const payloadDeclinedLate = generateWompiEventPayload({
    txId: 'tx_dec_late',
    reference: 'JM-ORD-PAID-1',
    status: 'DECLINED'
  });
  const { req: reqB, res: resB } = createMockHttp(payloadDeclinedLate);
  await handler(reqB, resB);
  assert.strictEqual(resB.statusCode, 200);
  assert.strictEqual(resB.bodyData.order_status, 'paid', 'Orden pagada debe permanecer en paid');
  assert.strictEqual(dbMock.orderRecord.status, 'paid');
  assert.strictEqual(dbMock.orderUpdates.length, 0, 'No debe modificar online_orders');
  assert.strictEqual(dbMock.orderEvents.length, 0, 'No debe insertar order_events');
});

console.log('\n================================================================');
console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}

