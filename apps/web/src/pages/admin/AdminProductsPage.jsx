import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Filter, Edit, Trash2, Eye, RefreshCw, Sparkles, AlertTriangle, Boxes } from '../../components/Common/icons';
import { useECommerceStore } from '../../store/eCommerceStore';
import { productService } from '../../services/productService';
import { adminService } from '../../services/adminService';
import { formatCOP } from '../../utils/currency';
import SafeProductImage from '../../components/Common/SafeImage';
import { hasValidProductImage } from '../../utils/productUtils';
import { normalizeText } from '../../utils/catalogFilters';
import { inventoryLinkForProduct } from '../../utils/adminLists';

const STATUS_LABEL = { todos: 'Todos', active: 'Publicado', draft: 'Borrador', archived: 'Archivado', agotado: 'Agotado' };
// Ejecución 79: estado y búsqueda viven en la URL (?estado=, ?q=) como en pedidos e inventario.
export const productStatusFromParam = (value) => (Object.hasOwn(STATUS_LABEL, value) ? value : 'todos');
export const matchesProductStatus = (p, filter) => {
  if (filter === 'agotado') return p.status === 'active' && !p.inStock;
  return filter === 'todos' || p.status === filter;
};
/** Búsqueda sin tildes ni mayúsculas por nombre, slug, referencia o SKU de variante. */
export const matchesProductSearch = (p, query) => {
  const q = normalizeText(query);
  if (!q) return true;
  const fields = [p.name, p.slug, p.reference, ...(p.rawVariants ?? []).map((v) => v.sku)];
  return fields.some((f) => normalizeText(f).includes(q));
};

export const AdminProductsPage = () => {
  const navigate = useNavigate();
  const loadStoreProducts = useECommerceStore((st) => st.loadProducts);
  // M27: el panel lista TODOS los productos (RLS: el admin ve borradores y archivados), no el catálogo público.
  const [products, setProducts] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const reload = useCallback(async () => {
    try { setProducts(await productService.getProducts({ includeInactive: true })); setLoadError(null); }
    catch (e) { setLoadError(e.message); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const resetProductsToDefault = reload;
  const setStatus = async (prod, status) => {
    setActionMsg(null);
    try {
      await adminService.setProductStatus(prod.id, status);
      setActionMsg({ ok: true, text: `"${prod.name}": ${STATUS_LABEL[status].toLowerCase()}.` });
      await reload(); loadStoreProducts(true);
    } catch (e) { setActionMsg({ ok: false, text: e.message }); }
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') ?? '';
  const statusFilter = productStatusFromParam(searchParams.get('estado'));
  const setParam = (key, value, empty) => {
    const next = new URLSearchParams(searchParams);
    if (value === empty) next.delete(key); else next.set(key, value);
    setSearchParams(next, { replace: true });
  };
  const setSearchQuery = (value) => setParam('q', value, '');
  const setStatusFilter = (value) => setParam('estado', value, 'todos');

  const filteredProducts = products.filter((p) => matchesProductStatus(p, statusFilter) && matchesProductSearch(p, searchQuery));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER & ACTION BUTTON */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
            CATÁLOGO DE PRODUCTOS ({products.length})
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
            Crea, edita o elimina prendas en tiempo real. Los cambios se reflejan inmediatamente en la tienda del cliente.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={resetProductsToDefault}
            title="Restablecer catálogo inicial de demostración"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E4E4E7',
              color: '#71717A',
              padding: '0.85rem 1rem',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} /> RESTABLECER DEMO
          </button>

          <button
            onClick={() => navigate('/admin/productos/nuevo')}
            style={{
              backgroundColor: '#09090B',
              color: '#FFFFFF',
              padding: '0.85rem 1.4rem',
              borderRadius: '6px',
              fontWeight: 800,
              fontSize: '0.85rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer'
            }}
          >
            <Plus size={18} /> CREAR NUEVO PRODUCTO
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
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
            placeholder="Buscar por nombre, referencia o SKU..."
            aria-label="Buscar productos"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', minWidth: 0, fontSize: '0.85rem' }}
          />
        </div>

        {/* Status Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {['todos', 'active', 'draft', 'agotado', 'archived'].map((st) => (
            <button
              key={st}
              aria-pressed={statusFilter === st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                borderRadius: '6px',
                border: statusFilter === st ? '1px solid #09090B' : '1px solid #E4E4E7',
                backgroundColor: statusFilter === st ? '#09090B' : '#FFFFFF',
                color: statusFilter === st ? '#FFFFFF' : '#71717A',
                cursor: 'pointer'
              }}
            >
              {STATUS_LABEL[st] ?? st}
            </button>
          ))}
        </div>
      </div>
      {loadError && <div role="alert" style={{ color: '#B91C1C', fontWeight: 600 }}>{loadError}</div>}
      {actionMsg && <div role={actionMsg.ok ? 'status' : 'alert'} style={{ color: actionMsg.ok ? '#065F46' : '#B91C1C', fontWeight: 600 }}>{actionMsg.text}</div>}

      {/* PRODUCTS TABLE */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left' }}>
              <th style={thProduct}>PRODUCTO</th>
              <th style={thProduct}>CATEGORÍA</th>
              <th style={thProduct}>PRECIO DE VENTA</th>
              <th style={thProduct}>FIT</th>
              <th style={thProduct}>TALLAS DISPONIBLES</th>
              <th style={thProduct}>ESTADO</th>
              <th style={{ ...thProduct, textAlign: 'right' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: '#71717A' }}>
                  No hay productos registrados en esta categoría o filtro.
                </td>
              </tr>
            ) : (
              filteredProducts.map((prod) => (
                <tr key={prod.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                  {/* Product Meta */}
                  <td style={tdProduct}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '48px', height: '60px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                        <SafeProductImage product={prod} imageIndex={0} alt={prod.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {prod.name}
                          {!hasValidProductImage(prod) && (
                            <span style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Este producto no posee una imagen válida cargada">
                              <AlertTriangle size={10} /> Sin imagen válida
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#71717A' }}>Ref: {prod.reference} · /{prod.slug}</div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                          {prod.isNew && <span style={miniBadge('#09090B', '#FFF')}>NUEVO</span>}
                          {prod.isBestSeller && <span style={miniBadge('#D4AF37', '#09090B')}>MÁS VENDIDO</span>}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td style={{ ...tdProduct, textTransform: 'uppercase', fontWeight: 600, fontSize: '0.8rem', color: '#71717A' }}>
                    {prod.category}
                  </td>

                  <td style={{ ...tdProduct, fontWeight: 900 }}>
                    {formatCOP(prod.price)}
                  </td>

                  <td style={tdProduct}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, backgroundColor: '#FAFAFA', border: '1px solid #E4E4E7', padding: '3px 8px', borderRadius: '4px' }}>
                      {prod.fit}
                    </span>
                  </td>

                  <td style={tdProduct}>
                    <div style={{ fontSize: '0.78rem', color: '#27272A' }}>
                      {prod.sizes?.join(', ')} ({prod.colors?.length} colores)
                    </div>
                  </td>

                  <td style={tdProduct}>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      backgroundColor: prod.status === 'active' ? '#D1FAE5' : prod.status === 'draft' ? '#FEF3C7' : '#F4F4F5',
                      color: prod.status === 'active' ? '#065F46' : prod.status === 'draft' ? '#92400E' : '#52525B'
                    }}>
                      {(STATUS_LABEL[prod.status] ?? prod.status).toUpperCase()}
                    </span>
                    <div style={{ fontSize: '0.72rem', color: prod.inStock ? '#71717A' : '#E11D48', marginTop: '0.25rem' }}>Stock disponible: {prod.stock}</div>
                  </td>

                  <td style={{ ...tdProduct, textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <Link to={`/producto/${prod.slug}`} target="_blank" style={actionIconBtn} title="Ver publicación de cliente">
                        <Eye size={16} />
                      </Link>
                      {inventoryLinkForProduct(prod) && (
                        <Link data-testid={`product-inventory-${prod.id}`} to={inventoryLinkForProduct(prod)} style={actionIconBtn} title="Ver inventario de sus variantes" aria-label={`Ver inventario de ${prod.name}`}>
                          <Boxes size={16} />
                        </Link>
                      )}
                      <button onClick={() => navigate(`/admin/productos/nuevo?editId=${prod.id}`)} style={actionIconBtn} title="Editar prenda">
                        <Edit size={16} />
                      </button>
                      {prod.status !== 'active' ? (
                        <button onClick={() => setStatus(prod, 'active')} style={{ ...actionIconBtn, width: 'auto', padding: '0 0.6rem', fontSize: '0.72rem', fontWeight: 800 }} title="Publicar en la tienda">
                          PUBLICAR
                        </button>
                      ) : (
                        <button onClick={() => setStatus(prod, 'draft')} style={{ ...actionIconBtn, width: 'auto', padding: '0 0.6rem', fontSize: '0.72rem', fontWeight: 800 }} title="Retirar de la tienda (borrador)">
                          DESPUBLICAR
                        </button>
                      )}
                      {prod.status !== 'archived' && (
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Archivar "${prod.name}"? Deja de mostrarse en la tienda; su historial de pedidos se conserva.`)) setStatus(prod, 'archived');
                          }}
                          style={{ ...actionIconBtn, color: '#E11D48' }}
                          title="Archivar (no borra datos)"
                          aria-label={`Archivar ${prod.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const thProduct = {
  padding: '0.85rem 1rem',
  fontSize: '0.75rem',
  fontWeight: 800,
  color: '#71717A',
  letterSpacing: '0.05em'
};

const tdProduct = {
  padding: '0.85rem 1rem',
  color: '#09090B'
};

const miniBadge = (bg, color) => ({
  fontSize: '0.6rem',
  fontWeight: 800,
  backgroundColor: bg,
  color: color,
  padding: '2px 5px',
  borderRadius: '3px'
});

const actionIconBtn = {
  padding: '0.45rem',
  borderRadius: '4px',
  border: '1px solid #E4E4E7',
  backgroundColor: '#FFFFFF',
  color: '#09090B',
  cursor: 'pointer'
};

export default AdminProductsPage;
