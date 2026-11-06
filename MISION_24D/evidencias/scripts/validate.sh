#!/usr/bin/env bash
# M24D — Validación completa sobre una exportación limpia. SIN pasos manuales tras `supabase db reset`.
# Uso: validate.sh <dir_proyecto_exportado> <dir_salida>
set -uo pipefail
PROJ="$1"; OUT="$2"; mkdir -p "$OUT"
HERE="$(cd "$(dirname "$0")" && pwd)"
CLI="$HERE/../sbcli/node_modules/.bin/supabase"
DB=supabase_db_jm-fashion-store
cd "$PROJ"

echo "== 1. supabase start"
timeout 900 "$CLI" start -x studio,realtime,edge-runtime,logflare,vector,imgproxy,mailpit,postgres-meta,supavisor > "$OUT/01_start.log" 2>&1
echo "start_exit=$?" | tee "$OUT/exit_codes.txt"

echo "== 2. supabase db reset"
timeout 600 "$CLI" db reset > "$OUT/02_reset.log" 2>&1
echo "reset_exit=$?" | tee -a "$OUT/exit_codes.txt"

echo "== 3. Verificación de seeds"
docker exec "$DB" psql -U postgres -d postgres -At -F'|' -c "
  SELECT 'usuarios_qa', count(*) FROM auth.users WHERE email LIKE '%@qa.jm.test';
  SELECT 'identidades_qa', count(*) FROM auth.identities i JOIN auth.users u ON u.id = i.user_id WHERE u.email LIKE '%@qa.jm.test';
  SELECT 'tokens_null', count(*) FROM auth.users WHERE confirmation_token IS NULL OR recovery_token IS NULL OR email_change_token_new IS NULL
     OR email_change IS NULL OR email_change_token_current IS NULL OR reauthentication_token IS NULL OR phone_change IS NULL OR phone_change_token IS NULL;
  SELECT 'perfiles', string_agg(email || ':' || role, ', ' ORDER BY email) FROM public.profiles;
  SELECT 'productos_por_estado', string_agg(status || '=' || n, ', ' ORDER BY status) FROM (SELECT status::text, count(*) n FROM public.products GROUP BY 1) x;
  SELECT 'variantes', count(*) FROM public.variants;
  SELECT 'imagenes', count(*) FROM public.product_images;
  SELECT 'cupones', count(*) FROM public.coupons;
  SELECT 'pedidos', string_agg(order_number || ':' || status || ':' || total, ', ' ORDER BY order_number) FROM public.online_orders;
  SELECT 'reseñas', count(*) FROM public.product_reviews;
  SELECT 'cron', jobname || ' ' || schedule || ' active=' || active FROM cron.job;
  SELECT 'extensiones', string_agg(extname || ' ' || extversion, ', ' ORDER BY extname) FROM pg_extension;
  SELECT 'postgres', version();" > "$OUT/03_seeds.txt" 2>&1
cat "$OUT/03_seeds.txt"

echo "== 4. Instantánea para determinismo"
bash "$HERE/snapshot.sh" "$DB" "$OUT/snapshot" > "$OUT/04_snapshot.txt" 2>&1
grep -vE '^\\(un)?restrict ' "$OUT/snapshot/schema.sql" > "$OUT/snapshot/schema_normalized.sql"
( cd "$OUT/snapshot" && md5sum schema_normalized.sql privileges.txt constraints.txt functions.txt policies.txt reference_data.txt seeds.txt > checksums_normalized.md5 )

echo "== 5. supabase test db (procedimiento oficial, sin rutas)"
timeout 900 "$CLI" test db > "$OUT/05_test_db.log" 2>&1
echo "test_db_exit=$?" | tee -a "$OUT/exit_codes.txt"
grep -E '\.sql \.\.|Files=|Result' "$OUT/05_test_db.log" | sed 's#.*/supabase/tests/##'

echo "== 6. Verificaciones HTTP (39)"
"$CLI" status -o json > "$OUT/.status.json" 2>/dev/null
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost python3 -I "$HERE/services_check.py" "$OUT/.status.json" "$OUT/06_http_results.json" > "$OUT/06_http.log" 2>&1
echo "http_exit=$?" | tee -a "$OUT/exit_codes.txt"
rm -f "$OUT/.status.json"
tail -1 "$OUT/06_http.log"

echo "== 7. Advertencias en registros"
grep -hE '^WARN|WARNING:|ERROR:' "$OUT/01_start.log" "$OUT/02_reset.log" | grep -vE 'Retrying|failed to copy' | sort | uniq -c > "$OUT/07_warnings.txt" || true
echo "advertencias/errores en start+reset: $(wc -l < "$OUT/07_warnings.txt")"
cat "$OUT/07_warnings.txt"
