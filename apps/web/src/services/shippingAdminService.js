// =============================================================================
// Métodos y tarifas de envío — tabla public.shipping_methods (RLS: lectura pública de los activos, escritura solo
// admin; ver baseline M24). El costo real del pedido lo calcula la BD (private.shipping_cost) en quote_cart y
// create_order, así que cambiar aquí la tarifa o el umbral de envío gratis afecta de inmediato a los nuevos pedidos.
// El checkout usa siempre el método 'standard': por eso no se puede desactivar.
// No hay borrado: los pedidos referencian el código (FK); un método que ya no se usa se desactiva.
// =============================================================================
import supabase from '../config/supabase';
import { adminError } from './adminService';

export const CHECKOUT_METHOD = 'standard';
const CODE_RE = /^[a-z_]+$/;
const MAX_COP = 100_000_000;

export const emptyShippingMethod = () => ({
  isNew: true, code: '', name: '', cost: '', free_over_subtotal: '', eta_text: '', is_active: false, sort_order: '0',
});

/** Fila de la BD → estado del formulario. */
export const toShippingForm = (m) => ({
  isNew: false, code: m.code, name: m.name, cost: String(m.cost ?? ''), free_over_subtotal: m.free_over_subtotal == null ? '' : String(m.free_over_subtotal),
  eta_text: m.eta_text ?? '', is_active: !!m.is_active, sort_order: String(m.sort_order ?? 0),
});

/** Pesos colombianos enteros: admite «15.000», «15000» o «$ 15.000». Devuelve NaN si no es válido. */
export function parseCOP(value) {
  const s = String(value ?? '').replace(/[\s$]/g, '').replace(/\./g, '');
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

/** Valida el formulario y devuelve { errors, row } (row listo para insert/update). */
export function validateShippingMethod(form) {
  const errors = {};
  const code = String(form.code ?? '').trim();
  const name = String(form.name ?? '').trim();
  const cost = parseCOP(form.cost);
  const freeRaw = String(form.free_over_subtotal ?? '').trim();
  const freeOver = freeRaw === '' ? null : parseCOP(freeRaw);
  const sort = String(form.sort_order ?? '0').trim() === '' ? 0 : Number(form.sort_order);
  const active = !!form.is_active;

  if (!CODE_RE.test(code) || code.length > 40) errors.code = 'Código: solo minúsculas y guion bajo (máx. 40), p. ej. «express».';
  if (!name) errors.name = 'El nombre es obligatorio.';
  else if (name.length > 120) errors.name = 'El nombre admite como máximo 120 caracteres.';
  if (!Number.isInteger(cost) || cost > MAX_COP) errors.cost = 'La tarifa debe ser un valor en pesos, sin decimales.';
  else if (active && cost <= 0) errors.cost = 'Un método activo necesita una tarifa mayor que 0 (usa el umbral o un cupón para envío gratis).';
  if (freeOver !== null && (!Number.isInteger(freeOver) || freeOver <= 0 || freeOver > MAX_COP)) errors.free_over_subtotal = 'El umbral debe ser un valor en pesos mayor que 0, o vacío para no ofrecer envío gratis.';
  if (String(form.eta_text ?? '').trim().length > 120) errors.eta_text = 'El tiempo de entrega admite como máximo 120 caracteres.';
  if (!Number.isInteger(sort) || sort < 0 || sort > 9999) errors.sort_order = 'El orden debe ser un entero entre 0 y 9999.';
  if (code === CHECKOUT_METHOD && !active) errors.is_active = 'El método «standard» es el que usa el checkout: no se puede desactivar.';

  const row = {
    code, name, cost: Number.isInteger(cost) ? cost : 0, free_over_subtotal: Number.isInteger(freeOver) ? freeOver : null,
    eta_text: String(form.eta_text ?? '').trim() || null, is_active: active, sort_order: Number.isInteger(sort) ? sort : 0,
  };
  return { errors, row };
}

export const shippingAdminService = {
  async list() {
    const { data, error } = await supabase.from('shipping_methods')
      .select('code, name, cost, free_over_subtotal, eta_text, is_active, sort_order').order('sort_order').order('code');
    if (error) throw adminError(error, 'No se pudieron cargar los métodos de envío.');
    return (data ?? []).map((m) => ({ ...m, cost: Number(m.cost), free_over_subtotal: m.free_over_subtotal == null ? null : Number(m.free_over_subtotal) }));
  },

  /** Crea (isNew) o actualiza por código. El código no se cambia una vez creado (lo referencian los pedidos). */
  async save(form) {
    const { errors, row } = validateShippingMethod(form);
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { hint: 'VALIDATION', errors });
    if (form.isNew) {
      const { error } = await supabase.from('shipping_methods').insert(row).select('code').single();
      if (error) throw adminError(error, 'No se pudo crear el método de envío.');
    } else {
      const { code, ...patch } = row;
      const { data, error } = await supabase.from('shipping_methods').update(patch).eq('code', code).select('code');
      if (error) throw adminError(error, 'No se pudo guardar el método de envío.');
      if (!data?.length) throw Object.assign(new Error('El método de envío ya no existe o no tienes permiso para editarlo.'), { hint: 'NOT_FOUND' });
    }
    return row;
  },
};

export default shippingAdminService;
