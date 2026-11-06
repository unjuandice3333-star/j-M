# M26 — T8: guía del propietario para configurar el QA existente, y comandos locales del perfil QA

> **Corregida en M26-R1 (MAJ-4, MIN-6).** El proyecto QA **ya existe** (`yomgxdjgfjnrjaqiarvw`, confirmado por el
> propietario): no se crea otro. Ningún paso aplica `db reset` sobre QA sin las salvaguardas de `06_T6_QA.md` §3.

**Estado:** la parte LOCAL de T8 está ejecutada y pendiente de revisión. La parte REMOTA (configurar QA) es,
por definición del plan, una acción del propietario que requiere autorización: **no se ha realizado**. No se creó ni se
modificó ningún proyecto Supabase, no se tocó Vercel, no hubo despliegues ni publicación de M26.

## 1. Alcance de T8 según el plan
> T8 — Guía del propietario: crear el proyecto QA, la referencia en la lista de permitidos, las variables de Vercel
> Preview y los secretos de sandbox. Documento. Crear y configurar QA: **sí (propietario)**.
> Criterio 8: ninguna operación remota realizada. QA queda documentado y listo para que el propietario lo cree.

El entregable es esta guía. Para que sea **ejecutable y verificable sin acceso remoto**, T8 añade además comandos locales
del perfil QA, separados de los locales, que el propietario usará para comprobar su configuración antes de cualquier
despliegue (§3).

## 2. Guía del propietario (pasos remotos; requieren autorización)
| # | Paso | Dónde | Comprobación local antes o después |
|---|---|---|---|
| 1 | Proyecto QA: **ya existe**, `yomgxdjgfjnrjaqiarvw` (`https://yomgxdjgfjnrjaqiarvw.supabase.co`). No crear otro | Supabase | — |
| 2 | Añadir `yomgxdjgfjnrjaqiarvw.supabase.co` a `environments.qa.supabase.allowed_hosts` en `config/environments.json`, mediante PR revisado. **Nunca** la referencia de Production | Repositorio | `node scripts/env/environments.mjs validate-config` (formato de la lista); `pnpm test:env` (las pruebas no dependen de la lista versionada) |
| 3 | Rellenar un archivo QA **fuera del repositorio** (forma: `config/env/qa.env.example`) con las **11** variables del proyecto QA y de Wompi **sandbox**, incluidas `APP_ENV=qa` y `VITE_APP_ENV=qa` | Equipo del propietario | `pnpm check:qa -- --file <qa.env>` → VÁLIDO |
| 4 | Base de datos: **Fase A** obligatoria (copia, inventario, historial de migraciones, versión de PostgreSQL); después `db push` no destructivo o, solo con la **Fase C** y decisión escrita, `db reset`. Ver `06_T6_QA.md` §3 | Supabase | Antes, `check:qa`. Nunca `supabase link` ni `--linked`: siempre `--remote=yomgxdjgfjnrjaqiarvw` |
| 5 | Usuarios de QA: los seeds no tienen contraseña utilizable; fijarla a mano en el panel. Si QA se cargó alguna vez con los seeds de M24–M25, **rotar ya** sus contraseñas (la antigua es pública en el historial) | Supabase | — |
| 6 | Edge Function `wompi-webhook`: secretos `WOMPI_EVENTS_SECRET` de **sandbox** y `APP_ENV=qa`; desplegar con `verify_jwt = false` (versionado en `supabase/config.toml`) y comprobarlo en el panel. `SUPABASE_URL` y la llave de servicio las inyecta Supabase | Supabase | — |
| 7 | Auth de QA: Site URL y Redirect URLs del frontend de QA; proveedores necesarios | Supabase | — |
| 8 | Entorno de Vercel para QA (Preview o un proyecto/entorno dedicado): las **11** variables del archivo QA (5 de cliente `VITE_*` y 6 de servidor, con `APP_ENV=qa`), **todas de QA y Wompi sandbox**. El servidor rechaza arrancar sin `APP_ENV`, y el navegador rechaza un host de Supabase que no esté en la lista de QA versionada | Vercel | Antes, en local: `pnpm build:qa -- --file <qa.env>` (build verificado) y `pnpm preview:qa -- --file <qa.env>` |
| 9 | Webhook de Wompi **sandbox** apuntando al endpoint de QA (Vercel `/api/wompi/webhook` o la Edge Function) | Panel sandbox de Wompi | — |
| 10 | Decidir R-PREVIEW (que las ramas internas no generen Preview automáticos; ver `01_DIAGNOSTICO_Y_T1.md` §2) | Vercel | — |
| 11 | Tras cualquier cambio de configuración: repetir `check:qa` y `build:qa` en local | Equipo del propietario | — |

**Nunca:** variables de Production en QA, llaves `pub_prod_`/secretos `prod_` en QA, ni la referencia de Production en
la lista de permitidos de QA. Los comandos de §3 y las guardas en ejecución rechazan las dos primeras situaciones. La
tercera depende de la revisión del PR del paso 2 (decisión del propietario: no se añade una lista de hosts prohibidos).

## 3. Comandos locales del perfil QA (preparados en T8)
| Comando | Qué hace | Salida |
|---|---|---|
| `pnpm build:qa -- --file <qa.env>` | `check:qa` → build de Vite en modo `qa` → verificación del bundle | `apps/web/dist-qa` (ignorado por git) |
| `pnpm preview:qa -- --file <qa.env>` | Sirve el último build QA **verificado** y del mismo proyecto | `http://127.0.0.1:4174` |
| `pnpm dev:qa -- --file <qa.env>` | Servidor de desarrollo con la configuración QA | `http://127.0.0.1:3100` |
| `pnpm check:qa -- --file <qa.env>` | Validación QA (T6) | — |

Comandos locales existentes, **sin cambios**: `pnpm --filter @jm/web dev` (puerto 3000), `pnpm build:factory`
(`apps/web/dist`), `pnpm env:local`. El script `build` de `apps/web` (el que ejecuta Vercel) **no se modificó**.

### Garantías de aislamiento
| Riesgo | Control |
|---|---|
| Vite carga **siempre** `apps/web/.env.local` (en cualquier modo): una variable local podría entrar en el build QA | Los comandos QA usan un `envDir` vacío: no se lee ningún `.env` local |
| Variables `VITE_*` del proceso (de la máquina) | Se retiran todas y solo se exponen las 5 del archivo QA |
| Secretos de servidor en el bundle | A Vite solo llegan las 5 variables de cliente |
| Mezclar el build QA con el local | Directorio propio `dist-qa` y puertos propios (4174, 3100); `dist/` y `.env.local` no se tocan |
| Confundir QA con Production u otro proyecto | Antes del build, `check:qa` (lista de permitidos, mismo proyecto, claim `ref` de las llaves, Wompi sandbox, `VITE_APP_ENV=qa`). Después, verificación del bundle: **solo** el host del proyecto QA entre los `*.supabase.co`, modo `qa`, exactamente las 5 variables del archivo QA (ninguna local), ninguna con valor de loopback, ningún JWT con rol distinto de anon y ningún nombre de secreto de servidor |
| Servir un build de otro proyecto | `preview:qa` exige el manifiesto del build verificado con el mismo `ref` |
| Mensajes | Nombran variables, nunca valores |

## 4. Pruebas (`pnpm test:qa-build`, CI: `19b_qa_profile_tests`)
11 pruebas con fixtures ficticios (proyecto, llaves y secretos compuestos en ejecución) y **Vite real**:
- Verificación del bundle (pura): 1 positiva (incluida la constante de loopback interna de supabase-js, que no es
  configuración) y 8 negativas (otro proyecto, variable local filtrada, variable QA ausente, valor de loopback, modo
  distinto de `qa`, JWT de servicio, nombre de secreto, sin host QA o sin configuración incrustada).
- `loadQaFile`: Production, otro proyecto, Wompi de producción o QA sin configurar → rechazado, sin mostrar valores.
- `build:qa` inválido → exit 1 **antes** de Vite (no se crea `dist-qa`). `preview:qa` sin build → exit 1.
- `build:qa` válido con el entorno **contaminado a propósito** (proceso con `VITE_SUPABASE_URL` local y una variable
  centinela, y un `.env.local` centinela creado solo si no existía): el bundle contiene solo el host QA, ninguna
  variable ni valor local ni secretos de servidor; `.env.local` y `dist/` quedan **idénticos**.
- `preview:qa` y `dev:qa` reales: responden en sus puertos (127.0.0.1), con el puerto libre comprobado antes;
  `dev:qa` sirve `import.meta.env` con el host QA y sin configuración local.
- Mutaciones (leer los `.env` locales · aceptar hosts de otro proyecto · build sin `check:qa`): las 3 se detectan.

Se ejecutan **fuera de `test:env` y de forma secuencial**: usan puertos fijos y crean momentáneamente un
`.env.local` centinela; en paralelo con las pruebas de T2 (que leen `apps/web/.env.local`) no serían deterministas.

## 5. Incidencias durante T8
1. **Defecto de T5 corregido: procesos `vite preview` huérfanos.** La limpieza de `scripts/env/smoke_local_env.sh` usaba
   `pkill -f "vite preview --port N"`, que solo alcanzaba el envoltorio `npx`. El proceso real
   (`node …/vite.js preview --port N`) quedaba huérfano ocupando el puerto. Se encontraron **7** (1 del script versionado
   de T5 y 6 de pruebas de humo ad hoc de T3 en el área temporal, no versionadas) ocupando los puertos 4173–4180.
   Se detuvieron (todos eran de la propia fábrica). La corrección: el script arranca Vite con su binario y lo detiene por PID.
2. **El primer intento de la prueba de `preview:qa` falló** porque el puerto 4174 lo ocupaba uno de esos huérfanos (la
   respuesta HTTP 200 venía de otro proceso). La prueba lo detectó porque exige el mensaje de arranque del propio servidor.
   Ahora además comprueba que el puerto está libre antes de arrancar, y `qa_build.mjs` informa explícitamente
   "puerto ocupado" en lugar de un error genérico de Vite.
3. **Falso positivo inicial en la verificación del bundle:** la regla "ningún loopback en el bundle" detectaba
   `http://localhost:9999`, una constante interna de supabase-js. La verificación se precisó: evalúa la configuración
   incrustada por Vite (variables exactas, valores y modo), no las cadenas internas de librerías. La regla de hosts de
   Supabase sigue aplicándose a todo el bundle.
4. Durante la depuración se añadió temporalmente una línea de diagnóstico a `qa_build.mjs`; un `git checkout` no la
   revirtió (el archivo aún no estaba versionado) y se retiró a mano. No quedó en el commit.

## 6. Pendiente (remoto o decisión del propietario)
- Todos los pasos de §2 (lista de permitidos, base de datos con salvaguardas, credenciales, secretos, Auth, Vercel,
  webhook sandbox).
- **Decidido por el propietario (R1):** no se añade una lista de hosts prohibidos con la referencia de Production; la
  protección es la lista de permitidos + la revisión del PR del paso 2.
- R-PREVIEW (paso 9).
- INC-M26-01 (desajuste frontend ↔ esquema M24): el catálogo de QA no mostrará datos reales hasta resolverla; tarea funcional posterior (`INCIDENCIAS.md`).

## 7. Estado de los criterios de aceptación de M26
| # | Criterio | Estado |
|---|---|---|
| 1 | Ningún build de la fábrica con una URL fuera de la lista de su entorno (con negativos) | Cumplido localmente: T1/T2 y, para QA, `build:qa` (T8) |
| 2 | Sin `pub_prod_`/`prod_` aceptados en local o QA | Cumplido (T2, T3, T6, T8) |
| 3 | Sin valores de respaldo para variables críticas | Cumplido (T2, T3) |
| 4 | `.env*` reales ignorados; plantillas sin valores con forma de secreto | Cumplido (T4); `dist-qa` también ignorado |
| 5 | Entorno local generado desde el stack local y la app arranca contra él | Cumplido (T5), con INC-M26-01 abierta (defecto de la app) |
| 6 | CI completa en PASS sobre el commit final, con la autoprueba ampliada | Ver el informe de T8 sobre el commit de T8 |
| 7 | Revisión independiente sin hallazgos bloqueantes pendientes | **NO REALIZADA en M26**: no se ha ejecutado una revisión independiente de M26 |
| 8 | Ninguna operación remota; QA documentado y listo para que el propietario lo cree | Cumplido localmente (esta guía); la creación de QA queda pendiente del propietario |
