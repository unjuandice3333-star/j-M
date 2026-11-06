# M25 — Resultado de la revisión independiente

**Revisor:** subagente `general-purpose` de Claude Code con contexto nuevo. Recibió el código y los requisitos de la
misión, no las conclusiones del autor. Trabajó en modo de solo lectura (ejecutó `run_all.sh` quick y `gate_selftest.sh`).
**Veredicto recibido:** CAMBIOS REQUERIDOS: 4 bloqueantes, 6 mayores y 10 menores.
**Estado tras las correcciones:** 18 corregidos con prueba de regresión, 2 corregidos parcialmente (la parte restante
depende de decisiones o permisos del propietario). Ninguno se descartó.

Leyenda de disposición: **C** corregido · **C+T** corregido y cubierto por la autoprueba · **P** parcial (la parte pendiente está justificada).

| # | Sev. | Hallazgo (resumen) | Disposición | Corrección / prueba |
|---|---|---|---|---|
| 1 | Bloq. | La regla 6 analizaba `.github/` completo, y la plantilla de PR (texto `supabase link`) hacía fallar la propia CI | C+T | La regla 6 solo analiza archivos ejecutables (`git ls-files` de `*.sh, *.mjs, *.py, *.yml, *.toml, package.json, .husky/*`); control positivo "migraciones" |
| 2 | Bloq. | `check_commits.sh` con base desconocida → "OK" con 0 commits | C+T | `rev-parse --verify` de base y head, salida de git capturada con `|| exit 2`; prueba "commits: base desconocida no se aprueba" |
| 3 | Bloq. | `migrations_policy.sh` con base no resoluble, o con base anterior a M24B, desactivaba las reglas 3-5 | C+T | Base no resoluble → exit 2. Excepción ligada al SHA 91830903: se valida base→padre(M24B) y M24B→árbol. La regla 5 se aplica siempre. Pruebas "base inexistente", "migrations_legacy", "versión anterior" |
| 4 | Bloq. | En `push`, la política solo comparaba con `HEAD~1` | C+T | `resolve_base.sh`: PR → base.sha; push → `before`, o merge-base con la rama por defecto si es 000…/desconocido; nunca HEAD~1. Pruebas de resolve_base (positiva y negativa) |
| 5 | Mayor | Instantáneas obsoletas podían dar "determinismo: OK" | C | `rm -rf $OUT` al inicio; fallo de instantánea → fail; la comparación exige archivos no vacíos |
| 6 | Mayor | El informe atribuía al SHA resultados de un árbol con cambios sin commit; reglas 3-5 comparaban HEAD con HEAD; la política no veía los cambios sin commit | C+T | Trazabilidad completa en REPORT.md/verdict.txt (SHA, rama, estado del árbol, lista y diff, `evidence_valid`), `REQUIRE_CLEAN=1`; la política compara contra el árbol de trabajo. Pruebas "edición SIN commit" y "REQUIRE_CLEAN" |
| 7 | Mayor | Los jobs de GitHub no subían evidencias; GitHub no ejecutaba `run_all.sh` | C | Cada job ejecuta `run_all.sh` con `CI_STAGES` y sube `ci-artifacts/` (`if: always()`) |
| 8 | Mayor | Un PR puede neutralizar sus propias compuertas; CODEOWNERS con una sola cuenta; nada impedía `secrets.` en el workflow | P (+T) | Job `trusted-policy` (política de la rama base sobre el PR); la regla 6 prohíbe `secrets.`, `environment:` y permisos de escritura (prueba "el workflow usa secretos"). **Pendiente del propietario:** una segunda identidad revisora (ver `governance/README.md`) |
| 9 | Mayor | La regla 6 no detectaba `functions deploy`, `--project-ref`, `secrets set`, `db dump/pull`, `migration repair`, URLs del proyecto ni la indirección `$SB link`; alcance de rutas corto | C+T (límite documentado) | Patrones ampliados, indirección por variable `*SB*`, URLs `*.supabase.co` y del pooler, `vercel deploy/env/link`; alcance: todo archivo ejecutable versionado o nuevo. Pruebas "operación remota en un script" e "invocada mediante una variable". La ofuscación arbitraria es indetectable por regex (ver 06) |
| 10 | Mayor | El bundle no se verificaba por VALORES de secretos | C+T | `build.sh` decodifica los JWT del bundle (falla si role ≠ anon) y ejecuta gitleaks sobre `dist/` sin la allowlist. Prueba "VALOR de un JWT service_role" |
| 11 | Menor | Sin validación del título del PR (squash); push de rama nueva solo HEAD~1 | C+T | `PR_TITLE` validado; rama nueva → merge-base con la rama por defecto. Prueba "título de PR" |
| 12 | Menor | Las ramas de dependabot/renovate se rechazaban | C | Aceptadas explícitamente |
| 13 | Menor | "Nada directo a main" no se hacía cumplir | C+T | `check_branch_name.sh <rama> <destino>`: main ← release/hotfix; release ← fix/hotfix; mission ← agent. Prueba "feat/* directo a main" |
| 14 | Menor | El perfil quick mostraba "PASS" | C | Veredicto "PASS PARCIAL (n compuertas SKIPPED)" |
| 15 | Menor | Las versiones se registraban antes de instalar | C | `env_report.sh` al final |
| 16 | Menor | Ruta del informe de gitleaks fija; imagen y acciones fijadas solo por etiqueta; propiedad de archivos en Docker | C (1 sin verificar) | `$OUT`; imagen por digest `sha256:0e99e882…`; acciones por SHA de commit; contenedor con `--user $(id -u):$(id -g)`. Sin verificar: comportamiento en el runner de GitHub (requiere push) |
| 17 | Menor | La redacción dependía del formato JSON | C | Redacción también para el formato tabla/texto (probada con muestras) y verificación final ampliada |
| 18 | Menor | `run_local.sh`: la suma de códigos de salida podía desbordar a 0 | C | `exit $(( (A|B|C) != 0 ))` |
| 19 | Menor | Autoprueba: archivos borrados y huecos de cobertura | C+T (alcance documentado) | Borrados manejados; de 17 a 35 controles: webhook (positivo), ci-gate, resolve_base, base desconocida, árbol de trabajo, título de PR, `.env.local`, flujo de ramas, REQUIRE_CLEAN. Las etapas de BD no tienen control negativo en la autoprueba (son lentas); tienen aserciones propias (MIN_TESTS, instantáneas) |
| 20 | Menor | Normas sin control automático presentadas como si lo tuvieran | C | Mínimo de 290 pruebas exigido en ambas etapas de BD (`MIN_TESTS`); CONTRIBUTING §7 separa los controles automáticos de los manuales; AGENT_ROLES distingue control técnico y de proceso |

## Puntos que el revisor marcó como "sin verificar" y siguen así
- La instalación de `postgresql-16-pgtap` y `postgresql-16-cron` en ubuntu-24.04, que `supabase/setup-cli` instale la 3.0.0
  y el comportamiento de gitleaks en el runner de GitHub. Verificarlos exige ejecutar el workflow en GitHub, es decir,
  **hacer push**, que necesita autorización. actionlint valida la sintaxis y la semántica del workflow (exit 0).

## Hallazgos propios del orquestador durante M25 (antes de la revisión)
- La primera autoprueba daba **falsos positivos**: el worktree no contenía los scripts sin commit. Se corrigió con
  controles positivos y firmas de error esperadas.
- La regex `[^\n]*` de la regla 6 dejaba pasar `supabase functions deploy --linked`.
- gitleaks no funcionaba en worktrees (el `.git` es un archivo con ruta absoluta) y analizaba `ci-artifacts/`.
- Las evidencias contenían llaves locales de demostración. La compuerta lo detectó y se añadió redacción en origen.
