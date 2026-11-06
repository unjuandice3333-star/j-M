-- DB Migrations: J&M Fashion Retail ERP/POS
-- Version: 20260508000000_init_schema.sql

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CUSTOM TYPES & ENUMS
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'supervisor', 'cashier', 'warehouse');
CREATE TYPE gender_type AS ENUM ('Masculino', 'Femenino', 'Unisex', 'Infantil');
CREATE TYPE shift_status AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE payment_method_type AS ENUM ('Efectivo', 'Tarjeta', 'Transferencia', 'Puntos', 'Mixto');
CREATE TYPE sale_status_type AS ENUM ('COMPLETED', 'REFUNDED', 'VOID');
CREATE TYPE transfer_status_type AS ENUM ('PENDING', 'SHIPPED', 'RECEIVED', 'CANCELLED');

-- 2. CORE MASTER TABLES

-- Branches
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE -- Soft Delete Support
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE, -- Linked to auth.users in Supabase
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'cashier',
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE -- Soft Delete Support
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Brands
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Collections
CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seasons
CREATE TABLE IF NOT EXISTS seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Sizes
CREATE TABLE IF NOT EXISTS sizes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(10) NOT NULL UNIQUE, -- S, M, L, XL, 32, 34
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Colors
CREATE TABLE IF NOT EXISTS colors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE, -- Negro, Blanco, Beige
    hex_code VARCHAR(10) NOT NULL, -- #000000
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. PRODUCT & INVENTORY TABLES

-- Products (Prendas Base)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) NOT NULL UNIQUE, -- REF de fábrica única
    name VARCHAR(150) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES categories(id) ON DELETE RESTRICT NOT NULL,
    brand_id UUID REFERENCES brands(id) ON DELETE RESTRICT NOT NULL,
    collection_id UUID REFERENCES collections(id) ON DELETE SET NULL,
    season_id UUID REFERENCES seasons(id) ON DELETE SET NULL,
    gender gender_type NOT NULL DEFAULT 'Unisex',
    base_price NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
    base_cost NUMERIC(12, 2) NOT NULL CHECK (base_cost >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE -- Soft Delete Support
);

-- Variants (Matriz Talla/Color)
CREATE TABLE IF NOT EXISTS variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    sku VARCHAR(100) NOT NULL UNIQUE, -- REF-TALLA-COLOR
    barcode VARCHAR(100) NOT NULL UNIQUE,
    size_id UUID REFERENCES sizes(id) ON DELETE RESTRICT NOT NULL,
    color_id UUID REFERENCES colors(id) ON DELETE RESTRICT NOT NULL,
    price_override NUMERIC(12, 2) CHECK (price_override >= 0),
    cost_override NUMERIC(12, 2) CHECK (cost_override >= 0),
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE -- Soft Delete Support
);

-- Inventories (Stock por Sucursal)
CREATE TABLE IF NOT EXISTS inventories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    variant_id UUID REFERENCES variants(id) ON DELETE CASCADE NOT NULL,
    stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    min_stock INT NOT NULL DEFAULT 5 CHECK (min_stock >= 0),
    location_shelf VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (branch_id, variant_id)
);

-- 4. SALES & CASHIER TABLES

-- Customers (Fidelización)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    document_id VARCHAR(50) NOT NULL UNIQUE, -- Cédula/NIT
    email VARCHAR(150),
    phone VARCHAR(50),
    points INT NOT NULL DEFAULT 0 CHECK (points >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE -- Soft Delete Support
);

-- Shifts (Turnos de Caja / Arqueo)
CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT NOT NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE RESTRICT NOT NULL,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    initial_cash NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (initial_cash >= 0),
    expected_cash NUMERIC(12, 2) DEFAULT 0,
    actual_cash NUMERIC(12, 2) DEFAULT 0,
    difference NUMERIC(12, 2) DEFAULT 0,
    status shift_status NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Sales (Facturas de Ventas)
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT NOT NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE RESTRICT NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    shift_id UUID REFERENCES shifts(id) ON DELETE RESTRICT NOT NULL,
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    tax NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
    total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    payment_method payment_method_type NOT NULL DEFAULT 'Efectivo',
    points_earned INT NOT NULL DEFAULT 0,
    points_redeemed INT NOT NULL DEFAULT 0,
    status sale_status_type NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Sale Items (Líneas de Factura)
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
    variant_id UUID REFERENCES variants(id) ON DELETE RESTRICT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    total NUMERIC(12, 2) NOT NULL CHECK (total >= 0)
);

-- 5. LOGISTICS & AUDITING

-- Transfers (Traslados)
CREATE TABLE IF NOT EXISTS transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT NOT NULL,
    target_branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT NOT NULL,
    status transfer_status_type NOT NULL DEFAULT 'PENDING',
    employee_id UUID REFERENCES employees(id) ON DELETE RESTRICT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Transfer Items (Líneas de Traslado)
CREATE TABLE IF NOT EXISTS transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID REFERENCES transfers(id) ON DELETE CASCADE NOT NULL,
    variant_id UUID REFERENCES variants(id) ON DELETE RESTRICT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0)
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. AUTOMATED TIMESTAMP TRIGGER HELPERS
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply Timestamp Triggers
CREATE TRIGGER update_branches_modtime BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_employees_modtime BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_categories_modtime BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_products_modtime BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_variants_modtime BEFORE UPDATE ON variants FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_customers_modtime BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_transfers_modtime BEFORE UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION update_modified_column();


-- 7. AUTOMATED INVENTORY DEDUCTION TRIGGER
CREATE OR REPLACE FUNCTION deduct_inventory_on_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_branch_id UUID;
BEGIN
    -- Obtenemos el branch_id de la factura padre
    SELECT branch_id INTO v_branch_id FROM sales WHERE id = NEW.sale_id;
    
    -- Restamos stock de inventories
    UPDATE inventories
    SET stock = stock - NEW.quantity
    WHERE branch_id = v_branch_id AND variant_id = NEW.variant_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sale_deduct_inventory
AFTER INSERT ON sale_items
FOR EACH ROW
EXECUTE FUNCTION deduct_inventory_on_sale();


-- 8. ENTERPRISE AUDIT LOGGING TRIGGER
CREATE OR REPLACE FUNCTION process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Capturamos opcionalmente el usuario de auth de Supabase
    v_user_id := auth.uid();
    
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs(user_id, action, table_name, record_id, old_data, new_data)
        VALUES(v_user_id, TG_OP, TG_TABLE_NAME, OLD.id, row_to_json(OLD)::jsonb, NULL);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs(user_id, action, table_name, record_id, old_data, new_data)
        VALUES(v_user_id, TG_OP, TG_TABLE_NAME, NEW.id, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs(user_id, action, table_name, record_id, old_data, new_data)
        VALUES(v_user_id, TG_OP, TG_TABLE_NAME, NEW.id, NULL, row_to_json(NEW)::jsonb);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply Audit to Core Tables
CREATE TRIGGER audit_products_trigger AFTER INSERT OR UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION process_audit_log();
CREATE TRIGGER audit_variants_trigger AFTER INSERT OR UPDATE OR DELETE ON variants FOR EACH ROW EXECUTE FUNCTION process_audit_log();
CREATE TRIGGER audit_inventories_trigger AFTER INSERT OR UPDATE OR DELETE ON inventories FOR EACH ROW EXECUTE FUNCTION process_audit_log();
CREATE TRIGGER audit_sales_trigger AFTER INSERT OR UPDATE OR DELETE ON sales FOR EACH ROW EXECUTE FUNCTION process_audit_log();


-- 9. SEED DATA FOR STANDARD FASHION MATRIX
INSERT INTO sizes (id, name, code, sort_order) VALUES
(gen_random_uuid(), 'Small', 'S', 1),
(gen_random_uuid(), 'Medium', 'M', 2),
(gen_random_uuid(), 'Large', 'L', 3),
(gen_random_uuid(), 'Extra Large', 'XL', 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO colors (id, name, hex_code) VALUES
(gen_random_uuid(), 'Negro Premium', '#000000'),
(gen_random_uuid(), 'Blanco Crudo', '#F9F6EE'),
(gen_random_uuid(), 'Gris Oxford', '#353839'),
(gen_random_uuid(), 'Beige Lino', '#E2D3C4')
ON CONFLICT (name) DO NOTHING;

INSERT INTO branches (id, name, address, phone) VALUES
('b1000000-0000-0000-0000-000000000001', 'J&M Boutique - Sede Única', 'Calle 82 # 11-37, Zona T, Bogotá', '6017441234')
ON CONFLICT (id) DO NOTHING;

-- Base categories
INSERT INTO categories (id, name) VALUES
('c1000000-0000-0000-0000-000000000001', 'Superior (Camisas, Camisetas, Chaquetas)'),
('c2000000-0000-0000-0000-000000000002', 'Inferior (Pantalones, Bermudas, Jeans)')
ON CONFLICT (name) DO NOTHING;

-- Base brand
INSERT INTO brands (id, name) VALUES
('a1000000-0000-0000-0000-000000000001', 'J&M Colección Local')
ON CONFLICT (name) DO NOTHING;
