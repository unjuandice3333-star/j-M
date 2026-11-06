# Guía de recuperación

## Fuentes de recuperación
1. **Commits locales** en `db/baseline-m24b` (M24, preservación) y `mission/m25-ci-governance` (M25).
2. **Bundles git** entregados al propietario (historia completa; verificables offline).
   - `jm-fashion-store_db-baseline-m24b_3710615.bundle` — sha256 `3784917e6a8f70b811ffd65593259febbf5f1a6f48071b2294e3ec71fa6e172f`
   - Bundle de M25: ver `MISION_25/05_INFORME_FINAL.md`.
3. Inventarios SHA-256: `PRESERVACION_M24/INVENTARIO_M24.sha256`.

## Restaurar desde un bundle
```bash
git bundle verify jm-fashion-store_<rama>_<sha>.bundle
git clone jm-fashion-store_<rama>_<sha>.bundle jm-restaurado
cd jm-restaurado && git log --oneline -8
sha256sum -c PRESERVACION_M24/INVENTARIO_M24.sha256 --quiet && echo "inventario OK"
```

## Verificar que lo restaurado funciona
```bash
pnpm install --frozen-lockfile
bash scripts/ci/run_all.sh        # veredicto PASS esperado
bash scripts/ci/gate_selftest.sh  # 35/35 esperado
```

## Fallos frecuentes
| Síntoma | Causa | Solución |
|---|---|---|
| `31_db_supabase` BLOCKED | Docker detenido o Supabase CLI ausente | Iniciar `dockerd`; `SUPABASE_BIN=<ruta>` |
| `15_edge_tests` BLOCKED | Deno ausente | `DENO_BIN=<ruta>` |
| `30_db_local_pg16` falla como root | initdb no corre como root | `run_all.sh` usa `su postgres`; dé permiso de lectura al repositorio |
| Puertos 5432x ocupados | Otro stack de Supabase activo | `supabase stop --no-backup` |
| Worktree huérfano tras abortar la autoprueba | Se interrumpió antes de `trap` | `git worktree prune; git branch -D ci-selftest/<pid>` |
