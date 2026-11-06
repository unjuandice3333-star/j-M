import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { requireServerConfig } from '../_lib/serverConfig.js';

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
    // M26-T3: solo variables de servidor, validadas (SUPABASE_URL ya no cede ante VITE_SUPABASE_URL).
    const cfg = requireServerConfig(res, 'Wompi Webhook', ['APP_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WOMPI_EVENTS_SECRET']);
    if (!cfg) return;
    const supabaseUrl = cfg.SUPABASE_URL;
    const supabaseServiceKey = cfg.SUPABASE_SERVICE_ROLE_KEY;
    const eventsSecret = cfg.WOMPI_EVENTS_SECRET;

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

    // 5. APLICACIÓN TRANSACCIONAL EN LA BD (M27): apply_payment_event registra el evento (idempotencia por checksum),
    //    valida referencia, monto, moneda e id de transacción contra el intento creado por /api/wompi/signature, y
    //    aplica la máquina de estados (pago → paid; rechazo → el pedido sigue pendiente para reintentar). Si algo
    //    falla, no queda nada aplicado y Wompi reintenta. (Antes: escrituras sueltas sobre columnas inexistentes.)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: outcome, error: rpcErr } = await supabase.rpc('apply_payment_event', {
      p_event: payload,
      p_event_checksum: signature.checksum,
    });
    if (rpcErr) {
      console.error('[Wompi Webhook Error]: apply_payment_event falló:', rpcErr.message);
      return res.status(500).json({ error: 'Error al registrar el evento de pago.' });
    }

    const result = outcome?.result;
    const detail = outcome?.detail;
    if (result === 'rejected') {
      console.warn(`[Wompi Webhook]: evento rechazado (${detail}) para la referencia ${transaction.reference}`);
      const code = detail === 'amount_or_currency_mismatch' ? 422
        : detail === 'unknown_reference' ? 404
        : ['transaction_id_mismatch', 'transaction_id_reused'].includes(detail) ? 409 : 400;
      return res.status(code).json({ success: false, result, detail });
    }

    console.log(`[Wompi Webhook]: ${result}${detail ? ` (${detail})` : ''} · ${transaction.reference} · ${transaction.status}`);
    return res.status(200).json({ success: true, result, detail: detail ?? null, reference: transaction.reference, status: transaction.status, order_status: outcome?.order_status ?? null });
  } catch (err) {
    console.error('[Wompi Webhook Exception]:', err.message || err);
    return res.status(500).json({ error: 'Error procesando el webhook de Wompi.' });
  }
}
