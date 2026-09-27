// Servicio de Analítica E-commerce para GA4 y Meta Pixel
// J&M FASHION STORE — Moda Masculina Colombia

export const trackGA4Event = (eventName, params = {}) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  } else {
    console.debug(`[GA4 Event Mock]: ${eventName}`, params);
  }
};

export const trackMetaPixelEvent = (eventName, params = {}) => {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', eventName, params);
  } else {
    console.debug(`[Meta Pixel Event Mock]: ${eventName}`, params);
  }
};

// Eventos del Flujo E-commerce
export const analyticsService = {
  viewItem: (product) => {
    if (!product) return;
    const params = {
      currency: 'COP',
      value: product.price,
      items: [
        {
          item_id: product.id || product.slug,
          item_name: product.name,
          item_category: product.category,
          item_brand: 'J&M Fashion Store',
          price: product.price
        }
      ]
    };
    trackGA4Event('view_item', params);
    trackMetaPixelEvent('ViewContent', {
      content_name: product.name,
      content_category: product.category,
      content_ids: [product.id || product.slug],
      content_type: 'product',
      value: product.price,
      currency: 'COP'
    });
  },

  addToCart: (product, size, color, quantity = 1) => {
    if (!product) return;
    const params = {
      currency: 'COP',
      value: product.price * quantity,
      items: [
        {
          item_id: product.id || product.slug,
          item_name: product.name,
          item_category: product.category,
          item_variant: `${size || ''} / ${color?.name || ''}`.trim(),
          price: product.price,
          quantity
        }
      ]
    };
    trackGA4Event('add_to_cart', params);
    trackMetaPixelEvent('AddToCart', {
      content_name: product.name,
      content_category: product.category,
      content_ids: [product.id || product.slug],
      content_type: 'product',
      value: product.price * quantity,
      currency: 'COP'
    });
  },

  removeFromCart: (item) => {
    if (!item) return;
    const params = {
      currency: 'COP',
      value: item.price * item.quantity,
      items: [
        {
          item_id: item.id || item.product?.id,
          item_name: item.name,
          price: item.price,
          quantity: item.quantity
        }
      ]
    };
    trackGA4Event('remove_from_cart', params);
  },

  viewCart: (items = [], totalValue = 0) => {
    const params = {
      currency: 'COP',
      value: totalValue,
      items: items.map((i) => ({
        item_id: i.id || i.product?.id,
        item_name: i.name,
        price: i.price,
        quantity: i.quantity
      }))
    };
    trackGA4Event('view_cart', params);
  },

  search: (query) => {
    if (!query) return;
    trackGA4Event('search', { search_term: query });
    trackMetaPixelEvent('Search', { search_string: query });
  },

  beginCheckout: (items, totalValue) => {
    const params = {
      currency: 'COP',
      value: totalValue,
      items: items.map((i) => ({
        item_id: i.id || i.product?.id,
        item_name: i.name,
        price: i.price,
        quantity: i.quantity
      }))
    };
    trackGA4Event('begin_checkout', params);
    trackMetaPixelEvent('InitiateCheckout', {
      value: totalValue,
      currency: 'COP',
      num_items: items.length
    });
  },

  purchase: (order) => {
    if (!order) return;
    const params = {
      transaction_id: order.id || order.order_number,
      value: order.total,
      currency: 'COP',
      tax: order.tax || 0,
      shipping: order.shipping_cost || 0,
      coupon: order.coupon_code || '',
      items: (order.items || []).map((i) => ({
        item_id: i.id || i.product_id,
        item_name: i.name || i.product_name,
        price: i.price || i.unit_price,
        quantity: i.quantity
      }))
    };
    trackGA4Event('purchase', params);
    trackMetaPixelEvent('Purchase', {
      value: order.total,
      currency: 'COP',
      content_type: 'product'
    });
  }
};

export default analyticsService;
