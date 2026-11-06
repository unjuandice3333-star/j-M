# M25 — Resultado de la revisión independiente

**Revisor:** subagente `general-purpose` de Claude Code con contexto nuevo. Recibió el código y los requisitos de la
misión, no las conclusiones del autor. Trabajó en modo de solo lectura (ejecutó `run_all.sh` quick y `gate_selftest.sh`).
**Veredicto recibido:** CAMBIOS REQUERIDOS: 4 bloqueantes, 6 mayores y 10 menores.
**Estado tras la primera ronda de correcciones (commit aff182e):** ver la tabla siguiente. La **segunda revisión** (§ Ronda 2)
confirmó 15 corregidos y 5 parciales, y encontró 3 defectos nuevos. Todos se atendieron en el commit siguiente. Ninguno se descartó.

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

## Ronda 2 — re-revisión de aff182e (mismo revisor, verificando el código y no la tabla anterior)
Veredicto: CAMBIOS REQUERIDOS. Resultado: 15 FIXED, 5 PARTIALLY FIXED (#4, #8, #9, #12, y #3/#10/#16 sin verificar en un runner) y 3 nuevos.

| # | Sev. | Hallazgo | Disposición | Corrección / prueba |
|---|---|---|---|---|
| N1 | Mayor (bloq.) | `echo "BASE_REF=$(resolve_base.sh)"` ignora el exit 2 bajo `bash -e`; además `run_all.sh` recurría a origin/* y, en un force-push a main, el merge-base era HEAD (rango vacío) | C+T | Workflow: `b=$(…) \|\| exit 2`. Demostrado: antes rc=0 y el paso continuaba; ahora rc=2. `run_all.sh`: sin respaldo a origin/* si `GITHUB_ACTIONS=true`. `resolve_base.sh`: exit 2 si la base resultante es HEAD. Prueba "push a la rama por defecto con before desconocido (rango vacío)" |
| N2 | Mayor | La verificación del workflow no detectaba `secrets['X']`, `toJSON(secrets)`, `pull_request_target` ni `write-all`; un PR puede borrar `trusted-policy` o quitarlo de la lista de `ci-gate` | C+T / P | Regex: `\bsecrets\b` en cualquier forma, `pull_request_target`, `workflow_run`, `write-all`, cualquier `: write`. Prueba "workflow con pull_request_target, write-all y toJSON(secrets)". Cada job es un check exigido en la protección de ramas (los nombres de job son estables). **Hueco residual documentado:** un PR que cambie los pasos de un job solo lo detiene la revisión de CODEOWNERS (segunda identidad pendiente) |
| N3 / #12 | Menor | Las PRs de Dependabot hacia main fallan la regla de flujo | C (decisión documentada) | Bots → develop permitido; hacia main se rechaza con un mensaje que indica `target-branch: develop`. No se añadió `dependabot.yml` (generaría PRs remotos: decisión del propietario) |
| #9 | Mayor | No detectaba `"$SB" link` ni `$CLI db push`; `--project-ref` solo en líneas con "supabase" | C+T | Cualquier variable (con o sin comillas o llaves) seguida de un subcomando remoto; `--project-ref`, `--db-url` y `--linked` en cualquier línea. Pruebas "variable entre comillas" y "variable con otro nombre" |
| #7 | Menor | trusted-policy y ci-gate no suben artefactos | Aceptado | Sus salidas son de una línea y quedan en el log del job; no generan informe propio |

## Ronda 3 — re-revisión de 5550c17
Veredicto: CAMBIOS REQUERIDOS. N1 y N3/#12 FIXED; resolve_base, N2 y #9 PARTIAL; 2 defectos nuevos (R1, R2).

| # | Sev. | Hallazgo | Disposición | Corrección / prueba |
|---|---|---|---|---|
| resolve_base | Mayor | Un push sin avance rápido con `before` conocido (retroceso o reescritura de main) daba un rango vacío y pasaba | C+T | `before` debe ser antecesor de HEAD; si no, exit 2. Un `before` desconocido distinto de cero → exit 2. Prueba "push sin avance rápido" y "before desconocido" |
| R1 | Menor/Mayor | La comprobación base == HEAD rompía pushes legítimos (rama nueva en un commit existente, dispatch en main) | C+T | Se decide por `before`: 000…/vacío → merge-base, y si es HEAD se acepta con aviso (las reglas independientes de la base se siguen aplicando). Pruebas positivas "rama nueva" y "dispatch sin commits nuevos" |
| N2 | Mayor | Quedaban sin detectar: `"write"` entre comillas, el estilo flujo `{ x: 'write' }`, `issue_comment` + `github.token` sin bloque permissions, la extensión `.YML` | C+T | Regex de escritura con comillas o en estilo flujo; `github.token`, `GITHUB_TOKEN`, `issue_comment` y `pull_request_review*` prohibidos; bloque `permissions:` de nivel superior obligatorio; workflows con `find -iname`. 5 pruebas nuevas |
| #9 | Mayor | Quedaban sin detectar: banderas globales (`--workdir`), espacios dobles, arreglos, listas de Python y **el envoltorio `sbr` del propio repositorio** | C+T | Los subcomandos remotos (`db push/pull/dump`, `functions deploy`, `secrets set/unset/list`, `migration repair`) se detectan por sí solos, sin exigir el prefijo; `link/login` en líneas que invocan la CLI; listas de argumentos entre comillas; alcance ampliado a `*.js`/`*.ts` de servidor. 5 pruebas nuevas, incluida "operación remota mediante el envoltorio sbr" |
| R2 | Menor | La autoprueba no cubría esas variantes | C | La autoprueba pasa de 39 a 52 controles |

## Ronda 4 — re-revisión de 9b6fc43
Veredicto: CAMBIOS REQUERIDOS. resolve_base, verificaciones de workflows y formas de invocación de la regla 6: FIXED.
Cobertura de la regla 6: PARTIAL. Defectos nuevos D1-D4.

| # | Sev. | Hallazgo | Disposición | Corrección / prueba |
|---|---|---|---|---|
| D1 | Mayor | No se detectaban comandos remotos naturales: `config push`, `projects delete`, `branches create`, `--project-id`, la API de gestión (`api.supabase.com`), `npx vercel --yes` ni el host interpolado `${ref}.supabase.co` | C+T | Nivel A ampliado (config push, projects, branches, postgres-config, network-restrictions, ssl-enforcement, sso, domains, snippets, backups, orgs, `--project-id`, API de gestión, host con referencia de 20 caracteres o interpolada); Vercel en posición de comando salvo `vercel dev`. 8 pruebas negativas nuevas |
| D2 | Mayor | Falsos positivos en código legítimo: `` `${origin}/login` ``, `["login","logout"]`, `echo "… link …"`, `git submodule --remote` | C+T | `link/login/logout` solo justo después de una invocación de la CLI (supabase, sbr o variable, con banderas intermedias); se eliminó `--remote` como bandera aislada; la forma de lista exige "supabase" en la misma llamada; los hosts ficticios de las pruebas (`mock.supabase.co`) no coinciden. Control positivo "código legítimo" |
| D3 | Menor | Un rebase normal de una rama mission/* hacía fallar el push | C+T | Sin avance rápido: exit 2 solo en ramas protegidas (main, develop, release/*); en el resto, merge-base con la rama por defecto. Pruebas positiva (mission rebasada) y negativa (main) |
| D4 | Menor | La rama por defecto borrada y recreada (before=000…) daba una base vacía | C+T | exit 2 si la rama del push es la rama por defecto y before=000…. Prueba "rama por defecto borrada y recreada" |
| — | — | `psql "$PROD_DATABASE_URL"` | Fuera de alcance (documentado) | Indistinguible estáticamente de una conexión local; la fábrica no tiene credenciales |

## Ronda 5 — re-revisión de 20a29c9
Veredicto: **APROBADO CON OBSERVACIONES MENORES**. D1-D4 FIXED. Sin hallazgos bloqueantes ni mayores. Sin caminos de
falso PASS en las compuertas que deciden un merge (evento PR + ci-gate). Cinco observaciones menores, todas corregidas:

| # | Sev. | Hallazgo | Disposición | Corrección / prueba |
|---|---|---|---|---|
| M1 | Menor | Subcomandos que operan sobre el proyecto enlazado sin detectar: `migration list/fetch`, `inspect db`, `storage cp`, `functions download`, `postgres-config get` | C+T | Añadidos (nivel A los inequívocos; `storage` en el nivel B). 4 pruebas negativas |
| M2 | Menor | `cmd=vercel; $cmd deploy` | C+T | Despliegue mediante variable (`$X deploy\|--prod\|promote\|alias`). Prueba negativa |
| M3 | Menor | Falsos positivos: `'vercel'` entre comillas como valor, y `secrets list`, `projects list` o `domains list` en cadenas o comentarios | C+T | Vercel solo en posición de comando, dentro de exec/spawn o como valor de un script de package.json. Los subcomandos ambiguos (projects, branches, secrets list, storage, sso, domains, snippets, backups, orgs) solo cuentan justo después de una invocación de la CLI. El control positivo de código legítimo incluye esas líneas. **Se mantiene a propósito:** una URL `${projectRef}.supabase.co` construida en el código falla, porque el servidor debe usar `SUPABASE_URL` del entorno |
| M4 | Menor | REF vacío se trataba como rama no protegida | C+T | REF vacío = protegida. Prueba negativa |
| M5 | Menor | En el push de una mission/* rebasada se comparaba con main en lugar de develop | C+T | Las ramas de trabajo se comparan con `origin/develop` si existe. Prueba positiva; la autoprueba guarda y restaura la referencia real de origin/develop (las referencias se comparten entre worktrees) |

## Ronda 6 — verificación final de 5e48ede
Veredicto: **APROBADO CON OBSERVACIONES MENORES**. M1-M5 FIXED; sin regresiones en las 37 sondas de operación remota, los
casos legítimos, la matriz de resolve_base ni las verificaciones de workflows. Sin hallazgos bloqueantes ni mayores.
Tres falsos positivos menores en el patrón de Vercel, corregidos:

| # | Sev. | Hallazgo | Disposición | Corrección / prueba |
|---|---|---|---|---|
| F1 | Menor | `` console.log(`${name} deploy started`) `` en apps/web/api | C+T | El despliegue mediante variable solo se busca en shell, Python y YAML |
| F2 | Menor | `{"platform": "vercel"}` en apps/web/api | C+T | La forma `"clave": "vercel …"` solo se busca en package.json |
| F3 | Menor | `git push "$REMOTE" deploy` | C+T | Se excluyen las líneas de git del despliegue mediante variable |

Las tres líneas forman parte del control positivo "código legítimo" de la autoprueba (72/72).

## Resumen de las seis rondas
| Ronda | Commit revisado | Veredicto | Bloq./Mayores abiertos al cerrar la ronda |
|---|---|---|---|
| 1 | árbol sin commit (base 3710615) | CAMBIOS REQUERIDOS (4 bloq., 6 mayores, 10 menores) | 0 (corregidos en aff182e) |
| 2 | aff182e | CAMBIOS REQUERIDOS (N1 mayor/bloq.) | 0 (5550c17) |
| 3 | 5550c17 | CAMBIOS REQUERIDOS | 0 (9b6fc43) |
| 4 | 9b6fc43 | CAMBIOS REQUERIDOS (D1, D2 mayores) | 0 (20a29c9) |
| 5 | 20a29c9 | APROBADO CON MENORES (M1-M5) | 0 (5e48ede) |
| 6 | 5e48ede | APROBADO CON MENORES (F1-F3) | 0 (commit final) |

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
