import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { navCurrent } from '../../utils/navTaxonomy';

// Ejecución 102: `/cuenta/pedidos`, `/cuenta/datos` y `/cuenta/direcciones` pintaban la misma página desde arriba
// (la confirmación del pedido enlaza a «Ir a mis pedidos» y el cliente aterrizaba en la cabecera del perfil).
// Ahora cada ruta lleva a su sección (desplazamiento + foco en el título) y el menú marca la actual con aria-current.
export const ACCOUNT_SECTIONS = [
  { to: '/cuenta/pedidos', label: 'Mis pedidos', headingId: 'pedidos-titulo' },
  { to: '/cuenta/datos', label: 'Mis datos', headingId: 'perfil-titulo' },
  { to: '/cuenta/direcciones', label: 'Direcciones', headingId: 'direcciones-titulo' },
  { to: '/cuenta/favoritos', label: 'Favoritos', headingId: null },
];

/** Id del título de la sección que corresponde a la ruta (o null en `/cuenta`). */
export function accountSectionHeading(pathname) {
  const s = ACCOUNT_SECTIONS.find((x) => navCurrent(pathname, x.to) === 'page');
  return s?.headingId ?? null;
}

/**
 * Lleva a la sección de la ruta: desplaza hasta su título y le pasa el foco (los lectores de pantalla anuncian dónde
 * quedó el cliente). Solo cuando cambia la ruta, no en cada render. `ready` = la vista con sesión ya está pintada.
 */
export function useAccountSectionFocus(pathname, ready) {
  useEffect(() => {
    if (!ready) return undefined;
    const id = accountSectionHeading(pathname);
    if (!id) return undefined;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, ready]);
}

const linkStyle = (current) => ({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '44px',
  padding: '0 1rem',
  borderRadius: '999px',
  border: `1px solid ${current ? '#09090B' : '#E4E4E7'}`,
  backgroundColor: current ? '#09090B' : '#FFFFFF',
  color: current ? '#FFFFFF' : '#27272A',
  fontSize: '0.8rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
});

export function AccountSectionNav({ pathname }) {
  return (
    <nav aria-label="Secciones de mi cuenta" data-testid="account-section-nav" style={{ marginBottom: '2rem' }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {ACCOUNT_SECTIONS.map((s) => {
          const current = navCurrent(pathname, s.to);
          return (
            <li key={s.to}>
              <Link to={s.to} aria-current={current} style={linkStyle(Boolean(current))}>{s.label}</Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
