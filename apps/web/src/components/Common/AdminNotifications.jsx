import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from './icons';
import { PENDING_REFUND_PARAM } from '../../utils/orderRefunds';

// Ejecución 105 (pendiente 0(be)): la campana de la cabecera del admin era un icono decorativo (oculto a lectores y sin
// acción). Ahora es un aviso real con los mismos contadores que ya alimentan las insignias del menú (pedidos pagados por
// preparar y reseñas pendientes): muestra el total y abre una lista de enlaces a cada lista ya filtrada.
// Ejecución 132 (pendiente 0(cc)): también avisa de las devoluciones registradas que siguen pendientes de hacer en Wompi
// (`order_refunds.status = 'requested'`) con enlace a `/admin/pedidos?devolucion=pendiente`.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Avisos a mostrar (solo los que tienen algo pendiente). Pura, para pruebas. */
export function adminNotificationItems({ ordersToPrepare = 0, pendingReviews = 0, pendingRefunds = 0 } = {}) {
  const items = [];
  if (ordersToPrepare > 0) {
    items.push({ key: 'pedidos', to: '/admin/pedidos?estado=paid', text: plural(ordersToPrepare, 'pedido pagado por preparar', 'pedidos pagados por preparar') });
  }
  if (pendingRefunds > 0) {
    items.push({ key: 'devoluciones', to: `/admin/pedidos?devolucion=${PENDING_REFUND_PARAM}`, text: plural(pendingRefunds, 'devolución pendiente en Wompi', 'devoluciones pendientes en Wompi') });
  }
  if (pendingReviews > 0) {
    items.push({ key: 'reviews', to: '/admin/reviews?estado=pending', text: plural(pendingReviews, 'reseña por moderar', 'reseñas por moderar') });
  }
  return items;
}

/** Nombre accesible del botón. Pura, para pruebas. */
export function adminNotificationsLabel(counts) {
  const items = adminNotificationItems(counts);
  return items.length ? `Avisos: ${items.map((i) => i.text).join(', ')}` : 'Avisos: sin pendientes';
}

const positive = (n) => (n > 0 ? n : 0);

export function AdminNotifications({ ordersToPrepare = 0, pendingReviews = 0, pendingRefunds = 0 }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const counts = { ordersToPrepare, pendingReviews, pendingRefunds };
  const items = adminNotificationItems(counts);
  const total = positive(ordersToPrepare) + positive(pendingReviews) + positive(pendingRefunds);
  const badge = total > 0 ? (total > 99 ? '99+' : String(total)) : null;

  const onBlur = (e) => {
    if (!rootRef.current?.contains(e.relatedTarget)) setOpen(false);
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div ref={rootRef} onBlur={onBlur} onKeyDown={onKeyDown} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        data-testid="admin-notifications"
        aria-expanded={open}
        aria-controls={open ? 'jm-admin-notifications' : undefined}
        onClick={() => setOpen((o) => !o)}
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
      >
        <Bell size={20} color="#52525B" aria-hidden="true" />
        {/* Nombre accesible como texto oculto (no aria-label): así el contenido sigue siendo traducible y buscable */}
        <span className="jm-sr-only" data-testid="admin-notifications-label">{adminNotificationsLabel(counts)}</span>
        {badge && (
          <span aria-hidden="true" data-testid="admin-notifications-badge"
            style={{ position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, backgroundColor: '#B91C1C', color: '#FFFFFF', fontSize: '0.65rem', fontWeight: 800, lineHeight: '18px', textAlign: 'center' }}>
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div id="jm-admin-notifications" role="region" aria-label="Avisos" className="jm-admin-notifications-panel"
          style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 280, maxWidth: 'calc(100vw - 2rem)', backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 120, padding: '0.5rem' }}>
          {items.length === 0 ? (
            <p style={{ margin: '0.4rem 0.5rem', fontSize: '0.85rem', color: '#3F3F46' }}>No hay pedidos por preparar, devoluciones pendientes ni reseñas por moderar.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((i) => (
                <li key={i.key}>
                  <Link to={i.to} data-testid={`admin-notification-${i.key}`} onClick={() => setOpen(false)}
                    style={{ display: 'flex', alignItems: 'center', minHeight: 36, padding: '0.4rem 0.5rem', borderRadius: 4, fontSize: '0.85rem', fontWeight: 700, color: '#09090B', textDecoration: 'underline' }}>
                    {i.text}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminNotifications;
