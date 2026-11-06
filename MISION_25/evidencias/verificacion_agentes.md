# Verificación real de los agentes (Claude Code 2.1.318, headless, 2026-11-06)

Cada prueba es una sesión real de Claude Code iniciada desde la raíz del repositorio (carga
`.claude/agents/*.md` y `.claude/settings.json`). Resultados transcritos de la salida JSON (`result` y `permission_denials`).

## 1. Carga de las definiciones y herramientas efectivas
Comando: `claude -p --agent <rol> --output-format json --max-turns 2 "Without calling any tool: list the exact names of the tools available to you..."`

| Agente | Herramientas efectivas | Rol reconocido |
|---|---|---|
| reviewer | Read, Bash | "revisor independiente … sin modificar archivos" |
| qa | Read, Bash | (verificado en las pruebas 2 y 3) |
| developer | Read, Edit, Write, Bash | "cambios mínimos y probados en `agent/developer/mNN-<slug>` … sin push, merge ni despliegues" |
| db-engineer | Read, Edit, Write, Bash | "migraciones nuevas e inmutables con RLS y pgTAP … solo en local" |

Nota: esta versión de Claude Code no expone Glob ni Grep como herramientas separadas (la búsqueda se hace con Bash).
Por eso no aparecen, aunque las definiciones los declaran. Ninguno de los roles de solo lectura recibe Edit ni Write.

## 2. Reglas de denegación (`.claude/settings.json`) — agente qa con `--allowedTools Bash Read`
| Llamada | Resultado de la capa de permisos |
|---|---|
| `git push --dry-run origin HEAD; echo …` | **DENEGADA** ("Permission to use Bash with command git push … has been denied") |
| `supabase link --help` | **DENEGADA** |
| `vercel --version` | **DENEGADA** |
| Read `./.env.example` | **DENEGADA** ("File is in a directory that is denied by your permission settings") |
| `ls scripts/ci` (control) | Ejecutada |
| Write `/tmp/qa_write_test.txt` | El agente no tiene la herramienta Write; el archivo no existe tras la prueba |

`supabase link`, `vercel deploy --prod`, leer `.env.local` y `gh api user` también los rechazó el propio agente por
su política de rol, ANTES de llegar a la capa de permisos. Esos casos se repitieron con variantes inocuas (`--help`,
`--version`, `.env.example`) para comprobar la capa de permisos, que los denegó. `gh api user` no se ejecutó (el agente
se negó); la regla `Bash(gh api:*)` existe pero esta prueba no la verificó.

## 3. Limitaciones verificadas o conocidas
- Las reglas de denegación comparan prefijos de comando. Una invocación ofuscada (por ejemplo, a través de un intérprete o
  de una variable) podría no coincidir. Los controles de fondo siguen siendo que la sesión no tiene credenciales remotas
  de Supabase/Vercel/Production y la regla 6 de la CI.
- Los roles qa y reviewer tienen Bash, que puede escribir archivos. Su condición de "solo lectura" es una política
  de rol (prompt) más la ausencia de Edit/Write, **no** un aislamiento técnico completo.
- Las definiciones de `.claude/agents/` se cargan al iniciar una sesión. Durante M25, la revisión independiente
  se hizo con un subagente `general-purpose` de contexto nuevo, con instrucciones equivalentes a las de `reviewer`.
