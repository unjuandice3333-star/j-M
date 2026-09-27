import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { Button, Input } from '@jm/ui';
import styles from './Login.module.css';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const { login, signUp, isLoading, error, profile } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const fromPath = location.state?.from?.pathname || '/admin/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    try {
      if (isRegistering) {
        await signUp(email, password, fullName);
        alert('Cuenta creada exitosamente. Si tu correo requiere verificación, por favor revisa tu bandeja de entrada.');
      } else {
        await login(email, password);
        const currentProfile = useAuthStore.getState().profile;
        if (currentProfile?.role === 'admin' || currentProfile?.role === 'super_admin') {
          navigate(fromPath);
        } else {
          navigate('/cuenta');
        }
      }
    } catch (err) {
      console.error('[Login Exception]:', err);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <div className={styles.header}>
          <span className={styles.logo}>J&M</span>
          <span className={styles.tagline}>FASHION STORE • ACCESO SISTEMA</span>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.errorBanner}>{error}</div>}

          {isRegistering && (
            <Input
              label="Nombre Completo"
              type="text"
              placeholder="Ej. Juan Pérez"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              id="login-fullname"
            />
          )}

          <Input
            label="Correo Electrónico"
            type="email"
            placeholder="ejemplo@jmfashion.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            id="login-email"
          />

          <Input
            label="Contraseña"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            id="login-password"
          />

          <Button type="submit" variant="primary" isLoading={isLoading} className={styles.submitBtn}>
            {isRegistering ? 'Crear Cuenta' : 'Iniciar Sesión'}
          </Button>
        </form>

        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem', color: '#71717A' }}>
          {isRegistering ? '¿Ya tienes una cuenta? ' : '¿Necesitas registrarte? '}
          <button
            type="button"
            onClick={() => setIsRegistering(!isRegistering)}
            style={{ border: 'none', background: 'none', fontWeight: 700, color: '#2563EB', cursor: 'pointer' }}
          >
            {isRegistering ? 'Inicia sesión' : 'Crear cuenta'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
