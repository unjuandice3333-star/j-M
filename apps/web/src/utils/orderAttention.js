// Ejecución 124 (D97): por qué un pedido «Requiere revisión» y nombres legibles del historial.
// La BD marca `needs_attention` y deja el motivo en `order_events` (event_type + metadata):
//   PAID_WITHOUT_STOCK        → private.transition_order('paid') con faltantes de commit_stock_for_order
//                                (p. ej. pedido vencido que Wompi aprueba tarde y su talla ya se vendió).
//   PAYMENT_REQUIRES_REFUND   → aprobación de un intento sobre un pedido ya pagado/cancelado.
//   PAYMENT_VOIDED_AFTER_PAID → Wompi anuló un pago de un pedido que ya avanzó.
// Puro: sin React ni Supabase.

export const EVENT_LABEL = {
  ORDER_CREATED: 'Pedido creado',
  STATUS_CHANGED: 'Cambio de estado',
  PAID_WITHOUT_STOCK: 'Pagado sin stock suficiente',
  PAYMENT_REQUIRES_REFUND: 'Pago a reembolsar',
  PAYMENT_VOIDED_AFTER_PAID: 'Pago anulado después de pagado',
  PAYMENT_ATTEMPT_FAILED: 'Intento de pago fallido',
};

export const eventLabel = (type) => EVENT_LABEL[type] ?? type;

const itemLabel = (item) => (item
  ? `${item.product_name} · Talla ${item.size_code} · ${item.color_name} (SKU ${item.sku})`
  : 'Artículo del pedido');

// Devuelve [{ kind, text, lines? }] ordenado como ocurrió; vacío si el pedido no requiere revisión.
export function attentionReasons(order) {
  if (!order?.needs_attention) return [];
  const items = order.online_order_items ?? [];
  const events = [...(order.order_events ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const reasons = [];
  for (const e of events) {
    const meta = e.metadata ?? {};
    if (e.event_type === 'PAID_WITHOUT_STOCK') {
      const shortages = Array.isArray(meta.shortages) ? meta.shortages : [];
      reasons.push({
        kind: 'stock',
        text: 'El pago se confirmó cuando ya no había stock para estas prendas (por ejemplo, el pedido había vencido y el pago llegó tarde). Consigue las unidades o anula el pedido y reembolsa al cliente.',
        lines: shortages.map((s) => {
          const item = items.find((i) => i.variant_id && i.variant_id === s.variant_id);
          const available = Math.max(0, Number(s.available) || 0);
          return `${itemLabel(item)}: pidió ${Number(s.quantity) || 0}, disponibles al pagar ${available}`;
        }),
      });
    } else if (e.event_type === 'PAYMENT_REQUIRES_REFUND') {
      reasons.push({ kind: 'refund', text: `Wompi aprobó un pago que debe reembolsarse${meta.reference ? ` (referencia ${meta.reference})` : ''}: el pedido ya estaba pagado o cerrado.` });
    } else if (e.event_type === 'PAYMENT_VOIDED_AFTER_PAID') {
      reasons.push({ kind: 'voided', text: `Wompi anuló el pago${meta.reference ? ` (referencia ${meta.reference})` : ''} después de que el pedido avanzó. No lo despaches sin confirmar el cobro.` });
    }
  }
  if (!reasons.length) reasons.push({ kind: 'other', text: 'Revisa el historial del pedido y los pagos antes de despacharlo.' });
  return reasons;
}
