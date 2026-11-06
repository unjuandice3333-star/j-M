# Registro de ejecución de la fábrica

Formato: fecha (UTC) · misión · actor · acción · resultado. Solo hechos verificados.

| Fecha | Misión | Actor | Acción | Resultado |
|---|---|---|---|---|
| 2026-11-06 | Preservación | orquestador | Commits c09a4a3 (documentos M23–M24 y logs) y 3710615 (informe de preservación) | OK |
| 2026-11-06 | Preservación | orquestador | Bundle de historia completa + restauración offline + inventario 180/180 | OK, entregado al propietario |
| 2026-11-06 | M25 | orquestador | Rama `mission/m25-ci-governance` desde 3710615 | OK |
| 2026-11-06 | M25 | orquestador | Herramientas de calidad: ESLint 9 (flat), tsconfig.ci, vitest, gitleaks, actionlint | lint 0 errores; typecheck 0; unit PASS |
| 2026-11-06 | M25 | orquestador | Corrección: el test del webhook usaba la opción `exports` no soportada por Node 22 → `namedExports` | 12/12 PASS |
| 2026-11-06 | M25 | orquestador | Primera CI full: 31_db_supabase FAIL por llaves de demostración en las evidencias | Detectado por la propia compuerta → redacción en origen |
| 2026-11-06 | M25 | orquestador | Primera autoprueba de compuertas: 9/9 "bloqueos", **falsos positivos** (worktree sin los scripts sin commit) | Detectado; autoprueba rediseñada con controles positivos y firmas |
| 2026-11-06 | M25 | orquestador | Autoprueba endurecida reveló 3 defectos reales: regex `[^\n]*` de la regla 6, gitleaks no funcionaba en worktrees, la exploración de directorios incluía ci-artifacts | Corregidos; autoprueba 17/17 |
| 2026-11-06 | M25 | orquestador | CI full (base db/baseline-m24b) | PASS 14/14 · pgTAP 290/290 · HTTP 39/39 · determinismo 7/7 |
| 2026-11-06 | M25 | reviewer (subagente de contexto nuevo) | Revisión independiente: CAMBIOS REQUERIDOS (4 bloqueantes, 6 mayores, 10 menores) | ver MISION_25/04_REVISION_INDEPENDIENTE.md |
| 2026-11-06 | M25 | orquestador | Corrección de los 20 hallazgos (atendidos o justificados) | ver MISION_25/04 |
| 2026-11-06 | M25 | orquestador | Autoprueba ampliada: 35/35 (11 positivos + 24 negativos) | OK |
| 2026-11-06 | M25 | orquestador | Verificación real de agentes (claude -p --agent) y reglas de denegación | 4/4 cargan; push, supabase link, vercel y .env* denegados |
