import React from 'react';
import { isOneSize } from '../../utils/sizeAdvice';
import { colorsInStock, sizesForColor, changeLookColor } from '../../utils/lookSelection';

const selectStyle = {
  padding: '0.35rem 0.5rem', border: '1px solid #D4D4D8', borderRadius: '5px', fontSize: '0.75rem',
  fontWeight: 600, color: '#09090B', backgroundColor: '#FFFFFF', minWidth: 0, maxWidth: '100%',
};

// Selectores de color y talla de una prenda (look completo, lista de deseos). Solo tallas con stock en el color elegido son elegibles.
export function VariantPicker({ product, selection, onChange }) {
  const colors = colorsInStock(product);
  if (colors.length === 0) {
    return <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#B91C1C', marginTop: '0.35rem' }}>Agotado</div>;
  }
  const sizes = sizesForColor(product, selection.color);
  const stop = (e) => e.stopPropagation();
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }} onClick={stop}>
      {colors.length > 1 ? (
        <select aria-label={`Color de ${product.name}`} value={selection.color ?? ''} className="jm-tap" style={selectStyle}
          onChange={(e) => onChange(changeLookColor(product, selection, e.target.value))}>
          {colors.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : (
        <span style={{ fontSize: '0.75rem', color: '#71717A', alignSelf: 'center' }}>Color: {selection.color}</span>
      )}
      {isOneSize(product) ? (
        <span style={{ fontSize: '0.75rem', color: '#71717A', alignSelf: 'center' }}>Talla única</span>
      ) : (
        <select aria-label={`Talla de ${product.name}`} value={selection.size ?? ''} className="jm-tap" style={selectStyle}
          onChange={(e) => onChange({ color: selection.color, size: e.target.value || null })}>
          <option value="">Elige talla</option>
          {sizes.map(({ size, available }) => (
            <option key={size} value={size} disabled={available <= 0}>{available > 0 ? size : `${size} (agotada)`}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export default VariantPicker;
