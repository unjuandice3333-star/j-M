import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/Header/Header';
import Footer from '../components/Footer/Footer';
import FitGuideModal from '../components/Modals/FitGuideModal';
import SizeGuideModal from '../components/Modals/SizeGuideModal';
import SizeRecommenderModal from '../components/Modals/SizeRecommenderModal';
import WhatsAppButton from '../components/Common/WhatsAppButton';

export const PublicLayout = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#FFFFFF' }}>
      <Header />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />

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
