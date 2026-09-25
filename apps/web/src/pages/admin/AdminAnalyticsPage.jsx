import React from 'react';
import { BarChart3, TrendingUp, Smartphone, Monitor, ShoppingBag, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { formatCOP } from '../../data/mockData';

export const AdminAnalyticsPage = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER */}
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
          ANALÍTICA & EMBUDO DE CONVERSIÓN
        </h1>
        <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
          Rendimiento del tráfico en Colombia, embudo de compras e integración de píxeles publicitarios.
        </p>
      </div>

      {/* CONVERSION FUNNEL BAR */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '2rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', marginBottom: '1.5rem' }}>
          EMBUDO DE CONVERSIÓN DE VENTAS (ÚLTIMOS 30 DÍAS)
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', textAlign: 'center' }}>
          {[
            { step: '1. Visitas Únicas', count: '12.450', pct: '100%', sub: 'Tráf. Colombia' },
            { step: '2. Vieron Producto', count: '8.120', pct: '65.2%', sub: 'Páginas PDP' },
            { step: '3. Agregaron Carrito', count: '2.410', pct: '29.6%', sub: 'Intención' },
            { step: '4. Iniciaron Checkout', count: '1.180', pct: '48.9%', sub: 'Formulario' },
            { step: '5. Compras Exitosas', count: '426', pct: '36.1%', sub: 'Venta Final' }
          ].map((item, idx) => (
            <div key={idx} style={{ backgroundColor: '#FAFAFA', padding: '1.2rem', borderRadius: '8px', border: '1px solid #E4E4E7', position: 'relative' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{item.step}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#09090B' }}>{item.count}</div>
              <div style={{ fontSize: '0.78rem', color: '#10B981', fontWeight: 800, marginTop: '0.2rem' }}>{item.pct} conv.</div>
            </div>
          ))}
        </div>
      </div>

      {/* TWO COLUMNS: DEVICES & CATEGORY REVENUE */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Device Breakdown */}
        <div style={{ backgroundColor: '#FFFFFF', padding: '1.5rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.25rem' }}>
            VENTAS POR DISPOSITIVO
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', backgroundColor: '#FAFAFA', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Smartphone size={24} color="#09090B" />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Móvil (Smartphones)</div>
                  <div style={{ fontSize: '0.78rem', color: '#71717A' }}>68.4% del tráfico total</div>
                </div>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#09090B' }}>
                {formatCOP(33400000)}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', backgroundColor: '#FAFAFA', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Monitor size={24} color="#09090B" />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Computador (Desktop)</div>
                  <div style={{ fontSize: '0.78rem', color: '#71717A' }}>31.6% del tráfico total</div>
                </div>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#09090B' }}>
                {formatCOP(15500000)}
              </div>
            </div>
          </div>
        </div>

        {/* Marketing Integrations Status */}
        <div style={{ backgroundColor: '#FFFFFF', padding: '1.5rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.25rem' }}>
            INTEGRACIONES DE MARKETING
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', border: '1px solid #E4E4E7', borderRadius: '6px' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>Google Analytics 4 (GA4)</div>
                <div style={{ fontSize: '0.75rem', color: '#71717A' }}>ID de Medición: G-JMSTORE2026</div>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, backgroundColor: '#D1FAE5', color: '#065F46', padding: '3px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                <CheckCircle2 size={12} /> CONECTADO
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', border: '1px solid #E4E4E7', borderRadius: '6px' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>Meta Pixel (Facebook / Instagram Ads)</div>
                <div style={{ fontSize: '0.75rem', color: '#71717A' }}>ID de Pixel: 88392019482</div>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, backgroundColor: '#D1FAE5', color: '#065F46', padding: '3px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                <CheckCircle2 size={12} /> CONECTADO
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalyticsPage;
