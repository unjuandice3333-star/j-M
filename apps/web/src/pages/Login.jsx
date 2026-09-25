import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { Button, Input } from '@jm/ui';
import styles from './Login.module.css';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    try {
      await login(email, password);
      navigate('/pos');
    } catch (err) {
      console.error(err);
    }
  };

  const setDemoCredentials = (role) => {
    if (role === 'cashier') {
      setEmail('cajero@jmfashion.com');
      setPassword('cajero123');
    } else if (role === 'admin') {
      setEmail('admin@jmfashion.com');
      setPassword('admin123');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <div className={styles.header}>
          <span className={styles.logo}>J&M</span>
          <span className={styles.tagline}>FASHION RETAIL ERP</span>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.errorBanner}>{error}</div>}
          
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
            Iniciar Sesión
          </Button>
        </form>

        <div className={styles.demoSection}>
          <p className={styles.demoTitle}>Prueba de Roles Demo:</p>
          <div className={styles.demoButtons}>
            <Button size="sm" variant="outline" onClick={() => setDemoCredentials('cashier')}>
              Cargar Cajero
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDemoCredentials('admin')}>
              Cargar Admin
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
