// =============================================================================
// Ejecución 129 (D102): registro de devoluciones (`order_refunds`) en el detalle del pedido del ADMIN.
// La BD inserta una fila al cancelar/reembolsar un pedido pagado (private.transition_order):
//   paid|processing → cancelled|refunded   restock = true  (el stock se repone al instante)
//   delivered       → refunded             restock = false (reingresa al recibir la mercancía: ajuste «return»)
// Estado `requested` = solo registrada: el panel NO mueve dinero; la devolución se hace en Wompi (D99).
// RLS `order_refunds_read`: el admin la lee porque ve el pedido; nadie la escribe directamente.
// =============================================================================

export const REFUND_STATUS_LABEL = {
  requested: 'Registrada · pendiente de hacer en Wompi',
  approved: 'Aprobada',
  processed: 'Devuelta',
  rejected: 'Rechazada',
};

export const refundStatusLabel = (status) => REFUND_STATUS_LABEL[status] ?? status ?? 'Sin estado';

/** Devoluciones del pedido en orden cronológico, listas para mostrar (no muta el arreglo original). */
export function refundRecords(order) {
  return [...(order?.order_refunds ?? [])]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((r) => ({
      amount: Number(r.amount) || 0,
      reason: (r.reason ?? '').trim() || 'Sin motivo',
      status: r.status ?? 'requested',
      statusLabel: refundStatusLabel(r.status ?? 'requested'),
      pending: (r.status ?? 'requested') === 'requested',
      restock: r.restock === true,
      providerRefundId: r.provider_refund_id || null,
      createdAt: r.created_at ?? null,
    }));
}

/** Suma de lo registrado como devolución (excluye las rechazadas). */
export const refundTotal = (records) => records.filter((r) => r.status !== 'rejected').reduce((n, r) => n + r.amount, 0);

/** ¿Hay alguna devolución registrada que todavía debe hacerse en Wompi? */
export const hasPendingRefund = (records) => records.some((r) => r.pending);

/** Texto del inventario para una devolución. */
export const refundStockText = (record) => (record.restock
  ? 'Inventario repuesto al cancelar'
  : 'Inventario sin reponer: regístralo al recibir la prenda (Inventario → ajuste «devolución»)');
