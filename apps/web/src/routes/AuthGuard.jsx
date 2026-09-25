import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';

export const AuthGuard = ({ children, allowedRoles }) => {
  const { isLoggedIn, user } = useAuthStore();
  const location = useLocation();

  if (!isLoggedIn) {
    // Redirigir a login guardando la ruta previa
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Si tiene sesión pero no el rol requerido, redirigir a no autorizado o dashboard
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default AuthGuard;
