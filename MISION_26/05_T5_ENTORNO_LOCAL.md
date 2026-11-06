# M26 — T5: generación del entorno local

**Estado:** T5 ejecutada en local, pendiente de revisión. M26 sigue EN CURSO (faltan T6–T8). Sin publicar, sin cambios
en Vercel ni operaciones remotas.

## Qué pedía el plan
> T5 — `gen_local_env.sh` + prueba sobre el stack local: lee `supabase status -o json` y escribe `apps/web/.env.local`
> (ignorado por git). Rechaza cualquier host que no sea de loopback.
> Criterio 5: el entorno local se genera solo a partir del stack local y la aplicación arranca contra él (prueba de humo).

## Cómo funciona
`pnpm env:local` (→ `scripts/env/gen_local_env.sh` → `gen_local_env.mjs`):
1. Lee `supabase status -o json` del stack local (o `--status-file` en pruebas).
2. Parte de `config/env/local.env.example` (T4): conserva sus valores públicos (`local`, `sandbox`) y rellena la URL y la
   llave anon **del stack local**. La URL solo se acepta si es de loopback y está permitida para `local` (T1).
3. **Wompi: no inventa credenciales.** Solo incluye la llave sandbox que el usuario aporte en `VITE_WOMPI_PUBLIC_KEY`
   (debe ser `pub_test_…`). Si no la aporta, la deja vacía y lo informa como **paso pendiente del usuario**.
4. Valida el resultado con las guardas T2 (build) y T3 (configuración de cliente).
5. Escribe `apps/web/.env.local` **solo con variables `VITE_*`**: los secretos de servidor nunca van al archivo que Vite
   incrusta en el navegador. Permisos `0600`.

| Regla | Garantía |
|---|---|
| No sobrescribir | Creación exclusiva; si el destino existe → exit 4, contenido intacto (doble protección: comprobación previa y `flag: 'wx'`) |
| Solo rutas seguras | Dentro del repositorio solo escribe en rutas ignoradas por git; si no → exit 1 |
| Solo stack local | Un host que no sea de loopback → exit 1 y no se escribe nada |
| Nunca la llave de servicio en el navegador | Si la llave "anon" es de servicio o secreta → exit 1 |
| Sin valores en la salida | Solo nombres de variables |

Códigos de salida: **0** completo · **3** generado con pasos pendientes del usuario · **1** rechazado · **2** uso o lectura · **4** destino existente.

### Pasos que requieren intervención del usuario
1. Arrancar el stack local: `supabase start` (Docker).
2. **Aportar su llave pública SANDBOX de Wompi** (`pub_test_…`, del panel sandbox de Wompi): `VITE_WOMPI_PUBLIC_KEY=pub_test_… pnpm env:local`,
   o editar la línea vacía del archivo generado. La fábrica no la genera.
3. Si ya existe `apps/web/.env.local`, decidir si conservarlo: el generador nunca lo sobrescribe.
4. Las variables de **servidor** (funciones de Vercel, Edge) no se generan en T5. Para ejecutarlas en local se
   exportan a mano según `config/env/local.env.example` (`supabase status` da la llave de servicio).

## Prueba de humo (criterio 5)
`pnpm smoke:env-local` (opcional; usa Docker, no forma parte de `test:env`). Resultado sobre el stack local real:

| Paso | Resultado |
|---|---|
| 1. `supabase start` | OK |
| 2. Generación sin llave de Wompi | exit 3, archivo generado con la llave de Wompi vacía; segunda ejecución → exit 4 (no sobrescribe) |
| 3. Generación con la llave sandbox (marcador público de CI de `local-ci.env`, que no autentica contra Wompi) | exit 0, COMPLETO |
| 4. `pnpm build:factory` con el archivo generado | Guarda T2 OK; build OK |
| 5. Sonda REST con la llave generada | **HTTP 200** |
| 6. Navegador (Chromium) | Renderiza, sin `ConfigError`, contacta con el stack local, **0 errores 401/403/5xx** |
| 7. Limpieza | Archivo generado y bundle borrados; stack detenido (0 contenedores) |

### Hallazgo: defecto de la aplicación (fuera del alcance de T5, no corregido)
La primera ejecución de la prueba de humo **falló** con un criterio más estricto ("al menos una respuesta 2xx en el
navegador"). Investigación:
- El frontend (`apps/web/src/services/productService.js`, `hooks/useProducts.js`) consulta el **esquema ERP antiguo**:
  filtra por `products.deleted_at` (y usa `variants`, `sizes`, `colors`…). La línea base M24 no tiene `deleted_at`
  (usa `status`/`published_at`). PostgREST responde `HTTP 400 · 42703 column products.deleted_at does not exist`.
- La misma llave generada, contra el mismo stack, responde **HTTP 200** a una consulta válida: el entorno es correcto.

Decisión: la prueba de humo mide lo que promete T5 (conectividad y autenticación del entorno generado) con una sonda
REST explícita y la ausencia de 401/403/5xx. Los 4xx de esquema de la aplicación se **informan como aviso**, no se ocultan.
**Pendiente para una misión de aplicación (M27–M34):** adaptar la capa de datos del frontend al esquema de la línea base M24.

## Archivos
| Archivo | Tipo |
|---|---|
| `scripts/env/gen_local_env.mjs`, `scripts/env/gen_local_env.sh` | Nuevos: generador (lógica pura + CLI) y envoltorio del plan |
| `scripts/env/gen_local_env.test.mjs` | Nuevo: 13 pruebas (lógica pura y CLI real en directorios temporales) |
| `scripts/env/smoke_local_env.sh`, `scripts/env/smoke_browser.cjs` | Nuevos: prueba de humo opcional sobre el stack local |
| `package.json` | `test:env` incluye T5; nuevos `env:local` y `smoke:env-local` |

## Resultados
| Prueba | Resultado |
|---|---|
| `node --test scripts/env/gen_local_env.test.mjs` | 13/13 |
| Mutaciones (aceptar hosts no loopback · sobrescribir · inventar la llave de Wompi) | Las 3 se detectan (1, 2 y 2 pruebas fallan) |
| Prueba de humo sobre el stack local real | OK (con aviso del defecto de la aplicación) |
| `pnpm test:env`, CI quick, autoprueba, actionlint y gitleaks sobre el commit de T5 | ver el informe de T5 |

## Limitaciones
- La prueba de humo usa Docker y Playwright (preinstalado en este entorno; se localiza con `NODE_PATH`). No es un paso de CI.
- No se probó el caso negativo de la prueba de humo completa (llave inválida → 401) con el stack real; las pruebas
  unitarias cubren los rechazos del generador.
- Las variables de servidor no se generan (fuera de lo que pide T5).
