/**
 * SERVICIO CLIENTE Y WIDGET WOMPI COLOMBIA (Production & Sandbox Ready)
 * J&M FASHION STORE — Moda Masculina Colombia
 *
 * SEGURIDAD CRÍTICA:
 * - NUNCA incluye o requiere llaves privadas o secretos de integridad en el frontend.
 * - La firma de integridad SHA-256 es generada exclusivamente SERVER-SIDE a través de /api/wompi/signature.
 * - Utiliza VITE_WOMPI_PUBLIC_KEY para instanciar el Checkout Widget oficial.
 */

import { getClientConfig } from '../config/runtimeConfig.js';

// M26-T3: sin valores por defecto fijos. La llave pública y el modo vienen de la configuración validada del
// cliente (VITE_WOMPI_PUBLIC_KEY y VITE_WOMPI_ENV, obligatorias y coherentes entre sí).
const { wompi: wompiClientConfig } = getClientConfig();
const WOMPI_CONFIG = {
  publicKey: wompiClientConfig.publicKey,
  env: wompiClientConfig.env,
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
   * Prepara el pago en el servidor (/api/wompi/signature → create_payment_attempt en la BD): devuelve la referencia
   * del intento, el monto que fija la BD y la firma de integridad. El navegador no decide importes ni referencias.
   */
  preparePayment: async (orderId, publicToken) => {
    let response;
    try {
      response = await fetch('/api/wompi/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, public_token: publicToken }),
      });
    } catch {
      throw new Error('No hay conexión con la tienda para preparar el pago. Inténtalo de nuevo.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'No se pudo preparar el pago.'), { status: response.status, code: data.code });
    if (!data.signature || !data.reference || !data.amount_in_cents) throw new Error('La respuesta de preparación del pago está incompleta.');
    return data; // { reference, amount_in_cents, currency, signature, publicKey, order_number, attempt_number }
  },

  /** URL de retorno: la página de confirmación consulta el estado REAL en la BD (no confía en el resultado del widget). */
  confirmationUrl: (orderNumber, publicToken) =>
    `${window.location.origin}/checkout/confirmacion?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(publicToken)}`,

  /**
   * Abre el Checkout Widget de Wompi para un pedido ya creado en la BD.
   * @param {{ order: { id, order_number, public_token }, customer: { email, name, phone } }} input
   */
  openWompiWidget: async ({ order, customer }) => {
    const pay = await wompiService.preparePayment(order.id, order.public_token);
    const redirectUrl = wompiService.confirmationUrl(order.order_number, order.public_token);
    let CheckoutClass;
    try {
      CheckoutClass = await wompiService.loadWompiWidgetScript();
    } catch {
      throw Object.assign(new Error('No se pudo cargar la pasarela de pagos de Wompi. Tu pedido quedó creado: puedes reintentar el pago desde la confirmación del pedido.'), { redirectUrl });
    }
    const checkout = new CheckoutClass({
      currency: pay.currency || 'COP',
      amountInCents: pay.amount_in_cents,
      reference: pay.reference,
      publicKey: pay.publicKey || WOMPI_CONFIG.publicKey,
      signature: { integrity: pay.signature },
      redirectUrl,
      customerData: {
        email: customer.email,
        fullName: customer.name,
        phoneNumber: String(customer.phone || '').replace(/[^0-9]/g, ''),
        phoneNumberPrefix: '+57',
      },
    });
    // El resultado del widget solo sirve para volver a la confirmación; el estado pagado lo fija el webhook en la BD.
    checkout.open(() => { window.location.href = redirectUrl; });
    return { reference: pay.reference, redirectUrl };
  },
};

export default wompiService;
