// Ejecución 109 (D80): errores de formulario accesibles, compartidos por los formularios del admin.
// Cada control con error queda enlazado a su mensaje (aria-invalid + aria-describedby) y, al enviar, el foco va al
// primer control con error en el orden visual del formulario. El control se localiza por data-field DENTRO del propio
// <form> (no por id global), igual que «Mi cuenta» y el checkout (D78/D79).

export const errorId = (prefix, key) => `${prefix}-${key}-error`;

/** Atributos para el control `key`: aria-invalid siempre, aria-describedby solo mientras hay error. */
export const fieldA11y = (errors, prefix, key) => (errors?.[key]
  ? { 'data-field': key, 'aria-invalid': true, 'aria-describedby': errorId(prefix, key) }
  : { 'data-field': key, 'aria-invalid': false });

/** Primer campo de `order` con error (o null). */
export const firstErrorKey = (order, errors) => order.find((k) => errors?.[k]) ?? null;

/** Lleva el foco al primer control con error dentro de `root`. Devuelve la clave enfocada o null. */
export const focusFirstError = (root, order, errors) => {
  const key = firstErrorKey(order, errors);
  if (!key || !root) return null;
  const el = root.querySelector(`[data-field="${key}"]`);
  if (!el || el.disabled) return null;
  el.focus();
  return key;
};

/** Para un botón que representa un grupo (colores, tallas): sin aria-invalid (no válido en role=button). */
export const groupA11y = (errors, prefix, key) => (errors?.[key]
  ? { 'data-field': key, 'aria-describedby': errorId(prefix, key) }
  : { 'data-field': key });
