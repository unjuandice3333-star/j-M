// =============================================================================
// M26-T7 — Comprobaciones de CI de extremo a extremo de los CLI de entorno (paso 19_env_cli_checks).
//
// Ejecuta los CLI reales (qa_config.mjs y gen_local_env.mjs) como procesos, con:
//   · fixtures FICTICIOS compuestos en tiempo de ejecución (proyectos, llaves y secretos inventados; ninguno se versiona);
//   · un entorno limpio (solo PATH/HOME): el resultado no depende de las variables de la máquina;
//   · sin red ni proyecto QA remoto: la configuración con un host QA ficticio se pasa con --config;
//   · comprobación de que ninguna salida (stdout/stderr) contiene valores de los fixtures.
// Cada caso declara el código de salida esperado. Salida: 0 si todos coinciden, 1 si alguno falla.
// =============================================================================
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEnv } from './check_env.mjs';
import { loadConfig } from './environments.mjs';
import { parseEnv } from './templates.mjs';
import { configWithQaHosts } from './test_fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QA_CLI = path.join(ROOT, 'scripts/env/qa_config.mjs');
const GEN_CLI = path.join(ROOT, 'scripts/env/gen_local_env.mjs');

// ---- fixtures ficticios (compuestos en ejecución) ----
const SB = '.supa' + 'base.co';
const QA_REF = 'c'.repeat(20);
const OTHER_REF = 'd'.repeat(20);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role, ref, fill) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(ref ? { iss: 'supabase', ref, role } : { iss: 'supabase-demo', role })}.${fill.repeat(43)}`;
const j = (...p) => p.join('');
const PUB = j('pub_', 'test_', 'f'.repeat(24));
const SECRETS = {
  qaAnon: jwt('anon', QA_REF, 'g'), qaService: jwt('service_role', QA_REF, 'h'), otherAnon: jwt('anon', OTHER_REF, 'i'),
  integ: j('test_', 'integrity_', 'k'.repeat(24)), events: j('test_', 'events_', 'm'.repeat(24)),
  localAnon: jwt('anon', undefined, 'n'), localService: jwt('service_role', undefined, 'o'),
  prodPub: j('pub_', 'prod_', 'q'.repeat(24)),
};
const CI_PUB = parseEnv(readFileSync(path.join(ROOT, 'config/env/local-ci.env'), 'utf8')).entries.find((e) => e.name === 'VITE_WOMPI_PUBLIC_KEY').value;

const qaVars = (over = {}) => ({
  APP_ENV: 'qa', VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: `https://${QA_REF}${SB}`, VITE_SUPABASE_ANON_KEY: SECRETS.qaAnon,
  VITE_WOMPI_PUBLIC_KEY: PUB, VITE_WOMPI_ENV: 'sandbox', SUPABASE_URL: `https://${QA_REF}${SB}`,
  SUPABASE_SERVICE_ROLE_KEY: SECRETS.qaService, WOMPI_PUBLIC_KEY: PUB, WOMPI_INTEGRITY_SECRET: SECRETS.integ,
  WOMPI_EVENTS_SECRET: SECRETS.events, ...over,
});
const status = (over = {}) => ({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: SECRETS.localAnon, SERVICE_ROLE_KEY: SECRETS.localService, ...over });

const dir = mkdtempSync(path.join(tmpdir(), 'jm-ci-env-'));
const file = (name, content) => { const f = path.join(dir, name); writeFileSync(f, content); return f; };
const envText = (vars) => Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
const cleanEnv = (extra = {}) => ({ PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', ...extra });
const run = (cli, args, extra) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: cleanEnv(extra) });

const qaCfg = loadConfig(path.join(ROOT, 'config/environments.json'));
qaCfg.environments.qa.supabase.allowed_hosts = [`${QA_REF}${SB}`];
const qaCfgFile = file('environments.qa-fixture.json', JSON.stringify(qaCfg));
// M26-R1 (MAJ-3): QA vacía explícita para QA-2 (no depende del archivo versionado).
const emptyCfgFile = file('environments.vacia.json', JSON.stringify(configWithQaHosts([])));
const realCfg = loadConfig(path.join(ROOT, 'config/environments.json'));

let failures = 0;
const results = [];
function check(id, desc, r, expected, { out, extra } = {}) {
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const leaked = Object.values(SECRETS).filter((v) => text.includes(v)).length + (text.includes(QA_REF) || text.includes(OTHER_REF) ? 1 : 0);
  const outOk = out ? out.test(text) : true;
  const extraOk = extra ? extra() : true;
  const ok = r.status === expected && outOk && extraOk && leaked === 0;
  if (!ok) failures++;
  results.push(`[${ok ? 'PASS' : 'FAIL'}] ${id} ${desc} (exit ${r.status}, esperado ${expected}${leaked ? `, ${leaked} valor(es) filtrado(s)` : ''}${!outOk ? ', mensaje inesperado' : ''}${!extraOk ? ', comprobación adicional fallida' : ''})`);
}

try {
  // ------------------------------------------------ check:qa (T6), sin QA remoto
  const qa = (name, vars) => file(name, envText(vars));
  check('QA-1', 'entorno QA ficticio coherente + host QA permitido (fixture) → VÁLIDO',
    run(QA_CLI, ['check', '--file', qa('qa-ok.env', qaVars()), '--config', qaCfgFile]), 0, { out: /Entorno QA: VÁLIDO/ });
  check('QA-2', 'mismo entorno con QA sin configurar (lista vacía explícita) → INVÁLIDO',
    run(QA_CLI, ['check', '--file', qa('qa-ok2.env', qaVars()), '--config', emptyCfgFile]), 1, { out: /aún no ha configurado/ });
  check('QA-3', 'llave anon de otro proyecto con la URL de QA → INVÁLIDO',
    run(QA_CLI, ['check', '--file', qa('qa-mix.env', qaVars({ VITE_SUPABASE_ANON_KEY: SECRETS.otherAnon })), '--config', qaCfgFile]), 1, { out: /pertenece a otro proyecto/ });
  check('QA-4', 'cliente y servidor en proyectos distintos → INVÁLIDO',
    run(QA_CLI, ['check', '--file', qa('qa-split.env', qaVars({ SUPABASE_URL: `https://${OTHER_REF}${SB}` })), '--config', qaCfgFile]), 1, { out: /proyectos distintos|no permitido/ });
  check('QA-5', 'llave de Wompi de producción en QA → INVÁLIDO',
    run(QA_CLI, ['check', '--file', qa('qa-prod.env', qaVars({ WOMPI_PUBLIC_KEY: SECRETS.prodPub, VITE_WOMPI_PUBLIC_KEY: SECRETS.prodPub })), '--config', qaCfgFile]), 1);
  check('QA-6', 'archivo QA en una ruta versionable del repositorio → rechazado',
    run(QA_CLI, ['check', '--file', path.join(ROOT, 'package.json'), '--config', qaCfgFile]), 1, { out: /ruta versionable/ });

  // ------------------------------------------- generador local (T5/T6), sin credenciales reales
  const st = file('status.json', JSON.stringify(status()));
  const out1 = path.join(dir, 'gen', '.env.local');
  spawnSync('mkdir', ['-p', path.dirname(out1)]);
  check('GEN-1', 'sin llave de Wompi → generado con paso pendiente del usuario (exit 3), llave vacía',
    run(GEN_CLI, ['--status-file', st, '--output', out1]), 3, { out: /PASOS PENDIENTES DEL USUARIO/,
      extra: () => existsSync(out1) && /^VITE_WOMPI_PUBLIC_KEY=$/m.test(readFileSync(out1, 'utf8')) });
  const out2 = path.join(dir, 'gen', 'completo.env');
  check('GEN-2', 'con llave sandbox (marcador público de CI) → COMPLETO y compatible con la guarda de build (T2)',
    run(GEN_CLI, ['--status-file', st, '--output', out2], { VITE_WOMPI_PUBLIC_KEY: CI_PUB }), 0, { out: /COMPLETO/,
      extra: () => checkEnv(Object.fromEntries(parseEnv(readFileSync(out2, 'utf8')).entries.map((e) => [e.name, e.value])), realCfg).length === 0 });
  const before = readFileSync(out2, 'utf8');
  check('GEN-3', 'segunda ejecución sobre el mismo destino → no sobrescribe (exit 4)',
    run(GEN_CLI, ['--status-file', st, '--output', out2], { VITE_WOMPI_PUBLIC_KEY: CI_PUB }), 4, { extra: () => readFileSync(out2, 'utf8') === before });
  const out4 = path.join(dir, 'gen', 'remoto.env');
  check('GEN-4', 'status con host remoto → rechazado (exit 1) sin escribir',
    run(GEN_CLI, ['--status-file', file('status-remoto.json', JSON.stringify(status({ API_URL: `https://${OTHER_REF}${SB}` }))), '--output', out4], { VITE_WOMPI_PUBLIC_KEY: CI_PUB }), 1,
    { extra: () => !existsSync(out4) });
  check('GEN-5', 'destino de QA → rechazado (exit 1) sin escribir',
    run(GEN_CLI, ['--status-file', st, '--output', path.join(dir, 'gen', '.env.qa')], { VITE_WOMPI_PUBLIC_KEY: CI_PUB }), 1,
    { out: /archivo de QA/, extra: () => !existsSync(path.join(dir, 'gen', '.env.qa')) });
  check('GEN-6', 'llave de servicio como anon → rechazado (exit 1): nunca llega al navegador',
    run(GEN_CLI, ['--status-file', file('status-svc.json', JSON.stringify(status({ ANON_KEY: SECRETS.localService }))), '--output', path.join(dir, 'gen', 'svc.env')], { VITE_WOMPI_PUBLIC_KEY: CI_PUB }), 1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

results.forEach((l) => console.log(l));
console.log(`SUMMARY: ${results.length - failures}/${results.length} comprobaciones de los CLI de entorno`);
process.exit(failures ? 1 : 0);
