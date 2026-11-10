# DECISIONS

- D-001 (2026-11-10): El prompt indica la rama `mission/m26-dev-qa-environments`, pero la sesión impone `claude/gracious-pasteur-q1u2gu` y la primera no existe en remoto. Se trabaja en la rama de la sesión; no se hace merge a main ni deploy a Production.
- D-002: Framework de pruebas = vitest 2 en `apps/web` (coherente con Vite 5 y con `packages/utils`).
- D-003: Las pruebas del webhook mockean `@supabase/supabase-js`; no tocan servicios remotos.
