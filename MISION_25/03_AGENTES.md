# M25 — Agentes

| Agente | Archivo | Herramientas efectivas (verificadas) | Escritura | Aislamiento |
|---|---|---|---|---|
| developer | `.claude/agents/developer.md` | Read, Edit, Write, Bash | Sí, en `agent/developer/mNN-*` | worktree propio |
| db-engineer | `.claude/agents/db-engineer.md` | Read, Edit, Write, Bash | Sí (solo migraciones nuevas) | worktree propio |
| qa | `.claude/agents/qa.md` | Read, Bash | No (sin Edit/Write) | worktree propio |
| reviewer | `.claude/agents/reviewer.md` | Read, Bash | No (sin Edit/Write) | solo lectura |

Reglas de denegación del proyecto (`.claude/settings.json`), aplicables a toda sesión y subagente: `git push`,
`git remote add|set-url`, `gh pr merge|api|secret|workflow run|repo edit`, `supabase link|db push|functions deploy|secrets|login`
(también con `npx`), `vercel`, y la lectura de `.env*` y `supabase/.temp/`.

**Verificación real:** `evidencias/verificacion_agentes.md`. Las cuatro definiciones cargan con
`claude -p --agent <rol>`; la capa de permisos denegó push, `supabase link`, `vercel` y la lectura de `.env.example`; el
agente qa no pudo crear archivos con Write.

**Lo que NO se afirma:** no existe todavía una fábrica multiagente operando de forma autónoma. Hay definiciones
utilizables y verificadas, un orquestador que delega en subagentes reales (usado en la revisión independiente) y
compuertas automáticas. El primer ciclo completo developer → qa → reviewer sobre una tarea de producto es el objetivo de M35.
