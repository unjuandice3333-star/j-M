// M28 — Contenido editorial de la portada persistido en la BD.
// Tabla public.site_content (lectura pública; escritura solo admin por RLS) + bucket público `site-content`
// (subida/borrado solo admin por las políticas de storage.objects). Sin respaldo en localStorage.
import supabase from '../config/supabase';
import { getClientConfig } from '../config/runtimeConfig.js';
import { adminError } from './adminService';

export const SITE_CONTENT_BUCKET = 'site-content';
const LIBRARY_FOLDER = 'library';
const MAX_BYTES = 5 * 1024 * 1024; // igual que file_size_limit del bucket
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export const publicUrl = (storagePath) =>
  `${getClientConfig().supabase.url}/storage/v1/object/public/${SITE_CONTENT_BUCKET}/${storagePath}`;

/** URL efectiva de una fila: el archivo de Storage tiene prioridad sobre una URL externa. */
export const rowUrl = (row) => (row?.storage_path ? publicUrl(row.storage_path) : row?.image_url || null);

export function validateImageFile(file) {
  if (!file) return 'Selecciona un archivo.';
  if (!ALLOWED.includes(file.type)) return 'Formato no admitido. Usa JPG, PNG, WEBP o AVIF.';
  if (file.size > MAX_BYTES) return 'La imagen no debe superar 5 MB.';
  return null;
}

export const siteContentService = {
  /** Todas las entradas: { [key]: { url, alt, title, body, storagePath, updatedAt } }. */
  async getAll() {
    const { data, error } = await supabase.from('site_content')
      .select('key, image_url, storage_path, alt_text, title, body, updated_at');
    if (error) throw new Error('No se pudo cargar el contenido de la portada.', { cause: error });
    return Object.fromEntries(data.map((r) => [r.key, {
      url: rowUrl(r), alt: r.alt_text, title: r.title, body: r.body, storagePath: r.storage_path, updatedAt: r.updated_at,
    }]));
  },

  /** Sube un archivo a la biblioteca del bucket y devuelve su ruta. */
  async uploadToLibrary(file) {
    const invalid = validateImageFile(file);
    if (invalid) throw new Error(invalid);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${LIBRARY_FOLDER}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(SITE_CONTENT_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw adminError(error, 'No se pudo subir la imagen.');
    return path;
  },

  /** Archivos de la biblioteca (más recientes primero). */
  async listLibrary() {
    const { data, error } = await supabase.storage.from(SITE_CONTENT_BUCKET)
      .list(LIBRARY_FOLDER, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
    if (error) throw adminError(error, 'No se pudo cargar la biblioteca.');
    return data.filter((f) => f.id && f.name !== '.emptyFolderPlaceholder').map((f) => ({
      path: `${LIBRARY_FOLDER}/${f.name}`, url: publicUrl(`${LIBRARY_FOLDER}/${f.name}`), name: f.name,
      createdAt: f.created_at, size: f.metadata?.size ?? null,
    }));
  },

  /**
   * Asigna una imagen a una clave de la portada. Exactamente una fuente: `storagePath` (archivo del bucket)
   * o `externalUrl` (https). Upsert por clave; RLS exige admin.
   */
  async setImage(key, { storagePath = null, externalUrl = null, alt = null }, userId) {
    if (!/^[a-z0-9_]+$/.test(key)) throw new Error('Clave de contenido inválida.');
    if (!storagePath && !externalUrl) throw new Error('Elige una imagen.');
    if (externalUrl && !/^https:\/\/\S+$/i.test(externalUrl)) throw new Error('La URL debe empezar por https://');
    const { error } = await supabase.from('site_content').upsert({
      key, storage_path: storagePath, image_url: storagePath ? null : externalUrl, alt_text: alt?.trim() || null,
      updated_by: userId ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    if (error) throw adminError(error, 'No se pudo guardar la imagen.');
  },

  /** Vuelve a la imagen por defecto del diseño (borra la fila; el archivo queda en la biblioteca). */
  async reset(key) {
    const { data, error } = await supabase.from('site_content').delete().eq('key', key).select('key');
    if (error) throw adminError(error, 'No se pudo restaurar la imagen.');
    // RLS no devuelve error si no autoriza el borrado: simplemente no borra filas.
    if (!data?.length) throw new Error('No se restauró: la imagen ya era la original o no tienes permisos.');
  },
};

export default siteContentService;
