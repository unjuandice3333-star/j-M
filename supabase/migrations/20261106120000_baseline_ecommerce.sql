-- =============================================================================
-- J&M FASHION STORE — LÍNEA BASE CONSOLIDADA E-COMMERCE (M24B)
-- =============================================================================
-- Sustituye a las 16 migraciones históricas (archivadas en supabase/migrations_legacy/).
-- Diseño: MISION_24A/M24A_ESQUEMA_OBJETIVO.md · Decisiones de negocio: M24B.
--
--   * Moneda COP en pesos enteros (bigint), IVA incluido.
--   * Reserva de inventario de 30 minutos durante el pago.
--   * Envío estándar $15.000, gratis desde $200.000 (subtotal neto de descuento).
--   * Envío express definido pero inactivo. Sin pago contraentrega.
--   * Catálogo de moda masculina. Carrito local (sin tablas de carrito).
--   * Un solo webhook (Vercel) que delega en public.apply_payment_event().
--
-- Orden: extensiones → esquemas → enums → tablas → índices → vistas →
--        funciones privadas → triggers → RPC públicas → RLS → privilegios →
--        storage → datos de referencia → pg_cron → autoverificación.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. EXTENSIONES Y ESQUEMAS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Funciones internas: NO expuestas por PostgREST (solo se expone "public").
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE public.app_role                AS ENUM ('customer', 'admin', 'super_admin');
CREATE TYPE public.product_status          AS ENUM ('draft', 'active', 'archived');
CREATE TYPE public.product_fit             AS ENUM ('SLIM', 'REGULAR', 'RELAXED', 'OVERSIZE');
CREATE TYPE public.size_group              AS ENUM ('alpha', 'numeric_pants', 'footwear', 'one_size');
CREATE TYPE public.order_status            AS ENUM ('payment_pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'expired', 'refunded');
CREATE TYPE public.payment_status          AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR');
CREATE TYPE public.payment_method          AS ENUM ('wompi');
CREATE TYPE public.inventory_movement_type AS ENUM ('initial_load', 'restock', 'adjustment', 'sale', 'cancel_restore', 'return', 'damage');
CREATE TYPE public.reservation_status      AS ENUM ('active', 'consumed', 'released', 'expired');
CREATE TYPE public.coupon_type             AS ENUM ('percent', 'fixed', 'free_shipping');
CREATE TYPE public.redemption_status       AS ENUM ('reserved', 'confirmed', 'released');
CREATE TYPE public.review_status           AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.event_actor             AS ENUM ('system', 'customer', 'admin', 'webhook');
CREATE TYPE public.refund_status           AS ENUM ('requested', 'approved', 'processed', 'rejected');

-- -----------------------------------------------------------------------------
-- 2. IDENTIDAD
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text,
  full_name        text CHECK (full_name IS NULL OR length(full_name) <= 150),
  phone            text CHECK (phone IS NULL OR length(phone) <= 30),
  avatar_url       text,
  role             public.app_role NOT NULL DEFAULT 'customer',
  preferred_size   text CHECK (preferred_size IS NULL OR length(preferred_size) <= 10),
  preferred_fit    public.product_fit,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_role ON public.profiles(role) WHERE role <> 'customer';

CREATE TABLE public.customer_addresses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_name text NOT NULL CHECK (length(recipient_name) BETWEEN 2 AND 150),
  phone          text NOT NULL CHECK (length(phone) BETWEEN 7 AND 30),
  department     text NOT NULL CHECK (length(department) BETWEEN 2 AND 100),
  city           text NOT NULL CHECK (length(city) BETWEEN 2 AND 100),
  address_line   text NOT NULL CHECK (length(address_line) BETWEEN 4 AND 255),
  neighborhood   text CHECK (neighborhood IS NULL OR length(neighborhood) <= 100),
  reference      text CHECK (reference IS NULL OR length(reference) <= 500),
  is_default     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_addresses_user ON public.customer_addresses(user_id);
CREATE UNIQUE INDEX uq_customer_addresses_default ON public.customer_addresses(user_id) WHERE is_default;

-- -----------------------------------------------------------------------------
-- 3. CATÁLOGO
-- -----------------------------------------------------------------------------
CREATE TABLE public.categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text NOT NULL,
  parent_id   uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  size_group  public.size_group NOT NULL DEFAULT 'alpha',
  image_url   text,
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.style_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text NOT NULL,
  tagline     text,
  description text,
  badge       text,
  image_url   text,
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.occasions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text NOT NULL,
  subtitle   text,
  image_url  text,
  sort_order int NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true
);

CREATE TABLE public.brands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sizes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  size_group public.size_group NOT NULL,
  code       text NOT NULL CHECK (code ~ '^[A-Z0-9]{1,6}$'),
  name       text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (size_group, code)
);

CREATE TABLE public.colors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text NOT NULL UNIQUE,
  hex_code   text NOT NULL CHECK (hex_code ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE public.products (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        text NOT NULL UNIQUE CHECK (reference ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'),
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text NOT NULL CHECK (length(name) BETWEEN 2 AND 150),
  description      text,
  details          text[] NOT NULL DEFAULT '{}',
  fit              public.product_fit NOT NULL DEFAULT 'REGULAR',
  fit_description  text,
  category_id      uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  style_line_id    uuid REFERENCES public.style_lines(id) ON DELETE SET NULL,
  brand_id         uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  base_price       bigint NOT NULL CHECK (base_price > 0),
  compare_at_price bigint CHECK (compare_at_price IS NULL OR compare_at_price > base_price),
  base_cost        bigint CHECK (base_cost IS NULL OR base_cost >= 0),
  status           public.product_status NOT NULL DEFAULT 'draft',
  is_featured_new  boolean NOT NULL DEFAULT false,
  is_bestseller    boolean NOT NULL DEFAULT false,
  published_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_active_requires_published CHECK (status <> 'active' OR published_at IS NOT NULL)
);
CREATE INDEX idx_products_category   ON public.products(category_id);
CREATE INDEX idx_products_style_line ON public.products(style_line_id);
CREATE INDEX idx_products_status     ON public.products(status);

CREATE TABLE public.product_occasions (
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  occasion_id uuid NOT NULL REFERENCES public.occasions(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, occasion_id)
);
CREATE INDEX idx_product_occasions_occasion ON public.product_occasions(occasion_id);

-- Colores ofrecidos por cada producto: ancla de galería y de variantes.
CREATE TABLE public.product_colors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  color_id   uuid NOT NULL REFERENCES public.colors(id) ON DELETE RESTRICT,
  position   int NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  UNIQUE (product_id, color_id)
);
CREATE UNIQUE INDEX uq_product_colors_default ON public.product_colors(product_id) WHERE is_default;
CREATE INDEX idx_product_colors_color ON public.product_colors(color_id);

-- Galería por color (color_id NULL = imagen general del producto).
CREATE TABLE public.product_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  color_id     uuid,
  storage_path text CHECK (storage_path IS NULL OR storage_path ~ '^[a-z0-9/_.-]+$'),
  external_url text CHECK (external_url IS NULL OR external_url ~ '^https://'),
  alt_text     text,
  position     int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_images_one_source CHECK (num_nonnulls(storage_path, external_url) = 1),
  CONSTRAINT product_images_color_declared FOREIGN KEY (product_id, color_id)
    REFERENCES public.product_colors(product_id, color_id) ON DELETE CASCADE
);
CREATE INDEX idx_product_images_gallery ON public.product_images(product_id, color_id, position);

CREATE TABLE public.variants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  color_id       uuid NOT NULL,
  size_id        uuid NOT NULL REFERENCES public.sizes(id) ON DELETE RESTRICT,
  sku            text NOT NULL UNIQUE CHECK (sku ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'),
  barcode        text UNIQUE,
  price_override bigint CHECK (price_override IS NULL OR price_override > 0),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, color_id, size_id),
  CONSTRAINT variants_color_declared FOREIGN KEY (product_id, color_id)
    REFERENCES public.product_colors(product_id, color_id) ON DELETE RESTRICT
);
CREATE INDEX idx_variants_size ON public.variants(size_id);

CREATE TABLE public.collections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text NOT NULL,
  subtitle     text,
  image_url    text,
  kind         text NOT NULL DEFAULT 'collection' CHECK (kind IN ('collection', 'look')),
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0
);
CREATE TABLE public.collection_products (
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  position      int NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, product_id)
);
CREATE INDEX idx_collection_products_product ON public.collection_products(product_id);

-- -----------------------------------------------------------------------------
-- 4. INVENTARIO
-- -----------------------------------------------------------------------------
CREATE TABLE public.branches (   -- semántica: bodega
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  address    text,
  phone      text,
  is_default boolean NOT NULL DEFAULT false,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_branches_single_default ON public.branches((true)) WHERE is_default;

CREATE TABLE public.inventories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  variant_id     uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  stock          int NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reserved       int NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  min_stock      int NOT NULL DEFAULT 2 CHECK (min_stock >= 0),
  location_shelf text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, variant_id),
  CONSTRAINT inventories_reserved_le_stock CHECK (reserved <= stock)
);
CREATE INDEX idx_inventories_variant ON public.inventories(variant_id);

CREATE TABLE public.inventory_movements (   -- append-only
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id    uuid NOT NULL REFERENCES public.inventories(id) ON DELETE RESTRICT,
  variant_id      uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  branch_id       uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  movement_type   public.inventory_movement_type NOT NULL,
  quantity_change int NOT NULL CHECK (quantity_change <> 0),
  quantity_before int NOT NULL CHECK (quantity_before >= 0),
  quantity_after  int NOT NULL CHECK (quantity_after >= 0),
  reason          text,
  reference_type  text CHECK (reference_type IN ('order', 'manual', 'product_setup')),
  reference_id    uuid,
  actor_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT inventory_movements_arithmetic CHECK (quantity_after = quantity_before + quantity_change)
);
CREATE INDEX idx_inventory_movements_variant ON public.inventory_movements(variant_id, created_at);
-- Idempotencia: una venta y una restauración por variante y pedido.
CREATE UNIQUE INDEX uq_inventory_movements_order ON public.inventory_movements(reference_id, variant_id, movement_type)
  WHERE reference_type = 'order';

-- -----------------------------------------------------------------------------
-- 5. ENVÍOS Y CUPONES
-- -----------------------------------------------------------------------------
CREATE TABLE public.shipping_methods (
  code               text PRIMARY KEY CHECK (code ~ '^[a-z_]+$'),
  name               text NOT NULL,
  cost               bigint NOT NULL CHECK (cost >= 0),
  free_over_subtotal bigint CHECK (free_over_subtotal IS NULL OR free_over_subtotal > 0),
  eta_text           text,
  is_active          boolean NOT NULL DEFAULT true,
  sort_order         int NOT NULL DEFAULT 0,
  CONSTRAINT shipping_methods_active_needs_cost CHECK (NOT is_active OR cost > 0)
);

CREATE TABLE public.coupons (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{3,40}$'),
  description        text,
  discount_type      public.coupon_type NOT NULL,
  discount_value     bigint NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  min_subtotal       bigint NOT NULL DEFAULT 0 CHECK (min_subtotal >= 0),
  max_uses           int CHECK (max_uses IS NULL OR max_uses > 0),
  max_uses_per_email int CHECK (max_uses_per_email IS NULL OR max_uses_per_email > 0),
  used_count         int NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  is_active          boolean NOT NULL DEFAULT true,
  starts_at          timestamptz,
  expires_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_percent_range CHECK (discount_type <> 'percent' OR discount_value BETWEEN 1 AND 90),
  CONSTRAINT coupons_fixed_positive CHECK (discount_type <> 'fixed' OR discount_value > 0),
  CONSTRAINT coupons_window CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
);

-- -----------------------------------------------------------------------------
-- 6. PEDIDOS
-- -----------------------------------------------------------------------------
CREATE SEQUENCE public.order_number_seq START 1000;

CREATE TABLE public.online_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          text NOT NULL UNIQUE DEFAULT ('JM-' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  public_token          uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  idempotency_key       text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 150),
  user_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  branch_id             uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  customer_name         text NOT NULL,
  customer_email        text NOT NULL CHECK (customer_email = lower(customer_email)),
  customer_phone        text NOT NULL,
  customer_document     text,
  shipping_department   text NOT NULL,
  shipping_city         text NOT NULL,
  shipping_address      text NOT NULL,
  shipping_neighborhood text,
  shipping_notes        text,
  shipping_method_code  text NOT NULL REFERENCES public.shipping_methods(code),
  payment_method        public.payment_method NOT NULL DEFAULT 'wompi',
  currency              char(3) NOT NULL DEFAULT 'COP' CHECK (currency = 'COP'),
  subtotal              bigint NOT NULL CHECK (subtotal > 0),
  discount_total        bigint NOT NULL DEFAULT 0 CHECK (discount_total >= 0 AND discount_total <= subtotal),
  shipping_cost         bigint NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  total                 bigint NOT NULL,
  coupon_id             uuid REFERENCES public.coupons(id) ON DELETE RESTRICT,
  coupon_code           text,
  status                public.order_status NOT NULL DEFAULT 'payment_pending',
  payment_expires_at    timestamptz NOT NULL,
  carrier               text,
  tracking_number       text,
  tracking_url          text CHECK (tracking_url IS NULL OR tracking_url ~ '^https://'),
  paid_at               timestamptz,
  shipped_at            timestamptz,
  delivered_at          timestamptz,
  cancelled_at          timestamptz,
  cancel_reason         text,
  needs_attention       boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT online_orders_total_arithmetic CHECK (total = subtotal - discount_total + shipping_cost),
  CONSTRAINT online_orders_coupon_snapshot CHECK ((coupon_id IS NULL) = (coupon_code IS NULL))
);
CREATE INDEX idx_online_orders_user    ON public.online_orders(user_id, created_at DESC);
CREATE INDEX idx_online_orders_status  ON public.online_orders(status, created_at DESC);
CREATE INDEX idx_online_orders_email   ON public.online_orders(customer_email);
CREATE INDEX idx_online_orders_expiry  ON public.online_orders(payment_expires_at) WHERE status = 'payment_pending';
CREATE INDEX idx_online_orders_branch  ON public.online_orders(branch_id);
CREATE INDEX idx_online_orders_coupon  ON public.online_orders(coupon_id);

CREATE TABLE public.online_order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE RESTRICT,
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id    uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  product_name  text NOT NULL,
  sku           text NOT NULL,
  size_code     text NOT NULL,
  color_name    text NOT NULL,
  image_url     text,
  unit_price    bigint NOT NULL CHECK (unit_price > 0),
  quantity      int NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  line_discount bigint NOT NULL DEFAULT 0 CHECK (line_discount >= 0),
  line_total    bigint NOT NULL,
  UNIQUE (order_id, variant_id),
  CONSTRAINT online_order_items_arithmetic CHECK (line_total = unit_price * quantity - line_discount),
  CONSTRAINT online_order_items_discount_le_gross CHECK (line_discount <= unit_price * quantity)
);
CREATE INDEX idx_online_order_items_variant ON public.online_order_items(variant_id);
CREATE INDEX idx_online_order_items_product ON public.online_order_items(product_id);

CREATE TABLE public.coupon_redemptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id       uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  order_id        uuid NOT NULL UNIQUE REFERENCES public.online_orders(id) ON DELETE RESTRICT,
  customer_email  text NOT NULL,
  discount_amount bigint NOT NULL CHECK (discount_amount >= 0),
  status          public.redemption_status NOT NULL DEFAULT 'reserved',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coupon_redemptions_coupon ON public.coupon_redemptions(coupon_id, status);
CREATE INDEX idx_coupon_redemptions_email  ON public.coupon_redemptions(coupon_id, customer_email);

CREATE TABLE public.inventory_reservations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE RESTRICT,
  inventory_id uuid NOT NULL REFERENCES public.inventories(id) ON DELETE RESTRICT,
  variant_id   uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  quantity     int NOT NULL CHECK (quantity > 0),
  status       public.reservation_status NOT NULL DEFAULT 'active',
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, inventory_id)
);
CREATE INDEX idx_reservations_active ON public.inventory_reservations(expires_at) WHERE status = 'active';
CREATE INDEX idx_reservations_inventory ON public.inventory_reservations(inventory_id);

CREATE TABLE public.order_status_catalog (
  status        public.order_status PRIMARY KEY,
  label         text NOT NULL,
  description   text,
  is_terminal   boolean NOT NULL,
  sort_order    int NOT NULL
);

CREATE TABLE public.order_status_transitions (
  from_status   public.order_status NOT NULL,
  to_status     public.order_status NOT NULL,
  allowed_actor public.event_actor NOT NULL,
  requires_note boolean NOT NULL DEFAULT false,
  PRIMARY KEY (from_status, to_status, allowed_actor),
  CHECK (from_status <> to_status)
);

CREATE TABLE public.order_events (   -- append-only
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE RESTRICT,
  event_type    text NOT NULL,
  from_status   public.order_status,
  to_status     public.order_status,
  actor         public.event_actor NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note          text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_order_events_order ON public.order_events(order_id, created_at);

-- -----------------------------------------------------------------------------
-- 7. PAGOS
-- -----------------------------------------------------------------------------
CREATE TABLE public.payment_transactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE RESTRICT,
  provider                text NOT NULL DEFAULT 'wompi' CHECK (provider = 'wompi'),
  attempt_number          int NOT NULL CHECK (attempt_number BETWEEN 1 AND 10),
  reference               text NOT NULL UNIQUE,
  provider_transaction_id text UNIQUE,
  amount_in_cents         bigint NOT NULL CHECK (amount_in_cents > 0),
  currency                char(3) NOT NULL DEFAULT 'COP',
  payment_method_type     text,
  status                  public.payment_status NOT NULL DEFAULT 'PENDING',
  status_message          text,
  requires_refund         boolean NOT NULL DEFAULT false,
  last_event_at           timestamptz,
  raw_last_event          jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, attempt_number)
);
-- Un solo pago aprobado "válido" por pedido (los duplicados quedan marcados para reembolso).
CREATE UNIQUE INDEX uq_payment_transactions_one_approved ON public.payment_transactions(order_id)
  WHERE status = 'APPROVED' AND NOT requires_refund;

CREATE TABLE public.webhook_events (   -- bandeja de entrada idempotente
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                text NOT NULL DEFAULT 'wompi',
  event_checksum          text NOT NULL,
  event_type              text,
  provider_transaction_id text,
  reference               text,
  payload                 jsonb NOT NULL,
  received_at             timestamptz NOT NULL DEFAULT now(),
  processed_at            timestamptz,
  result                  text CHECK (result IN ('applied', 'ignored', 'rejected')),
  detail                  text,
  UNIQUE (provider, event_checksum)
);
CREATE INDEX idx_webhook_events_reference ON public.webhook_events(reference);

CREATE TABLE public.order_refunds (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE RESTRICT,
  payment_transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,
  amount                 bigint NOT NULL CHECK (amount > 0),
  reason                 text NOT NULL,
  status                 public.refund_status NOT NULL DEFAULT 'requested',
  provider_refund_id     text,
  restock                boolean NOT NULL DEFAULT false,
  requested_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_refunds_order ON public.order_refunds(order_id);
CREATE INDEX idx_order_refunds_payment ON public.order_refunds(payment_transaction_id);

-- -----------------------------------------------------------------------------
-- 8. CONTENIDO, RESEÑAS, FAVORITOS, AUDITORÍA
-- -----------------------------------------------------------------------------
CREATE TABLE public.product_reviews (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_item_id     uuid UNIQUE REFERENCES public.online_order_items(id) ON DELETE SET NULL,
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name       text NOT NULL,
  city              text,
  rating            int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title             text NOT NULL,
  comment           text NOT NULL,
  is_verified_buyer boolean GENERATED ALWAYS AS (order_item_id IS NOT NULL) STORED,
  status            public.review_status NOT NULL DEFAULT 'pending',
  admin_reply       text,
  moderated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  moderated_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_reviews_product ON public.product_reviews(product_id, status);

CREATE TABLE public.site_content (
  key          text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]+$'),
  image_url    text,
  storage_path text,
  alt_text     text,
  title        text,
  body         text,
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wishlist_items (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX idx_wishlist_items_product ON public.wishlist_items(product_id);

CREATE TABLE public.audit_logs (   -- append-only
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid,
  db_role       text NOT NULL DEFAULT current_user,
  table_name    text NOT NULL,
  record_id     text,
  action        text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data      jsonb,
  new_data      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_table ON public.audit_logs(table_name, created_at DESC);

-- -----------------------------------------------------------------------------
-- 9. VISTAS DE LECTURA
-- -----------------------------------------------------------------------------
-- Disponibilidad pública: vista con privilegios del propietario (no expone stock
-- ni reservas por separado; solo productos activos y variantes activas).
CREATE VIEW public.v_variant_availability WITH (security_barrier = true) AS
SELECT v.id         AS variant_id,
       v.product_id,
       v.color_id,
       v.size_id,
       GREATEST(COALESCE(SUM(i.stock - i.reserved), 0), 0)::int AS available
FROM public.variants v
JOIN public.products p ON p.id = v.product_id AND p.status = 'active'
LEFT JOIN public.inventories i ON i.variant_id = v.id
WHERE v.is_active
GROUP BY v.id;

CREATE VIEW public.v_product_rating WITH (security_invoker = true) AS
SELECT product_id,
       round(avg(rating)::numeric, 1) AS rating,
       count(*)::int                  AS review_count
FROM public.product_reviews
WHERE status = 'approved'
GROUP BY product_id;

-- -----------------------------------------------------------------------------
-- 10. FUNCIONES PRIVADAS (utilidades y triggers)
-- -----------------------------------------------------------------------------
CREATE FUNCTION private.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE FUNCTION private.forbid_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción (append-only)', TG_TABLE_NAME
    USING ERRCODE = 'P0001', HINT = 'JM_APPEND_ONLY';
END $$;

CREATE FUNCTION private.audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_user_id, db_role, table_name, record_id, action, old_data, new_data)
  VALUES (
    auth.uid(), COALESCE(auth.role(), session_user), TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'id') ELSE (to_jsonb(NEW) ->> 'id') END,
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN NULL;
END $$;

CREATE FUNCTION private.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Todo registro público recibe el rol 'customer'. Los roles administrativos
  -- se asignan exclusivamente con public.admin_set_user_role() (super_admin).
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    lower(NEW.email),
    left(COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'), 150),
    NEW.raw_user_meta_data ->> 'avatar_url',
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE FUNCTION private.guard_profile_role() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND current_setting('jm.allow_role_change', true) IS DISTINCT FROM 'on'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'El rol solo puede cambiarse con admin_set_user_role()'
      USING ERRCODE = '42501', HINT = 'JM_FORBIDDEN';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'El email del perfil se sincroniza desde Auth'
      USING ERRCODE = '42501', HINT = 'JM_FORBIDDEN';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION private.default_branch_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM public.branches WHERE is_default AND is_active LIMIT 1
$$;

CREATE FUNCTION private.reservation_ttl() RETURNS interval
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT interval '30 minutes' $$;

-- Permisos de rol (usados por RLS → deben ser ejecutables por anon/authenticated).
CREATE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid()) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT role IN ('admin', 'super_admin') FROM public.profiles WHERE id = p_user_id), false)
$$;

CREATE FUNCTION public.is_super_admin(p_user_id uuid DEFAULT auth.uid()) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT role = 'super_admin' FROM public.profiles WHERE id = p_user_id), false)
$$;

CREATE FUNCTION private.require_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso restringido a administradores' USING ERRCODE = '42501', HINT = 'JM_FORBIDDEN';
  END IF;
END $$;

-- Precio y disponibilidad de una lista de ítems [{variant_id, quantity}].
-- Agrupa duplicados. Con p_lock=true bloquea las filas de inventario en orden de variant_id.
CREATE FUNCTION private.price_items(p_items jsonb, p_lock boolean)
RETURNS TABLE (
  variant_id uuid, product_id uuid, quantity int, unit_price bigint,
  product_name text, sku text, size_code text, color_name text, image_url text,
  inventory_id uuid, available int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_branch uuid := private.default_branch_id();
  v_count int;
  v_bad text;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido no contiene artículos' USING ERRCODE = 'P0001', HINT = 'JM_EMPTY_CART';
  END IF;
  IF jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'Máximo 20 líneas por pedido' USING ERRCODE = 'P0001', HINT = 'JM_TOO_MANY_ITEMS';
  END IF;

  -- Validación de forma de cada ítem
  SELECT string_agg(e::text, ', ') INTO v_bad
  FROM jsonb_array_elements(p_items) e
  WHERE jsonb_typeof(e) <> 'object'
     OR NOT (e ? 'variant_id') OR NOT (e ? 'quantity')
     OR (e ->> 'variant_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR (e ->> 'quantity') !~ '^[0-9]{1,3}$';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Artículo inválido: %', v_bad USING ERRCODE = 'P0001', HINT = 'JM_INVALID_ITEM';
  END IF;

  IF to_regclass('pg_temp._jm_items') IS NULL THEN
    CREATE TEMP TABLE _jm_items (variant_id uuid PRIMARY KEY, quantity int) ON COMMIT DROP;
  ELSE
    TRUNCATE _jm_items;
  END IF;
  INSERT INTO _jm_items (variant_id, quantity)
  SELECT (e ->> 'variant_id')::uuid, SUM((e ->> 'quantity')::int)
  FROM jsonb_array_elements(p_items) e
  GROUP BY 1;

  IF EXISTS (SELECT 1 FROM _jm_items WHERE _jm_items.quantity < 1 OR _jm_items.quantity > 20) THEN
    RAISE EXCEPTION 'La cantidad por prenda debe estar entre 1 y 20' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_QUANTITY';
  END IF;

  -- Variantes inexistentes, inactivas o de productos no publicados
  SELECT count(*) INTO v_count
  FROM _jm_items it
  LEFT JOIN public.variants v ON v.id = it.variant_id AND v.is_active
  LEFT JOIN public.products p ON p.id = v.product_id AND p.status = 'active'
  WHERE p.id IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Una o más prendas ya no están disponibles en el catálogo' USING ERRCODE = 'P0001', HINT = 'JM_VARIANT_UNAVAILABLE';
  END IF;

  IF p_lock THEN
    PERFORM 1 FROM public.inventories inv
    WHERE inv.branch_id = v_branch AND inv.variant_id IN (SELECT it.variant_id FROM _jm_items it)
    ORDER BY inv.variant_id
    FOR UPDATE;
  END IF;

  RETURN QUERY
  SELECT it.variant_id,
         v.product_id,
         it.quantity,
         COALESCE(v.price_override, p.base_price),
         p.name,
         v.sku,
         s.code,
         c.name,
         (SELECT COALESCE(pi.external_url, pi.storage_path)
            FROM public.product_images pi
           WHERE pi.product_id = p.id AND (pi.color_id = v.color_id OR pi.color_id IS NULL)
           ORDER BY (pi.color_id IS NULL), pi.position
           LIMIT 1),
         inv.id,
         COALESCE(inv.stock - inv.reserved, 0)
  FROM _jm_items it
  JOIN public.variants v  ON v.id = it.variant_id
  JOIN public.products p  ON p.id = v.product_id
  JOIN public.sizes s     ON s.id = v.size_id
  JOIN public.colors c    ON c.id = v.color_id
  LEFT JOIN public.inventories inv ON inv.variant_id = v.id AND inv.branch_id = v_branch
  ORDER BY it.variant_id;
END $$;

-- Evaluación de cupón. Con p_lock=true bloquea el cupón (para crear pedidos).
CREATE FUNCTION private.evaluate_coupon(p_code text, p_subtotal bigint, p_email text, p_lock boolean)
RETURNS TABLE (coupon_id uuid, code text, is_valid boolean, reason text, discount_amount bigint, free_shipping boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_code text := upper(btrim(COALESCE(p_code, '')));
  c public.coupons%ROWTYPE;
  v_uses int;
  v_email_uses int;
  v_discount bigint := 0;
BEGIN
  IF v_code = '' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, 'EMPTY'::text, 0::bigint, false;
    RETURN;
  END IF;

  IF p_lock THEN
    SELECT * INTO c FROM public.coupons cp WHERE cp.code = v_code FOR UPDATE;
  ELSE
    SELECT * INTO c FROM public.coupons cp WHERE cp.code = v_code;
  END IF;

  IF NOT FOUND OR NOT c.is_active THEN
    RETURN QUERY SELECT NULL::uuid, v_code, false, 'NOT_FOUND'::text, 0::bigint, false; RETURN;
  END IF;
  IF c.starts_at IS NOT NULL AND c.starts_at > now() THEN
    RETURN QUERY SELECT c.id, v_code, false, 'NOT_STARTED'::text, 0::bigint, false; RETURN;
  END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at <= now() THEN
    RETURN QUERY SELECT c.id, v_code, false, 'EXPIRED'::text, 0::bigint, false; RETURN;
  END IF;
  IF p_subtotal < c.min_subtotal THEN
    RETURN QUERY SELECT c.id, v_code, false, 'MIN_SUBTOTAL'::text, 0::bigint, false; RETURN;
  END IF;

  -- Usos = confirmados (used_count) + reservas vigentes de pedidos en pago
  SELECT c.used_count + count(*) INTO v_uses FROM public.coupon_redemptions r
   WHERE r.coupon_id = c.id AND r.status = 'reserved';
  IF c.max_uses IS NOT NULL AND v_uses >= c.max_uses THEN
    RETURN QUERY SELECT c.id, v_code, false, 'EXHAUSTED'::text, 0::bigint, false; RETURN;
  END IF;
  IF c.max_uses_per_email IS NOT NULL AND p_email IS NOT NULL THEN
    SELECT count(*) INTO v_email_uses FROM public.coupon_redemptions r
     WHERE r.coupon_id = c.id AND r.status IN ('reserved', 'confirmed')
       AND r.customer_email = lower(btrim(p_email));
    IF v_email_uses >= c.max_uses_per_email THEN
      RETURN QUERY SELECT c.id, v_code, false, 'EMAIL_LIMIT'::text, 0::bigint, false; RETURN;
    END IF;
  END IF;

  IF c.discount_type = 'percent' THEN
    v_discount := round(p_subtotal * c.discount_value / 100.0)::bigint;
  ELSIF c.discount_type = 'fixed' THEN
    v_discount := LEAST(c.discount_value, p_subtotal);
  END IF;

  RETURN QUERY SELECT c.id, v_code, true, 'OK'::text, v_discount, (c.discount_type = 'free_shipping');
END $$;

CREATE FUNCTION private.shipping_cost(p_method text, p_net_subtotal bigint, p_free_shipping boolean)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.shipping_methods%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.shipping_methods WHERE code = COALESCE(p_method, 'standard') AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Método de envío no disponible: %', p_method USING ERRCODE = 'P0001', HINT = 'JM_SHIPPING_UNAVAILABLE';
  END IF;
  IF p_free_shipping OR (m.free_over_subtotal IS NOT NULL AND p_net_subtotal >= m.free_over_subtotal) THEN
    RETURN 0;
  END IF;
  RETURN m.cost;
END $$;

-- Libera reservas activas de un pedido (expiración o cancelación antes del pago).
CREATE FUNCTION private.release_reservations(p_order_id uuid, p_new_status public.reservation_status)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT res.id, res.inventory_id, res.quantity
      FROM public.inventory_reservations res
      JOIN public.inventories inv ON inv.id = res.inventory_id
     WHERE res.order_id = p_order_id AND res.status = 'active'
     ORDER BY inv.variant_id
     FOR UPDATE OF res, inv
  LOOP
    UPDATE public.inventories SET reserved = reserved - r.quantity WHERE id = r.inventory_id;
    UPDATE public.inventory_reservations SET status = p_new_status WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Al pagar: consume reservas activas; si no las hay (pago tardío), intenta descontar
-- stock disponible. Devuelve la lista de faltantes (vacía si todo quedó descontado).
CREATE FUNCTION private.commit_stock_for_order(p_order_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  it record;
  inv record;
  res record;
  v_branch uuid;
  v_shortages jsonb := '[]'::jsonb;
BEGIN
  SELECT branch_id INTO v_branch FROM public.online_orders WHERE id = p_order_id;

  FOR it IN
    SELECT oi.variant_id, oi.quantity FROM public.online_order_items oi
     WHERE oi.order_id = p_order_id ORDER BY oi.variant_id
  LOOP
    SELECT * INTO inv FROM public.inventories
     WHERE variant_id = it.variant_id AND branch_id = v_branch FOR UPDATE;

    SELECT * INTO res FROM public.inventory_reservations
     WHERE order_id = p_order_id AND variant_id = it.variant_id AND status = 'active' FOR UPDATE;

    IF res.id IS NOT NULL THEN
      UPDATE public.inventories SET stock = stock - it.quantity, reserved = reserved - it.quantity WHERE id = inv.id;
      UPDATE public.inventory_reservations SET status = 'consumed' WHERE id = res.id;
    ELSIF inv.id IS NOT NULL AND inv.stock - inv.reserved >= it.quantity THEN
      UPDATE public.inventories SET stock = stock - it.quantity WHERE id = inv.id;
    ELSE
      v_shortages := v_shortages || jsonb_build_object('variant_id', it.variant_id, 'quantity', it.quantity,
                                                       'available', COALESCE(inv.stock - inv.reserved, 0));
      CONTINUE;
    END IF;

    INSERT INTO public.inventory_movements (inventory_id, variant_id, branch_id, movement_type, quantity_change,
                                            quantity_before, quantity_after, reason, reference_type, reference_id, actor_user_id)
    VALUES (inv.id, it.variant_id, v_branch, 'sale', -it.quantity, inv.stock, inv.stock - it.quantity,
            'Venta confirmada por pago', 'order', p_order_id, p_actor);
  END LOOP;
  RETURN v_shortages;
END $$;

-- Devuelve al inventario lo efectivamente vendido en el pedido (según el libro de movimientos).
CREATE FUNCTION private.restore_stock_for_order(p_order_id uuid, p_actor uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m record;
  inv record;
  n int := 0;
BEGIN
  FOR m IN
    SELECT s.inventory_id, s.variant_id, s.branch_id, -s.quantity_change AS qty
      FROM public.inventory_movements s
     WHERE s.reference_type = 'order' AND s.reference_id = p_order_id AND s.movement_type = 'sale'
       AND NOT EXISTS (SELECT 1 FROM public.inventory_movements r
                        WHERE r.reference_type = 'order' AND r.reference_id = p_order_id
                          AND r.movement_type = 'cancel_restore' AND r.variant_id = s.variant_id)
     ORDER BY s.variant_id
  LOOP
    SELECT * INTO inv FROM public.inventories WHERE id = m.inventory_id FOR UPDATE;
    UPDATE public.inventories SET stock = stock + m.qty WHERE id = inv.id;
    INSERT INTO public.inventory_movements (inventory_id, variant_id, branch_id, movement_type, quantity_change,
                                            quantity_before, quantity_after, reason, reference_type, reference_id, actor_user_id)
    VALUES (inv.id, m.variant_id, m.branch_id, 'cancel_restore', m.qty, inv.stock, inv.stock + m.qty,
            'Reingreso por cancelación/reembolso', 'order', p_order_id, p_actor);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Única puerta de cambio de estado de un pedido.
CREATE FUNCTION private.transition_order(
  p_order_id uuid,
  p_to public.order_status,
  p_actor public.event_actor,
  p_actor_user uuid,
  p_note text,
  p_tracking jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  o public.online_orders%ROWTYPE;
  t public.order_status_transitions%ROWTYPE;
  v_shortages jsonb := '[]'::jsonb;
  v_restored int := 0;
  v_released int := 0;
  v_payment uuid;
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  SELECT * INTO o FROM public.online_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0001', HINT = 'JM_ORDER_NOT_FOUND';
  END IF;

  SELECT * INTO t FROM public.order_status_transitions
   WHERE from_status = o.status AND to_status = p_to AND allowed_actor = p_actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transición no permitida: % → % (%)', o.status, p_to, p_actor
      USING ERRCODE = 'P0001', HINT = 'JM_INVALID_TRANSITION';
  END IF;
  IF t.requires_note AND COALESCE(btrim(p_note), '') = '' THEN
    RAISE EXCEPTION 'Esta transición requiere una nota' USING ERRCODE = 'P0001', HINT = 'JM_NOTE_REQUIRED';
  END IF;

  -- Efectos por destino
  IF p_to = 'paid' THEN
    v_shortages := private.commit_stock_for_order(o.id, p_actor_user);
    UPDATE public.coupon_redemptions SET status = 'confirmed' WHERE order_id = o.id AND status IN ('reserved', 'released');
    IF FOUND THEN
      UPDATE public.coupons SET used_count = used_count + 1 WHERE id = o.coupon_id;
    END IF;
    UPDATE public.online_orders
       SET status = 'paid', paid_at = now(),
           needs_attention = needs_attention OR jsonb_array_length(v_shortages) > 0
     WHERE id = o.id;
    IF jsonb_array_length(v_shortages) > 0 THEN
      v_meta := v_meta || jsonb_build_object('shortages', v_shortages);
      INSERT INTO public.order_events (order_id, event_type, from_status, to_status, actor, actor_user_id, metadata)
      VALUES (o.id, 'PAID_WITHOUT_STOCK', o.status, 'paid', p_actor, p_actor_user, jsonb_build_object('shortages', v_shortages));
    END IF;

  ELSIF p_to IN ('expired', 'cancelled') AND o.status = 'payment_pending' THEN
    v_released := private.release_reservations(o.id, CASE WHEN p_to = 'expired' THEN 'expired' ELSE 'released' END::public.reservation_status);
    UPDATE public.coupon_redemptions SET status = 'released' WHERE order_id = o.id AND status = 'reserved';
    UPDATE public.online_orders
       SET status = p_to,
           cancelled_at = CASE WHEN p_to = 'cancelled' THEN now() END,
           cancel_reason = CASE WHEN p_to = 'cancelled' THEN p_note END
     WHERE id = o.id;

  ELSIF p_to IN ('cancelled', 'refunded') AND o.status IN ('paid', 'processing') THEN
    v_restored := private.restore_stock_for_order(o.id, p_actor_user);
    SELECT id INTO v_payment FROM public.payment_transactions
     WHERE order_id = o.id AND status = 'APPROVED' AND NOT requires_refund LIMIT 1;
    INSERT INTO public.order_refunds (order_id, payment_transaction_id, amount, reason, restock, requested_by)
    VALUES (o.id, v_payment, o.total, p_note, true, p_actor_user);
    UPDATE public.online_orders
       SET status = p_to,
           cancelled_at = CASE WHEN p_to = 'cancelled' THEN now() ELSE cancelled_at END,
           cancel_reason = CASE WHEN p_to = 'cancelled' THEN p_note ELSE cancel_reason END
     WHERE id = o.id;

  ELSIF p_to = 'refunded' AND o.status = 'delivered' THEN
    -- Mercancía en poder del cliente: el reingreso se registra al recibir la devolución
    -- (admin_adjust_inventory con tipo 'return').
    SELECT id INTO v_payment FROM public.payment_transactions
     WHERE order_id = o.id AND status = 'APPROVED' AND NOT requires_refund LIMIT 1;
    INSERT INTO public.order_refunds (order_id, payment_transaction_id, amount, reason, restock, requested_by)
    VALUES (o.id, v_payment, o.total, p_note, false, p_actor_user);
    UPDATE public.online_orders SET status = 'refunded' WHERE id = o.id;

  ELSIF p_to = 'shipped' THEN
    IF COALESCE(btrim(p_tracking ->> 'carrier'), o.carrier, '') = ''
       OR COALESCE(btrim(p_tracking ->> 'tracking_number'), o.tracking_number, '') = '' THEN
      RAISE EXCEPTION 'Para marcar como enviado se requieren transportadora y número de guía'
        USING ERRCODE = 'P0001', HINT = 'JM_TRACKING_REQUIRED';
    END IF;
    UPDATE public.online_orders
       SET status = 'shipped', shipped_at = now(),
           carrier = COALESCE(NULLIF(btrim(p_tracking ->> 'carrier'), ''), carrier),
           tracking_number = COALESCE(NULLIF(btrim(p_tracking ->> 'tracking_number'), ''), tracking_number),
           tracking_url = COALESCE(NULLIF(btrim(p_tracking ->> 'tracking_url'), ''), tracking_url)
     WHERE id = o.id;

  ELSIF p_to = 'delivered' THEN
    UPDATE public.online_orders SET status = 'delivered', delivered_at = now() WHERE id = o.id;

  ELSE
    UPDATE public.online_orders SET status = p_to WHERE id = o.id;
  END IF;

  INSERT INTO public.order_events (order_id, event_type, from_status, to_status, actor, actor_user_id, note, metadata)
  VALUES (o.id, 'STATUS_CHANGED', o.status, p_to, p_actor, p_actor_user, p_note,
          v_meta || jsonb_build_object('reservations_released', v_released, 'lines_restocked', v_restored));

  RETURN jsonb_build_object('order_id', o.id, 'order_number', o.order_number,
                            'from_status', o.status, 'to_status', p_to,
                            'shortages', v_shortages, 'lines_restocked', v_restored,
                            'reservations_released', v_released);
END $$;

-- -----------------------------------------------------------------------------
-- 11. TRIGGERS
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','customer_addresses','categories','style_lines','products','variants',
                           'branches','inventories','coupons','coupon_redemptions','online_orders',
                           'inventory_reservations','payment_transactions','order_refunds'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I
                    FOR EACH ROW EXECUTE FUNCTION private.set_updated_at()', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['inventory_movements','order_events','audit_logs'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
                    FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation()', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['products','variants','product_colors','coupons','shipping_methods','branches','profiles'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
                    FOR EACH ROW EXECUTE FUNCTION private.audit_row_change()', t);
  END LOOP;
END $$;

CREATE TRIGGER trg_profiles_guard_role BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.guard_profile_role();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

-- -----------------------------------------------------------------------------
-- 12. RPC PÚBLICAS — TIENDA
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.get_order_status_catalog() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'statuses', (SELECT jsonb_agg(jsonb_build_object('status', status, 'label', label, 'description', description,
                                                     'is_terminal', is_terminal, 'sort_order', sort_order) ORDER BY sort_order)
                 FROM public.order_status_catalog),
    'transitions', (SELECT jsonb_agg(jsonb_build_object('from', from_status, 'to', to_status, 'actor', allowed_actor,
                                                        'requires_note', requires_note) ORDER BY from_status, to_status)
                    FROM public.order_status_transitions)
  )
$$;

CREATE FUNCTION public.validate_coupon(p_code text, p_subtotal bigint, p_email text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM private.evaluate_coupon(p_code, GREATEST(COALESCE(p_subtotal, 0), 0), p_email, false);
  RETURN jsonb_build_object('code', r.code, 'valid', r.is_valid, 'reason', r.reason,
                            'discount_amount', r.discount_amount, 'free_shipping', r.free_shipping);
END $$;

CREATE FUNCTION public.quote_cart(p_items jsonb, p_coupon_code text DEFAULT NULL, p_shipping_method text DEFAULT 'standard', p_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_lines jsonb;
  v_subtotal bigint;
  v_can boolean;
  cpn record;
  v_discount bigint := 0;
  v_free boolean := false;
  v_shipping bigint;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
           'variant_id', pi.variant_id, 'product_id', pi.product_id, 'product_name', pi.product_name,
           'sku', pi.sku, 'size_code', pi.size_code, 'color_name', pi.color_name, 'image_url', pi.image_url,
           'unit_price', pi.unit_price, 'quantity', pi.quantity, 'line_total', pi.unit_price * pi.quantity,
           'available', pi.available, 'in_stock', pi.available >= pi.quantity) ORDER BY pi.variant_id),
         SUM(pi.unit_price * pi.quantity),
         bool_and(pi.available >= pi.quantity)
    INTO v_lines, v_subtotal, v_can
    FROM private.price_items(p_items, false) pi;

  SELECT * INTO cpn FROM private.evaluate_coupon(p_coupon_code, v_subtotal, p_email, false);
  IF cpn.is_valid THEN
    v_discount := cpn.discount_amount;
    v_free := cpn.free_shipping;
  END IF;
  v_shipping := private.shipping_cost(p_shipping_method, v_subtotal - v_discount, v_free);

  RETURN jsonb_build_object(
    'lines', v_lines, 'subtotal', v_subtotal, 'discount_total', v_discount, 'shipping_cost', v_shipping,
    'total', v_subtotal - v_discount + v_shipping, 'currency', 'COP',
    'coupon', CASE WHEN cpn.code IS NULL THEN NULL
                   ELSE jsonb_build_object('code', cpn.code, 'valid', cpn.is_valid, 'reason', cpn.reason) END,
    'can_checkout', v_can);
END $$;

CREATE FUNCTION public.create_order(
  p_customer jsonb,
  p_shipping jsonb,
  p_items jsonb,
  p_coupon_code text DEFAULT NULL,
  p_shipping_method text DEFAULT 'standard',
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_name text := btrim(COALESCE(p_customer ->> 'name', ''));
  v_email text := lower(btrim(COALESCE(p_customer ->> 'email', '')));
  v_phone text := regexp_replace(COALESCE(p_customer ->> 'phone', ''), '[^0-9]', '', 'g');
  v_doc text := NULLIF(btrim(COALESCE(p_customer ->> 'document', '')), '');
  v_dept text := btrim(COALESCE(p_shipping ->> 'department', ''));
  v_city text := btrim(COALESCE(p_shipping ->> 'city', ''));
  v_addr text := btrim(COALESCE(p_shipping ->> 'address', ''));
  v_branch uuid := private.default_branch_id();
  v_existing public.online_orders%ROWTYPE;
  v_subtotal bigint;
  v_discount bigint := 0;
  v_free boolean := false;
  v_shipping bigint;
  v_order public.online_orders%ROWTYPE;
  v_expires timestamptz := now() + private.reservation_ttl();
  cpn record;
  v_coupon_ok boolean := false;
  v_coupon_id uuid;
  v_coupon_code text;
  ln record;
  v_alloc bigint := 0;
  v_line_disc bigint;
  v_line_count int;
  v_i int := 0;
BEGIN
  -- Validaciones de entrada
  IF length(v_key) < 8 OR length(v_key) > 150 THEN
    RAISE EXCEPTION 'Clave de idempotencia inválida' USING ERRCODE = 'P0001', HINT = 'JM_IDEMPOTENCY_KEY';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('jm-order:' || v_key, 0));

  SELECT * INTO v_existing FROM public.online_orders WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number,
      'public_token', v_existing.public_token, 'status', v_existing.status,
      'subtotal', v_existing.subtotal, 'discount_total', v_existing.discount_total,
      'shipping_cost', v_existing.shipping_cost, 'total', v_existing.total,
      'amount_in_cents', v_existing.total * 100, 'currency', 'COP',
      'payment_expires_at', v_existing.payment_expires_at, 'is_duplicate', true);
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 150 THEN
    RAISE EXCEPTION 'Nombre del cliente inválido' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_CUSTOMER';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 150 THEN
    RAISE EXCEPTION 'Correo electrónico inválido' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_EMAIL';
  END IF;
  IF length(v_phone) < 7 OR length(v_phone) > 15 THEN
    RAISE EXCEPTION 'Teléfono inválido' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_PHONE';
  END IF;
  IF length(v_dept) < 2 OR length(v_city) < 2 OR length(v_addr) < 4
     OR length(v_dept) > 100 OR length(v_city) > 100 OR length(v_addr) > 255 THEN
    RAISE EXCEPTION 'Dirección de envío incompleta' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_SHIPPING';
  END IF;
  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'No hay bodega por defecto configurada' USING ERRCODE = 'P0001', HINT = 'JM_CONFIG';
  END IF;

  -- Precios desde BD + bloqueo de inventario (orden determinista)
  IF to_regclass('pg_temp._jm_lines') IS NULL THEN
    CREATE TEMP TABLE _jm_lines (
      variant_id uuid, product_id uuid, quantity int, unit_price bigint, product_name text, sku text,
      size_code text, color_name text, image_url text, inventory_id uuid, available int
    ) ON COMMIT DROP;
  ELSE
    TRUNCATE _jm_lines;
  END IF;
  INSERT INTO _jm_lines SELECT * FROM private.price_items(p_items, true);

  IF EXISTS (SELECT 1 FROM _jm_lines l WHERE l.inventory_id IS NULL OR l.available < l.quantity) THEN
    RAISE EXCEPTION 'Stock insuficiente: %',
      (SELECT string_agg(format('%s (talla %s, %s): disponibles %s, solicitadas %s',
                                l.product_name, l.size_code, l.color_name, GREATEST(COALESCE(l.available, 0), 0), l.quantity), '; ')
         FROM _jm_lines l WHERE l.inventory_id IS NULL OR l.available < l.quantity)
      USING ERRCODE = 'P0001', HINT = 'JM_OUT_OF_STOCK';
  END IF;

  SELECT SUM(l.unit_price * l.quantity), count(*) INTO v_subtotal, v_line_count FROM _jm_lines l;

  -- Cupón (bloqueado)
  IF COALESCE(btrim(p_coupon_code), '') <> '' THEN
    SELECT * INTO cpn FROM private.evaluate_coupon(p_coupon_code, v_subtotal, v_email, true);
    IF NOT cpn.is_valid THEN
      RAISE EXCEPTION 'Cupón no válido (%)', cpn.reason USING ERRCODE = 'P0001', HINT = 'JM_COUPON_' || cpn.reason;
    END IF;
    v_discount := cpn.discount_amount;
    v_free := cpn.free_shipping;
    v_coupon_ok := true;
    v_coupon_id := cpn.coupon_id;
    v_coupon_code := cpn.code;
  END IF;

  v_shipping := private.shipping_cost(p_shipping_method, v_subtotal - v_discount, v_free);

  INSERT INTO public.online_orders (
    idempotency_key, user_id, branch_id, customer_name, customer_email, customer_phone, customer_document,
    shipping_department, shipping_city, shipping_address, shipping_neighborhood, shipping_notes,
    shipping_method_code, subtotal, discount_total, shipping_cost, total, coupon_id, coupon_code,
    status, payment_expires_at)
  VALUES (
    v_key, auth.uid(), v_branch, v_name, v_email, v_phone, v_doc,
    v_dept, v_city, v_addr,
    NULLIF(left(btrim(COALESCE(p_shipping ->> 'neighborhood', '')), 100), ''),
    NULLIF(left(btrim(COALESCE(p_shipping ->> 'notes', '')), 500), ''),
    COALESCE(p_shipping_method, 'standard'), v_subtotal, v_discount, v_shipping,
    v_subtotal - v_discount + v_shipping,
    v_coupon_id, v_coupon_code,
    'payment_pending', v_expires)
  RETURNING * INTO v_order;

  -- Líneas con prorrateo del descuento (la última absorbe el redondeo)
  FOR ln IN SELECT * FROM _jm_lines ORDER BY variant_id LOOP
    v_i := v_i + 1;
    IF v_discount = 0 THEN
      v_line_disc := 0;
    ELSIF v_i = v_line_count THEN
      v_line_disc := v_discount - v_alloc;
    ELSE
      v_line_disc := floor(v_discount::numeric * (ln.unit_price * ln.quantity) / v_subtotal)::bigint;
    END IF;
    v_alloc := v_alloc + v_line_disc;

    INSERT INTO public.online_order_items (order_id, product_id, variant_id, product_name, sku, size_code, color_name,
                                           image_url, unit_price, quantity, line_discount, line_total)
    VALUES (v_order.id, ln.product_id, ln.variant_id, ln.product_name, ln.sku, ln.size_code, ln.color_name,
            ln.image_url, ln.unit_price, ln.quantity, v_line_disc, ln.unit_price * ln.quantity - v_line_disc);

    UPDATE public.inventories SET reserved = reserved + ln.quantity WHERE id = ln.inventory_id;
    INSERT INTO public.inventory_reservations (order_id, inventory_id, variant_id, quantity, expires_at)
    VALUES (v_order.id, ln.inventory_id, ln.variant_id, ln.quantity, v_expires);
  END LOOP;

  IF v_coupon_ok THEN
    INSERT INTO public.coupon_redemptions (coupon_id, order_id, customer_email, discount_amount)
    VALUES (v_coupon_id, v_order.id, v_email, v_discount);
  END IF;

  INSERT INTO public.order_events (order_id, event_type, from_status, to_status, actor, actor_user_id, metadata)
  VALUES (v_order.id, 'ORDER_CREATED', NULL, 'payment_pending',
          'customer', auth.uid(),
          jsonb_build_object('lines', v_line_count, 'coupon', v_order.coupon_code));

  RETURN jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
    'public_token', v_order.public_token, 'status', v_order.status,
    'subtotal', v_order.subtotal, 'discount_total', v_order.discount_total,
    'shipping_cost', v_order.shipping_cost, 'total', v_order.total,
    'amount_in_cents', v_order.total * 100, 'currency', 'COP',
    'payment_expires_at', v_order.payment_expires_at, 'is_duplicate', false);
END $$;

CREATE FUNCTION public.get_order_public(p_order_number text, p_public_token uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE o public.online_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.online_orders
   WHERE order_number = p_order_number AND public_token = p_public_token;
  IF NOT FOUND THEN
    RETURN NULL;   -- no revela si el número existe
  END IF;
  RETURN jsonb_build_object(
    'order_number', o.order_number, 'status', o.status,
    'status_label', (SELECT label FROM public.order_status_catalog WHERE status = o.status),
    'created_at', o.created_at, 'paid_at', o.paid_at, 'shipped_at', o.shipped_at, 'delivered_at', o.delivered_at,
    'payment_expires_at', o.payment_expires_at,
    'customer_name', o.customer_name, 'customer_email', o.customer_email,
    'shipping', jsonb_build_object('department', o.shipping_department, 'city', o.shipping_city,
                                   'address', o.shipping_address, 'neighborhood', o.shipping_neighborhood,
                                   'method', o.shipping_method_code),
    'tracking', jsonb_build_object('carrier', o.carrier, 'tracking_number', o.tracking_number, 'tracking_url', o.tracking_url),
    'subtotal', o.subtotal, 'discount_total', o.discount_total, 'shipping_cost', o.shipping_cost, 'total', o.total,
    'coupon_code', o.coupon_code,
    'items', (SELECT jsonb_agg(jsonb_build_object('product_name', product_name, 'sku', sku, 'size_code', size_code,
                                                  'color_name', color_name, 'image_url', image_url, 'unit_price', unit_price,
                                                  'quantity', quantity, 'line_discount', line_discount, 'line_total', line_total)
                               ORDER BY product_name, size_code)
              FROM public.online_order_items WHERE order_id = o.id),
    'timeline', (SELECT jsonb_agg(jsonb_build_object('to_status', to_status, 'created_at', created_at) ORDER BY created_at)
                 FROM public.order_events WHERE order_id = o.id AND event_type IN ('ORDER_CREATED', 'STATUS_CHANGED')));
END $$;

CREATE FUNCTION public.cancel_my_order(p_order_id uuid, p_public_token uuid DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE o public.online_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.online_orders WHERE id = p_order_id;
  IF NOT FOUND OR NOT ((auth.uid() IS NOT NULL AND o.user_id = auth.uid())
                       OR (p_public_token IS NOT NULL AND o.public_token = p_public_token)) THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0001', HINT = 'JM_ORDER_NOT_FOUND';
  END IF;
  RETURN private.transition_order(o.id, 'cancelled', 'customer', auth.uid(),
                                  COALESCE(NULLIF(btrim(p_reason), ''), 'Cancelado por el cliente'));
END $$;

-- -----------------------------------------------------------------------------
-- 13. RPC PÚBLICAS — PAGOS (solo service_role, invocadas desde Vercel)
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.create_payment_attempt(p_order_id uuid, p_public_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  o public.online_orders%ROWTYPE;
  v_attempt int;
  v_ref text;
BEGIN
  SELECT * INTO o FROM public.online_orders WHERE id = p_order_id AND public_token = p_public_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0001', HINT = 'JM_ORDER_NOT_FOUND';
  END IF;
  IF o.status <> 'payment_pending' THEN
    RAISE EXCEPTION 'El pedido no admite pagos en estado %', o.status USING ERRCODE = 'P0001', HINT = 'JM_ORDER_NOT_PAYABLE';
  END IF;
  IF o.payment_expires_at <= now() THEN
    RAISE EXCEPTION 'El tiempo para pagar este pedido expiró' USING ERRCODE = 'P0001', HINT = 'JM_PAYMENT_WINDOW_EXPIRED';
  END IF;
  SELECT COALESCE(max(attempt_number), 0) + 1 INTO v_attempt FROM public.payment_transactions WHERE order_id = o.id;
  IF v_attempt > 10 THEN
    RAISE EXCEPTION 'Se alcanzó el máximo de intentos de pago' USING ERRCODE = 'P0001', HINT = 'JM_TOO_MANY_ATTEMPTS';
  END IF;
  v_ref := o.order_number || '-' || v_attempt;
  INSERT INTO public.payment_transactions (order_id, attempt_number, reference, amount_in_cents)
  VALUES (o.id, v_attempt, v_ref, o.total * 100);
  INSERT INTO public.order_events (order_id, event_type, actor, metadata)
  VALUES (o.id, 'PAYMENT_ATTEMPT_CREATED', 'system', jsonb_build_object('reference', v_ref, 'attempt', v_attempt));
  RETURN jsonb_build_object('order_number', o.order_number, 'reference', v_ref, 'attempt_number', v_attempt,
                            'amount_in_cents', o.total * 100, 'currency', 'COP',
                            'customer_email', o.customer_email, 'payment_expires_at', o.payment_expires_at);
END $$;

-- Procesa un evento de Wompi YA verificado criptográficamente por la función de servidor.
-- Toda la lógica es transaccional: si algo falla, nada queda aplicado y Wompi reintenta.
CREATE FUNCTION public.apply_payment_event(p_event jsonb, p_event_checksum text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_tx jsonb := p_event -> 'data' -> 'transaction';
  v_event_type text := p_event ->> 'event';
  v_ref text := v_tx ->> 'reference';
  v_ptid text := v_tx ->> 'id';
  v_status text := v_tx ->> 'status';
  v_amount bigint;
  v_currency text := COALESCE(v_tx ->> 'currency', 'COP');
  v_webhook_id uuid;
  a public.payment_transactions%ROWTYPE;
  o public.online_orders%ROWTYPE;
  v_result text := 'applied';
  v_detail text;
  v_order_after public.order_status;
BEGIN
  IF COALESCE(btrim(p_event_checksum), '') = '' THEN
    RAISE EXCEPTION 'Checksum requerido' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_EVENT';
  END IF;

  INSERT INTO public.webhook_events (event_checksum, event_type, provider_transaction_id, reference, payload)
  VALUES (lower(btrim(p_event_checksum)), v_event_type, v_ptid, v_ref, p_event)
  ON CONFLICT (provider, event_checksum) DO NOTHING
  RETURNING id INTO v_webhook_id;

  IF v_webhook_id IS NULL THEN
    RETURN jsonb_build_object('result', 'duplicate', 'reference', v_ref);
  END IF;

  -- Validación del contenido
  IF v_event_type IS DISTINCT FROM 'transaction.updated' THEN
    v_result := 'ignored'; v_detail := 'unsupported_event';
  ELSIF v_tx IS NULL OR v_ref IS NULL OR v_ptid IS NULL
        OR v_status NOT IN ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR')
        OR (v_tx ->> 'amount_in_cents') !~ '^[0-9]+$' THEN
    v_result := 'rejected'; v_detail := 'malformed_transaction';
  ELSE
    v_amount := (v_tx ->> 'amount_in_cents')::bigint;
    SELECT * INTO a FROM public.payment_transactions WHERE reference = v_ref FOR UPDATE;
    IF NOT FOUND THEN
      v_result := 'rejected'; v_detail := 'unknown_reference';
    ELSIF a.provider_transaction_id IS NOT NULL AND a.provider_transaction_id <> v_ptid THEN
      v_result := 'rejected'; v_detail := 'transaction_id_mismatch';
    ELSIF EXISTS (SELECT 1 FROM public.payment_transactions x WHERE x.provider_transaction_id = v_ptid AND x.id <> a.id) THEN
      v_result := 'rejected'; v_detail := 'transaction_id_reused';
    ELSIF v_amount <> a.amount_in_cents OR v_currency <> a.currency THEN
      v_result := 'rejected'; v_detail := 'amount_or_currency_mismatch';
    END IF;
  END IF;

  IF v_result = 'applied' THEN
    SELECT * INTO o FROM public.online_orders WHERE id = a.order_id FOR UPDATE;

    IF a.status = v_status::public.payment_status THEN
      v_result := 'ignored'; v_detail := 'status_unchanged';
    ELSIF a.status IN ('DECLINED', 'ERROR') OR (a.status = 'VOIDED') THEN
      v_result := 'ignored'; v_detail := 'attempt_already_final';
    ELSIF a.status = 'APPROVED' AND v_status <> 'VOIDED' THEN
      v_result := 'ignored'; v_detail := 'attempt_already_approved';
    ELSE
      UPDATE public.payment_transactions
         SET status = v_status::public.payment_status,
             provider_transaction_id = v_ptid,
             payment_method_type = COALESCE(v_tx ->> 'payment_method_type', payment_method_type),
             status_message = v_tx ->> 'status_message',
             last_event_at = now(),
             raw_last_event = p_event,
             requires_refund = CASE
               WHEN v_status = 'APPROVED' AND (
                    o.status NOT IN ('payment_pending', 'expired')
                    OR EXISTS (SELECT 1 FROM public.payment_transactions x
                                WHERE x.order_id = a.order_id AND x.id <> a.id
                                  AND x.status = 'APPROVED' AND NOT x.requires_refund))
               THEN true ELSE false END
       WHERE id = a.id
      RETURNING * INTO a;

      IF v_status = 'APPROVED' THEN
        IF a.requires_refund THEN
          UPDATE public.online_orders SET needs_attention = true WHERE id = o.id;
          INSERT INTO public.order_events (order_id, event_type, actor, metadata)
          VALUES (o.id, 'PAYMENT_REQUIRES_REFUND', 'webhook',
                  jsonb_build_object('reference', v_ref, 'provider_transaction_id', v_ptid, 'order_status', o.status));
          v_detail := 'approved_requires_refund';
        ELSE
          PERFORM private.transition_order(o.id, 'paid', 'webhook', NULL, NULL, NULL,
                                           jsonb_build_object('reference', v_ref, 'provider_transaction_id', v_ptid));
          v_detail := 'order_paid';
        END IF;
      ELSIF v_status = 'VOIDED' AND o.status <> 'payment_pending' AND NOT a.requires_refund
            AND EXISTS (SELECT 1 FROM public.online_orders WHERE id = o.id AND status IN ('paid', 'processing', 'shipped', 'delivered')) THEN
        UPDATE public.online_orders SET needs_attention = true WHERE id = o.id;
        INSERT INTO public.order_events (order_id, event_type, actor, metadata)
        VALUES (o.id, 'PAYMENT_VOIDED_AFTER_PAID', 'webhook', jsonb_build_object('reference', v_ref));
        v_detail := 'voided_after_paid_needs_review';
      ELSIF v_status IN ('DECLINED', 'ERROR', 'VOIDED') THEN
        INSERT INTO public.order_events (order_id, event_type, actor, metadata)
        VALUES (o.id, 'PAYMENT_ATTEMPT_FAILED', 'webhook',
                jsonb_build_object('reference', v_ref, 'status', v_status, 'message', v_tx ->> 'status_message'));
        v_detail := 'attempt_failed_order_unchanged';
      ELSE
        v_detail := 'attempt_pending';
      END IF;
    END IF;
  END IF;

  UPDATE public.webhook_events SET processed_at = now(), result = v_result, detail = v_detail WHERE id = v_webhook_id;
  SELECT status INTO v_order_after FROM public.online_orders WHERE id = a.order_id;
  RETURN jsonb_build_object('result', v_result, 'detail', v_detail, 'reference', v_ref,
                            'order_status', v_order_after, 'attempt_status', a.status);
END $$;

CREATE FUNCTION public.expire_pending_orders() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.online_orders
            WHERE status = 'payment_pending' AND payment_expires_at <= now()
            ORDER BY payment_expires_at
            FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM private.transition_order(r.id, 'expired', 'system', NULL, 'Ventana de pago vencida');
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- -----------------------------------------------------------------------------
-- 14. RPC PÚBLICAS — ADMINISTRACIÓN
-- -----------------------------------------------------------------------------
/*
  admin_upsert_product(p jsonb) — crea o actualiza un producto completo en una transacción.
  {
    "id": uuid?,                    -- si se omite: producto nuevo
    "reference": "JM-TEE-001", "slug": "camiseta-...", "name": "...", "description": "...",
    "details": ["..."], "fit": "OVERSIZE", "fit_description": "...",
    "category": "camisetas", "style_line": "urbana", "occasions": ["casual","streetwear"],
    "base_price": 129900, "compare_at_price": 159900, "base_cost": 45000,
    "is_featured_new": true, "is_bestseller": false,
    "colors": [ { "color": "negro", "is_default": true,
                  "images": [ {"external_url": "https://...", "alt_text": "..."} | {"storage_path": "..."} ] } ],
    "general_images": [ ... ],
    "variants": [ { "id": uuid?, "color": "negro", "size": "M", "sku": "...?", "barcode": "...?",
                    "price_override": 139900?, "initial_stock": 5? } ]
  }
  Reglas: colores no listados se eliminan si no tienen variantes; variantes no listadas se desactivan;
  imágenes se reemplazan; initial_stock solo aplica a variantes sin inventario previo.
  El estado de publicación se cambia con admin_set_product_status().
*/
CREATE FUNCTION public.admin_upsert_product(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid := NULLIF(p ->> 'id', '')::uuid;
  v_is_new boolean;
  v_category public.categories%ROWTYPE;
  v_style uuid;
  v_branch uuid := private.default_branch_id();
  c jsonb;
  img jsonb;
  v jsonb;
  v_color uuid;
  v_size uuid;
  v_size_group public.size_group;
  v_variant uuid;
  v_sku text;
  v_inv uuid;
  v_stock int;
  v_listed_colors uuid[] := '{}';
  v_listed_variants uuid[] := '{}';
  v_pos int;
BEGIN
  PERFORM private.require_admin();

  SELECT * INTO v_category FROM public.categories WHERE slug = p ->> 'category';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoría desconocida: %', p ->> 'category' USING ERRCODE = 'P0001', HINT = 'JM_UNKNOWN_CATEGORY';
  END IF;
  IF p ? 'style_line' AND NULLIF(p ->> 'style_line', '') IS NOT NULL THEN
    SELECT id INTO v_style FROM public.style_lines WHERE slug = p ->> 'style_line';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Línea de estilo desconocida: %', p ->> 'style_line' USING ERRCODE = 'P0001', HINT = 'JM_UNKNOWN_STYLE_LINE';
    END IF;
  END IF;
  IF jsonb_typeof(p -> 'colors') IS DISTINCT FROM 'array' OR jsonb_array_length(p -> 'colors') = 0 THEN
    RAISE EXCEPTION 'El producto debe declarar al menos un color' USING ERRCODE = 'P0001', HINT = 'JM_COLORS_REQUIRED';
  END IF;

  v_is_new := v_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_id);

  IF v_is_new THEN
    INSERT INTO public.products (id, reference, slug, name, description, details, fit, fit_description,
                                 category_id, style_line_id, base_price, compare_at_price, base_cost,
                                 is_featured_new, is_bestseller, brand_id)
    VALUES (COALESCE(v_id, gen_random_uuid()), upper(p ->> 'reference'), lower(p ->> 'slug'), p ->> 'name',
            p ->> 'description',
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p -> 'details', '[]'::jsonb))), '{}'),
            COALESCE(p ->> 'fit', 'REGULAR')::public.product_fit, p ->> 'fit_description',
            v_category.id, v_style, (p ->> 'base_price')::bigint, NULLIF(p ->> 'compare_at_price', '')::bigint,
            NULLIF(p ->> 'base_cost', '')::bigint,
            COALESCE((p ->> 'is_featured_new')::boolean, false), COALESCE((p ->> 'is_bestseller')::boolean, false),
            (SELECT id FROM public.brands ORDER BY created_at LIMIT 1))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.products SET
      reference = upper(p ->> 'reference'), slug = lower(p ->> 'slug'), name = p ->> 'name',
      description = p ->> 'description',
      details = COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p -> 'details', '[]'::jsonb))), '{}'),
      fit = COALESCE(p ->> 'fit', 'REGULAR')::public.product_fit, fit_description = p ->> 'fit_description',
      category_id = v_category.id, style_line_id = v_style,
      base_price = (p ->> 'base_price')::bigint, compare_at_price = NULLIF(p ->> 'compare_at_price', '')::bigint,
      base_cost = NULLIF(p ->> 'base_cost', '')::bigint,
      is_featured_new = COALESCE((p ->> 'is_featured_new')::boolean, false),
      is_bestseller = COALESCE((p ->> 'is_bestseller')::boolean, false)
    WHERE id = v_id;
  END IF;

  -- Ocasiones (reemplazo)
  DELETE FROM public.product_occasions WHERE product_id = v_id;
  INSERT INTO public.product_occasions (product_id, occasion_id)
  SELECT v_id, oc.id FROM public.occasions oc
   WHERE oc.slug IN (SELECT jsonb_array_elements_text(COALESCE(p -> 'occasions', '[]'::jsonb)));
  IF (SELECT count(*) FROM public.product_occasions WHERE product_id = v_id)
     <> jsonb_array_length(COALESCE(p -> 'occasions', '[]'::jsonb)) THEN
    RAISE EXCEPTION 'Ocasión desconocida en %', p -> 'occasions' USING ERRCODE = 'P0001', HINT = 'JM_UNKNOWN_OCCASION';
  END IF;

  -- Colores
  v_pos := 0;
  FOR c IN SELECT * FROM jsonb_array_elements(p -> 'colors') LOOP
    SELECT id INTO v_color FROM public.colors WHERE slug = c ->> 'color';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Color desconocido: %', c ->> 'color' USING ERRCODE = 'P0001', HINT = 'JM_UNKNOWN_COLOR';
    END IF;
    v_listed_colors := v_listed_colors || v_color;
    INSERT INTO public.product_colors (product_id, color_id, position, is_default)
    VALUES (v_id, v_color, v_pos, false)
    ON CONFLICT (product_id, color_id) DO UPDATE SET position = EXCLUDED.position, is_default = false;
    v_pos := v_pos + 1;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.variants WHERE product_id = v_id AND NOT (color_id = ANY (v_listed_colors))) THEN
    RAISE EXCEPTION 'No se puede quitar un color que tiene variantes; desactive las variantes en su lugar'
      USING ERRCODE = 'P0001', HINT = 'JM_COLOR_IN_USE';
  END IF;
  DELETE FROM public.product_colors WHERE product_id = v_id AND NOT (color_id = ANY (v_listed_colors));

  UPDATE public.product_colors pc SET is_default = true
   WHERE pc.product_id = v_id
     AND pc.color_id = COALESCE(
       (SELECT co.id FROM jsonb_array_elements(p -> 'colors') e JOIN public.colors co ON co.slug = e ->> 'color'
         WHERE (e ->> 'is_default')::boolean IS TRUE LIMIT 1),
       v_listed_colors[1]);

  -- Imágenes (reemplazo completo)
  DELETE FROM public.product_images WHERE product_id = v_id;
  FOR c IN SELECT * FROM jsonb_array_elements(p -> 'colors') LOOP
    SELECT id INTO v_color FROM public.colors WHERE slug = c ->> 'color';
    v_pos := 0;
    FOR img IN SELECT * FROM jsonb_array_elements(COALESCE(c -> 'images', '[]'::jsonb)) LOOP
      INSERT INTO public.product_images (product_id, color_id, storage_path, external_url, alt_text, position)
      VALUES (v_id, v_color, img ->> 'storage_path', img ->> 'external_url', img ->> 'alt_text', v_pos);
      v_pos := v_pos + 1;
    END LOOP;
  END LOOP;
  v_pos := 0;
  FOR img IN SELECT * FROM jsonb_array_elements(COALESCE(p -> 'general_images', '[]'::jsonb)) LOOP
    INSERT INTO public.product_images (product_id, color_id, storage_path, external_url, alt_text, position)
    VALUES (v_id, NULL, img ->> 'storage_path', img ->> 'external_url', img ->> 'alt_text', v_pos);
    v_pos := v_pos + 1;
  END LOOP;

  -- Variantes
  FOR v IN SELECT * FROM jsonb_array_elements(COALESCE(p -> 'variants', '[]'::jsonb)) LOOP
    SELECT id INTO v_color FROM public.colors WHERE slug = v ->> 'color';
    IF v_color IS NULL OR NOT (v_color = ANY (v_listed_colors)) THEN
      RAISE EXCEPTION 'La variante usa un color no declarado en el producto: %', v ->> 'color'
        USING ERRCODE = 'P0001', HINT = 'JM_COLOR_NOT_DECLARED';
    END IF;
    v_size_group := COALESCE(NULLIF(v ->> 'size_group', '')::public.size_group, v_category.size_group);
    SELECT id INTO v_size FROM public.sizes WHERE size_group = v_size_group AND code = upper(v ->> 'size');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Talla % no existe en el sistema %', v ->> 'size', v_size_group
        USING ERRCODE = 'P0001', HINT = 'JM_UNKNOWN_SIZE';
    END IF;
    v_sku := upper(COALESCE(NULLIF(v ->> 'sku', ''),
                            upper(p ->> 'reference') || '-' || (v ->> 'color') || '-' || (v ->> 'size')));

    INSERT INTO public.variants (id, product_id, color_id, size_id, sku, barcode, price_override, is_active)
    VALUES (COALESCE(NULLIF(v ->> 'id', '')::uuid, gen_random_uuid()), v_id, v_color, v_size, v_sku,
            NULLIF(v ->> 'barcode', ''), NULLIF(v ->> 'price_override', '')::bigint, true)
    ON CONFLICT (product_id, color_id, size_id) DO UPDATE
      SET sku = EXCLUDED.sku, barcode = EXCLUDED.barcode, price_override = EXCLUDED.price_override, is_active = true
    RETURNING id INTO v_variant;
    v_listed_variants := v_listed_variants || v_variant;

    SELECT id INTO v_inv FROM public.inventories WHERE variant_id = v_variant AND branch_id = v_branch;
    IF NOT FOUND THEN
      v_stock := GREATEST(COALESCE((v ->> 'initial_stock')::int, 0), 0);
      INSERT INTO public.inventories (branch_id, variant_id, stock) VALUES (v_branch, v_variant, v_stock)
      RETURNING id INTO v_inv;
      IF v_stock > 0 THEN
        INSERT INTO public.inventory_movements (inventory_id, variant_id, branch_id, movement_type, quantity_change,
                                                quantity_before, quantity_after, reason, reference_type, reference_id, actor_user_id)
        VALUES (v_inv, v_variant, v_branch, 'initial_load', v_stock, 0, v_stock, 'Carga inicial al crear la variante',
                'product_setup', v_id, auth.uid());
      END IF;
    END IF;
  END LOOP;

  UPDATE public.variants SET is_active = false
   WHERE product_id = v_id AND NOT (id = ANY (v_listed_variants)) AND is_active;

  RETURN jsonb_build_object(
    'product_id', v_id, 'created', v_is_new,
    'variants', (SELECT jsonb_agg(jsonb_build_object('id', vv.id, 'sku', vv.sku, 'color', co.slug, 'size', s.code,
                                                     'is_active', vv.is_active) ORDER BY vv.sku)
                 FROM public.variants vv JOIN public.colors co ON co.id = vv.color_id JOIN public.sizes s ON s.id = vv.size_id
                 WHERE vv.product_id = v_id));
END $$;

CREATE FUNCTION public.admin_set_product_status(p_product_id uuid, p_status public.product_status) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pr public.products%ROWTYPE;
BEGIN
  PERFORM private.require_admin();
  SELECT * INTO pr FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado' USING ERRCODE = 'P0001', HINT = 'JM_PRODUCT_NOT_FOUND';
  END IF;
  IF p_status = 'active' THEN
    IF NOT EXISTS (SELECT 1 FROM public.variants WHERE product_id = p_product_id AND is_active) THEN
      RAISE EXCEPTION 'No se puede publicar un producto sin variantes activas' USING ERRCODE = 'P0001', HINT = 'JM_PUBLISH_NO_VARIANTS';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.product_images WHERE product_id = p_product_id) THEN
      RAISE EXCEPTION 'No se puede publicar un producto sin imágenes' USING ERRCODE = 'P0001', HINT = 'JM_PUBLISH_NO_IMAGES';
    END IF;
  END IF;
  UPDATE public.products
     SET status = p_status,
         published_at = CASE WHEN p_status = 'active' THEN COALESCE(published_at, now()) ELSE published_at END
   WHERE id = p_product_id;
  RETURN jsonb_build_object('product_id', p_product_id, 'status', p_status);
END $$;

CREATE FUNCTION public.admin_adjust_inventory(
  p_variant_id uuid,
  p_quantity_change int,
  p_movement_type public.inventory_movement_type,
  p_reason text,
  p_branch_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_branch uuid := COALESCE(p_branch_id, private.default_branch_id());
  inv public.inventories%ROWTYPE;
BEGIN
  PERFORM private.require_admin();
  IF p_movement_type NOT IN ('restock', 'adjustment', 'damage', 'return') THEN
    RAISE EXCEPTION 'Tipo de movimiento no permitido para ajustes manuales: %', p_movement_type
      USING ERRCODE = 'P0001', HINT = 'JM_INVALID_MOVEMENT';
  END IF;
  IF p_quantity_change IS NULL OR p_quantity_change = 0 THEN
    RAISE EXCEPTION 'La cantidad del ajuste no puede ser cero' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_MOVEMENT';
  END IF;
  IF (p_movement_type IN ('restock', 'return') AND p_quantity_change < 0)
     OR (p_movement_type = 'damage' AND p_quantity_change > 0) THEN
    RAISE EXCEPTION 'El signo de la cantidad no corresponde al tipo de movimiento' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_MOVEMENT';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'El ajuste requiere un motivo' USING ERRCODE = 'P0001', HINT = 'JM_NOTE_REQUIRED';
  END IF;

  SELECT * INTO inv FROM public.inventories WHERE variant_id = p_variant_id AND branch_id = v_branch FOR UPDATE;
  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.variants WHERE id = p_variant_id) THEN
      RAISE EXCEPTION 'Variante no encontrada' USING ERRCODE = 'P0001', HINT = 'JM_VARIANT_NOT_FOUND';
    END IF;
    INSERT INTO public.inventories (branch_id, variant_id, stock) VALUES (v_branch, p_variant_id, 0) RETURNING * INTO inv;
  END IF;
  IF inv.stock + p_quantity_change < inv.reserved THEN
    RAISE EXCEPTION 'El ajuste dejaría el stock (%) por debajo de lo reservado (%)', inv.stock + p_quantity_change, inv.reserved
      USING ERRCODE = 'P0001', HINT = 'JM_BELOW_RESERVED';
  END IF;

  UPDATE public.inventories SET stock = stock + p_quantity_change WHERE id = inv.id;
  INSERT INTO public.inventory_movements (inventory_id, variant_id, branch_id, movement_type, quantity_change,
                                          quantity_before, quantity_after, reason, reference_type, actor_user_id)
  VALUES (inv.id, p_variant_id, v_branch, p_movement_type, p_quantity_change, inv.stock, inv.stock + p_quantity_change,
          btrim(p_reason), 'manual', auth.uid());

  RETURN jsonb_build_object('variant_id', p_variant_id, 'stock_before', inv.stock,
                            'stock_after', inv.stock + p_quantity_change, 'reserved', inv.reserved,
                            'available', inv.stock + p_quantity_change - inv.reserved);
END $$;

CREATE FUNCTION public.admin_transition_order(p_order_id uuid, p_to public.order_status, p_note text DEFAULT NULL,
                                              p_tracking jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  RETURN private.transition_order(p_order_id, p_to, 'admin', auth.uid(), p_note, p_tracking);
END $$;

CREATE FUNCTION public.admin_dashboard_metrics(p_from timestamptz DEFAULT date_trunc('month', now()),
                                               p_to timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sales bigint; v_orders int; v_units int;
BEGIN
  PERFORM private.require_admin();
  SELECT COALESCE(SUM(o.total), 0), count(*) INTO v_sales, v_orders
    FROM public.online_orders o
   WHERE o.paid_at >= p_from AND o.paid_at < p_to AND o.status IN ('paid', 'processing', 'shipped', 'delivered');
  SELECT COALESCE(SUM(oi.quantity), 0) INTO v_units
    FROM public.online_order_items oi JOIN public.online_orders o ON o.id = oi.order_id
   WHERE o.paid_at >= p_from AND o.paid_at < p_to AND o.status IN ('paid', 'processing', 'shipped', 'delivered');

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to,
    'gross_sales', v_sales,
    'paid_orders', v_orders,
    'average_ticket', CASE WHEN v_orders > 0 THEN round(v_sales::numeric / v_orders)::bigint ELSE 0 END,
    'units_sold', v_units,
    'refunds_requested', (SELECT COALESCE(SUM(amount), 0) FROM public.order_refunds
                           WHERE created_at >= p_from AND created_at < p_to),
    'orders_by_status', (SELECT jsonb_object_agg(sc.status::text, COALESCE(x.n, 0)) FROM public.order_status_catalog sc
                           LEFT JOIN (SELECT status, count(*) n FROM public.online_orders
                                       WHERE created_at >= p_from AND created_at < p_to GROUP BY status) x
                             ON x.status = sc.status),
    'needs_attention', (SELECT count(*) FROM public.online_orders WHERE needs_attention),
    'low_stock_variants', (SELECT count(*) FROM public.inventories i JOIN public.variants v ON v.id = i.variant_id
                            WHERE v.is_active AND i.stock - i.reserved <= i.min_stock),
    'top_products', (SELECT COALESCE(jsonb_agg(t ORDER BY t.units DESC, t.product_name), '[]'::jsonb) FROM (
                       SELECT oi.product_id, oi.product_name, SUM(oi.quantity)::int AS units, SUM(oi.line_total) AS revenue
                         FROM public.online_order_items oi JOIN public.online_orders o ON o.id = oi.order_id
                        WHERE o.paid_at >= p_from AND o.paid_at < p_to
                          AND o.status IN ('paid', 'processing', 'shipped', 'delivered')
                        GROUP BY oi.product_id, oi.product_name
                        ORDER BY units DESC, oi.product_name LIMIT 5) t));
END $$;

CREATE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role public.app_role) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old public.app_role;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo un super_admin puede cambiar roles' USING ERRCODE = '42501', HINT = 'JM_FORBIDDEN';
  END IF;
  SELECT role INTO v_old FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0001', HINT = 'JM_USER_NOT_FOUND';
  END IF;
  IF v_old = 'super_admin' AND p_role <> 'super_admin'
     AND (SELECT count(*) FROM public.profiles WHERE role = 'super_admin') <= 1 THEN
    RAISE EXCEPTION 'No se puede retirar el último super_admin' USING ERRCODE = 'P0001', HINT = 'JM_LAST_SUPER_ADMIN';
  END IF;
  PERFORM set_config('jm.allow_role_change', 'on', true);
  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
  PERFORM set_config('jm.allow_role_change', 'off', true);
  RETURN jsonb_build_object('user_id', p_user_id, 'previous_role', v_old, 'role', p_role);
END $$;

-- -----------------------------------------------------------------------------
-- 15. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Catálogo de referencia: lectura pública de activos; escritura admin.
CREATE POLICY categories_read  ON public.categories  FOR SELECT USING (is_active OR public.is_admin());
CREATE POLICY categories_admin ON public.categories  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY style_lines_read  ON public.style_lines FOR SELECT USING (is_active OR public.is_admin());
CREATE POLICY style_lines_admin ON public.style_lines FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY occasions_read  ON public.occasions FOR SELECT USING (is_active OR public.is_admin());
CREATE POLICY occasions_admin ON public.occasions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY brands_read  ON public.brands FOR SELECT USING (true);
CREATE POLICY brands_admin ON public.brands FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY sizes_read  ON public.sizes FOR SELECT USING (true);
CREATE POLICY sizes_admin ON public.sizes FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY colors_read  ON public.colors FOR SELECT USING (true);
CREATE POLICY colors_admin ON public.colors FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY collections_read  ON public.collections FOR SELECT USING (is_active OR public.is_admin());
CREATE POLICY collections_admin ON public.collections FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY collection_products_read  ON public.collection_products FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id)
         AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id));
CREATE POLICY collection_products_admin ON public.collection_products FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY shipping_methods_read  ON public.shipping_methods FOR SELECT USING (is_active OR public.is_admin());
CREATE POLICY shipping_methods_admin ON public.shipping_methods FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY order_status_catalog_read     ON public.order_status_catalog     FOR SELECT USING (true);
CREATE POLICY order_status_transitions_read ON public.order_status_transitions FOR SELECT USING (true);
CREATE POLICY site_content_read  ON public.site_content FOR SELECT USING (true);
CREATE POLICY site_content_admin ON public.site_content FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Productos: públicos solo si están activos.
CREATE POLICY products_read  ON public.products FOR SELECT USING (status = 'active' OR public.is_admin());
CREATE POLICY products_admin ON public.products FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY product_colors_read  ON public.product_colors FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id));
CREATE POLICY product_colors_admin ON public.product_colors FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY product_images_read  ON public.product_images FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id));
CREATE POLICY product_images_admin ON public.product_images FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY product_occasions_read  ON public.product_occasions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id));
CREATE POLICY product_occasions_admin ON public.product_occasions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY variants_read  ON public.variants FOR SELECT
  USING ((is_active AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id)) OR public.is_admin());
CREATE POLICY variants_admin ON public.variants FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Reseñas: públicas las aprobadas; moderación admin.
CREATE POLICY product_reviews_read  ON public.product_reviews FOR SELECT USING (status = 'approved' OR public.is_admin());
CREATE POLICY product_reviews_admin ON public.product_reviews FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Inventario: solo lectura administrativa; escritura exclusivamente por RPC.
CREATE POLICY branches_admin_read     ON public.branches FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY branches_super_write    ON public.branches FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY inventories_admin_read  ON public.inventories FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY inventory_movements_admin_read ON public.inventory_movements FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY inventory_reservations_admin_read ON public.inventory_reservations FOR SELECT TO authenticated USING (public.is_admin());

-- Cupones: administración; los clientes validan con validate_coupon().
CREATE POLICY coupons_admin ON public.coupons FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY coupon_redemptions_admin_read ON public.coupon_redemptions FOR SELECT TO authenticated USING (public.is_admin());

-- Pedidos: el cliente ve los suyos; admin ve todos; nadie escribe directamente.
CREATE POLICY online_orders_read ON public.online_orders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY online_order_items_read ON public.online_order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.online_orders o WHERE o.id = order_id));
CREATE POLICY order_events_read ON public.order_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.online_orders o WHERE o.id = order_id));
CREATE POLICY payment_transactions_read ON public.payment_transactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.online_orders o WHERE o.id = order_id));
CREATE POLICY order_refunds_read ON public.order_refunds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.online_orders o WHERE o.id = order_id));
CREATE POLICY webhook_events_admin_read ON public.webhook_events FOR SELECT TO authenticated USING (public.is_admin());

-- Identidad
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY customer_addresses_own ON public.customer_addresses FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY customer_addresses_admin_read ON public.customer_addresses FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY wishlist_items_own ON public.wishlist_items FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Auditoría
CREATE POLICY audit_logs_super_read ON public.audit_logs FOR SELECT TO authenticated USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 16. PRIVILEGIOS (defensa en profundidad sobre RLS)
-- -----------------------------------------------------------------------------
-- Tablas: nadie trunca; las tablas transaccionales no admiten escritura directa de clientes.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON
  public.inventories, public.inventory_movements, public.inventory_reservations,
  public.online_orders, public.online_order_items, public.order_events,
  public.payment_transactions, public.webhook_events, public.coupon_redemptions,
  public.order_refunds, public.audit_logs, public.order_status_catalog, public.order_status_transitions
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON public.webhook_events, public.audit_logs, public.inventory_movements, public.inventory_reservations,
              public.coupon_redemptions, public.coupons, public.branches, public.inventories,
              public.online_orders, public.online_order_items, public.order_events,
              public.payment_transactions, public.order_refunds, public.profiles,
              public.customer_addresses, public.wishlist_items
  FROM anon;
-- Perfil: el usuario solo edita sus campos no sensibles.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone, avatar_url, preferred_size, preferred_fit, marketing_opt_in) ON public.profiles TO authenticated;
REVOKE ALL ON SEQUENCE public.order_number_seq FROM anon, authenticated;

GRANT SELECT ON public.v_variant_availability, public.v_product_rating TO anon, authenticated;

-- Funciones: cerrar todo y abrir explícitamente.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid), public.is_super_admin(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_status_catalog(),
                          public.validate_coupon(text, bigint, text),
                          public.quote_cart(jsonb, text, text, text),
                          public.create_order(jsonb, jsonb, jsonb, text, text, text),
                          public.get_order_public(text, uuid),
                          public.cancel_my_order(uuid, uuid, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_product(jsonb),
                          public.admin_set_product_status(uuid, public.product_status),
                          public.admin_adjust_inventory(uuid, int, public.inventory_movement_type, text, uuid),
                          public.admin_transition_order(uuid, public.order_status, text, jsonb),
                          public.admin_dashboard_metrics(timestamptz, timestamptz),
                          public.admin_set_user_role(uuid, public.app_role)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_attempt(uuid, uuid),
                          public.apply_payment_event(jsonb, text),
                          public.expire_pending_orders()
  TO service_role;
GRANT USAGE ON SCHEMA private TO service_role;

-- -----------------------------------------------------------------------------
-- 17. STORAGE (imágenes de producto y contenido editorial)
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('site-content',   'site-content',   true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY jm_public_images_read ON storage.objects FOR SELECT
  USING (bucket_id IN ('product-images', 'site-content'));
CREATE POLICY jm_admin_images_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('product-images', 'site-content') AND public.is_admin());
CREATE POLICY jm_admin_images_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('product-images', 'site-content') AND public.is_admin());
CREATE POLICY jm_admin_images_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('product-images', 'site-content') AND public.is_admin());

-- -----------------------------------------------------------------------------
-- 18. DATOS DE REFERENCIA (todos los entornos; UUID v4 fijos y válidos)
-- -----------------------------------------------------------------------------
INSERT INTO public.branches (id, code, name, is_default) VALUES
  ('00000000-0000-4000-8000-000000001001', 'BOD-PRINCIPAL', 'Bodega principal e-commerce', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.brands (id, name) VALUES
  ('00000000-0000-4000-8000-000000001101', 'J&M Fashion Store')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sizes (id, size_group, code, name, sort_order) VALUES
  ('00000000-0000-4000-8000-000000002001', 'alpha', 'XS',  'Extra pequeña', 1),
  ('00000000-0000-4000-8000-000000002002', 'alpha', 'S',   'Pequeña', 2),
  ('00000000-0000-4000-8000-000000002003', 'alpha', 'M',   'Mediana', 3),
  ('00000000-0000-4000-8000-000000002004', 'alpha', 'L',   'Grande', 4),
  ('00000000-0000-4000-8000-000000002005', 'alpha', 'XL',  'Extra grande', 5),
  ('00000000-0000-4000-8000-000000002006', 'alpha', 'XXL', 'Doble extra grande', 6),
  ('00000000-0000-4000-8000-000000002101', 'numeric_pants', '28', 'Talla 28', 1),
  ('00000000-0000-4000-8000-000000002102', 'numeric_pants', '30', 'Talla 30', 2),
  ('00000000-0000-4000-8000-000000002103', 'numeric_pants', '32', 'Talla 32', 3),
  ('00000000-0000-4000-8000-000000002104', 'numeric_pants', '34', 'Talla 34', 4),
  ('00000000-0000-4000-8000-000000002105', 'numeric_pants', '36', 'Talla 36', 5),
  ('00000000-0000-4000-8000-000000002106', 'numeric_pants', '38', 'Talla 38', 6),
  ('00000000-0000-4000-8000-000000002107', 'numeric_pants', '40', 'Talla 40', 7),
  ('00000000-0000-4000-8000-000000002201', 'footwear', '37', 'Talla 37', 1),
  ('00000000-0000-4000-8000-000000002202', 'footwear', '38', 'Talla 38', 2),
  ('00000000-0000-4000-8000-000000002203', 'footwear', '39', 'Talla 39', 3),
  ('00000000-0000-4000-8000-000000002204', 'footwear', '40', 'Talla 40', 4),
  ('00000000-0000-4000-8000-000000002205', 'footwear', '41', 'Talla 41', 5),
  ('00000000-0000-4000-8000-000000002206', 'footwear', '42', 'Talla 42', 6),
  ('00000000-0000-4000-8000-000000002207', 'footwear', '43', 'Talla 43', 7),
  ('00000000-0000-4000-8000-000000002208', 'footwear', '44', 'Talla 44', 8),
  ('00000000-0000-4000-8000-000000002301', 'one_size', 'UNICA', 'Talla única', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.colors (id, slug, name, hex_code, sort_order) VALUES
  ('00000000-0000-4000-8000-000000003001', 'negro',       'Negro',        '#0A0A0A', 1),
  ('00000000-0000-4000-8000-000000003002', 'blanco',      'Blanco',       '#FFFFFF', 2),
  ('00000000-0000-4000-8000-000000003003', 'blanco-crudo','Blanco crudo', '#F9F6EE', 3),
  ('00000000-0000-4000-8000-000000003004', 'gris',        'Gris',         '#808080', 4),
  ('00000000-0000-4000-8000-000000003005', 'gris-oxford', 'Gris oxford',  '#353839', 5),
  ('00000000-0000-4000-8000-000000003006', 'beige',       'Beige',        '#E2D3C4', 6),
  ('00000000-0000-4000-8000-000000003007', 'azul-navy',   'Azul navy',    '#1B2A4A', 7),
  ('00000000-0000-4000-8000-000000003008', 'azul-indigo', 'Azul índigo',  '#2E3A87', 8),
  ('00000000-0000-4000-8000-000000003009', 'verde-oliva', 'Verde oliva',  '#556B2F', 9),
  ('00000000-0000-4000-8000-000000003010', 'cafe',        'Café',         '#5C4033', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories (id, slug, name, size_group, sort_order) VALUES
  ('00000000-0000-4000-8000-000000004001', 'camisetas',  'Camisetas',  'alpha', 1),
  ('00000000-0000-4000-8000-000000004002', 'camisas',    'Camisas',    'alpha', 2),
  ('00000000-0000-4000-8000-000000004003', 'polos',      'Polos',      'alpha', 3),
  ('00000000-0000-4000-8000-000000004004', 'jeans',      'Jeans',      'numeric_pants', 4),
  ('00000000-0000-4000-8000-000000004005', 'pantalones', 'Pantalones', 'numeric_pants', 5),
  ('00000000-0000-4000-8000-000000004006', 'bermudas',   'Bermudas',   'numeric_pants', 6),
  ('00000000-0000-4000-8000-000000004007', 'chaquetas',  'Chaquetas',  'alpha', 7),
  ('00000000-0000-4000-8000-000000004008', 'calzado',    'Calzado',    'footwear', 8),
  ('00000000-0000-4000-8000-000000004009', 'accesorios', 'Accesorios', 'one_size', 9)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.style_lines (id, slug, name, tagline, description, badge, sort_order) VALUES
  ('00000000-0000-4000-8000-000000005001', 'urbana',   'Urbana',       'Actitud, comodidad y carácter.',
   'Denim, oversize y esenciales para un estilo urbano contemporáneo.', 'ESTILO URBANO', 1),
  ('00000000-0000-4000-8000-000000005002', 'elegante', 'Elegante',     'Presencia para cada ocasión.',
   'Prendas refinadas para un estilo elegante y sofisticado.', 'OFICINA & FORMAL', 2),
  ('00000000-0000-4000-8000-000000005003', 'casual',   'Smart Casual', 'Equilibrio entre estilo y comodidad.',
   'Looks versátiles que combinan elegancia y frescura.', 'CASUAL ELEGANTE', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.occasions (id, slug, name, subtitle, sort_order) VALUES
  ('00000000-0000-4000-8000-000000006001', 'trabajo',       'Trabajo & oficina', 'Presencia sin perder comodidad.', 1),
  ('00000000-0000-4000-8000-000000006002', 'cita',          'Cita & salidas',    'Tu mejor versión empieza aquí.', 2),
  ('00000000-0000-4000-8000-000000006003', 'casual',        'Casual urbano',     'Estilo para todos los días.', 3),
  ('00000000-0000-4000-8000-000000006004', 'fiesta',        'Noche & eventos',   'Destaca cuando importa.', 4),
  ('00000000-0000-4000-8000-000000006005', 'fin-de-semana', 'Fin de semana',     'Comodidad con actitud.', 5),
  ('00000000-0000-4000-8000-000000006006', 'streetwear',    'Streetwear',        'Actitud que se lleva puesta.', 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.shipping_methods (code, name, cost, free_over_subtotal, eta_text, is_active, sort_order) VALUES
  ('standard', 'Envío estándar nacional', 15000, 200000, '2 a 5 días hábiles', true, 1),
  ('express',  'Envío express',           0,     NULL,   'Tarifa por definir', false, 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.order_status_catalog (status, label, description, is_terminal, sort_order) VALUES
  ('payment_pending', 'Pago pendiente',     'Pedido creado; esperando confirmación del pago.', false, 1),
  ('paid',            'Pago confirmado',    'Pago aprobado por la pasarela.', false, 2),
  ('processing',      'En preparación',     'Pedido en alistamiento en bodega.', false, 3),
  ('shipped',         'Enviado',            'Entregado a la transportadora.', false, 4),
  ('delivered',       'Entregado',          'Recibido por el cliente.', false, 5),
  ('cancelled',       'Cancelado',          'Pedido cancelado.', true, 6),
  ('expired',         'Pago no completado', 'La ventana de pago de 30 minutos venció.', true, 7),
  ('refunded',        'Reembolsado',        'Pago devuelto al cliente.', true, 8)
ON CONFLICT (status) DO NOTHING;

INSERT INTO public.order_status_transitions (from_status, to_status, allowed_actor, requires_note) VALUES
  ('payment_pending', 'paid',       'webhook',  false),
  ('payment_pending', 'expired',    'system',   false),
  ('payment_pending', 'cancelled',  'customer', false),
  ('payment_pending', 'cancelled',  'admin',    true),
  ('paid',            'processing', 'admin',    false),
  ('paid',            'cancelled',  'admin',    true),
  ('paid',            'refunded',   'admin',    true),
  ('processing',      'shipped',    'admin',    false),
  ('processing',      'cancelled',  'admin',    true),
  ('processing',      'refunded',   'admin',    true),
  ('shipped',         'delivered',  'admin',    false),
  ('delivered',       'refunded',   'admin',    true),
  ('expired',         'paid',       'webhook',  false)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 19. EXPIRACIÓN PROGRAMADA (pg_cron, si está disponible)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
      PERFORM cron.schedule('jm-expire-pending-orders', '*/5 * * * *', 'SELECT public.expire_pending_orders()');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'pg_cron no disponible (%); programe expire_pending_orders() externamente', SQLERRM;
    END;
  ELSE
    RAISE WARNING 'pg_cron no instalado; programe expire_pending_orders() externamente';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 20. AUTOVERIFICACIÓN DE LA LÍNEA BASE
-- -----------------------------------------------------------------------------
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(tablename, ', ') INTO v FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Tablas sin RLS: %', v; END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'private') AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Funciones SECURITY DEFINER sin search_path: %', v; END IF;

  SELECT string_agg(e.enumlabel, ', ') INTO v
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'order_status'
     AND e.enumlabel NOT IN (SELECT status::text FROM public.order_status_catalog);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Estados sin catálogo: %', v; END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'private' AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Funciones privadas ejecutables por anon: %', v; END IF;

  IF (SELECT count(*) FROM public.branches WHERE is_default) <> 1 THEN
    RAISE EXCEPTION 'Debe existir exactamente una bodega por defecto';
  END IF;
END $$;
