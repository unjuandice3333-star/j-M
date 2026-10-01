import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore.js';
import { Lock, ShieldCheck, Mail, ArrowRight, AlertCircle, LogOut } from 'lucide-react';

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.93 6.72-4.93z"
    />
  </svg>
);

export const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const { login, loginWithGoogle, logout, isLoading, isLoggedIn, user, profile } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const fromPath = location.state?.from?.pathname || '/admin/dashboard';

  // 1. Capturar mensajes de error enviados desde redirecciones (ej. AuthGuard)
  useEffect(() => {
    if (location.state?.error) {
      setErrorMessage(location.state.error);
    }
  }, [location.state]);

  // 2. Si el usuario ya está autenticado con rol admin o super_admin, redirigir al panel
  useEffect(() => {
    if (isLoggedIn && !isLoading) {
      const userRole = profile?.role;
      if (userRole === 'admin' || userRole === 'super_admin') {
        navigate(fromPath, { replace: true });
      } else if (user) {
        // Usuario autenticado pero sin rol administrativo
        setErrorMessage('Tu cuenta no tiene permisos administrativos.');
      }
    }
  }, [isLoggedIn, isLoading, profile, user, navigate, fromPath]);

  // 3. Inicio de sesión mediante Google OAuth
  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setIsGoogleLoading(true);

    try {
      // Redirige al flujo de Google OAuth y regresa directamente a /admin
      await loginWithGoogle(`${window.location.origin}/admin`);
    } catch (err) {
      console.error('[AdminLogin Google OAuth Exception]:', err);
      setErrorMessage(err.message || 'Error al conectar con el servicio de autenticación de Google.');
      setIsGoogleLoading(false);
    }
  };

  // 4. Inicio de sesión mediante Email / Contraseña (fallback de credenciales administrativas)
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('Por favor ingresa tu correo y contraseña administrativa.');
      return;
    }

    try {
      await login(email, password);

      // Verificación autoritativa del rol en PostgreSQL profiles (NUNCA por email hardcodeado)
      const currentSession = useAuthStore.getState();
      const userRole = currentSession.profile?.role;

      if (userRole === 'admin' || userRole === 'super_admin') {
        navigate(fromPath, { replace: true });
      } else {
        // Si no cuenta con rol administrativo en PostgreSQL profiles, denegar acceso inmediato
        await logout();
        setErrorMessage('Tu cuenta no tiene permisos administrativos.');
      }
    } catch (err) {
      console.error('[AdminLogin Password Exception]:', err);
      setErrorMessage('Credenciales inválidas o acceso denegado. Verifica tu correo y contraseña.');
    }
  };

  // 5. Cerrar sesión para liberar usuario no autorizado
  const handleClearSession = async () => {
    await logout();
    setErrorMessage(null);
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
            Acceso exclusivo para personal autorizado
          </p>
        </div>

        {/* ERROR / UNAUTHORIZED BANNER */}
        {errorMessage && (
          <div style={{
            backgroundColor: 'rgba(225, 29, 72, 0.1)',
            border: '1px solid #E11D48',
            color: '#FB7185',
            padding: '0.9rem 1rem',
            borderRadius: '8px',
            fontSize: '0.84rem',
            fontWeight: 600,
            marginBottom: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>

            {isLoggedIn && user && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '0.5rem',
                borderTop: '1px solid rgba(225, 29, 72, 0.2)',
                fontSize: '0.76rem',
                color: '#E4E4E7'
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '210px' }}>
                  Sesión: {user.email}
                </span>
                <button
                  type="button"
                  onClick={handleClearSession}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    background: 'none',
                    border: 'none',
                    color: '#D4AF37',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  <LogOut size={13} /> Cambiar cuenta
                </button>
              </div>
            )}
          </div>
        )}

        {/* GOOGLE OAUTH PRIMARY ACTION */}
        <div style={{ marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isGoogleLoading || isLoading}
            style={{
              width: '100%',
              backgroundColor: '#18181B',
              color: '#FFFFFF',
              border: '1px solid #3F3F46',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: (isGoogleLoading || isLoading) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              opacity: (isGoogleLoading || isLoading) ? 0.7 : 1
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#D4AF37';
              e.currentTarget.style.backgroundColor = '#222227';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#3F3F46';
              e.currentTarget.style.backgroundColor = '#18181B';
            }}
          >
            <GoogleIcon />
            <span>{isGoogleLoading ? 'CONECTANDO CON GOOGLE...' : 'Continuar con Google'}</span>
          </button>
        </div>

        {/* DIVIDER */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.8rem',
          margin: '1.5rem 0',
          color: '#52525B',
          fontSize: '0.7rem',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase'
        }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#27272A' }} />
          <span>O ACCEDER CON CREDENCIALES</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#27272A' }} />
        </div>

        {/* EMAIL & PASSWORD FALLBACK FORM */}
        <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#D4D4D8', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
              Correo Administrativo
            </label>
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#18181B', border: '1px solid #3F3F46', borderRadius: '8px', padding: '0 0.8rem' }}>
              <Mail size={18} color="#71717A" />
              <input
                type="email"
                required
                placeholder="admin@jmfashion.com"
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
            disabled={isLoading || isGoogleLoading}
            style={{
              width: '100%',
              backgroundColor: '#FFFFFF',
              color: '#09090B',
              padding: '0.9rem',
              borderRadius: '8px',
              fontWeight: 900,
              fontSize: '0.86rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              border: 'none',
              cursor: (isLoading || isGoogleLoading) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginTop: '0.3rem',
              opacity: (isLoading || isGoogleLoading) ? 0.7 : 1,
              transition: 'all 0.2s'
            }}
          >
            {isLoading ? 'AUTENTICANDO...' : 'INICIAR SESIÓN ADM'} <ArrowRight size={18} />
          </button>
        </form>

        <div style={{ marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid #27272A', textAlign: 'center', fontSize: '0.75rem', color: '#71717A', lineHeight: 1.5 }}>
          Autenticación federada mediante Google OAuth & Supabase Auth.
          <br />
          Autorización perimetral basada en roles PostgreSQL (<code style={{ color: '#D4AF37' }}>public.profiles</code>).
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
