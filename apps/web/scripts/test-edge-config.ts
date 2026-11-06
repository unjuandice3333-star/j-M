// M26-T3 — Pruebas de la configuración de la Edge Function wompi-webhook (Deno).
// Ejecutar: deno run --allow-env apps/web/scripts/test-edge-config.ts   (sin red ni archivos)
// Valores con forma de llave/secreto compuestos en tiempo de ejecución y ficticios.
import { readEdgeConfig, clean } from '../../../supabase/functions/wompi-webhook/config.ts';

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (role: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase-demo', role })}.${'s'.repeat(43)}`;
const EVT = ['test_', 'events_', 'e'.repeat(24)].join('');
const base: Record<string, string | undefined> = { APP_ENV: 'local', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'), WOMPI_EVENTS_SECRET: EVT };
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
check('negativo: todo ausente → 4 errores (APP_ENV incluida)', errs(readEdgeConfig(() => undefined)).length === 4);
const FAKE_VALUE = ['otro', 'valor', 'ficticio', String(120 + 3)].join('_'); // compuesto: un literal dispararía gitleaks
const leak = errs(run({ SUPABASE_SERVICE_ROLE_KEY: jwt('anon'), WOMPI_EVENTS_SECRET: FAKE_VALUE })).join('\n');
check('seguridad: los errores no incluyen valores', !leak.includes('s'.repeat(43)) && !leak.includes(FAKE_VALUE));
check('clean: tolera undefined/null', clean(undefined) === '' && clean(null) === '');
// M26-R1 (MAJ-2 / MIN-4)
const EVT_PROD = ['prod_', 'events_', 'p'.repeat(24)].join('');
check('MAJ-2 negativo: sin APP_ENV', errs(run({ APP_ENV: undefined })).some((e) => e.startsWith('APP_ENV: obligatoria')));
check('MAJ-2 negativo: APP_ENV desconocido', errs(run({ APP_ENV: 'staging' })).some((e) => e.startsWith('APP_ENV: debe ser')));
check('MAJ-2 negativo: secreto de eventos de producción en local', errs(run({ WOMPI_EVENTS_SECRET: EVT_PROD })).some((e) => e.includes('con APP_ENV=local solo se admite')));
check('MAJ-2 negativo: secreto de eventos de producción en qa', errs(run({ APP_ENV: 'qa', SUPABASE_URL: 'https://' + 'q'.repeat(20) + '.supa' + 'base.co', WOMPI_EVENTS_SECRET: EVT_PROD })).some((e) => e.includes('con APP_ENV=qa solo se admite')));
check('MAJ-2 negativo: qa con URL http de loopback', errs(run({ APP_ENV: 'qa' })).some((e) => e.includes('con APP_ENV=qa debe ser https')));
check('MAJ-2 positivo: production con su secreto de eventos', run({ APP_ENV: 'production', SUPABASE_URL: 'https://' + 'q'.repeat(20) + '.supa' + 'base.co', WOMPI_EVENTS_SECRET: EVT_PROD }).ok);
check('MIN-4 negativo: URL con ruta o fragmento', errs(run({ SUPABASE_URL: 'http://127.0.0.1:54321/x#y' })).some((e) => e.includes('solo el origen')));
check('MIN-4: clean no quita una comilla suelta', clean('"abc') === '"abc' && clean('"abc"') === 'abc');

// M26-R1.1 (MAJ-2): APP_ENV debe coincidir con el proyecto que inyecta Supabase (SUPABASE_URL)
const QA_HOST = 'q'.repeat(20) + '.supa' + 'base.co';
const PROD_HOST = 'v'.repeat(20) + '.supa' + 'base.co';
const LIST = { local: ['127.0.0.1', 'localhost'], qa: [QA_HOST] };
const runL = (over: Record<string, string | undefined>, list = LIST) => { const env = { ...base, ...over }; return readEdgeConfig((n) => env[n], list); };
check('R1.1 positivo: qa en el proyecto de la lista de QA', runL({ APP_ENV: 'qa', SUPABASE_URL: 'https://' + QA_HOST }).ok);
check('R1.1 negativo: qa en otro proyecto (p. ej. Production)', errs(runL({ APP_ENV: 'qa', SUPABASE_URL: 'https://' + PROD_HOST })).some((e) => e.includes('el proyecto no es el de QA')));
check('R1.1 negativo: qa con la lista de QA vacía (versionada)', errs(runL({ APP_ENV: 'qa', SUPABASE_URL: 'https://' + QA_HOST }, { local: LIST.local, qa: [] })).some((e) => e.includes('qa no tiene hosts permitidos')));
check('R1.1 positivo: production en un proyecto ajeno a la fábrica', runL({ APP_ENV: 'production', SUPABASE_URL: 'https://' + PROD_HOST, WOMPI_EVENTS_SECRET: EVT_PROD }).ok);
check('R1.1 negativo: production en el proyecto QA (contradictorio)', errs(runL({ APP_ENV: 'production', SUPABASE_URL: 'https://' + QA_HOST, WOMPI_EVENTS_SECRET: EVT_PROD })).some((e) => e.includes('configuración contradictoria')));
check('R1.1 negativo: production en el stack local (loopback o kong)', ['http://127.0.0.1:54321', 'http://kong:8000'].every((u) => errs(runL({ APP_ENV: 'production', SUPABASE_URL: u, WOMPI_EVENTS_SECRET: EVT_PROD })).some((e) => e.includes('contradictoria'))));
check('R1.1 elusión: APP_ENV entre comillas y espacios se normaliza y se aplica la regla', errs(runL({ APP_ENV: ' "production" ', SUPABASE_URL: 'https://' + QA_HOST, WOMPI_EVENTS_SECRET: EVT_PROD })).some((e) => e.includes('contradictoria')));
check('R1.1 negativo: production con secreto sandbox es coherente solo si el proyecto no es de la fábrica', errs(runL({ APP_ENV: 'production', SUPABASE_URL: 'https://' + QA_HOST })).length > 0);
check('R1.1: la lista por defecto es la copia generada (versionada: QA vacía)', errs(readEdgeConfig((n) => ({ ...base, APP_ENV: 'qa', SUPABASE_URL: 'https://' + QA_HOST } as Record<string, string | undefined>)[n])).some((e) => e.includes('qa no tiene hosts permitidos')));
check('R1.1 seguridad: los errores no revelan el host recibido', !errs(runL({ APP_ENV: 'qa', SUPABASE_URL: 'https://' + PROD_HOST })).join('').includes('v'.repeat(20)));

console.log(`SUMMARY: ${passed}/${passed + failed} TESTS PASSED`);
if (failed) Deno.exit(1);
