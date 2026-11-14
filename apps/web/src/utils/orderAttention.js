// =============================================================================
// Ejecución 124 (D97): por qué un pedido «requiere revisión» y cómo se lee su historial.
// La BD marca `needs_attention` y deja la causa en `order_events` (metadata):
//   PAID_WITHOUT_STOCK          { shortages: [{ variant_id, quantity, available }] }  pago tardío sin stock
//   PAYMENT_REQUIRES_REFUND     { reference, provider_transaction_id, order_status }  pago que hay que reembolsar
//   PAYMENT_VOIDED_AFTER_PAID   { reference }                                         pago anulado tras pagado
//   ATTENTION_RESOLVED          note = cómo se resolvió (admin_resolve_order_attention)
//                               metadata.refunded = true si se cerró reembolsando (admin_refund_order_attention, ejecución 126)
// Solo cuentan las causas posteriores al último ATTENTION_RESOLVED (un pedido puede volver a marcarse).
// =============================================================================
export const EVENT_LABEL = {
  ORDER_CREATED: 'Pedido creado',
  STATUS_CHANGED: 'Cambio de estado',
  PAYMENT_ATTEMPT_CREATED: 'Intento de pago iniciado',
  PAYMENT_ATTEMPT_FAILED: 'Intento de pago fallido',
  PAID_WITHOUT_STOCK: 'Pagado sin stock suficiente',
  PAYMENT_REQUIRES_REFUND: 'Pago a reembolsar',
  PAYMENT_VOIDED_AFTER_PAID: 'Pago anulado después de pagado',
  ATTENTION_RESOLVED: 'Revisión cerrada',
};
export const eventLabel = (type) => EVENT_LABEL[type] ?? type;

export const ACTOR_LABEL = { system: 'sistema', customer: 'cliente', admin: 'admin', webhook: 'Wompi (webhook)' };
export const actorLabel = (actor) => ACTOR_LABEL[actor] ?? actor;

const byDate = (a, b) => String(a.created_at).localeCompare(String(b.created_at));

/** Eventos del pedido en orden cronológico (no muta el arreglo original). */
export const sortedEvents = (order) => [...(order?.order_events ?? [])].sort(byDate);

/**
 * Causas vigentes de la revisión, en orden cronológico. Cada causa: { kind, title, detail, lines? }.
 * `lines` (faltantes) cruza el `variant_id` del evento con las líneas del pedido para mostrar SKU, talla y color.
 * Con la marca puesta pero sin causa reconocible devuelve una causa genérica (nunca un panel vacío).
 */
export function attentionReasons(order) {
  if (!order?.needs_attention) return [];
  const events = sortedEvents(order);
  let start = 0;
  events.forEach((e, i) => { if (e.event_type === 'ATTENTION_RESOLVED') start = i + 1; });
  const items = order.online_order_items ?? [];
  const reasons = [];
  for (const e of events.slice(start)) {
    const meta = e.metadata ?? {};
    if (e.event_type === 'PAID_WITHOUT_STOCK') {
      const lines = (meta.shortages ?? []).map((s) => {
        const it = items.find((x) => x.variant_id && x.variant_id === s.variant_id);
        const missing = Math.max(0, Number(s.quantity) - Math.max(0, Number(s.available) || 0));
        return {
          variantId: s.variant_id,
          label: it ? `${it.product_name} · ${it.sku} · Talla ${it.size_code} · ${it.color_name}` : `Variante ${s.variant_id}`,
          quantity: Number(s.quantity) || 0,
          available: Math.max(0, Number(s.available) || 0),
          missing,
        };
      });
      reasons.push({
        kind: 'stock',
        title: 'El pago llegó cuando ya no había stock',
        detail: 'El cliente pagó después de vencer la reserva y otra compra se llevó las unidades. Repón el inventario o acuerda con el cliente un cambio o el reembolso (en el panel de Wompi).',
        lines,
      });
    } else if (e.event_type === 'PAYMENT_REQUIRES_REFUND') {
      reasons.push({
        kind: 'refund',
        title: 'Pago aprobado que hay que reembolsar',
        detail: `Wompi aprobó un pago${meta.reference ? ` (referencia ${meta.reference})` : ''} para un pedido ${meta.order_status === 'cancelled' ? 'cancelado' : 'que ya estaba pagado o cerrado'}. Reembolsa ese pago desde el panel de Wompi.`,
      });
    } else if (e.event_type === 'PAYMENT_VOIDED_AFTER_PAID') {
      reasons.push({
        kind: 'voided',
        title: 'Wompi anuló un pago ya confirmado',
        detail: `El pago${meta.reference ? ` ${meta.reference}` : ''} se anuló después de marcar el pedido como pagado. No despaches sin confirmar el pago con Wompi.`,
      });
    }
  }
  if (reasons.length === 0) {
    reasons.push({ kind: 'other', title: 'Revisión pendiente', detail: 'Revisa el historial del pedido y los pagos antes de continuar.' });
  }
  return reasons;
}

/** Texto de una línea del historial (sin fecha). */
export function eventText(e, statusLabel = {}) {
  const parts = [e.event_type === 'ATTENTION_RESOLVED' && e.metadata?.refunded ? 'Revisión cerrada con reembolso' : eventLabel(e.event_type)];
  if (e.to_status) parts[0] += ` → ${statusLabel[e.to_status] ?? e.to_status}`;
  parts.push(actorLabel(e.actor));
  if (e.note) parts.push(e.note);
  return parts.join(' · ');
}

export const RESOLVE_NOTE_MAX = 500;

/** Valida la nota de cierre (misma regla que la BD: obligatoria, ≤ 500 caracteres tras recortar). */
export function validateResolveNote(note) {
  const v = String(note ?? '').trim();
  if (!v) return 'Escribe cómo se resolvió (queda en el historial).';
  if (v.length > RESOLVE_NOTE_MAX) return `La nota no puede superar ${RESOLVE_NOTE_MAX} caracteres.`;
  return null;
}

/**
 * Ejecución 126: el atajo «Reembolsar y cerrar» solo se ofrece si la máquina de estados permite al admin pasar el
 * pedido a `refunded` desde su estado actual (paid, processing o delivered). Un pedido cancelado/vencido con un pago
 * a reembolsar no cambia de estado: se reembolsa en Wompi y se cierra con «Marcar como revisado».
 */
export function canRefundFromAttention(order, adminTransitions = []) {
  if (!order?.needs_attention) return false;
  return adminTransitions.some((t) => t.from === order.status && t.to === 'refunded');
}
