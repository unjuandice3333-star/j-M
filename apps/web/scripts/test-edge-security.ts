/**
 * TEST SUITE: SUPABASE EDGE FUNCTION WOMPI WEBHOOK SECURITY AUDIT & HARDENING (SEC-01 & SEC-03)
 * J&M Fashion Store — Moda Masculina Colombia
 * 
 * Verifica los 9 escenarios obligatorios de seguridad, idempotencia y reconciliación sobre el handler
 * real de Supabase Edge Function (supabase/functions/wompi-webhook/index.ts).
 */

import { capturedHandler } from './mock-server.ts';
import { dbMock } from './mock-supabase.ts';

// Configurar variables de entorno antes de importar
Deno.env.set('SUPABASE_URL', 'https://mock.supabase.co');
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

let totalTests = 0;
let passedTests = 0;

async function runTest(name: string, fn: () => Promise<void>) {
  totalTests++;
  dbMock.reset();
  try {
    await fn();
    console.log(`[PASS] Escenario ${totalTests}: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`[FAIL] Escenario ${totalTests}: ${name}`);
    console.error(`       Detalle: ${err.message}\n`);
  }
}

// 1. Propiedad firmada inexistente
await runTest('1. Propiedad firmada inexistente: rechazo con HTTP 400 y 0 escrituras (SEC-01)', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-EDGE-2001', status: 'payment_pending', total: 189900 };
  const payload = await generateWompiEventPayload({
    properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents', 'transaction.nonexistent_field']
  });

  const res = await capturedHandler!(createRequest(payload));
  const data = await res.json();

  if (res.status !== 400) throw new Error(`Esperado 400, recibido ${res.status}`);
  if (!data.error.includes('nonexistent_field') && !data.error.includes('no existe')) {
    throw new Error(`Mensaje de error inesperado: ${JSON.stringify(data)}`);
  }
  if (dbMock.orderUpdates.length !== 0) throw new Error('No debe escribir en online_orders');
  if (dbMock.orderEvents.length !== 0) throw new Error('No debe escribir en order_events');
  if (dbMock.txUpserts.length !== 0) throw new Error('No debe escribir en payment_transactions');
  if (dbMock.orderRecord.status !== 'payment_pending') throw new Error('Estado de orden no debe cambiar');
});

// 2. Propiedades obligatorias ausentes
await runTest('2. Propiedades obligatorias ausentes en firma: rechazo con HTTP 400 y 0 escrituras (SEC-01)', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-EDGE-2001', status: 'payment_pending', total: 189900 };
  const payload = await generateWompiEventPayload({
    properties: ['transaction.id']
  });

  const res = await capturedHandler!(createRequest(payload));
  const data = await res.json();

  if (res.status !== 400) throw new Error(`Esperado 400, recibido ${res.status}`);
  if (!data.error.includes('obligatorias') && !data.error.includes('incompleta')) {
    throw new Error(`Mensaje de error inesperado: ${JSON.stringify(data)}`);
  }
  if (dbMock.orderUpdates.length !== 0) throw new Error('No debe escribir en online_orders');
  if (dbMock.orderEvents.length !== 0) throw new Error('No debe escribir en order_events');
  if (dbMock.txUpserts.length !== 0) throw new Error('No debe escribir en payment_transactions');
});

// 3. Firma válida y evento legítimo
await runTest('3. Firma válida y evento legítimo: HTTP 200, orden pagada y transacción registrada', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-EDGE-2001', status: 'payment_pending', total: 189900 };
  const payload = await generateWompiEventPayload();

  const res = await capturedHandler!(createRequest(payload));
  const data = await res.json();

  if (res.status !== 200) throw new Error(`Esperado 200, recibido ${res.status}`);
  if (!data.success) throw new Error('success debe ser true');
  if (data.status !== 'APPROVED') throw new Error('status debe ser APPROVED');
  if (data.order_status !== 'paid') throw new Error('order_status debe ser paid');
  if (dbMock.orderUpdates.length !== 1) throw new Error('Debe haber exactamente 1 update a online_orders');
  if (dbMock.orderUpdates[0].status !== 'paid') throw new Error('update debe tener status paid');
  if (dbMock.orderEvents.length !== 1) throw new Error('Debe haber exactamente 1 insert a order_events');
  if (dbMock.txUpserts.length !== 1) throw new Error('Debe haber exactamente 1 upsert a payment_transactions');
  if (dbMock.txUpserts[0].wompi_transaction_id !== 'tx_wompi_edge_2001') throw new Error('ID de transacción incorrecto');
  if (dbMock.orderRecord.status !== 'paid') throw new Error('La orden debe quedar marcada como paid');
});

// 4. Firma inválida
await runTest('4. Firma inválida: rechazo criptográfico con HTTP 401 y 0 escrituras', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-EDGE-2001', status: 'payment_pending', total: 189900 };
  const payload = await generateWompiEventPayload({ tamperChecksum: true });

  const res = await capturedHandler!(createRequest(payload));
  const data = await res.json();

  if (res.status !== 401) throw new Error(`Esperado 401, recibido ${res.status}`);
  if (!data.error.includes('inválida')) throw new Error(`Error inesperado: ${JSON.stringify(data)}`);
  if (dbMock.orderUpdates.length !== 0) throw new Error('No debe haber escrituras');
  if (dbMock.orderEvents.length !== 0) throw new Error('No debe haber escrituras');
  if (dbMock.txUpserts.length !== 0) throw new Error('No debe haber escrituras');
});

// 5. Evento duplicado
await runTest('5. Evento duplicado: HTTP 200 Idempotente sin escrituras redundantes', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-EDGE-2001', status: 'paid', total: 189900 };
  dbMock.existingTx = {
    id: 'tx-existing-edge-uuid',
    order_id: 'ord-1',
    status: 'APPROVED',
    wompi_transaction_id: 'tx_wompi_edge_2001',
    transaction_reference: 'JM-ORD-EDGE-2001',
    amount_in_cents: 18990000,
    currency: 'COP'
  };
  const payload = await generateWompiEventPayload();

  const res = await capturedHandler!(createRequest(payload));
  const data = await res.json();

  if (res.status !== 200) throw new Error(`Esperado 200, recibido ${res.status}`);
  if (!data.message.includes('Idempotente')) throw new Error(`Esperado mensaje idempotente: ${JSON.stringify(data)}`);
  if (dbMock.orderUpdates.length !== 0) throw new Error('No debe escribir en online_orders');
  if (dbMock.orderEvents.length !== 0) throw new Error('No debe escribir en order_events');
  if (dbMock.txUpserts.length !== 0) throw new Error('No debe escribir en payment_transactions');
});

// 6. Transacción aprobada con orden todavía pendiente
await runTest('6. Transacción aprobada con orden pendiente: reconciliación a paid (SEC-03)', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-EDGE-2001', status: 'payment_pending', total: 189900 };
  dbMock.existingTx = {
    id: 'tx-existing-edge-uuid',
    order_id: 'ord-1',
    status: 'APPROVED',
    wompi_transaction_id: 'tx_wompi_edge_2001',
    transaction_reference: 'JM-ORD-EDGE-2001',
    amount_in_cents: 18990000,
    currency: 'COP'
  };
  const payload = await generateWompiEventPayload();

  const res = await capturedHandler!(createRequest(payload));
  const data = await res.json();

  if (res.status !== 200) throw new Error(`Esperado 200, recibido ${res.status}`);
  if (data.order_status !== 'paid') throw new Error('order_status debe reconciliarse a paid');
  if (dbMock.orderUpdates.length !== 1) throw new Error('Debe actualizar online_orders exactamente 1 vez');
  if (dbMock.orderUpdates[0].status !== 'paid') throw new Error('Debe ser status paid');
  if (dbMock.orderEvents.length !== 1) throw new Error('Debe registrar 1 order_event');
  if (dbMock.txUpserts.length !== 0) throw new Error('No debe re-escribir payment_transactions si ya era APPROVED');
  if (dbMock.orderRecord.status !== 'paid') throw new Error('La orden debe quedar marcada como paid');
});

// 7. Fallo en cada escritura de base de datos y reintento
await runTest('7. Fallo en escrituras de base de datos y reintento (Resiliencia transaccional)', async () => {
  const payload = await generateWompiEventPayload();

  // 7A: Fallo en update
  dbMock.reset();
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-EDGE-2001', status: 'payment_pending', total: 189900 };
  dbMock.updateErr = { message: 'DB connection timeout on online_orders' };
  const resA = await capturedHandler!(createRequest(payload));
  if (resA.status !== 500) throw new Error(`7A esperado 500, recibido ${resA.status}`);
  if (dbMock.orderUpdates.length !== 1) throw new Error('7A debe intentar 1 update');
  if (dbMock.orderEvents.length !== 0) throw new Error('7A no debe insertar eventos');
  if (dbMock.txUpserts.length !== 0) throw new Error('7A no debe escribir tx');
  if (dbMock.orderRecord.status !== 'payment_pending') throw new Error('7A orden debe seguir pendiente');

  // 7B: Fallo no bloqueante en insert order_events
  dbMock.reset();
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-EDGE-2001', status: 'payment_pending', total: 189900 };
  dbMock.eventErr = { message: 'Audit error dead letter queue' };
  const resB = await capturedHandler!(createRequest(payload));
  if (resB.status !== 200) throw new Error(`7B esperado 200, recibido ${resB.status}`);
  if (dbMock.orderUpdates.length !== 1) throw new Error('7B debe actualizar orden');
  if (dbMock.txUpserts.length !== 1) throw new Error('7B debe escribir tx');
  if (dbMock.orderRecord.status !== 'paid') throw new Error('7B orden debe ser paid');

  // 7C: Fallo en payment_transactions.upsert
  dbMock.reset();
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-EDGE-2001', status: 'payment_pending', total: 189900 };
  dbMock.upsertErr = { message: 'Constraint violation on payment_transactions' };
  const resC = await capturedHandler!(createRequest(payload));
  if (resC.status !== 500) throw new Error(`7C esperado 500, recibido ${resC.status}`);
  if (dbMock.orderUpdates.length !== 1) throw new Error('7C debe actualizar orden');
  if (dbMock.txUpserts.length !== 1) throw new Error('7C debe intentar upsert');

  // 7D: Reintento de Wompi tras 7C
  dbMock.upsertErr = null;
  const resD = await capturedHandler!(createRequest(payload));
  if (resD.status !== 200) throw new Error(`7D esperado 200, recibido ${resD.status}`);
  if (dbMock.orderUpdates.length !== 1) throw new Error('7D no debe re-actualizar orden ya pagada');
  if (dbMock.orderEvents.length !== 1) throw new Error('7D no debe duplicar evento');
  if (dbMock.txUpserts.length !== 2) throw new Error('7D debe registrar tx en reintento');
});

// 8. Referencia o ID asociado a otra orden
await runTest('8. Intento de secuestro de transacción o ID vinculado a otra orden: HTTP 409 (SEC-03)', async () => {
  dbMock.orderRecord = { id: 'ord-2', order_number: 'JM-ORD-EDGE-2002', status: 'payment_pending', total: 189900 };
  dbMock.existingTx = {
    id: 'tx-existing-edge-uuid',
    order_id: 'ord-1',
    status: 'APPROVED',
    wompi_transaction_id: 'tx_wompi_edge_2001',
    transaction_reference: 'JM-ORD-EDGE-2001',
    amount_in_cents: 18990000,
    currency: 'COP'
  };

  const payload = await generateWompiEventPayload({
    txId: 'tx_wompi_edge_2001',
    reference: 'JM-ORD-EDGE-2002'
  });

  const res = await capturedHandler!(createRequest(payload));
  const data = await res.json();

  if (res.status !== 409) throw new Error(`Esperado 409, recibido ${res.status}`);
  if (!data.error.includes('Conflicto') && !data.error.includes('distinta')) {
    throw new Error(`Mensaje inesperado: ${JSON.stringify(data)}`);
  }
  if (dbMock.orderUpdates.length !== 0) throw new Error('No debe escribir en online_orders');
  if (dbMock.orderEvents.length !== 0) throw new Error('No debe escribir en order_events');
  if (dbMock.txUpserts.length !== 0) throw new Error('No debe escribir en payment_transactions');
});

// 9. Importe o moneda incorrectos
await runTest('9. Importe o moneda incorrectos: rechazo con HTTP 422 y 0 escrituras', async () => {
  dbMock.orderRecord = { id: 'ord-1', order_number: 'JM-ORD-EDGE-2001', status: 'payment_pending', total: 189900 };

  // 9A: Monto discrepante
  const payloadAmount = await generateWompiEventPayload({ amountInCents: 500000 });
  const resA = await capturedHandler!(createRequest(payloadAmount));
  const dataA = await resA.json();
  if (resA.status !== 422) throw new Error(`Esperado 422, recibido ${resA.status}`);
  if (!dataA.error.includes('Discrepancia financiera')) throw new Error('Error inesperado');
  if (dbMock.orderUpdates.length !== 0) throw new Error('No debe escribir');

  // 9B: Moneda discrepante
  const payloadCurrency = await generateWompiEventPayload({ currency: 'USD' });
  const resB = await capturedHandler!(createRequest(payloadCurrency));
  const dataB = await resB.json();
  if (resB.status !== 422) throw new Error(`Esperado 422, recibido ${resB.status}`);
  if (!dataB.error.includes('Moneda')) throw new Error('Error inesperado');
  if (dbMock.orderUpdates.length !== 0) throw new Error('No debe escribir');
});

// 10. Eventos concurrentes simultáneos (Carrera de webhooks)
await runTest('10. Eventos concurrentes simultáneos: consistencia garantizada sin estado corrupto', async () => {
  dbMock.orderRecord = { id: 'ord-concurrent', order_number: 'JM-ORD-CONCURRENT-EDGE', status: 'payment_pending', total: 189900 };
  const payload1 = await generateWompiEventPayload({ txId: 'tx_conc_e1', reference: 'JM-ORD-CONCURRENT-EDGE' });
  const payload2 = await generateWompiEventPayload({ txId: 'tx_conc_e1', reference: 'JM-ORD-CONCURRENT-EDGE' });

  const [res1, res2] = await Promise.all([
    capturedHandler!(createRequest(payload1)),
    capturedHandler!(createRequest(payload2))
  ]);

  if (res1.status !== 200) throw new Error(`res1 esperado 200, recibido ${res1.status}`);
  if (res2.status !== 200) throw new Error(`res2 esperado 200, recibido ${res2.status}`);
  if (dbMock.orderRecord.status !== 'paid') throw new Error('Orden debe quedar en paid');
  if (dbMock.existingTx.status !== 'APPROVED') throw new Error('Tx debe quedar en APPROVED');
});

// 11. Transacción cruzada: Orden ya aprobada intenta ser sobrescrita por otra transacción
await runTest('11. Transacción cruzada: orden aprobada no puede ser sobrescrita por otro tx ID (HTTP 409)', async () => {
  dbMock.orderRecord = { id: 'ord-approved', order_number: 'JM-ORD-APPROVED-EDGE', status: 'paid', total: 189900 };
  dbMock.existingTx = {
    id: 'tx-approved-orig-edge',
    order_id: 'ord-approved',
    status: 'APPROVED',
    wompi_transaction_id: 'tx_orig_approved_edge',
    transaction_reference: 'JM-ORD-APPROVED-EDGE',
    amount_in_cents: 18990000,
    currency: 'COP'
  };

  const payloadDifferentTx = await generateWompiEventPayload({
    txId: 'tx_intruder_second_edge',
    reference: 'JM-ORD-APPROVED-EDGE'
  });

  const res = await capturedHandler!(createRequest(payloadDifferentTx));
  const data = await res.json();

  if (res.status !== 409) throw new Error(`Esperado 409, recibido ${res.status}`);
  if (!data.error.includes('Conflicto')) throw new Error('Mensaje debe indicar conflicto');
  if (dbMock.orderUpdates.length !== 0) throw new Error('No debe modificar orden');
  if (dbMock.orderEvents.length !== 0) throw new Error('No debe insertar evento');
  if (dbMock.txUpserts.length !== 0) throw new Error('No debe sobreescribir transacción');
  if (dbMock.existingTx.wompi_transaction_id !== 'tx_orig_approved_edge') throw new Error('Tx original debe preservarse');
});

// 12. Transiciones de estado DECLINED / ERROR / VOIDED
await runTest('12. Transiciones no aprobadas: orden pendiente cancela; orden pagada no se degrada', async () => {
  // 12A: Orden en payment_pending recibe DECLINED -> orden cancelada
  dbMock.reset();
  dbMock.orderRecord = { id: 'ord-declined', order_number: 'JM-ORD-DEC-EDGE', status: 'payment_pending', total: 189900 };
  const payloadDeclined = await generateWompiEventPayload({
    txId: 'tx_dec_edge',
    reference: 'JM-ORD-DEC-EDGE',
    status: 'DECLINED'
  });
  const resA = await capturedHandler!(createRequest(payloadDeclined));
  const dataA = await resA.json();
  if (resA.status !== 200) throw new Error(`12A esperado 200, recibido ${resA.status}`);
  if (dataA.order_status !== 'cancelled') throw new Error('12A order_status debe ser cancelled');
  if (dbMock.orderRecord.status !== 'cancelled') throw new Error('12A orden debe ser cancelled');
  if (dbMock.orderUpdates.length !== 1) throw new Error('12A debe actualizar orden');
  if (dbMock.txUpserts.length !== 1) throw new Error('12A debe escribir tx');

  // 12B: Orden que ya estaba en 'paid' recibe DECLINED tardío -> NO se cancela
  dbMock.reset();
  dbMock.orderRecord = { id: 'ord-already-paid', order_number: 'JM-ORD-PAID-EDGE', status: 'paid', total: 189900 };
  const payloadDeclinedLate = await generateWompiEventPayload({
    txId: 'tx_dec_late_edge',
    reference: 'JM-ORD-PAID-EDGE',
    status: 'DECLINED'
  });
  const resB = await capturedHandler!(createRequest(payloadDeclinedLate));
  const dataB = await resB.json();
  if (resB.status !== 200) throw new Error(`12B esperado 200, recibido ${resB.status}`);
  if (dataB.order_status !== 'paid') throw new Error('12B order_status debe seguir siendo paid');
  if (dbMock.orderRecord.status !== 'paid') throw new Error('12B orden debe mantenerse en paid');
  if (dbMock.orderUpdates.length !== 0) throw new Error('12B no debe actualizar orden');
  if (dbMock.orderEvents.length !== 0) throw new Error('12B no debe registrar eventos');
});

console.log('\n================================================================');
console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  Deno.exit(1);
} else {
  Deno.exit(0);
}
