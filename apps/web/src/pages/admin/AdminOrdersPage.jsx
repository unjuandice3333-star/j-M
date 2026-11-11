import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Search, Eye, Truck, Check, Printer, ChevronDown, X } from 'lucide-react';
import { formatCOP } from '../../utils/currency';
import supabase from '../../config/supabase';
import { adminService } from '../../services/adminService';
import { orderService } from '../../services/orderService';
import { shippingAdminService } from '../../services/shippingAdminService';
import { shippingMethodLabel } from '../../utils/shippingPolicy';
import { ADMIN_ORDERS_PAGE_SIZE, countByStatus, fetchAllRows, orderSearchFilter, shippingMethodOptions } from '../../utils/adminLists';

const SEARCH_DEBOUNCE_MS = 300;
const ORDER_SELECT = `
        id, order_number, customer_name, customer_email, customer_phone, customer_document,
        shipping_department, shipping_city, shipping_address, shipping_neighborhood, shipping_notes, shipping_method_code,
        subtotal, discount_total, shipping_cost, total, coupon_code, status, created_at, paid_at, needs_attention,
        carrier, tracking_number, tracking_url,
        online_order_items ( product_name, sku, size_code, color_name, unit_price, quantity, line_total, image_url ),
        payment_transactions ( reference, status, amount_in_cents, payment_method_type, created_at ),
        order_events ( event_type, from_status, to_status, actor, note, created_at )`;

const mapOrder = (o) => ({
  ...o, id: o.order_number, rawId: o.id, date: new Date(o.created_at).toLocaleString('es-CO'),
  customerName: o.customer_name, total: Number(o.total),
  shippingAddress: `${o.shipping_address}${o.shipping_neighborhood ? `, ${o.shipping_neighborhood}` : ''}, ${o.shipping_city} (${o.shipping_department})`,
  paymentMethod: (o.payment_transactions ?? []).length ? `Wompi · ${o.payment_transactions.map((t) => t.status).join(', ')}` : 'Wompi · sin intentos',
});

export const STATUS_LABEL = { payment_pending: 'Pago pendiente', paid: 'Pagado', processing: 'En preparación', shipped: 'Enviado',
  delivered: 'Entregado', cancelled: 'Cancelado', expired: 'Vencido', refunded: 'Reembolsado' };
const TABS = ['todos', 'payment_pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'expired', 'refunded'];
/** Ejecución 76: la pestaña vive en la URL (`?estado=paid`) para enlazar desde el dashboard y conservarla al recargar. */
export const tabFromParam = (value) => (TABS.includes(value) ? value : 'todos');

// M27: pedidos reales (online_orders con RLS de admin) y cambios de estado por la máquina de estados de la BD
// (admin_transition_order): solo transiciones permitidas para 'admin', nota obligatoria donde la BD la exige y
// transportadora + guía al marcar como enviado.
export const AdminOrdersPage = () => {
  const [dbOrders, setDbOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedStatusTab = tabFromParam(searchParams.get('estado'));
  const setSelectedStatusTab = (st) => {
    const next = new URLSearchParams(searchParams);
    if (st === 'todos') next.delete('estado'); else next.set('estado', st);
    setSearchParams(next, { replace: true });
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('todos');
  const [transitions, setTransitions] = useState([]);
  const [shippingMethods, setShippingMethods] = useState([]);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalStatus, setModalStatus] = useState('');
  const [modalNote, setModalNote] = useState('');
  const [modalCarrier, setModalCarrier] = useState('');
  const [modalTracking, setModalTracking] = useState('');
  const [modalTrackingUrl, setModalTrackingUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [totalCount, setTotalCount] = useState(null);
  const [summaryRows, setSummaryRows] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const requestSeq = useRef(0);

  // Paginación real (ejecución 54): antes se cargaban solo los 200 más recientes y los filtros, la búsqueda y los
  // conteos se aplicaban sobre esos. Ahora estado, método y texto se filtran en la BD, la lista llega por páginas
  // (`.range()`) con conteo exacto, y los conteos de las pestañas salen de TODOS los pedidos (solo status y método).
  const buildOrdersQuery = (filters, from) => {
    let q = supabase.from('online_orders').select(ORDER_SELECT, { count: 'exact' });
    if (filters.status !== 'todos') q = q.eq('status', filters.status);
    if (filters.method !== 'todos') q = q.eq('shipping_method_code', filters.method);
    const or = orderSearchFilter(filters.query);
    if (or) q = q.or(or);
    return q.order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(from, from + ADMIN_ORDERS_PAGE_SIZE - 1);
  };

  const fetchSummary = async () => {
    const { data, error } = await fetchAllRows(() => supabase.from('online_orders').select('id, status, shipping_method_code')
      .order('created_at', { ascending: false }).order('id', { ascending: false }));
    setSummaryRows(error ? [] : data);
  };

  const filters = { status: selectedStatusTab, method: methodFilter, query: debouncedQuery };

  const fetchDbOrders = async ({ append = false } = {}) => {
    const seq = ++requestSeq.current;
    if (append) setIsLoadingMore(true); else { setIsLoading(true); }
    setLoadError(null);
    const from = append ? dbOrders.length : 0;
    const { data, error, count } = await buildOrdersQuery(filters, from);
    if (seq !== requestSeq.current) return; // llegó tarde: hay una solicitud más reciente
    if (error) { setLoadError('No se pudieron cargar los pedidos.'); setIsLoading(false); setIsLoadingMore(false); return; }
    const mapped = (data ?? []).map(mapOrder);
    setDbOrders((prev) => (append ? [...prev, ...mapped.filter((m) => !prev.some((p) => p.rawId === m.rawId))] : mapped));
    setTotalCount(typeof count === 'number' ? count : null);
    setIsLoading(false); setIsLoadingMore(false);
  };

  const refreshAll = async () => { await Promise.all([fetchDbOrders(), fetchSummary()]); };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => { fetchDbOrders(); }, [selectedStatusTab, methodFilter, debouncedQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSummary();
    orderService.getStatusCatalog().then((c) => setTransitions((c.transitions ?? []).filter((t) => t.actor === 'admin'))).catch(() => setTransitions([]));
    // Incluye métodos inactivos (el admin los lee todos): los pedidos antiguos conservan su nombre.
    shippingAdminService.list().then(setShippingMethods).catch(() => setShippingMethods([]));
  }, []);

  const statusCounts = countByStatus(summaryRows);
  const methodOptions = shippingMethodOptions(summaryRows, shippingMethods);
  const hasMore = totalCount !== null ? dbOrders.length < totalCount : false;

  const allowedNext = (status) => transitions.filter((t) => t.from === status);
  const handleOpenModal = (ord) => {
    setSelectedOrder(ord);
    setModalStatus('');
    setModalNote(''); setModalCarrier(ord.carrier || ''); setModalTracking(ord.tracking_number || ''); setModalTrackingUrl(ord.tracking_url || '');
    setModalError(null);
  };

  const handleSaveChanges = async () => {
    if (!selectedOrder || !modalStatus) { setModalError('Elige el nuevo estado.'); return; }
    const t = allowedNext(selectedOrder.status).find((x) => x.to === modalStatus);
    if (t?.requires_note && !modalNote.trim()) { setModalError('Esta transición requiere una nota (motivo).'); return; }
    if (modalStatus === 'shipped' && (!modalCarrier.trim() || !modalTracking.trim())) { setModalError('Para marcar como enviado indica transportadora y número de guía.'); return; }
    setIsSaving(true); setModalError(null);
    try {
      const tracking = modalStatus === 'shipped' ? { carrier: modalCarrier.trim(), tracking_number: modalTracking.trim(), tracking_url: modalTrackingUrl.trim() || null } : null;
      await adminService.transitionOrder(selectedOrder.rawId, modalStatus, modalNote.trim() || null, tracking);
      setNotice(`${selectedOrder.order_number}: ${STATUS_LABEL[selectedOrder.status]} → ${STATUS_LABEL[modalStatus]}.`);
      setSelectedOrder(null);
      await refreshAll();
    } catch (err) {
      setModalError(err.message || 'No se pudo cambiar el estado.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER */}
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
          PEDIDOS ({statusCounts.todos})
        </h1>
        <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
          Pagos, preparación, despacho y entrega. Los cambios de estado siguen las reglas de la tienda.
        </p>
      </div>

      {/* TOOLBAR & STATUS TABS */}
      <div style={{
        backgroundColor: '#FFFFFF',
        padding: '1.25rem',
        borderRadius: '10px',
        border: '1px solid #E4E4E7',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #D4D4D8', borderRadius: '6px', padding: '0.5rem 0.8rem', width: '320px', maxWidth: '100%' }}>
          <Search size={16} color="#71717A" />
          <input
            type="text"
            aria-label="Buscar pedidos"
            placeholder="Orden, cliente, correo, teléfono o guía"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }}
          />
        </div>

        <select aria-label="Filtrar por método de envío" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}
          style={{ padding: '0.5rem', border: '1px solid #D4D4D8', borderRadius: '6px', fontSize: '0.85rem' }}>
          <option value="todos">Todos los envíos</option>
          {methodOptions.map((c) => <option key={c} value={c}>{shippingMethodLabel(c, shippingMethods)}</option>)}
        </select>

        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {TABS.map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatusTab(st)}
              aria-pressed={selectedStatusTab === st}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                borderRadius: '6px',
                border: selectedStatusTab === st ? '1px solid #09090B' : '1px solid #E4E4E7',
                backgroundColor: selectedStatusTab === st ? '#09090B' : '#FFFFFF',
                color: selectedStatusTab === st ? '#FFFFFF' : '#71717A',
                cursor: 'pointer'
              }}
            >
              {st === 'todos' ? 'Todos' : STATUS_LABEL[st]} ({statusCounts[st] ?? 0})
            </button>
          ))}
        </div>
      </div>
      {loadError && <div role="alert" style={{ color: '#B91C1C', fontWeight: 600 }}>{loadError}</div>}
      {notice && <div role="status" style={{ color: '#065F46', fontWeight: 600 }}>{notice}</div>}

      {/* ORDERS TABLE */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#71717A' }}>
            Cargando pedidos…
          </div>
        ) : dbOrders.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#71717A', fontWeight: 600 }}>
            No hay pedidos con estos filtros.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left' }}>
                <th style={thOrder}>ORDEN #</th>
                <th style={thOrder}>FECHA</th>
                <th style={thOrder}>CLIENTE</th>
                <th style={thOrder}>MÉTODO PAGO</th>
                <th style={thOrder}>ENVÍO</th>
                <th style={thOrder}>TOTAL</th>
                <th style={thOrder}>ESTADO</th>
                <th style={{ ...thOrder, textAlign: 'right' }}>DETALLE / ACCIÓN</th>
              </tr>
            </thead>
            <tbody>
              {dbOrders.map((ord) => (
                <tr key={ord.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                  <td style={{ ...tdOrder, fontWeight: 900 }}>{ord.id}</td>
                  <td style={{ ...tdOrder, color: '#71717A' }}>{ord.date}</td>
                  <td style={tdOrder}>
                    <div style={{ fontWeight: 700 }}>{ord.customerName}</div>
                    <div style={{ fontSize: '0.75rem', color: '#71717A' }}>{ord.customer_email} · {ord.shipping_city}</div>
                    {ord.needs_attention && <div style={{ fontSize: '0.72rem', color: '#B91C1C', fontWeight: 800 }}>REQUIERE REVISIÓN</div>}
                  </td>
                  <td style={{ ...tdOrder, fontSize: '0.78rem', color: '#27272A' }}>
                    {ord.paymentMethod}
                  </td>
                  <td data-testid="order-row-shipping" style={{ ...tdOrder, fontSize: '0.78rem', color: '#27272A' }}>
                    {shippingMethodLabel(ord.shipping_method_code, shippingMethods) ?? '—'}
                  </td>
                  <td style={{ ...tdOrder, fontWeight: 900, fontSize: '0.95rem' }}>
                    {formatCOP(ord.total)}
                  </td>
                  <td style={tdOrder}>
                    <span style={statusBadgeStyle(ord.status)}>
                      {STATUS_LABEL[ord.status] ?? ord.status}
                    </span>
                  </td>
                  <td style={{ ...tdOrder, textAlign: 'right' }}>
                    <button
                      onClick={() => handleOpenModal(ord)}
                      style={{
                        backgroundColor: '#09090B',
                        color: '#FFFFFF',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      GESTIONAR
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && totalCount !== null && totalCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span data-testid="orders-page-info" style={{ fontSize: '0.85rem', color: '#71717A' }}>
            Mostrando {dbOrders.length} de {totalCount} pedidos{selectedStatusTab !== 'todos' || methodFilter !== 'todos' || debouncedQuery.trim() ? ' con estos filtros' : ''}.
          </span>
          {hasMore && (
            <button type="button" onClick={() => fetchDbOrders({ append: true })} disabled={isLoadingMore}
              style={{ padding: '0.5rem 1rem', border: '1px solid #09090B', borderRadius: '6px', backgroundColor: '#FFFFFF', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}>
              {isLoadingMore ? 'Cargando…' : 'Cargar más pedidos'}
            </button>
          )}
        </div>
      )}

      {/* ORDER DETAIL & STATUS CHANGE MODAL */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              width: '100%',
              maxWidth: '680px',
              borderRadius: '12px',
              padding: '2rem',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', letterSpacing: '0.1em' }}>GESTIÓN DE ORDEN</span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#09090B' }}>ORDEN #{selectedOrder.id}</h2>
              </div>
              <button onClick={() => setSelectedOrder(null)} style={{ padding: '0.4rem' }}>
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div role="alert" style={{ backgroundColor: '#FEF2F2', color: '#991B1B', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem', border: '1px solid #FCA5A5' }}>
                {modalError}
              </div>
            )}

            <div style={{ fontSize: '0.85rem', marginBottom: '1rem', display: 'grid', gap: '0.25rem' }}>
              <div><strong>Estado:</strong> {STATUS_LABEL[selectedOrder.status]} · <strong>Creado:</strong> {selectedOrder.date}</div>
              <div><strong>Cliente:</strong> {selectedOrder.customer_name} · {selectedOrder.customer_email} · {selectedOrder.customer_phone}</div>
              <div><strong>Envío:</strong> {selectedOrder.shippingAddress}{selectedOrder.shipping_notes ? ` · Nota: ${selectedOrder.shipping_notes}` : ''}</div>
              {selectedOrder.shipping_method_code && <div data-testid="order-shipping-method"><strong>Método de envío:</strong> {shippingMethodLabel(selectedOrder.shipping_method_code, shippingMethods)} · {Number(selectedOrder.shipping_cost) === 0 ? 'gratis' : formatCOP(Number(selectedOrder.shipping_cost))}</div>}
              <div><strong>Pago:</strong> {(selectedOrder.payment_transactions ?? []).map((t) => `${t.reference} ${t.status}`).join(' · ') || 'sin intentos de pago'}</div>
              {selectedOrder.tracking_number && <div><strong>Guía:</strong> {selectedOrder.carrier} {selectedOrder.tracking_number}</div>}
            </div>

            {/* Cambio de estado (máquina de estados de la BD) */}
            <div style={{ backgroundColor: '#FAFAFA', padding: '1.25rem', borderRadius: '8px', border: '1px solid #E4E4E7', marginBottom: '1.5rem' }}>
              <label htmlFor="order-next-status" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#09090B', marginBottom: '0.4rem' }}>
                CAMBIAR ESTADO
              </label>
              {allowedNext(selectedOrder.status).length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: '#71717A' }}>
                  {selectedOrder.status === 'payment_pending' ? 'Esperando el pago de Wompi (o cancélalo con un motivo).' : 'Este estado no admite más cambios desde el panel.'}
                </div>
              ) : null}
              {allowedNext(selectedOrder.status).length > 0 && (
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  <select id="order-next-status" value={modalStatus} onChange={(e) => setModalStatus(e.target.value)}
                    style={{ padding: '0.7rem', border: '1px solid #D4D4D8', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem' }}>
                    <option value="">Selecciona…</option>
                    {allowedNext(selectedOrder.status).map((t) => (
                      <option key={t.to} value={t.to}>{STATUS_LABEL[t.to]}{t.requires_note ? ' (requiere motivo)' : ''}</option>
                    ))}
                  </select>
                  {modalStatus === 'shipped' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <input aria-label="Transportadora" placeholder="Transportadora (ej. Coordinadora)" value={modalCarrier} onChange={(e) => setModalCarrier(e.target.value)} style={orderInput} />
                      <input aria-label="Número de guía" placeholder="Número de guía" value={modalTracking} onChange={(e) => setModalTracking(e.target.value)} style={orderInput} />
                      <input aria-label="URL de rastreo" placeholder="URL de rastreo (opcional, https://)" value={modalTrackingUrl} onChange={(e) => setModalTrackingUrl(e.target.value)} style={{ ...orderInput, gridColumn: '1 / -1' }} />
                    </div>
                  )}
                  <input aria-label="Nota del cambio" placeholder="Nota o motivo (visible en el historial)" value={modalNote} onChange={(e) => setModalNote(e.target.value)} style={orderInput} />
                </div>
              )}
            </div>

            {/* Products List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              {selectedOrder.online_order_items?.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'center', borderBottom: '1px solid #F4F4F5', paddingBottom: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{item.product_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#71717A' }}>SKU {item.sku} • Talla: {item.size_code} • Color: {item.color_name} • Cant: {item.quantity}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{formatCOP(Number(item.line_total))}</div>
                </div>
              ))}
              <div style={{ fontSize: '0.85rem', textAlign: 'right' }}>
                Subtotal {formatCOP(Number(selectedOrder.subtotal))}
                {Number(selectedOrder.discount_total) > 0 && ` · Descuento -${formatCOP(Number(selectedOrder.discount_total))}${selectedOrder.coupon_code ? ` (${selectedOrder.coupon_code})` : ''}`}
                {` · Envío${selectedOrder.shipping_method_code ? ` (${shippingMethodLabel(selectedOrder.shipping_method_code, shippingMethods)})` : ''} ${formatCOP(Number(selectedOrder.shipping_cost))} · `}<strong>Total {formatCOP(selectedOrder.total)}</strong>
              </div>
            </div>

            <details style={{ marginBottom: '1.25rem', fontSize: '0.8rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Historial del pedido</summary>
              <ul style={{ marginTop: '0.5rem' }}>
                {[...(selectedOrder.order_events ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((e, i) => (
                  <li key={i}>{new Date(e.created_at).toLocaleString('es-CO')} · {e.event_type}{e.to_status ? ` → ${STATUS_LABEL[e.to_status] ?? e.to_status}` : ''} · {e.actor}{e.note ? ` · ${e.note}` : ''}</li>
                ))}
              </ul>
            </details>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => window.print()}
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', padding: '0.75rem 1.2rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Printer size={16} /> Imprimir
              </button>

              <button
                onClick={handleSaveChanges}
                disabled={isSaving || !modalStatus}
                style={{ backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.75rem 1.5rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.85rem', opacity: isSaving ? 0.7 : 1 }}
              >
                {isSaving ? 'GUARDANDO…' : 'GUARDAR CAMBIOS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const orderInput = { padding: '0.65rem', border: '1px solid #D4D4D8', borderRadius: '6px', fontSize: '0.85rem' };

const thOrder = {
  padding: '0.85rem 1rem',
  fontSize: '0.75rem',
  fontWeight: 800,
  color: '#71717A',
  letterSpacing: '0.05em'
};

const tdOrder = {
  padding: '0.85rem 1rem',
  color: '#09090B'
};

const statusBadgeStyle = (status) => ({
  fontSize: '0.72rem',
  fontWeight: 800,
  padding: '3px 8px',
  borderRadius: '4px',
  backgroundColor:
    status === 'delivered' ? '#D1FAE5' : status === 'shipped' ? '#E0F2FE' : status === 'paid' ? '#DCFCE7' : '#FEF3C7',
  color: status === 'delivered' ? '#065F46' : status === 'shipped' ? '#0369A1' : status === 'paid' ? '#15803D' : '#92400E'
});

export default AdminOrdersPage;
