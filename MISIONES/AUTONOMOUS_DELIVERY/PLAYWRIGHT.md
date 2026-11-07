# Playwright en J&M FASHION STORE (M36)

## Qué hay
- `apps/web/playwright.config.js` — configuración. Proyectos: **`edge`** (`channel: 'msedge'`, el navegador del propietario) y **`chromium`** (CI). Reporte HTML (`apps/web/playwright-report`, no se abre solo); en fallos: captura, vídeo y traza; cada prueba adjunta la consola del navegador, los fallos de red (HTTP ≥ 400 / peticiones caídas) y las excepciones de página (estas últimas hacen fallar la prueba). Ignora ruido conocido (React DevTools, avisos de React Router, analítica, Wompi, fuentes e imágenes externas).
- `apps/web/e2e/playwright/smoke.spec.js` — 7 smoke **no destructivos** (solo lectura del catálogo + carrito en localStorage; sin pedidos, sin escrituras en BD, sin pago): home, catálogo, detalle de producto, selección de variante, añadir al carrito, persistencia + cambio de cantidad, eliminar. Agnósticos a los datos (usan el primer producto con talla disponible), así que valen igual contra el backend sintético y contra Supabase QA.
- `apps/web/scripts/pw.mjs` — envoltorio multiplataforma que fija `E2E_TARGET` (sin sintaxis de shell, funciona en Windows).
- Los E2E anteriores (`apps/web/e2e/*.cjs`, `e2e_synthetic.cjs`) se mantienen sin cambios.

## Dos destinos
| Destino | Qué ejecuta | Requisitos |
|---|---|---|
| `local` (por defecto) | Vite real + backend **sintético** en memoria (127.0.0.1:54321). Arranca solo y se apaga solo | Node 22 y pnpm. Sin Docker, sin red, sin credenciales |
| `preview` | La URL del Preview de Vercel (Supabase QA detrás), solo lectura | `BASE_URL=https://…` y, si Deployment Protection está activa, `VERCEL_AUTOMATION_BYPASS_SECRET` |

Deployment Protection **no se desactiva**: se usa el secreto de «Protection Bypass for Automation» (Vercel → proyecto `jym-web` → Settings → Deployment Protection), enviado como cabecera `x-vercel-protection-bypass`. Ese valor nunca va al repositorio ni a los logs.

## Scripts (desde la raíz del repo)
| Comando | Hace |
|---|---|
| `pnpm test:pw` | local · Chromium |
| `pnpm test:pw:edge` | local · Microsoft Edge |
| `pnpm test:pw:preview` | Preview · Edge (necesita `BASE_URL`) |
| `pnpm --filter @jm/web e2e:preview:chromium` | Preview · Chromium |
| `pnpm --filter @jm/web e2e:report` | abre el reporte HTML |
| `pnpm --filter @jm/web e2e:install` | instala Chromium de Playwright (Edge no se instala: usa el de Windows) |

## Windows (instrucciones; NO probadas en Windows, ver «Estado»)
1. Instalar Node 22 y `corepack enable` (pnpm 11 viene fijado en `packageManager`). Microsoft Edge ya viene con Windows.
2. En PowerShell, en la raíz del repo: `pnpm install --frozen-lockfile`.
3. Local: `pnpm test:pw:edge` y luego `pnpm --filter @jm/web e2e:report`.
4. Preview (cuando exista la URL):
   ```powershell
   $env:BASE_URL = "https://<tu-preview>.vercel.app"
   $env:VERCEL_AUTOMATION_BYPASS_SECRET = "<secreto de bypass>"   # solo en esta sesión de PowerShell
   pnpm test:pw:preview
   Remove-Item Env:VERCEL_AUTOMATION_BYPASS_SECRET
   ```
5. Si el puerto 3110 o 54321 está ocupado: `$env:E2E_PORT=3120; $env:E2E_API_PORT=54331` (el puerto del API sintético es el de `VITE_SUPABASE_URL` del fixture: si lo cambias, los smoke locales no encontrarán el backend; deja 54321 salvo conflicto real).

## Estado real (qué se ejecutó y dónde)
| Entorno | Resultado |
|---|---|
| Linux (este contenedor) · Microsoft Edge 157 (`channel: msedge`, instalado con `playwright install msedge`) · destino local | **7/7** |
| Linux · Chromium · destino local | **7/7** (y como etapa 41 del job `e2e-synthetic` del CI: ver MASTER_STATUS) |
| **Windows local** | **NO PROBADO** (no hay Windows en este entorno) |
| **Vercel Preview** | **NO PROBADO**: no existe en el repo ni en la documentación ninguna URL de Preview y el agente no tiene acceso a Vercel (`vercel` denegado por política M25). Con `BASE_URL` el modo `preview` está implementado, pero solo se comprobó que sin `BASE_URL` o con una URL no-https falla con un mensaje claro |
| Supabase QA remoto | **NO VALIDADO** (sin credenciales ni acceso) |

## Fase 2 (preparada, no implementada): ver `apps/web/e2e/playwright/phase2/README.md`
