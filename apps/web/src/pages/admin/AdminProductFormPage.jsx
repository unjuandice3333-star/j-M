import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, Sparkles, Check, Upload } from 'lucide-react';
import { CATEGORIES } from '../../data/mockData';
import { useECommerceStore } from '../../store/eCommerceStore';

export const AdminProductFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const editId = id || searchParams.get('editId');
  const { products, addProduct, updateProduct } = useECommerceStore();

  const existingProduct = editId ? products.find((p) => p.id === editId || p.slug === editId) : null;

  const [formData, setFormData] = useState({
    name: 'Camiseta Premium J&M Colombia',
    category: 'camisetas',
    price: 129900,
    originalPrice: 159900,
    cost: 45000,
    fit: 'REGULAR',
    occasion: 'casual',
    description: 'Prenda masculina de diseño exclusivo, confeccionada con textiles seleccionados de 220g para garantizar caída estructurada y máxima comodidad.',
    detailsText: '100% Algodón Colombiano\nCuello reforzado anti-deformación\nHecho en Colombia',
    images: [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=1000'
    ],
    imageUrl1: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=1000',
    imageUrl2: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=1000',
    colorName1: 'Negro Azabache',
    colorHex1: '#121212',
    colorName2: 'Blanco Nieve',
    colorHex2: '#FFFFFF',
    selectedSizes: ['S', 'M', 'L', 'XL'],
    isNew: true,
    isBestSeller: false,
    isSale: true,
    status: 'activo'
  });

  useEffect(() => {
    if (existingProduct) {
      setFormData({
        name: existingProduct.name || '',
        category: existingProduct.category || 'camisetas',
        price: existingProduct.price || 0,
        originalPrice: existingProduct.originalPrice || '',
        cost: existingProduct.cost || 0,
        fit: existingProduct.fit || 'REGULAR',
        occasion: existingProduct.occasion || 'casual',
        description: existingProduct.description || '',
        detailsText: Array.isArray(existingProduct.details) ? existingProduct.details.join('\n') : '',
        images: existingProduct.images || [],
        imageUrl1: existingProduct.images?.[0] || '',
        imageUrl2: existingProduct.images?.[1] || '',
        colorName1: existingProduct.colors?.[0]?.name || 'Negro Azabache',
        colorHex1: existingProduct.colors?.[0]?.hex || '#121212',
        colorName2: existingProduct.colors?.[1]?.name || '',
        colorHex2: existingProduct.colors?.[1]?.hex || '#FFFFFF',
        selectedSizes: existingProduct.sizes || ['S', 'M', 'L', 'XL'],
        isNew: existingProduct.isNew ?? true,
        isBestSeller: existingProduct.isBestSeller ?? false,
        isSale: existingProduct.isSale ?? false,
        status: existingProduct.status || 'activo'
      });
    }
  }, [existingProduct]);

  const [savedSuccess, setSavedSuccess] = useState(false);

  const margin = formData.price > 0 ? Math.round(((formData.price - formData.cost) / formData.price) * 100) : 0;

  const handleSizeToggle = (size) => {
    if (formData.selectedSizes.includes(size)) {
      setFormData({ ...formData, selectedSizes: formData.selectedSizes.filter((s) => s !== size) });
    } else {
      setFormData({ ...formData, selectedSizes: [...formData.selectedSizes, size] });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const colors = [
      { name: formData.colorName1 || 'Negro Azabache', hex: formData.colorHex1 || '#121212', selected: true }
    ];
    if (formData.colorName2) {
      colors.push({ name: formData.colorName2, hex: formData.colorHex2 || '#FFFFFF', selected: false });
    }

    const images = formData.images && formData.images.length > 0
      ? formData.images
      : [formData.imageUrl1, formData.imageUrl2].filter(Boolean);

    const details = formData.detailsText.split('\n').filter(Boolean);

    let createdProduct = null;

    if (existingProduct) {
      updateProduct(existingProduct.id, {
        name: formData.name,
        category: formData.category,
        price: Number(formData.price),
        originalPrice: formData.originalPrice ? Number(formData.originalPrice) : null,
        cost: Number(formData.cost),
        fit: formData.fit,
        occasion: formData.occasion,
        description: formData.description,
        details,
        colors,
        sizes: formData.selectedSizes.length > 0 ? formData.selectedSizes : ['S', 'M', 'L', 'XL'],
        images,
        isNew: formData.isNew,
        isBestSeller: formData.isBestSeller,
        isSale: formData.isSale,
        status: formData.status
      });
      createdProduct = existingProduct;
    } else {
      createdProduct = addProduct({
        name: formData.name,
        category: formData.category,
        price: Number(formData.price),
        originalPrice: formData.originalPrice ? Number(formData.originalPrice) : null,
        cost: Number(formData.cost),
        fit: formData.fit,
        occasion: formData.occasion,
        description: formData.description,
        details,
        colors,
        sizes: formData.selectedSizes.length > 0 ? formData.selectedSizes : ['S', 'M', 'L', 'XL'],
        images,
        isNew: formData.isNew,
        isBestSeller: formData.isBestSeller,
        isSale: formData.isSale,
        status: formData.status
      });
    }

    setSavedSuccess(true);
    setTimeout(() => {
      navigate(`/producto/${createdProduct.slug}`);
    }, 1200);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '900px' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={() => navigate('/admin/productos')} style={{ border: '1px solid #E4E4E7', padding: '0.5rem', borderRadius: '6px', backgroundColor: '#FFFFFF' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
              PUBLICAR NUEVA PRENDA EN LA TIENDA
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#71717A' }}>
              Al guardar, la prenda aparecerá de inmediato para los clientes en el catálogo.
            </p>
          </div>
        </div>

        <button
          type="submit"
          style={{
            backgroundColor: '#09090B',
            color: '#FFFFFF',
            padding: '0.85rem 1.6rem',
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
          <Save size={18} /> PUBLICAR EN TIENDA
        </button>
      </div>

      {savedSuccess && (
        <div style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '1rem', borderRadius: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Check size={18} /> ¡Prenda publicada exitosamente! Redirigiendo a la vista de cliente...
        </div>
      )}

      {/* 1. INFORMACIÓN PRINCIPAL */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '1.75rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
        <h3 style={sectionTitle}>1. DATOS DE LA PRENDA</h3>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Nombre del Producto *</label>
          <input
            type="text"
            required
            placeholder="Ej. Camiseta Heavyweight Oversize"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>Categoría *</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              style={inputStyle}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.slug}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Fit / Horma *</label>
            <select
              value={formData.fit}
              onChange={(e) => setFormData({ ...formData, fit: e.target.value })}
              style={inputStyle}
            >
              <option value="SLIM">SLIM FIT</option>
              <option value="REGULAR">REGULAR FIT</option>
              <option value="RELAXED">RELAXED FIT</option>
              <option value="OVERSIZE">OVERSIZE FIT</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Ocasión *</label>
            <select
              value={formData.occasion}
              onChange={(e) => setFormData({ ...formData, occasion: e.target.value })}
              style={inputStyle}
            >
              <option value="casual">Casual Urbano</option>
              <option value="trabajo">Trabajo & Oficina</option>
              <option value="cita">Cita & Salidas</option>
              <option value="fiesta">Noche & Eventos</option>
              <option value="fin-de-semana">Fin de Semana</option>
              <option value="streetwear">Streetwear Minimal</option>
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Descripción para el Cliente</label>
          <textarea
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            style={{ ...inputStyle, fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* 2. PRECIOS & COSTOS */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '1.75rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
        <h3 style={sectionTitle}>2. PRECIOS & MARGEN ($ COP)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Precio de Venta ($ COP) *</label>
            <input
              type="number"
              required
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Precio Anterior (Opcional)</label>
            <input
              type="number"
              value={formData.originalPrice}
              onChange={(e) => setFormData({ ...formData, originalPrice: Number(e.target.value) })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Costo de Fabricación</label>
            <input
              type="number"
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: Number(e.target.value) })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Margen Bruto (%)</label>
            <div style={{ ...inputStyle, backgroundColor: '#FAFAFA', fontWeight: 900, color: '#10B981', display: 'flex', alignItems: 'center' }}>
              {margin}% Margen
            </div>
          </div>
        </div>
      </div>

      {/* 3. IMÁGENES & COLORES */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '1.75rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
        <h3 style={sectionTitle}>3. FOTOGRAFÍAS DE PRODUCTO & COLORES</h3>

        {/* Subida Multi-Imagen de Fotografías */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={labelStyle}>Galería Fotográfica de la Prenda (Ilimitada)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            {formData.images?.map((imgUrl, idx) => (
              <div key={idx} style={{ position: 'relative', width: '100px', height: '120px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E4E4E7', backgroundColor: '#F4F4F5' }}>
                <img src={imgUrl} alt={`Foto ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  type="button"
                  onClick={() => {
                    const newImgs = formData.images.filter((_, i) => i !== idx);
                    setFormData({ ...formData, images: newImgs, imageUrl1: newImgs[0] || '', imageUrl2: newImgs[1] || '' });
                  }}
                  style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(9, 9, 11, 0.8)', color: '#FFF', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Eliminar foto"
                >
                  <Trash2 size={11} />
                </button>
                <span style={{ position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(9,9,11,0.7)', color: '#FFF', fontSize: '0.65rem', fontWeight: 800, padding: '1px 5px', borderRadius: '3px' }}>
                  #{idx + 1}
                </span>
              </div>
            ))}

            <label style={{ width: '100px', height: '120px', border: '2px dashed #D4D4D8', borderRadius: '8px', backgroundColor: '#FAFAFA', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0.5rem' }}>
              <Plus size={20} color="#71717A" />
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#09090B', marginTop: '0.3rem' }}>Agregar Fotos</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  files.forEach((file) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setFormData((prev) => {
                        const updatedImgs = [...(prev.images || []), reader.result];
                        return {
                          ...prev,
                          images: updatedImgs,
                          imageUrl1: updatedImgs[0] || '',
                          imageUrl2: updatedImgs[1] || ''
                        };
                      });
                    };
                    reader.readAsDataURL(file);
                  });
                }}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 600 }}>O agregar por enlace de foto:</span>
            <input
              type="url"
              placeholder="https://..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.target.value.trim()) {
                    const updatedImgs = [...(formData.images || []), e.target.value.trim()];
                    setFormData({ ...formData, images: updatedImgs, imageUrl1: updatedImgs[0] || '', imageUrl2: updatedImgs[1] || '' });
                    e.target.value = '';
                  }
                }
              }}
              style={{ ...inputStyle, padding: '0.4rem 0.6rem', fontSize: '0.8rem', flex: 1 }}
            />
          </div>
        </div>

        {/* Tallas Selector */}
        <div>
          <label style={labelStyle}>Tallas Disponibles</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {['S', 'M', 'L', 'XL', 'XXL', '30', '32', '34', '36', '38', '39', '40', '41', '42'].map((sz) => {
              const isSelected = formData.selectedSizes.includes(sz);
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => handleSizeToggle(sz)}
                  style={{
                    padding: '0.4rem 0.8rem',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    borderRadius: '4px',
                    border: isSelected ? '2px solid #09090B' : '1px solid #E4E4E7',
                    backgroundColor: isSelected ? '#09090B' : '#FFFFFF',
                    color: isSelected ? '#FFFFFF' : '#09090B',
                    cursor: 'pointer'
                  }}
                >
                  {sz}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </form>
  );
};

const sectionTitle = {
  fontSize: '0.95rem',
  fontWeight: 900,
  color: '#09090B',
  letterSpacing: '0.05em',
  marginBottom: '1rem',
  textTransform: 'uppercase'
};

const labelStyle = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#09090B',
  marginBottom: '0.4rem'
};

const inputStyle = {
  width: '100%',
  padding: '0.7rem 0.85rem',
  border: '1px solid #D4D4D8',
  borderRadius: '6px',
  fontSize: '0.85rem',
  outline: 'none'
};

export default AdminProductFormPage;
