# M25 — CI, ramas y gobierno · Informe ejecutivo

**Estado: TERMINADA EN LOCAL. Se cumplen todos los criterios de aceptación verificables sin operaciones remotas.**
Quedan pendientes cuatro acciones que requieren autorización o decisión del propietario (§5).

- **Rama:** `mission/m25-ci-governance` (local, sin publicar), creada desde `3710615` (preservación de M24).
- **Commit definitivo de código:** `876146a` (validación final con el árbol limpio: CI completa PASS 13/13, autoprueba 72/72, actionlint 0).
- **Commit de documentación final:** el que contiene este informe. Solo añade documentación y evidencias; sus métricas
  se verifican de nuevo sobre él y se entregan fuera del repositorio (un commit no puede contener su propia evidencia).

## 1. Qué se construyó
| Área | Entregable |
|---|---|
| CI | `scripts/ci/run_all.sh` como único punto de entrada (local y GitHub): 13 compuertas en 5 etapas, con trazabilidad del árbol (`evidence_valid`) · `.github/workflows/ci.yml` (un job por etapa, artefactos, `trusted-policy`, `ci-gate`, acciones fijadas por SHA, solo lectura, sin secretos) |
| Seguridad | Política de migraciones inmutables y de operaciones remotas (regla 6) · gitleaks fijado por digest · bundle sin nombres ni valores de secretos · redacción de llaves en las evidencias |
| BD | Reconstrucción determinista y ≥290 pruebas pgTAP en PostgreSQL 16 y en el stack oficial de Supabase local, más 39 verificaciones HTTP |
| Gobierno de Git | `CONTRIBUTING.md` (ramas, flujo, Conventional Commits, PR, integración, separación entre desarrollo y liberación) · plantilla de PR · CODEOWNERS · protección de main y develop especificada (**no aplicada**) |
| Agentes | 4 definiciones en `.claude/agents/` verificadas en sesiones reales · reglas de denegación del proyecto verificadas · `FACTORY/` (8 documentos) |
| Autoprueba | `gate_selftest.sh`: 72 controles (16 positivos y 56 negativos con firma) que demuestran que cada compuerta pasa con código limpio y bloquea su defecto |

## 2. Revisión independiente
Seis rondas con un subagente de contexto nuevo que revisa el código, no los resúmenes. 37 hallazgos distintos: 4
bloqueantes, 10 mayores y 23 menores. **Todos están corregidos o justificados, sin bloqueantes ni mayores abiertos.**
Veredicto final: APROBADO CON OBSERVACIONES MENORES, y esas observaciones también se corrigieron (ver 04).

## 3. Pruebas (detalle en 05)
Lint, typecheck, build, unitarias (6/6), webhook (12/12 + 12/12), política de migraciones, Supabase (290/290), HTTP
(39/39), determinismo (7/7 y PG16), autoprueba (72/72), actionlint y perfil completo: **todo PASS sobre 876146a con el árbol limpio**.

## 4. Verificaciones de gobierno (instrucción 5 del propietario)
| Comprobación | Resultado |
|---|---|
| Los cambios de M25 están en `mission/m25-ci-governance` | Sí: desde 3710615, 6 commits de código (aff182e…876146a) seguidos de commits que solo añaden documentación y evidencias (lista exacta: `git log --oneline 3710615..mission/m25-ci-governance`). Respecto a origin/main, la rama incluye además los 5 commits de M24. M24 (`db/baseline-m24b`) no se modificó |
| Production no se modificó | Sí: no hubo ninguna conexión, credencial ni operación remota (la sesión no tiene credenciales; reglas de denegación activas) |
| Sin cambios externos de permisos | Sí: no se ejecutó `apply_branch_protection.sh` ni ninguna llamada `gh api` de escritura; no hubo push |
| Workflows con permisos mínimos | Sí: `permissions: contents: read`, sin secretos ni entornos (la regla 6 lo exige y la autoprueba lo demuestra) |
| Los agentes no pueden desplegar ni operar sobre Production | Verificado en la capa de permisos (push, gh api, supabase link/db push, vercel y `.env*` denegados); límites en 06 |
| Protección de ramas documentada, no aplicada | Sí: `governance/` |

## 5. Pendiente del propietario (no se puede hacer sin autorización)
1. **Push** de `mission/m25-ci-governance` (y `db/baseline-m24b`) y ejecución real del workflow en GitHub, para verificar los 4 puntos "no verificados".
2. **Aplicar la protección de ramas** (`governance/apply_branch_protection.sh`) y crear `develop`.
3. **Segunda identidad revisora** para CODEOWNERS (cuenta de máquina para los agentes o un segundo revisor).
4. Decidir el destino de las ramas históricas `Principal` y `Director`.

## 6. Limitaciones principales (detalle en 06)
La regla 6 es heurística (no detecta comandos construidos en tiempo de ejecución) · qa y reviewer tienen Bash (no son
técnicamente de solo lectura) · un PR puede alterar los pasos de su propio workflow hasta que haya revisión obligatoria
de CODEOWNERS · el workflow no se ha ejecutado en GitHub · no existe aún una fábrica multiagente operando de forma
autónoma: hay agentes verificados y compuertas; el primer ciclo completo es M35.

## 7. Siguiente misión
**M26 — Entornos aislados de desarrollo y QA.** El plan ya está en una rama separada
(`mission/m26-dev-qa-environments`, `MISION_26/00_PLAN.md`). La implementación local continúa allí; crear el proyecto QA
requiere autorización.
