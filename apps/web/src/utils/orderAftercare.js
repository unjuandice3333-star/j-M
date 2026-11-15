// =============================================================================
// Ejecución 158 (D136): posventa en «Mis pedidos».
// - Guía de envío visible en la tarjeta del pedido (antes solo en «Ver detalle»).
// - Cambios: la política publicada (/cambios-y-devoluciones) da 30 días calendario desde la entrega y la solicitud
//   se hace por WhatsApp. La tarjeta de un pedido entregado ofrece «Solicitar cambio» con el número del pedido ya
//   escrito mientras el plazo está abierto, y dice hasta cuándo; cerrado el plazo, lo indica sin el botón.
// No hay tabla de solicitudes de cambio: la gestión es manual por WhatsApp (política vigente), y el reembolso lo
// registra el admin (D99/D102).
// =============================================================================

export const EXCHANGE_WINDOW_DAYS = 30;
export const STORE_WHATSAPP = '573000000000';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Plazo de cambio de un pedido.
 * @returns {{ state: 'open'|'closed', until: Date } | null} null si el pedido no está entregado o no tiene fecha válida.
 */
export function exchangeWindow(order, now = Date.now()) {
  if (order?.status !== 'delivered' || !order.delivered_at) return null;
  const delivered = new Date(order.delivered_at).getTime();
  if (Number.isNaN(delivered)) return null;
  const until = new Date(delivered + EXCHANGE_WINDOW_DAYS * DAY_MS);
  return { state: until.getTime() > now ? 'open' : 'closed', until };
}

/** Enlace de WhatsApp con la solicitud de cambio ya redactada (número de pedido y prendas). */
export function exchangeRequestUrl(order) {
  const items = (order?.online_order_items ?? [])
    .map((i) => `${i.product_name} (talla ${i.size_code}, ${i.color_name})`)
    .join('; ');
  const text = `Hola J&M Fashion Store, quiero solicitar un cambio del pedido ${order?.order_number ?? ''}.`
    + (items ? ` Prendas: ${items}.` : '');
  return `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

/** Datos de guía para mostrar; el enlace solo si es https (la BD ya lo exige; aquí se repite por defensa). */
export function trackingInfo(order) {
  const number = String(order?.tracking_number ?? '').trim();
  if (!number || !['shipped', 'delivered'].includes(order?.status)) return null;
  const url = typeof order.tracking_url === 'string' && /^https:\/\//i.test(order.tracking_url) ? order.tracking_url : null;
  return { carrier: String(order.carrier ?? '').trim() || null, number, url };
}
