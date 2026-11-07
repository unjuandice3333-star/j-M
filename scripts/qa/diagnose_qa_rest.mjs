#!/usr/bin/env node
// =============================================================================
// M36.1 — Diagnóstico de SOLO LECTURA de la API REST de Supabase QA, con la llave PÚBLICA (anon).
// Responde: ¿existen las tablas/columnas/relaciones que consulta la tienda? ¿qué código y mensaje devuelve cada consulta?
// Qué hace: GET /rest/v1/ (OpenAPI de PostgREST: tablas y columnas visibles para anon) y las mismas consultas GET que
// hace la tienda. Nunca escribe, nunca usa service_role, nunca llama a la API de gestión, nunca imprime la llave ni datos.
// Guardas: solo https, solo el host QA listado en config/environments.json (Production se rechaza), llave con rol anon.
// Uso (PowerShell):  $env:QA_SUPABASE_URL="https://<ref>.supabase.co"; $env:QA_SUPABASE_ANON_KEY="<anon>"; node scripts/qa/diagnose_qa_rest.mjs
// Salida: 0 sin errores · 1 hay errores en las consultas o faltan objetos · 2 uso/guardas
// =============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, isSupabaseUrlAllowed } from '../env/environments.mjs';
import { jwtRole } from '../../apps/web/src/config/clientConfig.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Objetos que la tienda necesita (contrato del baseline M24): tabla/vista → columnas consultadas. */
export const REQUIRED = {
  products: ['id', 'reference', 'slug', 'name', 'description', 'details', 'fit', 'fit_description', 'base_price', 'compare_at_price', 'status', 'is_featured_new', 'is_bestseller', 'published_at', 'created_at'],
  categories: ['id', 'slug', 'name', 'size_group'],
  style_lines: ['id', 'slug', 'name'],
  brands: ['id', 'name'],
  colors: ['id', 'slug', 'name', 'hex_code'],
  sizes: ['code', 'sort_order'],
  product_colors: ['color_id', 'position', 'is_default'],
  product_images: ['id', 'color_id', 'storage_path', 'external_url', 'alt_text', 'position'],
  variants: ['id', 'sku', 'color_id', 'price_override', 'is_active'],
  product_occasions: [],
  v_variant_availability: ['variant_id', 'product_id', 'available'],
  v_product_rating: ['product_id', 'rating', 'review_count'],
  shipping_methods: ['code', 'name', 'cost', 'free_over_subtotal', 'eta_text', 'is_active', 'sort_order'],
  site_content: ['key', 'image_url', 'storage_path', 'alt_text', 'title', 'body', 'updated_at'],
  collections: ['slug', 'name', 'subtitle', 'image_url', 'kind', 'is_active', 'sort_order'],
  collection_products: ['product_id', 'position'],
};

/** Consultas GET idénticas a las de la tienda (productService, orderService, siteContentService, CompleteTheLook). */
export const APP_QUERIES = [
  ['products (catálogo)', 'products?select=id,reference,slug,name,description,details,fit,fit_description,base_price,compare_at_price,status,is_featured_new,is_bestseller,published_at,created_at,categories(id,slug,name,size_group),style_lines(id,slug,name),brands(id,name),product_colors(color_id,position,is_default,colors(id,slug,name,hex_code)),product_images(id,color_id,storage_path,external_url,alt_text,position),variants(id,sku,color_id,price_override,is_active,sizes(code,sort_order)),product_occasions(occasions(slug,name))&status=eq.active&limit=1'],
  ['v_variant_availability', 'v_variant_availability?select=variant_id,available&limit=1'],
  ['v_product_rating', 'v_product_rating?select=product_id,rating,review_count&limit=1'],
  ['shipping_methods', 'shipping_methods?select=code,name,cost,free_over_subtotal,eta_text&is_active=eq.true&order=sort_order&limit=1'],
  ['site_content', 'site_content?select=key,image_url,storage_path,alt_text,title,body,updated_at&limit=1'],
  ['collections (look)', 'collections?select=slug,name,subtitle,image_url,collection_products(product_id,position)&kind=eq.look&is_active=eq.true&order=sort_order&limit=1'],
];

const EXPLAIN = {
  PGRST205: 'la tabla/vista no existe en el esquema público',
  PGRST200: 'no existe la relación (clave foránea) pedida en el select embebido',
  PGRST204: 'una columna no existe',
  '42703': 'una columna del select/filtro no existe',
  '42P01': 'la tabla no existe',
  '42501': 'permiso denegado (RLS/GRANT)',
};

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g;
export const sanitize = (t) => String(t ?? '').replace(JWT, '<jwt>').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<correo>').replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, '<llave>');

/** Compara el OpenAPI de PostgREST con REQUIRED: tablas ausentes y columnas ausentes por tabla. */
export function analyzeOpenApi(spec, required = REQUIRED) {
  const defs = spec?.definitions ?? spec?.components?.schemas ?? {};
  const present = {}; const missingTables = []; const missingColumns = {};
  for (const [table, cols] of Object.entries(required)) {
    const d = defs[table];
    if (!d) { missingTables.push(table); continue; }
    const have = Object.keys(d.properties ?? {});
    present[table] = have;
    const miss = cols.filter((c) => !have.includes(c));
    if (miss.length) missingColumns[table] = miss;
  }
  // Relaciones: PostgREST anota las claves foráneas en la descripción de la columna («Note: This is a Foreign Key to `t.c`.»)
  const fks = {};
  for (const [table, d] of Object.entries(defs)) {
    for (const [col, p] of Object.entries(d.properties ?? {})) {
      const m = /Foreign Key to `([^`]+)`/.exec(p?.description ?? '');
      if (m) (fks[table] ??= []).push(`${col} → ${m[1]}`);
    }
  }
  return { present, missingTables, missingColumns, fks, exposedTables: Object.keys(defs) };
}

async function getJson(url, key, fetchImpl) {
  const res = await fetchImpl(url, { headers: { apikey: key, authorization: `Bearer ${key}`, accept: 'application/json' } });
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch { /* no JSON */ }
  return { status: res.status, body, text };
}

export async function diagnose({ baseUrl, key, fetchImpl = fetch, log = console.log }) {
  let failures = 0;
  log(`Proyecto QA: ${new URL(baseUrl).hostname}  (solo lectura; llave anon, no se imprime)\n`);
  log('== 1. Objetos expuestos por la API (OpenAPI de PostgREST) ==');
  const root = await getJson(`${baseUrl}/rest/v1/`, key, fetchImpl);
  if (root.status === 200 && root.body) {
    const a = analyzeOpenApi(root.body);
    log(`Tablas/vistas visibles para anon: ${a.exposedTables.length}`);
    log(a.missingTables.length ? `FALTAN tablas/vistas requeridas: ${a.missingTables.join(', ')}` : 'Todas las tablas/vistas requeridas existen');
    for (const [t, cols] of Object.entries(a.missingColumns)) log(`FALTAN columnas en ${t}: ${cols.join(', ')}`);
    for (const t of ['collections', 'collection_products', 'product_images', 'product_colors']) if (a.fks[t]) log(`Claves foráneas visibles en ${t}: ${a.fks[t].join('; ')}`);
    if (a.missingTables.length || Object.keys(a.missingColumns).length) failures++;
  } else log(`No se pudo leer el OpenAPI (HTTP ${root.status}): ${sanitize(root.text).slice(0, 200)}`), failures++;
  log('\n== 2. Consultas GET de la tienda ==');
  for (const [label, q] of APP_QUERIES) {
    const r = await getJson(`${baseUrl}/rest/v1/${q}`, key, fetchImpl);
    if (r.status < 400) { log(`OK   ${r.status}  ${label}`); continue; }
    failures++;
    const b = r.body ?? {};
    log(`FALLA ${r.status}  ${label}`);
    log(`      código: ${b.code ?? '—'}${EXPLAIN[b.code] ? `  (${EXPLAIN[b.code]})` : ''}`);
    log(`      mensaje: ${sanitize(b.message ?? r.text).slice(0, 300)}`);
    if (b.details) log(`      detalle: ${sanitize(typeof b.details === 'string' ? b.details : JSON.stringify(b.details)).slice(0, 300)}`);
    if (b.hint) log(`      pista: ${sanitize(b.hint).slice(0, 200)}`);
  }
  return failures;
}

// --- CLI ---------------------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const url = process.env.QA_SUPABASE_URL; const key = process.env.QA_SUPABASE_ANON_KEY;
  if (!url || !key) { console.error('Faltan QA_SUPABASE_URL y/o QA_SUPABASE_ANON_KEY (variables de entorno; no se aceptan por argumento).'); process.exit(2); }
  const cfg = loadConfig(path.join(ROOT, 'config/environments.json'));
  const allowed = isSupabaseUrlAllowed(cfg, 'qa', url.replace(/\/+$/, ''));
  if (!allowed.ok) { console.error(`URL rechazada: ${allowed.error}. Solo se admite el host de QA de config/environments.json.`); process.exit(2); }
  if (jwtRole(key) !== 'anon') { console.error('La llave no es una llave anon (rol distinto o ilegible): se rechaza. Esta herramienta nunca usa service_role.'); process.exit(2); }
  const failures = await diagnose({ baseUrl: url.replace(/\/+$/, ''), key });
  console.log(`\nResultado: ${failures === 0 ? 'sin errores' : `${failures} bloque(s) con errores`}`);
  process.exit(failures === 0 ? 0 : 1);
}
