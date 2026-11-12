// =============================================================================
// Clientes — perfiles (profiles) + compras reales (online_orders) + direcciones (customer_addresses). RLS: solo admin.
// Las compras se cuentan solo en estados pagados (paid, processing, shipped, delivered).
// M27: reescrito; antes mostraba 0 compras, ciudad fija y un "nivel" inventado a partir del rol.
// =============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { formatCOP } from '../../utils/currency';
import supabase from '../../config/supabase';
import { STATUS_LABEL } from './AdminOrdersPage';
import { buildCustomers, customerFromParam, fetchAllRows, orderLink } from '../../utils/adminLists';
import { normalizeText } from '../../utils/catalogFilters';

const ROLE_LABEL = { customer: 'Cliente', admin: 'Administrador', super_admin: 'Super administrador' };
const ROLE_FILTERS = ['customer', 'admin', 'super_admin', 'todos'];
export const roleFilterFromParam = (value) => (ROLE_FILTERS.includes(value) ? value : 'customer');

/**
 * Ejecución 81: búsqueda sin tildes ni mayúsculas por nombre, correo, teléfono o ciudad.
 * El teléfono también coincide ignorando espacios, guiones y paréntesis («300 123-45» ≈ «30012345»).
 */
export const matchesCustomerSearch = (c, query) => {
  const q = normalizeText(query);
  if (!q) return true;
  if ([c.full_name, c.email, c.phone, c.city].some((v) => normalizeText(v).includes(q))) return true;
  const digits = q.replace(/\D/g, '');
  return digits.length >= 3 && digits.length === q.replace(/[\s+().-]/g, '').length
    && String(c.phone ?? '').replace(/\D/g, '').includes(digits);
};

export const AdminCustomersPage = () => {
  const [profiles, setProfiles] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // Búsqueda y rol en la URL (`?q=`, `?rol=`) para poder compartir o recargar la vista (ejecución 81).
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') ?? '';
  const roleFilter = roleFilterFromParam(searchParams.get('rol'));
  const setParam = (key, value, empty) => {
    const next = new URLSearchParams(searchParams);
    if (value === empty) next.delete(key); else next.set(key, value);
    setSearchParams(next, { replace: true });
  };
  const setSearchQuery = (value) => setParam('q', value, '');
  const setRoleFilter = (value) => setParam('rol', value, 'customer');
  const [selected, setSelected] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [addressError, setAddressError] = useState(null);
  // Ejecución 89: `?cliente=<id>` (enlazado desde el detalle de un pedido) abre la ficha de esa cuenta, sea cual sea el rol.
  const linkedId = customerFromParam(searchParams.get('cliente'));
  const [linkedMissing, setLinkedMissing] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, o] = await Promise.all([
        // Todas las filas, por páginas: PostgREST corta cada respuesta en max_rows (1000) sin avisar (ejecución 54).
        fetchAllRows(() => supabase.from('profiles').select('id, email, full_name, phone, role, marketing_opt_in, created_at')
          .order('created_at', { ascending: false }).order('id', { ascending: false })),
        fetchAllRows(() => supabase.from('online_orders').select('id, order_number, user_id, customer_email, customer_name, total, status, created_at, shipping_city')
          .order('created_at', { ascending: false }).order('id', { ascending: false })),
      ]);
      if (p.error || o.error) setLoadError('No se pudieron cargar los clientes.');
      else {
        setProfiles(p.data); setOrders(o.data);
        if (p.capped || o.capped) setLoadError('Hay más registros de los que el panel puede cargar; las cifras pueden estar incompletas.');
      }
      setIsLoading(false);
    })();
  }, []);

  const customers = useMemo(() => buildCustomers(profiles, orders), [profiles, orders]);

  const filtered = customers.filter((c) => (roleFilter === 'todos' || c.role === roleFilter) && matchesCustomerSearch(c, searchQuery));

  const open = async (c) => {
    setSelected(c); setAddresses([]); setAddressError(null);
    const { data, error } = await supabase.from('customer_addresses').select('recipient_name, phone, department, city, address_line, neighborhood, is_default').eq('user_id', c.id);
    if (error) setAddressError('No se pudieron cargar las direcciones.');
    else setAddresses(data ?? []);
  };
  const close = () => {
    setSelected(null);
    if (searchParams.has('cliente')) setParam('cliente', '', '');
  };

  useEffect(() => {
    if (isLoading || !linkedId) { setLinkedMissing(false); return; }
    const c = customers.find((x) => x.id === linkedId);
    setLinkedMissing(!c);
    if (c && selected?.id !== c.id) open(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, linkedId, customers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>CLIENTES ({customers.filter((c) => c.role === 'customer').length})</h1>
        <p style={{ fontSize: '0.88rem', color: '#71717A' }}>Cuentas registradas, compras pagadas y datos de contacto.</p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', backgroundColor: '#FFF', padding: '1rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #D4D4D8', borderRadius: '6px', padding: '0.5rem 0.8rem', flex: 1, minWidth: 240 }}>
          <Search size={16} color="#71717A" />
          <input aria-label="Buscar clientes" type="search" placeholder="Buscar por nombre, correo, teléfono o ciudad" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ border: 'none', outline: 'none', flex: 1 }} />
        </div>
        <select aria-label="Filtrar por rol" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ padding: '0.55rem', border: '1px solid #D4D4D8', borderRadius: '6px' }}>
          <option value="customer">Clientes</option>
          <option value="admin">Administradores</option>
          <option value="super_admin">Super administradores</option>
          <option value="todos">Todos</option>
        </select>
      </div>
      {loadError && <div role="alert" style={{ color: '#B91C1C', fontWeight: 600 }}>{loadError}</div>}
      {linkedMissing && !loadError && <div role="status" data-testid="linked-customer-missing" style={{ color: '#71717A', fontWeight: 600 }}>No se encontró la cuenta enlazada.</div>}

      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left' }}>
              {['CLIENTE', 'CONTACTO', 'COMPRAS PAGADAS', 'TOTAL', 'TICKET PROMEDIO', 'ÚLTIMA COMPRA', ''].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} style={td}>Cargando…</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={7} style={{ ...td, color: '#71717A' }}>No hay resultados.</td></tr>}
            {filtered.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                <td style={td}><div style={{ fontWeight: 800 }}>{c.full_name || 'Sin nombre'}</div><div style={{ fontSize: '0.72rem', color: '#71717A' }}>{ROLE_LABEL[c.role]} · desde {new Date(c.created_at).toLocaleDateString('es-CO')}</div></td>
                <td style={td}>{c.email}<div style={{ fontSize: '0.75rem', color: '#71717A' }}>{c.phone || 'sin teléfono'} · {c.city}</div></td>
                <td style={{ ...td, fontWeight: 800 }}>{c.ordersCount}</td>
                <td style={{ ...td, fontWeight: 800 }}>{formatCOP(c.totalSpent)}</td>
                <td style={td}>{formatCOP(c.avgTicket)}</td>
                <td style={td}>{c.lastPurchase ? new Date(c.lastPurchase).toLocaleDateString('es-CO') : '—'}</td>
                <td style={td}>
                  <button onClick={() => open(c)} style={{ textDecoration: 'underline', fontWeight: 700 }}>Ver detalle</button>
                  {/* Ejecución 88: todos sus pedidos (cualquier estado) en /admin/pedidos, con la misma atribución que esta lista. */}
                  {c.orders.length > 0 && (
                    <div><Link data-testid={`pedidos-cliente-${c.id}`} to={`/admin/pedidos?cliente=${c.id}`} style={{ fontSize: '0.75rem', textDecoration: 'underline', color: '#3730A3' }}>
                      Ver pedidos ({c.orders.length})
                    </Link></div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="modal-overlay" onClick={close}>
          <div role="dialog" aria-label={`Cliente ${selected.full_name || selected.email}`} onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFF', width: '100%', maxWidth: '640px', borderRadius: '12px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 900 }}>{selected.full_name || selected.email}</h2>
              <button onClick={close} aria-label="Cerrar"><X size={20} /></button>
            </div>
            <div style={{ fontSize: '0.88rem', display: 'grid', gap: '0.3rem', marginBottom: '1rem' }}>
              <div>{selected.email} · {selected.phone || 'sin teléfono'} · {ROLE_LABEL[selected.role]}</div>
              <div>Acepta comunicaciones: {selected.marketing_opt_in ? 'sí' : 'no'}</div>
              <div>Compras pagadas: <strong>{selected.ordersCount}</strong> · Total: <strong>{formatCOP(selected.totalSpent)}</strong></div>
            </div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: '1rem 0 0.4rem' }}>Pedidos</h3>
            {selected.orders.length === 0 ? <div style={{ color: '#71717A', fontSize: '0.85rem' }}>Sin pedidos.</div> : (
              <ul style={{ fontSize: '0.85rem', display: 'grid', gap: '0.3rem' }}>
                {selected.orders.map((o) => <li key={o.id}><Link data-testid={`pedido-${o.order_number}`} to={orderLink(o.order_number)} style={{ textDecoration: 'underline', color: '#3730A3', fontWeight: 700 }}>{o.order_number}</Link> · {new Date(o.created_at).toLocaleDateString('es-CO')} · {STATUS_LABEL[o.status]} · {formatCOP(Number(o.total))}</li>)}
              </ul>
            )}
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: '1rem 0 0.4rem' }}>Direcciones guardadas</h3>
            {addressError ? <div role="alert" style={{ color: '#B91C1C', fontSize: '0.85rem' }}>{addressError}</div> : addresses.length === 0 ? <div style={{ color: '#71717A', fontSize: '0.85rem' }}>Sin direcciones guardadas.</div> : (
              <ul style={{ fontSize: '0.85rem', display: 'grid', gap: '0.3rem' }}>
                {addresses.map((a, i) => <li key={i}>{a.recipient_name} · {a.address_line}{a.neighborhood ? `, ${a.neighborhood}` : ''}, {a.city} ({a.department}){a.is_default ? ' · principal' : ''}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const th = { padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 800, color: '#71717A', letterSpacing: '0.05em' };
const td = { padding: '0.85rem 1rem', color: '#09090B' };

export default AdminCustomersPage;
