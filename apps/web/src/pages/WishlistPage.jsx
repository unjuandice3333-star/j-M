import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, ArrowRight } from 'lucide-react';
import { useECommerceStore } from '../store/eCommerceStore';
import { PRODUCTS } from '../data/mockData';
import ProductCard from '../components/Product/ProductCard';

export const WishlistPage = () => {
  const { wishlist, moveWishlistToCart } = useECommerceStore();
  const wishlistProducts = PRODUCTS.filter((p) => wishlist.includes(p.id));

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
      <div className="jm-container">
        {/* BREADCRUMB */}
        <div style={{ fontSize: '0.8rem', color: '#71717A', marginBottom: '1.5rem' }}>
          <Link to="/" style={{ color: '#71717A' }}>Inicio</Link>
          <span style={{ margin: '0 0.4rem' }}>/</span>
          <strong style={{ color: '#09090B' }}>Mis Favoritos</strong>
        </div>

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
              onClick={moveWishlistToCart}
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
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WishlistPage;
