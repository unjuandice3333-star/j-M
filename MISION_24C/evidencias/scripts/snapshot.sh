#!/usr/bin/env bash
# M24C — Instantánea comparable de una reconstrucción de Supabase local.
# Uso: snapshot.sh <contenedor_db> <directorio_salida>
set -euo pipefail
DB="$1"; OUT="$2"; mkdir -p "$OUT"
q() { docker exec "$DB" psql -U postgres -d postgres -At -F '|' -c "$1"; }

docker exec "$DB" pg_dump -U postgres -d postgres --schema-only --no-owner --no-privileges -n public -n private \
  | grep -vE '^-- Dumped (from|by)|^SET |^SELECT pg_catalog.set_config' > "$OUT/schema.sql"

q "SELECT 'acl', c.oid::regclass, array_to_string(c.relacl, ',') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','v','S') ORDER BY 2;
   SELECT 'fn', p.oid::regprocedure, array_to_string(p.proacl, ',') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public','private') ORDER BY 2" > "$OUT/privileges.txt"

q "SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2" > "$OUT/constraints.txt"

q "SELECT p.oid::regprocedure, md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public','private') ORDER BY 1;
   SELECT 'trigger', tgrelid::regclass, tgname, md5(pg_get_triggerdef(oid)) FROM pg_trigger
   WHERE NOT tgisinternal AND tgrelid::regclass::text !~ '^(storage|realtime|supabase_functions|net|cron|vault)\.' ORDER BY 2, 3" > "$OUT/functions.txt"

q "SELECT schemaname, tablename, policyname, cmd, array_to_string(roles, ','), coalesce(qual, ''), coalesce(with_check, '')
   FROM pg_policies WHERE schemaname IN ('public', 'storage') ORDER BY 1, 2, 3" > "$OUT/policies.txt"

q "SELECT 'branches', id, code, name, is_default FROM public.branches ORDER BY 2;
   SELECT 'brands', id, name FROM public.brands ORDER BY 2;
   SELECT 'sizes', id, size_group, code, name, sort_order FROM public.sizes ORDER BY 2;
   SELECT 'colors', id, slug, name, hex_code FROM public.colors ORDER BY 2;
   SELECT 'categories', id, slug, name, size_group FROM public.categories ORDER BY 2;
   SELECT 'style_lines', id, slug, name, tagline FROM public.style_lines ORDER BY 2;
   SELECT 'occasions', id, slug, name FROM public.occasions ORDER BY 2;
   SELECT 'shipping', code, cost, free_over_subtotal, is_active FROM public.shipping_methods ORDER BY 2;
   SELECT 'status', status, label, is_terminal FROM public.order_status_catalog ORDER BY 2;
   SELECT 'transition', from_status, to_status, allowed_actor, requires_note FROM public.order_status_transitions ORDER BY 2, 3, 4;
   SELECT 'buckets', id, public, file_size_limit, array_to_string(allowed_mime_types, ',') FROM storage.buckets ORDER BY 2;
   SELECT 'cron', jobname, schedule, command, active FROM cron.job ORDER BY 2" > "$OUT/reference_data.txt"

q "SELECT 'user', u.id, u.email, p.role, p.full_name FROM auth.users u JOIN public.profiles p ON p.id = u.id ORDER BY 2;
   SELECT 'product', id, reference, slug, base_price, compare_at_price, status, published_at FROM public.products ORDER BY 3;
   SELECT 'color', p.reference, c.slug, pc.position, pc.is_default FROM public.product_colors pc JOIN public.products p ON p.id = pc.product_id JOIN public.colors c ON c.id = pc.color_id ORDER BY 2, 4;
   SELECT 'image', p.reference, coalesce(c.slug, '-'), pi.position, coalesce(pi.external_url, pi.storage_path) FROM public.product_images pi JOIN public.products p ON p.id = pi.product_id LEFT JOIN public.colors c ON c.id = pi.color_id ORDER BY 2, 3, 4;
   SELECT 'variant', v.id, v.sku, v.is_active, i.stock, i.reserved FROM public.variants v JOIN public.inventories i ON i.variant_id = v.id ORDER BY 3;
   SELECT 'coupon', id, code, discount_type, discount_value, used_count FROM public.coupons ORDER BY 3;
   SELECT 'redemption', c.code, o.order_number, r.status, r.discount_amount FROM public.coupon_redemptions r JOIN public.coupons c ON c.id = r.coupon_id JOIN public.online_orders o ON o.id = r.order_id ORDER BY 3;
   SELECT 'order', order_number, idempotency_key, customer_email, status, subtotal, discount_total, shipping_cost, total, coupon_code, carrier, tracking_number FROM public.online_orders ORDER BY 2;
   SELECT 'item', o.order_number, oi.sku, oi.quantity, oi.unit_price, oi.line_discount, oi.line_total FROM public.online_order_items oi JOIN public.online_orders o ON o.id = oi.order_id ORDER BY 2, 3;
   SELECT 'attempt', reference, status, amount_in_cents, provider_transaction_id, requires_refund FROM public.payment_transactions ORDER BY 2;
   SELECT 'movement', v.sku, m.movement_type, m.quantity_change, m.quantity_before, m.quantity_after, coalesce(o.order_number, m.reference_type) FROM public.inventory_movements m JOIN public.variants v ON v.id = m.variant_id LEFT JOIN public.online_orders o ON o.id = m.reference_id ORDER BY 2, 3, 7;
   SELECT 'reservation', o.order_number, v.sku, r.quantity, r.status FROM public.inventory_reservations r JOIN public.online_orders o ON o.id = r.order_id JOIN public.variants v ON v.id = r.variant_id ORDER BY 2, 3;
   SELECT 'event', o.order_number, e.event_type, coalesce(e.from_status::text, '-'), coalesce(e.to_status::text, '-'), e.actor FROM public.order_events e JOIN public.online_orders o ON o.id = e.order_id ORDER BY 2, e.created_at;
   SELECT 'refund', o.order_number, r.amount, r.status, r.restock FROM public.order_refunds r JOIN public.online_orders o ON o.id = r.order_id ORDER BY 2;
   SELECT 'review', id, rating, status FROM public.product_reviews ORDER BY 2;
   SELECT 'webhook', reference, result, detail FROM public.webhook_events ORDER BY 2, event_checksum" > "$OUT/seeds.txt"

( cd "$OUT" && md5sum schema.sql privileges.txt constraints.txt functions.txt policies.txt reference_data.txt seeds.txt > checksums.md5 )
cat "$OUT/checksums.md5"
wc -l "$OUT"/*.sql "$OUT"/*.txt | tail -1
