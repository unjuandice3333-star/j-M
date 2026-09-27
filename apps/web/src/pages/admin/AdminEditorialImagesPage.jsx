import React, { useState } from 'react';
import {
  Image,
  Upload,
  Check,
  RotateCcw,
  Sparkles,
  Layers,
  Grid,
  Trash2,
  FolderOpen,
  AlertTriangle
} from 'lucide-react';
import { useECommerceStore, DEFAULT_EDITORIAL_IMAGES } from '../../store/eCommerceStore';

export const AdminEditorialImagesPage = () => {
  const { editorialImages, updateEditorialImage, resetEditorialImage } = useECommerceStore();
  const [activeTab, setActiveTab] = useState('todos');
  const [savedSuccessKey, setSavedSuccessKey] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const [editingImage, setEditingImage] = useState(null); // { key, title, section, currentUrl, newUrl, fileName }
  const [resetConfirmItem, setResetConfirmItem] = useState(null);

  const [mediaLibrary, setMediaLibrary] = useState([
    { url: 'https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?auto=format&fit=crop&q=80&w=2000', name: 'hero_menswear_editorial.jpg', date: '2026-09-20' },
    { url: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&q=80&w=1000', name: 'streetwear_denim_urban.jpg', date: '2026-09-21' },
    { url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=1000', name: 'menswear_blazer_elegant.jpg', date: '2026-09-22' },
    { url: 'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&q=80&w=1000', name: 'smart_casual_office.jpg', date: '2026-09-22' },
    { url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=800', name: 'category_tshirt_heavyweight.jpg', date: '2026-09-23' },
    { url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&q=80&w=800', name: 'category_shirts_folded.jpg', date: '2026-09-23' },
    { url: 'https://images.unsplash.com/photo-1626557981101-aae6f84aa6ff?auto=format&fit=crop&q=80&w=800', name: 'category_polo_male.jpg', date: '2026-09-24' },
    { url: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=800', name: 'category_jeans_denim.jpg', date: '2026-09-24' },
    { url: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&q=80&w=800', name: 'category_trousers_chinos.jpg', date: '2026-09-24' },
    { url: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&q=80&w=800', name: 'category_shorts_bermudas.jpg', date: '2026-09-25' },
    { url: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=800', name: 'category_jackets_leather.jpg', date: '2026-09-25' },
    { url: 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?auto=format&fit=crop&q=80&w=800', name: 'category_accessories_belt.jpg', date: '2026-09-25' },
    { url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=800', name: 'occasion_office_casual.jpg', date: '2026-09-26' },
    { url: 'https://images.unsplash.com/photo-1534030347209-467a5b0ad3e6?auto=format&fit=crop&q=80&w=800', name: 'occasion_gala_tuxedo.jpg', date: '2026-09-26' },
    { url: 'https://images.unsplash.com/photo-1488161628813-04466f872be2?auto=format&fit=crop&q=80&w=800', name: 'occasion_weekend_outdoor.jpg', date: '2026-09-26' },
    { url: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?auto=format&fit=crop&q=80&w=800', name: 'occasion_streetwear_oversized.jpg', date: '2026-09-26' }
  ]);

  const itemsDefinition = [
    { key: 'hero_main', title: 'Banner Principal (Hero)', section: 'hero', badge: 'Hero Homepage' },
    { key: 'style_urbana', title: 'Línea Urbana', section: 'styles', badge: 'Línea de Estilo' },
    { key: 'style_elegante', title: 'Línea Elegante', section: 'styles', badge: 'Línea de Estilo' },
    { key: 'style_smart_casual', title: 'Línea Smart Casual', section: 'styles', badge: 'Línea de Estilo' },
    { key: 'category_camisetas', title: 'Camisetas', section: 'categories', badge: 'Categoría Destacada' },
    { key: 'category_camisas', title: 'Camisas', section: 'categories', badge: 'Categoría Destacada' },
    { key: 'category_polos', title: 'Polos', section: 'categories', badge: 'Categoría Destacada' },
    { key: 'category_jeans', title: 'Jeans', section: 'categories', badge: 'Categoría Destacada' },
    { key: 'category_pantalones', title: 'Pantalones', section: 'categories', badge: 'Categoría Destacada' },
    { key: 'category_bermudas', title: 'Bermudas', section: 'categories', badge: 'Categoría Destacada' },
    { key: 'category_chaquetas', title: 'Chaquetas', section: 'categories', badge: 'Categoría Destacada' },
    { key: 'category_accesorios', title: 'Accesorios', section: 'categories', badge: 'Categoría Destacada' },
    { key: 'occasion_trabajo_oficina', title: 'Trabajo & Oficina', section: 'occasions', badge: 'Ocasión de Uso' },
    { key: 'occasion_cita_salidas', title: 'Cita & Salidas', section: 'occasions', badge: 'Ocasión de Uso' },
    { key: 'occasion_casual_urbano', title: 'Casual Urbano', section: 'occasions', badge: 'Ocasión de Uso' },
    { key: 'occasion_noche_eventos', title: 'Noche & Eventos', section: 'occasions', badge: 'Ocasión de Uso' },
    { key: 'occasion_fin_semana', title: 'Fin de Semana', section: 'occasions', badge: 'Ocasión de Uso' },
    { key: 'occasion_streetwear', title: 'Streetwear', section: 'occasions', badge: 'Ocasión de Uso' },
    { key: 'outfit_complete_look', title: 'El Outfit Urbano Minimalista (Completa el Look)', section: 'outfits', badge: 'Outfit Recomendado' }
  ];

  const filteredItems = itemsDefinition.filter(
    (item) => activeTab === 'todos' || item.section === activeTab
  );

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleOpenEdit = (item) => {
    const currentUrl = editorialImages?.[item.key] || DEFAULT_EDITORIAL_IMAGES[item.key];
    setEditingImage({
      ...item,
      currentUrl,
      newUrl: currentUrl
    });
    setErrorMessage(null);
  };

  const handleSaveEdit = () => {
    if (editingImage) {
      updateEditorialImage(editingImage.key, editingImage.newUrl);
      if (!mediaLibrary.some((m) => m.url === editingImage.newUrl)) {
        setMediaLibrary((prev) => [
          { url: editingImage.newUrl, name: editingImage.fileName || 'nueva_imagen.webp', date: new Date().toISOString().split('T')[0] },
          ...prev
        ]);
      }
      showToast(`Imagen actualizada correctamente para ${editingImage.title}.`);
      setEditingImage(null);
    }
  };

  const handleConfirmReset = (item) => {
    resetEditorialImage(item.key);
    setResetConfirmItem(null);
    showToast(`Imagen restaurada correctamente para ${item.title}.`);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Security Validation: File MIME Type
      if (!file.type.startsWith('image/')) {
        setErrorMessage('El archivo seleccionado no es una imagen válida. Aceptados: JPG, PNG, WEBP.');
        return;
      }

      // Security Validation: File Size limit 8MB
      if (file.size > 8 * 1024 * 1024) {
        setErrorMessage('La imagen no debe superar los 8MB.');
        return;
      }

      setErrorMessage(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        const rawDataUrl = reader.result;

        // Image optimization: compress & scale large photos using Canvas
        const img = new window.Image();
        img.src = rawDataUrl;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1600;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to WebP dataUrl with 0.85 quality for production performance
          const optimizedDataUrl = canvas.toDataURL('image/webp', 0.85);

          const newMediaItem = {
            url: optimizedDataUrl,
            name: file.name.replace(/\.[^/.]+$/, '') + '.webp',
            date: new Date().toISOString().split('T')[0]
          };
          setMediaLibrary((prev) => [newMediaItem, ...prev]);
          if (editingImage) {
            setEditingImage((prev) => ({ ...prev, newUrl: optimizedDataUrl, fileName: newMediaItem.name }));
          }
        };
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* SECTION HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#D4AF37', letterSpacing: '0.20em', textTransform: 'uppercase' }}>
            CONTENIDO DIGITAL & CMS EDITORIAL
          </span>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: '0.2rem 0' }}>
            IMÁGENES DE LA PÁGINA PRINCIPAL
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
            Administra dinámicamente las fotografías del Hero, Líneas de Estilo, Categorías Destacadas y Compra por Ocasión sin tocar código.
          </p>
        </div>
      </div>

      {/* SECTION TABS */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'todos', label: 'Todas las Imágenes (19)' },
          { id: 'hero', label: '1. Hero Principal' },
          { id: 'styles', label: '2. Líneas de Estilo' },
          { id: 'categories', label: '3. Categorías' },
          { id: 'occasions', label: '4. Ocasiones' },
          { id: 'outfits', label: '5. Outfits' },
          { id: 'library', label: '6. Biblioteca Multimedia' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: activeTab === tab.id ? 800 : 600,
              color: activeTab === tab.id ? '#FFFFFF' : '#71717A',
              backgroundColor: activeTab === tab.id ? '#09090B' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TOAST FEEDBACK */}
      {toastMessage && (
        <div style={{
          backgroundColor: '#09090B',
          color: '#FFFFFF',
          padding: '0.85rem 1.3rem',
          borderRadius: '8px',
          fontWeight: 700,
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          borderLeft: '4px solid #D4AF37'
        }}>
          <Check size={18} color="#D4AF37" />
          {toastMessage}
        </div>
      )}

      {/* TAB 5: STANDALONE MEDIA LIBRARY VIEW */}
      {activeTab === 'library' ? (
        <div style={{ backgroundColor: '#FFFFFF', padding: '1.5rem', borderRadius: '10px', border: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: 0 }}>
                BIBLIOTECA MULTIMEDIA CENTRALIZADA ({mediaLibrary.length})
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#71717A', margin: '0.2rem 0 0 0' }}>
                Galería de imágenes optimizadas para reutilizar en cualquier sección editorial de J&M Store.
              </p>
            </div>

            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#09090B',
              color: '#FFFFFF',
              padding: '0.75rem 1.25rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}>
              <Upload size={16} /> SUBIR ARCHIVO (JPG, PNG, WEBP)
              <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            {mediaLibrary.map((item, idx) => (
              <div key={idx} style={{ backgroundColor: '#FAFAFA', borderRadius: '8px', border: '1px solid #E4E4E7', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: '140px', backgroundColor: '#18181B', position: 'relative' }}>
                  <img src={item.url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#09090B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>
                    {item.name}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: '#71717A' }}>
                    Subido: {item.date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* IMAGES CARDS GRID FOR SECTIONS */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1.25rem' }}>
          {filteredItems.map((item) => {
            const currentUrl = editorialImages?.[item.key] || DEFAULT_EDITORIAL_IMAGES[item.key];
            const isCustom = currentUrl !== DEFAULT_EDITORIAL_IMAGES[item.key];

            return (
              <div
                key={item.key}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '10px',
                  border: '1px solid #E4E4E7',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                }}
              >
                {/* IMAGE PREVIEW */}
                <div style={{ position: 'relative', height: '180px', backgroundColor: '#18181B' }}>
                  <img
                    src={currentUrl}
                    alt={item.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <span style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    backgroundColor: 'rgba(9, 9, 11, 0.85)',
                    color: '#D4AF37',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase'
                  }}>
                    {item.badge}
                  </span>

                  <span style={{
                    position: 'absolute',
                    bottom: '10px',
                    right: '10px',
                    backgroundColor: isCustom ? 'rgba(16, 185, 129, 0.90)' : 'rgba(9, 9, 11, 0.75)',
                    color: '#FFFFFF',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: '4px',
                    letterSpacing: '0.05em'
                  }}>
                    {isCustom ? '● PERSONALIZADA' : 'PREDETERMINADA'}
                  </span>
                </div>

                {/* CARD DETAILS */}
                <div style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                  <div>
                    <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', margin: 0 }}>
                      {item.title}
                    </h3>
                    <span style={{ fontSize: '0.72rem', color: '#71717A', fontFamily: 'monospace' }}>
                      ID: {item.key}
                    </span>
                  </div>

                  <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', paddingTop: '0.5rem' }}>
                    <button
                      onClick={() => handleOpenEdit(item)}
                      style={{
                        flex: 1,
                        backgroundColor: '#09090B',
                        color: '#FFFFFF',
                        padding: '0.65rem 0.8rem',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        cursor: 'pointer',
                        border: 'none',
                        transition: 'background 0.2s ease'
                      }}
                    >
                      <Upload size={14} /> Cambiar
                    </button>

                    <button
                      onClick={() => setResetConfirmItem(item)}
                      title="Restaurar a imagen predeterminada original"
                      style={{
                        backgroundColor: '#F4F4F5',
                        color: '#71717A',
                        border: '1px solid #E4E4E7',
                        padding: '0.65rem 0.8rem',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem'
                      }}
                    >
                      <RotateCcw size={14} /> Restaurar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* EDIT MODAL / MEDIA LIBRARY SELECTION */}
      {editingImage && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(9, 9, 11, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '780px',
            maxHeight: '90vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            border: '1px solid #E4E4E7'
          }}>
            {/* MODAL HEADER */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E4E4E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#D4AF37', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  GESTOR DE IMAGEN
                </span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: 0 }}>
                  EDITAR: {editingImage.title}
                </h2>
              </div>
              <button
                onClick={() => setEditingImage(null)}
                style={{ backgroundColor: '#F4F4F5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontWeight: 800, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* MODAL BODY */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {errorMessage && (
                <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #EF4444', color: '#991B1B', padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangle size={16} /> {errorMessage}
                </div>
              )}

              {/* CURRENT & PREVIEW COMPARISON */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', display: 'block', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                    IMAGEN ACTUAL
                  </label>
                  <div style={{ height: '180px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E4E4E7', backgroundColor: '#18181B' }}>
                    <img src={editingImage.currentUrl} alt="Actual" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#D4AF37', display: 'block', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                    VISTA PREVIA NUEVA
                  </label>
                  <div style={{ height: '180px', borderRadius: '8px', overflow: 'hidden', border: '2px solid #D4AF37', backgroundColor: '#18181B' }}>
                    <img src={editingImage.newUrl} alt="Vista Previa" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                </div>
              </div>

              {/* UPLOAD / URL INPUT */}
              <div style={{ backgroundColor: '#FAFAFA', padding: '1.25rem', borderRadius: '8px', border: '1px solid #E4E4E7' }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  1. SUBIR NUEVO ARCHIVO DESDE TU EQUIPO (JPG, PNG, WEBP)
                </h4>
                <label style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: '#09090B',
                  color: '#FFFFFF',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}>
                  <Upload size={16} /> SELECTOR DE ARCHIVOS
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>

              {/* MEDIA LIBRARY PRESETS */}
              <div>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  2. O SELECCIONAR DE LA BIBLIOTECA MULTIMEDIA ({mediaLibrary.length})
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.65rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                  {mediaLibrary.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => setEditingImage({ ...editingImage, newUrl: item.url, fileName: item.name })}
                      style={{
                        height: '80px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: editingImage.newUrl === item.url ? '3px solid #D4AF37' : '1px solid #E4E4E7',
                        position: 'relative'
                      }}
                    >
                      <img src={item.url} alt={`Media ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {editingImage.newUrl === item.url && (
                        <span style={{ position: 'absolute', top: 4, right: 4, backgroundColor: '#D4AF37', color: '#09090B', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={12} />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid #E4E4E7', backgroundColor: '#FAFAFA', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setEditingImage(null)}
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', padding: '0.75rem 1.25rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveEdit}
                style={{ backgroundColor: '#D4AF37', color: '#09090B', border: 'none', padding: '0.75rem 1.6rem', borderRadius: '6px', fontWeight: 900, fontSize: '0.82rem', letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Check size={16} /> GUARDAR CAMBIO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM RESET MODAL */}
      {resetConfirmItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(9, 9, 11, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '450px',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            border: '1px solid #E4E4E7'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: 0 }}>
              ¿Restaurar imagen predeterminada?
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#71717A', margin: 0 }}>
              Esta acción eliminará la personalización para <strong>{resetConfirmItem.title}</strong> y restaurará la fotografía original del sistema.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                onClick={() => setResetConfirmItem(null)}
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', padding: '0.65rem 1.1rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.80rem', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleConfirmReset(resetConfirmItem)}
                style={{ backgroundColor: '#09090B', color: '#FFFFFF', border: 'none', padding: '0.65rem 1.3rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.80rem', cursor: 'pointer' }}
              >
                Sí, restaurar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminEditorialImagesPage;
