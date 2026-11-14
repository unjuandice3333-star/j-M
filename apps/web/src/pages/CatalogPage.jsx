import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useLocation, Link } from 'react-router-dom';
import { Filter, SlidersHorizontal, X, ChevronDown, Check } from '../components/Common/icons';
import ProductCard from '../components/Product/ProductCard';
import { useECommerceStore } from '../store/eCommerceStore';
import { normalizeStyleLine } from '../utils/productUtils';
import { DialogPanel } from '../components/Common/DialogPanel';
import {
  PRICE_STEP, filterProducts, sortProducts, priceCeiling, sizeOptions, fitOptions, occasionOptions,
} from '../utils/catalogFilters';

export const CatalogPage = () => {
  const { category: urlCategory, styleLine: urlStyleLine } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { products, isLoadingProducts, productsError } = useECommerceStore();
  // M27: categorías de los productos reales de la BD (slug y nombre), no de una lista fija.
  const CATEGORIES = useMemo(() => [...new Map(products.filter((p) => p.category)
    .map((p) => [p.category, { id: p.category, slug: p.category, name: p.categoryName }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'es')), [products]);

  const querySearch = searchParams.get('q') || '';
  const queryOccasion = searchParams.get('ocasion') || '';

  // Filter States - Normalized canonical styleLine ('urbana' | 'elegante' | 'casual' | 'todas')
  const [selectedStyleLine, setSelectedStyleLine] = useState(() => normalizeStyleLine(urlStyleLine));
  const [selectedCategory, setSelectedCategory] = useState(urlCategory || 'todas');
  const [selectedFit, setSelectedFit] = useState('todos');
  const [selectedSize, setSelectedSize] = useState('todas');
  const [selectedOccasion, setSelectedOccasion] = useState(queryOccasion || 'todas');
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlyBestSeller, setOnlyBestSeller] = useState(false);
  const [onlySale, setOnlySale] = useState(false);
  // null = sin límite de precio (antes $400.000 fijo: ocultaba lo más caro sin avisar).
  const [maxPrice, setMaxPrice] = useState(null);
  const [sortBy, setSortBy] = useState('relevancia');

  // Mobile Drawer State
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Sync state dynamically whenever URL changes
  useEffect(() => {
    const path = location.pathname;

    if (urlStyleLine) {
      setSelectedStyleLine(normalizeStyleLine(urlStyleLine));
      setSelectedCategory('todas');
      setOnlyNew(false);
      setOnlyBestSeller(false);
      setOnlySale(false);
    } else if (path === '/nuevo') {
      setSelectedStyleLine('todas');
      setSelectedCategory('todas');
      setOnlyNew(true);
      setOnlyBestSeller(false);
      setOnlySale(false);
    } else if (path === '/mas-vendidos') {
      setSelectedStyleLine('todas');
      setSelectedCategory('todas');
      setOnlyNew(false);
      setOnlyBestSeller(true);
      setOnlySale(false);
    } else if (path === '/ofertas') {
      setSelectedStyleLine('todas');
      setSelectedCategory('todas');
      setOnlyNew(false);
      setOnlyBestSeller(false);
      setOnlySale(true);
    } else if (path === '/calzado') {
      setSelectedStyleLine('todas');
      setSelectedCategory('calzado');
      setOnlyNew(false);
      setOnlyBestSeller(false);
      setOnlySale(false);
    } else if (path === '/accesorios') {
      setSelectedStyleLine('todas');
      setSelectedCategory('accesorios');
      setOnlyNew(false);
      setOnlyBestSeller(false);
      setOnlySale(false);
    } else if (urlCategory) {
      setSelectedStyleLine('todas');
      setSelectedCategory(urlCategory);
      setOnlyNew(false);
      setOnlyBestSeller(false);
      setOnlySale(false);
    } else {
      setSelectedStyleLine('todas');
      setSelectedCategory('todas');
      setOnlyNew(false);
      setOnlyBestSeller(false);
      setOnlySale(false);
    }

    setSelectedOccasion(queryOccasion || 'todas');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname, urlCategory, urlStyleLine, queryOccasion]);

  // Dynamic Page Title
  const pageTitle = useMemo(() => {
    if (querySearch) return `BÚSQUEDA: "${querySearch}"`;
    const normalized = normalizeStyleLine(selectedStyleLine);
    if (normalized === 'urbana') return 'LÍNEA URBANA — STREETWEAR RELAJADO';
    if (normalized === 'elegante') return 'LÍNEA ELEGANTE — FORMAL & OFICINA';
    if (normalized === 'casual') return 'LÍNEA SMART CASUAL — ELEGANCIA & MEZCLILLA';
    const path = location.pathname;
    if (path === '/nuevo') return 'NOVEDADES Y NUEVA COLECCIÓN';
    if (path === '/mas-vendidos') return 'LOS MÁS VENDIDOS J&M';
    if (path === '/ofertas') return 'OFERTAS Y DESCUENTOS ESPECIALES';
    if (path === '/calzado') return 'CALZADO MASCULINO EN CUERO';
    if (path === '/accesorios') return 'ACCESORIOS MASCULINOS';
    if (path === '/colecciones') return 'COLECCIONES EXCLUSIVAS';
    if (selectedCategory !== 'todas') {
      const catObj = CATEGORIES.find((c) => c.slug === selectedCategory);
      return catObj ? catObj.name.toUpperCase() : selectedCategory.toUpperCase();
    }
    return 'CATÁLOGO DE MODA MASCULINA';
  }, [location.pathname, selectedCategory, selectedStyleLine, querySearch, CATEGORIES]);

  // Opciones de filtro derivadas de los productos activos reales.
  const activeProducts = useMemo(() => products.filter((p) => p.status === 'active'), [products]);
  const priceMax = useMemo(() => priceCeiling(activeProducts), [activeProducts]);
  const SIZES = useMemo(() => sizeOptions(activeProducts), [activeProducts]);
  const FITS = useMemo(() => fitOptions(activeProducts), [activeProducts]);
  const OCCASIONS = useMemo(() => {
    const list = occasionOptions(activeProducts);
    // Ocasión llegada por URL (p. ej. desde el inicio) aunque ningún producto la tenga: visible y deseleccionable.
    if (selectedOccasion !== 'todas' && !list.some((o) => o.slug === selectedOccasion)) {
      list.push({ slug: selectedOccasion, name: selectedOccasion.replace(/-/g, ' ') });
    }
    return list;
  }, [activeProducts, selectedOccasion]);
  const effectiveMaxPrice = maxPrice != null && maxPrice < priceMax ? maxPrice : null;

  const filteredProducts = useMemo(() => sortProducts(filterProducts(products, {
    query: querySearch, styleLine: selectedStyleLine, category: selectedCategory, fit: selectedFit,
    size: selectedSize, occasion: selectedOccasion, onlyNew, onlyBestSeller, onlySale, maxPrice: effectiveMaxPrice,
  }, normalizeStyleLine), sortBy), [products, selectedStyleLine, selectedCategory, selectedFit, selectedSize, selectedOccasion, onlyNew, onlyBestSeller, onlySale, effectiveMaxPrice, sortBy, querySearch]);

  const clearAllFilters = () => {
    setSelectedCategory('todas');
    setSelectedFit('todos');
    setSelectedSize('todas');
    setSelectedOccasion('todas');
    setOnlyNew(false);
    setOnlyBestSeller(false);
    setOnlySale(false);
    setMaxPrice(null);
  };

  const canonicalStyleLine = normalizeStyleLine(selectedStyleLine);

  const filterPanel = (
    <>
      {/* Línea de Estilo */}
      <div>
        <h4 style={filterSectionTitle}>LÍNEA DE ESTILO</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <button
            onClick={() => setSelectedStyleLine('todas')}
            style={filterOptionBtn(canonicalStyleLine === 'todas')}
          >
            Todas las líneas
          </button>
          <button
            onClick={() => setSelectedStyleLine('urbana')}
            style={filterOptionBtn(canonicalStyleLine === 'urbana')}
          >
            Línea Urbana
          </button>
          <button
            onClick={() => setSelectedStyleLine('elegante')}
            style={filterOptionBtn(canonicalStyleLine === 'elegante')}
          >
            Línea Elegante
          </button>
          <button
            onClick={() => setSelectedStyleLine('casual')}
            style={filterOptionBtn(canonicalStyleLine === 'casual')}
          >
            Línea Smart Casual
          </button>
        </div>
      </div>

      {/* Categorías */}
      <div>
        <h4 style={filterSectionTitle}>CATEGORÍA</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <button
            onClick={() => setSelectedCategory('todas')}
            style={filterOptionBtn(selectedCategory === 'todas')}
          >
            Todas las categorías
          </button>
          {CATEGORIES.map((cat) => {
            const countInContext = activeProducts.filter((p) =>
              p.category === cat.slug &&
              (canonicalStyleLine === 'todas' || normalizeStyleLine(p.styleLine) === canonicalStyleLine)
            ).length;

            // Hides categories with 0 items when a specific styleLine is active
            if (canonicalStyleLine !== 'todas' && countInContext === 0) {
              return null;
            }

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.slug)}
                style={filterOptionBtn(selectedCategory === cat.slug)}
              >
                {cat.name} ({countInContext})
              </button>
            );
          })}
        </div>
      </div>

      {/* Fit / Horma */}
      <div>
        <h4 style={filterSectionTitle}>FIT / HORMA</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {['todos', ...FITS].map((fit) => (
            <button
              key={fit}
              onClick={() => setSelectedFit(fit)}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                borderRadius: '4px',
                border: selectedFit === fit ? '1px solid #09090B' : '1px solid #E4E4E7',
                backgroundColor: selectedFit === fit ? '#09090B' : '#FFFFFF',
                color: selectedFit === fit ? '#FFFFFF' : '#09090B'
              }}
            >
              {fit}
            </button>
          ))}
        </div>
      </div>

      {/* Tallas */}
      <div>
        <h4 style={filterSectionTitle}>TALLA</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {['todas', ...SIZES].map((sz) => (
            <button
              key={sz}
              onClick={() => setSelectedSize(sz)}
              style={{
                padding: '0.35rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                borderRadius: '4px',
                border: selectedSize === sz ? '1px solid #09090B' : '1px solid #E4E4E7',
                backgroundColor: selectedSize === sz ? '#09090B' : '#FFFFFF',
                color: selectedSize === sz ? '#FFFFFF' : '#09090B'
              }}
            >
              {sz}
            </button>
          ))}
        </div>
      </div>

      {/* Ocasión */}
      <div>
        <h4 style={filterSectionTitle}>OCASIÓN</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <button
            onClick={() => setSelectedOccasion('todas')}
            style={filterOptionBtn(selectedOccasion === 'todas')}
          >
            Todas las ocasiones
          </button>
          {OCCASIONS.map((occ) => (
            <button
              key={occ.slug}
              onClick={() => setSelectedOccasion(occ.slug)}
              style={filterOptionBtn(selectedOccasion === occ.slug)}
            >
              {occ.name}
            </button>
          ))}
        </div>
      </div>

      {/* Precio Máximo */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <h4 style={filterSectionTitle}>PRECIO MÁXIMO</h4>
          <span style={{ fontSize: '0.8rem', fontWeight: 800 }} data-testid="catalog-max-price">
            {effectiveMaxPrice == null ? 'Sin límite' : `$${effectiveMaxPrice.toLocaleString('es-CO')}`}
          </span>
        </div>
        <input
          type="range"
          aria-label="Precio máximo"
          min={PRICE_STEP}
          max={priceMax}
          step={PRICE_STEP}
          value={effectiveMaxPrice ?? priceMax}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMaxPrice(v >= priceMax ? null : v);
          }}
          style={{ width: '100%', accentColor: '#09090B' }}
        />
      </div>
    </>
  );

  return (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '80vh', padding: '2.5rem 0 5rem 0' }}>
      <div className="jm-container">
        {/* BREADCRUMB */}
        <div className="jm-breadcrumb" style={{ fontSize: '0.8rem', color: '#71717A', marginBottom: '1.25rem' }}>
          <Link to="/" style={{ color: '#71717A' }}>Inicio</Link>
          <span style={{ margin: '0 0.4rem' }}>/</span>
          <Link to="/ropa" style={{ color: '#71717A' }}>Moda Masculina</Link>
          {selectedCategory !== 'todas' && (
            <>
              <span style={{ margin: '0 0.4rem' }}>/</span>
              <strong style={{ color: '#09090B', textTransform: 'capitalize' }}>{selectedCategory}</strong>
            </>
          )}
        </div>

        {/* HEADER TITLE & DESCRIPTION */}
        <div style={{ marginBottom: '2.5rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {pageTitle}
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#71717A', marginTop: '0.3rem' }}>
            MOSTRANDO {filteredProducts.length} PRENDAS • CONFECCIÓN PREMIUM J&M FASHION STORE
          </p>
        </div>

        {/* MAIN LAYOUT: SIDEBAR FILTERS + PRODUCT GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '2.5rem' }} className="catalog-grid-layout">
          {/* DESKTOP FILTERS SIDEBAR */}
          <aside className="desktop-filters" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>FILTROS</span>
              <button onClick={clearAllFilters} style={{ fontSize: '0.78rem', color: '#E11D48', fontWeight: 700 }}>
                Limpiar
              </button>
            </div>

            {filterPanel}
          </aside>

          {/* MAIN CATALOG CONTENT */}
          <div style={{ minWidth: 0 }}>
            {/* TOOLBAR: SORT & MOBILE FILTER TRIGGER */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.6rem 1rem',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem',
              backgroundColor: '#FAFAFA',
              padding: '0.85rem 1.2rem',
              borderRadius: '8px',
              border: '1px solid #E4E4E7'
            }}>
              {/* Mobile Filter Button */}
              <button
                onClick={() => setIsMobileFilterOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  minHeight: '36px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: '#09090B'
                }}
                className="mobile-filter-btn"
              >
                <SlidersHorizontal size={18} /> FILTRAR ({filteredProducts.length})
              </button>

              <span style={{ fontSize: '0.85rem', color: '#71717A', fontWeight: 600 }} className="desktop-only">
                Mostrando <strong>{filteredProducts.length}</strong> resultados
              </span>

              {/* Sort Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, maxWidth: '100%' }}>
                <label htmlFor="catalog-sort" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#52525B', whiteSpace: 'nowrap' }}>ORDENAR POR:</label>
                <select
                  id="catalog-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    padding: '0.4rem 0.8rem',
                    border: '1px solid #D4D4D8',
                    borderRadius: '4px',
                    backgroundColor: '#FFFFFF',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    outline: 'none',
                    minWidth: 0,
                    maxWidth: '100%',
                    flex: '0 1 auto'
                  }}
                >
                  <option value="relevancia">Relevancia</option>
                  <option value="mas-vendidos">Más Vendidos</option>
                  <option value="nuevos">Más Nuevos</option>
                  <option value="precio-asc">Precio: Menor a Mayor</option>
                  <option value="precio-desc">Precio: Mayor a Menor</option>
                  <option value="mejor-valorados">Mejor Valorados</option>
                </select>
              </div>
            </div>

            {/* PRODUCT GRID */}
            {isLoadingProducts && products.length === 0 ? (
              <div role="status" style={{ textAlign: 'center', padding: '4rem 1rem', color: '#71717A' }}>Cargando productos…</div>
            ) : productsError && products.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#991B1B', fontWeight: 600 }}>El catálogo no está disponible en este momento.</div>
            ) : filteredProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 1rem', border: '1px dashed #D4D4D8', borderRadius: '12px' }}>
                <Filter size={40} color="#A1A1AA" style={{ margin: '0 auto 1rem auto' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#09090B', marginBottom: '0.4rem' }}>
                  No encontramos productos con esos filtros
                </h3>
                <p style={{ fontSize: '0.88rem', color: '#71717A', marginBottom: '1.5rem' }}>
                  Prueba modificando la categoría, ajustando el precio o seleccionando otra talla.
                </p>
                <button
                  onClick={clearAllFilters}
                  style={{
                    backgroundColor: '#09090B',
                    color: '#FFFFFF',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.85rem'
                  }}
                >
                  LIMPIAR TODOS LOS FILTROS
                </button>
              </div>
            ) : (
              <div className="catalog-products-responsive-grid">
                {filteredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE FILTERS DRAWER */}
      {isMobileFilterOpen && (
        <div className="modal-overlay" style={{ justifyContent: 'flex-start', padding: 0 }} onClick={() => setIsMobileFilterOpen(false)}>
          <DialogPanel onClose={() => setIsMobileFilterOpen(false)} aria-label="Filtros"
            className="jm-tap-area"
            style={{
              width: '85%',
              maxWidth: '340px',
              height: '100%',
              backgroundColor: '#FFFFFF',
              padding: '1.5rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>FILTROS</span>
              <button type="button" aria-label="Cerrar filtros" onClick={() => setIsMobileFilterOpen(false)} style={{ minWidth: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={22} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
              <button type="button" onClick={clearAllFilters} style={{ alignSelf: 'flex-start', fontSize: '0.78rem', color: '#E11D48', fontWeight: 700 }}>
                Limpiar filtros
              </button>
              {filterPanel}
            </div>

            <button
              onClick={() => setIsMobileFilterOpen(false)}
              style={{
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                padding: '0.9rem',
                borderRadius: '6px',
                fontWeight: 700,
                marginTop: '1.5rem'
              }}
            >
              VER RESULTADOS ({filteredProducts.length})
            </button>
          </DialogPanel>
        </div>
      )}

      {/* Embedded Breakpoint CSS for Responsive Grid: 4 col desktop, 3 tablet, 2 mobile */}
      <style>{`
        .catalog-products-responsive-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1.25rem;
        }
        /* minmax(0, 1fr) y min-width: 0: una tarjeta con contenido largo no ensancha la columna ni desborda en móvil */
        .catalog-products-responsive-grid > * { min-width: 0; }

        @media (max-width: 1200px) {
          .catalog-products-responsive-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .catalog-grid-layout { grid-template-columns: minmax(0, 1fr) !important; }
          .desktop-filters { display: none !important; }
          .desktop-only { display: none !important; }
        }

        @media (max-width: 640px) {
          .catalog-products-responsive-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.75rem;
          }
        }

        @media (min-width: 901px) {
          .mobile-filter-btn { display: none !important; }
        }
      `}</style>
    </div>
  );
};

const filterSectionTitle = {
  fontSize: '0.78rem',
  fontWeight: 800,
  letterSpacing: '0.1em',
  color: '#09090B',
  marginBottom: '0.75rem',
  textTransform: 'uppercase'
};

const filterOptionBtn = (isSelected) => ({
  textAlign: 'left',
  padding: '0.4rem 0.6rem',
  fontSize: '0.85rem',
  fontWeight: isSelected ? 700 : 500,
  color: isSelected ? '#09090B' : '#71717A',
  backgroundColor: isSelected ? '#FAFAFA' : 'transparent',
  borderRadius: '4px',
  transition: 'all 0.15s'
});

export default CatalogPage;
