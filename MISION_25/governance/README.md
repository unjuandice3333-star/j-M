# Gobierno de GitHub — especificación (NO aplicada)

La fábrica **no** aplica estos cambios. Modifican permisos externos del repositorio, así que los aplica el
propietario después de autorizarlos (ENVIRONMENT_POLICY.md).

| Archivo | Contenido |
|---|---|
| `branch-protection.main.json` | `main`: PR obligatorio, check `ci-gate` estricto, 1 aprobación, revisión de CODEOWNERS, aprobación del último push, sin force-push ni borrado, admins incluidos |
| `branch-protection.develop.json` | Las mismas reglas para `develop` |
| `apply_branch_protection.sh` | Aplica ambas con `gh api` (exige `I_AM_THE_OWNER_AND_AUTHORIZE=yes`) |

## Requisitos previos (decisiones del propietario)
1. **Crear `develop`** en el remoto a partir de `main` (o de la rama que se decida integrar primero).
2. **Una segunda identidad revisora.** `CODEOWNERS` hoy solo lista `@unjuandice3333-star`. Si los agentes publican
   PRs con esa misma cuenta, GitHub no permite que se apruebe a sí misma. Con `enforce_admins: true` y
   `require_code_owner_reviews: true`, esos PRs quedarían sin poder integrarse. Opciones:
   (a) una cuenta de máquina distinta para los agentes y el propietario como revisor;
   (b) una segunda persona en CODEOWNERS;
   (c) bajar `required_approving_review_count` a 0 y confiar solo en `ci-gate` (no recomendado).
3. Ejecutar el workflow `ci` al menos una vez, para que el check `ci-gate` exista y se pueda exigir.
4. Ramas históricas `Principal` y `Director`: decidir si se congelan (protección con `lock_branch: true`) o se archivan.

## Estado verificado en M25
- No se aplicó ninguna protección ni ningún cambio de permisos. La sesión no hizo ninguna llamada `gh api` de escritura.
- `apply_branch_protection.sh` no se ejecutó.
