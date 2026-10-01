import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import supabase from '../config/supabase';

export const AccountPage = () => {
  const { isLoggedIn, user, profile, login, signUp, logout, isLoading, error } = useAuthStore();

  const [inputEmail, setInputEmail] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  const [inputName, setInputName] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!inputEmail || !inputPassword) {
      setFormError('Por favor ingresa tu correo y contraseña.');
      return;
    }

    try {
      if (isRegisterMode) {
        if (!inputName) {
          setFormError('Por favor ingresa tu nombre completo.');
          return;
        }
        await signUp(inputEmail, inputPassword, inputName);
      } else {
        await login(inputEmail, inputPassword);
      }
    } catch (err) {
      setFormError(err.message || 'Error durante la autenticación.');
    }
  };

  const handleGoogleAuth = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/cuenta`
        }
      });
      if (error) throw error;
    } catch (err) {
      setFormError(err.message || 'Google OAuth requiere configuración en el panel de Supabase.');
    }
  };

  if (isLoggedIn && user) {
    return (
      <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
        <div className="jm-container" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{
            border: '1px solid #E4E4E7',
            borderRadius: '24px',
            padding: '2.5rem 2rem',
            backgroundColor: '#FFFFFF',
            boxShadow: '0 12px 36px rgba(0,0,0,0.06)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #F4F4F5', paddingBottom: '1.5rem' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                fontWeight: 800
              }}>
                {(profile?.full_name || user.email)?.[0]?.toUpperCase()}
              </div>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#09090B' }}>
                  {profile?.full_name || 'Cliente J&M'}
                </h2>
                <p style={{ fontSize: '0.88rem', color: '#71717A' }}>{user.email}</p>
                <span style={{
                  display: 'inline-block',
                  marginTop: '0.35rem',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  backgroundColor: (profile?.role === 'admin' || profile?.role === 'super_admin') ? '#D4AF37' : '#E4E4E7',
                  color: (profile?.role === 'admin' || profile?.role === 'super_admin') ? '#FFFFFF' : '#09090B'
                }}>
                  Rol: {profile?.role || 'customer'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ padding: '1rem', backgroundColor: '#FAFAFA', borderRadius: '12px', border: '1px solid #E4E4E7' }}>
                <span style={{ fontSize: '0.8rem', color: '#71717A', display: 'block' }}>ID de Usuario</span>
                <strong style={{ fontSize: '0.85rem', color: '#09090B', wordBreak: 'break-all' }}>{user.id}</strong>
              </div>
            </div>

            <button
              onClick={logout}
              style={{
                width: '100%',
                backgroundColor: '#E11D48',
                color: '#FFFFFF',
                padding: '0.88rem',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.88rem',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
      <div className="jm-container">
        <div style={{
          maxWidth: '440px',
          margin: '2rem auto',
          border: '1px solid #E4E4E7',
          borderRadius: '24px',
          padding: '2.5rem 2rem',
          backgroundColor: '#FFFFFF',
          boxShadow: '0 12px 36px rgba(0,0,0,0.06)'
        }}>
          <div style={{ textAlign: 'left', marginBottom: '1.75rem' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#09090B', letterSpacing: '-0.02em' }}>
              {isRegisterMode ? 'Crear cuenta' : 'Iniciar sesión'}
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#71717A', marginTop: '0.25rem' }}>
              Continuar con <strong>J&M Fashion Store</strong>
            </p>
          </div>

          {(formError || error) && (
            <div style={{
              backgroundColor: '#FEF2F2',
              color: '#991B1B',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              border: '1px solid #FCA5A5'
            }}>
              {formError || error}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {isRegisterMode && (
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.4rem' }}>
                  Nombre completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  style={{ width: '100%', padding: '0.85rem 1rem', border: '1.5px solid #2563EB', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.4rem' }}>
                Correo electrónico
              </label>
              <input
                type="email"
                required
                placeholder="ejemplo@correo.com"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                style={{ width: '100%', padding: '0.85rem 1rem', border: '1.5px solid #2563EB', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.4rem' }}>
                Contraseña
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                style={{ width: '100%', padding: '0.85rem 1rem', border: '1px solid #D4D4D8', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                padding: '0.88rem',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.88rem',
                border: 'none',
                cursor: 'pointer',
                marginTop: '0.25rem',
                opacity: isLoading ? 0.7 : 1
              }}
            >
              {isLoading ? 'Cargando...' : isRegisterMode ? 'Crear cuenta con Supabase' : 'Iniciar sesión'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.5rem 0' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#E4E4E7' }} />
            <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 500 }}>o</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#E4E4E7' }} />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <button
              type="button"
              onClick={handleGoogleAuth}
              style={{
                width: '100%',
                height: '48px',
                border: '1px solid #E4E4E7',
                borderRadius: '8px',
                backgroundColor: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.92rem',
                color: '#09090B'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              Continuar con Google Auth
            </button>
          </div>

          <div style={{ textAlign: 'left', fontSize: '0.85rem', color: '#71717A' }}>
            {isRegisterMode ? '¿Ya tienes una cuenta? ' : '¿Eres nuevo en J&M? '}
            <button
              type="button"
              onClick={() => { setIsRegisterMode(!isRegisterMode); setFormError(null); }}
              style={{ border: 'none', background: 'none', fontWeight: 700, color: '#2563EB', cursor: 'pointer' }}
            >
              {isRegisterMode ? 'Inicia sesión →' : 'Empieza →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountPage;
