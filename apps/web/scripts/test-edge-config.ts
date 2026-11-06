// M26-T3 — Pruebas de la configuración de la Edge Function wompi-webhook (Deno).
// Ejecutar: deno run --allow-env apps/web/scripts/test-edge-config.ts   (sin red ni archivos)
// Valores con forma de llave/secreto compuestos en tiempo de ejecución y ficticios.
import { readEdgeConfig, clean } from '../../../supabase/functions/wompi-webhook/config.ts';

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (role: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase-demo', role })}.${'s'.repeat(43)}`;
const EVT = ['test_', 'events_', 'e'.repeat(24)].join('');
const base: Record<string, string | undefined> = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'), WOMPI_EVENTS_SECRET: EVT };
const run = (over: Record<string, string | undefined> = {}) => { const env = { ...base, ...over }; return readEdgeConfig((n) => env[n]); };

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) { if (cond) { passed++; console.log(`[PASS] ${name}`); } else { failed++; console.log(`[FAIL] ${name}`); } }
const errs = (r: ReturnType<typeof readEdgeConfig>) => (r.ok ? [] : r.errors);

const ok = run();
check('positivo: configuración completa (service_role, secreto de eventos sandbox)', ok.ok && ok.config.eventsSecret === EVT);
check('positivo: secreto con comillas y espacios se normaliza', run({ WOMPI_EVENTS_SECRET: `  "${EVT}" ` }).ok);
check('positivo: llave de servicio no JWT (formato nuevo) se admite', run({ SUPABASE_SERVICE_ROLE_KEY: ['sb_', 'secret_', 'x'.repeat(20)].join('') }).ok);
check('negativo: sin SUPABASE_URL aunque exista VITE_SUPABASE_URL (no hay respaldo a variables de cliente)',
  errs(run({ SUPABASE_URL: undefined, VITE_SUPABASE_URL: 'http://127.0.0.1:54321' })).some((e) => e.startsWith('SUPABASE_URL: obligatoria y ausente (existe VITE_SUPABASE_URL')));
check('negativo: llave anon en lugar de service_role', errs(run({ SUPABASE_SERVICE_ROLE_KEY: jwt('anon') })).some((e) => e.includes('rol distinto de service_role')));
check('negativo: llave publicable en lugar de service_role', errs(run({ SUPABASE_SERVICE_ROLE_KEY: ['sb_', 'publishable_', 'x'.repeat(20)].join('') })).some((e) => e.includes('publicable')));
check('negativo: sin secreto de eventos', errs(run({ WOMPI_EVENTS_SECRET: '' })).some((e) => e.startsWith('WOMPI_EVENTS_SECRET: obligatoria')));
check('negativo: secreto de eventos con prefijo desconocido', errs(run({ WOMPI_EVENTS_SECRET: 'otro_' + 'x'.repeat(10) })).some((e) => e.includes('test_events_ o prod_events_')));
check('negativo: URL inválida', errs(run({ SUPABASE_URL: 'no-es-url' })).some((e) => e.startsWith('SUPABASE_URL: debe ser')));
check('negativo: todo ausente → 3 errores', errs(readEdgeConfig(() => undefined)).length === 3);
const FAKE_VALUE = ['otro', 'valor', 'ficticio', String(120 + 3)].join('_'); // compuesto: un literal dispararía gitleaks
const leak = errs(run({ SUPABASE_SERVICE_ROLE_KEY: jwt('anon'), WOMPI_EVENTS_SECRET: FAKE_VALUE })).join('\n');
check('seguridad: los errores no incluyen valores', !leak.includes('s'.repeat(43)) && !leak.includes(FAKE_VALUE));
check('clean: tolera undefined/null', clean(undefined) === '' && clean(null) === '');

console.log(`SUMMARY: ${passed}/${passed + failed} TESTS PASSED`);
if (failed) Deno.exit(1);
