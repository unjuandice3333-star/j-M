import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShieldCheck, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import supabase from '../../config/supabase';
import { useAuthStore } from '../../store/authStore.js';

export const AdminPasswordSetup = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccess(false);

    if (!user) {
      setErrorMessage('No existe una sesión administrativa activa.');
      return;
    }

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      setErrorMessage('No tienes permisos administrativos para realizar esta acción.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('La contraseña debe tener mínimo 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden.');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password
      });

      if (error) throw error;

      setPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (error) {
      console.error('[AdminPasswordSetup Error]:', error);
      setErrorMessage(
        'No fue posible establecer la contraseña. Intenta nuevamente.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#09090B',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: 'var(--font-sans)',
        color: '#FFFFFF'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: '#121215',
          borderRadius: '16px',
          border: '1px solid #27272A',
          padding: '2.5rem 2rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
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
            }}
          >
            <ShieldCheck size={28} />
          </div>

          <span
            style={{
              display: 'block',
              fontSize: '0.7rem',
              fontWeight: 800,
              color: '#D4AF37',
              letterSpacing: '0.22em',
              textTransform: 'uppercase'
            }}
          >
            SEGURIDAD ADMINISTRATIVA
          </span>

          <h1
            style={{
              fontSize: '1.55rem',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              margin: '0.4rem 0'
            }}
          >
            Configurar contraseña
          </h1>

          <p
            style={{
              fontSize: '0.85rem',
              color: '#A1A1AA',
              lineHeight: 1.5
            }}
          >
            Establece una contraseña para acceder al panel administrativo
            mediante correo y contraseña.
          </p>
        </div>

        <div
          style={{
            backgroundColor: '#18181B',
            border: '1px solid #27272A',
            borderRadius: '8px',
            padding: '0.9rem 1rem',
            marginBottom: '1.5rem',
            fontSize: '0.8rem',
            color: '#A1A1AA'
          }}
        >
          <strong style={{ color: '#FFFFFF' }}>
            Cuenta:
          </strong>{' '}
          {user?.email}
          <br />
          <strong style={{ color: '#FFFFFF' }}>
            Rol:
          </strong>{' '}
          {profile?.role === 'super_admin'
            ? 'Super Administrador'
            : 'Administrador'}
        </div>

        {errorMessage && (
          <div
            style={{
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
            }}
          >
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        {success && (
          <div
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid #10B981',
              color: '#6EE7B7',
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 600,
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem'
            }}
          >
            <CheckCircle size={18} />
            <span>
              Contraseña configurada correctamente. Ya puedes acceder al
              panel administrativo mediante correo y contraseña.
            </span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.78rem',
                fontWeight: 800,
                color: '#D4D4D8',
                textTransform: 'uppercase',
                marginBottom: '0.4rem',
                letterSpacing: '0.05em'
              }}
            >
              Nueva contraseña
            </label>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#18181B',
                border: '1px solid #3F3F46',
                borderRadius: '8px',
                padding: '0 0.8rem'
              }}
            >
              <Lock size={18} color="#71717A" />

              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
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
            <label
              style={{
                display: 'block',
                fontSize: '0.78rem',
                fontWeight: 800,
                color: '#D4D4D8',
                textTransform: 'uppercase',
                marginBottom: '0.4rem',
                letterSpacing: '0.05em'
              }}
            >
              Confirmar contraseña
            </label>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#18181B',
                border: '1px solid #3F3F46',
                borderRadius: '8px',
                padding: '0 0.8rem'
              }}
            >
              <Lock size={18} color="#71717A" />

              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
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
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginTop: '0.5rem',
              opacity: isLoading ? 0.7 : 1
            }}
          >
            {isLoading ? 'CONFIGURANDO...' : 'ESTABLECER CONTRASEÑA'}
            <ArrowRight size={18} />
          </button>
        </form>

        {success && (
          <button
            type="button"
            onClick={() => navigate('/admin/login')}
            style={{
              width: '100%',
              marginTop: '1rem',
              backgroundColor: 'transparent',
              color: '#D4AF37',
              padding: '0.85rem',
              borderRadius: '8px',
              fontWeight: 800,
              fontSize: '0.82rem',
              border: '1px solid #3F3F46',
              cursor: 'pointer'
            }}
          >
            IR AL LOGIN ADMINISTRATIVO
          </button>
        )}

        <div
          style={{
            marginTop: '2rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid #27272A',
            textAlign: 'center',
            fontSize: '0.72rem',
            color: '#71717A',
            lineHeight: 1.5
          }}
        >
          La contraseña es gestionada directamente por Supabase Auth.
          <br />
          Nunca se almacena en la aplicación ni en PostgreSQL.
        </div>
      </div>
    </div>
  );
};

export default AdminPasswordSetup;