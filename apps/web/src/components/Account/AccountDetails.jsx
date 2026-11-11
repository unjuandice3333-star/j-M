// «Mi cuenta»: datos personales y libreta de direcciones del cliente (ejecución 56).
// Datos reales en profiles/customer_addresses (RLS por usuario); errores siempre visibles, nunca éxito fingido.
import React, { useEffect, useRef, useState } from 'react';
import { MapPin, User, Star, Pencil, Trash2, Plus, KeyRound } from 'lucide-react';
import supabase from '../../config/supabase';
import { useAuthStore } from '../../store/authStore';
import {
  accountService, toProfileForm, validateProfile, emptyAddressForm, toAddressForm, validateAddress, addressSummary,
} from '../../services/accountService';
import { DEPARTMENTS } from '../../utils/colombia';
import { PASSWORD_MAX, validateNewPassword, passwordUpdateError } from '../../utils/passwordPolicy';

const card = { backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' };
const label = { display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#09090B', marginBottom: '0.35rem' };
const input = { width: '100%', padding: '0.7rem 0.85rem', border: '1px solid #D4D4D8', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box', backgroundColor: '#FFFFFF', color: '#09090B' };
const primaryBtn = { backgroundColor: '#09090B', color: '#FFFFFF', border: 'none', padding: '0.65rem 1.2rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', cursor: 'pointer' };
const ghostBtn = { backgroundColor: '#FFFFFF', color: '#09090B', border: '1px solid #E4E4E7', padding: '0.5rem 0.85rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' };
const heading = { fontSize: '1.1rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' };

const FieldError = ({ msg }) => (msg ? <div role="alert" style={{ color: '#B91C1C', fontSize: '0.75rem', marginTop: '0.25rem' }}>{msg}</div> : null);
const Banner = ({ kind, children }) => (
  <div role={kind === 'error' ? 'alert' : 'status'} style={{
    padding: '0.7rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem', margin: '0.75rem 0',
    backgroundColor: kind === 'error' ? '#FEF2F2' : '#ECFDF5', color: kind === 'error' ? '#991B1B' : '#065F46',
    border: `1px solid ${kind === 'error' ? '#FECACA' : '#A7F3D0'}`,
  }}>{children}</div>
);

const sameForm = (a, b) => a.full_name === b.full_name && a.phone === b.phone && a.marketing_opt_in === b.marketing_opt_in;

function ProfileSection({ user, profile }) {
  const [form, setForm] = useState(() => toProfileForm(profile));
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  // El perfil llega de forma asíncrona y se vuelve a leer en cada renovación del token: solo se copia al formulario si
  // el cliente no tiene cambios sin guardar (antes, una relectura borraba lo que estaba escribiendo).
  const synced = useRef(toProfileForm(profile));
  useEffect(() => {
    const next = toProfileForm(profile);
    setForm((cur) => (sameForm(cur, synced.current) ? next : cur));
    synced.current = next;
  }, [profile]);

  const change = (e) => {
    const { name, type, checked, value } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    setErrors((er) => ({ ...er, [name]: undefined }));
    setMsg(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    const { errors: errs } = validateProfile(form);
    setErrors(errs);
    if (Object.keys(errs).length) { setMsg({ kind: 'error', text: 'Revisa los campos marcados.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const saved = await accountService.updateProfile(user.id, form);
      const next = { ...(profile || {}), ...saved };
      synced.current = toProfileForm(next);
      setForm(synced.current);
      useAuthStore.getState().setProfile(next);
      setMsg({ kind: 'ok', text: 'Datos guardados.' });
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      setMsg({ kind: 'error', text: err.message });
    } finally { setSaving(false); }
  };

  return (
    <section style={card} aria-labelledby="perfil-titulo" data-testid="profile-section">
      <h2 id="perfil-titulo" style={heading}><User size={20} /> Mis datos</h2>
      <form onSubmit={submit} noValidate style={{ marginTop: '1rem' }}>
        <div style={grid}>
          <div>
            <label style={label} htmlFor="profile-full-name">Nombre completo</label>
            <input id="profile-full-name" name="full_name" value={form.full_name} onChange={change} maxLength={150} autoComplete="name" aria-invalid={Boolean(errors.full_name)} style={input} />
            <FieldError msg={errors.full_name} />
          </div>
          <div>
            <label style={label} htmlFor="profile-phone">Teléfono (opcional)</label>
            <input id="profile-phone" name="phone" type="tel" value={form.phone} onChange={change} maxLength={30} autoComplete="tel" aria-invalid={Boolean(errors.phone)} style={input} />
            <FieldError msg={errors.phone} />
          </div>
          <div>
            <span style={label}>Correo</span>
            <div style={{ ...input, backgroundColor: '#F4F4F5', color: '#52525B' }}>{user.email}</div>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#3F3F46', margin: '1rem 0' }}>
          <input type="checkbox" name="marketing_opt_in" checked={form.marketing_opt_in} onChange={change} />
          Quiero recibir novedades y promociones por correo.
        </label>
        {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
        <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Guardando…' : 'Guardar datos'}</button>
      </form>
    </section>
  );
}

function AddressForm({ initial, onCancel, onSaved, userId }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const change = (e) => {
    const { name, type, checked, value } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    setErrors((er) => ({ ...er, [name]: undefined }));
  };
  const submit = async (e) => {
    e.preventDefault();
    const { errors: errs } = validateAddress(form);
    setErrors(errs);
    if (Object.keys(errs).length) { setError('Revisa los campos marcados.'); return; }
    setSaving(true); setError(null);
    try {
      await accountService.saveAddress(userId, form);
      await onSaved(form.id ? 'Dirección actualizada.' : 'Dirección guardada.');
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      setError(err.message);
      setSaving(false);
    }
  };
  const field = (name, text, props = {}) => (
    <div>
      <label style={label} htmlFor={`addr-${name}`}>{text}</label>
      <input id={`addr-${name}`} name={name} value={form[name]} onChange={change} aria-invalid={Boolean(errors[name])} style={input} {...props} />
      <FieldError msg={errors[name]} />
    </div>
  );
  return (
    <form onSubmit={submit} noValidate data-testid="address-form" style={{ border: '1px dashed #D4D4D8', borderRadius: '10px', padding: '1rem', marginTop: '1rem' }}>
      <div style={grid}>
        {field('recipient_name', 'Quien recibe', { maxLength: 150, autoComplete: 'name' })}
        {field('phone', 'Teléfono', { type: 'tel', maxLength: 30, autoComplete: 'tel' })}
        <div>
          <label style={label} htmlFor="addr-department">Departamento</label>
          <select id="addr-department" name="department" value={form.department} onChange={change} aria-invalid={Boolean(errors.department)} style={input}>
            <option value="">Selecciona…</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <FieldError msg={errors.department} />
        </div>
        {field('city', 'Ciudad o municipio', { maxLength: 100 })}
        {field('address_line', 'Dirección', { maxLength: 255, placeholder: 'Ej: Calle 93B # 11A - 28, Apt 402', autoComplete: 'street-address' })}
        {field('neighborhood', 'Barrio (opcional)', { maxLength: 100 })}
      </div>
      <div style={{ marginTop: '1rem' }}>
        <label style={label} htmlFor="addr-reference">Indicaciones para la entrega (opcional)</label>
        <textarea id="addr-reference" name="reference" value={form.reference} onChange={change} maxLength={500} rows={2} style={{ ...input, resize: 'vertical' }} />
        <FieldError msg={errors.reference} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#3F3F46', margin: '0.85rem 0' }}>
        <input type="checkbox" name="is_default" checked={form.is_default} onChange={change} /> Usar como dirección principal
      </label>
      {error && <Banner kind="error">{error}</Banner>}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Guardando…' : 'Guardar dirección'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancelar</button>
      </div>
    </form>
  );
}

function AddressBook({ user, profile }) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(null); // null | formulario (nuevo o existente)
  const [busyId, setBusyId] = useState(null);

  const reload = async () => {
    setLoadError(null);
    try { setAddresses(await accountService.listAddresses(user.id)); }
    catch (err) { setLoadError(err.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNew = () => {
    setMsg(null);
    // La primera dirección es la principal por defecto.
    setEditing(emptyAddressForm({ recipient_name: profile?.full_name ?? '', phone: profile?.phone ?? '', is_default: addresses.length === 0 }));
  };
  const onSaved = async (text) => { setEditing(null); setMsg({ kind: 'ok', text }); await reload(); };

  const makeDefault = async (a) => {
    setBusyId(a.id); setMsg(null);
    try { await accountService.setDefaultAddress(user.id, a.id); setMsg({ kind: 'ok', text: 'Dirección principal actualizada.' }); await reload(); }
    catch (err) { setMsg({ kind: 'error', text: err.message }); }
    finally { setBusyId(null); }
  };
  const remove = async (a) => {
    if (!window.confirm('¿Eliminar esta dirección?')) return;
    setBusyId(a.id); setMsg(null);
    try { setAddresses(await accountService.deleteAddress(user.id, a)); setMsg({ kind: 'ok', text: 'Dirección eliminada.' }); }
    catch (err) { setMsg({ kind: 'error', text: err.message }); await reload(); }
    finally { setBusyId(null); }
  };

  return (
    <section style={card} aria-labelledby="direcciones-titulo" data-testid="address-book">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <h2 id="direcciones-titulo" style={heading}><MapPin size={20} /> Mis direcciones</h2>
        {!editing && !loading && !loadError && <button type="button" onClick={startNew} style={ghostBtn}><Plus size={14} /> Agregar dirección</button>}
      </div>
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      {loading ? (
        <p style={{ color: '#71717A', fontSize: '0.88rem' }}>Cargando direcciones…</p>
      ) : loadError ? (
        <Banner kind="error">{loadError} <button type="button" onClick={() => { setLoading(true); reload(); }} style={{ ...ghostBtn, marginLeft: '0.5rem' }}>Reintentar</button></Banner>
      ) : addresses.length === 0 && !editing ? (
        <p style={{ color: '#71717A', fontSize: '0.88rem' }}>Aún no tienes direcciones guardadas. Guarda una para completar el checkout más rápido.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {addresses.map((a) => (
            <li key={a.id} data-testid="address-item" style={{ border: `1px solid ${a.is_default ? '#09090B' : '#E4E4E7'}`, borderRadius: '10px', padding: '0.9rem 1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.88rem', color: '#3F3F46', minWidth: 0 }}>
                <strong style={{ color: '#09090B' }}>{a.recipient_name}</strong> · {a.phone}
                {a.is_default && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', backgroundColor: '#09090B', color: '#FFFFFF', padding: '2px 8px', borderRadius: '999px' }}>Principal</span>}
                <div style={{ marginTop: '0.25rem', overflowWrap: 'anywhere' }}>{addressSummary(a)}</div>
                {a.reference && <div style={{ marginTop: '0.2rem', color: '#71717A', fontSize: '0.8rem', overflowWrap: 'anywhere' }}>{a.reference}</div>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {!a.is_default && <button type="button" disabled={busyId === a.id} onClick={() => makeDefault(a)} style={ghostBtn}><Star size={14} /> Hacer principal</button>}
                <button type="button" disabled={busyId === a.id} onClick={() => { setMsg(null); setEditing(toAddressForm(a)); }} style={ghostBtn} aria-label={`Editar dirección ${a.address_line}`}><Pencil size={14} /> Editar</button>
                <button type="button" disabled={busyId === a.id} onClick={() => remove(a)} style={{ ...ghostBtn, color: '#B91C1C' }} aria-label={`Eliminar dirección ${a.address_line}`}><Trash2 size={14} /> Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <AddressForm key={editing.id ?? 'nueva'} initial={editing} userId={user.id} onCancel={() => setEditing(null)} onSaved={onSaved} />}
    </section>
  );
}

// Ejecución 57: cambiar la contraseña con la sesión abierta (antes solo existía «olvidé mi contraseña» por correo).
// Si el proyecto exige reautenticación (Auth → «Secure password change»), Supabase responde reauthentication_needed:
// se pide el código que llega por correo (supabase.auth.reauthenticate) y se reenvía como nonce.
function PasswordSection() {
  const [pw, setPw] = useState({ password: '', confirm: '', nonce: '' });
  const [needsCode, setNeedsCode] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const change = (e) => { const { name, value } = e.target; setPw((f) => ({ ...f, [name]: value })); setMsg(null); };

  const sendCode = async () => {
    const { error } = await supabase.auth.reauthenticate();
    if (error) { setMsg({ kind: 'error', text: passwordUpdateError(error).message }); return false; }
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const invalid = validateNewPassword(pw.password, pw.confirm);
    if (invalid) { setMsg({ kind: 'error', text: invalid }); return; }
    if (needsCode && !pw.nonce.trim()) { setMsg({ kind: 'error', text: 'Escribe el código que te enviamos por correo.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const attrs = needsCode ? { password: pw.password, nonce: pw.nonce.trim() } : { password: pw.password };
      const { error } = await supabase.auth.updateUser(attrs);
      if (!error) {
        setPw({ password: '', confirm: '', nonce: '' }); setNeedsCode(false);
        setMsg({ kind: 'ok', text: 'Contraseña actualizada. Úsala la próxima vez que inicies sesión.' });
        return;
      }
      const { kind, message } = passwordUpdateError(error);
      if (kind === 'reauth') {
        if (await sendCode()) { setNeedsCode(true); setMsg({ kind: 'ok', text: message }); }
        return;
      }
      if (kind === 'session') { setMsg({ kind: 'error', text: `${message} Vuelve a iniciar sesión.` }); return; }
      setMsg({ kind: 'error', text: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={card} aria-labelledby="account-password-title" data-testid="account-password">
      <h2 id="account-password-title" style={heading}><KeyRound size={20} /> Contraseña</h2>
      <form onSubmit={submit} noValidate style={{ marginTop: '1rem' }}>
        <div style={grid}>
          <div>
            <label style={label} htmlFor="acc-new-password">Nueva contraseña</label>
            <input id="acc-new-password" name="password" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={pw.password} onChange={change} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="acc-confirm-password">Repite la contraseña</label>
            <input id="acc-confirm-password" name="confirm" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={pw.confirm} onChange={change} style={input} />
          </div>
          {needsCode && (
            <div>
              <label style={label} htmlFor="acc-password-nonce">Código enviado a tu correo</label>
              <input id="acc-password-nonce" name="nonce" inputMode="numeric" autoComplete="one-time-code" maxLength={12} value={pw.nonce} onChange={change} style={input} />
            </div>
          )}
        </div>
        {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
          {needsCode && <button type="button" disabled={busy} onClick={async () => { setMsg(null); if (await sendCode()) setMsg({ kind: 'ok', text: 'Te enviamos un código nuevo.' }); }} style={ghostBtn}>Reenviar código</button>}
        </div>
      </form>
    </section>
  );
}

export function AccountDetails({ user, profile }) {
  return (
    <>
      <ProfileSection user={user} profile={profile} />
      <AddressBook user={user} profile={profile} />
      <PasswordSection />
    </>
  );
}

export default AccountDetails;
