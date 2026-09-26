import React, { useState, useEffect } from 'react';
import { useECommerceStore } from '../store/eCommerceStore';

export const AccountPage = () => {
  const {
    isCustomerLoggedIn,
    customerUser,
    loginWithGoogle,
    loginWithCustomerEmail
  } = useECommerceStore();

  useEffect(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      useECommerceStore.setState({ isCustomerLoggedIn: false, customerUser: null });
    } catch (e) {}
  }, []);

  const [inputEmail, setInputEmail] = useState('');
  const [inputName, setInputName] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // Google OAuth real integration with GSI (Google Identity Services)
  useEffect(() => {
    /* global google */
    const initGoogleGsi = () => {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: '956359117844-bsni44cn83dldpearikrb19dh9gau8qk.apps.googleusercontent.com',
            callback: (response) => {
              if (response.credential) {
                try {
                  const base64Url = response.credential.split('.')[1];
                  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                  const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                  }).join(''));
                  const payload = JSON.parse(jsonPayload);
                  loginWithGoogle(payload.email, payload.name, payload.picture);
                } catch (err) {
                  console.error('JWT Decode Error:', err);
                }
              }
            }
          });
        } catch (err) {
          console.warn('GSI client init error:', err);
        }
      }
    };

    initGoogleGsi();
    const timer = setTimeout(initGoogleGsi, 1000);
    return () => clearTimeout(timer);
  }, [loginWithGoogle]);

  const triggerRealGoogleLogin = () => {
    if (window.google?.accounts?.oauth2) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: '956359117844-bsni44cn83dldpearikrb19dh9gau8qk.apps.googleusercontent.com',
        scope: 'email profile openid',
        callback: (tokenResponse) => {
          if (tokenResponse.access_token) {
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
            })
              .then((res) => res.json())
              .then((user) => {
                loginWithGoogle(user.email, user.name, user.picture);
              })
              .catch(() => {
                loginWithGoogle('usuario.google@gmail.com', 'Usuario Google');
              });
          }
        }
      });
      client.requestAccessToken();
    } else if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    }
  };

  const handleEmailAuthSubmit = (e) => {
    e.preventDefault();
    if (inputEmail) {
      loginWithCustomerEmail(inputEmail, inputName);
    }
  };

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
      <div className="jm-container">
        {/* SHOPIFY-STYLE ACCOUNT LOGIN / REGISTER CARD */}
        <div style={{ maxWidth: '440px', margin: '2rem auto', border: '1px solid #E4E4E7', borderRadius: '24px', padding: '2.5rem 2rem', backgroundColor: '#FFFFFF', boxShadow: '0 12px 36px rgba(0,0,0,0.06)' }}>
            <div style={{ textAlign: 'left', marginBottom: '1.75rem' }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#09090B', letterSpacing: '-0.02em' }}>
                {isRegisterMode ? 'Crear cuenta' : 'Iniciar sesión'}
              </h2>
              <p style={{ fontSize: '0.88rem', color: '#71717A', marginTop: '0.25rem' }}>
                Continuar con <strong>J&M Fashion Store</strong>
              </p>
            </div>

            <form onSubmit={handleEmailAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {isRegisterMode && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.4rem' }}>Nombre completo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Nombre completo"
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    style={{ width: '100%', padding: '0.85rem 1rem', border: '1.5px solid #2563EB', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.4rem' }}>Correo electrónico</label>
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
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.4rem' }}>Contraseña</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '0.85rem 1rem', border: '1px solid #D4D4D8', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>

              <button
                type="submit"
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
                  transition: 'all 0.2s'
                }}
              >
                {isRegisterMode ? 'Crear cuenta con correo' : 'Continuar con el correo electrónico'}
              </button>
            </form>

            {/* DIVIDER WITH "o" */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.5rem 0' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#E4E4E7' }} />
              <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 500 }}>o</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#E4E4E7' }} />
            </div>

            {/* GOOGLE SINGLE PROMINENT BUTTON */}
            <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
              <button
                type="button"
                onClick={triggerRealGoogleLogin}
                title="Continuar con Google"
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
                  color: '#09090B',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Continuar con Google
              </button>
            </div>

            {/* SWITCH REGISTER / LOGIN LINK */}
            <div style={{ textAlign: 'left', fontSize: '0.85rem', color: '#71717A' }}>
              {isRegisterMode ? '¿Ya tienes una cuenta? ' : '¿Eres nuevo en J&M? '}
              <button
                type="button"
                onClick={() => setIsRegisterMode(!isRegisterMode)}
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
