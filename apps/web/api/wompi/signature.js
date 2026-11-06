import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { requireServerConfig } from '../_lib/serverConfig.js';

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
    const { reference, order_id } = req.body;

    if (!reference && !order_id) {
      return res.status(400).json({ error: 'Parámetros incompletos: se requiere reference u order_id.' });
    }

    // M26-T3: solo variables de servidor, validadas; sin respaldo a VITE_* ni a la llave anon.
    const cfg = requireServerConfig(res, 'Wompi Signature', ['APP_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WOMPI_INTEGRITY_SECRET', 'WOMPI_PUBLIC_KEY']);
    if (!cfg) return;
    const supabaseUrl = cfg.SUPABASE_URL;
    const supabaseServiceKey = cfg.SUPABASE_SERVICE_ROLE_KEY;
    const integritySecret = cfg.WOMPI_INTEGRITY_SECRET;
    const publicKey = cfg.WOMPI_PUBLIC_KEY;

    // 1. Obtener la orden desde Supabase para verificar el monto real autoritativo (Preventing Total Tampering)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let orderQuery = supabase.from('online_orders').select('id, order_number, total');
    
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (order_id && UUID_REGEX.test(order_id)) {
      orderQuery = orderQuery.eq('id', order_id);
    } else if (reference) {
      if (UUID_REGEX.test(reference)) {
        orderQuery = orderQuery.eq('id', reference);
      } else if (reference.startsWith('JM-ORD-') && UUID_REGEX.test(reference.slice(7))) {
        orderQuery = orderQuery.eq('id', reference.slice(7));
      } else {
        orderQuery = orderQuery.eq('order_number', reference);
      }
    } else if (order_id) {
      orderQuery = orderQuery.eq('id', order_id);
    }

    const { data: order, error: orderError } = await orderQuery.single();

    if (orderError || !order) {
      return res.status(444).json({ error: 'La orden indicada no existe en el sistema.' });
    }

    const orderReference = order.order_number;
    const amountInCents = Math.round(Number(order.total) * 100);
    const currency = 'COP';

    // 2. Generar Firma de Integridad SHA-256 Oficial de Wompi
    // Fórmula oficial: SHA-256(reference + amount_in_cents + currency + integrity_secret)
    const cleanSecret = integritySecret; // ya normalizado por readServerConfig
    const concatenatedString = `${orderReference}${amountInCents}${currency}${cleanSecret}`;
    const signature = crypto.createHash('sha256').update(concatenatedString, 'utf8').digest('hex');

    return res.status(200).json({
      success: true,
      reference: orderReference,
      amount_in_cents: amountInCents,
      currency,
      signature,
      publicKey
    });
  } catch (err) {
    console.error('[Wompi Signature Exception]:', err);
    return res.status(500).json({ error: err.message || 'Error interno al generar la firma de integridad.' });
  }
}
