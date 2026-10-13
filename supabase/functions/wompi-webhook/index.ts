import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Supabase Edge Function: Webhook Oficial Wompi Colombia (Hardened & Audited)
// J&M FASHION STORE

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-event-checksum',
};

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
function resolveWompiProperty(propPath: string, payload: any): string | null {
  if (!propPath || typeof propPath !== 'string') return null;
  const parts = propPath.split('.');

  // 1. Buscar dentro de payload.data (estándar oficial de eventos Wompi)
  let val: any = payload?.data;
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

/**
 * Comparación en tiempo constante para evitar ataques de temporización (timing attacks).
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido. Utilice POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const rawEventsSecret = Deno.env.get('WOMPI_EVENTS_SECRET');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Wompi Edge Webhook Error]: Faltan las credenciales de servicio de Supabase.');
      return new Response(JSON.stringify({ error: 'Configuración de servidor incompleta.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const eventsSecret = rawEventsSecret ? String(rawEventsSecret).trim().replace(/^["']|["']$/g, '') : '';
    if (!eventsSecret) {
      console.error('[Wompi Edge Webhook Security Error]: WOMPI_EVENTS_SECRET no configurado en el servidor.');
      return new Response(JSON.stringify({ error: 'Configuración de servidor incompleta para verificación de eventos.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let payload: any;
    try {
      payload = await req.json();
    } catch (_e) {
      return new Response(JSON.stringify({ error: 'Payload de solicitud inválido o JSON malformado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!payload || typeof payload !== 'object') {
      return new Response(JSON.stringify({ error: 'Payload de solicitud inválido o ausente.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      console.error('[Wompi Edge Webhook Security Error]: Payload carece de estructura de firma requerida.');
      return new Response(JSON.stringify({ error: 'Firma de integridad de evento ausente o incompleta.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. VALIDACIÓN ESTRICTA DE PROPIEDADES FIRMADAS (SEC-01)
    // A. Comprobar que todas las propiedades requeridas para transacciones estén presentes en signature.properties
    const hasAllRequiredProps = REQUIRED_SIGNED_PROPERTIES.every((prop) =>
      signature.properties.includes(prop)
    );

    if (!hasAllRequiredProps) {
      console.error('[Wompi Edge Webhook Security Error]: signature.properties no incluye todas las propiedades requeridas:', REQUIRED_SIGNED_PROPERTIES);
      return new Response(JSON.stringify({ error: 'Firma incompleta: signature.properties no incluye propiedades obligatorias.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // B. Cada propiedad listada debe existir en el payload y no resolverse a null o undefined
    let concatenatedString = '';
    for (const propPath of signature.properties) {
      const propVal = resolveWompiProperty(propPath, payload);
      if (propVal === null) {
        console.error(`[Wompi Edge Webhook Security Error]: La propiedad firmada '${propPath}' no existe en el payload.`);
        return new Response(JSON.stringify({ error: `La propiedad firmada '${propPath}' no existe en los datos del evento.` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      concatenatedString += propVal;
    }
    concatenatedString += String(timestamp) + eventsSecret;

    // 3. COMPARACIÓN CRIPTOGRÁFICA EN TIEMPO CONSTANTE
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(concatenatedString));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const calculatedChecksum = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    if (!constantTimeCompare(calculatedChecksum.toLowerCase(), signature.checksum.trim().toLowerCase())) {
      console.error('[Wompi Edge Webhook Security Error]: Checksum SHA-256 no coincide.');
      return new Response(JSON.stringify({ error: 'Firma de integridad de evento inválida.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: 'Payload incompleto de Wompi: faltan campos obligatorios de la transacción.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      console.error('[Wompi Edge Webhook Error]: Error al consultar online_orders:', orderErr.message);
      return new Response(JSON.stringify({ error: 'Error al consultar la orden en la base de datos.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!orderRecord) {
      console.warn(`[Wompi Edge Webhook Warning]: No existe orden vinculada a la referencia ${transactionRef}.`);
      return new Response(JSON.stringify({ error: `Orden no encontrada para la referencia ${transactionRef}.` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. PARIDAD FINANCIERA ESTRICTA (MONTO Y MONEDA)
    if (wompiStatus === 'APPROVED') {
      const expectedAmountInCents = Math.round(Number(orderRecord.total) * 100);
      const incomingAmountInCents = Number(amountInCents);

      if (incomingAmountInCents !== expectedAmountInCents) {
        console.error(`[Wompi Edge Webhook Fraud Alert]: Discrepancia de monto para orden ${transactionRef}. Esperado: ${expectedAmountInCents}, Recibido: ${incomingAmountInCents}`);
        return new Response(JSON.stringify({ error: 'Discrepancia financiera entre el monto pagado y el total de la orden.' }), {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (currency !== 'COP') {
        console.error(`[Wompi Edge Webhook Fraud Alert]: Moneda inválida: ${currency}`);
        return new Response(JSON.stringify({ error: 'Moneda de pago inválida para la tienda J&M.' }), {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 7. CONSULTAR payment_transactions PARA IDEMPOTENCIA Y PROTECCIÓN CRUZADA (SEC-03)
    const { data: existingTx, error: existingTxErr } = await supabase
      .from('payment_transactions')
      .select('id, order_id, status, wompi_transaction_id, transaction_reference, amount_in_cents, currency')
      .or(`wompi_transaction_id.eq.${wompiTxId},transaction_reference.eq.${transactionRef}`)
      .maybeSingle();

    if (existingTxErr) {
      console.error('[Wompi Edge Webhook Error]: Error al verificar transacciones de pago:', existingTxErr.message);
      return new Response(JSON.stringify({ error: 'Error al consultar transacciones de pago en la base de datos.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Protección anti-secuestro de transacción: el wompiTxId no puede reutilizarse con otra referencia
    if (existingTx) {
      if (existingTx.wompi_transaction_id === wompiTxId && existingTx.transaction_reference !== transactionRef) {
        console.error(`[Wompi Edge Webhook Security Error]: La transacción ${wompiTxId} ya está asociada a la referencia '${existingTx.transaction_reference}', no a '${transactionRef}'.`);
        return new Response(JSON.stringify({ error: 'Conflicto: la transacción de Wompi ya fue asignada a una referencia distinta.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (existingTx.order_id && existingTx.order_id !== orderRecord.id) {
        console.error(`[Wompi Edge Webhook Security Error]: La transacción ${wompiTxId} pertenece a otra orden en la base de datos.`);
        return new Response(JSON.stringify({ error: 'Conflicto: la transacción pertenece a otro pedido.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (existingTx.transaction_reference === transactionRef && existingTx.status === 'APPROVED' && existingTx.wompi_transaction_id && existingTx.wompi_transaction_id !== wompiTxId) {
        console.error(`[Wompi Edge Webhook Security Error]: La orden ${transactionRef} ya cuenta con una transacción aprobada distinta (${existingTx.wompi_transaction_id}).`);
        return new Response(JSON.stringify({ error: 'Conflicto: la orden ya cuenta con una transacción aprobada distinta.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
      console.log(`[Wompi Edge Webhook Idempotencia]: Transacción ${wompiTxId} y orden ${transactionRef} ya están en estado final '${targetOrderStatus}'. Sin mutaciones.`);
      return new Response(JSON.stringify({
        success: true,
        message: 'Transacción ya procesada previamente (Idempotente)',
        status: existingTx.status,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 10. RECONCILIACIÓN DE ESTADOS PARCIALES:
    // A. Si la orden aún no está en el estado objetivo, actualizarla
    if (!isOrderInTargetState) {
      const { error: updateErr } = await supabase
        .from('online_orders')
        .update({ status: targetOrderStatus, updated_at: new Date().toISOString() })
        .eq('id', orderRecord.id);

      if (updateErr) {
        console.error('[Wompi Edge Webhook Error]: Fallo al actualizar online_orders:', updateErr.message);
        return new Response(JSON.stringify({ error: 'Error al actualizar el estado del pedido en la base de datos.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
          amount_in_cents: amountInCents,
        },
      });

      if (eventErr) {
        console.warn('[Wompi Edge Webhook Warning]: No se pudo registrar order_event:', eventErr.message);
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
          updated_at: new Date().toISOString(),
        }, { onConflict: 'transaction_reference' });

      if (txErr) {
        console.error('[Wompi Edge Webhook Error]: Fallo al registrar payment_transaction:', txErr.message);
        return new Response(JSON.stringify({ error: 'Error al registrar la transacción de pago.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log(`[Wompi Edge Webhook Success]: Transacción ${wompiTxId} procesada para orden ${transactionRef} (Orden: ${targetOrderStatus}, Tx: ${wompiStatus})`);

    return new Response(JSON.stringify({
      success: true,
      transaction_id: wompiTxId,
      reference: transactionRef,
      status: wompiStatus,
      order_status: targetOrderStatus,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[Wompi Edge Webhook Exception]:', err.message || err);
    return new Response(JSON.stringify({ error: err.message || 'Error procesando el webhook de Wompi.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
