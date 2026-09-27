import React, { useState, useEffect } from 'react';
import { Boxes, AlertTriangle, CheckCircle, Search, RefreshCw, MapPin } from 'lucide-react';
import supabase from '../../config/supabase';

export const AdminInventoryPage = () => {
  const [selectedLocation, setSelectedLocation] = useState('online');
  const [searchQuery, setSearchQuery] = useState('');
  const [inventoryItems, setInventoryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adjustingId, setAdjustingId] = useState(null);
  const [adjustmentValue, setAdjustmentValue] = useState({});

  // Cargar inventario real desde Supabase PostgreSQL (inventories JOIN variants JOIN products)
  const fetchRealInventory = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventories')
        .select(`
          id,
          stock,
          min_stock,
          location_shelf,
          variant_id,
          branch_id,
          variants (
            id,
            sku,
            barcode,
            sizes(code),
            colors(name),
            products (
              id,
              name,
              reference
            )
          )
        `);

      if (!error && data && data.length > 0) {
        const formatted = data.map((inv) => {
          const prodName = inv.variants?.products?.name || 'Prenda J&M';
          const sizeCode = inv.variants?.sizes?.code || 'M';
          const colorName = inv.variants?.colors?.name || 'Negro Azabache';
          const stock = inv.stock || 0;
          const min = inv.min_stock || 5;

          return {
            id: inv.id,
            variantId: inv.variant_id,
            branchId: inv.branch_id,
            name: `${prodName} — ${colorName} / ${sizeCode}`,
            sku: inv.variants?.sku || inv.variants?.barcode || 'SKU-PENDIENTE',
            location: 'Bodega Online',
            total: stock,
            reserved: 0,
            available: stock,
            min,
            status: stock === 0 ? 'out' : stock <= min ? 'low' : 'ok'
          };
        });
        setInventoryItems(formatted);
      } else {
        setInventoryItems([]);
      }
    } catch (e) {
      console.error('[AdminInventoryPage Error]: Error al cargar inventario real:', e);
      setInventoryItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRealInventory();
  }, []);

  const handleStockAdjustment = async (item) => {
    const changeVal = Number(adjustmentValue[item.id]);
    if (isNaN(changeVal) || changeVal === 0) return;

    setAdjustingId(item.id);
    try {
      // Invocación del RPC autoritativo adjust_inventory_stock con trazabilidad en inventory_movements
      const { data, error } = await supabase.rpc('adjust_inventory_stock', {
        p_variant_id: item.variantId,
        p_quantity_change: changeVal,
        p_movement_type: changeVal > 0 ? 'restock' : 'adjustment',
        p_reason: 'Ajuste manual desde panel administrativo OMS'
      });

      if (error) {
        alert(`Error al ajustar inventario: ${error.message}`);
      } else {
        await fetchRealInventory();
        setAdjustmentValue((prev) => ({ ...prev, [item.id]: '' }));
      }
    } catch (err) {
      console.error('[handleStockAdjustment Exception]:', err);
    } finally {
      setAdjustingId(null);
    }
  };

  const filteredItems = inventoryItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUnits = inventoryItems.reduce((acc, i) => acc + i.available, 0);
  const lowStockCount = inventoryItems.filter((i) => i.status === 'low').length;
  const outOfStockCount = inventoryItems.filter((i) => i.status === 'out').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER & LOCATION SWITCHER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
            CONTROL DE INVENTARIO Y MOVIMIENTOS OMS ({inventoryItems.length})
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
            Trazabilidad transaccional de stock con registro de movimientos en PostgreSQL.
          </p>
        </div>

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
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#09090B' }}>{totalUnits} uds</span>
        </div>
        <div style={kpiBox}>
          <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 800 }}>ALERTAS STOCK BAJO</span>
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#D97706' }}>{lowStockCount} refs</span>
        </div>
        <div style={kpiBox}>
          <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 800 }}>REFERENCIAS AGOTADAS</span>
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#E11D48' }}>{outOfStockCount} refs</span>
        </div>
      </div>

      {/* INVENTORY TABLE */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#71717A' }}>
            Cargando inventario real desde Supabase PostgreSQL...
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#71717A', fontWeight: 600 }}>
            No hay registros ni movimientos de inventario.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left' }}>
                <th style={thInv}>VARIANTE / SKU</th>
                <th style={thInv}>UBICACIÓN</th>
                <th style={thInv}>DISPONIBLE</th>
                <th style={thInv}>ESTADO STOCK</th>
                <th style={{ ...thInv, textAlign: 'right' }}>AJUSTE TRANSACCIONAL (RPC)</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                  <td style={tdInv}>
                    <div style={{ fontWeight: 800, color: '#09090B' }}>{item.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#71717A' }}>SKU: {item.sku}</div>
                  </td>

                  <td style={tdInv}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#71717A' }}>{item.location}</span>
                  </td>

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
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        type="number"
                        placeholder="+/- Cant"
                        value={adjustmentValue[item.id] || ''}
                        onChange={(e) => setAdjustmentValue({ ...adjustmentValue, [item.id]: e.target.value })}
                        style={{ width: '80px', padding: '0.3rem', border: '1px solid #D4D4D8', borderRadius: '4px', textAlign: 'center', fontWeight: 700 }}
                      />
                      <button
                        onClick={() => handleStockAdjustment(item)}
                        disabled={adjustingId === item.id}
                        style={{ backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, opacity: adjustingId === item.id ? 0.7 : 1 }}
                      >
                        {adjustingId === item.id ? 'Ajustando...' : 'Ajustar RPC'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
