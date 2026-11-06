// M27: la tienda no registra tráfico ni embudo de conversión en su base de datos (la analítica de visitas vive en
// GA4 / Meta Pixel, servicios externos). Antes esta página mostraba cifras inventadas; ahora lo dice con claridad y
// enlaza a las métricas de ventas reales.
import React from 'react';
import { Link } from 'react-router-dom';

export const AdminAnalyticsPage = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '760px' }}>
    <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>ANALÍTICA</h1>
    <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '10px', padding: '1.5rem', fontSize: '0.92rem', lineHeight: 1.6 }}>
      <p><strong>Ventas, pedidos, ticket promedio y productos más vendidos:</strong> se calculan con los pedidos reales en el{' '}
        <Link to="/admin/dashboard" style={{ textDecoration: 'underline', fontWeight: 700 }}>Dashboard</Link>.</p>
      <p style={{ marginTop: '0.75rem' }}><strong>Visitas, embudo de conversión y dispositivos:</strong> la tienda envía los eventos (vista de producto,
        agregar al carrito, inicio de compra y compra) a Google Analytics 4 y Meta Pixel cuando están configurados. Consulta esos
        informes directamente en esas plataformas: la base de datos de la tienda no guarda datos de tráfico.</p>
    </div>
  </div>
);

export default AdminAnalyticsPage;
