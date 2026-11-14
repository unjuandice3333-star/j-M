// Aviso al CLIENTE de un pedido «en revisión» (ejecución 125, D98).
// La BD marca needs_attention cuando un pago llega tarde sin stock, se debe reembolsar o se anula después de pagado;
// el admin lo revisa y cierra la marca (D97). El cliente solo ve un aviso genérico, sin el detalle interno
// (faltantes, intentos de pago). Fuente: `under_review` (get_order_public) o `needs_attention` (sus pedidos, RLS).

const FULFILLMENT = ['paid', 'processing'];
const CLOSED = ['cancelled', 'expired'];

/** 'fulfillment' (pagado, la tienda revisa antes de despachar), 'refund' (pedido cerrado con un pago recibido) o null. */
export function orderReviewKind(order) {
  if (!order) return null;
  const flagged = (order.under_review ?? order.needs_attention) === true;
  if (!flagged) return null;
  if (FULFILLMENT.includes(order.status)) return 'fulfillment';
  if (CLOSED.includes(order.status)) return 'refund';
  return null;
}

/** Texto del aviso para el cliente (o null si no aplica). */
export function orderReviewMessage(order, email) {
  const kind = orderReviewKind(order);
  const contact = email ? `te escribiremos a ${email}` : 'te contactaremos';
  if (kind === 'fulfillment') {
    return `Recibimos tu pago. Estamos revisando la disponibilidad de tu pedido y ${contact} antes de despacharlo para confirmar cómo continuar (entrega, cambio o devolución del dinero).`;
  }
  if (kind === 'refund') {
    return `Recibimos un pago para este pedido después de cerrado. No se te cobrará por un pedido que no se enviará: ${contact} para gestionar la devolución.`;
  }
  return null;
}

// Ejecución 127: pedido `refunded`. El admin registra el reembolso después de devolver el dinero en Wompi (D99); el
// cliente debe leer que el dinero vuelve, sin la promesa de despacho ni un estado ambiguo («Pedido cerrado»).
// Un reembolso puede llegar también después de enviado/entregado (devolución): entonces no se dice «no se enviará».

/** ¿El pedido llegó a despacharse? Usa la guía o las fechas/historial que tenga la fuente (confirmación o «Mis pedidos»). */
export function orderWasShipped(order) {
  if (!order) return false;
  if (order.shipped_at || order.delivered_at || order.tracking_number || order.tracking?.tracking_number) return true;
  return (order.timeline ?? []).some((t) => t.to_status === 'shipped' || t.to_status === 'delivered');
}

/** Texto para el cliente de un pedido reembolsado (o null si el pedido no está `refunded`). */
export function orderRefundMessage(order, formatAmount) {
  if (!order || order.status !== 'refunded') return null;
  const amount = Number(order.total) > 0 && formatAmount ? ` de ${formatAmount(order.total)}` : '';
  const base = `Registramos la devolución${amount}. El dinero vuelve al mismo medio con el que pagaste; según tu banco, puede tardar algunos días hábiles en verse reflejado.`;
  return orderWasShipped(order) ? base : `${base} Este pedido no se enviará.`;
}

// Ejecución 128: pedido `cancelled` por el admin DESPUÉS de pagado (transición paid/processing → cancelled: la BD
// reingresa el stock y registra la devolución en `order_refunds`). Antes el cliente solo leía «Este pedido fue
// cancelado.», sin saber que su dinero vuelve. Un pedido cancelado sin pago (pendiente) no recibe este aviso, y el
// caso «pago recibido después de cerrado» lo cubre el aviso de revisión (orderReviewKind === 'refund').

/** ¿El pedido llegó a pagarse? `paid_at` (ambas fuentes) o el historial de la confirmación. */
export function orderWasPaid(order) {
  if (!order) return false;
  if (order.paid_at) return true;
  return (order.timeline ?? []).some((t) => t.to_status === 'paid');
}

/** Texto para el cliente de un pedido cancelado después de pagado (o null si no aplica). */
export function orderPaidCancellationMessage(order, formatAmount) {
  if (!order || order.status !== 'cancelled' || !orderWasPaid(order) || orderReviewKind(order)) return null;
  const amount = Number(order.total) > 0 && formatAmount ? ` de ${formatAmount(order.total)}` : '';
  return `Cancelamos este pedido después de recibir tu pago y registramos la devolución${amount}. El dinero vuelve al mismo medio con el que pagaste; según tu banco, puede tardar algunos días hábiles en verse reflejado. Este pedido no se enviará.`;
}
