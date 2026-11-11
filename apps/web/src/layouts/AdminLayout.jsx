import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { countPendingReviews, REVIEWS_CHANGED_EVENT } from '../services/reviewsAdminService.js';
import { countOrdersToPrepare, ORDERS_CHANGED_EVENT, ORDERS_POLL_MS } from '../services/adminService.js';
import {
  LayoutDashboard,
  ShoppingBag,
  Boxes,
  ClipboardList,
  Users,
  Mail,
  FolderKanban,
  Tag,
  Star,
  BarChart3,
  Settings,
  Image,
  ArrowLeft,
  Bell,
  Search,
  LogOut
} from 'lucide-react';

const badgeText = (n) => (n > 0 ? (n > 99 ? '99+' : String(n)) : null);

export const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  // Ejecución 73: reseñas pendientes de moderar en el menú (al navegar y cuando /admin/reviews modera).
  const [pendingReviews, setPendingReviews] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => countPendingReviews().then((n) => { if (alive) setPendingReviews(n); }, () => { /* sin contador si falla */ });
    refresh();
    window.addEventListener(REVIEWS_CHANGED_EVENT, refresh);
    return () => { alive = false; window.removeEventListener(REVIEWS_CHANGED_EVENT, refresh); };
  }, [location.pathname]);
  // Ejecución 75: pedidos pagados por preparar. Los pagos llegan por el webhook de Wompi en cualquier momento, así que
  // además de recontar al navegar y al cambiar un estado se reconsulta cada minuto (solo cabecera HEAD, sin filas).
  const [ordersToPrepare, setOrdersToPrepare] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => countOrdersToPrepare().then((n) => { if (alive) setOrdersToPrepare(n); }, () => { if (alive) setOrdersToPrepare(0); });
    refresh();
    const timer = setInterval(refresh, ORDERS_POLL_MS);
    window.addEventListener(ORDERS_CHANGED_EVENT, refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener(ORDERS_CHANGED_EVENT, refresh); };
  }, [location.pathname]);
  const { user, profile, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const navItems = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Productos', path: '/admin/productos', icon: ShoppingBag },
    { label: 'Imágenes Home', path: '/admin/imagenes', icon: Image },
    { label: 'Inventario', path: '/admin/inventario', icon: Boxes },
    { label: 'Pedidos', path: '/admin/pedidos', icon: ClipboardList, badge: badgeText(ordersToPrepare), badgeLabel: `${ordersToPrepare} pedido${ordersToPrepare === 1 ? '' : 's'} por preparar` },
    { label: 'Clientes', path: '/admin/clientes', icon: Users },
    { label: 'Boletín', path: '/admin/boletin', icon: Mail },
    { label: 'Colecciones', path: '/admin/colecciones', icon: FolderKanban },
    { label: 'Descuentos', path: '/admin/descuentos', icon: Tag },
    { label: 'Reviews', path: '/admin/reviews', icon: Star, badge: badgeText(pendingReviews), badgeLabel: `${pendingReviews} reseña${pendingReviews === 1 ? '' : 's'} pendiente${pendingReviews === 1 ? '' : 's'}` },
    { label: 'Analytics', path: '/admin/analytics', icon: BarChart3 },
    { label: 'Configuración', path: '/admin/configuracion', icon: Settings }
  ];

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Administrador';
  const displayRole = profile?.role === 'super_admin' ? 'Super Administrador' : 'Administrador';
  const avatarInitials = displayName.substring(0, 2).toUpperCase();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F4F4F5', fontFamily: 'var(--font-sans)' }}>
      {/* M27: en pantallas pequeñas el menú lateral se oculta y se abre con el botón ☰ (antes ocupaba 2/3 del móvil) */}
      <style>{`
        @media (max-width: 900px) {
          .jm-admin-sidebar { transform: translateX(-100%); transition: transform 0.2s; }
          .jm-admin-sidebar.open { transform: translateX(0); }
          .jm-admin-menu-btn { display: inline-flex !important; }
          .jm-admin-search { display: none !important; }
          .jm-admin-content { margin-left: 0 !important; min-width: 0; }
          .jm-admin-main { padding: 1rem !important; }
          .jm-admin-header { padding: 0 1rem !important; }
        }
      `}</style>
      {menuOpen && <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 95 }} />}
      {/* SIDEBAR */}
      <aside className={`jm-admin-sidebar${menuOpen ? ' open' : ''}`} style={{
        width: '260px',
        backgroundColor: '#09090B',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        zIndex: 100,
        borderRight: '1px solid #1F1F23'
      }}>
        {/* BRAND HEADER */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #1F1F23', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.12em' }}>
            J&M ADMIN
          </span>
          <span style={{ fontSize: '0.62rem', color: '#D4AF37', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            SOFTWARE ERP / POS RETAIL
          </span>
        </div>

        {/* NAVIGATION LINKS */}
        <nav style={{ flex: 1, padding: '1.25rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', overflowY: 'auto' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.8rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  fontWeight: isActive ? 800 : 600,
                  fontSize: '0.88rem',
                  color: isActive ? '#FFFFFF' : '#A1A1AA',
                  backgroundColor: isActive ? '#27272A' : 'transparent',
                  textDecoration: 'none',
                  transition: 'background 0.15s, color 0.15s'
                }}
              >
                <Icon size={18} color={isActive ? '#D4AF37' : '#A1A1AA'} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && (
                  <span aria-label={item.badgeLabel} title={item.badgeLabel} style={{ backgroundColor: '#E11D48', color: '#FFFFFF', fontSize: '0.68rem', fontWeight: 800, padding: '2px 7px', borderRadius: '999px' }}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* BACK TO SHOP & LOGOUT */}
        <div style={{ padding: '1rem', borderTop: '1px solid #1F1F23', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: '#A1A1AA',
              fontSize: '0.82rem',
              fontWeight: 700,
              textDecoration: 'none',
              padding: '0.6rem 0.8rem',
              borderRadius: '6px',
              backgroundColor: '#18181B'
            }}
          >
            <ArrowLeft size={16} /> Volver a Tienda Pública
          </Link>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: '#F43F5E',
              fontSize: '0.82rem',
              fontWeight: 700,
              padding: '0.6rem 0.8rem',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            <LogOut size={16} /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="jm-admin-content" style={{ flex: 1, marginLeft: '260px', display: 'flex', flexDirection: 'column' }}>
        {/* TOP NAVBAR */}
        <header className="jm-admin-header" style={{
          height: '65px',
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E4E4E7',
          padding: '0 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 90
        }}>
          {/* Global Admin Search Input */}
          <button type="button" className="jm-admin-menu-btn" aria-label="Abrir menú" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}
            style={{ display: 'none', border: '1px solid #E4E4E7', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '1.1rem', fontWeight: 800 }}>☰</button>
          <div className="jm-admin-search" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#FAFAFA', padding: '0.5rem 0.9rem', borderRadius: '6px', border: '1px solid #E4E4E7', width: '320px' }}>
            <Search size={16} color="#71717A" />
            <input
              type="text"
              placeholder="Buscar SKU, pedido, cliente..."
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', width: '100%' }}
            />
          </div>

          {/* Admin User Profile Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ position: 'relative' }}>
              <Bell size={20} color="#71717A" style={{ cursor: 'pointer' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderLeft: '1px solid #E4E4E7', paddingLeft: '1.5rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#09090B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem' }}>
                {avatarInitials}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#09090B' }}>{displayName}</span>
                <span style={{ fontSize: '0.72rem', color: '#71717A' }}>{displayRole}</span>
              </div>
            </div>
          </div>
        </header>

        {/* PAGE BODY */}
        <main className="jm-admin-main" style={{ flex: 1, padding: '2rem', overflowX: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
