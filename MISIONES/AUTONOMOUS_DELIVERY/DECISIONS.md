# DECISIONS
- D-001 (2026-11-08): La rama `mission/m26-dev-qa-environments` no existe en remoto y el entorno obliga a empujar a `claude/gracious-pasteur-2ouyqw`. Se trabaja en esta última; el propietario puede crear la rama de misión desde ella.
- D-002: Tests del webhook usan `mock.module` con `namedExports` (compatible Node 22) y la bandera `--experimental-test-module-mocks`.
- D-003: No se ejecutan auditorías nuevas; se parte de los commits de hardening previos (SEC-01, SEC-03, checkout, auth).
