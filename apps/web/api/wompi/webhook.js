import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Vercel Serverless Function: Webhook Oficial de Transacciones Wompi Colombia (Production-Ready)
// Endpoint: POST /api/wompi/webhook

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
    const eventsSecret = process.env.WOMPI_EVENTS_SECRET;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Wompi Webhook Error]: Faltan las credenciales de servicio de Supabase.');
      return res.status(500).json({ error: 'Configuración de servidor incompleta.' });
    }

    const payload = req.body;
    const event = payload?.event;
    const transaction = payload?.data?.transaction;
    const timestamp = payload?.timestamp;
    const signature = payload?.signature;

    if (!transaction || !transaction.id || !transaction.reference) {
      return res.status(400).json({ error: 'Payload incompleto de Wompi: se requiere transaction.id y transaction.reference.' });
    }

    // 1. Validar la Firma Criptográfica del Webhook (Checksum SHA-256)
    if (eventsSecret && signature && signature.checksum && signature.properties) {
      let concatenatedString = '';
      
      // Concatenar los valores de las propiedades según el arreglo signature.properties
      for (const propPath of signature.properties) {
        const parts = propPath.split('.');
        let val = payload;
        for (const part of parts) {
          val = val ? val[part] : undefined;
        }
        concatenatedString += val !== undefined ? String(val) : '';
      }
      concatenatedString += timestamp + eventsSecret;

      const calculatedChecksum = crypto.createHash('sha256').update(concatenatedString, 'utf8').digest('hex');

      if (calculatedChecksum.toLowerCase() !== signature.checksum.toLowerCase()) {
        console.error('[Wompi Webhook Security Error]: Checksum no coincide. Evento potencialmente alterado.');
        return res.status(401).json({ error: 'Firma de integridad de evento inválida.' });
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const wompiTxId = transaction.id;
    const transactionRef = transaction.reference;
    const wompiStatus = transaction.status; // 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'
    const amountInCents = transaction.amount_in_cents;
    const paymentMethodType = transaction.payment_method_type || 'CARD';

    // 2. IDEMPOTENCIA: Verificar si la transacción de Wompi ya fue procesada previamente
    const { data: existingTx } = await supabase
      .from('payment_transactions')
      .select('id, status, wompi_transaction_id')
      .or(`wompi_transaction_id.eq.${wompiTxId},transaction_reference.eq.${transactionRef}`)
      .maybeSingle();

    if (existingTx && (existingTx.status === wompiStatus || existingTx.status === 'APPROVED')) {
      console.log(`[Wompi Webhook Idempotencia]: Transacción ${wompiTxId} (Ref: ${transactionRef}) ya procesada anteriormente con estado '${existingTx.status}'.`);
      return res.status(200).json({
        success: true,
        message: 'Transacción ya procesada previamente (Idempotente)',
        status: existingTx.status
      });
    }

    // 3. Buscar Orden en online_orders por número de orden / referencia
    const { data: orderRecord, error: orderErr } = await supabase
      .from('online_orders')
      .select('id, order_number, status, total')
      .eq('order_number', transactionRef)
      .maybeSingle();

    let orderId = orderRecord?.id || null;

    if (!orderRecord) {
      console.warn(`[Wompi Webhook Warning]: No se encontró orden vinculada a la referencia ${transactionRef}. Se registrará la transacción aislada.`);
    } else {
      orderId = orderRecord.id;
      let newOrderStatus = orderRecord.status;

      if (wompiStatus === 'APPROVED') {
        newOrderStatus = 'paid';
      } else if (['DECLINED', 'ERROR', 'VOIDED'].includes(wompiStatus)) {
        // Solo cancelar si la orden no había sido previamente pagada
        if (orderRecord.status !== 'paid') {
          newOrderStatus = 'cancelled';
        }
      }

      // Actualizar estado de la orden en online_orders
      if (newOrderStatus !== orderRecord.status) {
        await supabase
          .from('online_orders')
          .update({
            status: newOrderStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderRecord.id);

        // Registrar evento en order_events
        await supabase.from('order_events').insert({
          order_id: orderRecord.id,
          event_type: 'PAYMENT_STATUS_UPDATE',
          previous_status: orderRecord.status,
          new_status: newOrderStatus,
          metadata: {
            wompi_transaction_id: wompiTxId,
            wompi_status: wompiStatus,
            payment_method_type: paymentMethodType,
            amount_in_cents: amountInCents
          }
        });
      }
    }

    // 4. Upsert en payment_transactions
    if (orderId) {
      await supabase
        .from('payment_transactions')
        .upsert({
          order_id: orderId,
          transaction_reference: transactionRef,
          wompi_transaction_id: wompiTxId,
          provider: 'Wompi',
          amount_in_cents: amountInCents,
          currency: 'COP',
          payment_method_type: paymentMethodType,
          status: wompiStatus,
          raw_response: payload,
          updated_at: new Date().toISOString()
        }, { onConflict: 'transaction_reference' });
    }

    console.log(`[Wompi Webhook Success]: Transacción ${wompiTxId} procesada con éxito para la orden ${transactionRef} (Estado: ${wompiStatus})`);

    return res.status(200).json({
      success: true,
      transaction_id: wompiTxId,
      reference: transactionRef,
      status: wompiStatus
    });
  } catch (err) {
    console.error('[Wompi Webhook Exception]:', err);
    return res.status(500).json({ error: err.message || 'Error procesando el webhook de Wompi.' });
  }
}
