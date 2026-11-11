// =============================================================================
// Cuenta del cliente: perfil (public.profiles) y libreta de direcciones (public.customer_addresses).
// RLS (baseline): profiles_update_own (id = auth.uid()) + GRANT UPDATE solo de full_name, phone, avatar_url,
// preferred_size, preferred_fit y marketing_opt_in; customer_addresses_own (FOR ALL, user_id = auth.uid()).
// La validación replica los CHECK de las tablas para mostrar el motivo antes de enviar:
//   profiles.full_name ≤ 150 · profiles.phone ≤ 30
//   customer_addresses: recipient_name 2–150 · phone 7–30 · department 2–100 · city 2–100 · address_line 4–255
//                       neighborhood ≤ 100 · reference ≤ 500 · un único is_default por usuario (índice parcial único).
// Ejecución 56 (DECISIONS D34): antes no existía ninguna forma de editar el perfil ni de guardar direcciones.
// =============================================================================
import supabase from '../config/supabase';
import { DEPARTMENTS } from '../utils/colombia';

const PHONE_CHARS_RE = /^[0-9+()\s-]+$/;
const digitsOf = (s) => String(s ?? '').replace(/[^0-9]/g, '');
const trim = (v) => String(v ?? '').trim();

/** Error de PostgREST/Auth → Error con mensaje en español (sin filtrar detalles internos). */
export function accountError(err, fallback) {
  const code = err?.code;
  const m = String(err?.message || '');
  let msg = fallback;
  if (code === '23514' || code === '22001') msg = 'Algún dato no cumple el formato permitido. Revisa los campos.';
  else if (code === '23505') msg = 'Ya tienes otra dirección principal. Recarga la página e inténtalo de nuevo.';
  else if (code === '42501' || /permission denied|row-level security/i.test(m)) msg = 'Tu sesión no tiene permiso para esta acción. Vuelve a iniciar sesión.';
  else if (code === 'PGRST301' || /jwt/i.test(m)) msg = 'Tu sesión venció. Vuelve a iniciar sesión.';
  else if (/fetch|network/i.test(m)) msg = 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
  return Object.assign(new Error(msg), { hint: code || 'ERROR', cause: err });
}

const validationError = (errors) => Object.assign(new Error(Object.values(errors)[0]), { hint: 'VALIDATION', errors });

function phoneError(raw, required) {
  const p = trim(raw);
  if (!p) return required ? 'Escribe un teléfono de 7 a 15 dígitos.' : null;
  const d = digitsOf(p);
  if (!PHONE_CHARS_RE.test(p) || d.length < 7 || d.length > 15 || p.length > 30) return 'Escribe un teléfono de 7 a 15 dígitos.';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------------------------------------------
export const toProfileForm = (p) => ({
  full_name: p?.full_name ?? '', phone: p?.phone ?? '', marketing_opt_in: !!p?.marketing_opt_in,
});

/** Valida el formulario de perfil. Devuelve { errors, row } (row solo con columnas que el cliente puede editar). */
export function validateProfile(form) {
  const errors = {};
  const fullName = trim(form.full_name).replace(/\s+/g, ' ');
  if (fullName.length < 2) errors.full_name = 'Escribe tu nombre completo.';
  else if (fullName.length > 150) errors.full_name = 'El nombre admite como máximo 150 caracteres.';
  const pe = phoneError(form.phone, false);
  if (pe) errors.phone = pe;
  return { errors, row: { full_name: fullName, phone: trim(form.phone) || null, marketing_opt_in: !!form.marketing_opt_in } };
}

// ---------------------------------------------------------------------------------------------------------------
// Direcciones
// ---------------------------------------------------------------------------------------------------------------
export const emptyAddressForm = (defaults = {}) => ({
  id: null, recipient_name: defaults.recipient_name ?? '', phone: defaults.phone ?? '', department: '', city: '',
  address_line: '', neighborhood: '', reference: '', is_default: !!defaults.is_default,
});

export const toAddressForm = (a) => ({
  id: a.id, recipient_name: a.recipient_name ?? '', phone: a.phone ?? '', department: a.department ?? '', city: a.city ?? '',
  address_line: a.address_line ?? '', neighborhood: a.neighborhood ?? '', reference: a.reference ?? '', is_default: !!a.is_default,
});

/** Valida una dirección. Devuelve { errors, row } listo para insert/update (sin user_id ni id). */
export function validateAddress(form) {
  const errors = {};
  const row = {
    recipient_name: trim(form.recipient_name).replace(/\s+/g, ' '),
    phone: trim(form.phone),
    department: trim(form.department),
    city: trim(form.city),
    address_line: trim(form.address_line),
    neighborhood: trim(form.neighborhood) || null,
    reference: trim(form.reference) || null,
    is_default: !!form.is_default,
  };
  if (row.recipient_name.length < 2) errors.recipient_name = 'Escribe el nombre de quien recibe.';
  else if (row.recipient_name.length > 150) errors.recipient_name = 'El nombre admite como máximo 150 caracteres.';
  const pe = phoneError(row.phone, true);
  if (pe) errors.phone = pe;
  if (!DEPARTMENTS.includes(row.department)) errors.department = 'Elige el departamento.';
  if (row.city.length < 2) errors.city = 'Escribe la ciudad o municipio.';
  else if (row.city.length > 100) errors.city = 'La ciudad admite como máximo 100 caracteres.';
  if (row.address_line.length < 4) errors.address_line = 'Escribe la dirección completa.';
  else if (row.address_line.length > 255) errors.address_line = 'La dirección admite como máximo 255 caracteres.';
  if (row.neighborhood && row.neighborhood.length > 100) errors.neighborhood = 'El barrio admite como máximo 100 caracteres.';
  if (row.reference && row.reference.length > 500) errors.reference = 'Las indicaciones admiten como máximo 500 caracteres.';
  return { errors, row };
}

/** Texto de una línea para mostrar una dirección (lista y selector del checkout). */
export const addressSummary = (a) =>
  [a.address_line, a.neighborhood, `${a.city}, ${a.department}`].filter(Boolean).join(' · ');

/** Dirección guardada → campos del formulario de checkout. */
export const addressToCheckout = (a) => ({
  phone: a.phone ?? '', department: a.department ?? '', city: a.city ?? '', address: a.address_line ?? '',
  neighborhood: a.neighborhood ?? '', notes: a.reference ?? '',
});

/**
 * Ejecución 57: datos del checkout → formulario de dirección para «Guardar esta dirección en mi cuenta».
 * Las notas de entrega del checkout son la «referencia» de la dirección (inverso de addressToCheckout).
 */
export const checkoutToAddressForm = (f, isDefault = false) => ({
  id: null,
  recipient_name: `${trim(f.firstName)} ${trim(f.lastName)}`.trim(),
  phone: f.phone ?? '', department: f.department ?? '', city: f.city ?? '', address_line: f.address ?? '',
  neighborhood: f.neighborhood ?? '', reference: f.notes ?? '', is_default: !!isDefault,
});

const norm = (v) => trim(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** ¿Ya existe esa dirección? (misma dirección, ciudad y departamento sin distinguir mayúsculas, tildes ni signos). */
export const hasSameAddress = (list, form) => (list ?? []).some((a) =>
  norm(a.address_line) === norm(form.address_line) && norm(a.city) === norm(form.city) && a.department === trim(form.department));

const sortAddresses = (list) => [...list].sort((a, b) =>
  (b.is_default === true) - (a.is_default === true) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

const ADDRESS_COLS = 'id, recipient_name, phone, department, city, address_line, neighborhood, reference, is_default, created_at';

export const accountService = {
  /** Actualiza el perfil del usuario. Devuelve la fila guardada (para refrescar el store). */
  async updateProfile(userId, form) {
    if (!userId) throw accountError({ code: 'PGRST301' }, 'Tu sesión venció.');
    const { errors, row } = validateProfile(form);
    if (Object.keys(errors).length) throw validationError(errors);
    const { data, error } = await supabase.from('profiles').update(row).eq('id', userId).select('*');
    if (error) throw accountError(error, 'No pudimos guardar tu perfil. Inténtalo de nuevo.');
    // 0 filas = RLS/perfil inexistente: no fingir éxito.
    if (!data?.length) throw accountError({ code: '42501' }, 'No pudimos guardar tu perfil.');
    return data[0];
  },

  /** Direcciones del usuario, la principal primero y luego las más recientes. */
  async listAddresses(userId) {
    if (!userId) return [];
    const { data, error } = await supabase.from('customer_addresses').select(ADDRESS_COLS).eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw accountError(error, 'No pudimos cargar tus direcciones.');
    return sortAddresses(data ?? []);
  },

  /**
   * Quita la marca de principal de las demás direcciones del usuario. Debe ir ANTES de marcar otra como principal:
   * el índice único parcial (user_id) WHERE is_default rechaza dos principales a la vez (23505).
   */
  async clearDefault(userId, exceptId = null) {
    let q = supabase.from('customer_addresses').update({ is_default: false }).eq('user_id', userId).eq('is_default', true);
    if (exceptId) q = q.neq('id', exceptId);
    const { error } = await q;
    if (error) throw accountError(error, 'No pudimos cambiar la dirección principal.');
  },

  /** Crea (sin id) o actualiza una dirección. Devuelve la fila guardada. */
  async saveAddress(userId, form) {
    if (!userId) throw accountError({ code: 'PGRST301' }, 'Tu sesión venció.');
    const { errors, row } = validateAddress(form);
    if (Object.keys(errors).length) throw validationError(errors);
    if (row.is_default) await this.clearDefault(userId, form.id);
    if (!form.id) {
      const { data, error } = await supabase.from('customer_addresses').insert({ ...row, user_id: userId }).select(ADDRESS_COLS).single();
      if (error) throw accountError(error, 'No pudimos guardar la dirección.');
      return data;
    }
    const { data, error } = await supabase.from('customer_addresses').update(row).eq('id', form.id).eq('user_id', userId).select(ADDRESS_COLS);
    if (error) throw accountError(error, 'No pudimos guardar la dirección.');
    if (!data?.length) throw Object.assign(new Error('La dirección ya no existe. Recarga la página.'), { hint: 'NOT_FOUND' });
    return data[0];
  },

  async setDefaultAddress(userId, id) {
    await this.clearDefault(userId, id);
    const { data, error } = await supabase.from('customer_addresses').update({ is_default: true }).eq('id', id).eq('user_id', userId).select('id');
    if (error) throw accountError(error, 'No pudimos cambiar la dirección principal.');
    if (!data?.length) throw Object.assign(new Error('La dirección ya no existe. Recarga la página.'), { hint: 'NOT_FOUND' });
  },

  /**
   * «Guardar esta dirección en mi cuenta» del checkout. Nunca lanza: el pedido ya existe y el pago no debe depender de
   * esto. Devuelve { status: 'saved' | 'duplicate' | 'invalid' | 'error', address?, message? }.
   * Es la principal solo si el cliente no tenía ninguna. Relee la lista antes de insertar (otra pestaña pudo guardarla).
   */
  async saveFromCheckout(userId, checkoutForm) {
    if (!userId) return { status: 'error', message: 'Sin sesión.' };
    try {
      const existing = await this.listAddresses(userId);
      const form = checkoutToAddressForm(checkoutForm, existing.length === 0);
      if (hasSameAddress(existing, form)) return { status: 'duplicate' };
      const { errors } = validateAddress(form);
      if (Object.keys(errors).length) return { status: 'invalid', message: Object.values(errors)[0] };
      const address = await this.saveAddress(userId, form);
      return { status: 'saved', address };
    } catch (e) {
      return { status: 'error', message: e.message };
    }
  },

  /** Elimina una dirección; si era la principal y quedan otras, la más reciente pasa a ser la principal. */
  async deleteAddress(userId, address) {
    const { data, error } = await supabase.from('customer_addresses').delete().eq('id', address.id).eq('user_id', userId).select('id');
    if (error) throw accountError(error, 'No pudimos eliminar la dirección.');
    if (!data?.length) throw Object.assign(new Error('La dirección ya no existe. Recarga la página.'), { hint: 'NOT_FOUND' });
    const rest = await this.listAddresses(userId);
    if (address.is_default && rest.length && !rest.some((a) => a.is_default)) {
      await this.setDefaultAddress(userId, rest[0].id);
      rest[0] = { ...rest[0], is_default: true };
    }
    return rest;
  },
};

export default accountService;
