// Ejecución 124 (D97): motivo de «Requiere revisión» a partir de order_events (contrato de private.transition_order
// y apply_wompi_event: PAID_WITHOUT_STOCK con metadata.shortages, PAYMENT_REQUIRES_REFUND, PAYMENT_VOIDED_AFTER_PAID).
import { describe, it, expect } from 'vitest';
import { attentionReasons, eventLabel } from '../utils/orderAttention';

const items = [
  { variant_id: 'v-l', product_name: 'Camiseta Básica', size_code: 'L', color_name: 'Negro', sku: 'CAM-L-NEG', quantity: 2 },
  { variant_id: 'v-s', product_name: 'Polo', size_code: 'S', color_name: 'Blanco', sku: 'POL-S-BLA', quantity: 1 },
];

describe('attentionReasons', () => {
  it('sin needs_attention no hay motivos aunque existan eventos', () => {
    expect(attentionReasons({ needs_attention: false, order_events: [{ event_type: 'PAID_WITHOUT_STOCK', metadata: { shortages: [] } }] })).toEqual([]);
    expect(attentionReasons(null)).toEqual([]);
  });

  it('pago sin stock: una línea por faltante con prenda, pedido y disponible (nunca negativo)', () => {
    const r = attentionReasons({
      needs_attention: true, online_order_items: items,
      order_events: [{ event_type: 'PAID_WITHOUT_STOCK', created_at: '2026-11-14T01:00:00Z',
        metadata: { shortages: [{ variant_id: 'v-l', quantity: 2, available: 1 }, { variant_id: 'v-s', quantity: 1, available: -3 }] } }],
    });
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('stock');
    expect(r[0].lines).toEqual([
      'Camiseta Básica · Talla L · Negro (SKU CAM-L-NEG): pidió 2, disponibles al pagar 1',
      'Polo · Talla S · Blanco (SKU POL-S-BLA): pidió 1, disponibles al pagar 0',
    ]);
  });

  it('faltante de una variante que no está en las líneas cargadas no rompe', () => {
    const r = attentionReasons({ needs_attention: true, online_order_items: [],
      order_events: [{ event_type: 'PAID_WITHOUT_STOCK', metadata: { shortages: [{ variant_id: 'x', quantity: 1, available: 0 }] } }] });
    expect(r[0].lines).toEqual(['Artículo del pedido: pidió 1, disponibles al pagar 0']);
  });

  it('reembolso y anulación muestran la referencia, en orden cronológico', () => {
    const r = attentionReasons({ needs_attention: true, order_events: [
      { event_type: 'PAYMENT_VOIDED_AFTER_PAID', created_at: '2026-11-14T03:00:00Z', metadata: { reference: 'REF-2' } },
      { event_type: 'PAYMENT_REQUIRES_REFUND', created_at: '2026-11-14T02:00:00Z', metadata: { reference: 'REF-1' } },
      { event_type: 'STATUS_CHANGED', created_at: '2026-11-14T01:00:00Z', metadata: {} },
    ] });
    expect(r.map((x) => x.kind)).toEqual(['refund', 'voided']);
    expect(r[0].text).toContain('REF-1');
    expect(r[1].text).toContain('REF-2');
  });

  it('marcado sin evento conocido (p. ej. metadata no legible): pide revisar el historial', () => {
    expect(attentionReasons({ needs_attention: true, order_events: [] })[0].kind).toBe('other');
  });
});

describe('eventLabel', () => {
  it('traduce los eventos conocidos y deja los demás tal cual', () => {
    expect(eventLabel('PAID_WITHOUT_STOCK')).toBe('Pagado sin stock suficiente');
    expect(eventLabel('STATUS_CHANGED')).toBe('Cambio de estado');
    expect(eventLabel('status')).toBe('status');
  });
});
