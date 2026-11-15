// =============================================================================
// Ejecución 159 (D137): número de WhatsApp de la tienda en UN solo sitio.
// Antes estaba repetido en el pie de página, el botón flotante, /contacto y la posventa de «Mis pedidos».
// Se configura con VITE_STORE_WHATSAPP (opcional, público: llega al bundle; no es un secreto). Formato wa.me:
// solo dígitos con indicativo de país, sin «+», espacios ni guiones (se toleran y se limpian). Si falta o no es
// válido se usa el marcador histórico y `isPlaceholderWhatsapp` lo indica (el propietario debe dar el real).
// =============================================================================

export const PLACEHOLDER_WHATSAPP = '573000000000';

/** Normaliza un número para wa.me: quita +, espacios, guiones, puntos y paréntesis; exige 8–15 dígitos. */
export function normalizeWhatsapp(value) {
  if (typeof value !== 'string') return null;
  const digits = value.trim().replace(/^["']|["']$/g, '').replace(/[\s+\-().]/g, '');
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/** Resuelve el número a partir del entorno (inyectable para pruebas). */
export function resolveStoreWhatsapp(env = import.meta.env) {
  return normalizeWhatsapp(env?.VITE_STORE_WHATSAPP) ?? PLACEHOLDER_WHATSAPP;
}

export const STORE_WHATSAPP = resolveStoreWhatsapp();
export const isPlaceholderWhatsapp = STORE_WHATSAPP === PLACEHOLDER_WHATSAPP;

/** Enlace wa.me de la tienda, con mensaje opcional ya redactado. */
export function whatsappUrl(text, number = STORE_WHATSAPP) {
  const base = `https://wa.me/${number}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Número legible para mostrar en texto. Colombia (57 + 10 dígitos) → «+57 300 000 0000»; otros → «+<dígitos>». */
export function formatWhatsapp(number = STORE_WHATSAPP) {
  const m = /^57(\d{3})(\d{3})(\d{4})$/.exec(number);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : `+${number}`;
}

export const STORE_WHATSAPP_DISPLAY = formatWhatsapp();
