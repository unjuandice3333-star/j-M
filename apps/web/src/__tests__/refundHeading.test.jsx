// Ejecución 135: un pedido puede tener una devolución hecha y otra pendiente a la vez. El título del bloque
// de devoluciones del detalle del admin debe ir en plural y decir cuántas faltan por hacer en Wompi.
import { describe, it, expect } from 'vitest';
import { refundRecords, refundHeading } from '../utils/orderRefunds';

const rec = (status, amount, at) => ({ id: at, amount, status, reason: 'x', created_at: at });

describe('refundHeading', () => {
  it('con una sola devolución conserva el título de siempre', () => {
    expect(refundHeading(refundRecords({ order_refunds: [rec('requested', 62000, '1')] }))).toBe('DEVOLUCIÓN REGISTRADA · 62000');
  });

  it('con varias va en plural y dice cuántas faltan por hacer en Wompi', () => {
    const mixed = refundRecords({ order_refunds: [rec('processed', 62000, '1'), rec('requested', 15000, '2')] });
    expect(refundHeading(mixed, (n) => `$${n}`)).toBe('DEVOLUCIONES REGISTRADAS · $77000 · 1 pendiente de hacer en Wompi');
    const two = refundRecords({ order_refunds: [rec('requested', 1, '1'), rec('requested', 2, '2'), rec('processed', 3, '3')] });
    expect(refundHeading(two)).toBe('DEVOLUCIONES REGISTRADAS · 6 · 2 pendientes de hacer en Wompi');
  });

  it('con varias ya hechas no menciona pendientes y excluye las rechazadas del total', () => {
    const done = refundRecords({ order_refunds: [rec('processed', 10, '1'), rec('rejected', 5, '2')] });
    expect(refundHeading(done)).toBe('DEVOLUCIONES REGISTRADAS · 10');
  });
});
