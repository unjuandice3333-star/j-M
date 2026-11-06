// M27 — Restablecer contraseña: destino del enlace que envía supabase.auth.resetPasswordForEmail. Supabase abre una
// sesión de recuperación (evento PASSWORD_RECOVERY); con ella el cliente fija una contraseña nueva (updateUser).
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import supabase from '../config/supabase';

export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError('No se pudo cambiar la contraseña. Solicita un enlace nuevo.'); return; }
    setDone(true);
    setTimeout(() => navigate('/cuenta'), 1500);
  };

  const input = { width: '100%', padding: '0.85rem 1rem', border: '1px solid #D4D4D8', borderRadius: '8px', fontSize: '0.9rem' };
  return (
    <div className="jm-container" style={{ maxWidth: '440px', padding: '4rem 0' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1rem' }}>Crear una contraseña nueva</h1>
      {!ready ? (
        <p style={{ color: '#71717A' }}>
          Abre esta página desde el enlace que te enviamos por correo. Si el enlace venció, <Link to="/cuenta" style={{ textDecoration: 'underline' }}>solicita otro</Link>.
        </p>
      ) : done ? (
        <p role="status" style={{ color: '#065F46', fontWeight: 700 }}>Contraseña actualizada. Te llevamos a tu cuenta…</p>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: '0.9rem' }} noValidate>
          <label>Nueva contraseña<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} style={input} /></label>
          <label>Repite la contraseña<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={input} /></label>
          {error && <div role="alert" style={{ color: '#E11D48', fontWeight: 700, fontSize: '0.85rem' }}>{error}</div>}
          <button type="submit" disabled={busy} style={{ backgroundColor: '#09090B', color: '#FFF', padding: '0.9rem', borderRadius: '8px', fontWeight: 800 }}>
            {busy ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      )}
    </div>
  );
};

export default ResetPasswordPage;
