import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Users,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  ChevronRight,
  PackageCheck
} from 'lucide-react';
import { PRODUCTS, formatCOP } from '../../data/mockData';

export const AdminDashboardPage = () => {
  const [timeRange, setTimeRange] = useState('30d');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* DASHBOARD HEADER & TIME FILTER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
            DASHBOARD GENERAL
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
            Resumen operativo y comercial de J&M Fashion Store Colombia.
          </p>
        </div>

        {/* Time Filter Tabs */}
        <div style={{ display: 'flex', backgroundColor: '#FFFFFF', padding: '4px', borderRadius: '8px', border: '1px solid #E4E4E7' }}>
          {[
            { id: 'hoy', label: 'Hoy' },
            { id: '7d', label: '7 Días' },
            { id: '30d', label: '30 Días' },
            { id: '90d', label: '90 Días' },
            { id: '1y', label: 'Este Año' }
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

      {/* KPI METRIC CARDS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
        <KpiCard
          title="VENTAS HOY"
          value={formatCOP(1850000)}
          change="+14.2% vs ayer"
          isPositive={true}
          icon={DollarSign}
        />
        <KpiCard
          title="VENTAS DEL MES"
          value={formatCOP(48900000)}
          change="+22.5% vs mes anterior"
          isPositive={true}
          icon={TrendingUp}
        />
        <KpiCard
          title="PEDIDOS TOTALES"
          value="142 pedidos"
          change="+18 este mes"
          isPositive={true}
          icon={ShoppingBag}
        />
        <KpiCard
          title="TICKET PROMEDIO"
          value={formatCOP(344370)}
          change="+5.1% ticket medio"
          isPositive={true}
          icon={CreditCard}
        />
        <KpiCard
          title="CONVERSIÓN E-COMMERCE"
          value="3.42%"
          change="+0.8% opt"
          isPositive={true}
          icon={Users}
        />
      </div>

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
                  <th style={thAdmin}>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { id: 'JM-1024', customer: 'Alejandro Morales', city: 'Bogotá D.C.', total: 319800, status: 'Enviado', date: 'Hace 10 min' },
                  { id: 'JM-1023', customer: 'Carlos Bermúdez', city: 'Medellín', total: 189900, status: 'Pagado', date: 'Hace 35 min' },
                  { id: 'JM-1022', customer: 'Juan Sebastián Gómez', city: 'Cali', total: 479800, status: 'En preparación', date: 'Hace 2 horas' },
                  { id: 'JM-1021', customer: 'David Restrepo', city: 'Barranquilla', total: 129900, status: 'Entregado', date: 'Ayer' }
                ].map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                    <td style={{ ...tdAdmin, fontWeight: 800 }}>{row.id}</td>
                    <td style={tdAdmin}>{row.customer}</td>
                    <td style={tdAdmin}>{row.city}</td>
                    <td style={{ ...tdAdmin, fontWeight: 800 }}>{formatCOP(row.total)}</td>
                    <td style={tdAdmin}>
                      <span style={statusBadgeStyle(row.status)}>
                        {row.status}
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
            MÁS VENDIDOS ESTE MES
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {PRODUCTS.slice(0, 4).map((prod) => (
              <div key={prod.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <img src={prod.images[0]} alt="" style={{ width: '48px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#09090B' }}>{prod.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#71717A' }}>{prod.reviewCount} ventas • FIT: {prod.fit}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#09090B' }}>
                  {formatCOP(prod.price)}
                </div>
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

const KpiCard = ({ title, value, change, isPositive, icon: Icon }) => (
  <div style={{ backgroundColor: '#FFFFFF', padding: '1.35rem', borderRadius: '10px', border: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', letterSpacing: '0.08em' }}>{title}</span>
      <Icon size={20} color="#09090B" />
    </div>
    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#09090B' }}>{value}</div>
    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isPositive ? '#10B981' : '#E11D48', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
      {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {change}
    </div>
  </div>
);

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
    status === 'Entregado' ? '#D1FAE5' : status === 'Enviado' ? '#E0F2FE' : '#FEF3C7',
  color: status === 'Entregado' ? '#065F46' : status === 'Enviado' ? '#0369A1' : '#92400E'
});

export default AdminDashboardPage;
