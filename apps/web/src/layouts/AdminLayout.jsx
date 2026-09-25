import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  Boxes,
  ClipboardList,
  Users,
  FolderKanban,
  Tag,
  Star,
  BarChart3,
  Settings,
  ArrowLeft,
  Bell,
  Search,
  UserCheck,
  ChevronDown
} from 'lucide-react';

export const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Productos', path: '/admin/productos', icon: ShoppingBag },
    { label: 'Inventario', path: '/admin/inventario', icon: Boxes },
    { label: 'Pedidos', path: '/admin/pedidos', icon: ClipboardList, badge: '3' },
    { label: 'Clientes', path: '/admin/clientes', icon: Users },
    { label: 'Colecciones', path: '/admin/colecciones', icon: FolderKanban },
    { label: 'Descuentos', path: '/admin/descuentos', icon: Tag },
    { label: 'Reviews', path: '/admin/reviews', icon: Star },
    { label: 'Analytics', path: '/admin/analytics', icon: BarChart3 },
    { label: 'Configuración', path: '/admin/configuracion', icon: Settings }
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F4F4F5', fontFamily: 'var(--font-sans)' }}>
      {/* SIDEBAR */}
      <aside style={{
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
                  <span style={{ backgroundColor: '#E11D48', color: '#FFFFFF', fontSize: '0.68rem', fontWeight: 800, padding: '2px 7px', borderRadius: '999px' }}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* BACK TO SHOP LINK */}
        <div style={{ padding: '1rem', borderTop: '1px solid #1F1F23' }}>
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
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, marginLeft: '260px', display: 'flex', flexDirection: 'column' }}>
        {/* TOP NAVBAR */}
        <header style={{
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#FAFAFA', padding: '0.5rem 0.9rem', borderRadius: '6px', border: '1px solid #E4E4E7', width: '320px' }}>
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
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', backgroundColor: '#E11D48', width: '8px', height: '8px', borderRadius: '50%' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderLeft: '1px solid #E4E4E7', paddingLeft: '1.5rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#09090B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem' }}>
                AD
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#09090B' }}>Admin J&M</span>
                <span style={{ fontSize: '0.72rem', color: '#71717A' }}>Super Administrador</span>
              </div>
            </div>
          </div>
        </header>

        {/* PAGE BODY */}
        <main style={{ flex: 1, padding: '2rem' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
