import React, { useState } from 'react';
import { X, Ruler } from 'lucide-react';
import { useECommerceStore } from '../../store/eCommerceStore';
import { SIZE_CHART } from '../../data/mockData';

export const SizeGuideModal = () => {
  const { activeModal, selectedModalCategory, closeModal } = useECommerceStore();
  const [activeTab, setActiveTab] = useState(selectedModalCategory || 'camisetas');

  if (activeModal !== 'sizeGuide') return null;

  const currentChart = SIZE_CHART[activeTab] || SIZE_CHART.camisetas;

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#FFFFFF',
          width: '100%',
          maxWidth: '700px',
          borderRadius: '12px',
          padding: '2rem',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
        }}
        className="animate-fade-in"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Ruler size={24} color="#09090B" />
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '0.05em' }}>GUÍA DE TALLAS</h2>
              <p style={{ fontSize: '0.82rem', color: '#71717A' }}>Medidas corporales de referencia en centímetros (cm)</p>
            </div>
          </div>
          <button onClick={closeModal} style={{ padding: '0.5rem' }}>
            <X size={22} />
          </button>
        </div>

        {/* CATEGORY TABS */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '0.5rem' }}>
          {['camisetas', 'camisas', 'jeans', 'calzado'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderRadius: '6px',
                backgroundColor: activeTab === tab ? '#09090B' : 'transparent',
                color: activeTab === tab ? '#FFFFFF' : '#71717A',
                transition: 'all 0.15s'
              }}
            >
              {tab === 'jeans' ? 'Jeans / Pantalones' : tab}
            </button>
          ))}
        </div>

        {/* MEASUREMENTS TABLE */}
        <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '2px solid #E4E4E7' }}>
                <th style={thStyle}>TALLA J&M</th>
                {activeTab === 'camisetas' && (
                  <>
                    <th style={thStyle}>Pecho / Tórax</th>
                    <th style={thStyle}>Cintura</th>
                    <th style={thStyle}>Largo Total</th>
                  </>
                )}
                {activeTab === 'camisas' && (
                  <>
                    <th style={thStyle}>Pecho</th>
                    <th style={thStyle}>Cuello</th>
                    <th style={thStyle}>Largo Manga</th>
                  </>
                )}
                {activeTab === 'jeans' && (
                  <>
                    <th style={thStyle}>Cintura</th>
                    <th style={thStyle}>Cadera</th>
                    <th style={thStyle}>Largo Pierna</th>
                  </>
                )}
                {activeTab === 'calzado' && (
                  <>
                    <th style={thStyle}>Largo del Pie</th>
                    <th style={thStyle}>Talla US Equivalente</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {currentChart.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #F4F4F5', textAlign: 'center' }}>
                  <td style={{ ...tdStyle, fontWeight: 800, backgroundColor: '#FAFAFA' }}>{row.size}</td>
                  {activeTab === 'camisetas' && (
                    <>
                      <td style={tdStyle}>{row.chest}</td>
                      <td style={tdStyle}>{row.waist}</td>
                      <td style={tdStyle}>{row.length}</td>
                    </>
                  )}
                  {activeTab === 'camisas' && (
                    <>
                      <td style={tdStyle}>{row.chest}</td>
                      <td style={tdStyle}>{row.collar}</td>
                      <td style={tdStyle}>{row.sleeve}</td>
                    </>
                  )}
                  {activeTab === 'jeans' && (
                    <>
                      <td style={tdStyle}>{row.waist}</td>
                      <td style={tdStyle}>{row.hip}</td>
                      <td style={tdStyle}>{row.length}</td>
                    </>
                  )}
                  {activeTab === 'calzado' && (
                    <>
                      <td style={tdStyle}>{row.footLength}</td>
                      <td style={tdStyle}>{row.us}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* HOW TO MEASURE TIPS */}
        <div style={{ backgroundColor: '#FAFAFA', padding: '1rem 1.2rem', borderRadius: '8px', border: '1px solid #E4E4E7' }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.4rem', color: '#09090B' }}>¿CÓMO MEDIRTE?</h4>
          <ul style={{ fontSize: '0.8rem', color: '#71717A', paddingLeft: '1.2rem', lineHeight: 1.6 }}>
            <li><strong>Pecho:</strong> Pasa la cinta métrica por debajo de las axilas y sobre la parte más sobresaliente del tórax.</li>
            <li><strong>Cintura:</strong> Mide el contorno justo a la altura donde sueles usar el cinturón.</li>
            <li><strong>Largo de pie:</strong> Coloca el pie descalzo sobre una hoja de papel y mide desde el talón hasta el dedo más largo.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

const thStyle = {
  padding: '0.75rem',
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  color: '#09090B',
  textTransform: 'uppercase'
};

const tdStyle = {
  padding: '0.75rem',
  color: '#27272A'
};

export default SizeGuideModal;
