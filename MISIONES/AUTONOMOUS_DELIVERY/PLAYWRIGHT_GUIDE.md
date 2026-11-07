# Playwright en J&M FASHION STORE (M36 → M36.1)

## Qué hay
- `apps/web/playwright.config.js` — configuración. Proyectos: **`edge`** (`channel: 'msedge'`, el navegador del propietario) y **`chromium`** (CI). Reporte HTML (`apps/web/playwright-report`, no se abre solo); en fallos: captura, vídeo y traza; cada prueba adjunta la consola del navegador, los fallos de red (HTTP ≥ 400 / peticiones caídas) y las excepciones de página (estas últimas hacen fallar la prueba). Ignora ruido conocido (React DevTools, avisos de React Router, analítica, Wompi, fuentes e imágenes externas).
- `apps/web/e2e/playwright/smoke.spec.js` — 7 smoke **no destructivos** (solo lectura del catálogo + carrito en localStorage; sin pedidos, sin escrituras en BD, sin pago): home, catálogo, detalle de producto, selección de variante, añadir al carrito, persistencia + cambio de cantidad, eliminar. Agnósticos a los datos (usan el primer producto con talla disponible), así que valen igual contra el backend sintético y contra Supabase QA.
- `apps/web/scripts/pw.mjs` — envoltorio multiplataforma que fija `E2E_TARGET` (sin sintaxis de shell, funciona en Windows).
- Los E2E anteriores (`apps/web/e2e/*.cjs`, `e2e_synthetic.cjs`) se mantienen sin cambios.

## Dos destinos
| Destino | Qué ejecuta | Requisitos |
|---|---|---|
| `local` (por defecto) | Vite real + backend **sintético** en memoria (127.0.0.1:54321). Arranca solo y se apaga solo | Node 22 y pnpm. Sin Docker, sin red, sin credenciales |
| `preview` | La URL del Preview de Vercel (Supabase QA detrás), solo lectura | `PLAYWRIGHT_BASE_URL=https://…` (también se acepta `BASE_URL`) y, si Deployment Protection está activa, `VERCEL_AUTOMATION_BYPASS_SECRET` |

### Autorización de Vercel (corregida en M36.1)
Antes se enviaban las cabeceras `x-vercel-protection-bypass` y `x-vercel-set-bypass-cookie` en TODAS las peticiones del navegador
(`extraHTTPHeaders`), también a terceros: eso rompió Google Fonts por CORS (la cabecera personalizada exige un preflight que
`fonts.gstatic.com` no admite) y exponía el secreto a Supabase y otros servicios.
Ahora (`e2e/playwright/vercelBypass.js` + `global-setup.js`):
1. El secreto lo lee **solo Node** y se envía **únicamente al hostname exacto** de `PLAYWRIGHT_BASE_URL` (mismo esquema, host y puerto; no basta con que un host termine igual o lo contenga) y nunca sigue una redirección hacia otro host.
2. A cambio, el deployment emite la cookie de sesión `_vercel_jwt`, que se guarda en `apps/web/.auth/vercel.json` (ignorado por git, permisos 0600) y se carga como `storageState`. El navegador solo adjunta esa cookie al host del deployment.
3. **El navegador no recibe ninguna cabecera de bypass**, así que el secreto no puede aparecer en trazas, capturas, vídeos ni reportes. Lo único sensible que puede quedar en una traza es la cookie `_vercel_jwt` (de sesión, no el secreto): trate `test-results/` y `playwright-report/` como privados y no los comparta sin revisarlos.
4. Los fallos del setup solo imprimen el estado HTTP y la causa (p. ej. «el deployment rechazó el secreto»); el secreto y los JWT se redactan.
5. Deployment Protection **no se desactiva**.
Verificado con 22 pruebas unitarias (hosts de terceros y parecidos reciben `{}`, el deployment recibe las cabeceras, el secreto no aparece en resultados ni errores, redirección a otro host no se sigue) y con un servidor local que imita un deployment protegido. **No probado contra un deployment real de Vercel desde este entorno.**

### Resultados separados por capa (`e2e/playwright/00-health.spec.js`, después `smoke.spec.js`)
1. `[1] aplicación accesible`: HTTP 200, HTML de la tienda y no la pantalla de autenticación de Vercel.
2. `[2] bypass de Vercel correcto` (solo preview): ninguna petición a terceros lleva cabeceras de bypass.
3. `[3] datos de Supabase`: recorre home, catálogo y un producto y **falla si cualquier respuesta de Supabase es ≥ 400**, listando código, mensaje, detalle y pista de cada una (sin tokens ni correos). Cada prueba adjunta además `supabase-errors.json` y una anotación `supabase` en el reporte HTML.
4. `smoke.spec.js` (catálogo, producto, carrito): las 7 pruebas originales, **sin cambios ni aserciones eliminadas**.
Con el esquema heredado simulado (`SYNTH_LEGACY_SCHEMA=1` en el backend sintético) las capas [1] pasan y [3] más las 7 de smoke fallan con exactamente los códigos esperados: es el mismo patrón que el del Preview real.

## Scripts (desde la raíz del repo)
| Comando | Hace |
|---|---|
| `pnpm test:pw` | local · Chromium |
| `pnpm test:pw:edge` | local · Microsoft Edge |
| `pnpm test:pw:preview` | Preview · Edge (necesita `PLAYWRIGHT_BASE_URL`) |
| `pnpm qa:diagnose` | diagnóstico de SOLO LECTURA de Supabase QA con la llave anon (ver `QA_DIAGNOSTICO_M36_1.md`) |
| `pnpm --filter @jm/web e2e:preview:chromium` | Preview · Chromium |
| `pnpm --filter @jm/web e2e:report` | abre el reporte HTML |
| `pnpm --filter @jm/web e2e:install` | instala Chromium de Playwright (Edge no se instala: usa el de Windows) |

## Windows (instrucciones; NO probadas en Windows, ver «Estado»)
1. Instalar Node 22 y `corepack enable` (pnpm 11 viene fijado en `packageManager`). Microsoft Edge ya viene con Windows.
2. En PowerShell, en la raíz del repo: `pnpm install --frozen-lockfile`.
3. Local: `pnpm test:pw:edge` y luego `pnpm --filter @jm/web e2e:report`.
4. Preview (cuando exista la URL):
   ```powershell
   $env:PLAYWRIGHT_BASE_URL = "https://<tu-preview>.vercel.app"
   $env:VERCEL_AUTOMATION_BYPASS_SECRET = "<secreto de bypass>"   # solo en esta sesión de PowerShell
   pnpm test:pw:preview
   Remove-Item Env:VERCEL_AUTOMATION_BYPASS_SECRET
   ```
5. Si el puerto 3110 o 54321 está ocupado: `$env:E2E_PORT=3120; $env:E2E_API_PORT=54331` (el puerto del API sintético es el de `VITE_SUPABASE_URL` del fixture: si lo cambias, los smoke locales no encontrarán el backend; deja 54321 salvo conflicto real).

## Estado real (qué se ejecutó y dónde)
| Entorno | Resultado |
|---|---|
| Linux (este contenedor) · Microsoft Edge 157 · destino local (backend sintético) | **10 pasan + 1 omitida** (3 de salud [2 omitida: solo preview] + 7 smoke) |
| Linux · Chromium · local | **9 pasan + 1 omitida**; también como etapa del job `e2e-synthetic` del CI |
| **Windows + Edge contra Vercel Preview** | **Ejecutado por el propietario (informado, no verificado por mí): los 7 smoke FALLARON.** Causas identificadas: (a) cabecera de bypass enviada a terceros → CORS de Google Fonts (corregido en M36.1); (b) Supabase QA responde 400/404 en `collections`, `shipping_methods` y `site_content` (y el catálogo queda vacío con un `alert`): esquema heredado de QA, ver `QA_DIAGNOSTICO_M36_1.md`. **No son siete errores independientes** |
| **Vercel Preview tras la corrección** | **NO probado**: el agente no tiene la URL ni acceso a Vercel/Supabase QA (el proxy de la sesión bloquea `*.supabase.co`/`api.supabase.com`). **Las pruebas de Preview NO están aprobadas** |
| Supabase QA remoto | **NO VALIDADO** (y con el esquema actual no pasará: ver diagnóstico) |

## Fase 2 (preparada, no implementada): ver `apps/web/e2e/playwright/phase2/README.md`
