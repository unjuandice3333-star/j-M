# Arquitectura de la fábrica

```
                 ┌──────────────────────────────────────────┐
  Propietario ──▶│ ORQUESTADOR (sesión principal Claude Code)│── autorizaciones: push, merge, QA, despliegue
                 └──────┬──────────────┬──────────────┬─────┘
                        │ Agent tool   │ Agent tool   │ Agent tool (contexto nuevo, sin conclusiones previas)
                 ┌──────▼─────┐ ┌──────▼─────┐ ┌──────▼──────┐
                 │ developer  │ │ db-engineer│ │ reviewer/qa │
                 │ worktree   │ │ worktree   │ │ solo lectura│
                 │ agent/...  │ │ agent/...  │ │ + pruebas   │
                 └──────┬─────┘ └──────┬─────┘ └──────┬──────┘
                        └──────── commits locales ────┘
                                     │
                       mission/mNN-<slug>  ──(PR + ci-gate + revisión)──▶ develop ──▶ release/* ──▶ main
                                     │
                     scripts/ci/run_all.sh  ==  .github/workflows/ci.yml  (mismas compuertas)
```

## Componentes reales (no simulados)
| Componente | Implementación | Ubicación |
|---|---|---|
| Orquestador | Sesión principal de Claude Code | — |
| Agentes especializados | Definiciones de subagente de Claude Code | `.claude/agents/{developer,qa,reviewer,db-engineer}.md` |
| Aislamiento | `git worktree` por agente (Agent tool `isolation: "worktree"` o `git worktree add`) | ramas `agent/<rol>/mNN-<slug>` |
| Compuertas | Scripts bash idénticos en local y en GitHub Actions | `scripts/ci/`, `.github/workflows/ci.yml` |
| Autoprueba de compuertas | Inyección de defectos en un worktree efímero, con controles positivos | `scripts/ci/gate_selftest.sh` |
| Evidencias | `ci-artifacts/` (REPORT.md, results.tsv, environment.txt, logs) y copia en `MISION_NN/evidencias/` | — |
| Gobierno | CONTRIBUTING.md, plantilla de PR, CODEOWNERS, especificación de protección de ramas | raíz, `.github/`, `MISION_25/governance/` |

## Estado real de la fábrica (sin exagerar)
La fábrica **no** es todavía un sistema multiagente que opere de forma autónoma y continua. Lo que existe y está verificado:
- Un orquestador (sesión principal) que delega en subagentes reales mediante el Agent tool. En M25 se usó para la
  revisión independiente.
- Cuatro definiciones de agente que cargan y funcionan en sesiones reales de Claude Code, con herramientas
  delimitadas y reglas de denegación probadas (`MISION_25/evidencias/verificacion_agentes.md`).
- Compuertas automáticas idénticas en local y en GitHub Actions, con una autoprueba de 35 controles.
Todavía no ha funcionado ningún ciclo completo developer → qa → reviewer → integración sobre una tarea de producto.
Eso es el objetivo de la misión piloto M35.

## Capacidades y limitaciones reales (verificadas en esta sesión)
- **Disponible:** Agent tool con subagentes de contexto nuevo (`general-purpose`, `Explore`, `Plan`) y aislamiento `worktree`; `git worktree` local.
- **Verificado:** `claude -p --agent <rol>` carga las cuatro definiciones. Herramientas efectivas: reviewer y qa = Read y Bash; developer y db-engineer = Read, Edit, Write y Bash (en esta versión, Glob y Grep no son herramientas separadas).
- **Reglas de denegación del proyecto** (`.claude/settings.json`): `git push`, `gh api`/`pr merge`/`secret`, `supabase link|db push|functions deploy|secrets|login`, `vercel` y la lectura de `.env*` se deniegan a toda sesión y subagente del proyecto. Verificado: push, `supabase link`, `vercel` y `.env.example` denegados por la capa de permisos.
- **Las definiciones de `.claude/agents/` se cargan al iniciar una sesión.** Las creadas durante M25 no aparecen en esta sesión. Mientras tanto, el orquestador lanza un subagente `general-purpose` con el contenido del rol como instrucción. Es el mismo aislamiento de contexto, pero sin restricción de herramientas por definición.
- **Workflow multiagente** (orquestación de muchos agentes): requiere que el propietario lo autorice explícitamente. No se usó.
- **Paralelismo:** varios subagentes pueden correr a la vez, pero comparten la máquina: Docker y los puertos de Supabase local (5432x) admiten **un solo stack a la vez**. Las compuertas de BD se serializan.
- **Sin acceso remoto:** la sesión no puede (ni debe) hacer push. Los entregables quedan en commits locales y bundles.
- **Una sola máquina efímera:** sin bundles exportados, el trabajo se pierde al reciclarse el contenedor.
