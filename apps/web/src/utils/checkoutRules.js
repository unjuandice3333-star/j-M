// Reglas de checkout que se ejecutan en el navegador (la BD vuelve a validar todo en create_order).
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Validación del formulario de envío/contacto. Devuelve { campo: mensaje } (vacío si es válido). */
export function validateCheckout(f) {
  const e = {};
  if (f.firstName.trim().length < 2) e.firstName = 'Escribe tu nombre.';
  if (f.lastName.trim().length < 2) e.lastName = 'Escribe tu apellido.';
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Escribe un correo válido.';
  const digits = f.phone.replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) e.phone = 'Escribe un teléfono de 7 a 15 dígitos.';
  if (!f.department) e.department = 'Elige el departamento.';
  if (f.city.trim().length < 2) e.city = 'Escribe la ciudad o municipio.';
  if (f.address.trim().length < 4) e.address = 'Escribe la dirección completa.';
  return e;
}

/**
 * Identidad del contenido del carrito para la clave de idempotencia: mismo carrito + mismo cupón = misma clave
 * (doble clic o reintento devuelven el mismo pedido); cualquier cambio genera un pedido nuevo.
 */
export function cartKeyOf(items, appliedCoupon) {
  return items.map((i) => `${i.variantId}x${i.quantity}`).sort().join(',') + `|${appliedCoupon?.code ?? ''}`;
}
