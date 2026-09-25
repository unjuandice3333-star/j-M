import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { User, Package, Heart, MapPin, Settings, CheckCircle2, Truck, Plus, Save, LogOut } from 'lucide-react';
import { useECommerceStore } from '../store/eCommerceStore';
import { PRODUCTS, formatCOP } from '../data/mockData';
import ProductCard from '../components/Product/ProductCard';

export const AccountPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'pedidos'; // 'pedidos' | 'favoritos' | 'datos' | 'direcciones'

  const {
    isCustomerLoggedIn,
    customerUser,
    loginWithGoogle,
    loginWithCustomerEmail,
    customerLogout,
    userProfile,
    updateProfile,
    savedAddresses,
    addAddress,
    orders,
    wishlist,
    moveWishlistToCart
  } = useECommerceStore();

  useEffect(() => {
    try {
      const activeSession = sessionStorage.getItem('jm_customer_session');
      if (!activeSession && isCustomerLoggedIn) {
        customerLogout();
      }
    } catch (e) {}
  }, []);

  const [inputEmail, setInputEmail] = useState('');
  const [inputName, setInputName] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // Google Account Picker Modal State
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [customGoogleName, setCustomGoogleName] = useState('');
  const [isCustomGoogleMode, setIsCustomGoogleMode] = useState(false);

  // Google OAuth real integration with GSI (Google Identity Services)
  useEffect(() => {
    /* global google */
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: '956359117844-bsni44cn83dldpearikrb19dh9gau8qk.apps.googleusercontent.com',
          callback: (response) => {
            if (response.credential) {
              try {
                // Decode JWT Payload from real Google Token
                const base64Url = response.credential.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
                const payload = JSON.parse(jsonPayload);
                loginWithGoogle(payload.email, payload.name, payload.picture);
              } catch (err) {
                console.error('JWT Decode Error:', err);
              }
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true
        });
      } catch (err) {
        console.warn('GSI client init error:', err);
      }
    }
  }, [loginWithGoogle]);

  const triggerRealGoogleLogin = () => {
    if (window.google?.accounts?.id) {
      try {
        // Trigger native Google One-Tap / Popup login window
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setShowGoogleModal(true);
          }
        });
      } catch (e) {
        setShowGoogleModal(true);
      }
    } else {
      setShowGoogleModal(true);
    }
  };

  const handleSelectGoogleAccount = (email, name) => {
    loginWithGoogle(email, name);
    setShowGoogleModal(false);
    setIsCustomGoogleMode(false);
  };

  // Profile Form State
  const [profileData, setProfileData] = useState({
    name: userProfile.name,
    email: userProfile.email,
    phone: userProfile.phone,
    preferredSize: userProfile.preferredSize,
    preferredFit: userProfile.preferredFit
  });
  const [profileSaved, setProfileSaved] = useState(false);

  // Address Form State
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddr, setNewAddr] = useState({
    name: 'Casa',
    department: 'Cundinamarca',
    city: 'Bogotá D.C.',
    address: '',
    neighborhood: '',
    notes: ''
  });

  const handleSaveProfile = (e) => {
    e.preventDefault();
    updateProfile(profileData);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };

  const handleAddAddressSubmit = (e) => {
    e.preventDefault();
    if (newAddr.address && newAddr.city) {
      addAddress(newAddr);
      setShowAddAddress(false);
      setNewAddr({ name: 'Casa', department: 'Cundinamarca', city: '', address: '', neighborhood: '', notes: '' });
    }
  };

  const handleEmailAuthSubmit = (e) => {
    e.preventDefault();
    if (inputEmail) {
      loginWithCustomerEmail(inputEmail, inputName);
    }
  };

  const handleLogout = () => {
    customerLogout();
    try {
      localStorage.clear();
    } catch (e) {}
    window.location.reload();
  };

  const { products } = useECommerceStore();
  const wishlistProducts = products.filter((p) => wishlist.includes(p.id));

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
      <div className="jm-container">
        {/* SHOPIFY-STYLE ACCOUNT LOGIN / REGISTER CARD */}
        {!isCustomerLoggedIn ? (
          <div style={{ maxWidth: '440px', margin: '2rem auto', border: '1px solid #E4E4E7', borderRadius: '24px', padding: '2.5rem 2rem', backgroundColor: '#FFFFFF', boxShadow: '0 12px 36px rgba(0,0,0,0.06)' }}>
            <div style={{ textAlign: 'left', marginBottom: '1.75rem' }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#09090B', letterSpacing: '-0.02em' }}>
                {isRegisterMode ? 'Crear cuenta' : 'Iniciar sesión'}
              </h2>
              <p style={{ fontSize: '0.88rem', color: '#71717A', marginTop: '0.25rem' }}>
                Continuar con <strong>J&M Fashion Store</strong>
              </p>
            </div>

            <form onSubmit={handleEmailAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {isRegisterMode && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.4rem' }}>Nombre completo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Alejandro Morales"
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    style={{ width: '100%', padding: '0.85rem 1rem', border: '1.5px solid #2563EB', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.4rem' }}>Correo electrónico</label>
                <input
                  type="email"
                  required
                  placeholder="ejemplo@correo.com"
                  value={inputEmail}
                  onChange={(e) => setInputEmail(e.target.value)}
                  style={{ width: '100%', padding: '0.85rem 1rem', border: '1.5px solid #2563EB', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.4rem' }}>Contraseña</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '0.85rem 1rem', border: '1px solid #D4D4D8', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>

              <button
                type="submit"
                style={{
                  backgroundColor: '#E4E4E7',
                  color: '#71717A',
                  padding: '0.88rem',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: '0.25rem',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#09090B'; e.currentTarget.style.color = '#FFFFFF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#E4E4E7'; e.currentTarget.style.color = '#71717A'; }}
              >
                {isRegisterMode ? 'Crear cuenta con correo' : 'Continuar con el correo electrónico'}
              </button>
            </form>

            {/* DIVIDER WITH "o" */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.5rem 0' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#E4E4E7' }} />
              <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 500 }}>o</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#E4E4E7' }} />
            </div>



            {/* GOOGLE SINGLE PROMINENT BUTTON */}
            <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
              <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#2563EB', color: '#FFFFFF', fontSize: '0.62rem', fontWeight: 700, padding: '1px 8px', borderRadius: '4px', whiteSpace: 'nowrap', zIndex: 2 }}>
                Último uso
              </span>
              <button
                type="button"
                onClick={triggerRealGoogleLogin}
                title="Continuar con Google"
                style={{
                  width: '100%',
                  height: '48px',
                  border: '1px solid #E4E4E7',
                  borderRadius: '8px',
                  backgroundColor: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  color: '#09090B',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Continuar con Google
              </button>
            </div>

            {/* SWITCH REGISTER / LOGIN LINK */}
            <div style={{ textAlign: 'left', fontSize: '0.85rem', color: '#71717A' }}>
              {isRegisterMode ? '¿Ya tienes una cuenta? ' : '¿Eres nuevo en J&M? '}
              <button
                type="button"
                onClick={() => setIsRegisterMode(!isRegisterMode)}
                style={{ border: 'none', background: 'none', fontWeight: 700, color: '#2563EB', cursor: 'pointer' }}
              >
                {isRegisterMode ? 'Inicia sesión →' : 'Empieza →'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* UNMISSABLE TOP LOGOUT BANNER */}
            <div style={{ backgroundColor: '#FFF1F2', border: '1px solid #FECDD3', padding: '1rem 1.5rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <span style={{ fontSize: '0.88rem', color: '#9F1239', fontWeight: 700 }}>
                Sesión activa como: <strong>{customerUser?.email || userProfile.email}</strong>. Cierra sesión para registrarte o ingresar con Google.
              </span>
              <button
                onClick={handleLogout}
                style={{ backgroundColor: '#E11D48', color: '#FFFFFF', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 2px 6px rgba(225,29,72,0.2)' }}
              >
                <LogOut size={16} /> CERRAR SESIÓN AHORA
              </button>
            </div>
            {/* ACCOUNT HEADER */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {customerUser?.avatar ? (
                  <img src={customerUser.avatar} alt="" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#09090B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.4rem' }}>
                    {userProfile.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
                    MI CUENTA J&M
                  </h1>
                  <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
                    Bienvenido de nuevo, <strong>{customerUser?.name || userProfile.name}</strong> - {customerUser?.email || userProfile.email}
                  </p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.6rem 1rem',
                  border: '1px solid #E4E4E7',
                  borderRadius: '6px',
                  backgroundColor: '#FFFFFF',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#E11D48',
                  cursor: 'pointer'
                }}
              >
                <LogOut size={16} /> Cerrar Sesión
              </button>
            </div>

            {/* ACCOUNT NAVIGATION TABS */}
            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '3rem' }} className="account-layout">
          {/* SIDEBAR TABS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <button
              onClick={() => setSearchParams({ tab: 'pedidos' })}
              style={accountTabBtn(activeTab === 'pedidos')}
            >
              <Package size={18} /> Mis Pedidos ({orders.length})
            </button>
            <button
              onClick={() => setSearchParams({ tab: 'favoritos' })}
              style={accountTabBtn(activeTab === 'favoritos')}
            >
              <Heart size={18} /> Favoritos ({wishlist.length})
            </button>
            <button
              onClick={() => setSearchParams({ tab: 'datos' })}
              style={accountTabBtn(activeTab === 'datos')}
            >
              <User size={18} /> Mis Datos Personales
            </button>
            <button
              onClick={() => setSearchParams({ tab: 'direcciones' })}
              style={accountTabBtn(activeTab === 'direcciones')}
            >
              <MapPin size={18} /> Mis Direcciones ({savedAddresses.length})
            </button>
            <button
              onClick={handleLogout}
              style={{
                ...accountTabBtn(false),
                color: '#E11D48',
                backgroundColor: '#FFF1F2',
                border: '1px solid #FECDD3',
                marginTop: '1rem',
                cursor: 'pointer'
              }}
            >
              <LogOut size={18} /> Cerrar Sesión
            </button>
          </div>

          {/* MAIN CONTENT PANEL */}
          <div>
            {/* 1. ORDERS TAB */}
            {activeTab === 'pedidos' && (
              <div>
                <h2 style={panelTitleStyle}>HISTORIAL DE PEDIDOS</h2>
                {orders.length === 0 ? (
                  <p style={{ color: '#71717A' }}>Aún no has realizado pedidos con J&M Fashion Store.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {orders.map((ord) => (
                      <div key={ord.id} style={{ border: '1px solid #E4E4E7', borderRadius: '10px', padding: '1.5rem', backgroundColor: '#FAFAFA' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '0.75rem' }}>
                          <div>
                            <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#09090B' }}>ORDEN #{ord.id}</span>
                            <span style={{ fontSize: '0.8rem', color: '#71717A', marginLeft: '0.8rem' }}>{ord.date}</span>
                          </div>
                          <span style={{
                            backgroundColor: ord.status === 'Entregado' ? '#D1FAE5' : '#FEF3C7',
                            color: ord.status === 'Entregado' ? '#065F46' : '#92400E',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            padding: '4px 10px',
                            borderRadius: '999px'
                          }}>
                            {ord.status}
                          </span>
                        </div>

                        {/* Order Items */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                          {ord.items.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                              <img src={item.image} alt="" style={{ width: '45px', height: '55px', objectFit: 'cover', borderRadius: '4px' }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#09090B' }}>{item.name}</div>
                                <div style={{ fontSize: '0.75rem', color: '#71717A' }}>Talla: {item.size} - Color: {item.color} - Cant: {item.quantity}</div>
                              </div>
                              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#09090B' }}>
                                {formatCOP(item.price * item.quantity)}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E4E4E7', paddingTop: '0.75rem', fontSize: '0.88rem' }}>
                          <span style={{ color: '#71717A' }}>Guía de rastreo: <strong>{ord.trackingNumber || 'En asignación'}</strong></span>
                          <span style={{ fontWeight: 900, fontSize: '1.05rem', color: '#09090B' }}>TOTAL: {formatCOP(ord.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2. FAVORITES TAB */}
            {activeTab === 'favoritos' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={panelTitleStyle}>MIS PRENDAS FAVORITAS ({wishlistProducts.length})</h2>
                  {wishlistProducts.length > 0 && (
                    <button
                      onClick={moveWishlistToCart}
                      style={{
                        backgroundColor: '#09090B',
                        color: '#FFFFFF',
                        padding: '0.6rem 1.2rem',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.82rem'
                      }}
                    >
                      MOVER TODO AL CARRITO
                    </button>
                  )}
                </div>

                {wishlistProducts.length === 0 ? (
                  <p style={{ color: '#71717A' }}>No tienes productos guardados en tus favoritos.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '1.5rem' }}>
                    {wishlistProducts.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. PROFILE DATA TAB */}
            {activeTab === 'datos' && (
              <div>
                <h2 style={panelTitleStyle}>MIS DATOS PERSONALES & PREFERENCIAS</h2>
                <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '540px' }}>
                  <div>
                    <label style={labelStyle}>Nombre Completo</label>
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={labelStyle}>Correo Electrónico</label>
                      <input
                        type="email"
                        value={profileData.email}
                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Teléfono Celular</label>
                      <input
                        type="tel"
                        value={profileData.phone}
                        onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={labelStyle}>Talla Habitual Preferida</label>
                      <select
                        value={profileData.preferredSize}
                        onChange={(e) => setProfileData({ ...profileData, preferredSize: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="S">Talla S</option>
                        <option value="M">Talla M</option>
                        <option value="L">Talla L</option>
                        <option value="XL">Talla XL</option>
                        <option value="XXL">Talla XXL</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Fit Preferido</label>
                      <select
                        value={profileData.preferredFit}
                        onChange={(e) => setProfileData({ ...profileData, preferredFit: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="SLIM">SLIM FIT</option>
                        <option value="REGULAR">REGULAR FIT</option>
                        <option value="RELAXED">RELAXED FIT</option>
                        <option value="OVERSIZE">OVERSIZE FIT</option>
                      </select>
                    </div>
                  </div>

                  {profileSaved && (
                    <div style={{ color: '#10B981', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <CheckCircle2 size={16} /> ¡Información guardada exitosamente!
                    </div>
                  )}

                  <button
                    type="submit"
                    style={{
                      backgroundColor: '#09090B',
                      color: '#FFFFFF',
                      padding: '0.85rem 1.5rem',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      width: 'fit-content'
                    }}
                  >
                    <Save size={16} /> GUARDAR CAMBIOS
                  </button>
                </form>
              </div>
            )}

            {/* 4. ADDRESSES TAB */}
            {activeTab === 'direcciones' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={panelTitleStyle}>MIS DIRECCIONES DE ENVÍO (COLOMBIA)</h2>
                  <button
                    onClick={() => setShowAddAddress(!showAddAddress)}
                    style={{
                      backgroundColor: '#09090B',
                      color: '#FFFFFF',
                      padding: '0.6rem 1.2rem',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <Plus size={16} /> AÑADIR DIRECCIÓN
                  </button>
                </div>

                {showAddAddress && (
                  <form onSubmit={handleAddAddressSubmit} style={{ backgroundColor: '#FAFAFA', padding: '1.5rem', borderRadius: '8px', border: '1px solid #E4E4E7', marginBottom: '2rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem' }}>NUEVA DIRECCIÓN DE ENTREGA</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <input type="text" placeholder="Nombre de dirección (Ej. Casa, Trabajo)" value={newAddr.name} onChange={(e) => setNewAddr({ ...newAddr, name: e.target.value })} style={inputStyle} />
                      <input type="text" placeholder="Ciudad (Ej. Bogotá D.C.)" value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} style={inputStyle} />
                    </div>
                    <input type="text" placeholder="Dirección exactas" value={newAddr.address} onChange={(e) => setNewAddr({ ...newAddr, address: e.target.value })} style={{ ...inputStyle, marginBottom: '1rem' }} />
                    <button type="submit" style={{ backgroundColor: '#09090B', color: '#FFFFFF', padding: '0.75rem 1.5rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem' }}>
                      GUARDAR DIRECCIÓN
                    </button>
                  </form>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {savedAddresses.map((addr) => (
                    <div key={addr.id} style={{ border: '1px solid #E4E4E7', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#FFFFFF' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#09090B' }}>{addr.name}</span>
                        {addr.isDefault && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, backgroundColor: '#09090B', color: '#FFFFFF', padding: '2px 6px', borderRadius: '3px' }}>
                            PRINCIPAL
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '0.88rem', color: '#27272A', lineHeight: 1.5, marginBottom: '0.4rem' }}>{addr.address}</p>
                      <p style={{ fontSize: '0.78rem', color: '#71717A' }}>{addr.neighborhood} - {addr.city}, {addr.department}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </div>

  {/* GOOGLE ACCOUNTS PICKER MODAL (EXACT GOOGLE OAUTH UI) */}
  {showGoogleModal && (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(3px)' }}>
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '28px', maxWidth: '520px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}>
        
        {/* GOOGLE OAUTH TOP BAR */}
        <div style={{ padding: '1.25rem 2rem 0.5rem 2rem', display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: '1px solid #F1F3F4' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#4285F4' }}>G</span>
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#3C4043' }}>Inicia sesión con Google</span>
        </div>

        {/* GOOGLE OAUTH HEADER */}
        <div style={{ padding: '1.5rem 2rem 1rem 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#09090B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.8rem' }}>
              J&M
            </div>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#202124', letterSpacing: '0.05em' }}>J&M FASHION STORE</span>
          </div>
          <h2 style={{ fontSize: '2.1rem', fontWeight: 500, color: '#1F1F1F', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Elige una cuenta
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#444746', marginTop: '0.3rem' }}>
            para continuar a <span style={{ fontWeight: 600, color: '#1B66C9' }}>J&M Fashion Store</span>
          </p>
        </div>

        {/* ACCOUNTS SCROLLABLE LIST */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 2rem' }}>
          {!isCustomGoogleMode ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                { name: 'Sebastian Moreno', email: 'sebastianbachello@gmail.com', initial: 'S', color: '#673AB7' },
                { name: 'juan moreno', email: 'juaneslaley12@gmail.com', initial: 'j', color: '#E65100' },
                { name: 'Sebastian Moreno', email: 'sebitz47@gmail.com', initial: 'S', color: '#00897B' },
                { name: 'Suministros J&C', email: 'jcsuministros073@gmail.com', initial: 'S', color: '#546E7A' },
                { name: 'juan moreno', email: 'unjuandice3333@gmail.com', initial: 'j', color: '#1E88E5' },
                { name: 'juan moreno', email: 'restaurant@bochicast.com', initial: 'j', color: '#78909C' },
                { name: 'Juan Moreno', email: 'unjuandice3333@gmail.com', initial: 'J', color: '#7B1FA2' },
                { name: 'Diana Hernández', email: 'dhern0629@gmail.com', initial: 'D', color: '#8E24AA' },
                { name: 'juan moreno', email: 'soporterivo1@gmail.com', initial: 'j', color: '#263238' },
                { name: 'juan moreno', email: 'novasolutionsco2@gmail.com', initial: 'j', color: '#D81B60' }
              ].map((acc, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectGoogleAccount(acc.email, acc.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.9rem 0.5rem',
                    border: 'none',
                    borderBottom: '1px solid #E0E0E0',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'backgroundColor 0.15s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8F9FA'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: acc.color, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem' }}>
                      {acc.initial}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#1F1F1F' }}>{acc.name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#5F6368' }}>{acc.email}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#70757A', fontWeight: 500 }}>Firmado</span>
                </button>
              ))}

              {/* USA OTRA CUENTA OPTION */}
              <button
                onClick={() => setIsCustomGoogleMode(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem 0.5rem',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8F9FA'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #DADCE0', color: '#3C4043', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                  <User size={20} />
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#1F1F1F' }}>
                  Usa otra cuenta
                </div>
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (customGoogleEmail) { handleSelectGoogleAccount(customGoogleEmail, customGoogleName); } }} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 0' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1F1F1F', marginBottom: '0.5rem' }}>Correo electrónico de Google</label>
                <input
                  type="email"
                  required
                  placeholder="ejemplo@gmail.com"
                  value={customGoogleEmail}
                  onChange={(e) => setCustomGoogleEmail(e.target.value)}
                  style={{ width: '100%', padding: '0.85rem 1rem', border: '1px solid #747775', borderRadius: '4px', fontSize: '0.95rem', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#1F1F1F', marginBottom: '0.5rem' }}>Nombre completo</label>
                <input
                  type="text"
                  placeholder="Ej. Juan Moreno"
                  value={customGoogleName}
                  onChange={(e) => setCustomGoogleName(e.target.value)}
                  style={{ width: '100%', padding: '0.85rem 1rem', border: '1px solid #747775', borderRadius: '4px', fontSize: '0.95rem', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsCustomGoogleMode(false)}
                  style={{ border: 'none', background: 'none', fontSize: '0.85rem', fontWeight: 600, color: '#0B57D0', cursor: 'pointer' }}
                >
                  Volver a la lista
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: '#0B57D0', color: '#FFFFFF', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '100px', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}
                >
                  Siguiente
                </button>
              </div>
            </form>
          )}
        </div>

        {/* GOOGLE FOOTER */}
        <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid #F1F3F4', backgroundColor: '#FAFAFA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: '0.72rem', color: '#5F6368', lineHeight: 1.4 }}>
            Antes de usar esta aplicación, puedes consultar la Política de Privacidad y los Términos de Servicio de J&M.
          </p>
          <button
            onClick={() => { setShowGoogleModal(false); setIsCustomGoogleMode(false); }}
            style={{ border: 'none', background: 'none', fontSize: '0.82rem', fontWeight: 600, color: '#5F6368', cursor: 'pointer', paddingLeft: '1rem', whiteSpace: 'nowrap' }}
          >
            Cancelar
          </button>
        </div>

      </div>
    </div>
  )}
</div>
  );
};

const panelTitleStyle = {
  fontSize: '1.25rem',
  fontWeight: 900,
  color: '#09090B',
  marginBottom: '1.5rem',
  textTransform: 'uppercase'
};

const accountTabBtn = (isActive) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.85rem 1rem',
  borderRadius: '6px',
  fontWeight: isActive ? 800 : 600,
  fontSize: '0.88rem',
  color: isActive ? '#FFFFFF' : '#09090B',
  backgroundColor: isActive ? '#09090B' : '#FAFAFA',
  border: '1px solid #E4E4E7',
  transition: 'all 0.15s',
  textAlign: 'left'
});

const labelStyle = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#09090B',
  marginBottom: '0.4rem'
};

const inputStyle = {
  width: '100%',
  padding: '0.75rem 0.9rem',
  border: '1px solid #D4D4D8',
  borderRadius: '6px',
  fontSize: '0.88rem',
  outline: 'none'
};

export default AccountPage;
