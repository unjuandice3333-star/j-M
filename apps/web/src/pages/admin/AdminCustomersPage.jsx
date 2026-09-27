import React, { useState, useEffect } from 'react';
import { Users, Search, Star, ShoppingBag, Eye, Sparkles } from 'lucide-react';
import { formatCOP } from '../../data/mockData';
import supabase from '../../config/supabase';

export const AdminCustomersPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('todos');
  const [dbCustomers, setDbCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCustomers = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          setDbCustomers(data.map((p) => ({
            id: p.id,
            name: p.full_name || 'Cliente Registrar',
            email: p.email || 'Email no especificado',
            phone: p.phone || 'No registrado',
            city: 'Colombia',
            ordersCount: 0,
            totalSpent: 0,
            avgTicket: 0,
            lastPurchase: new Date(p.created_at).toLocaleDateString('es-CO'),
            preferredSizes: 'M',
            tier: p.role === 'admin' ? 'VIP' : 'Regular'
          })));
        } else {
          setDbCustomers([]);
        }
      } catch (e) {
        setDbCustomers([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  const customers = dbCustomers;

  const filteredCustomers = customers.filter((c) => {
    if (tierFilter !== 'todos' && c.tier.toLowerCase() !== tierFilter) return false;
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase()) && !c.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
            CRM DE CLIENTES & SEGMENTACIÓN ({customers.length})
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
            Base de datos unificada de compradores, comportamiento de compra y clasificación VIP.
          </p>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div style={{
        backgroundColor: '#FFFFFF',
        padding: '1.25rem',
        borderRadius: '10px',
        border: '1px solid #E4E4E7',
        display: 'flex',
        justify: 'space-between',
        alignItems: 'center',
        gap: '1rem'
      }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #D4D4D8', borderRadius: '6px', padding: '0.5rem 0.8rem', width: '320px' }}>
          <Search size={16} color="#71717A" />
          <input
            type="text"
            placeholder="Buscar cliente por nombre, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }}
          />
        </div>

        {/* Tier Filters */}
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {['todos', 'vip', 'regular', 'nuevo', 'inactivo'].map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                borderRadius: '6px',
                border: tierFilter === t ? '1px solid #09090B' : '1px solid #E4E4E7',
                backgroundColor: tierFilter === t ? '#09090B' : '#FFFFFF',
                color: tierFilter === t ? '#FFFFFF' : '#71717A',
                cursor: 'pointer'
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* CUSTOMERS TABLE */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#71717A' }}>
            Cargando base de clientes desde Supabase PostgreSQL...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#71717A', fontWeight: 600 }}>
            No hay clientes registrados en la plataforma.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left' }}>
              <th style={thCustomer}>CLIENTE</th>
              <th style={thCustomer}>CLASIFICACIÓN</th>
              <th style={thCustomer}>PEDIDOS</th>
              <th style={thCustomer}>TOTAL COMPRADO</th>
              <th style={thCustomer}>TICKET MEDIO</th>
              <th style={thCustomer}>TALLA HABITUAL</th>
              <th style={thCustomer}>ÚLTIMA COMPRA</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((cust) => (
              <tr key={cust.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                <td style={tdCustomer}>
                  <div style={{ fontWeight: 800, color: '#09090B' }}>{cust.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#71717A' }}>{cust.email} • {cust.phone}</div>
                </td>

                <td style={tdCustomer}>
                  <span style={tierBadgeStyle(cust.tier)}>
                    {cust.tier === 'VIP' && <Star size={12} fill="#D4AF37" color="#D4AF37" style={{ marginRight: '3px' }} />}
                    {cust.tier}
                  </span>
                </td>

                <td style={{ ...tdCustomer, fontWeight: 800 }}>{cust.ordersCount} compras</td>
                <td style={{ ...tdCustomer, fontWeight: 900, color: '#09090B', fontSize: '0.95rem' }}>
                  {formatCOP(cust.totalSpent)}
                </td>
                <td style={tdCustomer}>{formatCOP(cust.avgTicket)}</td>
                <td style={{ ...tdCustomer, fontWeight: 700, color: '#27272A' }}>{cust.preferredSizes}</td>
                <td style={{ ...tdCustomer, color: '#71717A' }}>{cust.lastPurchase}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
};

const thCustomer = {
  padding: '0.85rem 1rem',
  fontSize: '0.75rem',
  fontWeight: 800,
  color: '#71717A',
  letterSpacing: '0.05em'
};

const tdCustomer = {
  padding: '0.85rem 1rem',
  color: '#09090B'
};

const tierBadgeStyle = (tier) => ({
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: '0.72rem',
  fontWeight: 800,
  padding: '3px 8px',
  borderRadius: '4px',
  backgroundColor:
    tier === 'VIP' ? '#09090B' : tier === 'Regular' ? '#E0F2FE' : '#FAFAFA',
  color:
    tier === 'VIP' ? '#D4AF37' : tier === 'Regular' ? '#0369A1' : '#71717A',
  border: tier === 'VIP' ? '1px solid #D4AF37' : '1px solid #E4E4E7'
});

export default AdminCustomersPage;
