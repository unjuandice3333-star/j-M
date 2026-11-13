import React, { useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { Button, Input } from '@jm/ui';
import { validateAuthForm, serverErrorField } from '../utils/authForm.js';
import styles from './Login.module.css';

// Ejecución 114 (D85): `noValidate` + validación propia. Antes `required` hacía que Chromium mostrara su globo nativo
// y el error de la página no salía; ahora el aviso va debajo del campo culpable, enlazado (aria-describedby) y con foco.
const FIELD_IDS = { fullName: 'login-fullname', email: 'login-email', password: 'login-password' };
const ERROR_ID = 'login-field-error';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [notice, setNotice] = useState('');
  const [fieldError, setFieldError] = useState(null); // { field, message }
  const formRef = useRef(null);
  const { login, signUp, isLoading, error } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const fromPath = location.state?.from?.pathname || '/admin/dashboard';

  const showFieldError = (fe) => {
    setFieldError(fe);
    formRef.current?.querySelector(`#${FIELD_IDS[fe.field]}`)?.focus();
  };
  const fieldA11y = (field) => (fieldError?.field === field
    ? { 'aria-invalid': true, 'aria-describedby': ERROR_ID }
    : { 'aria-invalid': false });
  const fieldErrorText = (field) => (fieldError?.field === field
    ? <p id={ERROR_ID} role="alert" className={styles.fieldError}>{fieldError.message}</p>
    : null);
  const clearFieldError = (field) => { if (fieldError?.field === field) setFieldError(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setNotice('');
    const invalid = validateAuthForm({ email, password, fullName, register: isRegistering });
    if (invalid) { showFieldError(invalid); return; }
    setFieldError(null);
    try {
      if (isRegistering) {
        await signUp(email, password, fullName);
        setNotice('Cuenta creada exitosamente. Si tu correo requiere verificación, por favor revisa tu bandeja de entrada.');
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
      const message = err?.message || 'No fue posible continuar. Inténtalo de nuevo.';
      showFieldError({ field: serverErrorField(message, isRegistering), message });
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <div className={styles.header}>
          {/* Ejecución 103: la página no tenía <h1>; el título visible es el logo y el nombre accesible dice qué se hace aquí. */}
          <h1 className={styles.logo} style={{ margin: 0, lineHeight: 1.2 }}>
            J&M<span className="jm-sr-only"> — {isRegistering ? 'Crear cuenta' : 'Iniciar sesión'}</span>
          </h1>
          <span className={styles.tagline}>FASHION STORE • ACCESO SISTEMA</span>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} noValidate className={styles.form}>
          {error && !fieldError && <div className={styles.errorBanner} role="alert">{error}</div>}
          {notice && !error && <div className={styles.noticeBanner} role="status">{notice}</div>}

          {isRegistering && (
            <Input
              label="Nombre Completo"
              type="text"
              placeholder="Ej. Juan Pérez"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); clearFieldError('fullName'); }}
              {...fieldA11y('fullName')}
              required
              id="login-fullname"
              autoComplete="name"
            />
          )}
          {isRegistering && fieldErrorText('fullName')}

          <Input
            label="Correo Electrónico"
            type="email"
            placeholder="ejemplo@jmfashion.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
            {...fieldA11y('email')}
            required
            id="login-email"
            autoComplete="email"
          />
          {fieldErrorText('email')}

          <Input
            label="Contraseña"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
            {...fieldA11y('password')}
            required
            id="login-password"
            autoComplete={isRegistering ? 'new-password' : 'current-password'}
          />
          {fieldErrorText('password')}

          <Button type="submit" variant="primary" isLoading={isLoading} className={styles.submitBtn}>
            {isRegistering ? 'Crear Cuenta' : 'Iniciar Sesión'}
          </Button>
        </form>

        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem', color: '#A1A1AA' }}>
          {isRegistering ? '¿Ya tienes una cuenta? ' : '¿Necesitas registrarte? '}
          <button
            type="button"
            onClick={() => { setIsRegistering(!isRegistering); setFieldError(null); }}
            style={{ border: 'none', background: 'none', fontWeight: 700, color: '#60A5FA', cursor: 'pointer', minHeight: 44, padding: '0 0.5rem', fontSize: 'inherit' }}
          >
            {isRegistering ? 'Inicia sesión' : 'Crear cuenta'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
