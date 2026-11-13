import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

// Ejecución 104: el campo «Buscar SKU, pedido, cliente...» de la cabecera del admin era decorativo (no hacía nada al
// escribir ni al pulsar Enter). Ahora busca de verdad reutilizando las búsquedas `?q=` que ya tienen las listas:
// - Enter lleva a la lista más probable (número de pedido → pedidos; correo → clientes; lo demás → productos, que
//   busca por nombre, slug, referencia y SKU);
// - mientras hay texto se ofrecen las cuatro listas como enlaces para elegir otra.

export const ADMIN_SEARCH_SCOPES = [
  { key: 'pedidos', label: 'Pedidos', path: '/admin/pedidos', hint: 'número, cliente, correo, teléfono o guía' },
  { key: 'productos', label: 'Productos', path: '/admin/productos', hint: 'nombre, referencia o SKU' },
  { key: 'inventario', label: 'Inventario', path: '/admin/inventario', hint: 'producto, SKU, referencia o ubicación' },
  { key: 'clientes', label: 'Clientes', path: '/admin/clientes', hint: 'nombre, correo, teléfono o ciudad' },
];

const ORDER_NUMBER_RE = /^jm-?\d{1,}$/i;
const EMAIL_RE = /@/;

/** Lista a la que va Enter. Pura, para pruebas. */
export function guessAdminSearchScope(query) {
  const q = String(query ?? '').trim();
  if (ORDER_NUMBER_RE.test(q)) return 'pedidos';
  if (EMAIL_RE.test(q)) return 'clientes';
  return 'productos';
}

/** Ruta de la lista `scope` filtrada por `query` (null si no hay texto). Pura, para pruebas. */
export function adminSearchPath(scope, query) {
  const q = String(query ?? '').trim();
  const target = ADMIN_SEARCH_SCOPES.find((s) => s.key === scope);
  if (!q || !target) return null;
  return `${target.path}?${new URLSearchParams({ q }).toString()}`;
}

export function AdminGlobalSearch({ className, style }) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const trimmed = value.trim();
  const best = guessAdminSearchScope(trimmed);

  const finish = () => { setOpen(false); setValue(''); };
  const onSubmit = (e) => {
    e.preventDefault();
    const path = adminSearchPath(best, trimmed);
    if (!path) return;
    finish();
    navigate(path);
  };
  const onBlur = (e) => {
    if (!rootRef.current?.contains(e.relatedTarget)) setOpen(false);
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); }
  };

  const showList = open && trimmed !== '';
  return (
    <form ref={rootRef} role="search" aria-label="Buscar en el admin" onSubmit={onSubmit} onBlur={onBlur} onKeyDown={onKeyDown}
      className={className} style={{ position: 'relative', ...style }}>
      <Search size={16} color="#71717A" aria-hidden="true" />
      <input
        type="search"
        aria-label="Buscar SKU, pedido o cliente"
        placeholder="Buscar SKU, pedido, cliente..."
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        aria-describedby={showList ? 'jm-admin-search-hint' : undefined}
        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', width: '100%' }}
      />
      {showList && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 120, padding: '0.35rem' }}>
          <p id="jm-admin-search-hint" style={{ fontSize: '0.72rem', color: '#52525B', margin: '0.25rem 0.5rem 0.4rem' }}>
            Enter busca en {ADMIN_SEARCH_SCOPES.find((s) => s.key === best).label.toLowerCase()}, o elige:
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {ADMIN_SEARCH_SCOPES.map((s) => (
              <li key={s.key}>
                <Link to={adminSearchPath(s.key, trimmed)} onClick={finish}
                  style={{ display: 'block', padding: '0.5rem', minHeight: 44, boxSizing: 'border-box', borderRadius: 4, color: '#09090B', textDecoration: 'none', fontSize: '0.82rem', fontWeight: s.key === best ? 800 : 600, backgroundColor: s.key === best ? '#F4F4F5' : 'transparent' }}>
                  {`Buscar «${trimmed}» en ${s.label}`}
                  <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 500, color: '#71717A' }}>{s.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}

export default AdminGlobalSearch;
