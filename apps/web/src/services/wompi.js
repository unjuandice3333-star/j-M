/**
 * SERVICIO CLIENTE Y WIDGET WOMPI COLOMBIA (Production & Sandbox Ready)
 * J&M FASHION STORE — Moda Masculina Colombia
 *
 * SEGURIDAD CRÍTICA:
 * - NUNCA incluye o requiere llaves privadas o secretos de integridad en el frontend.
 * - La firma de integridad SHA-256 es generada exclusivamente SERVER-SIDE a través de /api/wompi/signature.
 * - Utiliza VITE_WOMPI_PUBLIC_KEY para instanciar el Checkout Widget oficial.
 */

const WOMPI_CONFIG = {
  publicKey: import.meta.env.VITE_WOMPI_PUBLIC_KEY || 'pub_test_Q5y15g9QLiTH8ljNipYwuXYxBWsN6L2b',
  env: import.meta.env.VITE_WOMPI_ENV || 'sandbox',
  widgetScriptUrl: 'https://checkout.wompi.co/widget.js'
};

// Obtiene la clase constructora del Widget expuesta por Wompi Colombia (WidgetCheckout como principal, WompiCheckout como fallback)
const getWompiWidgetClass = () => {
  if (typeof window !== 'undefined') {
    return window.WidgetCheckout || window.WompiCheckout || null;
  }
  return null;
};

export const wompiService = {
  /**
   * Carga dinámicamente el script oficial del Checkout Widget de Wompi en el DOM si no existe.
   * Maneja condiciones de carrera si el script ya está presente o en proceso de carga.
   */
  loadWompiWidgetScript: () => {
    return new Promise((resolve, reject) => {
      // 1. Si la librería ya está disponible en window, resolver de inmediato
      const existingClass = getWompiWidgetClass();
      if (existingClass) {
        resolve(existingClass);
        return;
      }

      // 2. Si el tag script ya existe en el DOM (evitar condición de carrera)
      const existingScript = document.getElementById('wompi-checkout-script');
      if (existingScript) {
        const currentClass = getWompiWidgetClass();
        if (currentClass) {
          resolve(currentClass);
          return;
        }

        existingScript.addEventListener('load', () => {
          const loadedClass = getWompiWidgetClass();
          if (loadedClass) {
            resolve(loadedClass);
          } else {
            reject(new Error('No se pudo inicializar la librería WidgetCheckout de Wompi.'));
          }
        }, { once: true });

        existingScript.addEventListener('error', () => {
          reject(new Error('Error al cargar el script del Checkout de Wompi.'));
        }, { once: true });

        return;
      }

      // 3. Crear e inyectar el script en el DOM
      const script = document.createElement('script');
      script.id = 'wompi-checkout-script';
      script.src = WOMPI_CONFIG.widgetScriptUrl;
      script.async = true;
      script.onload = () => {
        const loadedClass = getWompiWidgetClass();
        if (loadedClass) {
          resolve(loadedClass);
        } else {
          reject(new Error('No se pudo cargar la librería WidgetCheckout de Wompi.'));
        }
      };
      script.onerror = () => reject(new Error('Error al cargar el script del Checkout de Wompi.'));
      document.body.appendChild(script);
    });
  },

  /**
   * Solicita al servidor backend (/api/wompi/signature) la firma de integridad SHA-256.
   */
  fetchServerIntegritySignature: async (orderNumber, orderId) => {
    try {
      const response = await fetch('/api/wompi/signature', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reference: orderNumber,
          order_id: orderId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error del servidor (${response.status}) al obtener la firma Wompi.`);
      }

      const data = await response.json();
      return data; // { reference, amount_in_cents, currency, signature, publicKey }
    } catch (err) {
      console.warn('[Wompi Service Warning]: Fallback a simulación o respuesta de error:', err);
      throw err;
    }
  },

  /**
   * Inicia el Checkout Widget oficial de Wompi con la firma calculada autoritativamente por el servidor.
   */
  openWompiWidget: async ({
    orderNumber,
    orderId,
    totalAmount,
    amountInCents,
    customerEmail,
    customerName,
    customerPhone,
    redirectUrl
  }) => {
    await wompiService.loadWompiWidgetScript();

    // 1. Obtener la firma de integridad generada autoritativamente en servidor
    let signatureData = null;
    try {
      signatureData = await wompiService.fetchServerIntegritySignature(orderNumber, orderId);
    } catch (err) {
      console.error('[Wompi Service Error]: No se pudo obtener la firma de integridad server-side:', err);
      throw new Error('No se pudo generar la firma de seguridad para el pago en Wompi. Por favor intenta nuevamente.');
    }

    if (!signatureData || !signatureData.signature) {
      throw new Error('La firma de seguridad de Wompi no fue recibida del servidor.');
    }

    const finalAmountInCents = signatureData.amount_in_cents || amountInCents || Math.round(totalAmount * 100);
    const finalReference = signatureData.reference || orderNumber || `JM-ORD-${orderId}`;
    const publicKey = signatureData.publicKey || WOMPI_CONFIG.publicKey;
    const integritySignature = signatureData.signature;

    const defaultRedirectUrl = redirectUrl || `${window.location.origin}/checkout/confirmacion?orderId=${orderId}&ref=${finalReference}`;

    // Configuración oficial del Checkout Widget de Wompi Colombia
    const checkoutOptions = {
      currency: 'COP',
      amountInCents: finalAmountInCents,
      reference: finalReference,
      publicKey: publicKey,
      signature: {
        integrity: integritySignature
      },
      redirectUrl: defaultRedirectUrl,
      customerData: {
        email: customerEmail,
        fullName: customerName,
        phoneNumber: customerPhone ? customerPhone.replace(/[^0-9]/g, '') : '',
        phoneNumberPrefix: '+57'
      }
    };

    // Telemetría segura de diagnóstico (NO expone valores secretos ni firmas completas)
    console.log('[Wompi Widget Config]:', {
      currency: checkoutOptions.currency,
      amountInCents: checkoutOptions.amountInCents,
      reference: checkoutOptions.reference,
      signaturePresent: Boolean(checkoutOptions.signature?.integrity),
      signatureLength: checkoutOptions.signature?.integrity?.length || 0,
      publicKeyPresent: Boolean(checkoutOptions.publicKey)
    });

    const CheckoutClass = getWompiWidgetClass();

    if (CheckoutClass) {
      const checkout = new CheckoutClass(checkoutOptions);
      checkout.open((result) => {
        const transaction = result?.transaction;
        console.log('[Wompi Widget Result]:', transaction);
        if (transaction && redirectUrl) {
          window.location.href = defaultRedirectUrl;
        }
      });
    } else {
      console.error('[Wompi Service Error]: WidgetCheckout no está disponible en window.');
      window.location.href = defaultRedirectUrl;
    }
  }
};

export default wompiService;
