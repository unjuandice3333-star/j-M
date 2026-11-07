# DECISIONS
- D-001 (2026-11-07): La rama autorizada `mission/m26-dev-qa-environments` no existe; el harness fija `claude/gracious-pasteur-bon1eq`. Se usa esta última. No se hace merge a main ni PR.
- D-002: Tests de handlers Wompi viven en `apps/web/tests/` (no en `api/`, para que Vercel no los trate como funciones).
- D-003: Runner único: vitest en la raíz (`pnpm test`).
