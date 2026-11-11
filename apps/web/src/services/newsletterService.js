// =============================================================================
// Boletín «Únete al club J&M» → RPC public.subscribe_newsletter (migración 20261111140000, ejecución 67).
// Antes el formulario de la portada confirmaba la suscripción sin guardar nada y prometía un 10% inexistente.
// La RPC es idempotente y responde igual si el correo ya estaba suscrito (no revela suscriptores).
// =============================================================================
import supabase from '../config/supabase';
import { fetchAllRows } from '../utils/fetchAll.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Mismo criterio que la RPC (3–254 caracteres, forma usuario@dominio.tld). Devuelve el motivo o null. */
export function validateNewsletterEmail(email) {
  const e = String(email ?? '').trim();
  if (!e) return 'Escribe tu correo electrónico.';
  if (e.length > 254 || e.length < 3 || !EMAIL_RE.test(e)) return 'Revisa tu correo: debe tener la forma nombre@dominio.com.';
  return null;
}

/** Error de PostgREST/red → mensaje en español sin detalles internos. */
export function newsletterErrorMessage(err) {
  const hint = err?.hint;
  if (hint === 'JM_INVALID_EMAIL') return 'Revisa tu correo: debe tener la forma nombre@dominio.com.';
  if (hint === 'JM_RATE_LIMITED') return 'Recibimos muchas suscripciones en este momento. Intenta de nuevo en un minuto.';
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'La suscripción al boletín no está disponible en este momento.';
  return 'No pudimos registrar tu correo. Revisa tu conexión e intenta de nuevo.';
}

export async function subscribeNewsletter(email, source = 'home') {
  const invalid = validateNewsletterEmail(email);
  if (invalid) throw new Error(invalid);
  let res;
  try {
    res = await supabase.rpc('subscribe_newsletter', { p_email: String(email).trim(), p_source: source });
  } catch (e) {
    throw new Error(newsletterErrorMessage(e));
  }
  if (res?.error) throw new Error(newsletterErrorMessage(res.error));
  if (!res?.data?.ok) throw new Error(newsletterErrorMessage(null));
  return true;
}

// ---------------------------------------------------------------------------
// Admin (ejecución 69): lista, baja/reactivación y exportación. La RLS de la migración
// 20261111140000 solo deja leer y cambiar `unsubscribed_at` a is_admin().
// ---------------------------------------------------------------------------
export const NEWSLETTER_ADMIN_COLUMNS = 'id, email, source, user_id, subscribed_at, unsubscribed_at, created_at';

/** Todos los suscriptores (activos y dados de baja), paginando para no perder filas tras max_rows. */
export async function fetchNewsletterSubscribers() {
  const res = await fetchAllRows(() => supabase.from('newsletter_subscribers').select(NEWSLETTER_ADMIN_COLUMNS)
    .order('created_at', { ascending: false }).order('id', { ascending: false }));
  if (res.error) {
    const missing = res.error.code === 'PGRST205' || res.error.code === '42P01';
    throw new Error(missing ? 'La tabla del boletín no existe en esta base de datos (falta la migración 20261111140000).'
      : 'No se pudieron cargar los suscriptores.');
  }
  return { rows: res.data, capped: res.capped };
}

/** Baja (active=false) o reactivación (active=true). Devuelve la fila actualizada. */
export async function setNewsletterSubscriberActive(id, active) {
  const unsubscribed_at = active ? null : new Date().toISOString();
  const { data, error } = await supabase.from('newsletter_subscribers').update({ unsubscribed_at })
    .eq('id', id).select(NEWSLETTER_ADMIN_COLUMNS);
  if (error) throw new Error('No se pudo actualizar el suscriptor.');
  // Sin filas = la RLS lo impidió (no admin) o el registro ya no existe.
  if (!data || data.length !== 1) throw new Error('No se pudo actualizar el suscriptor (sin permiso o no existe).');
  return data[0];
}
