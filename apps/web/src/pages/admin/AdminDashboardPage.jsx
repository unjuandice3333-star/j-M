import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  ShoppingBag,
  Truck,
  CreditCard,
  ChevronRight,
  AlertTriangle,
  PackageCheck
} from '../../components/Common/icons';
import { formatCOP } from '../../utils/currency';
import supabase from '../../config/supabase';
import { adminService, countOrdersToPrepare, pendingRefundsSummary } from '../../services/adminService';
import { PENDING_REFUND_PARAM } from '../../utils/orderRefunds';

// M27: métricas de la BD (admin_dashboard_metrics; exige is_admin()). Sin valores de ejemplo: si la consulta falla,
// se muestra el error. Rango: desde el inicio del periodo elegido hasta ahora.
const RANGES = { hoy: 0, '7d': 7, '30d': 30, '90d': 90 };
const STATUS_LABEL = { payment_pending: 'Pago pendiente', paid: 'Pagado', processing: 'En preparación', shipped: 'Enviado',
  delivered: 'Entregado', cancelled: 'Cancelado', expired: 'Vencido', refunded: 'Reembolsado' };

export const AdminDashboardPage = () => {
  const [timeRange, setTimeRange] = useState('30d');
  const [metrics, setMetrics] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  // Ejecución 76: pedidos pagados esperando preparación, de CUALQUIER fecha (no dependen del periodo elegido: un pedido
  // pagado hace 40 días sigue pendiente). Si el conteo falla, el resto del panel funciona igual.
  const [toPrepare, setToPrepare] = useState(undefined);
  // Ejecución 131: devoluciones registradas pendientes de hacer en Wompi (cualquier fecha). null = no se pudo contar.
  const [pendingRefunds, setPendingRefunds] = useState(undefined);

  // Ejecución 122 (D95): vence primero los pedidos con la ventana de pago cumplida (una vez por visita; nunca falla).
  const expiry = useRef(null);
  const expireOnce = () => { if (!expiry.current) expiry.current = adminService.expirePendingOrders(); return expiry.current; };

  useEffect(() => {
    let alive = true;
    expireOnce().then(() => countOrdersToPrepare()).then((n) => { if (alive) setToPrepare(n); }, () => { if (alive) setToPrepare(null); });
    pendingRefundsSummary().then((r) => { if (alive) setPendingRefunds(r); }, () => { if (alive) setPendingRefunds(null); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setIsLoading(true); setLoadError(null);
      const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - RANGES[timeRange]);
      try {
        await expireOnce();
        const [m, o] = await Promise.all([
          adminService.dashboardMetrics(from.toISOString(), new Date().toISOString()),
          supabase.from('online_orders').select('id, order_number, customer_name, shipping_city, total, status, created_at')
            .order('created_at', { ascending: false }).limit(8),
        ]);
        if (o.error) throw o.error;
        if (!alive) return;
        setMetrics(m);
        setRecentOrders(o.data);
      } catch (e) {
        if (alive) setLoadError(e.message || 'No se pudieron cargar las métricas.');
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [timeRange]);

  const byStatus = metrics?.orders_by_status ?? {};
  const totalOrders = Object.values(byStatus).reduce((n, v) => n + Number(v), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* DASHBOARD HEADER & TIME FILTER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
            DASHBOARD GENERAL
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
            Ventas y pedidos reales del periodo seleccionado.
          </p>
        </div>

        {/* Time Filter Tabs */}
        <div style={{ display: 'flex', backgroundColor: '#FFFFFF', padding: '4px', borderRadius: '8px', border: '1px solid #E4E4E7' }}>
          {[
            { id: 'hoy', label: 'Hoy' },
            { id: '7d', label: '7 Días' },
            { id: '30d', label: '30 Días' },
            { id: '90d', label: '90 Días' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTimeRange(t.id)}
              style={{
                padding: '0.45rem 0.9rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                backgroundColor: timeRange === t.id ? '#09090B' : 'transparent',
                color: timeRange === t.id ? '#FFFFFF' : '#71717A',
                cursor: 'pointer'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loadError && <div role="alert" style={{ backgroundColor: '#FEF2F2', color: '#B91C1C', padding: '0.9rem 1.1rem', borderRadius: '8px', fontWeight: 600 }}>{loadError}</div>}
      {isLoading && !metrics && <div role="status" style={{ color: '#71717A' }}>Cargando métricas…</div>}

      {/* KPI METRIC CARDS GRID */}
      {metrics && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
        <KpiCard title="VENTAS PAGADAS" value={formatCOP(metrics.gross_sales)} detail={`${metrics.paid_orders} pedido(s) pagado(s)`} icon={DollarSign} />
        <KpiCard title="PEDIDOS DEL PERIODO" value={`${totalOrders} pedidos`} detail={`${byStatus.payment_pending ?? 0} con pago pendiente`} icon={ShoppingBag} />
        <KpiCard title="TICKET PROMEDIO" value={formatCOP(metrics.average_ticket)} detail={`${metrics.units_sold} unidades vendidas`} icon={CreditCard} />
        <KpiCard title="POR PREPARAR" to="/admin/pedidos?estado=paid" linkLabel="Ver pedidos pagados por preparar"
          value={toPrepare === undefined ? '…' : toPrepare === null ? '—' : `${toPrepare} pedido${toPrepare === 1 ? '' : 's'}`}
          detail={toPrepare === null ? 'No se pudo contar los pedidos pagados.' : 'Pagados, de cualquier fecha · Ver pedidos →'}
          warn={toPrepare === null || toPrepare > 0} icon={PackageCheck} />
        <KpiCard title="EN PREPARACIÓN / ENVIADOS" value={`${byStatus.processing ?? 0} / ${byStatus.shipped ?? 0}`} detail="pedidos del periodo" icon={Truck} />
        {/* Ejecución 77: las alertas llevan a la lista ya filtrada (antes era un texto sin enlace). */}
        <KpiCard title="ALERTAS DE STOCK" to="/admin/inventario?stock=alerta" linkLabel="Ver variantes con stock bajo o agotado"
          value={`${metrics.low_stock_variants} variante${Number(metrics.low_stock_variants) === 1 ? '' : 's'}`}
          detail="Disponible en el mínimo o por debajo · Ver inventario →"
          warn={Number(metrics.low_stock_variants) > 0} icon={AlertTriangle} />
        <KpiCard title="REQUIEREN REVISIÓN" to="/admin/pedidos?revision=1" linkLabel="Ver pedidos que requieren revisión"
          value={`${metrics.needs_attention} pedido${Number(metrics.needs_attention) === 1 ? '' : 's'}`}
          detail="Stock faltante, reembolso o pago anulado · Ver pedidos →"
          warn={Number(metrics.needs_attention) > 0} icon={AlertTriangle} />
        {/* Ejecución 131: el panel no mueve dinero; estas devoluciones ya están registradas y falta hacerlas en Wompi. */}
        <KpiCard title="DEVOLUCIONES PENDIENTES" to={`/admin/pedidos?devolucion=${PENDING_REFUND_PARAM}`} linkLabel="Ver pedidos con devolución pendiente en Wompi"
          value={pendingRefunds === undefined ? '…' : pendingRefunds === null ? '—' : `${pendingRefunds.count} devoluci${pendingRefunds.count === 1 ? 'ón' : 'ones'}`}
          detail={pendingRefunds === undefined ? 'Contando devoluciones…' : pendingRefunds === null ? 'No se pudo contar las devoluciones pendientes.'
            : pendingRefunds.count === 0 ? 'Nada pendiente de devolver en Wompi'
              : `${formatCOP(pendingRefunds.amount)} por devolver en Wompi · Ver pedidos →`}
          warn={pendingRefunds === null || (pendingRefunds?.count ?? 0) > 0} icon={CreditCard} />
      </div>
      )}

      {/* RECENT ORDERS & TOP PRODUCTS SECTION */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '2rem' }} className="admin-dashboard-grid">
        {/* RECENT ORDERS TABLE */}
        <div style={{ backgroundColor: '#FFFFFF', padding: '1.5rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase' }}>
              ÚLTIMOS PEDIDOS RECIBIDOS
            </h3>
            <Link to="/admin/pedidos" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#09090B', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              Ver todos <ChevronRight size={16} />
            </Link>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left' }}>
                  <th style={thAdmin}>ORDEN</th>
                  <th style={thAdmin}>CLIENTE</th>
                  <th style={thAdmin}>CIUDAD</th>
                  <th style={thAdmin}>TOTAL</th>
                  <th style={thAdmin}>ESTADO OMS</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 && !isLoading && (
                  <tr><td colSpan={5} style={{ ...tdAdmin, color: '#71717A' }}>Todavía no hay pedidos.</td></tr>
                )}
                {recentOrders.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                    <td style={{ ...tdAdmin, fontWeight: 800 }}>{row.order_number}</td>
                    <td style={tdAdmin}>{row.customer_name}</td>
                    <td style={tdAdmin}>{row.shipping_city}</td>
                    <td style={{ ...tdAdmin, fontWeight: 800 }}>{formatCOP(Number(row.total))}</td>
                    <td style={tdAdmin}>
                      <span style={statusBadgeStyle(row.status)}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* TOP SELLING PRODUCTS */}
        <div style={{ backgroundColor: '#FFFFFF', padding: '1.5rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
            MÁS VENDIDOS DEL PERIODO
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {(metrics?.top_products ?? []).length === 0 && <div style={{ color: '#71717A', fontSize: '0.85rem' }}>Sin ventas pagadas en el periodo.</div>}
            {(metrics?.top_products ?? []).map((tp) => (
              <div key={tp.product_id} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#09090B' }}>{tp.product_name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#71717A' }}>{tp.units} unidad(es) vendida(s)</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#09090B' }}>{formatCOP(Number(tp.revenue))}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 1000px) {
          .admin-dashboard-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

// Sin flechas de tendencia: el detalle es un dato del periodo, no una variación frente a otro periodo.
const KpiCard = ({ title, value, detail, warn = false, icon, to, linkLabel }) => {
  const Icon = icon;
  const Box = to ? Link : 'div';
  const linkProps = to ? { to, 'aria-label': `${linkLabel}: ${value}`, 'data-kpi-link': 'true' } : {};
  return (
  <Box {...linkProps} style={{ backgroundColor: '#FFFFFF', padding: '1.35rem', borderRadius: '10px', border: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'inherit', textDecoration: 'none' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', letterSpacing: '0.08em' }}>{title}</span>
      <Icon size={20} color="#09090B" />
    </div>
    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#09090B' }}>{value}</div>
    <div data-warn={warn ? 'true' : 'false'} style={{ fontSize: '0.75rem', fontWeight: 700, color: warn ? '#B91C1C' : '#52525B' }}>
      {detail}
    </div>
  </Box>
);
};

const thAdmin = {
  padding: '0.75rem',
  fontSize: '0.75rem',
  fontWeight: 800,
  color: '#71717A',
  letterSpacing: '0.05em'
};

const tdAdmin = {
  padding: '0.75rem',
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

export default AdminDashboardPage;
