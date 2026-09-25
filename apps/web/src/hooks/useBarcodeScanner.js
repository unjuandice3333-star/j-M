import { useEffect, useRef } from 'react';

/**
 * Hook universal para escuchar escáneres de códigos de barras (USB / Bluetooth).
 * Los escáneres físicos simulan un teclado de alta velocidad terminando con la tecla 'Enter'.
 * 
 * @param {Function} onScan - Callback ejecutado al leer un código válido.
 * @param {Object} options - Parámetros de sensibilidad de lectura.
 */
export function useBarcodeScanner(onScan, options = {}) {
  const { threshold = 40, minLength = 6 } = options;
  const bufferRef = useRef([]);
  const lastKeyTimeRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      // Si el tiempo entre teclas es muy grande, vaciamos el búfer (indica tecleo manual)
      if (timeDiff > threshold && bufferRef.current.length > 0) {
        bufferRef.current = [];
      }

      // Si es Enter y el buffer tiene longitud suficiente, disparamos el callback
      if (e.key === 'Enter') {
        if (bufferRef.current.length >= minLength) {
          const barcode = bufferRef.current.join('');
          onScan(barcode);
          e.preventDefault();
          e.stopPropagation();
        }
        bufferRef.current = [];
        return;
      }

      // Evitamos capturar teclas especiales de control
      if (e.key.length === 1) {
        bufferRef.current.push(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onScan, threshold, minLength]);
}

export default useBarcodeScanner;
