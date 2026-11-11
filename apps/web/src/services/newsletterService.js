// =============================================================================
// Boletín «Únete al club J&M» → RPC public.subscribe_newsletter (migración 20261111140000, ejecución 67).
// Antes el formulario de la portada confirmaba la suscripción sin guardar nada y prometía un 10% inexistente.
// La RPC es idempotente y responde igual si el correo ya estaba suscrito (no revela suscriptores).
// =============================================================================
import supabase from '../config/supabase';

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
