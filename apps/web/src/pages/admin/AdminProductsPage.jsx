import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Edit, Trash2, Eye, RefreshCw, Sparkles } from 'lucide-react';
import { useECommerceStore } from '../../store/eCommerceStore';
import { formatCOP } from '../../data/mockData';

export const AdminProductsPage = () => {
  const navigate = useNavigate();
  const { products, deleteProduct, resetProductsToDefault } = useECommerceStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');

  const filteredProducts = products.filter((p) => {
    if (statusFilter !== 'todos' && (p.status || 'activo') !== statusFilter) {
      return false;
    }
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !p.slug.includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER & ACTION BUTTON */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
            CATÁLOGO DE PRODUCTOS ({products.length})
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
            Crea, edita o elimina prendas en tiempo real. Los cambios se reflejan inmediatamente en la tienda del cliente.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
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
        justify: 'space-between',
        alignItems: 'center',
        gap: '1rem'
      }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #D4D4D8', borderRadius: '6px', padding: '0.5rem 0.8rem', width: '320px' }}>
          <Search size={16} color="#71717A" />
          <input
            type="text"
            placeholder="Buscar por nombre, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }}
          />
        </div>

        {/* Status Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {['todos', 'activo', 'borrador', 'agotado', 'archivado'].map((st) => (
            <button
              key={st}
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
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* PRODUCTS TABLE */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflow: 'hidden' }}>
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
                      <img src={prod.images?.[0]} alt="" style={{ width: '48px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />
                      <div>
                        <div style={{ fontWeight: 800, color: '#09090B' }}>{prod.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#71717A' }}>SKU: {prod.slug}</div>
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
                      backgroundColor: prod.status === 'borrador' ? '#FEF3C7' : '#D1FAE5',
                      color: prod.status === 'borrador' ? '#92400E' : '#065F46'
                    }}>
                      {(prod.status || 'activo').toUpperCase()}
                    </span>
                  </td>

                  <td style={{ ...tdProduct, textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <Link to={`/producto/${prod.slug}`} target="_blank" style={actionIconBtn} title="Ver publicación de cliente">
                        <Eye size={16} />
                      </Link>
                      <button onClick={() => navigate(`/admin/productos/nuevo?editId=${prod.id}`)} style={actionIconBtn} title="Editar prenda">
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`¿Seguro que deseas eliminar la prenda "${prod.name}" de la tienda pública?`)) {
                            deleteProduct(prod.id);
                          }
                        }}
                        style={{ ...actionIconBtn, color: '#E11D48' }}
                        title="Eliminar de la tienda"
                      >
                        <Trash2 size={16} />
                      </button>
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
