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
      id: r.id ?? null,
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

/**
 * Ejecución 135: título del bloque de devoluciones. Con una sola, igual que antes; con varias, en plural y diciendo
 * cuántas faltan por hacer en Wompi (un pedido puede tener una hecha y otra pendiente a la vez).
 */
export function refundHeading(records, format = String) {
  const total = format(refundTotal(records));
  if (records.length <= 1) return `DEVOLUCIÓN REGISTRADA · ${total}`;
  const pending = records.filter((r) => r.pending).length;
  return `DEVOLUCIONES REGISTRADAS · ${total}${pending ? ` · ${pending} ${pending === 1 ? 'pendiente' : 'pendientes'} de hacer en Wompi` : ''}`;
}

/** Texto del inventario para una devolución. */
export const refundStockText = (record) => (record.restock
  ? 'Inventario repuesto al cancelar'
  : 'Inventario sin reponer: regístralo al recibir la prenda (Inventario → ajuste «devolución»)');

// Ejecución 130 (D103): misma regla que admin_mark_refund_processed (btrim, 1–100, [A-Za-z0-9._:-]).
export const PROVIDER_REFUND_ID_MAX = 100;
const PROVIDER_REFUND_ID_RE = /^[A-Za-z0-9._:-]+$/;

/** Valida el id de la devolución en Wompi. Devuelve el mensaje de error o null. */
export function validateProviderRefundId(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Escribe el id de la devolución en Wompi (lo ves en el detalle de la transacción).';
  if (v.length > PROVIDER_REFUND_ID_MAX || !PROVIDER_REFUND_ID_RE.test(v)) {
    return 'El id de Wompi solo admite letras, números, punto, guion, dos puntos y guion bajo (máx. 100).';
  }
  return null;
}

// Ejecución 131: devoluciones que siguen `requested` (pendientes de hacer en Wompi) en el dashboard y en
// `/admin/pedidos?devolucion=pendiente`. Lectura de `order_refunds` (RLS `order_refunds_read`), sin migración.
export const PENDING_REFUND_PARAM = 'pendiente';

/** ¿La URL pide solo pedidos con devolución pendiente? (`?devolucion=pendiente`; otro valor se ignora). */
export const pendingRefundFromParam = (value) => value === PENDING_REFUND_PARAM;

/**
 * Resumen de devoluciones pendientes: cuántas, cuánto dinero falta devolver y en cuántos pedidos.
 * Ignora las que no están `requested` (por si la lectura no se filtró en la BD).
 */
export function summarizePendingRefunds(rows) {
  const pending = (rows ?? []).filter((r) => (r?.status ?? 'requested') === 'requested');
  return {
    count: pending.length,
    amount: pending.reduce((n, r) => n + (Number(r.amount) || 0), 0),
    orders: new Set(pending.map((r) => r.order_id).filter(Boolean)).size,
  };
}
