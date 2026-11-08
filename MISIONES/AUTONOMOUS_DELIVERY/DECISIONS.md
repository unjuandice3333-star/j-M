# DECISIONS
- 2026-11-08: Usar vitest (compatible con Vite 5) para tests de handlers `api/` y stores. Tests en `apps/web/tests`.
- 2026-11-08: Rama de trabajo = `claude/gracious-pasteur-kv0bwc` (restricción del entorno), no `mission/m26-...`.
- Sin auditorías nuevas: se parte del estado de commits previos (hardening SEC-01/SEC-03).
- Observación (no cambiada): `signature.js` hace fallback a ANON key si falta SERVICE_ROLE; CORS `*`. Revisar en tarea de seguridad.
