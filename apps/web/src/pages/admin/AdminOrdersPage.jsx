import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, Search, Eye, Truck, Check, Printer, ChevronDown, X } from '../../components/Common/icons';
import { formatCOP } from '../../utils/currency';
import supabase from '../../config/supabase';
import { adminService } from '../../services/adminService';
import { orderService } from '../../services/orderService';
import { shippingAdminService } from '../../services/shippingAdminService';
import { shippingMethodLabel } from '../../utils/shippingPolicy';
import { ADMIN_ORDERS_PAGE_SIZE, couponLink, productLinkForSku, customerLinkForOrder, countByStatus, fetchAllRows, couponFromParam, customerFromParam, customerOrdersFilter, combineOrFilters, orderSearchFilter, shippingMethodOptions } from '../../utils/adminLists';
import { DialogPanel } from '../../components/Common/DialogPanel';

const SEARCH_DEBOUNCE_MS = 300;
const ORDER_ERROR_ID = 'order-modal-error';
const ORDER_FIELD_ID = { status: 'order-next-status', carrier: 'order-carrier', tracking: 'order-tracking', url: 'order-tracking-url', note: 'order-note' };
const ORDER_SELECT = `
        id, order_number, user_id, customer_name, customer_email, customer_phone, customer_document,
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
  // Ejecución 77: «solo los que requieren revisión» (needs_attention: faltó stock al pagar, pago a reembolsar o anulado tras pagar) también
  // vive en la URL (`?revision=1`) para enlazar desde la tarjeta de alertas del dashboard. Se combina con la pestaña.
  const onlyAttention = searchParams.get('revision') === '1';
  const setOnlyAttention = (on) => {
    const next = new URLSearchParams(searchParams);
    if (on) next.set('revision', '1'); else next.delete('revision');
    setSearchParams(next, { replace: true });
  };
  // Ejecución 82: la búsqueda (`?q=`) y el método de envío (`?envio=`) también viven en la URL para enlazar una búsqueda
  // y conservarla al recargar. El campo responde al instante; la URL (y la consulta a la BD) se actualizan tras el debounce.
  const urlQuery = searchParams.get('q') ?? '';
  const methodFilter = searchParams.get('envio') || 'todos';
  const setMethodFilter = (code) => {
    const next = new URLSearchParams(searchParams);
    if (!code || code === 'todos') next.delete('envio'); else next.set('envio', code);
    setSearchParams(next, { replace: true });
  };
  // Ejecución 87: filtro por cupón (`?cupon=CODIGO`, sobre online_orders.coupon_code) para enlazar desde la columna USOS
  // de /admin/descuentos. El código se normaliza como la BD (mayúsculas, sin espacios); uno inválido se ignora.
  const couponFilter = couponFromParam(searchParams.get('cupon'));
  const clearCouponFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('cupon');
    setSearchParams(next, { replace: true });
  };
  // Ejecución 88: pedidos de un cliente (`?cliente=<id>`), enlazado desde /admin/clientes. Se lee su perfil para aplicar
  // la misma atribución que la lista de clientes (cuenta + pedidos de invitado con su correo) y mostrar su nombre.
  const customerId = customerFromParam(searchParams.get('cliente'));
  const [customer, setCustomer] = useState({ id: null, status: 'idle', profile: null });
  const clearCustomerFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('cliente');
    setSearchParams(next, { replace: true });
  };
  useEffect(() => {
    if (!customerId) { setCustomer({ id: null, status: 'idle', profile: null }); return undefined; }
    let alive = true;
    setCustomer({ id: customerId, status: 'loading', profile: null });
    supabase.from('profiles').select('id, email, full_name').eq('id', customerId).maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setCustomer({ id: customerId, status: 'error', profile: null });
        else setCustomer({ id: customerId, status: data ? 'ok' : 'missing', profile: data ?? { id: customerId } });
      });
    return () => { alive = false; };
  }, [customerId]);
  const customerReady = !customerId || (customer.id === customerId && customer.status !== 'loading');
  // Sin perfil (no existe o falló la lectura) se filtra solo por user_id: nunca se muestran pedidos de otros clientes.
  const customerFilter = customerId && customerReady ? customerOrdersFilter(customer.profile ?? { id: customerId }) : null;
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const lastWrittenQuery = useRef(urlQuery);
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
  const [modalErrorFields, setModalErrorFields] = useState([]);
  const [notice, setNotice] = useState(null);

  const [totalCount, setTotalCount] = useState(null);
  const [summaryRows, setSummaryRows] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const debouncedQuery = urlQuery;
  const requestSeq = useRef(0);

  // Paginación real (ejecución 54): antes se cargaban solo los 200 más recientes y los filtros, la búsqueda y los
  // conteos se aplicaban sobre esos. Ahora estado, método y texto se filtran en la BD, la lista llega por páginas
  // (`.range()`) con conteo exacto, y los conteos de las pestañas salen de TODOS los pedidos (solo status y método).
  const buildOrdersQuery = (filters, from) => {
    let q = supabase.from('online_orders').select(ORDER_SELECT, { count: 'exact' });
    if (filters.status !== 'todos') q = q.eq('status', filters.status);
    if (filters.method !== 'todos') q = q.eq('shipping_method_code', filters.method);
    if (filters.attention) q = q.eq('needs_attention', true);
    if (filters.coupon) q = q.eq('coupon_code', filters.coupon);
    const or = combineOrFilters(filters.customer, orderSearchFilter(filters.query));
    if (or) q = q.or(or);
    return q.order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(from, from + ADMIN_ORDERS_PAGE_SIZE - 1);
  };

  // Ejecución 122 (D95): antes de la primera lectura se vencen los pedidos con la ventana de pago cumplida (liberan
  // su reserva); sin pg_cron seguían como «Pago pendiente». Una sola vez por visita; si falla, la lista carga igual.
  const expiry = useRef(null);
  const expireOnce = () => { if (!expiry.current) expiry.current = adminService.expirePendingOrders(); return expiry.current; };

  const fetchSummary = async () => {
    await expireOnce();
    const { data, error } = await fetchAllRows(() => supabase.from('online_orders').select('id, status, shipping_method_code, needs_attention')
      .order('created_at', { ascending: false }).order('id', { ascending: false }));
    setSummaryRows(error ? [] : data);
  };

  const filters = { status: selectedStatusTab, method: methodFilter, query: debouncedQuery, attention: onlyAttention, coupon: couponFilter, customer: customerFilter };

  const fetchDbOrders = async ({ append = false } = {}) => {
    const seq = ++requestSeq.current;
    if (append) setIsLoadingMore(true); else { setIsLoading(true); }
    setLoadError(null);
    const from = append ? dbOrders.length : 0;
    await expireOnce();
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
    const t = setTimeout(() => {
      if (searchQuery === lastWrittenQuery.current) return;
      lastWrittenQuery.current = searchQuery;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (searchQuery.trim()) next.set('q', searchQuery); else next.delete('q');
        return next;
      }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si la URL cambia desde fuera (enlace, atrás/adelante), el campo la refleja sin pisar lo que se está escribiendo.
  useEffect(() => {
    if (urlQuery !== lastWrittenQuery.current) { lastWrittenQuery.current = urlQuery; setSearchQuery(urlQuery); }
  }, [urlQuery]);

  useEffect(() => {
    if (!customerReady) { requestSeq.current += 1; setIsLoading(true); return; } // espera el perfil del cliente
    fetchDbOrders();
  }, [selectedStatusTab, methodFilter, debouncedQuery, onlyAttention, couponFilter, customerFilter, customerReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSummary();
    orderService.getStatusCatalog().then((c) => setTransitions((c.transitions ?? []).filter((t) => t.actor === 'admin'))).catch(() => setTransitions([]));
    // Incluye métodos inactivos (el admin los lee todos): los pedidos antiguos conservan su nombre.
    shippingAdminService.list().then(setShippingMethods).catch(() => setShippingMethods([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar (fetchSummary usa refs y setters)

  const statusCounts = countByStatus(summaryRows);
  const attentionCount = summaryRows.filter((r) => r.needs_attention).length;
  const methodOptions = shippingMethodOptions(summaryRows, shippingMethods);
  const hasMore = totalCount !== null ? dbOrders.length < totalCount : false;

  const allowedNext = (status) => transitions.filter((t) => t.from === status);
  const handleOpenModal = (ord) => {
    setSelectedOrder(ord);
    setModalStatus('');
    setModalNote(''); setModalCarrier(ord.carrier || ''); setModalTracking(ord.tracking_number || ''); setModalTrackingUrl(ord.tracking_url || '');
    setModalError(null); setModalErrorFields([]);
  };

  // Ejecución 111 (D82): un error de validación del cambio de estado se enlaza al campo que lo causa (aria-invalid +
  // aria-describedby → aviso del modal) y el foco va a él; antes el aviso salía arriba del modal sin indicar el campo.
  // La URL de rastreo se valida aquí con la misma regla que el CHECK de la BD (^https://): antes llegaba a la BD y
  // el admin veía un error genérico.
  const failOn = (fields, text) => {
    setModalError(text); setModalErrorFields(fields);
    setTimeout(() => document.getElementById(ORDER_FIELD_ID[fields[0]])?.focus(), 0);
  };
  const fieldA11y = (key) => (modalError && modalErrorFields.includes(key)
    ? { id: ORDER_FIELD_ID[key], 'aria-invalid': true, 'aria-describedby': ORDER_ERROR_ID }
    : { id: ORDER_FIELD_ID[key], 'aria-invalid': false });

  const handleSaveChanges = async () => {
    if (!selectedOrder || !modalStatus) { failOn(['status'], 'Elige el nuevo estado.'); return; }
    const t = allowedNext(selectedOrder.status).find((x) => x.to === modalStatus);
    if (t?.requires_note && !modalNote.trim()) { failOn(['note'], 'Esta transición requiere una nota (motivo).'); return; }
    if (modalStatus === 'shipped' && (!modalCarrier.trim() || !modalTracking.trim())) {
      failOn([!modalCarrier.trim() && 'carrier', !modalTracking.trim() && 'tracking'].filter(Boolean), 'Para marcar como enviado indica transportadora y número de guía.');
      return;
    }
    if (modalStatus === 'shipped' && modalTrackingUrl.trim() && !/^https:\/\/\S+$/i.test(modalTrackingUrl.trim())) {
      failOn(['url'], 'La URL de rastreo debe empezar por https://');
      return;
    }
    setIsSaving(true); setModalError(null); setModalErrorFields([]);
    try {
      const tracking = modalStatus === 'shipped' ? { carrier: modalCarrier.trim(), tracking_number: modalTracking.trim(), tracking_url: modalTrackingUrl.trim() || null } : null;
      await adminService.transitionOrder(selectedOrder.rawId, modalStatus, modalNote.trim() || null, tracking);
      setNotice(`${selectedOrder.order_number}: ${STATUS_LABEL[selectedOrder.status]} → ${STATUS_LABEL[modalStatus]}.`);
      setSelectedOrder(null);
      await refreshAll();
    } catch (err) {
      setModalError(err.message || 'No se pudo cambiar el estado.'); setModalErrorFields([]);
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
          {(methodFilter !== 'todos' && !methodOptions.includes(methodFilter) ? [...methodOptions, methodFilter] : methodOptions).map((c) => <option key={c} value={c}>{shippingMethodLabel(c, shippingMethods)}</option>)}
        </select>

        {customerId && (
          <span data-testid="orders-customer-filter" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', background: '#ECFDF5', color: '#065F46', fontSize: '0.8rem', fontWeight: 800 }}>
            Cliente: {customer.status === 'ok' ? (customer.profile.full_name || customer.profile.email) : customer.status === 'loading' ? '…' : 'no encontrado'}
            <button type="button" onClick={clearCustomerFilter} aria-label="Quitar filtro del cliente"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#065F46', fontWeight: 900, padding: 0 }}>×</button>
          </span>
        )}

        {couponFilter && (
          <span data-testid="orders-coupon-filter" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', background: '#EEF2FF', color: '#3730A3', fontSize: '0.8rem', fontWeight: 800 }}>
            Cupón: {couponFilter}
            <button type="button" onClick={clearCouponFilter} aria-label={`Quitar filtro del cupón ${couponFilter}`}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#3730A3', fontWeight: 900, padding: 0 }}>×</button>
          </span>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: attentionCount > 0 ? '#B91C1C' : '#52525B' }}>
          <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} />
          Solo los que requieren revisión ({attentionCount})
        </label>

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
                        cursor: 'pointer',
                        minHeight: '36px'
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
          <DialogPanel onClose={() => setSelectedOrder(null)} aria-label={`Orden #${selectedOrder.id}`}
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
              <button type="button" aria-label="Cerrar" onClick={() => setSelectedOrder(null)} style={{ padding: '0.4rem' }}>
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div role="alert" id={ORDER_ERROR_ID} style={{ backgroundColor: '#FEF2F2', color: '#991B1B', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem', border: '1px solid #FCA5A5' }}>
                {modalError}
              </div>
            )}

            <div style={{ fontSize: '0.85rem', marginBottom: '1rem', display: 'grid', gap: '0.25rem' }}>
              <div><strong>Estado:</strong> {STATUS_LABEL[selectedOrder.status]} · <strong>Creado:</strong> {selectedOrder.date}</div>
              <div><strong>Cliente:</strong> {selectedOrder.customer_name} · {selectedOrder.customer_email} · {selectedOrder.customer_phone}
                {/* Ejecución 89: enlace a la ficha del cliente (cuenta) o a la búsqueda por su correo (pedido de invitado). */}
                {(() => {
                  const link = customerLinkForOrder(selectedOrder);
                  return link && (
                    <> · <Link data-testid="order-customer-link" to={link.to} style={detailLink}>{link.label}</Link></>
                  );
                })()}
              </div>
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
                  <select {...fieldA11y('status')} value={modalStatus} onChange={(e) => setModalStatus(e.target.value)}
                    style={{ padding: '0.7rem', border: '1px solid #D4D4D8', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem' }}>
                    <option value="">Selecciona…</option>
                    {allowedNext(selectedOrder.status).map((t) => (
                      <option key={t.to} value={t.to}>{STATUS_LABEL[t.to]}{t.requires_note ? ' (requiere motivo)' : ''}</option>
                    ))}
                  </select>
                  {modalStatus === 'shipped' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <input {...fieldA11y('carrier')} aria-label="Transportadora" placeholder="Transportadora (ej. Coordinadora)" value={modalCarrier} onChange={(e) => setModalCarrier(e.target.value)} style={orderInput} />
                      <input {...fieldA11y('tracking')} aria-label="Número de guía" placeholder="Número de guía" value={modalTracking} onChange={(e) => setModalTracking(e.target.value)} style={orderInput} />
                      <input {...fieldA11y('url')} aria-label="URL de rastreo" type="url" inputMode="url" placeholder="URL de rastreo (opcional, https://)" value={modalTrackingUrl} onChange={(e) => setModalTrackingUrl(e.target.value)} style={{ ...orderInput, gridColumn: '1 / -1' }} />
                    </div>
                  )}
                  <input {...fieldA11y('note')} aria-label="Nota del cambio" placeholder="Nota o motivo (visible en el historial)" value={modalNote} onChange={(e) => setModalNote(e.target.value)} style={orderInput} />
                </div>
              )}
            </div>

            {/* Products List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              {selectedOrder.online_order_items?.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'center', borderBottom: '1px solid #F4F4F5', paddingBottom: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{item.product_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#71717A' }}>SKU {productLinkForSku(item.sku)
                      ? <Link data-testid={`order-item-sku-${idx}`} to={productLinkForSku(item.sku)} title="Ver producto en el admin" style={detailLink}>{item.sku}</Link>
                      : item.sku} • Talla: {item.size_code} • Color: {item.color_name} • Cant: {item.quantity}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{formatCOP(Number(item.line_total))}</div>
                </div>
              ))}
              <div style={{ fontSize: '0.85rem', textAlign: 'right' }}>
                Subtotal {formatCOP(Number(selectedOrder.subtotal))}
                {/* Ejecución 90: el cupón enlaza a /admin/descuentos?q=<código>. */}
                {Number(selectedOrder.discount_total) > 0 && <>
                  {` · Descuento -${formatCOP(Number(selectedOrder.discount_total))}`}
                  {selectedOrder.coupon_code && <> ({couponLink(selectedOrder.coupon_code)
                    ? <Link data-testid="order-coupon-link" to={couponLink(selectedOrder.coupon_code)} title="Ver cupón" style={detailLink}>{selectedOrder.coupon_code}</Link>
                    : selectedOrder.coupon_code})</>}
                </>}
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
          </DialogPanel>
        </div>
      )}
    </div>
  );
};

// Enlaces del detalle (cliente, SKU, cupón): son controles sueltos, no enlaces dentro de una frase, así que en
// móvil necesitan ≥ 32 px de alto táctil (ejecución 108); inline-flex conserva el flujo del texto.
const detailLink = { textDecoration: 'underline', color: '#3730A3', fontWeight: 700, display: 'inline-flex', alignItems: 'center', minHeight: '32px', verticalAlign: 'middle' };
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
