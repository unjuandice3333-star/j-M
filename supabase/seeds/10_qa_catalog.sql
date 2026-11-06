-- =============================================================================
-- SEED QA — CATÁLOGO, INVENTARIO Y CUPONES (solo local, CI y QA)
-- =============================================================================
-- El catálogo se crea con la RPC real public.admin_upsert_product (como super_admin),
-- de modo que el seed también ejercita la función. IDs deterministas derivados de
-- texto (UUID v4 válidos) para que dos reconstrucciones produzcan los mismos datos.
-- Imágenes: URLs públicas de demostración ya usadas por el frontend actual.
-- =============================================================================

CREATE FUNCTION pg_temp.seed_uuid(p text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT (substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3) || '-8' || substr(h, 18, 3) || '-' || substr(h, 21, 12))::uuid
  FROM (SELECT md5(p) AS h) x
$$;

-- Construye la lista de variantes {id, color, size, initial_stock} a partir de un mapa de stock.
CREATE FUNCTION pg_temp.variants(p_ref text, p_stock jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_agg(jsonb_build_object(
           'id', pg_temp.seed_uuid('variant:' || p_ref || ':' || c.key || ':' || s.key),
           'color', c.key, 'size', s.key, 'initial_stock', (s.value)::int)
         ORDER BY c.key, s.key)
  FROM jsonb_each(p_stock) c, jsonb_each_text(c.value) s
$$;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}', true);

-- P1 · Camiseta oversize · 3 colores × 5 tallas · galería por color
SELECT public.admin_upsert_product(jsonb_build_object(
  'id', '00000000-0000-4000-8000-00000000c001',
  'reference', 'JM-TEE-001', 'slug', 'camiseta-heavyweight-oversize', 'name', 'Camiseta Heavyweight Oversize',
  'description', 'Camiseta de algodón pesado 240 g con horma oversize.',
  'details', jsonb_build_array('Algodón 240 g', 'Cuello en rib reforzado', 'Hecho en Colombia'),
  'fit', 'OVERSIZE', 'fit_description', 'Hombro caído y mayor holgura en el tórax.',
  'category', 'camisetas', 'style_line', 'urbana', 'occasions', jsonb_build_array('casual', 'streetwear'),
  'base_price', 129900, 'compare_at_price', 159900, 'base_cost', 45000,
  'is_featured_new', true, 'is_bestseller', true,
  'colors', jsonb_build_array(
    jsonb_build_object('color', 'negro', 'is_default', true, 'images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=1000', 'alt_text', 'Camiseta negra frente'),
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=1000', 'alt_text', 'Camiseta negra espalda'))),
    jsonb_build_object('color', 'blanco-crudo', 'images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&q=80&w=1000', 'alt_text', 'Camiseta blanco crudo frente'))),
    jsonb_build_object('color', 'gris-oxford', 'images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&q=80&w=1000', 'alt_text', 'Camiseta gris oxford frente')))),
  'general_images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&q=80&w=1000', 'alt_text', 'Look urbano')),
  'variants', pg_temp.variants('JM-TEE-001', '{
      "negro":        {"S":5,"M":10,"L":8,"XL":4,"XXL":2},
      "blanco-crudo": {"S":3,"M":6,"L":0,"XL":2,"XXL":1},
      "gris-oxford":  {"S":2,"M":4,"L":4,"XL":0,"XXL":0}}'::jsonb)));

-- P2 · Camisa oxford slim · 2 colores
SELECT public.admin_upsert_product(jsonb_build_object(
  'id', '00000000-0000-4000-8000-00000000c002',
  'reference', 'JM-SHI-001', 'slug', 'camisa-oxford-slim', 'name', 'Camisa Oxford Slim',
  'description', 'Camisa oxford de algodón con corte slim.', 'details', jsonb_build_array('100% algodón oxford'),
  'fit', 'SLIM', 'category', 'camisas', 'style_line', 'elegante', 'occasions', jsonb_build_array('trabajo', 'cita'),
  'base_price', 159900, 'base_cost', 60000,
  'colors', jsonb_build_array(
    jsonb_build_object('color', 'blanco', 'is_default', true, 'images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&q=80&w=1000'))),
    jsonb_build_object('color', 'azul-navy', 'images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=80&w=1000')))),
  'variants', pg_temp.variants('JM-SHI-001', '{
      "blanco":    {"S":4,"M":6,"L":6,"XL":3},
      "azul-navy": {"S":2,"M":5,"L":5,"XL":2}}'::jsonb)));

-- P3 · Jean slim · tallas numéricas
SELECT public.admin_upsert_product(jsonb_build_object(
  'id', '00000000-0000-4000-8000-00000000c003',
  'reference', 'JM-JEA-001', 'slug', 'jean-slim-selvedge', 'name', 'Jean Slim Selvedge',
  'description', 'Denim selvedge de 13 oz.', 'fit', 'SLIM', 'category', 'jeans', 'style_line', 'casual',
  'occasions', jsonb_build_array('casual', 'fin-de-semana'), 'base_price', 189900, 'base_cost', 70000,
  'colors', jsonb_build_array(
    jsonb_build_object('color', 'azul-indigo', 'is_default', true, 'images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=1000'))),
    jsonb_build_object('color', 'negro', 'images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&q=80&w=1000')))),
  'variants', pg_temp.variants('JM-JEA-001', '{
      "azul-indigo": {"30":3,"32":6,"34":5,"36":2},
      "negro":       {"30":2,"32":4,"34":3,"36":1}}'::jsonb)));

-- P4 · Tenis de cuero · calzado
SELECT public.admin_upsert_product(jsonb_build_object(
  'id', '00000000-0000-4000-8000-00000000c004',
  'reference', 'JM-SHO-001', 'slug', 'tenis-minimal-cuero', 'name', 'Tenis Minimal en Cuero',
  'description', 'Tenis blancos en cuero.', 'category', 'calzado', 'style_line', 'casual',
  'occasions', jsonb_build_array('casual'), 'base_price', 249900, 'base_cost', 95000,
  'colors', jsonb_build_array(
    jsonb_build_object('color', 'blanco', 'is_default', true, 'images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=1000')))),
  'variants', pg_temp.variants('JM-SHO-001', '{"blanco": {"39":2,"40":4,"41":4,"42":3,"43":1}}'::jsonb)));

-- P5 · Polo · UNA sola unidad (pruebas de concurrencia y sobreventa)
SELECT public.admin_upsert_product(jsonb_build_object(
  'id', '00000000-0000-4000-8000-00000000c005',
  'reference', 'JM-POL-001', 'slug', 'polo-pique-ultima-unidad', 'name', 'Polo Piqué Edición Limitada',
  'category', 'polos', 'style_line', 'casual', 'base_price', 99900,
  'colors', jsonb_build_array(
    jsonb_build_object('color', 'beige', 'is_default', true, 'images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1626557981101-aae6f84aa6ff?auto=format&fit=crop&q=80&w=1000')))),
  'variants', pg_temp.variants('JM-POL-001', '{"beige": {"M":1}}'::jsonb)));

-- P6 · Chaqueta agotada (activa, stock 0)
SELECT public.admin_upsert_product(jsonb_build_object(
  'id', '00000000-0000-4000-8000-00000000c006',
  'reference', 'JM-JAC-001', 'slug', 'chaqueta-bomber', 'name', 'Chaqueta Bomber',
  'category', 'chaquetas', 'style_line', 'urbana', 'base_price', 289900,
  'colors', jsonb_build_array(
    jsonb_build_object('color', 'negro', 'is_default', true, 'images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=1000')))),
  'variants', pg_temp.variants('JM-JAC-001', '{"negro": {"M":0,"L":0}}'::jsonb)));

-- P7 · Bermuda en borrador (no visible)
SELECT public.admin_upsert_product(jsonb_build_object(
  'id', '00000000-0000-4000-8000-00000000c007',
  'reference', 'JM-BER-001', 'slug', 'bermuda-cargo', 'name', 'Bermuda Cargo',
  'category', 'bermudas', 'base_price', 119900,
  'colors', jsonb_build_array(
    jsonb_build_object('color', 'verde-oliva', 'is_default', true, 'images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&q=80&w=1000')))),
  'variants', pg_temp.variants('JM-BER-001', '{"verde-oliva": {"30":5,"32":5}}'::jsonb)));

-- P8 · Correa archivada (no visible)
SELECT public.admin_upsert_product(jsonb_build_object(
  'id', '00000000-0000-4000-8000-00000000c008',
  'reference', 'JM-ACC-001', 'slug', 'correa-cuero', 'name', 'Correa en Cuero',
  'category', 'accesorios', 'base_price', 89900,
  'colors', jsonb_build_array(
    jsonb_build_object('color', 'cafe', 'is_default', true, 'images', jsonb_build_array(
      jsonb_build_object('external_url', 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?auto=format&fit=crop&q=80&w=1000')))),
  'variants', pg_temp.variants('JM-ACC-001', '{"cafe": {"UNICA":10}}'::jsonb)));

-- Publicación
SELECT public.admin_set_product_status(id, 'active') FROM public.products
 WHERE reference IN ('JM-TEE-001', 'JM-SHI-001', 'JM-JEA-001', 'JM-SHO-001', 'JM-POL-001', 'JM-JAC-001')
 ORDER BY reference;
SELECT public.admin_set_product_status('00000000-0000-4000-8000-00000000c008', 'archived');

-- Fechas de publicación fijas para que los datos sean reproducibles
UPDATE public.products SET published_at = '2026-10-01T12:00:00-05:00' WHERE published_at IS NOT NULL;

-- Cupones
INSERT INTO public.coupons (id, code, description, discount_type, discount_value, min_subtotal, max_uses,
                            max_uses_per_email, used_count, starts_at, expires_at) VALUES
  ('00000000-0000-4000-8000-00000000d001', 'QA10',       '10 % sin mínimo',                  'percent',       10,    0,      NULL, NULL, 0, NULL, NULL),
  ('00000000-0000-4000-8000-00000000d002', 'QAFIJO20K',  '$20.000 desde $100.000',            'fixed',         20000, 100000, NULL, NULL, 0, NULL, NULL),
  ('00000000-0000-4000-8000-00000000d003', 'QAENVIO',    'Envío gratis desde $150.000',       'free_shipping', 0,     150000, NULL, NULL, 0, NULL, NULL),
  ('00000000-0000-4000-8000-00000000d004', 'QAEXPIRADO', 'Vencido',                           'percent',       15,    0,      NULL, NULL, 0, '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'),
  ('00000000-0000-4000-8000-00000000d005', 'QAAGOTADO',  'Usos agotados',                     'percent',       20,    0,      5,    NULL, 5, NULL, NULL),
  ('00000000-0000-4000-8000-00000000d006', 'QAFUTURO',   'Aún no inicia',                     'percent',       20,    0,      NULL, NULL, 0, '2099-01-01T00:00:00Z', NULL),
  ('00000000-0000-4000-8000-00000000d007', 'QAUNICO',    'Un uso por correo',                 'percent',       5,     0,      NULL, 1,    0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Contenido editorial de ejemplo
INSERT INTO public.site_content (key, image_url, alt_text, title) VALUES
  ('hero_main', 'https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?auto=format&fit=crop&q=80&w=2000',
   'Colección J&M', 'Viste tu estilo. Vive tu esencia.')
ON CONFLICT (key) DO NOTHING;

-- Reseñas (una por estado)
INSERT INTO public.product_reviews (id, product_id, author_name, city, rating, title, comment, status) VALUES
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000c001', 'Cliente QA A', 'Bogotá',   5, 'Excelente', 'Reseña aprobada de prueba.', 'approved'),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000c001', 'Cliente QA B', 'Medellín', 4, 'Muy buena', 'Reseña aprobada de prueba.', 'approved'),
  ('00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-00000000c001', 'Cliente QA C', 'Cali',     2, 'Pendiente', 'Reseña pendiente de prueba.', 'pending'),
  ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000c002', 'Cliente QA D', 'Cali',     1, 'Rechazada', 'Reseña rechazada de prueba.', 'rejected')
ON CONFLICT (id) DO NOTHING;

SELECT set_config('request.jwt.claims', '', true);
