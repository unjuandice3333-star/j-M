-- DB Migration: E-commerce Architecture Expansion for J&M Fashion Store
-- File: 20260927000000_ecommerce_expansion.sql

-- 1. E-COMMERCE ORDERS & PAYMENTS (ONLINE STOREFRONT)
CREATE TYPE online_order_status AS ENUM (
  'pending',
  'payment_pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded'
);

CREATE TYPE online_payment_status AS ENUM (
  'PENDING',
  'APPROVED',
  'DECLINED',
  'VOIDED',
  'ERROR'
);

-- Storefront Online Orders
CREATE TABLE IF NOT EXISTS online_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(50) NOT NULL UNIQUE,
  customer_name VARCHAR(150) NOT NULL,
  customer_email VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  shipping_department VARCHAR(100) NOT NULL,
  shipping_city VARCHAR(100) NOT NULL,
  shipping_address VARCHAR(255) NOT NULL,
  shipping_neighborhood VARCHAR(100),
  shipping_notes TEXT,
  shipping_method VARCHAR(100) NOT NULL DEFAULT 'Envío Estándar Nacional',
  shipping_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
  coupon_code VARCHAR(50),
  status online_order_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Storefront Order Items
CREATE TABLE IF NOT EXISTS online_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES online_orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
  variant_id UUID REFERENCES variants(id) ON DELETE RESTRICT,
  product_name VARCHAR(200) NOT NULL,
  size VARCHAR(20) NOT NULL,
  color VARCHAR(50) NOT NULL,
  sku VARCHAR(100),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INT NOT NULL CHECK (quantity > 0),
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0)
);

-- Coupons Master Table
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed', 'free_shipping')),
  discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value >= 0),
  min_purchase_amount NUMERIC(12, 2) DEFAULT 0,
  max_uses INT DEFAULT NULL,
  used_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Wompi & Online Payment Transactions Log
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES online_orders(id) ON DELETE CASCADE NOT NULL,
  transaction_reference VARCHAR(150) NOT NULL UNIQUE,
  wompi_transaction_id VARCHAR(150),
  provider VARCHAR(50) NOT NULL DEFAULT 'Wompi',
  amount_in_cents BIGINT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'COP',
  payment_method_type VARCHAR(50) NOT NULL,
  status online_payment_status NOT NULL DEFAULT 'PENDING',
  checksum_signature VARCHAR(255),
  raw_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Product Reviews Table
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(150) NOT NULL,
  comment TEXT NOT NULL,
  is_verified_buyer BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Security Configuration for E-commerce Tables
ALTER TABLE online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;

-- Public read policies for active coupons & approved product reviews
CREATE POLICY coupon_public_read ON coupons FOR SELECT USING (is_active = TRUE);
CREATE POLICY review_public_read ON product_reviews FOR SELECT USING (status = 'approved');

-- Allow customers to insert orders & order items publicly
CREATE POLICY order_public_insert ON online_orders FOR INSERT WITH CHECK (TRUE);
CREATE POLICY order_item_public_insert ON online_order_items FOR INSERT WITH CHECK (TRUE);
CREATE POLICY order_public_read ON online_orders FOR SELECT USING (TRUE);

-- Indexes for Fast Querying
CREATE INDEX IF NOT EXISTS idx_online_orders_number ON online_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_ref ON payment_transactions(transaction_reference);
