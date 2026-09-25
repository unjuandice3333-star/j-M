import React from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useSyncStore } from '../store/syncStore.js';
import { ToastContainer } from '../components/Toast/ToastContainer.jsx';
import { Badge } from '@jm/ui';
import {
  LayoutDashboard,
  ShoppingBag,
  Store,
  Users,
  LogOut,
  Wifi,
  WifiOff,
  ClipboardList
} from 'lucide-react';
import styles from './DashboardLayout.module.css';

export const DashboardLayout = () => {
  const { user, logout } = useAuthStore();
  const { isOffline } = useSyncStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Panel de Control', path: '/dashboard', icon: <LayoutDashboard size={20} />, roles: ['super_admin', 'admin', 'supervisor'] },
    { label: 'Punto de Venta (POS)', path: '/pos', icon: <Store size={20} />, roles: ['super_admin', 'admin', 'supervisor', 'cashier'] },
    { label: 'Inventario', path: '/inventory', icon: <ShoppingBag size={20} />, roles: ['super_admin', 'admin', 'warehouse', 'supervisor'] },
    { label: 'Clientes', path: '/customers', icon: <Users size={20} />, roles: ['super_admin', 'admin', 'supervisor', 'cashier'] },
  ];

  const allowedNavItems = navItems.filter(item => item.roles.includes(user?.role));

  return (
    <div className={styles.layout}>
      <ToastContainer />
      {/* Sidebar navigation */}
      <aside className={styles.sidebar}>
        <div className={styles.logoArea}>
          <span className={styles.logoText}>J&M</span>
          <span className={styles.logoSubtext}>FASHION RETAIL</span>
        </div>

        <nav className={styles.navigation}>
          {allowedNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={[styles.navItem, isActive ? styles.activeNavItem : ''].join(' ')}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.footerArea}>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            <LogOut size={18} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className={styles.mainWrapper}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            {isOffline ? (
              <div className={[styles.statusIndicator, styles.offlineIndicator].join(' ')}>
                <WifiOff size={16} />
                <span>Modo Sin Conexión (Offline POS Activo)</span>
              </div>
            ) : (
              <div className={[styles.statusIndicator, styles.onlineIndicator].join(' ')}>
                <Wifi size={16} />
                <span>Conectado al Servidor</span>
              </div>
            )}
          </div>

          <div className={styles.headerRight}>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user?.first_name} {user?.last_name}</span>
              <Badge variant={user?.role === 'super_admin' ? 'destructive' : 'primary'}>
                {user?.role.toUpperCase()}
              </Badge>
            </div>
          </div>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
