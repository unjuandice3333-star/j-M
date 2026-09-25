// Core Utility Functions for @jm/utils

/**
 * Genera un SKU estandarizado para moda retail.
 * Formato: [REFERENCIA]-[TALLA]-[COLOR] en mayúsculas y sin caracteres especiales.
 */
export function generateSKU(reference: string, sizeCode: string, colorName: string): string {
  const sanitize = (str: string) =>
    str
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

  const ref = sanitize(reference);
  const size = sanitize(sizeCode);
  const color = sanitize(colorName).substring(0, 3); // Primeras 3 letras del color

  return `${ref}-${size}-${color}`;
}

/**
 * Calcula el dígito de control EAN-13 para una cadena de 12 números.
 */
export function calculateEAN13CheckDigit(code12: string): number {
  if (code12.length !== 12 || !/^\d+$/.test(code12)) {
    throw new Error('La cadena de entrada para EAN-13 debe tener exactamente 12 números.');
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code12[i], 10);
    // Posiciones pares (0-indexed impares 1,3,5...) se multiplican por 3
    // Posiciones impares (0-indexed pares 0,2,4...) se multiplican por 1
    sum += i % 2 === 1 ? digit * 3 : digit;
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Genera un código de barras EAN-13 real basado en hash numérico de referencia + talla + color.
 * Prefijo: '770' (Código de país para Colombia de la GS1).
 */
export function generateBarcode(reference: string, sizeCode: string, colorName: string): string {
  const hashString = `${reference}${sizeCode}${colorName}`;
  
  // Generamos una cadena numérica determinista de 9 dígitos a partir de la suma de caracteres
  let numericHash = 0;
  for (let i = 0; i < hashString.length; i++) {
    numericHash = (numericHash * 33 + hashString.charCodeAt(i)) % 1000000000;
  }
  
  // Rellenar con ceros a la izquierda para garantizar 9 dígitos
  const paddedHash = String(numericHash).padStart(9, '0');
  
  // Formato: 770 (Colombia) + 9 dígitos de hash determinista = 12 dígitos
  const code12 = `770${paddedHash}`;
  
  // Calculamos el 13vo dígito de control
  const checkDigit = calculateEAN13CheckDigit(code12);
  
  return `${code12}${checkDigit}`;
}

/**
 * Formatea un valor numérico a moneda local (Pesos Colombianos por defecto).
 */
export function formatCurrency(amount: number, locale = 'es-CO', currency = 'COP'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Calcula los puntos acumulados por una compra.
 * Por defecto: 1 punto por cada $1,000 COP pagados.
 */
export function calculatePointsEarned(total: number, rate = 1000): number {
  if (total <= 0 || rate <= 0) return 0;
  return Math.floor(total / rate);
}

/**
 * Valida si un correo electrónico es estructurado correctamente.
 */
export function validateEmail(email: string): boolean {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email);
}
