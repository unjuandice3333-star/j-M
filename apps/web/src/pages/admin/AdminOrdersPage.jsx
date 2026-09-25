import React, { useState } from 'react';
import { ClipboardList, Search, Eye, Truck, Check, Printer, ChevronDown, X } from 'lucide-react';
import { useECommerceStore } from '../../store/eCommerceStore';
import { formatCOP } from '../../data/mockData';

export const AdminOrdersPage = () => {
  const { orders } = useECommerceStore();
  const [selectedStatusTab, setSelectedStatusTab] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Order for Detail Modal
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalStatus, setModalStatus] = useState('');
  const [modalTracking, setModalTracking] = useState('');

  const filteredOrders = orders.filter((ord) => {
    if (selectedStatusTab !== 'todos' && ord.status.toLowerCase() !== selectedStatusTab) {
      return false;
    }
    if (searchQuery && !ord.id.toLowerCase().includes(searchQuery.toLowerCase()) && !ord.customerName?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const handleOpenModal = (ord) => {
    setSelectedOrder(ord);
    setModalStatus(ord.status);
    setModalTracking(ord.trackingNumber || '');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER */}
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
          GESTIÓN OPERATIVA DE PEDIDOS ({orders.length})
        </h1>
        <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
          Control logístico, estados de pago y seguimiento de guías de despacho en Colombia.
        </p>
      </div>

      {/* TOOLBAR & STATUS TABS */}
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
            placeholder="Buscar por # Orden, Cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }}
          />
        </div>

        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {['todos', 'pedido recibido', 'pago confirmado', 'en preparación', 'enviado', 'entregado'].map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatusTab(st)}
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
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* ORDERS TABLE */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left' }}>
              <th style={thOrder}>ORDEN #</th>
              <th style={thOrder}>FECHA</th>
              <th style={thOrder}>CLIENTE</th>
              <th style={thOrder}>MÉTODO PAGO</th>
              <th style={thOrder}>TOTAL</th>
              <th style={thOrder}>ESTADO</th>
              <th style={{ ...thOrder, textAlign: 'right' }}>DETALLE / ACCIÓN</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((ord) => (
              <tr key={ord.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                <td style={{ ...tdOrder, fontWeight: 900 }}>{ord.id}</td>
                <td style={{ ...tdOrder, color: '#71717A' }}>{ord.date}</td>
                <td style={tdOrder}>
                  <div style={{ fontWeight: 700 }}>{ord.customerName || 'Alejandro Morales'}</div>
                  <div style={{ fontSize: '0.75rem', color: '#71717A' }}>{ord.shippingAddress || 'Bogotá D.C.'}</div>
                </td>
                <td style={{ ...tdOrder, fontSize: '0.78rem', color: '#27272A' }}>
                  {ord.paymentMethod}
                </td>
                <td style={{ ...tdOrder, fontWeight: 900, fontSize: '0.95rem' }}>
                  {formatCOP(ord.total)}
                </td>
                <td style={tdOrder}>
                  <span style={statusBadgeStyle(ord.status)}>
                    {ord.status}
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
      </div>

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

            {/* Change Status Dropdown */}
            <div style={{ backgroundColor: '#FAFAFA', padding: '1.25rem', borderRadius: '8px', border: '1px solid #E4E4E7', marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#09090B', marginBottom: '0.4rem' }}>
                CAMBIAR ESTADO DE LA ORDEN
              </label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value)}
                  style={{ flex: 1, padding: '0.7rem', border: '1px solid #D4D4D8', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem' }}
                >
                  <option value="Pedido recibido">Pedido recibido</option>
                  <option value="Pago confirmado">Pago confirmado</option>
                  <option value="En preparación">En preparación</option>
                  <option value="Enviado">Enviado</option>
                  <option value="Entregado">Entregado</option>
                  <option value="Cancelado">Cancelado</option>
                </select>

                <input
                  type="text"
                  placeholder="N° de Guía (Coordinadora)"
                  value={modalTracking}
                  onChange={(e) => setModalTracking(e.target.value)}
                  style={{ flex: 1, padding: '0.7rem', border: '1px solid #D4D4D8', borderRadius: '6px', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Products List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {selectedOrder.items?.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'center', borderBottom: '1px solid #F4F4F5', paddingBottom: '0.75rem' }}>
                  <img src={item.image} alt="" style={{ width: '45px', height: '55px', objectFit: 'cover', borderRadius: '4px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{item.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#71717A' }}>Talla: {item.size} • Color: {item.color} • Cant: {item.quantity}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{formatCOP(item.price * item.quantity)}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => window.print()}
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', padding: '0.75rem 1.2rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Printer size={16} /> Imprimir Guía de Despacho
              </button>

              <button
                onClick={() => setSelectedOrder(null)}
                style={{ backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.75rem 1.5rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.85rem' }}
              >
                GUARDAR CAMBIOS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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
    status === 'Entregado' ? '#D1FAE5' : status === 'Enviado' ? '#E0F2FE' : '#FEF3C7',
  color: status === 'Entregado' ? '#065F46' : status === 'Enviado' ? '#0369A1' : '#92400E'
});

export default AdminOrdersPage;
