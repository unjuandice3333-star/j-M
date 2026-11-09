# DECISIONS
- D-001 (2026-11-09): La rama `mission/m26-dev-qa-environments` no existe; el harness de la sesión autoriza solo `claude/gracious-pasteur-inoz2c`. Se usa esta. No se hace merge a main ni PR.
- D-002: vitest elegido como runner (ya es Vite 5). Tests en `apps/web/tests/`, handlers serverless probados con Supabase mockeado.
- D-003: `cartStore.js` (POS legado) no se toca; el carrito de la tienda es `eCommerceStore`.
