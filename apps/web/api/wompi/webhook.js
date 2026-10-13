import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Vercel Serverless Function: Webhook Oficial de Transacciones Wompi Colombia (Hardened & Audited)
// Endpoint: POST /api/wompi/webhook

/**
 * Propiedades mínimas obligatorias que deben estar firmadas en eventos transaction.updated
 * para garantizar la integridad financiera (defensa en profundidad).
 */
const REQUIRED_SIGNED_PROPERTIES = [
  'transaction.id',
  'transaction.status',
  'transaction.amount_in_cents'
];

/**
 * Resuelve dinámicamente el valor de una propiedad del payload según especificación oficial de Wompi.
 * (ej: "transaction.id" navega en payload.data.transaction.id)
 * Retorna null si la propiedad no existe o es nula/indefinida (no enmascara con cadena vacía).
 */
function resolveWompiProperty(propPath, payload) {
  if (!propPath || typeof propPath !== 'string') return null;
  const parts = propPath.split('.');

  // 1. Buscar dentro de payload.data (estándar oficial de eventos Wompi)
  let val = payload?.data;
  for (const part of parts) {
    if (val === undefined || val === null) break;
    val = val[part];
  }
  if (val !== undefined && val !== null) return String(val);

  // 2. Fallback: buscar desde la raíz si la ruta ya incluía "data."
  val = payload;
  for (const part of parts) {
    if (val === undefined || val === null) break;
    val = val[part];
  }
  if (val !== undefined && val !== null) return String(val);

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Event-Checksum');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Utilice POST.' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const rawEventsSecret = process.env.WOMPI_EVENTS_SECRET;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Wompi Webhook Error]: Faltan las credenciales de servicio de Supabase.');
      return res.status(500).json({ error: 'Configuración de servidor incompleta.' });
    }

    const eventsSecret = rawEventsSecret ? String(rawEventsSecret).trim().replace(/^["']|["']$/g, '') : '';
    if (!eventsSecret) {
      console.error('[Wompi Webhook Security Error]: WOMPI_EVENTS_SECRET no configurado en el servidor.');
      return res.status(500).json({ error: 'Configuración de servidor incompleta para verificación de eventos.' });
    }

    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Payload de solicitud inválido o ausente.' });
    }

    const timestamp = payload?.timestamp;
    const signature = payload?.signature;

    // 1. VALIDACIÓN ESTRUCTURAL DE LA FIRMA
    if (
      !signature ||
      typeof signature !== 'object' ||
      !signature.checksum ||
      typeof signature.checksum !== 'string' ||
      !Array.isArray(signature.properties) ||
      signature.properties.length === 0 ||
      timestamp === undefined ||
      timestamp === null
    ) {
      console.error('[Wompi Webhook Security Error]: Payload carece de estructura de firma requerida.');
      return res.status(401).json({ error: 'Firma de integridad de evento ausente o incompleta.' });
    }

    // 2. VALIDACIÓN ESTRICTA DE PROPIEDADES FIRMADAS (SEC-01)
    // A. Comprobar que todas las propiedades requeridas para transacciones estén presentes en signature.properties
    const hasAllRequiredProps = REQUIRED_SIGNED_PROPERTIES.every((prop) =>
      signature.properties.includes(prop)
    );

    if (!hasAllRequiredProps) {
      console.error('[Wompi Webhook Security Error]: signature.properties no incluye todas las propiedades requeridas:', REQUIRED_SIGNED_PROPERTIES);
      return res.status(400).json({ error: 'Firma incompleta: signature.properties no incluye propiedades obligatorias.' });
    }

    // B. Cada propiedad listada debe existir en el payload y no resolverse a null o undefined
    let concatenatedString = '';
    for (const propPath of signature.properties) {
      const propVal = resolveWompiProperty(propPath, payload);
      if (propVal === null) {
        console.error(`[Wompi Webhook Security Error]: La propiedad firmada '${propPath}' no existe en el payload.`);
        return res.status(400).json({ error: `La propiedad firmada '${propPath}' no existe en los datos del evento.` });
      }
      concatenatedString += propVal;
    }
    concatenatedString += String(timestamp) + eventsSecret;

    // 3. COMPARACIÓN CRIPTOGRÁFICA EN TIEMPO CONSTANTE
    const calculatedChecksum = crypto.createHash('sha256').update(concatenatedString, 'utf8').digest('hex');

    const expectedBuf = Buffer.from(calculatedChecksum.toLowerCase(), 'utf8');
    const incomingBuf = Buffer.from(signature.checksum.trim().toLowerCase(), 'utf8');

    if (expectedBuf.length !== incomingBuf.length || !crypto.timingSafeEqual(expectedBuf, incomingBuf)) {
      console.error('[Wompi Webhook Security Error]: Checksum SHA-256 no coincide.');
      return res.status(401).json({ error: 'Firma de integridad de evento inválida.' });
    }

    // 4. VALIDAR ESTRUCTURA DEL PAYLOAD DE LA TRANSACCIÓN
    const transaction = payload?.data?.transaction;
    if (
      !transaction ||
      !transaction.id ||
      !transaction.reference ||
      transaction.amount_in_cents === undefined ||
      transaction.amount_in_cents === null ||
      !transaction.status
    ) {
      return res.status(400).json({ error: 'Payload incompleto de Wompi: faltan campos obligatorios de la transacción.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const wompiTxId = transaction.id;
    const transactionRef = transaction.reference;
    const wompiStatus = transaction.status; // 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'
    const amountInCents = transaction.amount_in_cents;
    const paymentMethodType = transaction.payment_method_type || 'CARD';
    const currency = transaction.currency || 'COP';

    // 5. BUSCAR ORDEN EN online_orders
    const { data: orderRecord, error: orderErr } = await supabase
      .from('online_orders')
      .select('id, order_number, status, total')
      .eq('order_number', transactionRef)
      .maybeSingle();

    if (orderErr) {
      console.error('[Wompi Webhook Error]: Error al consultar online_orders:', orderErr.message);
      return res.status(500).json({ error: 'Error al consultar la orden en la base de datos.' });
    }

    if (!orderRecord) {
      console.warn(`[Wompi Webhook Warning]: No existe orden vinculada a la referencia ${transactionRef}.`);
      return res.status(404).json({ error: `Orden no encontrada para la referencia ${transactionRef}.` });
    }

    // 6. PARIDAD FINANCIERA ESTRICTA (MONTO Y MONEDA)
    if (wompiStatus === 'APPROVED') {
      const expectedAmountInCents = Math.round(Number(orderRecord.total) * 100);
      const incomingAmountInCents = Number(amountInCents);

      if (incomingAmountInCents !== expectedAmountInCents) {
        console.error(`[Wompi Webhook Fraud Alert]: Discrepancia de monto para orden ${transactionRef}. Esperado: ${expectedAmountInCents}, Recibido: ${incomingAmountInCents}`);
        return res.status(422).json({ error: 'Discrepancia financiera entre el monto pagado y el total de la orden.' });
      }

      if (currency !== 'COP') {
        console.error(`[Wompi Webhook Fraud Alert]: Moneda inválida: ${currency}`);
        return res.status(422).json({ error: 'Moneda de pago inválida para la tienda J&M.' });
      }
    }

    // 7. CONSULTAR payment_transactions PARA IDEMPOTENCIA Y PROTECCIÓN CRUZADA (SEC-03)
    const { data: existingTx, error: existingTxErr } = await supabase
      .from('payment_transactions')
      .select('id, order_id, status, wompi_transaction_id, transaction_reference, amount_in_cents, currency')
      .or(`wompi_transaction_id.eq.${wompiTxId},transaction_reference.eq.${transactionRef}`)
      .maybeSingle();

    if (existingTxErr) {
      console.error('[Wompi Webhook Error]: Error al verificar transacciones de pago:', existingTxErr.message);
      return res.status(500).json({ error: 'Error al consultar transacciones de pago en la base de datos.' });
    }

    // Protección anti-secuestro de transacción: el wompiTxId no puede reutilizarse con otra referencia
    if (existingTx) {
      if (existingTx.wompi_transaction_id === wompiTxId && existingTx.transaction_reference !== transactionRef) {
        console.error(`[Wompi Webhook Security Error]: La transacción ${wompiTxId} ya está asociada a la referencia '${existingTx.transaction_reference}', no a '${transactionRef}'.`);
        return res.status(409).json({ error: 'Conflicto: la transacción de Wompi ya fue asignada a una referencia distinta.' });
      }

      if (existingTx.order_id && existingTx.order_id !== orderRecord.id) {
        console.error(`[Wompi Webhook Security Error]: La transacción ${wompiTxId} pertenece a otra orden en la base de datos.`);
        return res.status(409).json({ error: 'Conflicto: la transacción pertenece a otro pedido.' });
      }

      if (existingTx.transaction_reference === transactionRef && existingTx.status === 'APPROVED' && existingTx.wompi_transaction_id && existingTx.wompi_transaction_id !== wompiTxId) {
        console.error(`[Wompi Webhook Security Error]: La orden ${transactionRef} ya cuenta con una transacción aprobada distinta (${existingTx.wompi_transaction_id}).`);
        return res.status(409).json({ error: 'Conflicto: la orden ya cuenta con una transacción aprobada distinta.' });
      }
    }

    // 8. DETERMINAR ESTADO OBJETIVO DE LA ORDEN
    let targetOrderStatus = orderRecord.status;
    if (wompiStatus === 'APPROVED') {
      targetOrderStatus = 'paid';
    } else if (['DECLINED', 'ERROR', 'VOIDED'].includes(wompiStatus)) {
      if (orderRecord.status !== 'paid') {
        targetOrderStatus = 'cancelled';
      }
    }

    // 9. IDEMPOTENCIA COMPLETA (SEC-03):
    // Solo responder 200 sin mutaciones si TANTO la orden como la transacción ya están en su estado final
    const isOrderInTargetState = orderRecord.status === targetOrderStatus;
    const isTxInTargetState = Boolean(existingTx && (existingTx.status === wompiStatus || (wompiStatus === 'APPROVED' && existingTx.status === 'APPROVED')));

    if (isOrderInTargetState && isTxInTargetState) {
      console.log(`[Wompi Webhook Idempotencia]: Transacción ${wompiTxId} y orden ${transactionRef} ya están en estado final '${targetOrderStatus}'. Sin mutaciones.`);
      return res.status(200).json({
        success: true,
        message: 'Transacción ya procesada previamente (Idempotente)',
        status: existingTx.status
      });
    }

    // 10. RECONCILIACIÓN DE ESTADOS PARCIALES:
    // A. Si la orden aún no está en el estado objetivo, actualizarla
    if (!isOrderInTargetState) {
      const { error: updateErr } = await supabase
        .from('online_orders')
        .update({
          status: targetOrderStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderRecord.id);

      if (updateErr) {
        console.error('[Wompi Webhook Error]: Fallo al actualizar online_orders:', updateErr.message);
        return res.status(500).json({ error: 'Error al actualizar el estado del pedido en la base de datos.' });
      }

      const { error: eventErr } = await supabase.from('order_events').insert({
        order_id: orderRecord.id,
        event_type: 'PAYMENT_STATUS_UPDATE',
        previous_status: orderRecord.status,
        new_status: targetOrderStatus,
        metadata: {
          wompi_transaction_id: wompiTxId,
          wompi_status: wompiStatus,
          payment_method_type: paymentMethodType,
          amount_in_cents: amountInCents
        }
      });

      if (eventErr) {
        console.warn('[Wompi Webhook Warning]: No se pudo registrar order_event:', eventErr.message);
      }
    }

    // B. Si payment_transactions no existe o no tiene el estado actual, registrar/actualizar
    if (!isTxInTargetState) {
      const { error: txErr } = await supabase
        .from('payment_transactions')
        .upsert({
          order_id: orderRecord.id,
          transaction_reference: transactionRef,
          wompi_transaction_id: wompiTxId,
          provider: 'Wompi',
          amount_in_cents: amountInCents,
          currency,
          payment_method_type: paymentMethodType,
          status: wompiStatus,
          raw_response: payload,
          updated_at: new Date().toISOString()
        }, { onConflict: 'transaction_reference' });

      if (txErr) {
        console.error('[Wompi Webhook Error]: Fallo al registrar payment_transaction:', txErr.message);
        return res.status(500).json({ error: 'Error al registrar la transacción de pago.' });
      }
    }

    console.log(`[Wompi Webhook Success]: Transacción ${wompiTxId} procesada para orden ${transactionRef} (Orden: ${targetOrderStatus}, Tx: ${wompiStatus})`);

    return res.status(200).json({
      success: true,
      transaction_id: wompiTxId,
      reference: transactionRef,
      status: wompiStatus,
      order_status: targetOrderStatus
    });
  } catch (err) {
    console.error('[Wompi Webhook Exception]:', err.message || err);
    return res.status(500).json({ error: err.message || 'Error procesando el webhook de Wompi.' });
  }
}
