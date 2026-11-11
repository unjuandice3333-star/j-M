// =============================================================================
// Contraseñas del cliente (ejecución 57, DECISIONS D35): una sola validación y un solo traductor de errores de
// Supabase Auth para «Restablecer contraseña» (/cuenta/restablecer) y «Cambiar contraseña» (Mi cuenta).
// Límites: mínimo 8 (lo que la tienda exige al registrarse) y máximo 72 caracteres (GoTrue rechaza > 72 porque bcrypt
// ignora el resto). Antes cualquier fallo se mostraba como «Solicita un enlace nuevo», también cuando el enlace era
// válido y el problema era una contraseña repetida o débil: el cliente pedía enlaces inútiles.
// =============================================================================

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/** Devuelve el mensaje del primer problema o null si la contraseña nueva es aceptable. */
export function validateNewPassword(password, confirm) {
  const p = String(password ?? '');
  if (p.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (p.length > PASSWORD_MAX) return `La contraseña admite como máximo ${PASSWORD_MAX} caracteres.`;
  if (!p.trim()) return 'La contraseña no puede ser solo espacios.';
  if (p !== String(confirm ?? '')) return 'Las contraseñas no coinciden.';
  return null;
}

/**
 * Error de supabase.auth.updateUser / reauthenticate → { kind, message }.
 * kind: 'same' | 'weak' | 'reauth' (hace falta el código enviado por correo) | 'bad_nonce' | 'session' (sin sesión o
 * enlace vencido) | 'rate' | 'network' | 'unknown'.
 */
export function passwordUpdateError(err) {
  const code = String(err?.code || '');
  const m = String(err?.message || '');
  if (code === 'same_password' || /different from the old password/i.test(m))
    return { kind: 'same', message: 'La contraseña nueva debe ser distinta de la actual.' };
  if (code === 'weak_password' || /password should|weak password|password is known/i.test(m))
    return { kind: 'weak', message: 'La contraseña es demasiado débil o común. Usa al menos 8 caracteres combinando letras y números.' };
  if (code === 'reauthentication_needed' || (/reauthentication/i.test(m) && !/invalid|not valid/i.test(m)))
    return { kind: 'reauth', message: 'Por seguridad te enviamos un código a tu correo. Escríbelo para confirmar el cambio.' };
  if (code === 'reauthentication_not_valid' || /nonce|reauthentication.*(invalid|not valid)/i.test(m))
    return { kind: 'bad_nonce', message: 'El código no es válido o venció. Pide uno nuevo.' };
  if (['session_not_found', 'session_expired', 'refresh_token_not_found', 'bad_jwt', 'no_authorization'].includes(code)
    || err?.name === 'AuthSessionMissingError' || /session missing|session.*(expired|not found)|jwt/i.test(m))
    return { kind: 'session', message: 'Tu sesión o el enlace de recuperación vencieron.' };
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || err?.status === 429 || /rate limit|too many/i.test(m))
    return { kind: 'rate', message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  if (/fetch|network/i.test(m)) return { kind: 'network', message: 'No hay conexión. Revisa tu internet e inténtalo de nuevo.' };
  return { kind: 'unknown', message: 'No se pudo cambiar la contraseña. Inténtalo de nuevo.' };
}

/**
 * Error que Supabase deja en la URL cuando el enlace del correo no sirve (p. ej. #error=access_denied&
 * error_code=otp_expired). Devuelve un mensaje en español o null si la URL no trae error.
 */
export function recoveryLinkError(hash = '', search = '') {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  const q = new URLSearchParams(String(search).replace(/^\?/, ''));
  const error = params.get('error') || q.get('error');
  const code = params.get('error_code') || q.get('error_code');
  if (!error && !code) return null;
  if (code === 'otp_expired') return 'El enlace de recuperación venció o ya se usó. Solicita uno nuevo.';
  return 'El enlace de recuperación no es válido. Solicita uno nuevo.';
}
