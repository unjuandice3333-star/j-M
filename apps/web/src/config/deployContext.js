// =============================================================================
// M26-R1.1 (MAJ-2) — Contexto de DESPLIEGUE: separación estricta Local / QA / Preview / Production.
//
// APP_ENV y VITE_APP_ENV los escribe una persona: no bastan para saber dónde corre el código. Este módulo contrasta
// el entorno declarado con las señales que pone la PLATAFORMA (Vercel) y que el usuario no configura:
//   VERCEL=1                 el código corre en Vercel (build o funciones)
//   VERCEL_ENV               production | preview | development
//   VERCEL_TARGET_ENV        destino del despliegue (production, preview o un entorno personalizado)
//   VERCEL_GIT_COMMIT_REF    rama del despliegue
//
// Reglas (falla cerrado: si no se puede identificar el despliegue, production se rechaza):
//   sin señales (local, CI, builds de la fábrica)   → local o qa; production NO
//   VERCEL=1 sin VERCEL_ENV (exposición desactivada) → local o qa; production NO (no identificable)
//   VERCEL_ENV=development (vercel dev)             → local o qa; production NO
//   VERCEL_ENV=preview                              → SOLO qa
//   VERCEL_ENV=production                           → SOLO production; y, si existen, VERCEL_TARGET_ENV=production
//                                                      y VERCEL_GIT_COMMIT_REF = rama de producción (main)
//   VERCEL_ENV con otro valor                       → rechazado
//
// Dónde se aplica: build (apps/web/vite.config.js, falla el build), navegador (las señales del build se incrustan
// en el bundle, sin el nombre de la rama) y funciones de servidor (apps/web/api/_lib/serverConfig.js, señales en
// ejecución). Módulo puro (sin dependencias, sin acceso a process/import.meta): comprobable en Node.
// Los mensajes nombran variables y valores PERMITIDOS, nunca el valor recibido.
// =============================================================================

export const PRODUCTION_BRANCH = 'main';
export const VERCEL_ENVS = Object.freeze(['production', 'preview', 'development']);
/** Señales de plataforma que usa la comprobación (las pone Vercel; ver MISION_26/10_R1_1_PREVIEW_PRODUCTION.md). */
export const PLATFORM_SIGNALS = Object.freeze(['VERCEL', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'VERCEL_GIT_COMMIT_REF']);

/** Normaliza como el resto de guardas: espacios y comillas envolventes emparejadas. */
export function cleanSignal(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  return (/^(["'])(.*)\1$/s.exec(v)?.[2] ?? v).trim();
}

/** Lee las señales de plataforma de un objeto de entorno (process.env en build o en funciones). */
export function readDeploySignals(env = {}) {
  const e = env ?? {};
  return Object.freeze({
    vercel: cleanSignal(e.VERCEL),
    env: cleanSignal(e.VERCEL_ENV),
    targetEnv: cleanSignal(e.VERCEL_TARGET_ENV),
    ref: cleanSignal(e.VERCEL_GIT_COMMIT_REF),
  });
}

/** Señales aptas para incrustar en el bundle público: la rama se reduce a "es la de producción o no". */
export function publicDeploySignals(signals) {
  const s = signals ?? {};
  return { vercel: s.vercel ?? '', env: s.env ?? '', targetEnv: s.targetEnv ?? '', ref: s.ref ? (s.ref === PRODUCTION_BRANCH ? PRODUCTION_BRANCH : '(otra rama)') : '' };
}

/** Contexto de despliegue: none | vercel-unknown | development | preview | production | invalid. */
export function deployContext(signals) {
  const s = signals ?? {};
  if (s.env) return VERCEL_ENVS.includes(s.env) ? s.env : 'invalid';
  return s.vercel ? 'vercel-unknown' : 'none';
}

/**
 * Problemas de coherencia entre el entorno declarado y el despliegue real.
 * @param {string} name   nombre de la variable declarada (APP_ENV o VITE_APP_ENV), solo para los mensajes
 * @param {string} appEnv valor ya normalizado (local | qa | production); si falta o no es válido lo informa el llamador
 * @param {object} signals resultado de readDeploySignals (o las señales incrustadas en el bundle)
 */
export function deployContextProblems(name, appEnv, signals) {
  const s = signals ?? {};
  const ctx = deployContext(s);
  const problems = [];
  if (ctx === 'invalid') {
    problems.push(`VERCEL_ENV: valor no reconocido (production, preview o development); no se puede identificar el despliegue`);
    return problems;
  }
  if (ctx === 'production') {
    if (s.targetEnv && s.targetEnv !== 'production') problems.push('VERCEL_TARGET_ENV: contradice VERCEL_ENV=production');
    if (s.ref && s.ref !== PRODUCTION_BRANCH) problems.push(`VERCEL_GIT_COMMIT_REF: un despliegue Production solo se admite desde la rama ${PRODUCTION_BRANCH}`);
  }
  if (!appEnv || !['local', 'qa', 'production'].includes(appEnv)) return problems;

  if (ctx === 'preview' && appEnv !== 'qa') {
    problems.push(`${name}: un despliegue Preview solo admite qa (configuración de ${appEnv} rechazada)`);
  } else if (ctx === 'production' && appEnv !== 'production') {
    problems.push(`${name}: un despliegue Production exige production`);
  } else if (appEnv === 'production' && ctx !== 'production') {
    problems.push(ctx === 'vercel-unknown'
      ? `${name}: production exige un despliegue identificado como Production, y VERCEL_ENV no está disponible (active la exposición automática de las variables de sistema de Vercel)`
      : `${name}: production solo se admite en un despliegue de Vercel identificado como Production (VERCEL_ENV=production)`);
  }
  return problems;
}
