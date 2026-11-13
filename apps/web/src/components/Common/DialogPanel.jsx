import React, { useEffect, useRef, useState } from 'react';

// Panel accesible de teclado para todos los modales y cajones de la tienda y del admin (D71):
// - al abrir, el foco entra en el panel (se respeta un autoFocus de los hijos; si no, el primer control);
// - Tab y Mayús+Tab no salen del panel hacia el fondo;
// - Escape cierra (solo el modal de arriba, si hay varios abiertos);
// - al cerrar, el foco vuelve al control que lo abrió (si sigue en la página y nadie movió el foco).
// El control que abre se captura durante el render (antes de que un autoFocus de los hijos mueva el foco).

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const stack = [];

// Solo controles visibles; si ninguno tiene caja (p. ej. jsdom, sin layout), se usan todos.
export const focusableIn = (root) => {
  const all = Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => !el.closest('[inert]'));
  const visible = all.filter((el) => el.getClientRects().length > 0);
  return visible.length > 0 ? visible : all;
};

export const DialogPanel = React.forwardRef(function DialogPanel(
  { onClose, onClick, children, ...rest },
  forwardedRef,
) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [opener] = useState(() => (typeof document !== 'undefined' ? document.activeElement : null));

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    stack.push(panel);

    if (!panel.contains(document.activeElement)) {
      const first = focusableIn(panel)[0];
      (first || panel).focus({ preventScroll: true });
    }

    const onKeyDown = (e) => {
      if (stack[stack.length - 1] !== panel) return;
      if (e.key === 'Escape') {
        if (onCloseRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusableIn(panel);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const i = stack.lastIndexOf(panel);
      if (i >= 0) stack.splice(i, 1);
      const active = document.activeElement;
      const focusLost = !active || active === document.body || panel.contains(active) || !active.isConnected;
      if (focusLost && opener && opener !== document.body && opener.isConnected && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true });
      }
    };
  }, [opener]);

  const setRef = (node) => {
    panelRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  return (
    <div
      ref={setRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      {...rest}
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick(e);
      }}
    >
      {children}
    </div>
  );
});

export default DialogPanel;
