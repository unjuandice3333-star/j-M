import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeOpenApi, diagnose, REQUIRED, sanitize } from '../../../../scripts/qa/diagnose_qa_rest.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../scripts/qa/diagnose_qa_rest.mjs');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, iss: 'supabase' })}.${'s'.repeat(30)}`;
const QA_HOST = 'yomgxdjgfjnrjaqiarvw.supabase.co';

// OpenAPI como el de un QA con esquema HEREDADO (M29): sin shipping_methods ni site_content; collections sin kind/subtitle.
const legacySpec = () => {
  const defs = {};
  for (const [t, cols] of Object.entries(REQUIRED)) defs[t] = { properties: Object.fromEntries(cols.map((c) => [c, { type: 'string' }])) };
  delete defs.shipping_methods; delete defs.site_content; delete defs.collection_products;
  defs.collections = { properties: { id: {}, slug: {}, name: {}, image_url: {}, sort_order: {}, is_active: {} } };
  defs.variants.properties.color_id.description = 'Note:\nThis is a Foreign Key to `colors.id`.';
  return { definitions: defs };
};

describe('analyzeOpenApi', () => {
  it('detecta tablas ausentes, columnas ausentes y lee las claves foráneas', () => {
    const a = analyzeOpenApi(legacySpec());
    expect(a.missingTables.sort()).toEqual(['collection_products', 'shipping_methods', 'site_content']);
    expect(a.missingColumns).toEqual({ collections: ['subtitle', 'kind'] });
    expect(a.fks.variants).toEqual(['color_id → colors.id']);
  });
  it('un esquema completo no reporta faltantes', () => {
    const defs = Object.fromEntries(Object.entries(REQUIRED).map(([t, c]) => [t, { properties: Object.fromEntries(c.map((x) => [x, {}])) }]));
    const a = analyzeOpenApi({ definitions: defs });
    expect(a.missingTables).toEqual([]); expect(a.missingColumns).toEqual({});
  });
});

describe('diagnose (fetch simulado, solo GET)', () => {
  const run = async (responses) => {
    const lines = []; const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, method: opts?.method ?? 'GET', headers: opts?.headers });
      const hit = responses.find(([re]) => re.test(url));
      const [, status, body] = hit ?? [null, 200, []];
      return { status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
    };
    const failures = await diagnose({ baseUrl: `https://${QA_HOST}`, key: jwt('anon'), fetchImpl, log: (l) => lines.push(l) });
    return { failures, out: lines.join('\n'), calls };
  };
  it('informa código, mensaje, detalle y significado de cada 404/400 de QA, y no filtra la llave', async () => {
    const { failures, out, calls } = await run([
      [/\/rest\/v1\/$/, 200, legacySpec()],
      [/shipping_methods/, 404, { code: 'PGRST205', message: "Could not find the table 'public.shipping_methods' in the schema cache", details: null, hint: null }],
      [/site_content/, 404, { code: 'PGRST205', message: "Could not find the table 'public.site_content' in the schema cache", details: null, hint: null }],
      [/collections/, 400, { code: 'PGRST200', message: "Could not find a relationship between 'collections' and 'collection_products' in the schema cache", details: "Searched for a foreign key relationship ...", hint: null }],
    ]);
    expect(failures).toBeGreaterThanOrEqual(4);
    expect(out).toMatch(/FALTAN tablas\/vistas requeridas: .*shipping_methods/);
    expect(out).toMatch(/FALLA 404\s+shipping_methods[\s\S]*PGRST205[\s\S]*no existe en el esquema público/);
    expect(out).toMatch(/FALLA 400\s+collections \(look\)[\s\S]*PGRST200[\s\S]*relación/);
    expect(out).not.toContain(jwt('anon'));
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });
  it('con un esquema sano termina sin errores', async () => {
    const defs = Object.fromEntries(Object.entries(REQUIRED).map(([t, c]) => [t, { properties: Object.fromEntries(c.map((x) => [x, {}])) }]));
    const { failures, out } = await run([[/\/rest\/v1\/$/, 200, { definitions: defs }]]);
    expect(failures).toBe(0); expect(out).toMatch(/Todas las tablas\/vistas requeridas existen/);
  });
  it('sanitize elimina JWT y correos de los cuerpos de error', () => {
    expect(sanitize(`fallo ${jwt('anon')} de juan@correo.co`)).toBe('fallo <jwt> de <correo>');
  });
});

describe('guardas del CLI (no hace ninguna petición si no se cumplen)', () => {
  const cli = (env) => spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env }, timeout: 20000 });
  it('sin variables → exit 2', () => expect(cli({}).status).toBe(2));
  it('host que no es el QA permitido (p. ej. otro proyecto/Production) → exit 2', () => {
    const r = cli({ QA_SUPABASE_URL: 'https://pgvffddxwvwmerqvzjth.supabase.co', QA_SUPABASE_ANON_KEY: jwt('anon') });
    expect(r.status).toBe(2); expect(r.stderr).toMatch(/URL rechazada/);
  });
  it('llave service_role → exit 2 y no se imprime', () => {
    const k = jwt('service_role');
    const r = cli({ QA_SUPABASE_URL: `https://${QA_HOST}`, QA_SUPABASE_ANON_KEY: k });
    expect(r.status).toBe(2); expect(r.stderr).toMatch(/no es una llave anon/);
    expect(r.stdout + r.stderr).not.toContain(k);
  });
});
