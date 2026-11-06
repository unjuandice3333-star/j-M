## Misión y alcance
- Misión: `MNN` · Rama: `agent/<rol>/mNN-<slug>` → `mission/mNN-<slug>`
- Qué cambia y por qué:

## Pruebas ejecutadas
<!-- Comandos reales y resultado. Adjunte o enlace ci-artifacts/REPORT.md. Un paso BLOCKED/SKIPPED no cuenta como aprobado. -->
| Compuerta | Resultado | Evidencia |
|---|---|---|
| lint / typecheck / unit | | |
| webhook / edge | | |
| build (+ bundle sin secretos) | | |
| política de migraciones | | |
| secretos (gitleaks) | | |
| BD PostgreSQL 16 (pgTAP) | | |
| BD Supabase local (test db + HTTP + determinismo) | | |

## Base de datos
- [ ] Sin migraciones nuevas
- [ ] Migración nueva con versión posterior a la última; las existentes no se modificaron
- [ ] Probada la reconstrucción desde cero dos veces con resultado idéntico

## Riesgos y reversión
-

## Lista de verificación
- [ ] Commits en formato Conventional Commits
- [ ] Sin secretos, `.env`, llaves ni `ci-artifacts/` en el diff
- [ ] Ninguna operación remota (push a QA/Production, `supabase link`, `db push`, despliegues)
- [ ] La revisión la hace un revisor distinto del autor (persona o agente `reviewer`)
- [ ] Documentación de la misión actualizada (`MISION_NN/`, `FACTORY/EXECUTION_LOG.md`)
