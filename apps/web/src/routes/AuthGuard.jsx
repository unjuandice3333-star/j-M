import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';

export const AuthGuard = ({ children, allowedRoles }) => {
  const { isLoggedIn, isLoading, profile } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#09090B',
        color: '#FFFFFF',
        fontFamily: 'sans-serif'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid rgba(255,255,255,0.2)',
          borderTopColor: '#D4AF37',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isLoggedIn) {
    // Si la ruta solicitada es administrativa, redirigir a /admin/login
    const targetLogin = location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
    return <Navigate to={targetLogin} state={{ from: location }} replace />;
  }

  const userRole = profile?.role;

  if (allowedRoles && (!userRole || !allowedRoles.includes(userRole))) {
    // Si la sesión existe pero no tiene el rol autorizado para la sección administrativa
    if (location.pathname.startsWith('/admin')) {
      return (
        <Navigate
          to="/admin/login"
          state={{ error: 'Tu cuenta no tiene permisos administrativos.' }}
          replace
        />
      );
    }
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default AuthGuard;
