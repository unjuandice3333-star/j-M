// M27 — Restablecer contraseña: destino del enlace que envía supabase.auth.resetPasswordForEmail. Supabase abre una
// sesión de recuperación (evento PASSWORD_RECOVERY); con ella el cliente fija una contraseña nueva (updateUser).
// Ejecución 57: errores traducidos según la causa real (antes todo era «Solicita un enlace nuevo»), enlace vencido
// detectado desde la URL, límite de 72 caracteres y temporizador de redirección cancelado al desmontar.
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import supabase from '../config/supabase';
import { PASSWORD_MAX, validateNewPassword, passwordUpdateError, recoveryLinkError } from '../utils/passwordPolicy';

export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [linkError] = useState(() => (typeof window === 'undefined' ? null : recoveryLinkError(window.location.hash, window.location.search)));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [errorField, setErrorField] = useState(null); // 'password' | 'confirm' | null (error general)
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  const formRef = useRef(null);

  // Ejecución 112 (D83): el aviso queda enlazado al campo que lo causa y el foco va a ese campo.
  const fail = (message, field) => {
    setError(message);
    setErrorField(field);
    if (field) requestAnimationFrame(() => formRef.current?.querySelector(`[name="${field}"]`)?.focus());
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => { sub.subscription.unsubscribe(); clearTimeout(timer.current); };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setErrorField(null);
    const invalid = validateNewPassword(password, confirm);
    if (invalid) { fail(invalid, validateNewPassword(password, password) ? 'password' : 'confirm'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      const { kind, message } = passwordUpdateError(err);
      if (kind === 'session') { setExpired(true); fail(`${message} Solicita un enlace nuevo.`, null); }
      else fail(message, kind === 'same' || kind === 'weak' ? 'password' : null);
      return;
    }
    setDone(true);
    timer.current = setTimeout(() => navigate('/cuenta'), 1500);
  };

  const a11y = (field) => (error && errorField === field
    ? { 'aria-invalid': true, 'aria-describedby': 'reset-password-error' }
    : { 'aria-invalid': false });
  const input = { width: '100%', padding: '0.85rem 1rem', border: '1px solid #D4D4D8', borderRadius: '8px', fontSize: '0.9rem' };
  const requestAgain = <Link to="/cuenta" style={{ textDecoration: 'underline' }}>solicita otro</Link>;
  return (
    <div className="jm-container" style={{ maxWidth: '440px', padding: '4rem 0' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1rem' }}>Crear una contraseña nueva</h1>
      {!ready ? (
        linkError ? (
          <p role="alert" style={{ color: '#B91C1C', fontWeight: 600 }}>{linkError} Desde «Mi cuenta» puedes pedirlo: {requestAgain}.</p>
        ) : (
          <p style={{ color: '#71717A' }}>
            Abre esta página desde el enlace que te enviamos por correo. Si el enlace venció, {requestAgain}.
          </p>
        )
      ) : done ? (
        <p role="status" style={{ color: '#065F46', fontWeight: 700 }}>Contraseña actualizada. Te llevamos a tu cuenta…</p>
      ) : (
        <form ref={formRef} onSubmit={submit} style={{ display: 'grid', gap: '0.9rem' }} noValidate>
          <label>Nueva contraseña<input name="password" {...a11y('password')} type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={password} onChange={(e) => setPassword(e.target.value)} style={input} /></label>
          <label>Repite la contraseña<input name="confirm" {...a11y('confirm')} type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={confirm} onChange={(e) => setConfirm(e.target.value)} style={input} /></label>
          {error && (
            <div id="reset-password-error" role="alert" style={{ color: '#E11D48', fontWeight: 700, fontSize: '0.85rem' }}>
              {error}{expired && <> <Link to="/cuenta" style={{ textDecoration: 'underline' }}>Pedir enlace</Link></>}
            </div>
          )}
          <button type="submit" disabled={busy} style={{ backgroundColor: '#09090B', color: '#FFF', padding: '0.9rem', borderRadius: '8px', fontWeight: 800 }}>
            {busy ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      )}
    </div>
  );
};

export default ResetPasswordPage;
