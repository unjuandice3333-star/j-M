// Core Types for J&M Fashion Retail ERP/POS

export type UserRole = 'super_admin' | 'admin' | 'supervisor' | 'cashier' | 'warehouse';

export interface Employee {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  branch_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  is_active: boolean;
  created_at: string;
}

// Catálogo de Productos
export interface Category {
  id: string;
  name: string;
  parent_id?: string;
  created_at: string;
}

export interface Brand {
  id: string;
  name: string;
  created_at: string;
}

export interface Collection {
  id: string;
  name: string;
  created_at: string;
}

export interface Season {
  id: string;
  name: string;
  created_at: string;
}

export interface Size {
  id: string;
  name: string;
  code: string; // ej. "S", "M", "L", "XL", "32", "34"
  sort_order: number;
}

export interface Color {
  id: string;
  name: string;
  hex_code: string; // ej. "#000000"
}

export interface Product {
  id: string;
  reference: string; // Identificador único de diseño
  name: string;
  description?: string;
  category_id: string;
  brand_id: string;
  collection_id?: string;
  season_id?: string;
  gender: 'Masculino' | 'Femenino' | 'Unisex' | 'Infantil';
  base_price: number;
  base_cost: number;
  created_at: string;
  updated_at: string;
}

export interface Variant {
  id: string;
  product_id: string;
  sku: string; // Autogenerado: REF-TALLA-COLOR
  barcode: string; // Autogenerado o leído
  size_id: string;
  color_id: string;
  price_override?: number;
  cost_override?: number;
  image_url?: string;
  created_at: string;
  
  // Joins opcionales
  product?: Product;
  size?: Size;
  color?: Color;
}

export interface Inventory {
  id: string;
  branch_id: string;
  variant_id: string;
  stock: number;
  min_stock: number;
  location_shelf?: string;
  updated_at: string;
  
  // Joins opcionales
  variant?: Variant;
}

// Operaciones POS
export type ShiftStatus = 'OPEN' | 'CLOSED';

export interface Shift {
  id: string;
  branch_id: string;
  employee_id: string;
  opened_at: string;
  closed_at?: string;
  initial_cash: number;
  expected_cash?: number;
  actual_cash?: number;
  difference?: number;
  status: ShiftStatus;
}

export type PaymentMethod = 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Puntos' | 'Mixto';
export type SaleStatus = 'COMPLETED' | 'REFUNDED' | 'VOID';

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  document_id: string; // Cédula o NIT
  email?: string;
  phone?: string;
  points: number;
  created_at: string;
}

export interface Sale {
  id: string;
  branch_id: string;
  employee_id: string;
  customer_id?: string;
  shift_id: string;
  invoice_number: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: PaymentMethod;
  points_earned: number;
  points_redeemed: number;
  status: SaleStatus;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
}

export type TransferStatus = 'PENDING' | 'SHIPPED' | 'RECEIVED' | 'CANCELLED';

export interface Transfer {
  id: string;
  source_branch_id: string;
  target_branch_id: string;
  status: TransferStatus;
  employee_id: string; // Quién crea el traslado
  created_at: string;
  updated_at: string;
}

export interface TransferItem {
  id: string;
  transfer_id: string;
  variant_id: string;
  quantity: number;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  table_name: string;
  record_id?: string;
  old_data?: any;
  new_data?: any;
  ip_address?: string;
  created_at: string;
}
