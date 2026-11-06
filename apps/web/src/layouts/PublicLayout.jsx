import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/Header/Header';
import Footer from '../components/Footer/Footer';
import FitGuideModal from '../components/Modals/FitGuideModal';
import SizeGuideModal from '../components/Modals/SizeGuideModal';
import SizeRecommenderModal from '../components/Modals/SizeRecommenderModal';
import WhatsAppButton from '../components/Common/WhatsAppButton';
import MobileBottomBar from '../components/Navigation/MobileBottomBar';
import { useECommerceStore } from '../store/eCommerceStore';

export const PublicLayout = () => {
  const { loadProducts, productsError, isLoadingProducts } = useECommerceStore();

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#FFFFFF', paddingBottom: '40px' }}>
      <Header />
      <main style={{ flex: 1 }}>
        {productsError && (
          <div role="alert" style={{ backgroundColor: '#FEF2F2', color: '#991B1B', padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 600, fontSize: '0.9rem' }}>
            {productsError}{' '}
            <button onClick={() => loadProducts(true)} disabled={isLoadingProducts} style={{ textDecoration: 'underline', fontWeight: 800, color: '#991B1B' }}>
              {isLoadingProducts ? 'Reintentando…' : 'Reintentar'}
            </button>
          </div>
        )}
        <Outlet />
      </main>
      <Footer />

      {/* Mobile Sticky Navigation */}
      <MobileBottomBar />

      {/* Global eCommerce Modals */}
      <FitGuideModal />
      <SizeGuideModal />
      <SizeRecommenderModal />

      {/* Floating WhatsApp Button */}
      <WhatsAppButton />
    </div>
  );
};

export default PublicLayout;
