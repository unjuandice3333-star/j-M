import React, { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AuthGuard from './AuthGuard.jsx';
import DashboardLayout from '../layouts/DashboardLayout.jsx';
import PublicLayout from '../layouts/PublicLayout.jsx';
import AdminLayout from '../layouts/AdminLayout.jsx';
import { useAuthStore } from '../store/authStore.js';

// Lazy loading Public Pages
const HomePage = lazy(() => import('../pages/HomePage.jsx'));
const CatalogPage = lazy(() => import('../pages/CatalogPage.jsx'));
const ProductDetailPage = lazy(() => import('../pages/ProductDetailPage.jsx'));
const CartPage = lazy(() => import('../pages/CartPage.jsx'));
const CheckoutPage = lazy(() => import('../pages/CheckoutPage.jsx'));
const OrderConfirmationPage = lazy(() => import('../pages/OrderConfirmationPage.jsx'));
const AccountPage = lazy(() => import('../pages/AccountPage.jsx'));
const WishlistPage = lazy(() => import('../pages/WishlistPage.jsx'));

// Lazy loading Admin Pages (Phase 3 & Phase 4)
const AdminDashboardPage = lazy(() => import('../pages/admin/AdminDashboardPage.jsx'));
const AdminProductsPage = lazy(() => import('../pages/admin/AdminProductsPage.jsx'));
const AdminProductFormPage = lazy(() => import('../pages/admin/AdminProductFormPage.jsx'));
const AdminInventoryPage = lazy(() => import('../pages/admin/AdminInventoryPage.jsx'));
const AdminOrdersPage = lazy(() => import('../pages/admin/AdminOrdersPage.jsx'));
const AdminCustomersPage = lazy(() => import('../pages/admin/AdminCustomersPage.jsx'));
const AdminDiscountsPage = lazy(() => import('../pages/admin/AdminDiscountsPage.jsx'));
const AdminReviewsPage = lazy(() => import('../pages/admin/AdminReviewsPage.jsx'));
const AdminAnalyticsPage = lazy(() => import('../pages/admin/AdminAnalyticsPage.jsx'));
const AdminCollectionsPage = lazy(() => import('../pages/admin/AdminCollectionsPage.jsx'));

// Admin / POS auth pages
const Login = lazy(() => import('../pages/Login.jsx'));
const POS = lazy(() => import('../pages/POS.jsx'));
const Unauthorized = lazy(() => import('../pages/Unauthorized.jsx'));

// Spinner placeholder for Suspense boundaries
const LoadingScreen = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 500
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      border: '4px solid var(--border)',
      borderBottomColor: 'var(--foreground)',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }}></div>
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

export const AppRoutes = () => {
  const { checkSession } = useAuthStore();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* PUBLIC E-COMMERCE ROUTES */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/nuevo" element={<CatalogPage />} />
          <Route path="/ropa" element={<CatalogPage />} />
          <Route path="/ropa/:category" element={<CatalogPage />} />
          <Route path="/calzado" element={<CatalogPage />} />
          <Route path="/accesorios" element={<CatalogPage />} />
          <Route path="/mas-vendidos" element={<CatalogPage />} />
          <Route path="/ofertas" element={<CatalogPage />} />
          <Route path="/colecciones" element={<CatalogPage />} />
          <Route path="/buscar" element={<CatalogPage />} />
          <Route path="/producto/:slug" element={<ProductDetailPage />} />
          <Route path="/guia-de-tallas" element={<CatalogPage />} />
          <Route path="/carrito" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/checkout/confirmacion" element={<OrderConfirmationPage />} />
          <Route path="/cuenta" element={<Navigate to="/" replace />} />
          <Route path="/cuenta/*" element={<Navigate to="/" replace />} />
          <Route path="/favoritos" element={<WishlistPage />} />
        </Route>

        {/* ADMIN DASHBOARD ROUTES (PHASE 3 & PHASE 4) */}
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/productos" element={<AdminProductsPage />} />
          <Route path="/admin/productos/nuevo" element={<AdminProductFormPage />} />
          <Route path="/admin/inventario" element={<AdminInventoryPage />} />
          <Route path="/admin/pedidos" element={<AdminOrdersPage />} />
          <Route path="/admin/clientes" element={<AdminCustomersPage />} />
          <Route path="/admin/colecciones" element={<AdminCollectionsPage />} />
          <Route path="/admin/descuentos" element={<AdminDiscountsPage />} />
          <Route path="/admin/reviews" element={<AdminReviewsPage />} />
          <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
          <Route path="/admin/configuracion" element={<AdminDashboardPage />} />
        </Route>

        {/* AUTH & POS ROUTES */}
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/pos" element={<POS />} />

        {/* Catch-all route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
