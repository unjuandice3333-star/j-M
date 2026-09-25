import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { User, Package, Heart, MapPin, Settings, CheckCircle2, Truck, Plus, Save } from 'lucide-react';
import { useECommerceStore } from '../store/eCommerceStore';
import { PRODUCTS, formatCOP } from '../data/mockData';
import ProductCard from '../components/Product/ProductCard';

export const AccountPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'pedidos'; // 'pedidos' | 'favoritos' | 'datos' | 'direcciones'

  const {
    userProfile,
    updateProfile,
    savedAddresses,
    addAddress,
    orders,
    wishlist,
    moveWishlistToCart
  } = useECommerceStore();

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

  const wishlistProducts = PRODUCTS.filter((p) => wishlist.includes(p.id));

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
      <div className="jm-container">
        {/* ACCOUNT HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '1.5rem' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#09090B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.4rem' }}>
            {userProfile.name.charAt(0)}
          </div>
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>
              MI CUENTA J&M
            </h1>
            <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
              Bienvenido de nuevo, <strong>{userProfile.name}</strong> • {userProfile.email}
            </p>
          </div>
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
                                <div style={{ fontSize: '0.75rem', color: '#71717A' }}>Talla: {item.size} • Color: {item.color} • Cant: {item.quantity}</div>
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
                      <p style={{ fontSize: '0.78rem', color: '#71717A' }}>{addr.neighborhood} • {addr.city}, {addr.department}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .account-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
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
