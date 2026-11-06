#!/usr/bin/env bash
# =============================================================================
# Validación local de la línea base J&M — PostgreSQL 16 sin Docker
# =============================================================================
# Crea un clúster PostgreSQL EFÍMERO, aplica el shim de Supabase, las migraciones
# de supabase/migrations, los seeds de QA y ejecuta las pruebas pgTAP.
# No se conecta a ningún servicio remoto.
#
# Requisitos: postgresql-16, postgresql-16-pgtap, postgresql-16-cron, pg_prove.
# Ejecutar como un usuario NO root (p. ej. `su postgres -c ./run_local.sh`).
#
# Variables opcionales:
#   PG_BIN   (por defecto /usr/lib/postgresql/16/bin)
#   WORKDIR  (por defecto /tmp/jm_db_test_$$)  — se borra al terminar salvo KEEP=1
#   PORT     (por defecto 54340)
#   OUTDIR   (por defecto $WORKDIR/out)        — logs y resultados
#   PG_SUPERUSER (por defecto postgres)         — superusuario del clúster efímero. Debe ser `postgres`, como en
#                Supabase: la migración base autoriza ciertas operaciones (p. ej. el cambio de rol de los
#                usuarios QA del seed) solo a `postgres`/`supabase_admin`. Antes se usaba el usuario del sistema
#                (`whoami`), lo que fallaba en GitHub Actions (usuario `runner`).
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
WORKDIR="${WORKDIR:-/tmp/jm_db_test_$$}"
PORT="${PORT:-54340}"
OUTDIR="${OUTDIR:-$WORKDIR/out}"
DB=jm_test
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"

mkdir -p "$WORKDIR" "$OUTDIR"
PSQL=(psql -X -q -h "$WORKDIR" -p "$PORT" -U "$PG_SUPERUSER" -v ON_ERROR_STOP=1)

cleanup() {
  "$PG_BIN/pg_ctl" -D "$WORKDIR/data" -m fast stop >/dev/null 2>&1 || true
  if [[ "${KEEP:-0}" != "1" ]]; then rm -rf "$WORKDIR/data"; fi
}
trap cleanup EXIT

step() { echo; echo "=== $* ==="; }

step "1. Clúster efímero"
"$PG_BIN/initdb" -D "$WORKDIR/data" -U "$PG_SUPERUSER" -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
cat >> "$WORKDIR/data/postgresql.conf" <<EOF
shared_preload_libraries = 'pg_cron'
cron.database_name = '$DB'
listen_addresses = ''
unix_socket_directories = '$WORKDIR'
port = $PORT
timezone = 'America/Bogota'
EOF
"$PG_BIN/pg_ctl" -D "$WORKDIR/data" -l "$OUTDIR/postgres.log" -w start >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB"

build_db() {   # $1 = nombre de BD
  "${PSQL[@]}" -d "$1" -f "$ROOT/supabase/local_shim/supabase_shim.sql" >/dev/null
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "  migración: $(basename "$f")"
    "${PSQL[@]}" -d "$1" --single-transaction -f "$f"
  done
  for f in "$ROOT"/supabase/seeds/*.sql; do
    echo "  seed: $(basename "$f")"
    "${PSQL[@]}" -d "$1" --single-transaction -f "$f" >/dev/null
  done
}

step "2. Reconstrucción desde cero (shim + migraciones + seeds)"
build_db "$DB" 2>&1 | tee "$OUTDIR/rebuild.log"

step "3. Pruebas pgTAP (funcionales, RPC y RLS)"
"${PSQL[@]}" -d "$DB" -c "CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions" >/dev/null
set +e
pg_prove -h "$WORKDIR" -p "$PORT" -U "$PG_SUPERUSER" -d "$DB" --ext .sql -v \
  $(ls "$ROOT"/supabase/tests/database/*.test.sql | grep -v concurrency) 2>&1 | tee "$OUTDIR/pgtap.log"
PGTAP_RC=${PIPESTATUS[0]}
set -e

step "4. Concurrencia real (2 conexiones, 1 unidad)"
"${PSQL[@]}" -d "$DB" -c "CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions" >/dev/null
set +e
pg_prove -h "$WORKDIR" -p "$PORT" -U "$PG_SUPERUSER" -d "$DB" --ext .sql -v \
  "$ROOT"/supabase/tests/database/*concurrency*.test.sql 2>&1 | tee "$OUTDIR/concurrency.log"
CONC_RC=${PIPESTATUS[0]}
set -e

step "5. Determinismo de seeds (dos reconstrucciones)"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB}_b"
build_db "${DB}_b" > "$OUTDIR/rebuild_b.log" 2>&1
fingerprint() {
  "${PSQL[@]}" -d "$1" -At -c "
    SELECT md5(string_agg(x, '|' ORDER BY x)) FROM (
      SELECT 'p:' || id || reference || slug || base_price || status FROM public.products
      UNION ALL SELECT 'v:' || id || sku || is_active FROM public.variants
      UNION ALL SELECT 'i:' || variant_id || stock || reserved FROM public.inventories
      UNION ALL SELECT 'img:' || product_id || coalesce(color_id::text,'-') || position || coalesce(external_url,storage_path) FROM public.product_images
      UNION ALL SELECT 'c:' || code || discount_type || discount_value || used_count FROM public.coupons
      UNION ALL SELECT 'u:' || id || coalesce(email,'') || role FROM public.profiles
      UNION ALL SELECT 'o:' || order_number || customer_email || status || total || discount_total || shipping_cost FROM public.online_orders
      UNION ALL SELECT 'oi:' || o.order_number || oi.sku || oi.quantity || oi.line_total
                FROM public.online_order_items oi JOIN public.online_orders o ON o.id = oi.order_id
    ) s(x)"
}
FP_1=$(fingerprint "${DB}_b")
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB}_c"
build_db "${DB}_c" > "$OUTDIR/rebuild_c.log" 2>&1
FP_2=$(fingerprint "${DB}_c")
echo "huella reconstrucción B: $FP_1"
echo "huella reconstrucción C: $FP_2"
if [[ "$FP_1" == "$FP_2" ]]; then DET_RC=0; echo "DETERMINISMO: OK"; else DET_RC=1; echo "DETERMINISMO: FALLA"; fi

step "Resumen"
echo "pgTAP funcional: rc=$PGTAP_RC | concurrencia: rc=$CONC_RC | determinismo: rc=$DET_RC"
echo "Logs en $OUTDIR"
# Cualquier código distinto de cero es fallo (la suma podría desbordar módulo 256 y dar 0)
exit $(( (PGTAP_RC | CONC_RC | DET_RC) != 0 ))
