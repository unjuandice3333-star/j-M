import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Supabase Edge Function: Webhook Oficial Wompi Colombia (Production-Ready)
// J&M FASHION STORE

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-event-checksum',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const wompiEventsSecret = Deno.env.get('WOMPI_EVENTS_SECRET') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    const event = payload?.event;
    const transaction = payload?.data?.transaction;
    const timestamp = payload?.timestamp;
    const signature = payload?.signature;

    if (!transaction || !transaction.id || !transaction.reference) {
      return new Response(JSON.stringify({ error: 'Payload incompleto de Wompi' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Validar Checksum SHA-256 de Firma de Eventos Wompi
    if (wompiEventsSecret && signature && signature.checksum && signature.properties) {
      let concatenatedString = '';
      for (const propPath of signature.properties) {
        const parts = propPath.split('.');
        let val: any = payload;
        for (const part of parts) {
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
        console.error('[Wompi Edge Webhook Error]: Checksum no coincide.');
        return new Response(JSON.stringify({ error: 'Firma de integridad inválida' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const transactionRef = transaction.reference;
    const wompiStatus = transaction.status; // 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'
    const amountInCents = transaction.amount_in_cents;
    const wompiTxId = transaction.id;
    const paymentMethodType = transaction.payment_method_type || 'CARD';

    // 2. Idempotencia: Verificar si la transacción ya fue procesada
    const { data: existingTx } = await supabase
      .from('payment_transactions')
      .select('id, status')
      .or(`wompi_transaction_id.eq.${wompiTxId},transaction_reference.eq.${transactionRef}`)
      .maybeSingle();

    if (existingTx && (existingTx.status === wompiStatus || existingTx.status === 'APPROVED')) {
      console.log(`[Wompi Edge Webhook]: Transacción ${wompiTxId} ya procesada (Idempotente).`);
      return new Response(JSON.stringify({ message: 'Transacción ya procesada previamente', status: existingTx.status }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Buscar Orden y Actualizar
    const { data: orderRecord } = await supabase
      .from('online_orders')
      .select('id, status')
      .eq('order_number', transactionRef)
      .maybeSingle();

    if (orderRecord) {
      let newOrderStatus = orderRecord.status;
      if (wompiStatus === 'APPROVED') {
        newOrderStatus = 'paid';
      } else if (['DECLINED', 'ERROR', 'VOIDED'].includes(wompiStatus)) {
        if (orderRecord.status !== 'paid') {
          newOrderStatus = 'cancelled';
        }
      }

      if (newOrderStatus !== orderRecord.status) {
        await supabase
          .from('online_orders')
          .update({ status: newOrderStatus, updated_at: new Date().toISOString() })
          .eq('id', orderRecord.id);

        await supabase.from('order_events').insert({
          order_id: orderRecord.id,
          event_type: 'PAYMENT_STATUS_UPDATE',
          previous_status: orderRecord.status,
          new_status: newOrderStatus,
          metadata: { wompi_transaction_id: wompiTxId, wompi_status: wompiStatus }
        });
      }

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
    }

    return new Response(JSON.stringify({ success: true, status: wompiStatus }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[Wompi Edge Webhook Exception]:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
