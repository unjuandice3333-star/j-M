#!/usr/bin/env bash
# =============================================================================
# M26-T6 — Ensayo LOCAL del procedimiento de reinicio de datos de QA.
#
# El reinicio de datos de QA es `supabase db reset` sobre el proyecto QA (lo ejecuta el PROPIETARIO, con autorización;
# ver MISION_26/06_T6_QA.md). Este script ensaya EXACTAMENTE el mismo procedimiento sobre el stack LOCAL y demuestra que
# devuelve la base al conjunto de datos de QA versionado (migraciones + seeds), aunque los datos se hayan alterado:
#   1. supabase start + db reset          → instantánea A (estado de QA esperado)
#   2. se alteran datos (precio, stock, uso de cupón, una reseña eliminada) → instantánea "sucia" (debe diferir de A)
#   3. supabase db reset                  → instantánea B
#   4. A == B en los 7 componentes (esquema, privilegios, restricciones, funciones, políticas, datos de referencia, seeds)
#   5. supabase stop --no-backup
# Solo stack local: aborta si hay un proyecto enlazado o un token de acceso. Nunca enlaza ni apunta a bases o hosts remotos.
# Variables: SUPABASE_BIN, OUT (por defecto una carpeta temporal). Salida: 0 OK · 1 fallo · 2 precondición no cumplida.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
SB="${SUPABASE_BIN:-supabase}"
DB=supabase_db_jm-fashion-store
EXCLUDE="studio,realtime,edge-runtime,logflare,vector,imgproxy,mailpit,postgres-meta,supavisor"
OUT="${OUT:-$(mktemp -d /tmp/jm-qa-reset-rehearsal.XXXXXX)}"; mkdir -p "$OUT"
[[ -f supabase/.temp/project-ref || -n "${SUPABASE_ACCESS_TOKEN:-}" ]] && { echo "ERROR: proyecto remoto enlazado o token presente; el ensayo solo usa el stack local"; exit 2; }
docker info >/dev/null 2>&1 || { echo "ERROR: Docker no disponible"; exit 2; }
trap '"$SB" stop --no-backup >/dev/null 2>&1' EXIT

snapshot() {  # <dir>: instantánea normalizada (mismo método que la compuerta 31 de la CI)
  bash scripts/ci/lib/db_snapshot.sh "$DB" "$1" >/dev/null || return 1
  grep -vE '^\\(un)?restrict ' "$1/schema.sql" > "$1/schema_normalized.sql"
  ( cd "$1" && md5sum schema_normalized.sql privileges.txt constraints.txt functions.txt policies.txt reference_data.txt seeds.txt > checksums.md5 )
}
psqlc() { docker exec "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c "$1"; }
fail=0

echo "== 1. stack local + reinicio inicial";  "$SB" start -x "$EXCLUDE" >/dev/null 2>&1 || { echo "ERROR: supabase start"; exit 1; }
"$SB" db reset >/dev/null 2>&1 || { echo "ERROR: db reset inicial"; exit 1; }
snapshot "$OUT/A" || { echo "ERROR: instantánea A"; exit 1; }
echo "   instantánea A: $(grep -c '' "$OUT/A/seeds.txt") filas de datos de QA"

echo "== 2. alteración de datos (simula uso de QA)"
psqlc "UPDATE public.products SET base_price = base_price + 1000 WHERE id = (SELECT id FROM public.products ORDER BY reference LIMIT 1);
       UPDATE public.inventories SET stock = stock + 7 WHERE variant_id = (SELECT variant_id FROM public.inventories ORDER BY variant_id LIMIT 1);
       UPDATE public.coupons SET used_count = used_count + 3 WHERE id = (SELECT id FROM public.coupons ORDER BY code LIMIT 1);
       DELETE FROM public.product_reviews WHERE id = (SELECT id FROM public.product_reviews ORDER BY id LIMIT 1);" >/dev/null \
  || { echo "ERROR: no se pudieron alterar los datos"; exit 1; }
snapshot "$OUT/sucia" || { echo "ERROR: instantánea sucia"; exit 1; }
if diff -q "$OUT/A/checksums.md5" "$OUT/sucia/checksums.md5" >/dev/null; then echo "   FALLO: la alteración no es visible en la instantánea"; fail=1
else echo "   OK: datos alterados ($(diff "$OUT/A/seeds.txt" "$OUT/sucia/seeds.txt" | grep -c '^[<>]') líneas distintas)"; fi

echo "== 3. reinicio de datos (procedimiento de QA: supabase db reset)"
"$SB" db reset >/dev/null 2>&1 || { echo "ERROR: db reset"; exit 1; }
snapshot "$OUT/B" || { echo "ERROR: instantánea B"; exit 1; }

echo "== 4. comparación A (QA esperado) vs B (tras el reinicio)"
if [[ -s "$OUT/A/checksums.md5" ]] && diff -q "$OUT/A/checksums.md5" "$OUT/B/checksums.md5" >/dev/null; then
  echo "   OK: 7/7 componentes idénticos; el reinicio restaura exactamente los datos de QA versionados"
else echo "   FALLO:"; diff "$OUT/A/checksums.md5" "$OUT/B/checksums.md5"; fail=1; fi
echo "   evidencias: $OUT"
[[ $fail -eq 0 ]] && echo "== ENSAYO DEL REINICIO DE QA: OK" || echo "== ENSAYO DEL REINICIO DE QA: FALLO"
exit $fail
