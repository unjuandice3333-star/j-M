// =============================================================================
// M26-T8 — Comandos del perfil QA (desarrollo, build y preview), separados de los locales.
//
//   pnpm build:qa   -- --file <qa.env> [--config <environments.json>]   → apps/web/dist-qa
//   pnpm preview:qa -- --file <qa.env> [--config …]                      → sirve dist-qa en 127.0.0.1:4174
//   pnpm dev:qa     -- --file <qa.env> [--config …]                      → servidor de desarrollo en 127.0.0.1:3100
//
// Garantías:
//   1. Antes de ejecutar Vite: el archivo QA debe pasar check:qa (T6): exclusivamente QA, mismo proyecto en cliente y
//      servidor, llaves del proyecto, Wompi sandbox y archivo fuera de rutas versionables.
//   2. Aislamiento del entorno local: Vite carga SIEMPRE apps/web/.env.local (en cualquier modo). Los comandos QA usan un
//      envDir vacío, así que no se lee ningún .env local. A Vite solo llegan las 5 variables VITE_* del archivo QA
//      (nunca los secretos de servidor). Salida propia (apps/web/dist-qa) y puertos propios: no tocan dist/ ni .env.local.
//   3. Tras el build, el bundle se verifica: contiene el host del proyecto QA y ningún otro host *.supabase.co; la
//      configuración incrustada por Vite tiene modo "qa" y EXACTAMENTE las 5 variables VITE_* del archivo QA (ninguna
//      variable local filtrada), ninguna con valor de loopback; ningún JWT con rol distinto de anon; ningún nombre de
//      secreto de servidor. (Las cadenas de loopback internas de librerías, p. ej. el URL por defecto de supabase-js,
//      no son configuración y no se evalúan.)
//   4. Los mensajes nombran variables, nunca valores. No usa vite.config.js de forma distinta ni el build de Vercel.
// Salida: 0 OK · 1 configuración o bundle no válidos · 2 uso, lectura o error de Vite
// =============================================================================
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { allowlistText } from './sync_allowlist.mjs';
import { loadConfig } from './environments.mjs';
import { checkQaEnv, checkEnvFileLocation, projectRefOf } from './qa_config.mjs';
import { REQUIRED_VARS } from './check_env.mjs';
import { parseEnv } from './templates.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const WEB = path.join(ROOT, 'apps/web');
export const QA_OUT_DIR = path.join(WEB, 'dist-qa');
export const QA_PORTS = Object.freeze({ preview: 4174, dev: 3100 });
const MANIFEST = '.qa-build.json';
const SB = '.supa' + 'base.co';
const SERVER_SECRET_NAMES = ['SUPABASE_SERVICE_ROLE_KEY', 'WOMPI_INTEGRITY_SECRET', 'WOMPI_EVENTS_SECRET'];

/** Solo las variables de cliente que necesita Vite (nunca secretos de servidor). */
export function selectViteVars(vars) {
  return Object.fromEntries(REQUIRED_VARS.map((n) => [n, vars[n] ?? '']));
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p); else yield p;
  }
}

/** Verifica que el bundle QA solo apunte al proyecto QA. Devuelve errores (sin valores). */
export function verifyQaBundle(dir, qaRef) {
  const errors = [];
  let foundQaHost = false;
  let envObjects = 0;
  const hostRe = new RegExp(`\\b([a-z0-9]{20})${SB.replace(/\./g, '\\.')}\\b`, 'g');
  const jwtRe = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]+/g;
  for (const file of walk(dir)) {
    if (!/\.(js|html|css|json|map)$/.test(file) || path.basename(file) === MANIFEST) continue;
    const rel = path.relative(dir, file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(hostRe)) {
      if (m[1] === qaRef) foundQaHost = true; else errors.push(`${rel}: contiene un host de Supabase distinto del proyecto QA`);
    }
    // Configuración incrustada por Vite: objeto con BASE_URL/MODE/… y las variables VITE_*
    if (/\bBASE_URL:"[^"]*",MODE:"/.test(text) || /VITE_[A-Z0-9_]+:"/.test(text)) {
      const keys = new Set([...text.matchAll(/\b(VITE_[A-Z0-9_]+):"/g)].map((m) => m[1]));
      if (keys.size) {
        envObjects++;
        for (const k of keys) if (!REQUIRED_VARS.includes(k)) errors.push(`${rel}: variable ${k} incrustada que no procede del archivo QA (¿entorno local filtrado?)`);
        for (const k of REQUIRED_VARS) if (!keys.has(k)) errors.push(`${rel}: falta ${k} en la configuración incrustada`);
        for (const m of text.matchAll(/\b(VITE_[A-Z0-9_]+):"https?:\/\/(127\.0\.0\.1|localhost)[:/"]/g)) errors.push(`${rel}: ${m[1]} apunta a loopback (configuración local)`);
        const url = /\bVITE_SUPABASE_URL:"([^"]*)"/.exec(text);
        if (url && url[1] !== `https://${qaRef}${SB}`) errors.push(`${rel}: VITE_SUPABASE_URL incrustada no es la del proyecto QA`);
        const mode = /\bMODE:"([a-z]+)"/.exec(text);
        if (mode && mode[1] !== 'qa') errors.push(`${rel}: el modo del build no es "qa"`);
      }
    }
    for (const m of text.matchAll(jwtRe)) {
      let role;
      try { role = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')).role; } catch { /* no es JWT */ }
      if (role && role !== 'anon') errors.push(`${rel}: contiene un JWT con rol distinto de anon`);
    }
    for (const n of SERVER_SECRET_NAMES) if (text.includes(n)) errors.push(`${rel}: contiene el nombre de un secreto de servidor (${n})`);
    // M26-R1 (MAJ-1): llaves secretas de Supabase de formato nuevo (no son JWT y no las detecta la regla anterior)
    if (/\bsb_secret_[A-Za-z0-9_-]{8,}/.test(text)) errors.push(`${rel}: contiene una llave secreta de Supabase`);
  }
  if (!foundQaHost) errors.push('el bundle no contiene el host del proyecto QA (¿se usó otra configuración?)');
  if (!envObjects) errors.push('no se encontró la configuración incrustada por Vite en el bundle');
  return [...new Set(errors)];
}

/** Lee y valida el archivo QA. Devuelve { vars, qaRef } o { error, code }. */
export function loadQaFile(file, cfgPath) {
  const loc = checkEnvFileLocation(file);
  if (!loc.ok) return { error: loc.error, code: loc.error === 'el archivo no existe' ? 2 : 1 };
  let vars, cfg, parsed, cfgFile;
  try {
    parsed = parseEnv(readFileSync(loc.abs, 'utf8'));
    vars = Object.fromEntries(parsed.entries.map((e) => [e.name, e.value]));
    cfgFile = cfgPath ? path.resolve(cfgPath) : path.join(ROOT, 'config/environments.json');
    cfg = loadConfig(cfgFile);
  } catch { return { error: 'no se pudo leer el archivo QA o la configuración de entornos', code: 2 }; }
  const { errors: qaErrors, manualChecks } = checkQaEnv(vars, cfg);
  const errors = [...parsed.problems.map((p) => `archivo: ${p}`), ...qaErrors];
  if (errors.length) return { error: `entorno QA inválido:\n  - ${errors.join('\n  - ')}`, code: 1 };
  return { vars, qaRef: projectRefOf(vars.VITE_SUPABASE_URL), manualChecks, cfgFile };
}

async function loadVite() {
  const req = createRequire(path.join(WEB, 'package.json'));
  const pkgFile = req.resolve('vite/package.json');
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  const imp = pkg.exports?.['.']?.import;
  return import(pathToFileURL(path.join(path.dirname(pkgFile), typeof imp === 'string' ? imp : imp.default)).href);
}

/** Configuración común de Vite para QA: envDir vacío (aislamiento) y modo "qa".
 *  M26-R1 (MAJ-2): el cliente incrusta config/environments.json para aplicar la lista de permitidos en ejecución; aquí se
 *  sustituye por la MISMA configuración que validó check:qa (la versionada o la de --config), para que build y validación
 *  coincidan. */
//  M26-R1.1: el cliente importa la copia generada (allowlist.generated.json); se sustituye por la copia derivada de la
//  configuración validada, escrita en el directorio temporal (que solo se usa para esto y como envDir vacío: Vite solo
//  lee de él archivos .env*).
function qaViteConfig(emptyEnvDir, cfgFile, extra = {}) {
  let alias = [];
  if (cfgFile) {
    const copy = path.join(emptyEnvDir, 'allowlist.validada.json');
    writeFileSync(copy, allowlistText(loadConfig(cfgFile)));
    alias = [{ find: /^.*\/allowlist\.generated\.json$/, replacement: copy }];
  }
  return { root: WEB, configFile: path.join(WEB, 'vite.config.js'), mode: 'qa', envDir: emptyEnvDir, logLevel: 'warn', resolve: { alias }, ...extra };
}

/** Expone a Vite solo las variables VITE_* del archivo QA (y retira cualquier VITE_* del proceso). */
function withQaProcessEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(process.env)) if (k.startsWith('VITE_')) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, selectViteVars(vars));
  const restore = () => { for (const k of REQUIRED_VARS) delete process.env[k]; Object.assign(process.env, saved); };
  return Promise.resolve().then(fn).finally(restore);
}

export async function buildQa(vars, qaRef, outDir = QA_OUT_DIR, cfgFile = undefined) {
  const emptyEnvDir = mkdtempSync(path.join(tmpdir(), 'jm-qa-envdir-'));
  try {
    const { build } = await loadVite();
    await withQaProcessEnv(vars, () => build(qaViteConfig(emptyEnvDir, cfgFile, { build: { outDir, emptyOutDir: true } })));
  } finally { rmSync(emptyEnvDir, { recursive: true, force: true }); }
  const errors = verifyQaBundle(outDir, qaRef);
  // M26-R1 (MIN-2): un build rechazado no se deja en disco (podría contener el valor rechazado).
  if (errors.length) rmSync(outDir, { recursive: true, force: true });
  if (!errors.length) writeFileSync(path.join(outDir, MANIFEST), JSON.stringify({ profile: 'qa', projectRef: qaRef, builtBy: 'scripts/env/qa_build.mjs' }, null, 2));
  return errors;
}

// --- CLI ----------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...args] = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const usage = 'uso: node scripts/env/qa_build.mjs <build|preview|dev> --file <qa.env> [--config <environments.json>]';
  if (!['build', 'preview', 'dev'].includes(cmd) || !opt('--file') || (args.includes('--config') && !opt('--config'))) { console.error(usage); process.exit(2); }

  const qa = loadQaFile(opt('--file'), opt('--config'));
  if (qa.error) { console.error(`QA: BLOQUEADO — ${qa.error}`); process.exit(qa.code); }
  qa.manualChecks.forEach((m) => console.log(`COMPROBACIÓN MANUAL: ${m}`));

  try {
    if (cmd === 'build') {
      const errors = await buildQa(qa.vars, qa.qaRef, QA_OUT_DIR, qa.cfgFile);
      if (errors.length) { console.error('QA: build generado pero RECHAZADO por la verificación del bundle:'); errors.forEach((e) => console.error(`  ERROR ${e}`)); process.exit(1); }
      console.log(`QA: build OK en ${path.relative(ROOT, QA_OUT_DIR)} · bundle verificado (solo el proyecto QA; sin loopback, sin JWT privilegiados ni nombres de secretos)`);
    } else if (cmd === 'preview') {
      const manifest = path.join(QA_OUT_DIR, MANIFEST);
      if (!existsSync(manifest)) { console.error('QA: no hay un build QA verificado; ejecute antes `pnpm build:qa -- --file <qa.env>`'); process.exit(1); }
      if (JSON.parse(readFileSync(manifest, 'utf8')).projectRef !== qa.qaRef) { console.error('QA: el build QA existente es de otro proyecto; vuelva a ejecutar build:qa'); process.exit(1); }
      const { preview } = await loadVite();
      const emptyEnvDir = mkdtempSync(path.join(tmpdir(), 'jm-qa-envdir-'));
      const server = await preview(qaViteConfig(emptyEnvDir, qa.cfgFile, { build: { outDir: QA_OUT_DIR }, preview: { host: '127.0.0.1', port: QA_PORTS.preview, strictPort: true } }));
      console.log(`QA: preview en http://127.0.0.1:${QA_PORTS.preview}/ (Ctrl+C para terminar)`);
      const stop = () => { rmSync(emptyEnvDir, { recursive: true, force: true }); server.httpServer.close(() => process.exit(0)); };
      process.on('SIGINT', stop); process.on('SIGTERM', stop);
    } else {
      const { createServer } = await loadVite();
      const emptyEnvDir = mkdtempSync(path.join(tmpdir(), 'jm-qa-envdir-'));
      const server = await withQaProcessEnv(qa.vars, async () => {
        const s = await createServer(qaViteConfig(emptyEnvDir, qa.cfgFile, { server: { host: '127.0.0.1', port: QA_PORTS.dev, strictPort: true } }));
        await s.listen();
        return s;
      });
      // Vite resuelve import.meta.env al transformar: las variables QA deben seguir disponibles mientras el servidor vive.
      Object.assign(process.env, selectViteVars(qa.vars));
      console.log(`QA: servidor de desarrollo en http://127.0.0.1:${QA_PORTS.dev}/ (Ctrl+C para terminar)`);
      const stop = async () => { rmSync(emptyEnvDir, { recursive: true, force: true }); await server.close(); process.exit(0); };
      process.on('SIGINT', stop); process.on('SIGTERM', stop);
    }
  } catch (e) {
    const busy = /already in use|EADDRINUSE/i.test(String(e?.message ?? e?.code ?? ''));
    console.error(busy ? `QA: el puerto ${cmd === 'dev' ? QA_PORTS.dev : QA_PORTS.preview} está ocupado por otro proceso; libérelo y repita`
                       : `QA: error de Vite (${e?.code ?? e?.name ?? 'desconocido'})`);
    process.exit(2);
  }
}
