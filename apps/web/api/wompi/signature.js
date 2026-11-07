import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { requireServerConfig } from '../_lib/serverConfig.js';
import { createRateLimiter, clientIp } from '../_lib/rateLimit.js';

// M35: ráfagas por IP (30/min) y por pedido (6/min). Mejor esfuerzo por instancia; el límite duradero es el de la BD.
const byIp = createRateLimiter({ limit: 30, windowMs: 60_000 });
const byOrder = createRateLimiter({ limit: 6, windowMs: 60_000 });

// Vercel Serverless Function: Generador Server-Side de Firma de Integridad Wompi Colombia
// Endpoint: POST /api/wompi/signature

export default async function handler(req, res) {
  // Configurar cabeceras CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Utilice POST.' });
  }

  try {
    // M27: el cliente envía el pedido (id + token público devuelto por create_order). La BD crea el intento de pago
    // (create_payment_attempt: valida token, estado payment_pending, ventana de pago y límite de intentos) y fija la
    // referencia (<pedido>-<n>) y el monto. El navegador nunca decide el importe ni la referencia.
    // M26-T3: solo variables de servidor, validadas; sin respaldo a VITE_* ni a la llave anon.
    const cfg = requireServerConfig(res, 'Wompi Signature', ['APP_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WOMPI_INTEGRITY_SECRET', 'WOMPI_PUBLIC_KEY']);
    if (!cfg) return;

    const { order_id: orderId, public_token: publicToken } = req.body ?? {};
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID.test(String(orderId ?? '')) || !UUID.test(String(publicToken ?? ''))) {
      return res.status(400).json({ error: 'Parámetros incompletos: se requieren order_id y public_token.' });
    }


    for (const [name, limiter, key] of [['ip', byIp, clientIp(req)], ['order', byOrder, String(orderId).toLowerCase()]]) {
      const r = limiter(key);
      if (!r.allowed) {
        res.setHeader('Retry-After', String(r.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.', code: `RATE_LIMIT_${name.toUpperCase()}` });
      }
    }

    const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: attempt, error } = await supabase.rpc('create_payment_attempt', { p_order_id: orderId, p_public_token: publicToken });
    if (error) {
      const known = {
        JM_ORDER_NOT_FOUND: [404, 'No encontramos el pedido.'],
        JM_ORDER_NOT_PAYABLE: [409, 'Este pedido ya no admite pagos.'],
        JM_PAYMENT_WINDOW_EXPIRED: [410, 'El tiempo para pagar este pedido expiró. Crea un pedido nuevo.'],
        JM_TOO_MANY_ATTEMPTS: [429, 'Se alcanzó el máximo de intentos de pago para este pedido.'],
      }[error.hint];
      if (known) return res.status(known[0]).json({ error: known[1], code: error.hint });
      console.error('[Wompi Signature Error]: create_payment_attempt falló:', error.message);
      return res.status(500).json({ error: 'No se pudo preparar el pago. Inténtalo de nuevo.' });
    }

    const reference = attempt.reference;
    const amountInCents = Number(attempt.amount_in_cents);
    const currency = attempt.currency || 'COP';
    // Fórmula oficial de Wompi: SHA-256(reference + amount_in_cents + currency + integrity_secret)
    const signature = crypto.createHash('sha256').update(`${reference}${amountInCents}${currency}${cfg.WOMPI_INTEGRITY_SECRET}`, 'utf8').digest('hex');

    return res.status(200).json({
      reference,
      amount_in_cents: amountInCents,
      currency,
      signature,
      publicKey: cfg.WOMPI_PUBLIC_KEY,
      order_number: attempt.order_number,
      attempt_number: attempt.attempt_number,
      payment_expires_at: attempt.payment_expires_at,
    });
  } catch (err) {
    console.error('[Wompi Signature Exception]:', err);
    return res.status(500).json({ error: 'Error interno al generar la firma de integridad.' });
  }
}
