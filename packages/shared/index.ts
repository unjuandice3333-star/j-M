// Shared Constants and Business Configurations

export const DEFAULT_TAX_RATE = 0.19; // IVA 19% en Colombia

export const PAYMENT_METHODS = [
  { value: 'Efectivo', label: 'Efectivo' },
  { value: 'Tarjeta', label: 'Tarjeta de Crédito/Débito' },
  { value: 'Transferencia', label: 'Transferencia Bancaria (Nequi/Daviplata)' },
  { value: 'Puntos', label: 'Redención de Puntos de Fidelidad' },
  { value: 'Mixto', label: 'Pago Mixto' },
] as const;

export const GENDERS = [
  { value: 'Masculino', label: 'Masculino' },
  { value: 'Femenino', label: 'Femenino' },
  { value: 'Unisex', label: 'Unisex / Genérico' },
  { value: 'Infantil', label: 'Moda Infantil' },
] as const;

export const DEFAULT_SIZES = [
  { code: 'S', name: 'Small / Chica', sort_order: 1 },
  { code: 'M', name: 'Medium / Mediana', sort_order: 2 },
  { code: 'L', name: 'Large / Grande', sort_order: 3 },
  { code: 'XL', name: 'Extra Large / Extra Grande', sort_order: 4 },
  { code: 'XXL', name: 'Double Extra Large', sort_order: 5 },
] as const;

export const DEFAULT_COLORS = [
  { name: 'Negro', hex_code: '#000000' },
  { name: 'Blanco', hex_code: '#FFFFFF' },
  { name: 'Gris', hex_code: '#808080' },
  { name: 'Azul Oscuro', hex_code: '#000080' },
  { name: 'Rojo', hex_code: '#FF0000' },
  { name: 'Beige', hex_code: '#F5F5DC' },
] as const;

export const SYSTEM_ROLES = [
  { role: 'super_admin', label: 'Super Administrador / Dueño' },
  { role: 'admin', label: 'Administrador de Sucursal' },
  { role: 'supervisor', label: 'Supervisor de Tienda' },
  { role: 'cashier', label: 'Cajero / Punto de Venta' },
  { role: 'warehouse', label: 'Bodeguero / Logística' },
] as const;

export const LOYALTY_POINTS_RATE = 1000; // $1,000 COP = 1 Punto
export const POINTS_VALUE_COP = 10; // Cada punto equivale a $10 COP en descuento
