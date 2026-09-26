export declare const DEFAULT_TAX_RATE = 0.19;
export declare const PAYMENT_METHODS: readonly [{
    readonly value: "Efectivo";
    readonly label: "Efectivo";
}, {
    readonly value: "Tarjeta";
    readonly label: "Tarjeta de Crédito/Débito";
}, {
    readonly value: "Transferencia";
    readonly label: "Transferencia Bancaria (Nequi/Daviplata)";
}, {
    readonly value: "Puntos";
    readonly label: "Redención de Puntos de Fidelidad";
}, {
    readonly value: "Mixto";
    readonly label: "Pago Mixto";
}];
export declare const GENDERS: readonly [{
    readonly value: "Masculino";
    readonly label: "Masculino";
}, {
    readonly value: "Femenino";
    readonly label: "Femenino";
}, {
    readonly value: "Unisex";
    readonly label: "Unisex / Genérico";
}, {
    readonly value: "Infantil";
    readonly label: "Moda Infantil";
}];
export declare const DEFAULT_SIZES: readonly [{
    readonly code: "S";
    readonly name: "Small / Chica";
    readonly sort_order: 1;
}, {
    readonly code: "M";
    readonly name: "Medium / Mediana";
    readonly sort_order: 2;
}, {
    readonly code: "L";
    readonly name: "Large / Grande";
    readonly sort_order: 3;
}, {
    readonly code: "XL";
    readonly name: "Extra Large / Extra Grande";
    readonly sort_order: 4;
}, {
    readonly code: "XXL";
    readonly name: "Double Extra Large";
    readonly sort_order: 5;
}];
export declare const DEFAULT_COLORS: readonly [{
    readonly name: "Negro";
    readonly hex_code: "#000000";
}, {
    readonly name: "Blanco";
    readonly hex_code: "#FFFFFF";
}, {
    readonly name: "Gris";
    readonly hex_code: "#808080";
}, {
    readonly name: "Azul Oscuro";
    readonly hex_code: "#000080";
}, {
    readonly name: "Rojo";
    readonly hex_code: "#FF0000";
}, {
    readonly name: "Beige";
    readonly hex_code: "#F5F5DC";
}];
export declare const SYSTEM_ROLES: readonly [{
    readonly role: "super_admin";
    readonly label: "Super Administrador / Dueño";
}, {
    readonly role: "admin";
    readonly label: "Administrador de Sucursal";
}, {
    readonly role: "supervisor";
    readonly label: "Supervisor de Tienda";
}, {
    readonly role: "cashier";
    readonly label: "Cajero / Punto de Venta";
}, {
    readonly role: "warehouse";
    readonly label: "Bodeguero / Logística";
}];
export declare const LOYALTY_POINTS_RATE = 1000;
export declare const POINTS_VALUE_COP = 10;
//# sourceMappingURL=index.d.ts.map