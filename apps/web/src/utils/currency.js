// Formato de pesos colombianos para toda la tienda y el admin (antes vivía en data/mockData.js).
// Acepta números y cadenas numéricas (PostgREST puede devolver `numeric` como texto) y redondea a pesos enteros.
export const formatCOP = (amount) => {
  const n = typeof amount === 'string' && amount.trim() !== '' ? Number(amount) : amount;
  if (typeof n !== 'number' || !Number.isFinite(n)) return '$0';
  const rounded = Math.round(n);
  const abs = Math.abs(rounded).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  return (rounded < 0 ? '-$' : '$') + abs;
};

export default formatCOP;
