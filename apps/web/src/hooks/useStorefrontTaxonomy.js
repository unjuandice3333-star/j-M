import { useEffect, useState } from 'react';
import productService from '../services/productService';

// Una sola lectura por carga de la app, compartida entre montajes de la portada.
let cache = null;
let inflight = null;

/** Filas de `categories`/`style_lines`/`occasions`; `taxonomy` es null mientras carga o si la BD falló. */
export function useStorefrontTaxonomy() {
  const [state, setState] = useState(() => ({ taxonomy: cache, error: null }));
  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    inflight = inflight ?? productService.getStorefrontTaxonomy();
    inflight.then((data) => { cache = data; if (alive) setState({ taxonomy: data, error: null }); })
      .catch((error) => {
        inflight = null; // permite reintentar en el siguiente montaje
        console.warn('[home] secciones desde la BD no disponibles; se usa el respaldo del diseño', error?.cause ?? error);
        if (alive) setState({ taxonomy: null, error });
      });
    return () => { alive = false; };
  }, []);
  return state;
}

/** Solo para pruebas. */
export function __resetStorefrontTaxonomyCache() { cache = null; inflight = null; }
