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
    // Redirigir a login guardando la ruta previa
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const userRole = profile?.role || 'customer';

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // Si la sesión existe pero el rol no está autorizado para esta sección
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default AuthGuard;
