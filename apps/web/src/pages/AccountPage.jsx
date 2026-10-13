import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ExternalLink,
  ShoppingBag,
  User,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatCOP } from '../data/mockData';
import supabase from '../config/supabase';

export const AccountPage = () => {
  const navigate = useNavigate();
  const { isLoggedIn, user, profile, login, signUp, logout, isLoading, error } = useAuthStore();

  const [inputEmail, setInputEmail] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  const [inputName, setInputName] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [formError, setFormError] = useState(null);

  // Orders State for Authenticated Customer
  const [userOrders, setUserOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState(null);

  // Cargar pedidos del usuario autenticado respetando RLS
  useEffect(() => {
    if (!isLoggedIn || !user) return;

    const fetchUserOrders = async () => {
      setIsLoadingOrders(true);
      setOrdersError(null);
      try {
        const { data, error: err } = await supabase
          .from('online_orders')
          .select(`
            id,
            order_number,
            total,
            status,
            created_at,
            online_order_items (
              id, product_name, size, color, unit_price, quantity, total
            )
          `)
          .order('created_at', { ascending: false });

        if (err) throw err;
        setUserOrders(data || []);
      } catch (e) {
        console.error('[AccountPage Error]: Error al cargar pedidos del usuario:', e);
        setOrdersError(e.message || 'No pudimos cargar tus pedidos en este momento.');
      } finally {
        setIsLoadingOrders(false);
      }
    };

    fetchUserOrders();
  }, [isLoggedIn, user]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!inputEmail || !inputPassword) {
      setFormError('Por favor ingresa tu correo y contraseña.');
      return;
    }

    try {
      if (isRegisterMode) {
        if (!inputName) {
          setFormError('Por favor ingresa tu nombre completo.');
          return;
        }
        await signUp(inputEmail, inputPassword, inputName);
      } else {
        await login(inputEmail, inputPassword);
      }
    } catch (err) {
      setFormError(err.message || 'Error durante la autenticación.');
    }
  };

  const handleGoogleAuth = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/cuenta`
        }
      });
      if (error) throw error;
    } catch (err) {
      setFormError(err.message || 'Google OAuth requiere configuración en el panel de Supabase.');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return {
          label: 'Compra completada',
          bg: '#ECFDF5',
          text: '#065F46',
          border: '#A7F3D0',
          icon: <CheckCircle2 size={14} color="#10B981" />
        };
      case 'payment_pending':
      case 'pending':
        return {
          label: 'Pago pendiente',
          bg: '#FFFBEB',
          text: '#92400E',
          border: '#FDE68A',
          icon: <Clock size={14} color="#D97706" />
        };
      case 'cancelled':
        return {
          label: 'Cancelado',
          bg: '#FEF2F2',
          text: '#991B1B',
          border: '#FECACA',
          icon: <XCircle size={14} color="#EF4444" />
        };
      case 'declined':
        return {
          label: 'Rechazado',
          bg: '#FEF2F2',
          text: '#991B1B',
          border: '#FECACA',
          icon: <XCircle size={14} color="#EF4444" />
        };
      case 'voided':
        return {
          label: 'Cancelado / Anulado',
          bg: '#F4F4F5',
          text: '#52525B',
          border: '#E4E4E7',
          icon: <XCircle size={14} color="#71717A" />
        };
      default:
        return {
          label: status,
          bg: '#F4F4F5',
          text: '#52525B',
          border: '#E4E4E7',
          icon: <Package size={14} color="#71717A" />
        };
    }
  };

  // VISTA DE USUARIO AUTENTICADO
  if (isLoggedIn && user) {
    return (
      <div style={{ backgroundColor: '#FAFAFA', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
        <div className="jm-container" style={{ maxWidth: '1000px', margin: '0 auto' }}>

          {/* PROFILE HEADER CARD */}
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4E4E7',
            borderRadius: '16px',
            padding: '2rem',
            marginBottom: '2.5rem',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1.5rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.6rem',
                fontWeight: 800
              }}>
                {(profile?.full_name || user.email)?.[0]?.toUpperCase()}
              </div>
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: 0 }}>
                  {profile?.full_name || 'Cliente J&M'}
                </h1>
                <p style={{ fontSize: '0.9rem', color: '#71717A', margin: '0.2rem 0' }}>{user.email}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    backgroundColor: (profile?.role === 'admin' || profile?.role === 'super_admin') ? '#D4AF37' : '#E4E4E7',
                    color: (profile?.role === 'admin' || profile?.role === 'super_admin') ? '#FFFFFF' : '#09090B'
                  }}>
                    Rol: {profile?.role || 'customer'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#A1A1AA' }}>
                    • ID: {user.id.slice(0, 8)}...
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E4E4E7',
                color: '#E11D48',
                padding: '0.75rem 1.25rem',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              <LogOut size={16} /> Cerrar Sesión
            </button>
          </div>

          {/* SECCIÓN "MIS PEDIDOS" */}
          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Package size={22} color="#09090B" />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', margin: 0 }}>
                  Mis Pedidos
                </h2>
                <span style={{
                  backgroundColor: '#09090B',
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '999px'
                }}>
                  {userOrders.length}
                </span>
              </div>

              <Link
                to="/ropa"
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#09090B',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
              >
                Comprar prendas <ChevronRight size={16} />
              </Link>
            </div>

            {isLoadingOrders ? (
              <div style={{ backgroundColor: '#FFFFFF', padding: '3rem', borderRadius: '12px', border: '1px solid #E4E4E7', textAlign: 'center', color: '#71717A' }}>
                Cargando tu historial de pedidos autoritativo...
              </div>
            ) : ordersError ? (
              <div style={{ backgroundColor: '#FEF2F2', padding: '1.5rem', borderRadius: '12px', border: '1px solid #FECACA', color: '#991B1B' }}>
                {ordersError}
              </div>
            ) : userOrders.length === 0 ? (
              <div style={{
                backgroundColor: '#FFFFFF',
                padding: '4rem 2rem',
                borderRadius: '16px',
                border: '1px solid #E4E4E7',
                textAlign: 'center'
              }}>
                <ShoppingBag size={48} color="#D4D4D8" style={{ margin: '0 auto 1rem auto' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090B', marginBottom: '0.5rem' }}>
                  AÚN NO TIENES PEDIDOS
                </h3>
                <p style={{ fontSize: '0.9rem', color: '#71717A', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
                  Explora las prendas exclusivas de J&M Fashion Store y realiza tu primera compra segura.
                </p>
                <Link
                  to="/ropa"
                  style={{
                    display: 'inline-block',
                    backgroundColor: '#09090B',
                    color: '#FFFFFF',
                    padding: '0.85rem 1.8rem',
                    borderRadius: '6px',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    textDecoration: 'none'
                  }}
                >
                  VER CATÁLOGO DE MODA
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {userOrders.map((ord) => {
                  const badge = getStatusBadge(ord.status);
                  const formattedDate = new Date(ord.created_at).toLocaleDateString('es-CO', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <div
                      key={ord.id}
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E4E4E7',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '1rem',
                        borderBottom: '1px solid #F4F4F5',
                        paddingBottom: '1rem',
                        marginBottom: '1rem'
                      }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            PEDIDO #{ord.order_number || ord.id}
                          </span>
                          <div style={{ fontSize: '0.82rem', color: '#A1A1AA', marginTop: '0.15rem' }}>
                            {formattedDate}
                          </div>
                        </div>

                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          backgroundColor: badge.bg,
                          color: badge.text,
                          border: `1px solid ${badge.border}`,
                          padding: '0.35rem 0.75rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          textTransform: 'uppercase'
                        }}>
                          {badge.icon}
                          {badge.label}
                        </div>
                      </div>

                      {/* PRODUCT ITEMS IN THIS ORDER */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                        {ord.online_order_items?.map((item) => (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem' }}>
                            <div>
                              <strong style={{ color: '#09090B' }}>{item.product_name}</strong>
                              <span style={{ color: '#71717A', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                                (Talla: {item.size || 'M'} • Color: {item.color || 'Único'} • Cant: {item.quantity})
                              </span>
                            </div>
                            <div style={{ fontWeight: 700, color: '#09090B' }}>
                              {formatCOP(Number(item.unit_price) * item.quantity)}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* FOOTER TOTAL & ACTIONS */}
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '1rem',
                        borderTop: '1px solid #F4F4F5',
                        paddingTop: '1rem'
                      }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: '#71717A', fontWeight: 800, textTransform: 'uppercase', display: 'block' }}>
                            TOTAL DE LA ORDEN
                          </span>
                          <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#09090B' }}>
                            {formatCOP(Number(ord.total))}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          {(ord.status === 'cancelled' || ord.status === 'declined') && (
                            <button
                              onClick={() => navigate('/checkout')}
                              style={{
                                backgroundColor: '#09090B',
                                color: '#FFFFFF',
                                border: 'none',
                                padding: '0.6rem 1.1rem',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                cursor: 'pointer'
                              }}
                            >
                              <RotateCcw size={14} /> Reintentar
                            </button>
                          )}

                          {ord.status === 'payment_pending' && (
                            <button
                              onClick={() => navigate(`/checkout/confirmacion?orderId=${ord.id}`)}
                              style={{
                                backgroundColor: '#D97706',
                                color: '#FFFFFF',
                                border: 'none',
                                padding: '0.6rem 1.1rem',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                cursor: 'pointer'
                              }}
                            >
                              <Clock size={14} /> Continuar Pago
                            </button>
                          )}

                          <button
                            onClick={() => navigate(`/checkout/confirmacion?orderId=${ord.id}`)}
                            style={{
                              backgroundColor: '#FFFFFF',
                              color: '#09090B',
                              border: '1px solid #E4E4E7',
                              padding: '0.6rem 1.1rem',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              cursor: 'pointer'
                            }}
                          >
                            <ExternalLink size={14} /> Ver Detalle
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // VISTA PARA USUARIOS NO AUTENTICADOS (FORMULARIO DE LOGIN / REGISTRO)
  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '85vh' }}>
      <div className="jm-container">
        <div style={{
          maxWidth: '440px',
          margin: '2rem auto',
          border: '1px solid #E4E4E7',
          borderRadius: '24px',
          padding: '2.5rem 2rem',
          backgroundColor: '#FFFFFF',
          boxShadow: '0 12px 36px rgba(0,0,0,0.06)'
        }}>
          <div style={{ textAlign: 'left', marginBottom: '1.75rem' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#09090B', letterSpacing: '-0.02em' }}>
              {isRegisterMode ? 'Crear cuenta' : 'Iniciar sesión'}
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#71717A', marginTop: '0.25rem' }}>
              Continuar con <strong>J&M Fashion Store</strong>
            </p>
          </div>

          {(formError || error) && (
            <div style={{
              backgroundColor: '#FEF2F2',
              color: '#991B1B',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              border: '1px solid #FCA5A5'
            }}>
              {formError || error}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {isRegisterMode && (
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.4rem' }}>
                  Nombre completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  style={{ width: '100%', padding: '0.85rem 1rem', border: '1.5px solid #2563EB', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.4rem' }}>
                Correo electrónico
              </label>
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
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.4rem' }}>
                Contraseña
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                style={{ width: '100%', padding: '0.85rem 1rem', border: '1px solid #D4D4D8', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                padding: '0.88rem',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.88rem',
                border: 'none',
                cursor: 'pointer',
                marginTop: '0.25rem',
                opacity: isLoading ? 0.7 : 1
              }}
            >
              {isLoading ? 'Cargando...' : isRegisterMode ? 'Crear cuenta con Supabase' : 'Iniciar sesión'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.5rem 0' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#E4E4E7' }} />
            <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 500 }}>o</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#E4E4E7' }} />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <button
              type="button"
              onClick={handleGoogleAuth}
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
                color: '#09090B'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              Continuar con Google Auth
            </button>
          </div>

          <div style={{ textAlign: 'left', fontSize: '0.85rem', color: '#71717A' }}>
            {isRegisterMode ? '¿Ya tienes una cuenta? ' : '¿Eres nuevo en J&M? '}
            <button
              type="button"
              onClick={() => { setIsRegisterMode(!isRegisterMode); setFormError(null); }}
              style={{ border: 'none', background: 'none', fontWeight: 700, color: '#2563EB', cursor: 'pointer' }}
            >
              {isRegisterMode ? 'Inicia sesión →' : 'Empieza →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountPage;
