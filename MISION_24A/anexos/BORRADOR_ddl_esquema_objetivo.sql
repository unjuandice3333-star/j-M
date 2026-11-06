-- BORRADOR DE DISEÑO (M24A) — NO ES UNA MIGRACIÓN. Validación de coherencia en BD local efímera.
-- Requiere shim local (roles anon/authenticated/service_role, auth.users, auth.uid()).

-- ===================== ENUMS =====================
CREATE TYPE app_role              AS ENUM ('customer','admin','super_admin');
CREATE TYPE product_status        AS ENUM ('draft','active','archived');
CREATE TYPE product_fit           AS ENUM ('SLIM','REGULAR','RELAXED','OVERSIZE');
CREATE TYPE size_group            AS ENUM ('alpha','numeric_pants','footwear','one_size');
CREATE TYPE order_status          AS ENUM ('payment_pending','paid','processing','shipped','delivered','cancelled','expired','refunded');
CREATE TYPE payment_status        AS ENUM ('PENDING','APPROVED','DECLINED','VOIDED','ERROR');
CREATE TYPE payment_method        AS ENUM ('wompi','cash_on_delivery');
CREATE TYPE inventory_movement_type AS ENUM ('initial_load','restock','adjustment','sale','cancel_restore','return','damage');
CREATE TYPE reservation_status    AS ENUM ('active','consumed','released','expired');
CREATE TYPE coupon_type           AS ENUM ('percent','fixed','free_shipping');
CREATE TYPE review_status         AS ENUM ('pending','approved','rejected');
CREATE TYPE event_actor           AS ENUM ('system','customer','admin','webhook');

-- ===================== UTILIDADES =====================
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ===================== IDENTIDAD =====================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  phone text,
  avatar_url text,
  role app_role NOT NULL DEFAULT 'customer',
  preferred_size text,
  preferred_fit product_fit,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_name text NOT NULL, phone text NOT NULL,
  department text NOT NULL, city text NOT NULL, address_line text NOT NULL,
  neighborhood text, reference text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_customer_addresses_default ON public.customer_addresses(user_id) WHERE is_default;

-- ===================== CATÁLOGO =====================
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name text NOT NULL,
  parent_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  size_group size_group NOT NULL DEFAULT 'alpha',
  image_url text, sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.style_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name text NOT NULL, tagline text, description text, badge text, image_url text,
  sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.occasions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name text NOT NULL, subtitle text, image_url text,
  sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  size_group size_group NOT NULL,
  code text NOT NULL, name text NOT NULL, sort_order int NOT NULL DEFAULT 0,
  UNIQUE (size_group, code)
);
CREATE TABLE public.colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name text NOT NULL UNIQUE,
  hex_code text NOT NULL CHECK (hex_code ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name text NOT NULL,
  description text,
  details text[] NOT NULL DEFAULT '{}',
  fit product_fit NOT NULL DEFAULT 'REGULAR',
  fit_description text,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  style_line_id uuid REFERENCES public.style_lines(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  base_price bigint NOT NULL CHECK (base_price > 0),             -- COP enteros, IVA incluido
  compare_at_price bigint CHECK (compare_at_price IS NULL OR compare_at_price > base_price),
  base_cost bigint CHECK (base_cost IS NULL OR base_cost >= 0),
  status product_status NOT NULL DEFAULT 'draft',
  is_featured_new boolean NOT NULL DEFAULT false,
  is_bestseller boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz, deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (status <> 'active' OR published_at IS NOT NULL)
);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_style_line ON public.products(style_line_id);
CREATE INDEX idx_products_status ON public.products(status) WHERE deleted_at IS NULL;

CREATE TABLE public.product_occasions (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  occasion_id uuid NOT NULL REFERENCES public.occasions(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, occasion_id)
);

-- Color declarado por producto: ancla de galería y de variantes
CREATE TABLE public.product_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  color_id uuid NOT NULL REFERENCES public.colors(id) ON DELETE RESTRICT,
  position int NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  UNIQUE (product_id, color_id)
);
CREATE UNIQUE INDEX uq_product_colors_default ON public.product_colors(product_id) WHERE is_default;

CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  color_id uuid,                                    -- NULL = imagen general del producto
  storage_path text,                               -- bucket product-images
  external_url text,                               -- transición (Unsplash/URLs antiguas)
  alt_text text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(storage_path, external_url) = 1),
  FOREIGN KEY (product_id, color_id) REFERENCES public.product_colors(product_id, color_id) ON DELETE CASCADE
);
CREATE INDEX idx_product_images_gallery ON public.product_images(product_id, color_id, position);

CREATE TABLE public.variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  color_id uuid NOT NULL,
  size_id uuid NOT NULL REFERENCES public.sizes(id) ON DELETE RESTRICT,
  sku text NOT NULL UNIQUE,
  barcode text UNIQUE,
  price_override bigint CHECK (price_override IS NULL OR price_override > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (product_id, color_id, size_id),
  FOREIGN KEY (product_id, color_id) REFERENCES public.product_colors(product_id, color_id) ON DELETE RESTRICT
);

-- ===================== INVENTARIO =====================
CREATE TABLE public.branches (            -- semántica: bodega
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, name text NOT NULL, address text, phone text,
  is_default boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_branches_default ON public.branches((true)) WHERE is_default;

CREATE TABLE public.inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  stock int NOT NULL DEFAULT 0 CHECK (stock >= 0),            -- físico (on hand)
  reserved int NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  min_stock int NOT NULL DEFAULT 2 CHECK (min_stock >= 0),
  location_shelf text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, variant_id),
  CHECK (reserved <= stock)
);

CREATE TABLE public.inventory_movements (   -- append-only
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.inventories(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  movement_type inventory_movement_type NOT NULL,
  quantity_change int NOT NULL CHECK (quantity_change <> 0),
  quantity_before int NOT NULL,
  quantity_after int NOT NULL CHECK (quantity_after >= 0),
  reason text,
  reference_type text CHECK (reference_type IN ('order','manual','import','return')),
  reference_id uuid,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity_after = quantity_before + quantity_change)
);
CREATE INDEX idx_inv_mov_variant ON public.inventory_movements(variant_id, created_at);
CREATE UNIQUE INDEX uq_inv_mov_order_sale ON public.inventory_movements(reference_id, variant_id, movement_type)
  WHERE reference_type = 'order';   -- idempotencia: una venta / una restauración por línea

-- ===================== ENVÍOS, CUPONES =====================
CREATE TABLE public.shipping_methods (
  code text PRIMARY KEY CHECK (code ~ '^[a-z_]+$'),
  name text NOT NULL, cost bigint NOT NULL CHECK (cost >= 0),
  free_over_subtotal bigint, eta_text text,
  is_active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (code = upper(code) AND code ~ '^[A-Z0-9_-]{3,40}$'),
  discount_type coupon_type NOT NULL,
  discount_value bigint NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  min_subtotal bigint NOT NULL DEFAULT 0,
  max_uses int CHECK (max_uses IS NULL OR max_uses > 0),
  max_uses_per_email int CHECK (max_uses_per_email IS NULL OR max_uses_per_email > 0),
  used_count int NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz, expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_type <> 'percent' OR discount_value BETWEEN 1 AND 90),
  UNIQUE (code)
);

-- ===================== PEDIDOS =====================
CREATE SEQUENCE public.order_number_seq START 1000;

CREATE TABLE public.online_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT ('JM-' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  public_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  customer_name text NOT NULL, customer_email text NOT NULL, customer_phone text NOT NULL,
  customer_document text,
  shipping_department text NOT NULL, shipping_city text NOT NULL, shipping_address text NOT NULL,
  shipping_neighborhood text, shipping_notes text,
  shipping_method_code text NOT NULL REFERENCES public.shipping_methods(code),
  payment_method payment_method NOT NULL DEFAULT 'wompi',
  currency char(3) NOT NULL DEFAULT 'COP' CHECK (currency = 'COP'),
  subtotal bigint NOT NULL CHECK (subtotal >= 0),
  discount_total bigint NOT NULL DEFAULT 0 CHECK (discount_total >= 0 AND discount_total <= subtotal),
  shipping_cost bigint NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  total bigint NOT NULL CHECK (total = subtotal - discount_total + shipping_cost),
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE RESTRICT,
  coupon_code text,
  status order_status NOT NULL DEFAULT 'payment_pending',
  payment_expires_at timestamptz,
  carrier text, tracking_number text, tracking_url text,
  paid_at timestamptz, shipped_at timestamptz, delivered_at timestamptz,
  cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_user ON public.online_orders(user_id, created_at DESC);
CREATE INDEX idx_orders_status ON public.online_orders(status, created_at DESC);
CREATE INDEX idx_orders_email ON public.online_orders(lower(customer_email));

CREATE TABLE public.online_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  product_name text NOT NULL, sku text NOT NULL, size_code text NOT NULL, color_name text NOT NULL,
  image_url text,
  unit_price bigint NOT NULL CHECK (unit_price > 0),
  quantity int NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  line_discount bigint NOT NULL DEFAULT 0 CHECK (line_discount >= 0),
  line_total bigint NOT NULL,
  UNIQUE (order_id, variant_id),
  CHECK (line_total = unit_price * quantity - line_discount)
);

CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE REFERENCES public.online_orders(id) ON DELETE RESTRICT,
  customer_email text NOT NULL,
  discount_amount bigint NOT NULL CHECK (discount_amount >= 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','confirmed','released')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE RESTRICT,
  inventory_id uuid NOT NULL REFERENCES public.inventories(id) ON DELETE RESTRICT,
  quantity int NOT NULL CHECK (quantity > 0),
  status reservation_status NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, inventory_id)
);
CREATE INDEX idx_reservations_active ON public.inventory_reservations(expires_at) WHERE status = 'active';

CREATE TABLE public.order_events (   -- append-only
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  from_status order_status, to_status order_status,
  actor event_actor NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_events_order ON public.order_events(order_id, created_at);

CREATE TABLE public.order_status_transitions (
  from_status order_status NOT NULL,
  to_status order_status NOT NULL,
  allowed_actor event_actor NOT NULL,
  requires_note boolean NOT NULL DEFAULT false,
  PRIMARY KEY (from_status, to_status, allowed_actor)
);

-- ===================== PAGOS =====================
CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'wompi' CHECK (provider = 'wompi'),
  attempt_number int NOT NULL CHECK (attempt_number >= 1),
  reference text NOT NULL UNIQUE,                     -- order_number || '-' || attempt
  provider_transaction_id text UNIQUE,
  amount_in_cents bigint NOT NULL CHECK (amount_in_cents > 0),
  currency char(3) NOT NULL DEFAULT 'COP',
  payment_method_type text,
  status payment_status NOT NULL DEFAULT 'PENDING',
  status_message text,
  last_event_at timestamptz,
  raw_last_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, attempt_number)
);
CREATE UNIQUE INDEX uq_payment_one_approved ON public.payment_transactions(order_id) WHERE status = 'APPROVED';

CREATE TABLE public.webhook_events (   -- bandeja de entrada idempotente
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'wompi',
  event_checksum text NOT NULL,
  event_type text NOT NULL,
  provider_transaction_id text,
  reference text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  result text CHECK (result IN ('applied','duplicate','ignored','rejected','error')),
  error_detail text,
  UNIQUE (provider, event_checksum)
);

CREATE TABLE public.order_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE RESTRICT,
  payment_transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,
  amount bigint NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','processed','rejected')),
  provider_refund_id text,
  restock boolean NOT NULL DEFAULT true,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===================== CONTENIDO, RESEÑAS, AUDITORÍA =====================
CREATE TABLE public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.online_order_items(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL, city text,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text NOT NULL, comment text NOT NULL,
  is_verified_buyer boolean GENERATED ALWAYS AS (order_item_id IS NOT NULL) STORED,
  status review_status NOT NULL DEFAULT 'pending',
  admin_reply text, moderated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id)
);

CREATE TABLE public.site_content (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]+$'),
  image_url text, storage_path text, alt_text text, title text, body text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE, name text NOT NULL, subtitle text, image_url text,
  kind text NOT NULL DEFAULT 'collection' CHECK (kind IN ('collection','look')),
  bundle_price bigint, is_active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE public.collection_products (
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, product_id)
);

CREATE TABLE public.wishlist_items (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid,
  table_name text NOT NULL, record_id uuid, action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data jsonb, new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===================== VISTAS DE LECTURA =====================
CREATE VIEW public.v_variant_availability WITH (security_invoker = true) AS
SELECT v.id AS variant_id, v.product_id, v.color_id, v.size_id,
       COALESCE(SUM(i.stock - i.reserved), 0)::int AS available
FROM public.variants v
LEFT JOIN public.inventories i ON i.variant_id = v.id
WHERE v.deleted_at IS NULL AND v.is_active
GROUP BY v.id;

CREATE VIEW public.v_product_rating WITH (security_invoker = true) AS
SELECT product_id, round(avg(rating)::numeric, 1) AS rating, count(*)::int AS review_count
FROM public.product_reviews WHERE status = 'approved' GROUP BY product_id;

-- ===================== TRIGGERS updated_at =====================
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','customer_addresses','categories','style_lines','products','variants',
                           'branches','inventories','coupons','online_orders','inventory_reservations',
                           'payment_transactions','order_refunds'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;
