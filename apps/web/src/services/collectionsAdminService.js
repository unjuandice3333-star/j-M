// =============================================================================
// Colecciones y looks — tablas public.collections y public.collection_products (RLS: lectura pública de las activas,
// escritura solo admin; ver baseline M24). La tienda usa kind = 'look' en «Completa el look» (CompleteTheLook).
// Antes el panel mostraba ocasiones simuladas con botones sin acción.
// =============================================================================
import supabase from '../config/supabase';
import { adminError, slugify } from './adminService';

export const COLLECTION_KINDS = { collection: 'Colección', look: 'Look («Completa el look»)' };

export const emptyCollection = () => ({
  id: null, slug: '', slugTouched: false, name: '', subtitle: '', image_url: '', kind: 'collection', is_active: true, sort_order: '0', productIds: [],
});

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Valida el formulario y devuelve { errors, row } (row listo para insert/update, sin id). */
export function validateCollection(form) {
  const errors = {};
  const name = String(form.name ?? '').trim();
  const slug = String(form.slug ?? '').trim() || slugify(name);
  const image = String(form.image_url ?? '').trim();
  const sort = String(form.sort_order ?? '0').trim() === '' ? 0 : Number(form.sort_order);
  if (!name) errors.name = 'El nombre es obligatorio.';
  else if (name.length > 120) errors.name = 'El nombre admite como máximo 120 caracteres.';
  if (!SLUG_RE.test(slug)) errors.slug = 'Slug: minúsculas, números y guiones (sin guion al inicio o al final).';
  if (!Object.prototype.hasOwnProperty.call(COLLECTION_KINDS, form.kind)) errors.kind = 'Tipo no válido.';
  if (image && !/^https:\/\/\S+$/i.test(image)) errors.image_url = 'La imagen debe ser una URL https.';
  if (!Number.isInteger(sort) || sort < 0 || sort > 9999) errors.sort_order = 'El orden debe ser un entero entre 0 y 9999.';
  const ids = form.productIds ?? [];
  if (new Set(ids).size !== ids.length) errors.products = 'Hay productos repetidos.';
  if (form.kind === 'look' && form.is_active && ids.length < 2) errors.products = 'Un look activo necesita al menos 2 productos.';
  const row = {
    slug, name, subtitle: String(form.subtitle ?? '').trim() || null, image_url: image || null,
    kind: form.kind, is_active: !!form.is_active, sort_order: Number.isInteger(sort) ? sort : 0,
  };
  return { errors, row };
}

/** Fila de la BD → estado del formulario. */
export function toCollectionForm(c) {
  return {
    id: c.id, slug: c.slug, slugTouched: true, name: c.name, subtitle: c.subtitle ?? '', image_url: c.image_url ?? '', kind: c.kind,
    is_active: c.is_active, sort_order: String(c.sort_order ?? 0),
    productIds: [...(c.collection_products ?? [])].sort((a, b) => a.position - b.position).map((cp) => cp.product_id),
  };
}

export const collectionsAdminService = {
  async list() {
    const { data, error } = await supabase.from('collections')
      .select('id, slug, name, subtitle, image_url, kind, is_active, sort_order, collection_products ( product_id, position )')
      .order('sort_order').order('name');
    if (error) throw adminError(error, 'No se pudieron cargar las colecciones.');
    return data ?? [];
  },

  /** Productos elegibles (cualquier estado; la tienda solo muestra los publicados). */
  async listProducts() {
    const { data, error } = await supabase.from('products').select('id, name, reference, status').order('name');
    if (error) throw adminError(error, 'No se pudieron cargar los productos.');
    return data ?? [];
  },

  /** Crea o actualiza la colección y sincroniza sus productos en el orden dado. Devuelve el id. */
  async save(form) {
    const { errors, row } = validateCollection(form);
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { hint: 'VALIDATION', errors });
    let id = form.id;
    if (id) {
      const { error } = await supabase.from('collections').update(row).eq('id', id);
      if (error) throw adminError(error, 'No se pudo guardar la colección.');
    } else {
      const { data, error } = await supabase.from('collections').insert(row).select('id').single();
      if (error) throw adminError(error, 'No se pudo crear la colección.');
      id = data.id;
    }
    const ids = form.productIds ?? [];
    let del = supabase.from('collection_products').delete().eq('collection_id', id);
    if (ids.length) del = del.not('product_id', 'in', `(${ids.join(',')})`);
    const { error: delError } = await del;
    if (delError) throw adminError(delError, 'No se pudieron actualizar los productos de la colección.');
    if (ids.length) {
      const rows = ids.map((product_id, position) => ({ collection_id: id, product_id, position }));
      const { error } = await supabase.from('collection_products').upsert(rows, { onConflict: 'collection_id,product_id' });
      if (error) throw adminError(error, 'No se pudieron actualizar los productos de la colección.');
    }
    return id;
  },

  async remove(id) {
    const { error } = await supabase.from('collections').delete().eq('id', id);
    if (error) throw adminError(error, 'No se pudo eliminar la colección.');
  },
};

export default collectionsAdminService;
