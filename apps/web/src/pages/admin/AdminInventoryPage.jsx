import React, { useState } from 'react';
import { Boxes, AlertTriangle, CheckCircle, Search, RefreshCw, MapPin } from 'lucide-react';
import { PRODUCTS } from '../../data/mockData';

export const AdminInventoryPage = () => {
  const [selectedLocation, setSelectedLocation] = useState('online'); // 'online' | 'bogota' | 'medellin'
  const [searchQuery, setSearchQuery] = useState('');

  const inventoryItems = [
    { id: 'inv-1', name: 'Camiseta Heavyweight Oversize — Negro / S', sku: 'TS-OV-001-BLK-S', location: 'Bodega Online', total: 15, reserved: 2, available: 13, min: 5, status: 'ok' },
    { id: 'inv-2', name: 'Camiseta Heavyweight Oversize — Negro / M', sku: 'TS-OV-001-BLK-M', location: 'Bodega Online', total: 4, reserved: 1, available: 3, min: 5, status: 'low' },
    { id: 'inv-3', name: 'Camisa Oxford Premium — Blanco / L', sku: 'SH-OX-002-WHT-L', location: 'Bodega Online', total: 0, reserved: 0, available: 0, min: 5, status: 'out' },
    { id: 'inv-4', name: 'Tenis Minimalist Leather — Blanco / 41', sku: 'SN-LM-007-WHT-41', location: 'Bodega Online', total: 22, reserved: 3, available: 19, min: 5, status: 'ok' },
    { id: 'inv-5', name: 'Jean Selvedge Slim Fit — Índigo / 32', sku: 'JN-SL-004-IND-32', location: 'Bodega Online', total: 2, reserved: 0, available: 2, min: 5, status: 'low' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER & LOCATION SWITCHER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
            CONTROL DE INVENTARIO Y STOCK OMNICANAL
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
            Sincronización en tiempo real de unidades en bodegas y tiendas físicas.
          </p>
        </div>

        {/* Location Selector Tabs */}
        <div style={{ display: 'flex', backgroundColor: '#FFFFFF', padding: '4px', borderRadius: '8px', border: '1px solid #E4E4E7' }}>
          {[
            { id: 'online', label: 'BODEGA ONLINE' },
            { id: 'bogota', label: 'SHOWROOM BOGOTÁ' },
            { id: 'medellin', label: 'SHOWROOM MEDELLÍN' }
          ].map((loc) => (
            <button
              key={loc.id}
              onClick={() => setSelectedLocation(loc.id)}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.78rem',
                fontWeight: 800,
                borderRadius: '6px',
                border: 'none',
                backgroundColor: selectedLocation === loc.id ? '#09090B' : 'transparent',
                color: selectedLocation === loc.id ? '#FFFFFF' : '#71717A',
                cursor: 'pointer'
              }}
            >
              {loc.label}
            </button>
          ))}
        </div>
      </div>

      {/* SUMMARY KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
        <div style={kpiBox}>
          <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 800 }}>UNIDADES TOTALES</span>
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#09090B' }}>1.284 uds</span>
        </div>
        <div style={kpiBox}>
          <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 800 }}>STOCK RESERVADO</span>
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0369A1' }}>42 uds</span>
        </div>
        <div style={kpiBox}>
          <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 800 }}>ALERTAS STOCK BAJO</span>
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#D97706' }}>8 refs</span>
        </div>
        <div style={kpiBox}>
          <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 800 }}>REFERENCIAS AGOTADAS</span>
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#E11D48' }}>2 refs</span>
        </div>
      </div>

      {/* INVENTORY TABLE */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left' }}>
              <th style={thInv}>VARIANTE / SKU</th>
              <th style={thInv}>UBICACIÓN</th>
              <th style={thInv}>TOTAL</th>
              <th style={thInv}>RESERVADO</th>
              <th style={thInv}>DISPONIBLE</th>
              <th style={thInv}>ESTADO STOCK</th>
              <th style={{ ...thInv, textAlign: 'right' }}>AJUSTE RÁPIDO</th>
            </tr>
          </thead>
          <tbody>
            {inventoryItems.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                <td style={tdInv}>
                  <div style={{ fontWeight: 800, color: '#09090B' }}>{item.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#71717A' }}>SKU: {item.sku}</div>
                </td>

                <td style={tdInv}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#71717A' }}>{item.location}</span>
                </td>

                <td style={{ ...tdInv, fontWeight: 800 }}>{item.total}</td>
                <td style={{ ...tdInv, color: '#0369A1', fontWeight: 700 }}>{item.reserved}</td>
                <td style={{ ...tdInv, color: '#065F46', fontWeight: 900, fontSize: '0.95rem' }}>{item.available}</td>

                <td style={tdInv}>
                  {item.status === 'ok' && (
                    <span style={badgeStyle('#D1FAE5', '#065F46')}>STOCK NORMAL</span>
                  )}
                  {item.status === 'low' && (
                    <span style={badgeStyle('#FEF3C7', '#92400E')}>STOCK BAJO</span>
                  )}
                  {item.status === 'out' && (
                    <span style={badgeStyle('#FEE2E2', '#991B1B')}>AGOTADO</span>
                  )}
                </td>

                <td style={{ ...tdInv, textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                    <input
                      type="number"
                      defaultValue={item.available}
                      style={{ width: '60px', padding: '0.3rem', border: '1px solid #D4D4D8', borderRadius: '4px', textAlign: 'center', fontWeight: 700 }}
                    />
                    <button style={{ backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800 }}>
                      Guardar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const kpiBox = {
  backgroundColor: '#FFFFFF',
  padding: '1.25rem',
  borderRadius: '8px',
  border: '1px solid #E4E4E7',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem'
};

const thInv = {
  padding: '0.85rem 1rem',
  fontSize: '0.75rem',
  fontWeight: 800,
  color: '#71717A',
  letterSpacing: '0.05em'
};

const tdInv = {
  padding: '0.85rem 1rem',
  color: '#09090B'
};

const badgeStyle = (bg, color) => ({
  fontSize: '0.72rem',
  fontWeight: 800,
  backgroundColor: bg,
  color: color,
  padding: '3px 8px',
  borderRadius: '4px'
});

export default AdminInventoryPage;
