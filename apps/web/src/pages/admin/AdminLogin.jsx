import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore.js';
import { Lock, ShieldCheck, Mail, ArrowRight, AlertCircle } from 'lucide-react';

export const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const { login, isLoading, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const fromPath = location.state?.from?.pathname || '/admin/dashboard';

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('Por favor ingresa tu correo y contraseña administrativa.');
      return;
    }

    try {
      // 1. Iniciar sesión mediante Supabase Auth (signInWithPassword)
      await login(email, password);

      // 2. Obtener el estado actualizado post-login
      const currentSession = useAuthStore.getState();
      const userEmail = currentSession.user?.email?.toLowerCase();
      const userRole = currentSession.profile?.role;

      // 3. Verificación estricta del correo autorizado y rol administrativo
      if (userEmail === 'unjuandice3333@gmail.com' && (userRole === 'admin' || userRole === 'super_admin')) {
        navigate(fromPath, { replace: true });
      } else {
        // Si el usuario se autenticó pero no tiene permisos ni correo autorizado
        await logout();
        navigate('/unauthorized', { replace: true });
      }
    } catch (err) {
      console.error('[AdminLogin Exception]:', err);
      // Mensaje genérico de seguridad para no revelar detalles específicos de existencia de cuentas
      setErrorMessage('Credenciales inválidas o acceso denegado. Verifica tu correo y contraseña.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#09090B',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: 'var(--font-sans)',
      color: '#FFFFFF'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '440px',
        backgroundColor: '#121215',
        borderRadius: '16px',
        border: '1px solid #27272A',
        padding: '2.5rem 2rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
      }}>
        {/* BRAND HEADER */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            backgroundColor: '#18181B',
            border: '1px solid #3F3F46',
            color: '#D4AF37',
            marginBottom: '1rem'
          }}>
            <ShieldCheck size={28} />
          </div>
          <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#D4AF37', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
            SOFTWARE ERP / POS RETAIL
          </span>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.3rem 0 0.2rem 0' }}>
            J&M ADMIN PANEL
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#A1A1AA' }}>
            Acceso exclusivo para la dirección autorizada
          </p>
        </div>

        {errorMessage && (
          <div style={{
            backgroundColor: 'rgba(225, 29, 72, 0.1)',
            border: '1px solid #E11D48',
            color: '#FB7185',
            padding: '0.85rem 1rem',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* LOGIN FORM */}
        <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#D4D4D8', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
              Correo Administrativo
            </label>
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#18181B', border: '1px solid #3F3F46', borderRadius: '8px', padding: '0 0.8rem' }}>
              <Mail size={18} color="#71717A" />
              <input
                type="email"
                required
                placeholder="unjuandice3333@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.85rem 0.6rem',
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#FFFFFF',
                  fontSize: '0.9rem'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#D4D4D8', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
              Contraseña
            </label>
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#18181B', border: '1px solid #3F3F46', borderRadius: '8px', padding: '0 0.8rem' }}>
              <Lock size={18} color="#71717A" />
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.85rem 0.6rem',
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#FFFFFF',
                  fontSize: '0.9rem'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              backgroundColor: '#FFFFFF',
              color: '#09090B',
              padding: '0.95rem',
              borderRadius: '8px',
              fontWeight: 900,
              fontSize: '0.88rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginTop: '0.5rem',
              opacity: isLoading ? 0.7 : 1,
              transition: 'all 0.2s'
            }}
          >
            {isLoading ? 'AUTENTICANDO...' : 'INICIAR SESIÓN ADM'} <ArrowRight size={18} />
          </button>
        </form>

        <div style={{ marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid #27272A', textAlign: 'center', fontSize: '0.75rem', color: '#71717A', lineHeight: 1.5 }}>
          Protección de acceso cifrada por Supabase Auth & PostgreSQL RLS.
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
