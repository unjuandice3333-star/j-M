import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { accountSectionHeading } from '../Account/AccountSectionNav';

// Ejecución 103: en una SPA el lector de pantalla no anuncia el cambio de página y el foco se queda en el enlace
// pulsado (o cae en <body> y el siguiente Tab vuelve a empezar por la cabecera). Tras cada cambio de RUTA (no de query,
// para que los filtros del catálogo no roben el foco) se lleva el foco al <h1> de la página nueva, o a <main> si la
// página no pinta un <h1> en MAX_WAIT_MS (datos cargando, página perezosa).
// Excepciones: rutas con su propio destino (`/cuenta/pedidos|datos|direcciones` → título de la sección, D73; `#hash`
// como `#opiniones`) y páginas que ya colocaron el foco dentro de <main> (autoFocus de un formulario).

export const MAIN_ID = 'contenido';
export const MAX_WAIT_MS = 2000;

// Nivel de módulo: sobrevive a que el layout se desmonte mientras Suspense carga una página perezosa.
let lastPathname = null;
/** Solo para pruebas. */
export function __resetRouteFocus() { lastPathname = null; }

function focusTarget(el) {
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

/** Decide si un cambio de ruta debe mover el foco. Pura, para pruebas. */
export function shouldMoveFocus(prevPathname, pathname, hash) {
  if (prevPathname === null || prevPathname === pathname) return false; // carga inicial o solo cambió la query
  if (hash) return false;
  if (accountSectionHeading(pathname)) return false;
  return true;
}

export function useRouteFocus() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const prev = lastPathname;
    lastPathname = pathname;
    if (!shouldMoveFocus(prev, pathname, hash)) return undefined;
    const main = document.getElementById(MAIN_ID);
    if (!main) return undefined;

    const tryFocus = (final) => {
      const active = document.activeElement;
      if (active && active !== document.body && active !== main && main.contains(active)) return true;
      const h1 = main.querySelector('h1');
      if (h1) { focusTarget(h1); return true; }
      if (final) { focusTarget(main); return true; }
      return false;
    };
    if (tryFocus(false)) return undefined;

    let timer = null;
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { if (tryFocus(false)) stop(); })
      : null;
    function stop() {
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
      timer = null;
    }
    if (observer) observer.observe(main, { childList: true, subtree: true });
    timer = setTimeout(() => { timer = null; tryFocus(true); stop(); }, MAX_WAIT_MS);
    return stop;
  }, [pathname, hash]);
}

/** Primer control de la página: salta la cabecera y lleva el foco al contenido principal. */
export function SkipToContent() {
  const onClick = (e) => {
    // Sin navegar al fragmento: el router lo vería como cambio de ubicación.
    e.preventDefault();
    const main = document.getElementById(MAIN_ID);
    if (!main) return;
    const target = main.querySelector('h1') || main;
    focusTarget(target);
    if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'start' });
  };
  return (
    <a href={`#${MAIN_ID}`} className="jm-skip-link" onClick={onClick}>
      Ir al contenido
    </a>
  );
}
