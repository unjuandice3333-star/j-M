# Migraciones históricas (archivadas en M24B)

Estas 16 migraciones son el historial anterior a la línea base consolidada
`supabase/migrations/20261106120000_baseline_ecommerce.sql`. Se conservan **intactas**: se movieron con `git mv`, sin
modificar su contenido, para mantener el historial y la trazabilidad.

**No se ejecutan.** Supabase CLI solo aplica `supabase/migrations/`.

## Por qué se archivaron
- La cadena no se reconstruye desde cero. En la auditoría M23, `20260929000000_cleanup_pos_architecture.sql` y
  `20260930010000_fix_sizes_colors_rls_and_order_branch.sql` fallan.
- Dependen de columnas que ninguna migración crea (`online_orders.branch_id`, `inventory_movements.inventory_id`, …).
  Esto indica cambios aplicados fuera del control de versiones en los entornos remotos.
- Mezclan el legado POS con e-commerce y reescriben varias veces las mismas funciones.

## Relación con los entornos existentes
Los entornos remotos (QA / Production) pueden tener estas versiones registradas en
`supabase_migrations.schema_migrations`. La transición se hará según `MISION_24A/M24A_ESTRATEGIA_MIGRACIONES.md`:
- QA se recrea limpio.
- Production solo tras el diagnóstico de solo lectura y con aprobación humana.

**No ejecutar `supabase db push` contra QA ni Production desde esta rama.**

## Mapa objeto antiguo → nuevo
Ver `MISION_24A/M24A_MATRIZ_COMPATIBILIDAD.md` y `MISION_24B/M24B_COMPATIBILIDAD_FRONTEND_BACKEND.md`.
