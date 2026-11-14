#!/usr/bin/env bash
# =============================================================================
# Ejecución 133 — PostgREST REAL contra PostgreSQL 16 local (sin el stack completo de Supabase)
# =============================================================================
# Clúster efímero (shim + migraciones + seeds, como run_local.sh) escuchando solo en 127.0.0.1, rol `authenticator`
# como en Supabase y el contenedor oficial de PostgREST (red del host). Los JWT se firman aquí con un secreto aleatorio
# de esta ejecución (nunca se imprime). Ejecuta scripts/ci/lib/refund_filter_checks.py (las mismas comprobaciones que
# el job `db-supabase` corre con GoTrue + PostgREST oficiales).
#
# Requisitos: postgresql-16, Docker con acceso a la imagen postgrest/postgrest, python3. No toca servicios remotos.
# Ejecutar como root (usa `su postgres` para el clúster) o como un usuario no root con PG_RUN="".
# Variables: PG_BIN, PORT (54350), PGRST_PORT (54351), PGRST_IMAGE (postgrest/postgrest:v12.2.3), KEEP=1.
# =============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PORT="${PORT:-54350}"; PGRST_PORT="${PGRST_PORT:-54351}"
PGRST_IMAGE="${PGRST_IMAGE:-postgrest/postgrest:v12.2.3}"
WORKDIR="$(mktemp -d /tmp/jm_pgrst_XXXXXX)"; chmod 755 "$WORKDIR"
DB=jm_pgrst; NAME="jm-pgrst-$$"
if [[ $(id -u) == 0 ]]; then chown postgres "$WORKDIR"; RUN=(su postgres -s /bin/bash -c); else RUN=(bash -c); fi
PSQL="psql -X -q -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  "${RUN[@]}" "$PG_BIN/pg_ctl -D $WORKDIR/data -m fast stop" >/dev/null 2>&1 || true
  [[ "${KEEP:-0}" == 1 ]] || rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "== clúster efímero (127.0.0.1:$PORT)"
"${RUN[@]}" "$PG_BIN/initdb -D $WORKDIR/data -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null"
cat >> "$WORKDIR/data/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $PORT
unix_socket_directories = '$WORKDIR'
timezone = 'America/Bogota'
EOF
"${RUN[@]}" "$PG_BIN/pg_ctl -D $WORKDIR/data -l $WORKDIR/postgres.log -w start >/dev/null"
$PSQL -d postgres -c "CREATE DATABASE $DB"
$PSQL -d "$DB" -f "$ROOT/supabase/local_shim/supabase_shim.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -d "$DB" --single-transaction -f "$f" >/dev/null 2>"$WORKDIR/mig.err" || { cat "$WORKDIR/mig.err"; exit 1; }; done
for f in "$ROOT"/supabase/seeds/*.sql; do $PSQL -d "$DB" --single-transaction -f "$f" >/dev/null; done
$PSQL -d "$DB" -c "CREATE ROLE authenticator LOGIN NOINHERIT; GRANT anon, authenticated, service_role TO authenticator;"
echo "  migraciones: $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) · seeds: $(ls "$ROOT"/supabase/seeds/*.sql | wc -l)"

echo "== PostgREST ($PGRST_IMAGE, 127.0.0.1:$PGRST_PORT)"
JWT_SECRET="$(python3 -c 'import secrets;print(secrets.token_hex(32))')"
docker run -d --name "$NAME" --network host \
  -e PGRST_DB_URI="postgres://authenticator@127.0.0.1:$PORT/$DB" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_EXTRA_SEARCH_PATH=public,extensions -e PGRST_DB_ANON_ROLE=anon -e PGRST_DB_MAX_ROWS=1000 \
  -e PGRST_JWT_SECRET="$JWT_SECRET" -e PGRST_SERVER_HOST=127.0.0.1 -e PGRST_SERVER_PORT="$PGRST_PORT" \
  "$PGRST_IMAGE" >/dev/null
up=0; for _ in $(seq 1 30); do curl -fs -o /dev/null "http://127.0.0.1:$PGRST_PORT/" && { up=1; break; }; sleep 1; done
[[ $up == 1 ]] || { echo "ERROR: PostgREST no arrancó"; docker logs "$NAME" 2>&1 | tail -20; exit 1; }

echo "== comprobaciones"
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost JM_JWT_SECRET="$JWT_SECRET" \
  python3 -I "$HERE/postgrest_local_checks.py" "http://127.0.0.1:$PGRST_PORT"
