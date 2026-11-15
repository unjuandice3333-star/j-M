// Ejecución 152 (D130): botones que cambian de estado (se deshabilitan mientras guardan o al llegar a un límite) o que
// desaparecen al terminar la acción dejaban el foco en <body> en Chromium (un control deshabilitado pierde el foco) y
// el siguiente Tab volvía a «Ir al contenido». Mismo criterio que D121/D125: solo se mueve el foco si se perdió
// (body, nodo desconectado, control deshabilitado o el propio control que lo tenía y ya no es usable); si el usuario
// ya se movió a otro sitio, no se le arrastra.
export const focusLost = (doc = document, from = null) => {
  const a = doc.activeElement;
  if (!a || a === doc.body || !a.isConnected || a.disabled === true) return true;
  return Boolean(from && a === from && (from.disabled === true || !from.isConnected));
};

const usable = (el) => el && el.isConnected && !el.disabled;

/** Enfoca el primer candidato usable si el foco se perdió. Devuelve el elemento enfocado o null. */
export function focusIfLost(candidates, { from = null } = {}) {
  const list = (Array.isArray(candidates) ? candidates : [candidates]).filter(Boolean);
  const doc = list[0]?.ownerDocument || document;
  if (!focusLost(doc, from)) return null;
  for (const el of list) {
    if (!usable(el)) continue;
    if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    el.focus();
    if (doc.activeElement === el) return el;
  }
  return null;
}

export default focusIfLost;
