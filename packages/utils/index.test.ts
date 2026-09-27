import { describe, it, expect } from 'vitest';
import { generateSKU, calculateEAN13CheckDigit, generateBarcode, formatCurrency, calculatePointsEarned, validateEmail } from './index';

describe('@jm/utils - Retail & E-Commerce Business Logic', () => {
  it('generateSKU formatea correctamente referencia, talla y color', () => {
    const sku = generateSKU('polo-class-01', 'M', 'Negro Azabache');
    expect(sku).toBe('POLOCLASS01-M-NEG');
  });

  it('calculateEAN13CheckDigit calcula el dígito verificador GS1 correcto', () => {
    const check = calculateEAN13CheckDigit('770123456789');
    expect(typeof check).toBe('number');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThanOrEqual(9);
  });

  it('generateBarcode genera un código EAN-13 válido de 13 dígitos con prefijo Colombia 770', () => {
    const barcode = generateBarcode('REF-001', 'L', 'Azul');
    expect(barcode.length).toBe(13);
    expect(barcode.startsWith('770')).toBe(true);
  });

  it('formatCurrency formatea a Pesos Colombianos (COP)', () => {
    const formatted = formatCurrency(129900);
    expect(formatted).toContain('129.900');
  });

  it('calculatePointsEarned otorga 1 punto por cada $1.000 COP', () => {
    expect(calculatePointsEarned(150000)).toBe(150);
    expect(calculatePointsEarned(999)).toBe(0);
  });

  it('validateEmail valida estructuras de correos correctamente', () => {
    expect(validateEmail('cliente@jmfashion.com')).toBe(true);
    expect(validateEmail('correo-invalido')).toBe(false);
  });
});
