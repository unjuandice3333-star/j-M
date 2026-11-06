-- DB Migrations: J&M Fashion Retail ERP/POS
-- Version: 20260508010000_security_hardening.sql
-- Description: Security Hardening, RLS, Atomic transactions, Upgraded Triggers, Audit, Materialized Views.

-- ============================================================================
-- 1. CENTRAL ROLES AND PERMISSIONS SYSTEM
-- ============================================================================

-- Table to store fine-grained permissions
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role user_role NOT NULL,
    permission VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (role, permission)
);

-- Seed fine-grained permissions for non-admin roles (admins bypass via helper checks)
INSERT INTO role_permissions (role, permission) VALUES
('supervisor', 'products:read'),
('supervisor', 'pos:sale'),
('supervisor', 'shifts:open'),
('supervisor', 'shifts:close'),
('supervisor', 'inventories:read'),
('supervisor', 'customers:read'),
('supervisor', 'customers:write'),
('cashier', 'pos:sale'),
('cashier', 'shifts:open'),
('cashier', 'shifts:close'),
('cashier', 'customers:read'),
('cashier', 'customers:write'),
('warehouse', 'products:read'),
('warehouse', 'inventories:read'),
('warehouse', 'inventories:write'),
('warehouse', 'transfers:read'),
('warehouse', 'transfers:write')
ON CONFLICT (role, permission) DO NOTHING;

-- ============================================================================
-- 2. CORE HELPER FUNCTIONS FOR SECURITY & ROLES
-- ============================================================================

-- Helper: Retrieve current employee's branch ID
CREATE OR REPLACE FUNCTION current_employee_branch()
RETURNS UUID AS $$
DECLARE
    v_branch_id UUID;
BEGIN
    SELECT branch_id INTO v_branch_id
    FROM employees
    WHERE user_id = auth.uid() AND is_active = TRUE AND deleted_at IS NULL;
    RETURN v_branch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: Retrieve current employee's role
CREATE OR REPLACE FUNCTION current_employee_role()
RETURNS user_role AS $$
DECLARE
    v_role user_role;
BEGIN
    SELECT role INTO v_role
    FROM employees
    WHERE user_id = auth.uid() AND is_active = TRUE AND deleted_at IS NULL;
    RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: Check if active user has a specific permission
CREATE OR REPLACE FUNCTION has_permission(p_permission VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    v_role user_role;
    v_has BOOLEAN;
BEGIN
    v_role := current_employee_role();
    
    -- Super admins and Admins bypass all restriction checks
    IF v_role = 'super_admin' OR v_role = 'admin' THEN
        RETURN TRUE;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM role_permissions
        WHERE role = v_role AND permission = p_permission
    ) INTO v_has;
    
    RETURN v_has;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. SOFT DELETE PROPERTIES HARDENING
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ============================================================================
-- 4. CRITICAL LOGIC TRIGGERS & VALIDATIONS
-- ============================================================================

-- A. Validate Shift Double Opening
CREATE OR REPLACE FUNCTION validate_shift_opening()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM shifts
        WHERE employee_id = NEW.employee_id AND status = 'OPEN'
    ) THEN
        RAISE EXCEPTION 'Ya existe un turno de caja abierto para este cajero en la sucursal.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_double_shift ON shifts;
CREATE TRIGGER check_double_shift
BEFORE INSERT ON shifts
FOR EACH ROW
EXECUTE FUNCTION validate_shift_opening();

-- B. Validate Shift Double Closing
CREATE OR REPLACE FUNCTION validate_shift_closing()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'CLOSED' AND NEW.status = 'CLOSED' THEN
        RAISE EXCEPTION 'Este turno de caja ya se encuentra cerrado.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_double_close ON shifts;
CREATE TRIGGER check_double_close
BEFORE UPDATE ON shifts
FOR EACH ROW
EXECUTE FUNCTION validate_shift_closing();

-- C. Validate Sales can only be made on Active Open Shifts
CREATE OR REPLACE FUNCTION validate_sale_shift_active()
RETURNS TRIGGER AS $$
DECLARE
    v_shift_status shift_status;
BEGIN
    SELECT status INTO v_shift_status FROM shifts WHERE id = NEW.shift_id;
    IF v_shift_status IS NULL OR v_shift_status = 'CLOSED' THEN
        RAISE EXCEPTION 'No se pueden procesar transacciones sin un turno de caja abierto y activo.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_sale_shift_active ON sales;
CREATE TRIGGER check_sale_shift_active
BEFORE INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION validate_sale_shift_active();

-- D. Upgraded Transactional Stock Reduction & Validation Trigger
CREATE OR REPLACE FUNCTION deduct_inventory_on_sale_secured()
RETURNS TRIGGER AS $$
DECLARE
    v_branch_id UUID;
    v_current_stock INT;
    v_min_stock INT;
    v_prod_ref VARCHAR;
BEGIN
    -- Resolve parent branch
    SELECT branch_id INTO v_branch_id FROM sales WHERE id = NEW.sale_id;

    -- Concurrency: Acquire ROW lock using FOR UPDATE to prevent race conditions and double selling
    SELECT stock, min_stock INTO v_current_stock, v_min_stock
    FROM inventories
    WHERE branch_id = v_branch_id AND variant_id = NEW.variant_id
    FOR UPDATE;

    -- Resolve reference for warning messages
    SELECT p.reference INTO v_prod_ref 
    FROM variants v 
    JOIN products p ON v.product_id = p.id 
    WHERE v.id = NEW.variant_id;

    -- Validate stock sufficiency
    IF v_current_stock IS NULL OR v_current_stock < NEW.quantity THEN
        RAISE EXCEPTION 'Error de Inventario: Stock insuficiente para referencia %. Disponibles: %, Solicitados: %', 
            v_prod_ref, COALESCE(v_current_stock, 0), NEW.quantity;
    END IF;

    -- Deduct stock
    UPDATE inventories
    SET stock = stock - NEW.quantity
    WHERE branch_id = v_branch_id AND variant_id = NEW.variant_id;

    -- Trigger notices or logs if stock drops below threshold
    IF (v_current_stock - NEW.quantity) <= v_min_stock THEN
        RAISE WARNING 'Alerta de reabastecimiento: La referencia % está por debajo del stock mínimo (% uds).', 
            v_prod_ref, v_min_stock;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace old simple trigger with our secured transactional trigger
DROP TRIGGER IF EXISTS sale_deduct_inventory ON sale_items;
CREATE TRIGGER sale_deduct_inventory
AFTER INSERT ON sale_items
FOR EACH ROW
EXECUTE FUNCTION deduct_inventory_on_sale_secured();

-- ============================================================================
-- 5. ATOMIC SALES TRANSACTION PROCEDURE (STORED RPC)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_sale_atomic(
    p_branch_id UUID,
    p_employee_id UUID,
    p_customer_id UUID,
    p_shift_id UUID,
    p_invoice_number VARCHAR,
    p_subtotal NUMERIC,
    p_discount NUMERIC,
    p_tax NUMERIC,
    p_total NUMERIC,
    p_payment_method payment_method_type,
    p_items JSONB
)
RETURNS UUID AS $$
DECLARE
    v_sale_id UUID;
    v_item JSONB;
    v_variant_id UUID;
    v_quantity INT;
    v_unit_price NUMERIC;
    v_item_discount NUMERIC;
    v_item_total NUMERIC;
BEGIN
    -- 1. Validate Shift availability
    IF NOT EXISTS (SELECT 1 FROM shifts WHERE id = p_shift_id AND status = 'OPEN') THEN
        RAISE EXCEPTION 'Operación denegada: El turno de caja indicado no está abierto.';
    END IF;

    -- 2. Insert invoice master header
    INSERT INTO sales (branch_id, employee_id, customer_id, shift_id, invoice_number, subtotal, discount, tax, total, payment_method)
    VALUES (p_branch_id, p_employee_id, p_customer_id, p_shift_id, p_invoice_number, p_subtotal, p_discount, p_tax, p_total, p_payment_method)
    RETURNING id INTO v_sale_id;

    -- 3. Loop items array, lock individual inventory rows and insert line items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;
        v_unit_price := (v_item->>'unit_price')::NUMERIC;
        v_item_discount := COALESCE((v_item->>'discount')::NUMERIC, 0.00);
        v_item_total := (v_item->>'total')::NUMERIC;

        -- Safe insertion (Upgraded trigger 'sale_deduct_inventory' executes and performs SELECT FOR UPDATE locks)
        INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, discount, total)
        VALUES (v_sale_id, v_variant_id, v_quantity, v_unit_price, v_item_discount, v_item_total);
    END LOOP;

    RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. ENTERPRISE AUDIT SYSTEM
-- ============================================================================

-- Add advanced tracking columns to audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changed_by UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS branch_id UUID;

CREATE OR REPLACE FUNCTION process_audit_log_hardened()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_branch_id UUID;
    v_old JSONB := NULL;
    v_new JSONB := NULL;
BEGIN
    v_user_id := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID);
    
    -- Resolve active branch
    SELECT branch_id INTO v_branch_id FROM employees WHERE user_id = v_user_id;

    IF (TG_OP = 'DELETE') THEN
        v_old := row_to_json(OLD)::jsonb;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_old := row_to_json(OLD)::jsonb;
        v_new := row_to_json(NEW)::jsonb;
    ELSIF (TG_OP = 'INSERT') THEN
        v_new := row_to_json(NEW)::jsonb;
    END IF;

    INSERT INTO audit_logs (
        user_id, 
        changed_by,
        action, 
        table_name, 
        record_id, 
        old_data, 
        new_data, 
        branch_id,
        user_agent
    )
    VALUES (
        v_user_id,
        v_user_id,
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        v_old,
        v_new,
        v_branch_id,
        NULL -- Resolved via API headers in production PostgREST integrations
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-assign improved logging trigger to tables
DROP TRIGGER IF EXISTS audit_products_trigger ON products;
CREATE TRIGGER audit_products_trigger AFTER INSERT OR UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION process_audit_log_hardened();

DROP TRIGGER IF EXISTS audit_variants_trigger ON variants;
CREATE TRIGGER audit_variants_trigger AFTER INSERT OR UPDATE OR DELETE ON variants FOR EACH ROW EXECUTE FUNCTION process_audit_log_hardened();

DROP TRIGGER IF EXISTS audit_inventories_trigger ON inventories;
CREATE TRIGGER audit_inventories_trigger AFTER INSERT OR UPDATE OR DELETE ON inventories FOR EACH ROW EXECUTE FUNCTION process_audit_log_hardened();

DROP TRIGGER IF EXISTS audit_sales_trigger ON sales;
CREATE TRIGGER audit_sales_trigger AFTER INSERT OR UPDATE OR DELETE ON sales FOR EACH ROW EXECUTE FUNCTION process_audit_log_hardened();

-- ============================================================================
-- 7. ROW-LEVEL SECURITY (RLS) POLICIES BY ROLE
-- ============================================================================

-- Enable RLS across all master and transactional tables
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- A. Policies for Branches
CREATE POLICY branch_select_policy ON branches FOR SELECT TO authenticated
    USING (id = current_employee_branch() OR current_employee_role() IN ('super_admin', 'admin'));

-- B. Policies for Employees
CREATE POLICY employee_all_policy ON employees FOR ALL TO authenticated
    USING (current_employee_role() IN ('super_admin', 'admin') OR id = auth.uid());

-- C. Policies for Products & Variants (Readable by everyone authenticated, writable by authorized)
CREATE POLICY product_read_policy ON products FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY product_write_policy ON products FOR ALL TO authenticated 
    USING (has_permission('products:write')) WITH CHECK (has_permission('products:write'));

CREATE POLICY variant_read_policy ON variants FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY variant_write_policy ON variants FOR ALL TO authenticated 
    USING (has_permission('products:write')) WITH CHECK (has_permission('products:write'));

-- D. Policies for Inventories (Branch isolated select, write by authorized)
CREATE POLICY inventory_select_policy ON inventories FOR SELECT TO authenticated
    USING (branch_id = current_employee_branch() OR current_employee_role() IN ('super_admin', 'admin'));

CREATE POLICY inventory_write_policy ON inventories FOR ALL TO authenticated
    USING (has_permission('inventories:write')) WITH CHECK (has_permission('inventories:write'));

-- E. Policies for Customers
CREATE POLICY customer_read_policy ON customers FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY customer_write_policy ON customers FOR ALL TO authenticated
    USING (has_permission('customers:write')) WITH CHECK (has_permission('customers:write'));

-- F. Policies for Shifts (Isolated by branch)
CREATE POLICY shift_select_policy ON shifts FOR SELECT TO authenticated
    USING (branch_id = current_employee_branch() OR current_employee_role() IN ('super_admin', 'admin'));

CREATE POLICY shift_insert_policy ON shifts FOR INSERT TO authenticated
    WITH CHECK (branch_id = current_employee_branch() AND has_permission('shifts:open'));

CREATE POLICY shift_update_policy ON shifts FOR UPDATE TO authenticated
    USING (branch_id = current_employee_branch() AND has_permission('shifts:close'));

-- G. Policies for Sales & Sale Items (Branch isolated select, insert only if cashier/caja is open)
CREATE POLICY sales_select_policy ON sales FOR SELECT TO authenticated
    USING (branch_id = current_employee_branch() OR current_employee_role() IN ('super_admin', 'admin'));

CREATE POLICY sales_insert_policy ON sales FOR INSERT TO authenticated
    WITH CHECK (branch_id = current_employee_branch() AND has_permission('pos:sale'));

CREATE POLICY items_select_policy ON sale_items FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND 
        (sales.branch_id = current_employee_branch() OR current_employee_role() IN ('super_admin', 'admin'))
    ));

CREATE POLICY items_insert_policy ON sale_items FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.branch_id = current_employee_branch()
    ));

-- H. Policies for Transfers
CREATE POLICY transfer_select_policy ON transfers FOR SELECT TO authenticated
    USING (source_branch_id = current_employee_branch() OR target_branch_id = current_employee_branch() OR current_employee_role() IN ('super_admin', 'admin'));

-- I. Policies for Audit Logs
CREATE POLICY audit_select_policy ON audit_logs FOR SELECT TO authenticated
    USING (current_employee_role() IN ('super_admin', 'admin'));

-- ============================================================================
-- 8. HIGH-PERFORMANCE DATABASE INDEXES (<50ms POS query speed)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_products_reference ON products(reference);
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON variants(barcode);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku);
CREATE INDEX IF NOT EXISTS idx_inventories_branch_variant ON inventories(branch_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_shifts_employee_status ON shifts(employee_id, status);

-- ============================================================================
-- 9. MATERIALIZED VIEWS FOR REAL-TIME EXECUTIVE ANALYTICS
-- ============================================================================

-- Daily Sales
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_sales AS
SELECT 
    branch_id,
    date_trunc('day', created_at) AS sale_date,
    COUNT(id) AS total_transactions,
    SUM(total) AS total_revenue,
    SUM(discount) AS total_discounts
FROM sales
WHERE status = 'COMPLETED'
GROUP BY branch_id, sale_date;

-- Monthly Sales
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_sales AS
SELECT 
    branch_id,
    date_trunc('month', created_at) AS sale_month,
    COUNT(id) AS total_transactions,
    SUM(total) AS total_revenue
FROM sales
WHERE status = 'COMPLETED'
GROUP BY branch_id, sale_month;

-- Best Selling Variants
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_top_products AS
SELECT 
    v.sku,
    p.name AS product_name,
    COUNT(si.id) AS occurrences,
    SUM(si.quantity) AS units_sold,
    SUM(si.total) AS total_revenue
FROM sale_items si
JOIN variants v ON si.variant_id = v.id
JOIN products p ON v.product_id = p.id
JOIN sales s ON si.sale_id = s.id
WHERE s.status = 'COMPLETED'
GROUP BY v.sku, p.name
ORDER BY units_sold DESC;

-- Unique Index to enable CONCURRENT refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_top_products_sku ON mv_top_products(sku);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_sales ON mv_daily_sales(branch_id, sale_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_monthly_sales ON mv_monthly_sales(branch_id, sale_month);

-- Stored Procedure to safely refresh views asynchronously
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_sales;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_sales;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_top_products;
END;
$$ LANGUAGE plpgsql;
