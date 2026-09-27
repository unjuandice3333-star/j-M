import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Grid, Search, Heart, ShoppingBag } from 'lucide-react';
import { useECommerceStore } from '../../store/eCommerceStore';

export const MobileBottomBar = () => {
  const location = useLocation();
  const { items, wishlist, setSearchOpen, setCartOpen } = useECommerceStore();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // Ocultar en checkout y confirmación para evitar distracciones en el cierre de venta
  if (location.pathname.startsWith('/checkout')) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 90,
      backgroundColor: '#FFFFFF',
      borderTop: '1px solid #E4E4E7',
      boxShadow: '0 -4px 15px rgba(0,0,0,0.06)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      height: '62px',
      padding: '0 0.5rem'
    }} className="mobile-only-bottom-bar">
      <Link to="/" style={itemStyle(location.pathname === '/')}>
        <Home size={20} />
        <span>Inicio</span>
      </Link>

      <Link to="/ropa" style={itemStyle(location.pathname.startsWith('/ropa'))}>
        <Grid size={20} />
        <span>Catálogo</span>
      </Link>

      <button onClick={() => setSearchOpen(true)} style={itemStyle(false)}>
        <Search size={20} />
        <span>Buscar</span>
      </button>

      <Link to="/cuenta/favoritos" style={{ ...itemStyle(location.pathname.includes('favoritos')), position: 'relative' }}>
        <Heart size={20} />
        <span>Favoritos</span>
        {wishlist.length > 0 && (
          <span style={badgeStyle}>{wishlist.length}</span>
        )}
      </Link>

      <button onClick={() => setCartOpen(true)} style={{ ...itemStyle(false), position: 'relative' }}>
        <ShoppingBag size={20} />
        <span>Carrito</span>
        {cartCount > 0 && (
          <span style={badgeStyle}>{cartCount}</span>
        )}
      </button>

      <style>{`
        @media (min-width: 901px) {
          .mobile-only-bottom-bar { display: none !important; }
        }
      `}</style>
    </div>
  );
};

const itemStyle = (isActive) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '3px',
  fontSize: '0.68rem',
  fontWeight: isActive ? 800 : 600,
  color: isActive ? '#09090B' : '#71717A',
  textDecoration: 'none',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '4px'
});

const badgeStyle = {
  position: 'absolute',
  top: '-2px',
  right: '8px',
  backgroundColor: '#09090B',
  color: '#FFFFFF',
  fontSize: '0.6rem',
  fontWeight: 800,
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

export default MobileBottomBar;
