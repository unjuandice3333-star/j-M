# M30 — Plan de reconstrucción de QA sobre M24

> **M30.2:** las herramientas operativas citadas aquí (`inventory.mjs`, `compare_inventory.mjs`, `backup_logical_api.mjs`, `backup_qa_owner.sh`, `restore_dump_local.sh`) no se versionan en el repositorio (regla 6 de `20_migrations_policy`: ningún ejecutable versionado puede contener operaciones remotas de Supabase). Se entregan aparte como kit `jm-qa-tools` con sus huellas SHA-256; ver `MISION_30_2/00_DECISION_Y_VERSIONADO.md`.

**Estado del repositorio al empezar:** rama `mission/m26-dev-qa-environments`, HEAD `e42ecae`, árbol con cambios sin
commit (R1.1, M27, M28, M29 y M30). M24 sin modificar (SHA-256 `df81f303…16638990`).
**Autorización de M30:** solo preparación. **Ninguna escritura en QA**, ningún cambio en Production, Vercel, Auth,
Storage, Edge Functions ni secretos remotos. Sin commits. Las lecturas de QA se hicieron por el endpoint de consultas
**de solo lectura** de la API de gestión, con el proyecto validado antes de cada ejecución.

## Resumen ejecutivo
| Pregunta | Respuesta |
|---|---|
| ¿Copia de seguridad y recuperación local? | **Copia lógica ejecutada y restaurada con éxito**: 28/28 migraciones de QA reproducidas, **27/27 tablas con suma de control idéntica** a la calculada en QA, 0 filas huérfanas. **Copia autoritativa (`pg_dump`) preparada** para el propietario; su restauración se ensayó con volcados equivalentes: **PASS, 27/27**. Ver 01 |
| ¿M24 funciona en PostgreSQL 17? | **Sí.** pgTAP 290/290 (con concurrencia), HTTP 44/44, pedido y pago 13/13, determinismo 7/7; catálogo idéntico al de PG 15 (tablas, 32 funciones, 98 índices, 25 triggers, 57 políticas). Sin cambios en M24. Ver 02 |
| ¿Cómo se reconstruye? | `supabase db reset --remote=yomgxdjgfjnrjaqiarvw` desde el commit autorizado. **Ensayado** sobre una réplica de QA: elimina el legado, aplica M24 y seeds, sustituye el historial (sin `migration repair`), resultado idéntico a M24 y **pgTAP 290/290**. Ver 03 |
| Hallazgo crítico del ensayo | El reset **borra todos los usuarios de `auth`**, incluida la cuenta del propietario, y **conserva** el bucket `editorial_images` |
| Hallazgo sobre QA | El estado real de QA **no coincide** con su propio historial: hay cambios manuales que ninguna migración recoge |

## Riesgos de la reconstrucción
| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Pérdida de datos (todo `public` y todos los usuarios) | Copia B verificada por restauración antes de empezar; los datos son de prueba (decisión del propietario) |
| R2 | El ensayo usó el modo «URL»; QA usa el modo «referencia» del mismo comando | Verificación completa posterior (inventario + pgTAP) y plan de vuelta atrás |
| R3 | Cuenta del propietario eliminada | Recrearla y asignar el rol (04 §1.5) |
| R4 | Webhook antiguo activo durante la reconstrucción | Pausar la URL de eventos de Wompi antes (paso 3) |
| R5 | Correo de Auth limitado a 2/hora | SMTP propio o confirmación desactivada en QA (04 §1) |
| R6 | El código necesario (lista de permitidos con QA, frontend M27/M28) **no está en ningún commit** | Autorizar los commits antes de desplegar la función o construir el frontend QA |
| R7 | La vuelta atrás completa no está ensayada | Ensayarla en local si se considera necesaria (01 §7) |
| R8 | La prueba de concurrencia hace COMMIT | Se excluye en QA (278 pruebas); ya validada en local |

## Operaciones destructivas
1. `supabase db reset --remote=yomgxdjgfjnrjaqiarvw`: `public`, historial y **`auth.users`**.
2. Opcional: retirar el bucket `editorial_images` (1 imagen).
3. `supabase secrets set` (sustituye `WOMPI_EVENTS_SECRET`) y `supabase functions deploy` (sustituye la v3).
Detalle y vuelta atrás: 03 §5 y 01 §7.

## Comandos exactos (en orden; detalle y puntos de control en 03 §3)
    bash jm-qa-tools/backup_qa_owner.sh ~/jm-privado/qa-backup
    bash jm-qa-tools/restore_dump_local.sh ~/jm-privado/qa-backup/qa_<fecha> <copia lógica A>
    # Panel sandbox de Wompi: vaciar la URL de eventos
    supabase db reset --remote=yomgxdjgfjnrjaqiarvw
    node jm-qa-tools/inventory.mjs --target qa --via api --out <priv>/qa_post.json
    node jm-qa-tools/compare_inventory.mjs <línea base M24 PG17> <priv>/qa_post.json
    supabase migration list --remote=yomgxdjgfjnrjaqiarvw
    supabase test db --remote=yomgxdjgfjnrjaqiarvw $(ls supabase/tests/database/*.test.sql | grep -v 95_concurrency)
    # Panel: Auth (Site URL, Redirect URLs, SMTP), contraseñas de las cuentas de prueba
    supabase secrets set --env-file <fuera-del-repo>/qa-edge.env --remote=yomgxdjgfjnrjaqiarvw
    supabase functions deploy wompi-webhook --remote=yomgxdjgfjnrjaqiarvw
    # Panel sandbox de Wompi: URL de eventos → https://yomgxdjgfjnrjaqiarvw.supabase.co/functions/v1/wompi-webhook
    pnpm check:qa -- --file <qa.env> && pnpm build:qa -- --file <qa.env> && pnpm preview:qa -- --file <qa.env>

## Criterios de «QA reconstruido correctamente»
1. Comparación con la línea base M24 en PG 17: todo PASS (esquema, RPC, índices, triggers, RLS, roles, Storage);
   historial = solo `20261106120000`.
2. pgTAP en QA 278/278 (sin la prueba de concurrencia, ya validada 12/12 en local).
3. Catálogo visible con la llave anon; RPC admin con un cliente → 403.
4. Edge Function nueva, `verify_jwt=false`, `APP_ENV=qa`, firmas inválidas → 401.
5. Auth con redirecciones y correo operativos; admin y cliente inician sesión.
6. 12 recorridos de 05 en PASS, incluido el pago real en Wompi Sandbox.

## Tiempo estimado
Propietario ≈ 1,5–2 h (copia, panel, secretos, Wompi). Agente ≈ 5–7 h (verificación, adaptación de los recorridos a QA y
ejecución de las pruebas). Detalle en 03 §6.

## Herramientas creadas en M30 (locales, sin commit)
| Archivo | Uso |
|---|---|
| `jm-qa-tools/backup_logical_api.mjs` | Copia lógica de solo lectura con sumas de control calculadas en QA |
| `scripts/qa/restore_test_local.py` | Restauración real de la copia lógica en un stack local aislado y verificación |
| `jm-qa-tools/backup_qa_owner.sh` | Copia autoritativa del propietario (`pg_dump`, Storage, funciones, manifiesto SHA-256) |
| `jm-qa-tools/restore_dump_local.sh` | Restauración y verificación de la copia autoritativa |
| `jm-qa-tools/inventory.mjs`, `compare_inventory.mjs` | Ampliados con índices y triggers |

## Punto de control
**Preparación terminada. No se ejecutó ninguna modificación remota.** La reconstrucción real de QA espera la autorización
expresa del propietario, que debería cubrir: (1) los commits del código necesario (o el commit desde el que se reconstruye),
(2) la copia B y su restauración, (3) el reset de QA, (4) Auth/Storage/usuarios, (5) secretos y despliegue de la función,
(6) la URL de eventos de Wompi Sandbox.
