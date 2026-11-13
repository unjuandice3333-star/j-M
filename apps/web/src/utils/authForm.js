// =============================================================================
// Ejecución 114 (D85): validación de los formularios de acceso de la tienda (/login y /cuenta sin sesión).
// Antes ambos usaban `required` sin `noValidate`: en Chromium el navegador detenía el envío con su globo nativo, el
// aviso de la página nunca aparecía y no quedaba enlazado al campo. Además el registro aceptaba contraseñas de menos
// de 8 caracteres aunque la política de la tienda (passwordPolicy.js, D35) exige 8.
// Devuelve el PRIMER problema en el orden visual del formulario: { field, message } o null.
// field: 'fullName' | 'email' | 'password'.
// =============================================================================
import { PASSWORD_MAX, PASSWORD_MIN } from './passwordPolicy.js';

export const AUTH_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateEmailField(email) {
  const e = String(email ?? '').trim();
  if (!e) return 'Escribe tu correo electrónico.';
  if (e.length > 254 || !AUTH_EMAIL_RE.test(e)) return 'Revisa tu correo: debe tener la forma nombre@dominio.com.';
  return null;
}

export function validateAuthForm({ email, password, fullName, register = false }) {
  if (register) {
    const name = String(fullName ?? '').trim().replace(/\s+/g, ' ');
    if (name.length < 2) return { field: 'fullName', message: 'Escribe tu nombre completo.' };
    if (name.length > 150) return { field: 'fullName', message: 'El nombre admite como máximo 150 caracteres.' };
  }
  const emailError = validateEmailField(email);
  if (emailError) return { field: 'email', message: emailError };
  const p = String(password ?? '');
  if (!p) return { field: 'password', message: 'Escribe tu contraseña.' };
  if (register) {
    if (p.length < PASSWORD_MIN) return { field: 'password', message: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.` };
    if (p.length > PASSWORD_MAX) return { field: 'password', message: `La contraseña admite como máximo ${PASSWORD_MAX} caracteres.` };
    if (!p.trim()) return { field: 'password', message: 'La contraseña no puede ser solo espacios.' };
  }
  return null;
}

/**
 * Campo al que se enlaza un error del servidor: al iniciar sesión, «correo o contraseña incorrectos» → contraseña
 * (lo que se vuelve a escribir); al registrarse, el problema típico es el correo (ya registrado o no válido), salvo
 * que el mensaje hable de la contraseña.
 */
export function serverErrorField(message, register) {
  if (/contraseña|password/i.test(String(message || ''))) return 'password';
  return register ? 'email' : 'password';
}
