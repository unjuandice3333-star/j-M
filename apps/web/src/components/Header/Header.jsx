import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  ShoppingBag,
  Heart,
  User,
  Menu,
  X,
  ChevronRight,
  Truck,
  ShieldCheck,
  RotateCcw,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { useECommerceStore } from '../../store/eCommerceStore';
import { formatCOP } from '../../data/mockData';

export const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const store = useECommerceStore();
  const {
    products = [],
    items = [],
    wishlist = [],
    isCartOpen = false,
    setCartOpen,
    isSearchOpen = false,
    setSearchOpen,
    isMobileMenuOpen = false,
    setMobileMenuOpen,
    removeItem,
    updateQuantity,
    getTotals
  } = store;

  const [searchQuery, setSearchQuery] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const totals = typeof getTotals === 'function' ? getTotals() : { subtotal: 0, total: 0, shippingCost: 0, hasFreeShipping: false, amountForFreeShipping: 200000 };
  const cartCount = (items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);

  // Scroll listener for subtle header elevation
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const filteredSearchProducts = searchQuery.trim()
    ? products.filter(
        (p) =>
          p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.fit?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchOpen(false);
      navigate(`/ropa?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const isActivePath = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* 1. ANNOUNCEMENT BAR */}
      <div 
        role="region"
        aria-label="Anuncios y promociones"
        style={{
          backgroundColor: '#09090B',
          color: '#FFFFFF',
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          padding: '0.5rem 1rem',
          textAlign: 'center',
          borderBottom: '1px solid #1F1F23',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.85rem',
          textTransform: 'uppercase'
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <Truck size={13} style={{ color: '#D4AF37' }} />
          ENVÍOS GRATIS EN COLOMBIA POR COMPRAS &gt; $200.000 COP
        </span>
        <span style={{ color: '#3F3F46' }}>|</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#D4AF37' }}>
          <Sparkles size={13} />
          CAMBIOS FÁCILES &amp; DEVOLUCIONES GRATIS
        </span>
      </div>

      {/* 2. MAIN HEADER */}
      <header
        role="banner"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid #E4E4E7',
          boxShadow: isScrolled
            ? '0 4px 20px -2px rgba(0,0,0,0.08)'
            : '0 1px 3px rgba(0,0,0,0.02)',
          transition: 'box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <div
          className="jm-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '72px',
            position: 'relative'
          }}
        >
          {/* Mobile Menu Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem',
              borderRadius: '6px',
              transition: 'background-color 0.15s'
            }}
            aria-label="Abrir menú de navegación"
            className="mobile-only-btn header-icon-touch"
          >
            <Menu size={24} color="#09090B" />
          </button>

          {/* BRAND LOGO */}
          <Link
            to="/"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              textDecoration: 'none',
              userSelect: 'none'
            }}
            aria-label="J&M Fashion Store - Ir a Inicio"
          >
            <span
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '1.4rem',
                fontWeight: 900,
                letterSpacing: '0.16em',
                color: '#09090B',
                lineHeight: 1,
                marginBottom: '2px'
              }}
            >
              J&amp;M FASHION STORE
            </span>
            <span
              style={{
                fontSize: '0.58rem',
                fontWeight: 700,
                letterSpacing: '0.32em',
                color: '#71717A',
                textTransform: 'uppercase'
              }}
            >
              MODA MASCULINA • COLOMBIA
            </span>
          </Link>

          {/* DESKTOP NAVIGATION MENU */}
          <nav
            aria-label="Navegación principal"
            style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}
            className="desktop-nav"
          >
            <Link
              to="/linea/urbana"
              style={getNavLinkStyle(isActivePath('/linea/urbana'), 'style')}
            >
              URBANO
            </Link>
            <Link
              to="/linea/elegante"
              style={getNavLinkStyle(isActivePath('/linea/elegante'), 'style')}
            >
              ELEGANTE
            </Link>
            <Link
              to="/linea/casual"
              style={getNavLinkStyle(isActivePath('/linea/casual'), 'style')}
            >
              SMART CASUAL
            </Link>
            <span style={{ color: '#E4E4E7', fontWeight: 300, margin: '0 0.15rem' }}>|</span>
            <Link
              to="/ropa"
              style={getNavLinkStyle(isActivePath('/ropa'), 'category')}
            >
              ROPA
            </Link>
            <Link
              to="/calzado"
              style={getNavLinkStyle(isActivePath('/calzado'), 'category')}
            >
              CALZADO
            </Link>
            <Link
              to="/accesorios"
              style={getNavLinkStyle(isActivePath('/accesorios'), 'category')}
            >
              ACCESORIOS
            </Link>
            <Link
              to="/ofertas"
              style={getNavLinkStyle(isActivePath('/ofertas'), 'sale')}
            >
              OFERTAS
            </Link>
          </nav>

          {/* ICONS ACTION BAR */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Search Trigger */}
            <button
              onClick={() => setSearchOpen(true)}
              style={iconBtnStyle}
              title="Buscar productos"
              aria-label="Buscar en la tienda"
              className="header-action-btn"
            >
              <Search size={20} strokeWidth={2.2} />
            </button>

            {/* Account Link */}
            <Link
              to="/cuenta"
              style={iconBtnStyle}
              title="Mi cuenta"
              aria-label="Ir a mi cuenta"
              className="header-action-btn"
            >
              <User size={20} strokeWidth={2.2} />
            </Link>

            {/* Wishlist Link */}
            <Link
              to="/cuenta/favoritos"
              style={{ ...iconBtnStyle, position: 'relative' }}
              title="Lista de Deseos"
              aria-label={`Ver lista de deseos, ${wishlist.length} artículos`}
              className="header-action-btn"
            >
              <Heart size={20} strokeWidth={2.2} />
              {wishlist.length > 0 && (
                <span style={badgeStyle} aria-hidden="true">
                  {wishlist.length}
                </span>
              )}
            </Link>

            {/* Cart Drawer Trigger */}
            <button
              onClick={() => setCartOpen(true)}
              style={{ ...iconBtnStyle, position: 'relative' }}
              title="Carrito de compras"
              aria-label={`Abrir carrito, ${cartCount} productos`}
              className="header-action-btn"
            >
              <ShoppingBag size={20} strokeWidth={2.2} />
              {cartCount > 0 && (
                <span style={badgeStyle} aria-hidden="true">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 3. MOBILE NAVIGATION DRAWER */}
      {isMobileMenuOpen && (
        <div className="modal-overlay" style={{ justifyContent: 'flex-start', padding: 0 }} onClick={() => setMobileMenuOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '85%',
              maxWidth: '360px',
              height: '100%',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              padding: '1.5rem',
              overflowY: 'auto'
            }}
            className="animate-slide-left"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <span style={{ fontWeight: 800, letterSpacing: '0.12em', fontSize: '1.1rem' }}>MENÚ</span>
              <button onClick={() => setMobileMenuOpen(false)} style={{ padding: '0.5rem' }}>
                <X size={24} />
              </button>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <MobileNavLink to="/nuevo" onClick={() => setMobileMenuOpen(false)}>NUEVO</MobileNavLink>
              <MobileNavLink to="/ropa" onClick={() => setMobileMenuOpen(false)}>ROPA</MobileNavLink>
              <MobileNavLink to="/ropa/camisetas" onClick={() => setMobileMenuOpen(false)}>└ Camisetas</MobileNavLink>
              <MobileNavLink to="/ropa/camisas" onClick={() => setMobileMenuOpen(false)}>└ Camisas</MobileNavLink>
              <MobileNavLink to="/ropa/polos" onClick={() => setMobileMenuOpen(false)}>└ Polos</MobileNavLink>
              <MobileNavLink to="/ropa/jeans" onClick={() => setMobileMenuOpen(false)}>└ Jeans</MobileNavLink>
              <MobileNavLink to="/ropa/pantalones" onClick={() => setMobileMenuOpen(false)}>└ Pantalones</MobileNavLink>
              <MobileNavLink to="/ropa/chaquetas" onClick={() => setMobileMenuOpen(false)}>└ Chaquetas</MobileNavLink>
              <MobileNavLink to="/calzado" onClick={() => setMobileMenuOpen(false)}>CALZADO</MobileNavLink>
              <MobileNavLink to="/accesorios" onClick={() => setMobileMenuOpen(false)}>ACCESORIOS</MobileNavLink>
              <MobileNavLink to="/colecciones" onClick={() => setMobileMenuOpen(false)}>COLECCIONES</MobileNavLink>
              <MobileNavLink to="/mas-vendidos" onClick={() => setMobileMenuOpen(false)}>MÁS VENDIDOS</MobileNavLink>
              <MobileNavLink to="/ofertas" onClick={() => setMobileMenuOpen(false)} style={{ color: '#E11D48', fontWeight: 700 }}>OFERTAS</MobileNavLink>
            </nav>

            <div style={{ marginTop: 'auto', paddingTop: '2rem', borderTop: '1px solid #E4E4E7' }}>
              <Link to="/guia-de-tallas" onClick={() => setMobileMenuOpen(false)} style={{ display: 'block', padding: '0.5rem 0', fontSize: '0.9rem', color: '#71717A' }}>
                Guía de Tallas
              </Link>
              <Link to="/admin" onClick={() => setMobileMenuOpen(false)} style={{ display: 'block', padding: '0.5rem 0', fontSize: '0.9rem', color: '#09090B', fontWeight: 700 }}>
                ⚙ Panel de Administración
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 4. SEARCH MODAL / DRAWER */}
      {isSearchOpen && (
        <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '5vh' }} onClick={() => setSearchOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '680px',
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '1.5rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Buscar en J&M Fashion Store</span>
              <button onClick={() => setSearchOpen(false)} style={{ padding: '0.25rem' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <input
                type="text"
                placeholder="Ej. Camiseta Oversize, Camisa Oxford, Jean..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                style={{
                  flex: 1,
                  padding: '0.85rem 1.1rem',
                  border: '1px solid #D4D4D8',
                  borderRadius: '6px',
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                style={{
                  backgroundColor: '#09090B',
                  color: '#FFFFFF',
                  padding: '0 1.5rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.9rem'
                }}
              >
                Buscar
              </button>
            </form>

            {/* Quick Search Results */}
            {searchQuery.trim() && (
              <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <div style={{ fontSize: '0.78rem', color: '#71717A', fontWeight: 600, marginBottom: '0.75rem' }}>
                  RESULTADOS ENCONTRADOS ({filteredSearchProducts.length})
                </div>
                {filteredSearchProducts.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#71717A' }}>
                    No encontramos productos para "{searchQuery}". Intenta con camisetas, jeans, o camisas.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {filteredSearchProducts.map((product) => (
                      <Link
                        key={product.id}
                        to={`/producto/${product.slug}`}
                        onClick={() => setSearchOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '0.6rem',
                          borderRadius: '6px',
                          border: '1px solid #F4F4F5',
                          transition: 'background 0.15s'
                        }}
                      >
                        <img
                          src={product.images?.[0]}
                          alt={product.name}
                          style={{ width: '50px', height: '60px', objectFit: 'cover', borderRadius: '4px' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#09090B' }}>{product.name}</div>
                          <div style={{ fontSize: '0.78rem', color: '#71717A' }}>FIT: {product.fit} • {product.category?.toUpperCase()}</div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#09090B' }}>
                          {formatCOP(product.price)}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. CART DRAWER */}
      {isCartOpen && (
        <div className="modal-overlay" style={{ justifyContent: 'flex-end', padding: 0 }} onClick={() => setCartOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '440px',
              height: '100%',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.15)'
            }}
            className="animate-slide-right"
          >
            {/* Cart Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #E4E4E7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ShoppingBag size={20} />
                <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.05em' }}>TU CARRITO</span>
                <span style={{ fontSize: '0.8rem', color: '#71717A' }}>({cartCount})</span>
              </div>
              <button onClick={() => setCartOpen(false)} style={{ padding: '0.35rem' }}>
                <X size={20} />
              </button>
            </div>

            {/* Free Shipping Progress Indicator */}
            <div style={{ padding: '1rem 1.5rem', backgroundColor: '#FAFAFA', borderBottom: '1px solid #E4E4E7' }}>
              {totals.hasFreeShipping ? (
                <div style={{ color: '#10B981', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Truck size={16} /> ¡Felicidades! Tienes envío GRATIS en este pedido.
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '0.82rem', color: '#18181B', fontWeight: 500, marginBottom: '0.4rem' }}>
                    Te faltan <strong>{formatCOP(totals.amountForFreeShipping)}</strong> para obtener <strong>ENVÍO GRATIS</strong>
                  </div>
                  <div style={{ width: '100%', height: '6px', backgroundColor: '#E4E4E7', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, (totals.subtotal / totals.freeShippingThreshold) * 100)}%`,
                      height: '100%',
                      backgroundColor: '#09090B',
                      transition: 'width 0.3s'
                    }}></div>
                  </div>
                </div>
              )}
            </div>

            {/* Cart Items List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
              {items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#71717A' }}>
                  <ShoppingBag size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                  <p style={{ fontWeight: 600, fontSize: '1.05rem', color: '#09090B', marginBottom: '0.5rem' }}>Tu carrito está vacío</p>
                  <p style={{ fontSize: '0.88rem', marginBottom: '1.5rem' }}>Descubre nuestras colecciones masculinas y viste con estilo.</p>
                  <button
                    onClick={() => { setCartOpen(false); navigate('/ropa'); }}
                    style={{
                      backgroundColor: '#09090B',
                      color: '#FFFFFF',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '0.88rem'
                    }}
                  >
                    EXPLORAR ROPA
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        gap: '1rem',
                        paddingBottom: '1.25rem',
                        borderBottom: '1px solid #F4F4F5'
                      }}
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        style={{ width: '75px', height: '95px', objectFit: 'cover', borderRadius: '6px' }}
                      />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#09090B', lineHeight: 1.3 }}>{item.name}</span>
                            <button
                              onClick={() => removeItem(item.id)}
                              style={{ color: '#A1A1AA' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#71717A', marginTop: '0.25rem' }}>
                            Talla: <strong>{item.size}</strong> • Color: <strong>{item.color}</strong>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E4E4E7', borderRadius: '4px' }}>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              style={{ padding: '0.25rem 0.5rem', color: '#09090B' }}
                            >
                              <Minus size={13} />
                            </button>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 0.5rem' }}>{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              style={{ padding: '0.25rem 0.5rem', color: '#09090B' }}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#09090B' }}>
                            {formatCOP(item.price * item.quantity)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Footer / Checkout Trigger */}
            {items.length > 0 && (
              <div style={{ padding: '1.5rem', borderTop: '1px solid #E4E4E7', backgroundColor: '#FFFFFF' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#71717A' }}>
                  <span>Subtotal</span>
                  <span>{formatCOP(totals.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '0.9rem', color: '#71717A' }}>
                  <span>Envío a Colombia</span>
                  <span>{totals.shippingCost === 0 ? <strong style={{ color: '#10B981' }}>GRATIS</strong> : formatCOP(totals.shippingCost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem', fontSize: '1.15rem', fontWeight: 800, color: '#09090B' }}>
                  <span>TOTAL ESTIMADO</span>
                  <span>{formatCOP(totals.total)}</span>
                </div>

                <button
                  onClick={() => { setCartOpen(false); navigate('/checkout'); }}
                  style={{
                    width: '100%',
                    backgroundColor: '#09090B',
                    color: '#FFFFFF',
                    padding: '1rem',
                    borderRadius: '6px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    fontSize: '0.92rem',
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  FINALIZAR COMPRA <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Embedded Responsive Styles */}
      <style>{`
        @media (max-width: 900px) {
          .desktop-nav { display: none !important; }
        }
        @media (min-width: 901px) {
          .mobile-only-btn { display: none !important; }
        }
      `}</style>
    </>
  );
};

const getNavLinkStyle = (isActive, type = 'category') => {
  let color = isActive ? '#09090B' : '#27272A';
  let fontWeight = isActive ? 700 : 500;
  
  if (type === 'style') {
    color = isActive ? '#09090B' : '#52525B';
    fontWeight = isActive ? 700 : 500;
  } else if (type === 'sale') {
    color = isActive ? '#BE123C' : '#E11D48';
    fontWeight = 700;
  }

  return {
    fontSize: '0.80rem',
    fontWeight,
    letterSpacing: '0.08em',
    color,
    textTransform: 'uppercase',
    textDecoration: 'none',
    padding: '0.4rem 0',
    borderBottom: isActive ? '2px solid #09090B' : '2px solid transparent',
    transition: 'all 0.15s ease'
  };
};

const navLinkStyle = {
  fontSize: '0.82rem',
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: '#27272A',
  textTransform: 'uppercase',
  transition: 'color 0.15s'
};

const iconBtnStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#09090B',
  padding: '0.35rem',
  borderRadius: '50%'
};

const badgeStyle = {
  position: 'absolute',
  top: '-4px',
  right: '-6px',
  backgroundColor: '#09090B',
  color: '#FFFFFF',
  fontSize: '0.65rem',
  fontWeight: 800,
  width: '17px',
  height: '17px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const MobileNavLink = ({ to, onClick, children, style }) => (
  <Link
    to={to}
    onClick={onClick}
    style={{
      fontSize: '1rem',
      fontWeight: 600,
      letterSpacing: '0.05em',
      color: '#09090B',
      textTransform: 'uppercase',
      padding: '0.4rem 0',
      borderBottom: '1px solid #F4F4F5',
      ...style
    }}
  >
    {children}
  </Link>
);

export default Header;
