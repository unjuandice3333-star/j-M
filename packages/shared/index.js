"use strict";
// Shared Constants and Business Configurations
Object.defineProperty(exports, "__esModule", { value: true });
exports.POINTS_VALUE_COP = exports.LOYALTY_POINTS_RATE = exports.SYSTEM_ROLES = exports.DEFAULT_COLORS = exports.DEFAULT_SIZES = exports.GENDERS = exports.PAYMENT_METHODS = exports.DEFAULT_TAX_RATE = void 0;
exports.DEFAULT_TAX_RATE = 0.19; // IVA 19% en Colombia
exports.PAYMENT_METHODS = [
    { value: 'Efectivo', label: 'Efectivo' },
    { value: 'Tarjeta', label: 'Tarjeta de Crédito/Débito' },
    { value: 'Transferencia', label: 'Transferencia Bancaria (Nequi/Daviplata)' },
    { value: 'Puntos', label: 'Redención de Puntos de Fidelidad' },
    { value: 'Mixto', label: 'Pago Mixto' },
];
exports.GENDERS = [
    { value: 'Masculino', label: 'Masculino' },
    { value: 'Femenino', label: 'Femenino' },
    { value: 'Unisex', label: 'Unisex / Genérico' },
    { value: 'Infantil', label: 'Moda Infantil' },
];
exports.DEFAULT_SIZES = [
    { code: 'S', name: 'Small / Chica', sort_order: 1 },
    { code: 'M', name: 'Medium / Mediana', sort_order: 2 },
    { code: 'L', name: 'Large / Grande', sort_order: 3 },
    { code: 'XL', name: 'Extra Large / Extra Grande', sort_order: 4 },
    { code: 'XXL', name: 'Double Extra Large', sort_order: 5 },
];
exports.DEFAULT_COLORS = [
    { name: 'Negro', hex_code: '#000000' },
    { name: 'Blanco', hex_code: '#FFFFFF' },
    { name: 'Gris', hex_code: '#808080' },
    { name: 'Azul Oscuro', hex_code: '#000080' },
    { name: 'Rojo', hex_code: '#FF0000' },
    { name: 'Beige', hex_code: '#F5F5DC' },
];
exports.SYSTEM_ROLES = [
    { role: 'super_admin', label: 'Super Administrador / Dueño' },
    { role: 'admin', label: 'Administrador de Sucursal' },
    { role: 'supervisor', label: 'Supervisor de Tienda' },
    { role: 'cashier', label: 'Cajero / Punto de Venta' },
    { role: 'warehouse', label: 'Bodeguero / Logística' },
];
exports.LOYALTY_POINTS_RATE = 1000; // $1,000 COP = 1 Punto
exports.POINTS_VALUE_COP = 10; // Cada punto equivale a $10 COP en descuento
//# sourceMappingURL=index.js.map