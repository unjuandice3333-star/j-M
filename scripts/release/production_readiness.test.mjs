// M26-R1 (MAJ-5) — Pruebas de la condición previa de preparación de Production (sin acceso a Vercel ni Supabase).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DECLARATION, requiredFromCode, fingerprint, checkDeclaration } from './production_readiness.mjs';

const CLI = path.join(path.dirname(DECLARATION), '../scripts/release/production_readiness.mjs');
const versioned = () => JSON.parse(readFileSync(DECLARATION, 'utf8'));
const req = requiredFromCode();
const confirmed = (over = {}) => ({ ...versioned(), owner_confirmation: { confirmed: true, confirmed_by: 'Propietario', confirmed_on: '2026-01-15', fingerprint: fingerprint(req), ...over } });
const has = (errs, re) => errs.some((e) => re.test(e));
const cli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
const withFile = (obj, fn) => { const d = mkdtempSync(path.join(tmpdir(), 'jm-ready-')); const f = path.join(d, 'd.json'); writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); try { return fn(f); } finally { rmSync(d, { recursive: true, force: true }); } };

test('el código exige APP_ENV y VITE_APP_ENV (Vercel) y APP_ENV + WOMPI_EVENTS_SECRET (Edge)', () => {
  for (const n of ['APP_ENV', 'VITE_APP_ENV', 'SUPABASE_URL', 'WOMPI_PUBLIC_KEY', 'VITE_WOMPI_ENV']) assert.ok(req.vercel.includes(n), n);
  assert.deepEqual(req.supabase_edge, ['APP_ENV', 'WOMPI_EVENTS_SECRET']);
});
test('positivo: la declaración versionada está sincronizada con el código (validate)', () => {
  assert.deepEqual(checkDeclaration(versioned(), 'validate'), []);
});
test('negativo: la declaración versionada NO está confirmada → main bloqueado', () => {
  const errs = checkDeclaration(versioned(), 'main');
  assert.ok(has(errs, /confirmed: el propietario no ha confirmado/));
  assert.ok(has(errs, /fingerprint/));
});
test('positivo: confirmada, con fecha pasada y huella vigente → main permitido', () => {
  assert.deepEqual(checkDeclaration(confirmed(), 'main', { today: '2026-11-06' }), []);
});
test('negativo: confirmación caducada si el código pasa a exigir otra variable', () => {
  const req2 = requiredFromCode("get('APP_ENV') get('WOMPI_EVENTS_SECRET') get('NUEVO_SECRETO')");
  const errs = checkDeclaration(confirmed(), 'main', { req: req2, today: '2026-11-06' });
  assert.ok(has(errs, /el código exige y la declaración no nombra: NUEVO_SECRETO/));
  assert.ok(has(errs, /fingerprint: la confirmación no corresponde/));
});
test('negativo: falta una variable, sobra otra o se duplica', () => {
  const d = versioned();
  d.targets.vercel.variables = d.targets.vercel.variables.filter((v) => v.name !== 'APP_ENV');
  d.targets.vercel.variables.push({ name: 'VITE_GA4_TRACKING_ID' }, { name: 'SUPABASE_URL' });
  const errs = checkDeclaration(d, 'validate');
  assert.ok(has(errs, /no nombra: APP_ENV/)); assert.ok(has(errs, /no exige: VITE_GA4_TRACKING_ID/)); assert.ok(has(errs, /duplicadas SUPABASE_URL/));
});
test('negativo: APP_ENV/VITE_APP_ENV con un valor esperado distinto de production', () => {
  const d = versioned(); d.targets.vercel.variables.find((v) => v.name === 'VITE_APP_ENV').expected = 'qa';
  assert.ok(has(checkDeclaration(d, 'validate'), /VITE_APP_ENV: expected debe ser "production"/));
  const e = versioned(); delete e.targets.supabase_edge.variables.find((v) => v.name === 'APP_ENV').expected;
  assert.ok(has(checkDeclaration(e, 'validate'), /supabase_edge\.APP_ENV: expected/));
});
test('seguridad: la declaración no admite valores y los mensajes no los muestran', () => {
  const secret = ['prod_', 'events_', 'Z'.repeat(24)].join('');
  const d = versioned(); d.targets.supabase_edge.variables.find((v) => v.name === 'WOMPI_EVENTS_SECRET').value = secret;
  d.targets.vercel.variables.find((v) => v.name === 'SUPABASE_URL').expected = 'https://x';
  const errs = checkDeclaration(d, 'validate');
  assert.ok(has(errs, /campos no permitidos \(value\)/)); assert.ok(has(errs, /"expected" solo se admite/));
  assert.ok(!errs.join('\n').includes(secret));
});
test('negativo: confirmación sin autor, con fecha inválida o futura', () => {
  assert.ok(has(checkDeclaration(confirmed({ confirmed_by: ' ' }), 'main', { today: '2026-11-06' }), /confirmed_by/));
  assert.ok(has(checkDeclaration(confirmed({ confirmed_on: '15/01/2026' }), 'main', { today: '2026-11-06' }), /AAAA-MM-DD/));
  assert.ok(has(checkDeclaration(confirmed({ confirmed_on: '2027-01-01' }), 'main', { today: '2026-11-06' }), /fecha futura/));
  assert.ok(has(checkDeclaration(confirmed({ confirmed: 'sí' }), 'main', { today: '2026-11-06' }), /no ha confirmado/));
});
test('CLI: validate 0 · main 1 con la declaración versionada · main 0 confirmada · archivo ilegible 2 · uso 2', () => {
  assert.equal(cli(['validate']).status, 0);
  const m = cli(['main']); assert.equal(m.status, 1); assert.match(m.stderr, /NO PREPARADO/);
  assert.equal(withFile(confirmed(), (f) => cli(['main', '--file', f]).status), 0);
  assert.equal(withFile('{no json', (f) => cli(['validate', '--file', f]).status), 2);
  assert.equal(cli(['otro']).status, 2);
  assert.match(cli(['fingerprint']).stdout.trim(), /^[0-9a-f]{16}$/);
});
