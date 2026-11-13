import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Trash2, Bookmark, ArrowRight, Truck, Sparkles, Plus, Minus, Tag, Check, X } from '../components/Common/icons';
import { useECommerceStore } from '../store/eCommerceStore';
import { formatCOP } from '../utils/currency';

export const CartPage = () => {
  const navigate = useNavigate();
  const {
    items,
    removeItem,
    updateQuantity,
    saveForLater,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    getTotals,
    refreshQuote,
    quote,
    cartNotice,
    dismissCartNotice,
    loadProducts,
    products,
    changeVariant
  } = useECommerceStore();
  const [variantMsg, setVariantMsg] = useState(null); // { itemId, ok, text }
  const onChangeVariant = (item, size, color) => {
    const r = changeVariant(item.id, size, color);
    setVariantMsg(r.ok ? { itemId: r.merged ? null : item.id, ok: true, text: r.merged ? 'Unimos las dos líneas de la misma talla y color.' : null } : { itemId: item.id, ok: false, text: r.message });
  };
  const [qtyError, setQtyError] = useState(null);
  const [quoteError, setQuoteError] = useState(null);

  // Catálogo actual (reconcilia precios y stock del carrito) y cotización de la BD
  useEffect(() => { loadProducts(); }, [loadProducts]);
  const itemsKey = items.map((i) => `${i.variantId}x${i.quantity}`).join(',');
  useEffect(() => {
    if (!items.length) return;
    setQuoteError(null);
    refreshQuote().catch((e) => setQuoteError(e.message));
  }, [itemsKey, appliedCoupon?.code]); // eslint-disable-line react-hooks/exhaustive-deps
  const outOfStock = (quote?.lines ?? []).filter((l) => !l.in_stock);

  const [couponInput, setCouponInput] = useState('');
  const [couponFeedback, setCouponFeedback] = useState(null);
  const couponInputRef = useRef(null);

  const totals = getTotals();

  const [applying, setApplying] = useState(false);
  const handleApplyCoupon = async (e) => {
    e.preventDefault();
    if (applying) return;
    // Ejecución 112 (D83): sin código, o con un código rechazado, el aviso se enlaza al campo y el foco vuelve a él.
    const focusInput = () => requestAnimationFrame(() => couponInputRef.current?.focus());
    if (!couponInput.trim()) {
      setCouponFeedback({ success: false, message: 'Escribe el código del cupón.' });
      focusInput();
      return;
    }
    setApplying(true);
    const res = await applyCoupon(couponInput);
    setApplying(false);
    setCouponFeedback(res);
    if (res.success) setCouponInput('');
    else focusInput();
  };
  const couponError = couponFeedback && !couponFeedback.success && !appliedCoupon;

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: '3rem 0 5rem 0', minHeight: '80vh' }}>
      <div className="jm-container">
        {cartNotice && (
          <div role="alert" style={{ backgroundColor: '#FFFBEB', color: '#92400E', padding: '0.8rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
            <span>{cartNotice}</span>
            <button onClick={dismissCartNotice} style={{ textDecoration: 'underline', color: '#92400E', fontWeight: 700 }}>Entendido</button>
          </div>
        )}
        {/* BREADCRUMB */}
        <div className="jm-breadcrumb" style={{ fontSize: '0.8rem', color: '#71717A', marginBottom: '1.5rem' }}>
          <Link to="/" style={{ color: '#71717A' }}>Inicio</Link>
          <span style={{ margin: '0 0.4rem' }}>/</span>
          <strong style={{ color: '#09090B' }}>Mi Carrito de Compras</strong>
        </div>

        <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase', marginBottom: '2rem' }}>
          CARRITO DE COMPRAS ({items.reduce((s, i) => s + i.quantity, 0)})
        </h1>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', border: '1px dashed #D4D4D8', borderRadius: '12px' }}>
            <ShoppingBag size={56} color="#A1A1AA" style={{ margin: '0 auto 1rem auto' }} />
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#09090B', marginBottom: '0.5rem' }}>
              Tu carrito está actualmente vacío
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#71717A', marginBottom: '2rem' }}>
              Explora nuestra tienda masculina y añade tus prendas favoritas.
            </p>
            <Link
              to="/ropa"
              style={{
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                padding: '0.95rem 2rem',
                borderRadius: '6px',
                fontWeight: 800,
                fontSize: '0.9rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase'
              }}
            >
              EXPLORAR COLECCIÓN
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '3rem' }} className="cart-page-layout">
            {/* ITEMS LIST COLUMN */}
            <div>
              {/* Free Shipping Alert */}
              <div style={{
                backgroundColor: '#FAFAFA',
                padding: '1.25rem',
                borderRadius: '8px',
                border: '1px solid #E4E4E7',
                marginBottom: '2rem'
              }}>
                {!totals.freeShippingThreshold && !totals.hasFreeShipping ? null : totals.hasFreeShipping ? (
                  <div style={{ color: '#10B981', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Truck size={20} /> ¡Felicidades! Tu orden aplica para <strong>ENVÍO GRATIS</strong> en Colombia.
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.88rem', color: '#09090B', fontWeight: 600, marginBottom: '0.5rem' }}>
                      Agrega <strong>{formatCOP(totals.amountForFreeShipping)}</strong> más a tu pedido para obtener <strong>ENVÍO GRATIS</strong>.
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: '#E4E4E7', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${totals.freeShippingThreshold ? Math.min(100, (totals.subtotal / totals.freeShippingThreshold) * 100) : 0}%`,
                        height: '100%',
                        backgroundColor: '#09090B',
                        transition: 'width 0.3s'
                      }}></div>
                    </div>
                  </div>
                )}
              </div>

              {variantMsg && !variantMsg.itemId && variantMsg.text && <div role="status" style={{ color: '#065F46', fontWeight: 700, fontSize: '0.85rem' }}>{variantMsg.text}</div>}
              {/* Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="cart-line"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '100px 1fr auto',
                      gap: '1.5rem',
                      padding: '1.5rem',
                      borderRadius: '8px',
                      border: '1px solid #E4E4E7',
                      backgroundColor: '#FFFFFF',
                      alignItems: 'center'
                    }}
                  >
                    <img
                      src={item.image}
                      alt={item.name}
                      className="cart-line-img"
                      style={{ width: '100px', height: '125px', objectFit: 'cover', borderRadius: '6px' }}
                    />

                    <div style={{ minWidth: 0 }}>
                      <Link to={`/producto/${item.slug}`} className="jm-tap-inline" style={{ textDecoration: 'none' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#09090B', marginBottom: '0.3rem' }}>
                          {item.name}
                        </h3>
                      </Link>
                      {(() => {
                        // M28: cambiar talla/color en el carrito con las variantes reales del producto (stock de la BD).
                        const prod = products.find((p) => p.id === item.productId);
                        const vs = prod?.rawVariants ?? [];
                        const colors = [...new Set(vs.map((v) => v.color))];
                        const sizes = vs.filter((v) => v.color === item.color);
                        const sel = { padding: '0.3rem 0.4rem', border: '1px solid #D4D4D8', borderRadius: 4, fontSize: '0.8rem', fontWeight: 700, color: '#09090B', backgroundColor: '#FFF' };
                        return (
                          <div style={{ fontSize: '0.82rem', color: '#71717A', marginBottom: '0.8rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <label>Talla{' '}
                              <select aria-label={`Talla de ${item.name}`} value={item.size} disabled={!prod} className="jm-tap" style={sel}
                                onChange={(e) => onChangeVariant(item, e.target.value, item.color)}>
                                {sizes.map((v) => <option key={v.id} value={v.size} disabled={v.id !== item.variantId && v.available <= 0}>{v.size}{v.available <= 0 ? ' (agotada)' : ''}</option>)}
                                {!sizes.some((v) => v.size === item.size) && <option value={item.size}>{item.size}</option>}
                              </select>
                            </label>
                            <label>Color{' '}
                              <select aria-label={`Color de ${item.name}`} value={item.color} disabled={!prod || colors.length < 2} className="jm-tap" style={sel}
                                onChange={(e) => {
                                  const c = e.target.value;
                                  const same = vs.find((v) => v.color === c && v.size === item.size && v.available > 0);
                                  const any = vs.find((v) => v.color === c && v.available > 0);
                                  onChangeVariant(item, (same ?? any ?? { size: item.size }).size, c);
                                }}>
                                {colors.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </label>
                            {variantMsg?.itemId === item.id && variantMsg.text && <span role={variantMsg.ok ? 'status' : 'alert'} style={{ color: variantMsg.ok ? '#065F46' : '#B91C1C', fontWeight: 700 }}>{variantMsg.text}</span>}
                          </div>
                        );
                      })()}

                      <div className="cart-line-actions jm-tap-area" style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Quantity Counter */}
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E4E4E7', borderRadius: '4px' }}>
                          <button
                            onClick={() => { updateQuantity(item.id, item.quantity - 1); setQtyError(null); }}
                            aria-label={`Disminuir cantidad de ${item.name}`}
                            className="cart-qty-btn"
                            style={{ padding: '0.35rem 0.6rem', color: '#09090B' }}
                          >
                            <Minus size={14} />
                          </button>
                          <span style={{ fontSize: '0.9rem', fontWeight: 800, padding: '0 0.6rem' }}>{item.quantity}</span>
                          <button
                            onClick={() => { const r = updateQuantity(item.id, item.quantity + 1); setQtyError(r.ok ? null : r.message); }}
                            aria-label={`Aumentar cantidad de ${item.name}`}
                            className="cart-qty-btn"
                            style={{ padding: '0.35rem 0.6rem', color: '#09090B' }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        {/* Save for later */}
                        <button
                          onClick={() => saveForLater(item.id)}
                          style={{ fontSize: '0.78rem', color: '#71717A', display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 600 }}
                        >
                          <Bookmark size={14} /> Guardar para después
                        </button>

                        {/* Remove */}
                        <button
                          onClick={() => removeItem(item.id)}
                          style={{ fontSize: '0.78rem', color: '#E11D48', display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 600 }}
                        >
                          <Trash2 size={14} /> Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="cart-line-price" style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#09090B' }}>
                        {formatCOP(item.price * item.quantity)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#71717A' }}>
                        {formatCOP(item.price)} / c.u.
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ORDER SUMMARY SIDEBAR */}
            <div>
              <div style={{
                backgroundColor: '#FAFAFA',
                padding: '2rem',
                borderRadius: '12px',
                border: '1px solid #E4E4E7',
                position: 'sticky',
                top: '100px'
              }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', marginBottom: '1.5rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '0.8rem' }}>
                  RESUMEN DEL PEDIDO
                </h2>

                {/* Coupon Input Form */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#09090B', marginBottom: '0.5rem' }}>
                    ¿TIENES UN CUPÓN DE DESCUENTO?
                  </label>

                  {appliedCoupon ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E0F2FE', color: '#0369A1', padding: '0.6rem 0.9rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Tag size={16} /> CUPÓN: {appliedCoupon.code}{appliedCoupon.freeShipping ? ' (envío gratis)' : ''}
                      </div>
                      <button onClick={removeCoupon} style={{ color: '#0369A1' }} aria-label="Quitar cupón"><X size={16} /></button>
                    </div>
                  ) : (
                    <form onSubmit={handleApplyCoupon} noValidate style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        ref={couponInputRef}
                        aria-invalid={couponError ? 'true' : 'false'}
                        aria-describedby={couponError ? 'cart-coupon-feedback' : undefined}
                        type="text"
                        placeholder="Código del cupón"
                        aria-label="Código del cupón"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '0.6rem 0.8rem',
                          border: '1px solid #D4D4D8',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          outline: 'none',
                          textTransform: 'uppercase'
                        }}
                      />
                      <button
                        type="submit"
                        disabled={applying}
                        style={{
                          backgroundColor: '#09090B',
                          color: '#FFFFFF',
                          padding: '0 1.1rem',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '0.8rem'
                        }}
                      >
                        APLICAR
                      </button>
                    </form>
                  )}

                  {couponFeedback && !appliedCoupon && (
                    <div id="cart-coupon-feedback" role={couponFeedback.success ? 'status' : 'alert'} style={{ fontSize: '0.78rem', color: couponFeedback.success ? '#047857' : '#B91C1C', marginTop: '0.4rem', fontWeight: 600 }}>
                      {couponFeedback.message}
                    </div>
                  )}

                </div>

                {/* Subtotals breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '1.25rem', marginBottom: '1.25rem', fontSize: '0.9rem', color: '#71717A' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Subtotal de productos</span>
                    <span>{formatCOP(totals.rawSubtotal)}</span>
                  </div>

                  {totals.couponDiscount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10B981', fontWeight: 700 }}>
                      <span>Descuento Cupón ({appliedCoupon?.code})</span>
                      <span>-{formatCOP(totals.couponDiscount)}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Envío a Colombia</span>
                    <span>
                      {totals.shippingCost === 0 ? <strong style={{ color: '#10B981' }}>GRATIS</strong> : formatCOP(totals.shippingCost)}
                    </span>
                  </div>
                </div>

                {/* Final Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.75rem' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: '#09090B' }}>{totals.isEstimate ? 'TOTAL ESTIMADO' : 'TOTAL'}</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#09090B' }}>
                    {formatCOP(totals.total)}
                  </span>
                </div>

                {(qtyError || quoteError || outOfStock.length > 0) && (
                  <div role="alert" style={{ backgroundColor: '#FEF2F2', color: '#B91C1C', padding: '0.7rem 0.9rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '1rem' }}>
                    {qtyError && <div>{qtyError}</div>}
                    {quoteError && <div>{quoteError}</div>}
                    {outOfStock.map((l) => <div key={l.variant_id}>{l.product_name} ({l.size_code}, {l.color_name}): solo hay {l.available} disponible(s).</div>)}
                  </div>
                )}
                <button
                  disabled={outOfStock.length > 0}
                  onClick={() => navigate('/checkout')}
                  style={{
                    width: '100%',
                    backgroundColor: '#09090B',
                    color: '#FFFFFF',
                    padding: '1.1rem',
                    borderRadius: '6px',
                    fontWeight: 800,
                    fontSize: '0.92rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.6rem'
                  }}
                >
                  PROCEDER AL CHECKOUT <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .cart-page-layout { grid-template-columns: minmax(0, 1fr) !important; gap: 2rem !important; }
        }
        /* Móvil: imagen más pequeña, el precio pasa debajo de los datos y los controles se ajustan al ancho */
        @media (max-width: 640px) {
          .cart-line { grid-template-columns: 80px minmax(0, 1fr) !important; gap: 0.9rem !important; padding: 1rem !important; align-items: start !important; }
          .cart-line-img { width: 80px !important; height: 100px !important; }
          .cart-line-price { grid-column: 2; text-align: left !important; }
          .cart-line-actions { gap: 0.75rem 1rem !important; }
          .cart-qty-btn { min-width: 36px; min-height: 36px; display: inline-flex; align-items: center; justify-content: center; }
        }
      `}</style>
    </div>
  );
};

export default CartPage;
