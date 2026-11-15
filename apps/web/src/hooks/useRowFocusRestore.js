// Ejecución 147 (D125): foco tras una acción por fila en listas del admin (reseñas, boletín, inventario).
// Al aprobar/rechazar una reseña en «Pendiente», dar de baja en «Activos» o ajustar stock (la tabla se recarga y se
// desmonta), la fila o el botón pulsado desaparecían y el foco caía en <body>: el siguiente Tab volvía a
// «Ir al contenido». Mismo criterio que D121 (libreta de direcciones), aplicado a listas:
//   1. si la fila sigue en la lista, el foco vuelve al mismo control (`data-row-action="<nombre>"`) si existe y está
//      habilitado; si no, al control de respaldo de la fila (`data-row-fallback`) o a la propia fila;
//   2. si la fila ya no está (salió del filtro), va a la fila que ocupó su lugar (o a la última), NO a uno de sus
//      botones: un segundo Enter no debe aprobar/dar de baja otra fila sin querer;
//   3. si la lista quedó vacía, al elemento `data-row-empty` (o al contenedor).
// Solo actúa si el foco se perdió (body, nodo desconectado o control deshabilitado): si el usuario ya se movió a otro
// sitio mientras se guardaba, no se le arrastra.
import { useCallback, useEffect, useRef, useState } from 'react';

const focusLost = (doc) => {
  const a = doc.activeElement;
  return !a || a === doc.body || !a.isConnected || a.disabled === true;
};
const usable = (el) => el && el.isConnected && !el.disabled;
const focusEl = (el) => {
  if (!el) return false;
  if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: false });
  return el.ownerDocument.activeElement === el;
};

/** Decide y aplica el destino del foco. Exportado para pruebas. */
export function restoreRowFocus(container, pending) {
  if (!container || !pending) return null;
  const doc = container.ownerDocument;
  if (!focusLost(doc)) return null;
  const rows = [...container.querySelectorAll('[data-row-key]')];
  const same = rows.find((r) => r.getAttribute('data-row-key') === pending.key);
  let target = null;
  if (same) {
    const action = pending.action ? same.querySelector(`[data-row-action="${pending.action}"]`) : null;
    const fallback = same.querySelector('[data-row-fallback]');
    target = usable(action) ? action : usable(fallback) ? fallback : same;
  } else if (rows.length) {
    target = rows[Math.min(Math.max(pending.index, 0), rows.length - 1)];
  } else {
    target = container.querySelector('[data-row-empty]') || container;
  }
  return focusEl(target) ? target : null;
}

/**
 * const { containerRef, remember, settle } = useRowFocusRestore();
 * remember(key, action) ANTES de la acción (guarda la posición de la fila); settle() al terminarla (en el mismo
 * lote que el último cambio de estado). El foco se decide en el efecto posterior al render.
 */
export function useRowFocusRestore() {
  const containerRef = useRef(null);
  const pending = useRef(null);
  const [tick, setTick] = useState(0);

  const remember = useCallback((key, action) => {
    const rows = containerRef.current ? [...containerRef.current.querySelectorAll('[data-row-key]')] : [];
    const k = String(key);
    pending.current = { key: k, action: action ?? null, index: rows.findIndex((r) => r.getAttribute('data-row-key') === k), ready: false };
  }, []);
  const settle = useCallback(() => {
    if (pending.current) pending.current.ready = true;
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const p = pending.current;
    if (!p?.ready) return;
    pending.current = null;
    restoreRowFocus(containerRef.current, p);
  }, [tick]);

  return { containerRef, remember, settle };
}

export default useRowFocusRestore;
