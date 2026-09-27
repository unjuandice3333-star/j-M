import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Webhook de confirmación de pagos Wompi Colombia (Production-Ready)
// J&M FASHION STORE — Moda Masculina Colombia

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-event-checksum',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const wompiEventsSecret = Deno.env.get('WOMPI_EVENTS_SECRET') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    const event = payload.event;
    const data = payload.data?.transaction;
    const timestamp = payload.timestamp;
    const signature = payload.signature;

    if (!data || !data.id || !data.reference) {
      return new Response(JSON.stringify({ error: 'Payload incompleto de Wompi' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Validar la Firma de Integridad del Webhook (Checksum SHA-256) si está configurado el secreto de eventos Wompi
    if (wompiEventsSecret && signature && signature.checksum) {
      const properties = signature.properties || [];
      let concatenatedString = '';
      
      // Concatenar las propiedades indicadas por la estructura oficial de Wompi
      for (const propPath of properties) {
        const pathParts = propPath.split('.');
        let val: any = payload;
        for (const part of pathParts) {
          val = val?.[part];
        }
        concatenatedString += val !== undefined ? String(val) : '';
      }
      concatenatedString += timestamp + wompiEventsSecret;

      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(concatenatedString));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const calculatedChecksum = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      if (calculatedChecksum.toLowerCase() !== signature.checksum.toLowerCase()) {
        console.error('[Wompi Webhook Error]: Checksum no coincide. Evento potencialmente alterado.');
        return new Response(JSON.stringify({ error: 'Firma de integridad inválida' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const transactionRef = data.reference;
    const wompiStatus = data.status; // 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'
    const amountInCents = data.amount_in_cents;
    const wompiTxId = data.id;
    const paymentMethodType = data.payment_method_type || 'CARD';

    // 2. Comprobar Idempotencia: Verificar si la transacción ya fue procesada anteriormente
    const { data: existingTx } = await supabase
      .from('payment_transactions')
      .select('id, status')
      .eq('wompi_transaction_id', wompiTxId)
      .single();

    if (existingTx && existingTx.status === wompiStatus) {
      console.log(`[Wompi Webhook]: Transacción ${wompiTxId} ya procesada anteriormente. (Idempotente)`);
      return new Response(JSON.stringify({ message: 'Transacción ya procesada previamente' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Buscar Orden Asociada en online_orders por la referencia
    const orderIdCandidate = transactionRef.split('-')[2]; // Extraer UUID o ID de referencia si aplica
    
    const { data: orderRecord } = await supabase
      .from('online_orders')
      .select('id, status')
      .or(`order_number.eq.${transactionRef},id.eq.${orderIdCandidate || '00000000-0000-0000-0000-000000000000'}`)
      .single();

    if (!orderRecord) {
      console.warn(`[Wompi Webhook Warning]: No se encontró orden vinculada a la referencia ${transactionRef}`);
    } else {
      // 4. Actualizar Estado de la Orden y Registrar Transacción
      let newOrderStatus = orderRecord.status;

      if (wompiStatus === 'APPROVED') {
        newOrderStatus = 'paid';
      } else if (wompiStatus === 'DECLINED' || wompiStatus === 'ERROR' || wompiStatus === 'VOIDED') {
        newOrderStatus = 'cancelled';
      }

      // Actualizar Orden
      await supabase
        .from('online_orders')
        .update({
          status: newOrderStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderRecord.id);

      // Registrar o Actualizar payment_transactions
      await supabase
        .from('payment_transactions')
        .upsert({
          order_id: orderRecord.id,
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

      console.log(`[Wompi Webhook Success]: Orden ${orderRecord.id} actualizada a estado '${newOrderStatus}' por transacción ${wompiTxId}`);
    }

    return new Response(JSON.stringify({ success: true, event, status: wompiStatus }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[Wompi Webhook Exception]:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
