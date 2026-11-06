// M26-T1 — Pruebas del validador de entornos (node --test scripts/env/).
// Los hosts con forma de proyecto real se construyen en tiempo de ejecución (ninguna referencia real se versiona).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig, isSupabaseUrlAllowed, isWompiPublicKeyAllowed, loadConfig } from './environments.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, 'environments.mjs');
const REPO_CONFIG = path.resolve(HERE, '../../config/environments.json');
const SB = '.supa' + 'base.co';
const qaRef = 'q'.repeat(20);
const otherRef = 'p'.repeat(20);
const QA_HOST = qaRef + SB;
const OTHER_HOST = otherRef + SB;

const base = () => structuredClone(loadConfig(REPO_CONFIG));
const withQa = (...hosts) => { const c = base(); c.environments.qa.supabase.allowed_hosts = hosts; return c; };
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
const tmpJson = (obj) => { const d = mkdtempSync(path.join(tmpdir(), 'jm-env-')); const f = path.join(d, 'c.json'); writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };

// ---------------------------------------------------------------- configuración
test('positivo: la configuración versionada es válida', () => {
  assert.deepEqual(validateConfig(base()), []);
});

test('positivo: qa con un host <ref>.supabase.co es válido', () => {
  assert.deepEqual(validateConfig(withQa(QA_HOST)), []);
});

test('negativo: una entrada "production" se rechaza', () => {
  const c = base(); c.environments.production = structuredClone(c.environments.qa);
  assert.ok(validateConfig(c).some((e) => e.includes('"production" no permitido')));
});

test('negativo: cualquier entorno distinto de local/qa se rechaza', () => {
  const c = base(); c.environments.staging = structuredClone(c.environments.qa);
  assert.ok(validateConfig(c).some((e) => e.includes('"staging" no permitido')));
});

test('negativo: faltan entornos obligatorios o la versión', () => {
  const c = base(); delete c.environments.local; c.version = 2;
  const errs = validateConfig(c);
  assert.ok(errs.includes('version debe ser 1'));
  assert.ok(errs.includes('falta el entorno "local"'));
  assert.deepEqual(validateConfig(null), ['la configuración debe ser un objeto JSON']);
});

test('negativo: local solo admite loopback y no puede quedar vacío', () => {
  const c = base(); c.environments.local.supabase.allowed_hosts = ['example.com'];
  assert.ok(validateConfig(c).some((e) => e.includes('solo se admiten hosts de loopback')));
  c.environments.local.supabase.allowed_hosts = [];
  assert.ok(validateConfig(c).some((e) => e.includes('no puede estar vacío en local')));
});

test('negativo: hosts de qa con comodín, ruta, puerto, mayúsculas, duplicados o forma incorrecta', () => {
  for (const bad of ['*' + SB, QA_HOST + '/x', QA_HOST + ':443', QA_HOST.toUpperCase(), 'abc' + SB, 'example.com']) {
    assert.ok(validateConfig(withQa(bad)).length > 0, `debería rechazar la variante ${bad.length}`);
  }
  assert.ok(validateConfig(withQa(QA_HOST, QA_HOST)).some((e) => e.includes('duplicado')));
});

test('negativo: qa no admite http', () => {
  const c = withQa(QA_HOST); c.environments.qa.supabase.allowed_protocols = ['http'];
  assert.ok(validateConfig(c).some((e) => e.includes('protocolo no permitido en qa')));
});

test('negativo: Wompi fuera de sandbox o con prefijo de producción', () => {
  const c = base(); c.environments.qa.wompi.mode = 'production'; c.environments.local.wompi.public_key_prefix = 'pub_prod_';
  const errs = validateConfig(c);
  assert.ok(errs.some((e) => e.includes('qa.wompi.mode')));
  assert.ok(errs.some((e) => e.includes('local.wompi.public_key_prefix')));
});

// ------------------------------------------------------------- URL de Supabase
test('positivo: URLs permitidas', () => {
  assert.equal(isSupabaseUrlAllowed(base(), 'local', 'http://127.0.0.1:54321').ok, true);
  assert.equal(isSupabaseUrlAllowed(base(), 'local', 'http://localhost:54321/').ok, true);
  assert.equal(isSupabaseUrlAllowed(withQa(QA_HOST), 'qa', 'https://' + QA_HOST).ok, true);
});

test('negativo: QA sin configurar rechaza toda URL', () => {
  const r = isSupabaseUrlAllowed(base(), 'qa', 'https://' + QA_HOST);
  assert.equal(r.ok, false); assert.match(r.error, /aún no ha configurado/);
});

test('negativo: un proyecto no listado (p. ej. Production) se rechaza en qa y en local', () => {
  assert.equal(isSupabaseUrlAllowed(withQa(QA_HOST), 'qa', 'https://' + OTHER_HOST).ok, false);
  assert.equal(isSupabaseUrlAllowed(base(), 'local', 'https://' + OTHER_HOST).ok, false);
});

test('negativo: entorno production o desconocido', () => {
  assert.match(isSupabaseUrlAllowed(base(), 'production', 'https://' + OTHER_HOST).error, /no permitido/);
  assert.equal(isSupabaseUrlAllowed(base(), undefined, 'http://127.0.0.1:54321').ok, false);
});

test('negativo: URL vacía, inválida, con credenciales, ruta, consulta o protocolo erróneo', () => {
  const c = withQa(QA_HOST);
  for (const bad of ['', '   ', 'no-es-url', 'https://u:p@' + QA_HOST, 'https://' + QA_HOST + '/rest/v1', 'https://' + QA_HOST + '/?x=1', 'http://' + QA_HOST]) {
    assert.equal(isSupabaseUrlAllowed(c, 'qa', bad).ok, false);
  }
  assert.equal(isSupabaseUrlAllowed(c, 'qa', undefined).ok, false);
});

test('seguridad: los errores nunca incluyen la URL ni el host recibidos', () => {
  const c = withQa(QA_HOST);
  for (const url of ['https://' + OTHER_HOST, 'https://usuario:clave@' + OTHER_HOST, 'http://' + QA_HOST]) {
    const r = isSupabaseUrlAllowed(c, 'qa', url);
    assert.equal(r.ok, false);
    assert.ok(!r.error.includes(otherRef) && !r.error.includes(qaRef) && !r.error.includes('clave'), 'el mensaje filtra el valor');
  }
});

// ------------------------------------------------------------------- Wompi
test('positivo y negativo: llave pública de Wompi', () => {
  const key = 'pub_' + 'test_' + 'x'.repeat(24);
  assert.equal(isWompiPublicKeyAllowed(base(), 'qa', key).ok, true);
  const prodKey = 'pub_' + 'prod_' + 'y'.repeat(24);
  const r = isWompiPublicKeyAllowed(base(), 'local', prodKey);
  assert.equal(r.ok, false);
  assert.ok(!r.error.includes('y'.repeat(24)), 'el mensaje filtra la llave');
  assert.equal(isWompiPublicKeyAllowed(base(), 'qa', '').ok, false);
  assert.equal(isWompiPublicKeyAllowed(base(), 'qa', undefined).ok, false);
});

// --------------------------------------------------------------------- CLI
test('CLI: la configuración versionada pasa (exit 0)', () => {
  const r = cli('validate-config');
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /OK/);
});

test('CLI: una configuración con production falla (exit 1)', () => {
  const c = base(); c.environments.production = structuredClone(c.environments.qa);
  const r = cli('validate-config', tmpJson(c));
  assert.equal(r.status, 1); assert.match(r.stderr, /production/);
});

test('CLI: un archivo ilegible o JSON inválido falla (exit 2) y un comando desconocido también', () => {
  assert.equal(cli('validate-config', tmpJson('{no json')).status, 2);
  assert.equal(cli('validate-config', path.join(tmpdir(), 'no-existe-jm.json')).status, 2);
  assert.equal(cli('otro').status, 2);
});
