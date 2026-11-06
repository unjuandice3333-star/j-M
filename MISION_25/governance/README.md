# Gobierno de GitHub — especificación (NO aplicada)

La fábrica **no** aplica estos cambios. Modifican permisos externos del repositorio, así que los aplica el
propietario después de autorizarlos (ENVIRONMENT_POLICY.md).

| Archivo | Contenido |
|---|---|
| `branch-protection.main.json` | `main`: PR obligatorio, checks exigidos `ci-gate` + cada job (`governance`, `quality`, `security`, `trusted-policy`, `db-local`, `db-supabase`) en modo estricto, 1 aprobación, revisión de CODEOWNERS, aprobación del último push, sin force-push ni borrado, admins incluidos |
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

## Por qué se exige cada job y no solo `ci-gate`
El workflow que se ejecuta en un PR es **el del PR**. Un PR podría borrar un job o quitarlo de la lista de `ci-gate`.
La lista de checks exigidos vive en la configuración de la protección de ramas (no en el PR), así que exigir
cada job por nombre hace que un job borrado o renombrado deje el PR sin poder integrarse. Quedan dos huecos:
un PR que **modifique los pasos** de un job (manteniendo el nombre) y un PR que modifique el job `trusted-policy`.
Solo los cierra la revisión obligatoria de CODEOWNERS sobre `.github/` y `scripts/ci/`, que requiere la segunda identidad revisora.

## Dependabot / Renovate
Las ramas de bots se aceptan por nombre, pero la regla de flujo solo permite `release/*` y `hotfix/*` hacia `main`.
Si se activa Dependabot, debe configurarse con `target-branch: develop`. La fábrica no añadió `.github/dependabot.yml`
porque activarlo genera PRs automáticos en el remoto (decisión del propietario).

## Estado verificado en M25
- No se aplicó ninguna protección ni ningún cambio de permisos. La sesión no hizo ninguna llamada `gh api` de escritura.
- `apply_branch_protection.sh` no se ejecutó.
