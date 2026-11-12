import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, AlertTriangle, CheckCircle, Search, RefreshCw, MapPin } from 'lucide-react';
import supabase from '../../config/supabase';
import { adminService } from '../../services/adminService';
import { fetchAllRows } from '../../utils/adminLists';

/**
 * Ejecución 77: filtro de stock en la URL (`?stock=alerta|agotado`) para enlazar desde la tarjeta del dashboard.
 * «alerta» usa la MISMA regla que `admin_dashboard_metrics.low_stock_variants`: variante activa y disponible
 * (stock − reservado) ≤ mínimo; incluye las agotadas. Valor desconocido → todas.
 */
export const STOCK_FILTERS = { todos: 'Todas las variantes', alerta: 'Stock bajo o agotado', agotado: 'Agotadas' };
export const stockFilterFromParam = (value) => (Object.hasOwn(STOCK_FILTERS, value) ? value : 'todos');
export const isStockAlert = (item) => item.variantActive && item.available <= item.min;
export const matchesStockFilter = (item, filter) => {
  if (filter === 'alerta') return isStockAlert(item);
  if (filter === 'agotado') return item.available <= 0;
  return true;
};

export const AdminInventoryPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const stockFilter = stockFilterFromParam(searchParams.get('stock'));
  const setStockFilter = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'todos') next.delete('stock'); else next.set('stock', value);
    setSearchParams(next, { replace: true });
  };
  const [inventoryItems, setInventoryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adjustingId, setAdjustingId] = useState(null);
  const [adjustmentValue, setAdjustmentValue] = useState({});

  // Cargar inventario real desde Supabase PostgreSQL (inventories JOIN variants JOIN products)
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [reasons, setReasons] = useState({});
  // M27: stock, reservado y disponible reales (inventories + variante + color por product_colors). Sin valores inventados.
  const fetchRealInventory = async () => {
    setIsLoading(true); setLoadError(null);
    // Todas las filas por páginas: con más de 1000 variantes PostgREST cortaba la lista sin avisar (ejecución 54).
    const { data, error } = await fetchAllRows(() => supabase.from('inventories').select(`
        id, stock, reserved, min_stock, location_shelf, variant_id, branch_id,
        variants ( id, sku, is_active, color_id, sizes ( code ), products ( id, name, reference, status, product_colors ( color_id, colors ( name ) ) ) )`)
      .order('updated_at', { ascending: false }).order('id', { ascending: true }));
    if (error) { setLoadError('No se pudo cargar el inventario.'); setIsLoading(false); return; }
    setInventoryItems(data.map((inv) => {
      const v = inv.variants; const p = v?.products;
      const colorName = p?.product_colors?.find((pc) => pc.color_id === v?.color_id)?.colors?.name ?? '—';
      const available = inv.stock - inv.reserved;
      return {
        id: inv.id, variantId: inv.variant_id, branchId: inv.branch_id,
        name: `${p?.name ?? '—'} — ${colorName} / ${v?.sizes?.code ?? '—'}`, sku: v?.sku ?? '—',
        location: inv.location_shelf || 'Bodega principal', total: inv.stock, reserved: inv.reserved, available, min: inv.min_stock,
        status: available <= 0 ? 'out' : available <= inv.min_stock ? 'low' : 'ok', inactive: !v?.is_active || p?.status !== 'active',
        variantActive: !!v?.is_active,
      };
    }));
    setIsLoading(false);
  };

  useEffect(() => {
    fetchRealInventory();
  }, []);

  /** Ajuste con trazabilidad (admin_adjust_inventory): entrada (restock) o ajuste (+/-) con motivo obligatorio. */
  const handleStockAdjustment = async (item) => {
    const changeVal = Number(adjustmentValue[item.id]);
    const reason = (reasons[item.id] || '').trim();
    setNotice(null);
    if (!Number.isInteger(changeVal) || changeVal === 0) { setNotice({ ok: false, text: 'Escribe una cantidad entera distinta de 0 (ej. 5 o -2).' }); return; }
    if (!reason) { setNotice({ ok: false, text: 'Escribe el motivo del ajuste.' }); return; }
    setAdjustingId(item.id);
    try {
      const r = await adminService.adjustInventory(item.variantId, changeVal, changeVal > 0 ? 'restock' : 'adjustment', reason);
      setNotice({ ok: true, text: `${item.sku}: stock ${r.stock_before} → ${r.stock_after} (disponible ${r.available}).` });
      setAdjustmentValue((prev) => ({ ...prev, [item.id]: '' })); setReasons((prev) => ({ ...prev, [item.id]: '' }));
      await fetchRealInventory();
    } catch (err) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setAdjustingId(null);
    }
  };

  const filteredItems = inventoryItems.filter((item) => matchesStockFilter(item, stockFilter) && (
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchQuery.toLowerCase())
  ));
  const alertCount = inventoryItems.filter(isStockAlert).length;

  const totalUnits = inventoryItems.reduce((acc, i) => acc + i.available, 0);
  const lowStockCount = inventoryItems.filter((i) => i.status === 'low').length;
  const outOfStockCount = inventoryItems.filter((i) => i.status === 'out').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER & LOCATION SWITCHER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
            INVENTARIO ({inventoryItems.length} variantes)
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
            Stock físico, reservado por pedidos pendientes y disponible. Cada ajuste queda registrado con su motivo.
          </p>
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

      {/* SEARCH & STOCK FILTER */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Buscar por nombre o SKU"
        aria-label="Buscar en inventario"
        style={{ padding: '0.7rem 0.9rem', border: '1px solid #E4E4E7', borderRadius: '8px', fontSize: '0.9rem', maxWidth: '420px', width: '100%' }}
      />
      <select aria-label="Filtrar por estado de stock" value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}
        style={{ padding: '0.7rem 0.9rem', border: '1px solid #E4E4E7', borderRadius: '8px', fontSize: '0.9rem' }}>
        {Object.entries(STOCK_FILTERS).map(([k, label]) => (
          <option key={k} value={k}>{k === 'alerta' && !isLoading ? `${label} (${alertCount})` : label}</option>
        ))}
      </select>
      </div>

      {/* INVENTORY TABLE */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflow: 'hidden' }}>
        {loadError && <div role="alert" style={{ color: '#B91C1C', fontWeight: 600, padding: '1rem' }}>{loadError}</div>}
        {notice && <div role={notice.ok ? 'status' : 'alert'} style={{ color: notice.ok ? '#065F46' : '#B91C1C', fontWeight: 600, padding: '0.75rem 1rem' }}>{notice.text}</div>}
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#71717A' }}>
            Cargando inventario real desde Supabase PostgreSQL...
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#71717A', fontWeight: 600 }}>
            {inventoryItems.length > 0 ? 'Ninguna variante coincide con el filtro.' : 'No hay registros ni movimientos de inventario.'}
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

                  <td style={{ ...tdInv, color: '#065F46', fontWeight: 900, fontSize: '0.95rem' }}>
                    {item.available}
                    <div style={{ fontSize: '0.7rem', color: '#71717A', fontWeight: 600 }}>stock {item.total} · reservado {item.reserved}</div>
                    {item.inactive && <div style={{ fontSize: '0.7rem', color: '#92400E', fontWeight: 700 }}>no publicado</div>}
                  </td>

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
                        aria-label={`Cantidad a ajustar ${item.sku}`}
                        style={{ width: '80px', padding: '0.3rem', border: '1px solid #D4D4D8', borderRadius: '4px', textAlign: 'center', fontWeight: 700 }}
                      />
                      <input
                        type="text"
                        placeholder="Motivo"
                        aria-label={`Motivo del ajuste ${item.sku}`}
                        value={reasons[item.id] || ''}
                        onChange={(e) => setReasons({ ...reasons, [item.id]: e.target.value })}
                        style={{ width: '150px', padding: '0.3rem', border: '1px solid #D4D4D8', borderRadius: '4px' }}
                      />
                      <button
                        onClick={() => handleStockAdjustment(item)}
                        disabled={adjustingId === item.id}
                        style={{ backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, opacity: adjustingId === item.id ? 0.7 : 1 }}
                      >
                        {adjustingId === item.id ? 'Ajustando...' : 'Ajustar'}
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
