import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { readEdgeConfig } from './config.ts';

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
    // M26-T3: configuración de servidor validada; sin respaldo a VITE_SUPABASE_URL ni valores por defecto.
    const cfgResult = readEdgeConfig((name) => Deno.env.get(name));
    if (!cfgResult.ok) {
      console.error(`[Wompi Edge Webhook] Configuración de servidor inválida:\n - ${cfgResult.errors.join('\n - ')}`);
      return new Response(JSON.stringify({ error: 'Configuración de servidor incompleta.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { supabaseUrl, serviceRoleKey: supabaseServiceKey, eventsSecret } = cfgResult.config;

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

    // M27: misma lógica que /api/wompi/webhook: la BD aplica el evento de forma transaccional e idempotente
    // (antes: escrituras sueltas sobre columnas que no existen en el esquema M24).
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: outcome, error: rpcErr } = await supabase.rpc('apply_payment_event', {
      p_event: payload,
      p_event_checksum: signature.checksum,
    });
    if (rpcErr) {
      console.error('[Wompi Edge Webhook Error]: apply_payment_event falló:', rpcErr.message);
      return new Response(JSON.stringify({ error: 'Error al registrar el evento de pago.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const result = outcome?.result;
    const detail = outcome?.detail;
    if (result === 'rejected') {
      const code = detail === 'amount_or_currency_mismatch' ? 422
        : detail === 'unknown_reference' ? 404
        : ['transaction_id_mismatch', 'transaction_id_reused'].includes(detail) ? 409 : 400;
      return new Response(JSON.stringify({ success: false, result, detail }), {
        status: code, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true, result, detail: detail ?? null, reference: transaction.reference,
      status: transaction.status, order_status: outcome?.order_status ?? null }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[Wompi Edge Webhook Exception]:', err.message || err);
    return new Response(JSON.stringify({ error: 'Error procesando el webhook de Wompi.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
