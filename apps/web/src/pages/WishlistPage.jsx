import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, ArrowRight } from 'lucide-react';
import { useECommerceStore } from '../store/eCommerceStore';
import ProductCard from '../components/Product/ProductCard';
import { AccountSectionNav } from '../components/Account/AccountSectionNav';
import { useAuthStore } from '../store/authStore';
import { VariantPicker } from '../components/Product/VariantPicker';
import { defaultLookSelection } from '../utils/lookSelection';

export const WishlistPage = () => {
  const { wishlist, products, moveWishlistToCart, wishlistError } = useECommerceStore();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [moveResult, setMoveResult] = useState(null);
  const [selections, setSelections] = useState({}); // productId → { color, size }
  const wishlistProducts = products.filter((p) => wishlist.includes(p.id));
  const selectionOf = (p) => selections[p.id] ?? defaultLookSelection(p);
  const setSelection = (p, next) => { setSelections((st) => ({ ...st, [p.id]: next })); setMoveResult(null); };
  // Cada favorito se agrega con la talla y el color elegidos (antes: la primera variante con stock, sin preguntar).
  const onMoveAll = () => {
    const r = moveWishlistToCart(selections);
    if (r.missing.length) {
      setMoveResult({ ok: false, text: `Elige la talla de: ${r.missing.join(', ')}.` });
      return;
    }
    const parts = [];
    if (r.added) parts.push(`${r.added} prenda(s) agregada(s) al carrito.`);
    if (r.failed.length) parts.push(`No se pudieron agregar: ${r.failed.join(', ')}.`);
    if (r.soldOut.length) parts.push(`Agotado: ${r.soldOut.join(', ')}.`);
    if (!parts.length) parts.push('No hay prendas disponibles para agregar.');
    setMoveResult({ ok: r.ok && r.added > 0, text: parts.join(' ') });
  };

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
      <div className="jm-container">
        {/* BREADCRUMB */}
        <div className="jm-breadcrumb" style={{ fontSize: '0.8rem', color: '#71717A', marginBottom: '1.5rem' }}>
          <Link to="/" style={{ color: '#71717A' }}>Inicio</Link>
          <span style={{ margin: '0 0.4rem' }}>/</span>
          <strong style={{ color: '#09090B' }}>Mis Favoritos</strong>
        </div>

        {isLoggedIn && <AccountSectionNav pathname="/cuenta/favoritos" />}

        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '1.25rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              LISTA DE DESEOS
            </span>
            <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', marginTop: '0.2rem' }}>
              MIS FAVORITOS ({wishlistProducts.length})
            </h1>
          </div>

          {wishlistProducts.length > 0 && (
            <button
              onClick={onMoveAll}
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
                gap: '0.5rem'
              }}
            >
              <ShoppingBag size={18} /> AGREGAR TODO AL CARRITO
            </button>
          )}
        </div>

        {!isLoggedIn && (
          <p style={{ fontSize: '0.85rem', color: '#52525B', marginBottom: '1rem' }}>
            Tu lista se guarda solo en este navegador. <Link to="/login" style={{ textDecoration: 'underline', fontWeight: 700 }}>Inicia sesión</Link> para conservarla en tu cuenta y verla en otros dispositivos.
          </p>
        )}
        {wishlistError && <div role="alert" style={{ color: '#B91C1C', fontWeight: 600, marginBottom: '1rem' }}>{wishlistError}</div>}
        {moveResult && <div data-testid="wishlist-notice" role={moveResult.ok ? 'status' : 'alert'} style={{ color: moveResult.ok ? '#065F46' : '#B91C1C', fontWeight: 600, marginBottom: '1rem' }}>{moveResult.text}</div>}
        {wishlistProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', border: '1px dashed #D4D4D8', borderRadius: '12px' }}>
            <Heart size={52} color="#A1A1AA" style={{ margin: '0 auto 1rem auto' }} />
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#09090B', marginBottom: '0.5rem' }}>
              No tienes productos guardados en favoritos
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#71717A', marginBottom: '2rem' }}>
              Explora nuestras prendas de moda masculina y toca el ícono de corazón para guardarlas.
            </p>
            <Link
              to="/ropa"
              style={{
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                padding: '0.9rem 2rem',
                borderRadius: '6px',
                fontWeight: 800,
                fontSize: '0.88rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              EXPLORAR ROPA <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '1.5rem'
          }}>
            {wishlistProducts.map((product) => (
              <div key={product.id} data-testid="wishlist-item">
                <ProductCard product={product} />
                <VariantPicker product={product} selection={selectionOf(product)} onChange={(next) => setSelection(product, next)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WishlistPage;
