# DECISIONS
- D1 (2026-11-07): Rama de trabajo = `mission/m26-dev-qa-environments`. La rama de sesión `claude/gracious-pasteur-rb0qht` estaba en main sin el trabajo M24–M30.
- D2: Vitest solo ejecuta paquetes/src; `scripts/**/*.test.mjs` usan node:test (`pnpm test:env`).
- D3: Production, pagos reales, `db reset --linked`, POS y merge a main quedan fuera de alcance.
