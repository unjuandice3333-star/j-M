import React, { useState, useEffect } from 'react';
import { ClipboardList, Search, Eye, Truck, Check, Printer, ChevronDown, X } from 'lucide-react';
import { useECommerceStore } from '../../store/eCommerceStore';
import { formatCOP } from '../../data/mockData';
import supabase from '../../config/supabase';

export const AdminOrdersPage = () => {
  const { orders } = useECommerceStore();
  const [dbOrders, setDbOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStatusTab, setSelectedStatusTab] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Order for Detail Modal
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalStatus, setModalStatus] = useState('');
  const [modalTracking, setModalTracking] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Cargar órdenes reales desde Supabase PostgreSQL
  const fetchDbOrders = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('online_orders')
        .select(`
          id,
          order_number,
          customer_name,
          customer_email,
          customer_phone,
          shipping_department,
          shipping_city,
          shipping_address,
          shipping_neighborhood,
          shipping_notes,
          shipping_method,
          shipping_cost,
          subtotal,
          discount,
          total,
          coupon_code,
          status,
          created_at,
          online_order_items (
            id,
            product_name,
            size,
            color,
            sku,
            unit_price,
            quantity,
            total
          )
        `)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const normalized = data.map((o) => ({
          id: o.order_number || o.id,
          rawId: o.id,
          date: new Date(o.created_at).toLocaleDateString('es-CO'),
          customerName: o.customer_name,
          customerEmail: o.customer_email,
          customerPhone: o.customer_phone,
          shippingAddress: `${o.shipping_address}, ${o.shipping_city}`,
          paymentMethod: 'Wompi / Online',
          total: Number(o.total),
          status: o.status,
          items: (o.online_order_items || []).map((i) => ({
            name: i.product_name,
            size: i.size,
            color: i.color,
            price: Number(i.unit_price),
            quantity: i.quantity,
            image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=300'
          }))
        }));
        setDbOrders(normalized);
      } else {
        setDbOrders(orders);
      }
    } catch (e) {
      console.warn('[AdminOrdersPage Warning]: Fallback a órdenes locales:', e);
      setDbOrders(orders);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDbOrders();
  }, []);

  const displayOrders = dbOrders.length > 0 ? dbOrders : orders;

  const filteredOrders = displayOrders.filter((ord) => {
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
    setModalError(null);
  };

  const handleSaveChanges = async () => {
    if (!selectedOrder) return;
    setIsSaving(true);
    setModalError(null);

    try {
      if (selectedOrder.rawId) {
        // Ejecutar validación de máquina de estados en PostgreSQL mediante RPC
        const { error: rpcError } = await supabase.rpc('update_order_status', {
          p_order_id: selectedOrder.rawId,
          p_new_status: modalStatus,
          p_notes: modalTracking ? `Guía: ${modalTracking}` : 'Cambio de estado administrativo'
        });

        if (rpcError) {
          throw new Error(rpcError.message || 'La máquina de estados de PostgreSQL rechazó la transición.');
        }
      }

      // Actualizar estado local
      setDbOrders((prev) =>
        prev.map((o) =>
          o.id === selectedOrder.id ? { ...o, status: modalStatus, trackingNumber: modalTracking } : o
        )
      );

      setSelectedOrder(null);
    } catch (err) {
      console.error('[AdminOrdersPage Error]:', err);
      setModalError(err.message || 'Error al actualizar el estado en el servidor.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER */}
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
          GESTIÓN OPERATIVA DE PEDIDOS ({displayOrders.length})
        </h1>
        <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
          Control logístico, estados de pago y máquina de estados en PostgreSQL.
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
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {['todos', 'pending_payment', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled'].map((st) => (
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
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#71717A' }}>
            Cargando órdenes reales desde Supabase PostgreSQL...
          </div>
        ) : (
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
        )}
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

            {modalError && (
              <div style={{ backgroundColor: '#FEF2F2', color: '#991B1B', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem', border: '1px solid #FCA5A5' }}>
                {modalError}
              </div>
            )}

            {/* Change Status Dropdown */}
            <div style={{ backgroundColor: '#FAFAFA', padding: '1.25rem', borderRadius: '8px', border: '1px solid #E4E4E7', marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#09090B', marginBottom: '0.4rem' }}>
                CAMBIAR ESTADO DE LA ORDEN (MÁQUINA DE ESTADOS EN POSTGRESQL)
              </label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value)}
                  style={{ flex: 1, padding: '0.7rem', border: '1px solid #D4D4D8', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem' }}
                >
                  <option value="pending">pending</option>
                  <option value="payment_pending">payment_pending</option>
                  <option value="paid">paid (Pago Confirmado Wompi)</option>
                  <option value="preparing">preparing (En Preparación)</option>
                  <option value="shipped">shipped (Enviado)</option>
                  <option value="delivered">delivered (Entregado)</option>
                  <option value="cancelled">cancelled (Cancelado)</option>
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
                onClick={handleSaveChanges}
                disabled={isSaving}
                style={{ backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.75rem 1.5rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.85rem', opacity: isSaving ? 0.7 : 1 }}
              >
                {isSaving ? 'GUARDANDO EN POSTGRESQL...' : 'GUARDAR CAMBIOS'}
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
    status === 'delivered' ? '#D1FAE5' : status === 'shipped' ? '#E0F2FE' : status === 'paid' ? '#DCFCE7' : '#FEF3C7',
  color: status === 'delivered' ? '#065F46' : status === 'shipped' ? '#0369A1' : status === 'paid' ? '#15803D' : '#92400E'
});

export default AdminOrdersPage;
