import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useLocation, Link } from 'react-router-dom';
import { Filter, SlidersHorizontal, X, ChevronDown, Check } from 'lucide-react';
import { CATEGORIES, OCCASIONS } from '../data/mockData';
import ProductCard from '../components/Product/ProductCard';
import { useECommerceStore } from '../store/eCommerceStore';

export const CatalogPage = () => {
  const { category: urlCategory } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { products } = useECommerceStore();

  const querySearch = searchParams.get('q') || '';
  const queryOccasion = searchParams.get('ocasion') || '';

  // Filter States
  const [selectedCategory, setSelectedCategory] = useState(urlCategory || 'todas');
  const [selectedFit, setSelectedFit] = useState('todos');
  const [selectedSize, setSelectedSize] = useState('todas');
  const [selectedOccasion, setSelectedOccasion] = useState(queryOccasion || 'todas');
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlyBestSeller, setOnlyBestSeller] = useState(false);
  const [onlySale, setOnlySale] = useState(false);
  const [maxPrice, setMaxPrice] = useState(400000);
  const [sortBy, setSortBy] = useState('relevancia');

  // Mobile Drawer State
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Sync state dynamically whenever URL changes
  useEffect(() => {
    const path = location.pathname;

    if (path === '/nuevo') {
      setSelectedCategory('todas');
      setOnlyNew(true);
      setOnlyBestSeller(false);
      setOnlySale(false);
    } else if (path === '/mas-vendidos') {
      setSelectedCategory('todas');
      setOnlyNew(false);
      setOnlyBestSeller(true);
      setOnlySale(false);
    } else if (path === '/ofertas') {
      setSelectedCategory('todas');
      setOnlyNew(false);
      setOnlyBestSeller(false);
      setOnlySale(true);
    } else if (path === '/calzado') {
      setSelectedCategory('calzado');
      setOnlyNew(false);
      setOnlyBestSeller(false);
      setOnlySale(false);
    } else if (path === '/accesorios') {
      setSelectedCategory('accesorios');
      setOnlyNew(false);
      setOnlyBestSeller(false);
      setOnlySale(false);
    } else if (urlCategory) {
      setSelectedCategory(urlCategory);
      setOnlyNew(false);
      setOnlyBestSeller(false);
      setOnlySale(false);
    } else {
      setSelectedCategory('todas');
      setOnlyNew(false);
      setOnlyBestSeller(false);
      setOnlySale(false);
    }

    setSelectedOccasion(queryOccasion || 'todas');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname, urlCategory, queryOccasion]);

  // Dynamic Page Title
  const pageTitle = useMemo(() => {
    if (querySearch) return `BÚSQUEDA: "${querySearch}"`;
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
  }, [location.pathname, selectedCategory, querySearch]);

  // Filter and Sort Logic
  const filteredProducts = useMemo(() => {
    const activeProducts = products.filter((p) => p.status !== 'borrador' && p.status !== 'archivado');

    return activeProducts.filter((p) => {
      // Search query
      if (querySearch && !p.name.toLowerCase().includes(querySearch.toLowerCase()) && !p.category?.toLowerCase().includes(querySearch.toLowerCase())) {
        return false;
      }
      // Section filters (Nuevo, Mas vendidos, Ofertas)
      if (onlyNew && !p.isNew) return false;
      if (onlyBestSeller && !p.isBestSeller) return false;
      if (onlySale && (!p.isSale || p.discountPercent <= 0)) return false;

      // Category Filter
      if (selectedCategory !== 'todas' && p.category !== selectedCategory) {
        return false;
      }
      // Fit Filter
      if (selectedFit !== 'todos' && p.fit !== selectedFit) {
        return false;
      }
      // Size Filter
      if (selectedSize !== 'todas' && !p.sizes?.includes(selectedSize)) {
        return false;
      }
      // Occasion Filter
      if (selectedOccasion !== 'todas' && p.occasion !== selectedOccasion) {
        return false;
      }
      // Max Price Filter
      if (p.price > maxPrice) {
        return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'precio-asc') return a.price - b.price;
      if (sortBy === 'precio-desc') return b.price - a.price;
      if (sortBy === 'mas-vendidos') return (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0);
      if (sortBy === 'mejor-valorados') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'nuevos') return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
      return 0;
    });
  }, [products, selectedCategory, selectedFit, selectedSize, selectedOccasion, onlyNew, onlyBestSeller, onlySale, maxPrice, sortBy, querySearch]);

  const clearAllFilters = () => {
    setSelectedCategory('todas');
    setSelectedFit('todos');
    setSelectedSize('todas');
    setSelectedOccasion('todas');
    setOnlyNew(false);
    setOnlyBestSeller(false);
    setOnlySale(false);
    setMaxPrice(400000);
  };

  return (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '80vh', padding: '2.5rem 0 5rem 0' }}>
      <div className="jm-container">
        {/* BREADCRUMB */}
        <div style={{ fontSize: '0.8rem', color: '#71717A', marginBottom: '1.25rem' }}>
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
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.slug)}
                    style={filterOptionBtn(selectedCategory === cat.slug)}
                  >
                    {cat.name} ({products.filter((p) => p.category === cat.slug && p.status !== 'borrador').length})
                  </button>
                ))}
              </div>
            </div>

            {/* Fit / Horma */}
            <div>
              <h4 style={filterSectionTitle}>FIT / HORMA</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {['todos', 'SLIM', 'REGULAR', 'RELAXED', 'OVERSIZE'].map((fit) => (
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
                {['todas', 'S', 'M', 'L', 'XL', 'XXL', '30', '32', '34', '36', '38', '39', '40', '41', '42'].map((sz) => (
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
                    key={occ.id}
                    onClick={() => setSelectedOccasion(occ.id)}
                    style={filterOptionBtn(selectedOccasion === occ.id)}
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
                <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>${maxPrice.toLocaleString('es-CO')}</span>
              </div>
              <input
                type="range"
                min="50000"
                max="400000"
                step="10000"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#09090B' }}
              />
            </div>
          </aside>

          {/* MAIN CATALOG CONTENT */}
          <div>
            {/* TOOLBAR: SORT & MOBILE FILTER TRIGGER */}
            <div style={{
              display: 'flex',
              justify: 'space-between',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#71717A' }}>ORDENAR POR:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    padding: '0.4rem 0.8rem',
                    border: '1px solid #D4D4D8',
                    borderRadius: '4px',
                    backgroundColor: '#FFFFFF',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    outline: 'none'
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
            {filteredProducts.length === 0 ? (
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
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '1.5rem'
              }}>
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
          <div
            onClick={(e) => e.stopPropagation()}
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
              <button onClick={() => setIsMobileFilterOpen(false)}>
                <X size={22} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
              {/* Category */}
              <div>
                <h4 style={filterSectionTitle}>CATEGORÍA</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => { setSelectedCategory(cat.slug); setIsMobileFilterOpen(false); }}
                      style={filterOptionBtn(selectedCategory === cat.slug)}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
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
          </div>
        </div>
      )}

      {/* Embedded Breakpoint CSS */}
      <style>{`
        @media (max-width: 900px) {
          .catalog-grid-layout { grid-template-columns: 1fr !important; }
          .desktop-filters { display: none !important; }
          .desktop-only { display: none !important; }
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
