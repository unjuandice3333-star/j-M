# M30 — 03. Procedimiento de reconstrucción de QA sobre M24

> **M30.2:** las herramientas operativas citadas aquí (`inventory.mjs`, `compare_inventory.mjs`, `backup_logical_api.mjs`, `backup_qa_owner.sh`, `restore_dump_local.sh`) no se versionan en el repositorio (regla 6 de `20_migrations_policy`: ningún ejecutable versionado puede contener operaciones remotas de Supabase). Se entregan aparte como kit `jm-qa-tools` con sus huellas SHA-256; ver `MISION_30_2/00_DECISION_Y_VERSIONADO.md`.

**No ejecutado.** Requiere la autorización expresa del propietario. Todas las órdenes llevan la referencia explícita
`--remote=yomgxdjgfjnrjaqiarvw`; nunca `supabase link` ni `--linked`. Production (`pgvffddxwvwmerqvzjth`) no interviene.

## 1. Por qué `db push` no sirve
QA tiene 28 versiones registradas que no son M24 (16 heredadas + 12 sin código en el repositorio) y un esquema
incompatible (mismos nombres de tablas y tipos con otra forma). `db push` intentaría aplicar M24 encima y fallaría en el
primer `CREATE TYPE`/`CREATE TABLE` existente, o dejaría un esquema mixto. Tampoco se reutiliza ninguna migración antigua.

## 2. Ensayo real del procedimiento (hecho en M30, en local)
Sobre la **réplica restaurada de QA** (esquema, datos, historial y la cuenta, en PG 17 aislado) se ejecutó el mismo comando
de reinicio remoto del CLI 3.0.0 (`supabase db reset --remote=<url>`, ruta de código de base de datos remota), desde una
copia del repositorio con solo M24 y los seeds:

| Aspecto | Consecuencia observada |
|---|---|
| Esquema `public` heredado (27 tablas, 25 funciones, 52 políticas, enums POS) | **Eliminado**; M24 aplicado |
| Función manual `rls_auto_enable` y demás deriva | Eliminada |
| Historial (28 versiones) | **Sustituido**: queda solo `20261106120000`. **No hace falta `migration repair`** |
| Seeds | Aplicados (`00_qa_users`, `10_qa_catalog`, `20_qa_orders`) |
| **`auth.users`** | **Se borra.** La cuenta del propietario desaparece; quedan las 4 cuentas seed `@qa.jm.test` (sin contraseña utilizable) |
| Storage | **Se conserva**: bucket `editorial_images` y sus objetos siguen (huérfanos); se crean `product-images` y `site-content` |
| Resultado | Catálogo **idéntico** a la línea base M24 en PG 17 (todas las filas PASS) y **pgTAP 290/290** |

Riesgo residual: el ensayo usó el modo «URL de base de datos»; en QA se usa el modo «referencia» del mismo comando, que
resuelve la conexión a través de la plataforma. Se mitiga con la copia verificada (01), la vuelta atrás (01 §7) y la
verificación posterior (§4).

## 3. Pasos (orden obligatorio; cada punto de control debe pasar antes del siguiente)
| # | Paso | Orden exacta | Tipo | Punto de control |
|---|---|---|---|---|
| 0 | Decisión escrita y fechada del propietario (cita este documento y la copia B) | `FACTORY/EXECUTION_LOG.md` | — | Existe |
| 1 | Copia B | `bash jm-qa-tools/backup_qa_owner.sh ~/jm-privado/qa-backup` | Lectura | `COPIA: OK` |
| 2 | Restauración de la copia B en local | `bash jm-qa-tools/restore_dump_local.sh ~/jm-privado/qa-backup/qa_<fecha> <copia A>` | Local | `RESTAURACIÓN: PASS` (27/27 sumas) |
| 3 | Pausar eventos de Wompi Sandbox hacia QA | Panel sandbox de Wompi → URL de eventos vacía | Config. externa | Ningún evento durante la reconstrucción |
| 4 | Releer la referencia | `echo yomgxdjgfjnrjaqiarvw` frente al panel | — | Coincide |
| 5 | **Reconstrucción** (desde la raíz del repositorio, en el commit autorizado: `supabase/migrations/` = solo M24) | `supabase db reset --remote=yomgxdjgfjnrjaqiarvw` | **DESTRUCTIVA** | Sale con 0; aplica `20261106120000` y los seeds |
| 6 | Verificación de esquema | `node jm-qa-tools/inventory.mjs --target qa --via api --out <priv>/qa_post.json` y `node jm-qa-tools/compare_inventory.mjs <línea base PG17> <priv>/qa_post.json` | Lectura | Esquema, RPC, índices, triggers, RLS, Storage, roles: PASS |
| 7 | Historial | `supabase migration list --remote=yomgxdjgfjnrjaqiarvw` | Lectura | Solo `20261106120000`, local = remoto |
| 8 | Pruebas pgTAP en QA, **sin** `95_concurrency` (esa prueba hace COMMIT con dos conexiones `dblink`, deja pedidos y crea/elimina un rol temporal; ya se validó en local y en el ensayo) | `supabase test db --remote=yomgxdjgfjnrjaqiarvw $(ls supabase/tests/database/*.test.sql \| grep -v 95_concurrency)` | Escritura revertida (`BEGIN … ROLLBACK` en cada archivo) | 278/278 |
| 9 | Storage | Verificar `product-images` y `site-content` (públicos, 5 MB, imágenes) y las 4 políticas `jm_*`. Opcional, tras confirmar el archivo en la copia B: `supabase storage rm -r ss:///editorial_images --remote=yomgxdjgfjnrjaqiarvw --experimental` y borrar el bucket en el panel | Opcional **DESTRUCTIVA** | Ver 04 |
| 10 | Auth | Configuración de `04_CONFIGURACION_SERVICIOS.md` §1 | Config. | Ver 04 |
| 11 | Usuarios | Contraseñas de `admin@`, `cliente1@`, `cliente2@`, `superadmin@qa.jm.test` en el panel; cuenta del propietario si se desea (04 §1.5) | Config. | Inicio de sesión de admin y cliente |
| 12 | Secretos de la función | `supabase secrets set --env-file <fuera-del-repo>/qa-edge.env --remote=yomgxdjgfjnrjaqiarvw` (`APP_ENV=qa`, `WOMPI_EVENTS_SECRET=test_events_…`) | Secretos | `secrets list` muestra los nombres |
| 13 | Edge Function actual | `supabase functions deploy wompi-webhook --remote=yomgxdjgfjnrjaqiarvw` (`verify_jwt = false` desde `config.toml`) | Despliegue | Panel: ACTIVE, versión nueva, JWT no exigido |
| 14 | Prueba de la función | Evento sin firma → 401; con firma de otro secreto → 401; `GET` → 405 | Lectura | Respuestas esperadas |
| 15 | Wompi | URL de eventos sandbox = `https://yomgxdjgfjnrjaqiarvw.supabase.co/functions/v1/wompi-webhook` (o `/api/wompi/webhook` de QA en Vercel) | Config. externa | Evento de prueba del panel aplicado |
| 16 | Frontend QA local | `pnpm check:qa -- --file <qa.env>` → `pnpm build:qa -- --file <qa.env>` → `pnpm preview:qa -- --file <qa.env>` | Local | VÁLIDO, bundle verificado |
| 17 | Recorridos comerciales | `05_PLAN_PRUEBAS_COMERCIALES.md` | Pruebas | Criterios PASS |

Requisitos previos de código (sin commit todavía; requieren su autorización): la lista de permitidos con el host de QA
(M28) es imprescindible para que el frontend y la Edge Function acepten QA (`APP_ENV=qa` solo en un proyecto de esa lista).

## 4. Criterios de «QA reconstruido correctamente»
1. `compare_inventory.mjs` frente a la línea base M24 en PG 17: **todas** las filas de esquema, RPC, índices, triggers,
   RLS, roles y Storage en PASS; migraciones = solo `20261106120000`.
2. `supabase test db --remote=…` sin `95_concurrency`: 278/278 (la concurrencia: 12/12 en local PG 17 y en el ensayo).
3. Catálogo de los seeds visible con la llave anon; una RPC `admin_*` con un cliente → 403 `JM_FORBIDDEN`.
4. Edge Function nueva activa, `verify_jwt=false`, `APP_ENV=qa`; firmas inválidas rechazadas.
5. Auth: redirecciones y correo según 04; inicio de sesión de admin y cliente.
6. Recorridos 1–12 de 05 en PASS (el 10–11 con Wompi Sandbox real).

## 5. Operaciones destructivas identificadas
| Operación | Qué destruye | Reversible con |
|---|---|---|
| `supabase db reset --remote=yomgxdjgfjnrjaqiarvw` | Todo `public` (27 tablas: 23 productos, 87 variantes, 20 pedidos…), funciones/políticas heredadas, historial de 28 versiones, **todos los usuarios de `auth`** (incluida la cuenta del propietario) | Copia B (01 §7) |
| `storage rm -r ss:///editorial_images` + borrar bucket (opcional) | 1 imagen editorial (2,9 MB) | Archivo en la copia B |
| `secrets set` | Sustituye el valor de `WOMPI_EVENTS_SECRET` | El propietario conserva el secreto sandbox en su gestor |
| `functions deploy` | Sustituye la versión 3 de `wompi-webhook` | Código v3 en las copias A y B |

## 6. Tiempo estimado
| Bloque | Propietario | Agente |
|---|---|---|
| Copia B + restauración local (pasos 1–2) | 30–40 min | soporte |
| Reconstrucción + verificación (3–8) | 15 min | 30–45 min |
| Storage, Auth, usuarios (9–11) | 20–30 min | guía y verificación |
| Secretos, función, Wompi (12–15) | 20 min | 20 min |
| Frontend QA (16) | 10 min | 15 min |
| Recorridos comerciales (17) | — | 3–5 h (incluye adaptar los scripts a QA) |
| **Total** | **≈ 1,5–2 h** | **≈ 5–7 h** |
