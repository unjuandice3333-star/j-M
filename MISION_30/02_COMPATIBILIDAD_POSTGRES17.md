# M30 — 02. Compatibilidad de la línea base M24 con PostgreSQL 17

> **M30.2:** las herramientas operativas citadas aquí (`inventory.mjs`, `compare_inventory.mjs`, `backup_logical_api.mjs`, `backup_qa_owner.sh`, `restore_dump_local.sh`) no se versionan en el repositorio (regla 6 de `20_migrations_policy`: ningún ejecutable versionado puede contener operaciones remotas de Supabase). Se entregan aparte como kit `jm-qa-tools` con sus huellas SHA-256; ver `MISION_30_2/00_DECISION_Y_VERSIONADO.md`.

**Resultado: compatible.** M24 (`supabase/migrations/20261106120000_baseline_ecommerce.sql`, SHA-256
`df81f30395ec9cb8e60fbe1eb0073d843c7da56b0dfaa076a61d906916638990`, sin modificar) se aplica y supera todas las pruebas en PostgreSQL 17, y su catálogo es idéntico al de PG 15.

## Entorno
- Copia aislada del repositorio (`project_id = jm-pg17`), con un único cambio de configuración: `major_version = 17`.
  La línea base, los seeds y las pruebas son los del repositorio, byte a byte.
- Imagen `supabase/postgres:17.11.0.011` (PostgreSQL 17.11). QA usa 17.11.0.003: misma versión menor de PostgreSQL.
- Mismo guion de la CI (`scripts/ci/db_supabase.sh`): start → reset → pgTAP → HTTP → pedido y pago → reconstrucción →
  determinismo.

## Resultados
| Prueba | PG 15 (CI histórica) | PG 17 |
|---|---|---|
| Aplicación de M24 + seeds | OK | OK, 0 advertencias |
| pgTAP (funcionales, RPC, RLS, **concurrencia**) | 290/290 | **290/290** |
| HTTP (PostgREST, GoTrue, Storage) | 44/44 | **44/44** |
| Pedido y pago de extremo a extremo (handlers reales de `/api/wompi`) | 13/13 | **13/13** |
| Determinismo (dos reconstrucciones) | 7/7 | **7/7** |

Comparación del catálogo PG 17 frente a PG 15 (`jm-qa-tools/inventory.mjs` + `compare_inventory.mjs`):

| Objeto | Resultado |
|---|---|
| Tablas y columnas (34 + 2 vistas) | idénticas |
| Funciones (32, incluido el hash del cuerpo y permisos anon/authenticated) | idénticas |
| Triggers (25) | idénticos |
| Índices (98, definición completa) | idénticos |
| Políticas RLS (57, hash de la definición) | idénticas |
| Enums, buckets, roles, datos de referencia | idénticos |

Además, la réplica de QA reconstruida con M24 en PG 17 (ensayo de `03_PROCEDIMIENTO_RECONSTRUCCION.md`) supera las
**290 pruebas pgTAP** y su catálogo es idéntico a la línea base.

## Incompatibilidades
Ninguna. No se proponen cambios en M24 ni migraciones correctivas.

## Propuesta (no aplicada; requiere su autorización)
- `supabase/config.toml`: `major_version = 15` → `17`, para que el stack local coincida con QA. Es configuración, no la
  línea base. Efecto: el desarrollo local y la etapa `31_db_supabase` de la CI pasarían a PG 17.
- Mantener la etapa `30_db_local_pg16` (clúster PG 16 sin Docker) como segunda versión probada.
