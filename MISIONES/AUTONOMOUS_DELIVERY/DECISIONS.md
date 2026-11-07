# DECISIONS
- D1 (2026-11-07): Rama de trabajo = `mission/m26-dev-qa-environments`. La rama de sesión `claude/gracious-pasteur-rb0qht` estaba en main sin el trabajo M24–M30.
- D2: Vitest solo ejecuta paquetes/src; `scripts/**/*.test.mjs` usan node:test (`pnpm test:env`).
- D3: Production, pagos reales, `db reset --linked`, POS y merge a main quedan fuera de alcance.
- D4 (2026-11-07): `.claude/settings.json` v2.1 aplicado: push permitido solo con los comandos exactos a `mission/m26-dev-qa-environments`; se retiró `Bash(git push origin :*)` porque como prefijo habría anulado el allow.
- D5: Avisos de ESLint corregidos sin desactivar reglas: se eliminó código muerto; `KpiCard` usa `const Icon = icon` (el lint no detecta el uso en JSX); en Inventario se añadió el campo de búsqueda que faltaba (`setSearchQuery` nunca se usaba).
- D6: Las dependencias de pruebas de BD (postgresql-16-pgtap, postgresql-16-cron, pgtap-perl) se instalan con apt en cada contenedor nuevo; no forman parte del repo.
