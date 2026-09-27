// Arquitectura de Integración Wompi para Colombia (Production-Ready)
// J&M FASHION STORE — Moda Masculina Colombia

export const WOMPI_CONFIG = {
  publicKey: import.meta.env.VITE_WOMPI_PUBLIC_KEY || 'pub_prod_placeholder_jm_fashion',
  currency: 'COP',
  environment: import.meta.env.MODE === 'production' ? 'production' : 'sandbox',
  sandboxUrl: 'https://sandbox.wompi.co/v1',
  productionUrl: 'https://production.wompi.co/v1'
};

export const wompiService = {
  /**
   * NOTA DE SEGURIDAD FASE 5:
   * Los secretos privados de Wompi (INTEGRITY_SECRET y EVENTS_SECRET) PERMANECEN EXCLUSIVAMENTE 
   * EN EL ENTORNO DE SERVIDOR / EDGE FUNCTIONS / POSTGRESQL.
   *
   * El cliente frontend ÚNICAMENTE utiliza la Public Key oficial para instanciar el Checkout Widget
   * y recibe el `integritySignature` ya calculado por la función RPC de Supabase.
   */

  // Estructura de parámetros para el Checkout Widget / API de Wompi en Frontend
  buildCheckoutParams: ({ orderId, orderNumber, totalAmount, amountInCents, integritySignature, customerEmail, customerName, customerPhone }) => {
    const finalAmountInCents = amountInCents || Math.round(totalAmount * 100);
    const reference = orderNumber || `JM-ORD-${orderId}-${Date.now().toString().slice(-4)}`;

    return {
      currency: 'COP',
      amountInCents: finalAmountInCents,
      reference,
      publicKey: WOMPI_CONFIG.publicKey,
      signature: integritySignature || null, // Firma calculada en backend server-side
      redirectUrl: `${window.location.origin}/checkout/confirmacion?orderId=${orderId}&ref=${reference}`,
      customerData: {
        email: customerEmail,
        fullName: customerName,
        phoneNumber: customerPhone,
        phoneNumberPrefix: '+57'
      }
    };
  }
};

export default wompiService;
