import React from 'react';
import { FolderKanban, Plus, Edit, Eye, Sparkles } from 'lucide-react';
import { OCCASIONS } from '../../data/mockData';

export const AdminCollectionsPage = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
            COLECCIONES & COMPRA POR OCASIÓN ({OCCASIONS.length})
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
            Organiza las agrupaciones temáticas y portadas editoriales de la página de inicio.
          </p>
        </div>

        <button
          style={{
            backgroundColor: '#09090B',
            color: '#FFFFFF',
            padding: '0.85rem 1.4rem',
            borderRadius: '6px',
            fontWeight: 800,
            fontSize: '0.85rem',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer'
          }}
        >
          <Plus size={18} /> NUEVA COLECCIÓN
        </button>
      </div>

      {/* COLLECTIONS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {OCCASIONS.map((occ) => (
          <div key={occ.id} style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: '160px', position: 'relative' }}>
              <img src={occ.image} alt={occ.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(9,9,11,0.8) 0%, transparent 60%)' }} />
              <span style={{ position: 'absolute', bottom: '12px', left: '12px', color: '#FFFFFF', fontWeight: 900, fontSize: '1.1rem', textTransform: 'uppercase' }}>
                {occ.name}
              </span>
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
              <p style={{ fontSize: '0.85rem', color: '#71717A' }}>{occ.subtitle}</p>

              <div style={{ marginTop: 'auto', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F4F4F5' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, backgroundColor: '#FAFAFA', border: '1px solid #E4E4E7', padding: '3px 8px', borderRadius: '4px' }}>
                  ACTIVA EN HOME
                </span>

                <button style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7', padding: '0.4rem 0.8rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Edit size={14} /> Editar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminCollectionsPage;
