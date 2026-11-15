import React, { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/Header/Header';
import Footer from '../components/Footer/Footer';
import FitGuideModal from '../components/Modals/FitGuideModal';
import SizeGuideModal from '../components/Modals/SizeGuideModal';
import SizeRecommenderModal from '../components/Modals/SizeRecommenderModal';
import WhatsAppButton from '../components/Common/WhatsAppButton';
import MobileBottomBar from '../components/Navigation/MobileBottomBar';
import { useECommerceStore } from '../store/eCommerceStore';
import { useAuthStore } from '../store/authStore';
import { SkipToContent, useRouteFocus, MAIN_ID } from '../components/Common/RouteFocus';
import { focusIfLost } from '../utils/focusIfLost';

export const PublicLayout = () => {
  const { loadProducts, productsError, isLoadingProducts, loadSiteContent } = useECommerceStore();

  useEffect(() => {
    loadProducts();
    loadSiteContent();
  }, [loadProducts, loadSiteContent]);

  // M28: lista de deseos ligada a la cuenta (wishlist_items). Se sincroniza al cambiar la sesión y al volver a la
  // pestaña (cambios hechos desde otro dispositivo).
  const syncWishlist = useECommerceStore((s) => s.syncWishlist);
  const syncSession = useECommerceStore((s) => s.syncSession);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const authLoading = useAuthStore((s) => s.isLoading);
  useEffect(() => {
    if (authLoading) return undefined;
    syncSession(userId);
    syncWishlist(userId);
    if (!userId) return undefined;
    const onVisible = () => { if (document.visibilityState === 'visible') syncWishlist(userId); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, authLoading, syncWishlist, syncSession]);
  useRouteFocus();

  // Ejecución 157 (D135): al pulsar «Reintentar» el store limpia el error, así que el aviso (y el botón) se desmonta
  // mientras carga y el foco caía en <body>. Al terminar: si sigue fallando, el foco va al «Reintentar» nuevo; si
  // funcionó, al contenido principal. Solo si el foco se perdió (criterio D130–D134).
  const retryRef = useRef(null);
  const retryPending = useRef(false);
  useEffect(() => {
    if (isLoadingProducts || !retryPending.current) return;
    retryPending.current = false;
    focusIfLost([productsError ? retryRef.current : null, document.getElementById(MAIN_ID)]);
  }, [isLoadingProducts, productsError]);
  const retry = () => { retryPending.current = true; loadProducts(true); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#FFFFFF', paddingBottom: '40px' }}>
      <SkipToContent />
      <Header />
      <main id={MAIN_ID} tabIndex={-1} style={{ flex: 1, outline: 'none' }}>
        {productsError && (
          <div role="alert" style={{ backgroundColor: '#FEF2F2', color: '#991B1B', padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 600, fontSize: '0.9rem' }}>
            {productsError}{' '}
            <button ref={retryRef} onClick={retry} disabled={isLoadingProducts} style={{ textDecoration: 'underline', fontWeight: 800, color: '#991B1B' }}>
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
