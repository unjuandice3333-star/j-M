# M24C — VALIDACIÓN EN SUPABASE REAL (Docker + Supabase CLI)

**Fecha:** 2026-11-06
**Objeto validado:** rama `db/baseline-m24b`, commit `9183090`, sin modificaciones.
**Entorno:** stack oficial de Supabase **local**: Docker 29.9.2, Supabase CLI 3.0.0 y las imágenes oficiales de Postgres, GoTrue, Storage, PostgREST y Kong.
**Remotos:** ninguno. Sin token de acceso de Supabase, sin proyecto enlazado, sin QA ni Production. No se desplegó nada; no se tocaron Wompi, Vercel, frontend ni backend.

---

## 1. Veredicto

**La línea base M24B se reconstruye con Supabase CLI + Docker y supera las pruebas funcionales en ese entorno.** El criterio de aceptación se cumple. Aparecieron **tres hallazgos que el entorno anterior (PostgreSQL 16 + shim) no podía revelar**:
- dos impiden que **los archivos de prueba / seed tal como están** funcionen al 100 % en Supabase;
- ninguno afecta al esquema, a las funciones ni a las políticas.

| Componente | Resultado en Supabase real |
|---|---|
| `supabase start` (instalación limpia) | **OK**: migración base + 3 seeds aplicados sin errores |
| `supabase db reset` | **OK** |
| `supabase test db` — 10 suites funcionales (archivos M24B sin cambios) | **278 / 278 OK** en 2 instalaciones independientes |
| `supabase test db` — suite de concurrencia (archivo M24B sin cambios) | **FALLA**: hallazgo H2 (portabilidad de la prueba) |
| Suite de concurrencia con adaptación de 2 líneas (solo en copia de validación) | **12 / 12 OK** |
| Servicios reales por HTTP (GoTrue, PostgREST, Storage, Kong) | **39 / 39 OK** con la corrección H1 aplicada localmente (**23 / 39** sin ella) |
| Expiración por **pg_cron real** (sin invocación manual) | **OK**: el job de las 05:50:00 venció el pedido y liberó la reserva |
| Determinismo (2 reconstrucciones independientes) | **Idéntico**: esquema, privilegios, restricciones, funciones, políticas, datos de referencia y seeds |

## 2. Hallazgos

| ID | Severidad | Hallazgo | Evidencia | Corrección propuesta (no aplicada a M24B) |
|---|---|---|---|---|
| **H1** | **Alta** (bloquea el login de los usuarios QA) | `supabase/seeds/00_qa_users.sql` deja en NULL `confirmation_token`, `recovery_token`, `email_change*`, `reauthentication_token`, `phone_change*`. GoTrue real los lee como texto y el login devuelve **HTTP 500** para los 4 usuarios de prueba. El shim no tenía esas columnas. El registro público (signup) **sí funciona** | `evidencias/gotrue_error_seed_login.txt`, `services_results_before_auth_fix.json` (23/39) | Rellenar esas columnas con `''` en el seed (`evidencias/auth_seed_fix.sql`). Validado: con la corrección, 39/39 |
| **H2** | Media (solo pruebas) | `95_concurrency.test.sql` no es portable a Supabase: **(a)** `supabase test db` instala pgTAP pero no `dblink`; **(b)** en Supabase `postgres` **no es superusuario** y dblink exige una conexión autenticada con contraseña (127.0.0.1 es `trust` en `pg_hba`) | `official_pgtap_concurrency_asis.log` | Que la prueba cree `dblink` y use `host(inet_server_addr())` + contraseña configurable (`evidencias/concurrency_adaptation.diff`). Validado: 12/12 |
| **H3** | Baja | `config.toml`: `auth.email.enable_signup` está obsoleta en CLI 3.x (WARN; se eliminará en v4) | `run1_start.log` | Usar `auth.email.enabled` |

Observaciones que **no** son defectos:
- **Precondición de las pruebas.** Las suites suponen el estado inicial de los seeds; ejecutarlas sobre una BD ya usada produce falsos fallos (`run1_test_default.log`). Hay que ejecutarlas siempre tras `supabase db reset`. La suite de concurrencia confirma (`COMMIT`) datos, así que debe ir al final.
- **El shim no se ejecuta.** El temor de que `supabase test db` sin ruta ejecutara `supabase/tests/local_shim/supabase_shim.sql` contra Supabase **no se materializó**: la CLI solo toma `*.test.sql`, y `auth.uid()` quedó idéntico antes y después (`auth_uid_before/after.txt`). Aun así, se recomienda mover el shim fuera de `supabase/tests/`.

## 3. Qué quedó validado (lista exigida por la misión)

| Ítem | Resultado | Cómo |
|---|---|---|
| Creación de usuarios de prueba | **OK con H1 corregido** (los usuarios se crean; el login falla sin la corrección) | Seed + login GoTrue |
| Creación de perfiles | **OK**: trigger sobre el `auth.users` real; signup público crea perfil `customer` con email y nombre | HTTP signup + PostgREST |
| Roles | **OK**: JWT reales de GoTrue; `is_admin()` verdadero/falso; autoasignación de rol → 403 | HTTP |
| Productos y variantes | **OK** | pgTAP `10_catalog` + `admin_upsert_product` vía PostgREST con JWT admin (cliente → 403 `JM_FORBIDDEN`) |
| Imágenes y Storage | **OK**: admin sube a `product-images`; anon y cliente rechazados; lectura pública 200 `image/png`; PDF rechazado por tipo MIME | Storage API real |
| Inventario | **OK** | pgTAP + HTTP (admin lee; anon 401) |
| Reservas | **OK** | pgTAP `30_reservations` |
| Checkout | **OK**: precio manipulado ignorado vía HTTP, idempotencia, error `JM_*` en `hint` | HTTP + pgTAP `20_checkout` |
| Pagos simulados | **OK**: intento solo con `service_role` (anon 401) | HTTP + pgTAP `40_payments` |
| Webhooks simulados | **OK**: APPROVED aplicado; reentrega → `duplicate`; un admin no puede invocarlo (403); duplicado en paralelo → `duplicate` | HTTP + concurrencia |
| Cancelaciones | **OK**: `processing → cancelled` con reingreso de stock vía API | HTTP + pgTAP `50_cancellations` |
| Transiciones | **OK**: inválidas → 400 `JM_INVALID_TRANSITION` | HTTP + pgTAP `70_transitions` |
| Políticas de acceso | **OK** | pgTAP `90_rls` (46) + HTTP (anon/cliente/admin/service_role) |
| Expiración por pg_cron | **OK con disparo real** | `pg_cron_evidence.txt` |

## 4. Diferencias frente a la validación anterior (PostgreSQL 16 + shim)

| Aspecto | M24B (PG 16 + shim) | M24C (Supabase real) |
|---|---|---|
| PostgreSQL | 16.15 | **15.19** (imagen `supabase/postgres:15.19.0.016`); coincide con `major_version = 15` del `config.toml` |
| pg_cron / pgTAP | 1.6.2 / 1.3.2 | 1.6.4 / 1.3.3 |
| `postgres` superusuario | Sí | **No**: afecta a dblink (H2) |
| `auth.users` | Simplificado (11 columnas) | Esquema real de GoTrue: afecta al seed (H1) |
| Resultado funcional | 278 + 12 | 278 + 12 (concurrencia con adaptación) |
| Totales de pedidos seed | — | Idénticos a M24B (JM-001000 … JM-001007) |

## 5. Recomendaciones (para autorizar en una misión posterior)
1. **M24D (corta):** aplicar H1, H2 y H3 en la rama `db/baseline-m24b`. Mover el shim a `supabase/local_shim/`. Añadir un script `supabase/tests/run_supabase.sh` (`db reset` → suites funcionales → concurrencia).
2. Después de M24D, repetir esta validación de punta a punta (se espera 290/290 sin adaptaciones y 39/39 HTTP).
3. Mantener Production fuera de alcance; el siguiente paso con datos reales sigue siendo el diagnóstico de solo lectura (M24-DIAG).

## 6. Documentos relacionados
- `M24C_RESULTADOS_RECONSTRUCCION.md`: start / reset / test db y determinismo.
- `M24C_COMPATIBILIDAD_SERVICIOS.md`: detalle por servicio.
- `M24C_EVIDENCIAS.md`: índice de evidencias e instrucciones de reproducción.
