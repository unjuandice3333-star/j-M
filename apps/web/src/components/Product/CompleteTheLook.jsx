import React, { useEffect, useState } from 'react';
import { ShoppingBag, Sparkles, ArrowRight } from '../Common/icons';
import { formatCOP } from '../../utils/currency';
import supabase from '../../config/supabase';
import { useECommerceStore } from '../../store/eCommerceStore';
import SafeProductImage from '../Common/SafeImage';
import { colorsInStock, defaultLookSelection, resolveLookSelection } from '../../utils/lookSelection';
import { VariantPicker } from './VariantPicker';

// M27: el look sale de la BD (collections kind = 'look' + collection_products). Sin look publicado, no se muestra
// nada (antes: un look simulado con productos inexistentes y un descuento por paquete que la tienda no aplica).
export const CompleteTheLook = ({ lookSlug = null }) => {
  const { products, editorialImages, addItem } = useECommerceStore();
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [look, setLook] = useState(null);
  const [notice, setNotice] = useState(null);
  const [selections, setSelections] = useState({}); // productId → { color, size }

  const getEditorialImg = (key, fallback) => (editorialImages && editorialImages[key]) ? editorialImages[key] : fallback;

  useEffect(() => {
    let alive = true;
    let q = supabase.from('collections').select('slug, name, subtitle, image_url, collection_products ( product_id, position )')
      .eq('kind', 'look').eq('is_active', true).order('sort_order').limit(1);
    if (lookSlug) q = q.eq('slug', lookSlug);
    q.then(({ data }) => { if (alive) setLook(data?.[0] ?? null); });
    return () => { alive = false; };
  }, [lookSlug]);

  const lookProducts = look
    ? [...look.collection_products].sort((a, b) => a.position - b.position)
        .map((cp) => (products || []).find((p) => p.id === cp.product_id)).filter(Boolean)
    : [];
  if (!look || lookProducts.length === 0) return null;
  const selectionOf = (p) => selections[p.id] ?? defaultLookSelection(p);
  const setSelection = (p, next) => { setSelections((st) => ({ ...st, [p.id]: next })); setNotice(null); };
  const purchasable = lookProducts.filter((p) => colorsInStock(p).length > 0);
  const totalPrice = purchasable.reduce((n, p) => n + p.price, 0);

  // Agrega cada prenda con la talla y el color elegidos. Si falta elegir alguna talla no se agrega nada
  // (un look a medias con tallas al azar es peor que pedir la elección).
  const handleBuyLook = () => {
    const { ready, missing, soldOut } = resolveLookSelection(lookProducts, selections);
    if (missing.length) {
      setNotice({ type: 'error', text: `Elige la talla de: ${missing.map((p) => p.name).join(', ')}.` });
      return;
    }
    if (ready.length === 0) {
      setNotice({ type: 'error', text: 'Las prendas de este look están agotadas.' });
      return;
    }
    const failed = [];
    for (const { product, size, color } of ready) {
      const res = addItem(product, size, color, 1);
      if (!res.ok) failed.push(`${product.name} (${res.message ?? 'no disponible'})`);
    }
    const parts = [];
    if (failed.length) parts.push(`No se pudieron agregar: ${failed.join(', ')}.`);
    if (soldOut.length) parts.push(`Agotado: ${soldOut.map((p) => p.name).join(', ')}.`);
    const added = ready.length - failed.length;
    setNotice({
      type: failed.length || soldOut.length ? 'error' : 'ok',
      text: [added ? `${added} prenda(s) agregada(s) al carrito.` : null, ...parts].filter(Boolean).join(' '),
    });
  };

  const coverImage = look.image_url || getEditorialImg('outfit_complete_look', null);

  // Etiqueta = categoría real del producto (antes: «CAMISETA», «JEAN», «CALZADO» fijos según la posición,
  // así que un look que empezaba por un pantalón lo rotulaba como camiseta).
  const getProductCategoryLabel = (prod) => (prod.categoryName || prod.category || 'Prenda').toUpperCase();

  return (
    <section
      aria-label="Outfit recomendado Completa el Look"
      style={{
        backgroundColor: '#FAFAFA',
        border: '1px solid #E4E4E7',
        borderRadius: '12px',
        padding: '2.25rem clamp(1rem, 5vw, 2.5rem)', // menos relleno lateral en móvil
        margin: '2.5rem 0',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)'
      }}
    >
      {/* 2. ENCABEZADO EDITORIAL */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
          <Sparkles size={16} color="#D4AF37" />
          <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.18em', color: '#71717A', textTransform: 'uppercase' }}>
            ✦ OUTFIT RECOMENDADO
          </span>
        </div>

        <h2 style={{ fontSize: '1.65rem', fontWeight: 900, color: '#09090B', letterSpacing: '0.02em', textTransform: 'uppercase', margin: '0 0 0.35rem 0' }}>
          COMPLETA EL LOOK
        </h2>
        <p style={{ fontSize: '0.88rem', color: '#71717A', margin: 0, fontWeight: 500 }}>
          {look.subtitle}
        </p>
      </div>

      {/* 1. LAYOUT 48% IMAGEN / 52% CONTENIDO EN DESKTOP */}
      <div style={{
        display: 'grid',
        // min(320px, 100%): en pantallas de menos de 320 px útiles la columna se ajusta en vez de desbordar
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
        gap: '2.5rem',
        alignItems: 'center'
      }}>
        {/* 3. IMAGEN PRINCIPAL EDITORIAL (48% PROPORCIÓN) */}
        <div style={{
          position: 'relative',
          borderRadius: '8px',
          overflow: 'hidden',
          aspectRatio: '4/5',
          backgroundColor: '#F4F4F5',
          border: '1px solid #E4E4E7',
          boxShadow: '0 8px 24px rgba(0,0,0,0.06)'
        }}>
          <SafeProductImage
            src={coverImage}
            alt={look.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          
          {/* Degradado inferior con detalles de alta gama - Exclusivamente en la parte inferior */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(9,9,11,0.90) 0%, rgba(9,9,11,0.35) 25%, transparent 50%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '1.75rem'
          }}>
            {/* Detalle dorado de acento */}
            <div style={{ width: '28px', height: '2px', backgroundColor: '#D4AF37', marginBottom: '0.75rem' }} />
            
            <span style={{ color: '#FFFFFF', fontWeight: 900, fontSize: '1.18rem', letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.25 }}>
              {look.name}
            </span>
          </div>
        </div>

        {/* CONTENIDO DERECHO: PRODUCTOS + PRECIO + CTA (52% PROPORCIÓN) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* 4. LISTA DE PRODUCTOS CON NUMERACIÓN ELEGANTE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {lookProducts.map((prod, index) => {
              const isHovered = hoveredIndex === index;
              return (
                <div
                  key={prod.id}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.1rem',
                    padding: '0.85rem 1rem',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '8px',
                    border: isHovered ? '1px solid #D4AF37' : '1px solid #E4E4E7',
                    boxShadow: isHovered ? '0 6px 18px rgba(212, 175, 55, 0.08)' : 'none',
                    transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    cursor: 'default'
                  }}
                >
                  {/* Foto con ampliación suave */}
                  <div style={{ width: '54px', height: '68px', borderRadius: '5px', overflow: 'hidden', flexShrink: 0, backgroundColor: '#F4F4F5' }}>
                    <SafeProductImage
                      product={prod}
                      imageIndex={0}
                      alt={prod.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                        transition: 'transform 0.3s ease'
                      }}
                    />
                  </div>

                  {/* Jerarquía de Texto: 01 CATEGORÍA > Nombre > Fit/Color */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 900, color: 'var(--accent-gold-text)', letterSpacing: '0.1em' }}>
                        0{index + 1}
                      </span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#71717A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        {getProductCategoryLabel(prod)}
                      </span>
                    </div>

                    <div style={{
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      color: '#09090B',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {prod.name}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#71717A', marginTop: '0.15rem' }}>
                      {prod.fit ? `FIT: ${prod.fit}` : null}
                    </div>

                    <VariantPicker product={prod} selection={selectionOf(prod)} onChange={(next) => setSelection(prod, next)} />
                  </div>

                  {/* Precio Individual */}
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#09090B', flexShrink: 0 }}>
                    {formatCOP(prod.price)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 6. REDISEÑO DEL BLOQUE DE PRECIO & 7. CTA */}
          <div style={{
            backgroundColor: '#FFFFFF',
            padding: '1.35rem 1.5rem',
            borderRadius: '8px',
            border: '1px solid #E4E4E7',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            boxShadow: '0 4px 14px rgba(0,0,0,0.02)'
          }}>
            {/* Header del bloque de precio */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#71717A', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>
                  PRECIO DEL LOOK
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#09090B', letterSpacing: '-0.02em' }}>
                    {formatCOP(totalPrice)}
                  </span>
                </div>
              </div>
            </div>

            {/* 7. CTA PRINCIPAL */}
            <button
              onClick={handleBuyLook}
              style={{
                width: '100%',
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                padding: '1rem 1.25rem',
                borderRadius: '6px',
                fontWeight: 800,
                fontSize: '0.88rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease, transform 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#27272A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#09090B';
              }}
            >
              COMPRAR EL LOOK COMPLETO <ArrowRight size={18} color="#D4AF37" />
            </button>

            {/* Microtexto informativo debajo del CTA */}
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#71717A', fontWeight: 600 }}>
              Incluye {purchasable.length} producto(s) disponible(s){purchasable.length < lookProducts.length ? ` de ${lookProducts.length}` : ''}
            </div>
            {notice && (
              <div role={notice.type === 'error' ? 'alert' : 'status'} data-testid="look-notice" style={{
                textAlign: 'center', fontSize: '0.8rem', fontWeight: 700,
                color: notice.type === 'error' ? '#B91C1C' : '#065F46',
              }}>
                {notice.text}
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  );
};

export default CompleteTheLook;
