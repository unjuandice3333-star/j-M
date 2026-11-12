// =============================================================================
// Cupones — tabla public.coupons (RLS: solo admin). La validación y el canje reales los hace la BD (validate_coupon,
// quote_cart y create_order). Este servicio replica en el formulario los CHECK de la tabla para que el admin vea el
// motivo antes de guardar:
//   code ^[A-Z0-9_-]{3,40}$ · percent 1–90 (coupons_percent_range) · fixed > 0 · expires_at > starts_at
//   max_uses / max_uses_per_email NULL o > 0 · min_subtotal >= 0.
// Ejecución 50: corrige dos defectos de la página (ver DECISIONS D29):
//   - al editar, las fechas se mostraban en UTC en un campo datetime-local (hora local) y cada guardado sin cambios
//     las desplazaba el desfase horario (‑5 h en Colombia);
//   - el formulario aceptaba 91–100 % y la BD lo rechazaba con un error genérico de CHECK.
// =============================================================================
import supabase from '../config/supabase';
import { adminError } from './adminService';
import { normalizeText } from '../utils/catalogFilters';

export const PERCENT_MAX = 90;
const CODE_RE = /^[A-Z0-9_-]{3,40}$/;
const MAX_COP = 100_000_000;

export const emptyCouponForm = () => ({
  id: null, code: '', description: '', discount_type: 'percent', discount_value: '10', min_subtotal: '0',
  max_uses: '', max_uses_per_email: '', starts_at: '', expires_at: '', is_active: true,
});

const pad = (n) => String(n).padStart(2, '0');

/** timestamptz → valor de <input type="datetime-local"> en la hora LOCAL del navegador (no UTC). */
export function toLocalInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de datetime-local (hora local) → ISO UTC, o null si está vacío. NaN si no es una fecha válida. */
export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? NaN : d.toISOString();
}

/** Fila de la BD → estado del formulario. */
export const toCouponForm = (c) => ({
  id: c.id, code: c.code, description: c.description ?? '', discount_type: c.discount_type,
  discount_value: String(c.discount_value ?? ''), min_subtotal: String(c.min_subtotal ?? 0),
  max_uses: c.max_uses == null ? '' : String(c.max_uses), max_uses_per_email: c.max_uses_per_email == null ? '' : String(c.max_uses_per_email),
  starts_at: toLocalInput(c.starts_at), expires_at: toLocalInput(c.expires_at), is_active: !!c.is_active,
});

const optPositiveInt = (v) => {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  return /^\d+$/.test(s) ? Number(s) : NaN;
};

/** Valida el formulario y devuelve { errors, row } (row listo para insert/update). */
export function validateCoupon(form) {
  const errors = {};
  const code = String(form.code ?? '').trim().toUpperCase();
  const type = form.discount_type;
  const value = Number(String(form.discount_value ?? '').trim() || NaN);
  const minRaw = String(form.min_subtotal ?? '').trim();
  const min = minRaw === '' ? 0 : (/^\d+$/.test(minRaw) ? Number(minRaw) : NaN);
  const maxUses = optPositiveInt(form.max_uses);
  const maxPerEmail = optPositiveInt(form.max_uses_per_email);
  const startsAt = fromLocalInput(form.starts_at);
  const expiresAt = fromLocalInput(form.expires_at);

  if (!CODE_RE.test(code)) errors.code = 'Código: 3 a 40 caracteres en MAYÚSCULAS, números, guion o guion bajo.';
  if (!['percent', 'fixed', 'free_shipping'].includes(type)) errors.discount_type = 'Tipo de cupón no válido.';
  if (type === 'percent' && !(Number.isInteger(value) && value >= 1 && value <= PERCENT_MAX)) errors.discount_value = `El porcentaje debe estar entre 1 y ${PERCENT_MAX}.`;
  if (type === 'fixed' && !(Number.isInteger(value) && value > 0 && value <= MAX_COP)) errors.discount_value = 'El valor fijo debe ser un valor en pesos mayor que 0.';
  if (!Number.isInteger(min) || min > MAX_COP) errors.min_subtotal = 'La compra mínima debe ser un valor en pesos, sin decimales.';
  if (Number.isNaN(maxUses) || maxUses === 0) errors.max_uses = 'Usos totales: un entero mayor que 0, o vacío para no limitar.';
  if (Number.isNaN(maxPerEmail) || maxPerEmail === 0) errors.max_uses_per_email = 'Usos por correo: un entero mayor que 0, o vacío para no limitar.';
  if (Number.isNaN(startsAt)) errors.starts_at = 'Fecha de inicio no válida.';
  if (Number.isNaN(expiresAt)) errors.expires_at = 'Fecha de fin no válida.';
  else if (startsAt && expiresAt && !Number.isNaN(startsAt) && new Date(expiresAt) <= new Date(startsAt)) errors.expires_at = 'La fecha de fin debe ser posterior a la de inicio.';

  const row = {
    code, description: String(form.description ?? '').trim() || null, discount_type: type,
    discount_value: type === 'free_shipping' ? 0 : (Number.isInteger(value) ? value : 0),
    min_subtotal: Number.isInteger(min) ? min : 0,
    max_uses: Number.isInteger(maxUses) ? maxUses : null, max_uses_per_email: Number.isInteger(maxPerEmail) ? maxPerEmail : null,
    starts_at: typeof startsAt === 'string' ? startsAt : null, expires_at: typeof expiresAt === 'string' ? expiresAt : null,
    is_active: !!form.is_active,
  };
  return { errors, row };
}

/** Estado visible del cupón (para la tabla del panel). */
export function couponState(c, now = new Date()) {
  if (!c.is_active) return { key: 'inactivos', label: 'Inactivo', color: '#52525B' };
  if (c.starts_at && new Date(c.starts_at) > now) return { key: 'programados', label: 'Programado', color: '#1D4ED8' };
  if (c.expires_at && new Date(c.expires_at) <= now) return { key: 'vencidos', label: 'Vencido', color: '#B91C1C' };
  if (c.max_uses && c.used_count >= c.max_uses) return { key: 'agotados', label: 'Agotado', color: '#B91C1C' };
  return { key: 'activos', label: 'Activo', color: '#065F46' };
}

// Filtro de estado de /admin/descuentos (`?estado=`, ejecución 85). Las claves son las de couponState.
export const COUPON_STATUS_FILTERS = [
  ['todos', 'Todos'], ['activos', 'Activos'], ['programados', 'Programados'],
  ['vencidos', 'Vencidos'], ['agotados', 'Agotados'], ['inactivos', 'Inactivos'],
];
/** Valor de `?estado=` → filtro válido; lo desconocido o ausente cae en «todos». */
export const couponStatusFromParam = (v) => (COUPON_STATUS_FILTERS.some(([k]) => k === v) ? v : 'todos');

/** Búsqueda sin tildes/mayúsculas en código y descripción + filtro por estado calculado (couponState). */
export function filterCoupons(rows, query = '', status = 'todos', now = new Date()) {
  const q = normalizeText(query);
  return (rows ?? []).filter((c) => (status === 'todos' || couponState(c, now).key === status)
    && (!q || [c.code, c.description].some((v) => normalizeText(v).includes(q))));
}

// Uso real por cupón (ejecución 86): public.coupon_redemptions (RLS coupon_redemptions_admin_read: solo admin).
// `confirmed` = pedido pagado (es lo que suma coupons.used_count); `reserved` = pedido creado y pago pendiente;
// `released` (pedido cancelado/vencido) no cuenta. Solo lectura, sin migración.
/** Filas de coupon_redemptions → { [coupon_id]: { paid, paidDiscount, pending, pendingDiscount } }. */
export function summarizeRedemptions(rows) {
  const out = {};
  for (const r of rows ?? []) {
    if (r.status !== 'confirmed' && r.status !== 'reserved') continue;
    const u = out[r.coupon_id] ??= { paid: 0, paidDiscount: 0, pending: 0, pendingDiscount: 0 };
    const amount = Number(r.discount_amount) || 0;
    if (r.status === 'confirmed') { u.paid += 1; u.paidDiscount += amount; } else { u.pending += 1; u.pendingDiscount += amount; }
  }
  return out;
}

/** Pedidos pagados o pendientes que usan el cupón (para pedir confirmación antes de desactivarlo). */
export const couponUseCount = (c, usage) => Math.max(Number(c?.used_count) || 0, usage?.paid ?? 0) + (usage?.pending ?? 0);

const notFound = () => Object.assign(new Error('El cupón ya no existe o no tienes permiso para editarlo.'), { hint: 'NOT_FOUND' });

export const couponsAdminService = {
  async list() {
    const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) throw adminError(error, 'No se pudieron cargar los cupones.');
    return data ?? [];
  },

  /** Uso real de cada cupón (ver summarizeRedemptions). */
  async usage() {
    const { data, error } = await supabase.from('coupon_redemptions')
      .select('coupon_id, status, discount_amount').in('status', ['reserved', 'confirmed']);
    if (error) throw adminError(error, 'No se pudo cargar el uso de los cupones.');
    return summarizeRedemptions(data);
  },

  /** Crea (sin id) o actualiza. Devuelve la fila enviada. */
  async save(form) {
    const { errors, row } = validateCoupon(form);
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { hint: 'VALIDATION', errors });
    if (!form.id) {
      const { error } = await supabase.from('coupons').insert(row).select('id').single();
      if (error) throw adminError(error, 'No se pudo crear el cupón.');
    } else {
      const { data, error } = await supabase.from('coupons').update(row).eq('id', form.id).select('id');
      if (error) throw adminError(error, 'No se pudo guardar el cupón.');
      if (!data?.length) throw notFound();
    }
    return row;
  },

  async setActive(id, isActive) {
    const { data, error } = await supabase.from('coupons').update({ is_active: !!isActive }).eq('id', id).select('id');
    if (error) throw adminError(error, 'No se pudo cambiar el estado del cupón.');
    if (!data?.length) throw notFound();
  },
};

export default couponsAdminService;
