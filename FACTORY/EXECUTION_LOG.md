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
| 2026-11-06 | M25 | orquestador | Verificación real de agentes (claude -p --agent) y reglas de denegación | 4/4 cargan; push, gh api, supabase link/db push, vercel y .env* denegados |
| 2026-11-06 | M25 | orquestador | Commit aff182e + CI completa con el árbol limpio | PASS 13/13 |
| 2026-11-06 | M25 | reviewer | Ronda 2 (aff182e): CAMBIOS REQUERIDOS (N1 mayor/bloq.) | Corregido en 5550c17 (CI PASS) |
| 2026-11-06 | M25 | reviewer | Ronda 3 (5550c17): CAMBIOS REQUERIDOS | Corregido en 9b6fc43 (CI PASS) |
| 2026-11-06 | M25 | reviewer | Ronda 4 (9b6fc43): CAMBIOS REQUERIDOS (D1, D2) | Corregido en 20a29c9 (CI PASS) |
| 2026-11-06 | M25 | reviewer | Ronda 5 (20a29c9): APROBADO CON MENORES (M1-M5) | Corregido en 5e48ede (CI PASS) |
| 2026-11-06 | M25 | reviewer | Ronda 6 (5e48ede): APROBADO CON MENORES (F1-F3) | Corregido en 876146a |
| 2026-11-06 | M25 | orquestador | Error propio: `git stash` accidental durante una prueba | Detectado y restaurado (`stash pop`); pruebas repetidas |
| 2026-11-06 | M25 | orquestador | Validación final sobre 876146a (árbol limpio): CI completa, autoprueba, actionlint | PASS 13/13 · 72/72 · exit 0 |
| 2026-11-06 | M25 | orquestador | Commit de documentación 29c6ab0 + validación completa sobre ese SHA | PASS 13/13 · 72/72 · actionlint 0 · árbol limpio |
| 2026-11-06 | M25 | orquestador | Verificación de cierre: 2 errores en la documentación ("11 commits" en vez de 7; autopruebas intermedias atribuidas a SHA exactos) | Corregidos en e2f1232 (validación completa PASS); el recuento volvió a quedar desactualizado por el propio commit y se reformuló sin autorreferencia |
| 2026-11-06 | M26 | orquestador | Plan de M26 en una rama y worktree separados (4944d93) | En curso |
| 2026-11-06 | M25 | orquestador | Push autorizado de db/baseline-m24b (3710615) y mission/m25-ci-governance (9fa7d4f) | OK. La integración de Vercel creó 4 despliegues Preview automáticos (ninguno en Production) |
| 2026-11-06 | M25 | GitHub Actions | Ejecución 42181794518 sobre 9fa7d4f | failure: db-local (superusuario del clúster ≠ postgres en el runner); el resto success |
| 2026-11-06 | M25 | orquestador | Corrección de run_local.sh (PG_SUPERUSER=postgres), verificada como runner y como postgres | 290/290, determinismo OK |
