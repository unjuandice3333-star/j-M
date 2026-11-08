# DECISIONS
- D1: Work on `claude/gracious-pasteur-w9zkuc` (harness-mandated) since `mission/m26-dev-qa-environments` does not exist.
- D2: Use vitest (Vite-native) for unit/integration tests in `apps/web/tests`.
- D3: `api/wompi/signature.js` no longer falls back to the anon key as a service key; returns 500 if service credentials are missing. Unknown order returns 404 (was non-standard 444).
