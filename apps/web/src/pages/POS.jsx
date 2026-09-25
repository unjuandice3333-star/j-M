import React, { useState, useEffect } from 'react';
import { Button, Input, Badge, Table, TableRow, TableCell } from '@jm/ui';
import { useAuthStore } from '../store/authStore.js';
import { useCartStore } from '../store/cartStore.js';
import { useShiftStore } from '../store/shiftStore.js';
import { useSyncStore } from '../store/syncStore.js';
import { useUiStore } from '../store/uiStore.js';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner.js';
import { formatCurrency } from '@jm/utils';
import {
  Scan,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  Lock,
  RefreshCw,
  Percent,
  Tag
} from 'lucide-react';
import styles from './POS.module.css';

export const POS = () => {
  const { user } = useAuthStore();
  const { addToast } = useUiStore();
  
  // Decoupled Stores Integration
  const {
    cart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    applyItemDiscount,
    setGlobalDiscount,
    getCartTotals,
    clearCart,
    globalDiscount,
    globalDiscountType
  } = useCartStore();

  const {
    activeShift,
    openShift,
    closeShift,
    loadActiveShift
  } = useShiftStore();

  const {
    isOffline,
    outboxQueue,
    addToOutbox,
    syncOutbox,
    loadOutbox
  } = useSyncStore();

  const [initialCash, setInitialCash] = useState('100000');
  const [actualCash, setActualCash] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [selectedPayment, setSelectedPayment] = useState('Efectivo');
  const [manualDiscountAmount, setManualDiscountAmount] = useState('');

  // Load shifts and outbox persistence
  useEffect(() => {
    loadActiveShift();
    loadOutbox();
  }, [loadActiveShift, loadOutbox]);

  // Catalog items mock
  const mockProducts = [
    {
      id: 'v1',
      sku: 'CAM-OVS-NEG-S',
      barcode: '7701234567890',
      size: 'S',
      color: 'Negro Premium',
      price_override: 90000,
      product: { name: 'Camiseta Oversize Heavyweight', base_price: 90000 }
    },
    {
      id: 'v2',
      sku: 'CAM-OVS-NEG-M',
      barcode: '7701234567891',
      size: 'M',
      color: 'Negro Premium',
      price_override: 90000,
      product: { name: 'Camiseta Oversize Heavyweight', base_price: 90000 }
    },
    {
      id: 'v3',
      sku: 'JEAN-FIT-BEI-32',
      barcode: '7709876543210',
      size: '32',
      color: 'Beige Lino',
      price_override: 160000,
      product: { name: 'Jean Slim Fit Denim', base_price: 160000 }
    },
    {
      id: 'v4',
      sku: 'CHQ-BOM-GRI-L',
      barcode: '7705556667770',
      size: 'L',
      color: 'Gris Oxford',
      price_override: 230000,
      product: { name: 'Chaqueta Bomber Premium', base_price: 230000 }
    }
  ];

  // Universal Hardware Barcode Scanner Binding
  useBarcodeScanner((scannedBarcode) => {
    const found = mockProducts.find((p) => p.barcode === scannedBarcode || p.sku.toUpperCase() === scannedBarcode.toUpperCase());
    if (found) {
      addToCart(found);
      addToast(`Escaneado: ${found.product.name} (${found.sku})`, 'success');
    } else {
      addToast(`Código no reconocido: ${scannedBarcode}`, 'error');
    }
  });

  const handleOpenShift = (e) => {
    e.preventDefault();
    if (!initialCash) return;
    openShift(parseFloat(initialCash), user.id, user.branch_id);
    addToast('Turno de caja abierto correctamente', 'success');
  };

  const handleCloseShift = () => {
    if (!actualCash) return;
    const closed = closeShift(parseFloat(actualCash));
    addToast(`Turno cerrado. Descuadre calculado: ${formatCurrency(closed.difference)}`, closed.difference === 0 ? 'success' : 'error');
    setActualCash('');
  };

  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    if (!barcodeInput) return;
    const found = mockProducts.find(
      (p) => p.barcode === barcodeInput || p.sku.toUpperCase() === barcodeInput.toUpperCase()
    );
    if (found) {
      addToCart(found);
      addToast(`Agregado: ${found.product.name}`, 'success');
      setBarcodeInput('');
    } else {
      addToast('SKU o Código de barras no encontrado.', 'error');
    }
  };

  const handleCheckout = async () => {
    try {
      const totals = getCartTotals();
      const newSale = {
        id: `sale-${Date.now()}`,
        branch_id: activeShift.branch_id,
        employee_id: activeShift.employee_id,
        customer_id: null,
        shift_id: activeShift.id,
        invoice_number: `F-${Date.now().toString().slice(-6)}`,
        subtotal: totals.netSubtotal,
        discount: totals.globalDiscount + totals.itemDiscounts,
        tax: totals.tax,
        total: totals.total,
        payment_method: selectedPayment,
        items: cart.map((item) => ({
          variant_id: item.variant_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.discount,
          total: item.total,
        })),
        status: 'COMPLETED',
        created_at: new Date().toISOString(),
      };

      if (isOffline) {
        addToOutbox(newSale);
        addToast(`Cobro registrado offline. Factura: ${newSale.invoice_number}`, 'info');
      } else {
        // En un flujo real enviaríamos a Supabase rpc/insert.
        // Simulamos envío exitoso
        addToast(`Cobrado con éxito. Factura: ${newSale.invoice_number}`, 'success');
      }
      clearCart();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleApplyGlobalDiscount = (e) => {
    e.preventDefault();
    if (!manualDiscountAmount) return;
    setGlobalDiscount(parseFloat(manualDiscountAmount), 'fixed');
    addToast(`Descuento global aplicado: ${formatCurrency(parseFloat(manualDiscountAmount))}`, 'success');
    setManualDiscountAmount('');
  };

  const totals = getCartTotals();

  // Si no hay un turno de caja abierto, forzar apertura (Arqueo Inicial)
  if (!activeShift) {
    return (
      <div className={styles.openShiftContainer}>
        <div className={styles.openShiftCard}>
          <div className={styles.lockIcon}><Lock size={32} /></div>
          <h2 className={styles.openShiftTitle}>Apertura de Caja Obligatoria</h2>
          <p className={styles.openShiftSub}>Ingresa la base de dinero en efectivo inicial para iniciar ventas hoy.</p>
          
          <form onSubmit={handleOpenShift} className={styles.openShiftForm}>
            <Input
              label="Efectivo de Apertura (Base)"
              type="number"
              value={initialCash}
              onChange={(e) => setInitialCash(e.target.value)}
              required
              id="initial-cash-input"
            />
            <Button type="submit" variant="primary" className={styles.openShiftBtn}>
              Abrir Turno de Caja
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.posGrid}>
      {/* Left panel: Catalog and scanner */}
      <div className={styles.leftPanel}>
        <div className={styles.searchHeader}>
          <form onSubmit={handleBarcodeSubmit} className={styles.scannerForm}>
            <Input
              placeholder="Escáner listo. Enfoca la pistola o teclea SKU (ej: CAM-OVS-NEG-S)..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              leftIcon={<Scan size={18} />}
              id="barcode-scanner-input"
            />
          </form>

          {outboxQueue.length > 0 && (
            <Button size="sm" variant="success" onClick={syncOutbox} className={styles.syncBtn}>
              <RefreshCw size={14} className={styles.syncIcon} />
              <span>Sincronizar Offline ({outboxQueue.length})</span>
            </Button>
          )}
        </div>

        {/* Catalog Grid */}
        <div className={styles.catalogCard}>
          <h2 className={styles.sectionTitle}>Prendas Rápidas del Catálogo</h2>
          <div className={styles.catalogGrid}>
            {mockProducts.map((p) => (
              <div key={p.id} className={styles.productCard} onClick={() => {
                addToCart(p);
                addToast(`Prenda agregada: ${p.product.name}`, 'success');
              }}>
                <div className={styles.prodDetails}>
                  <p className={styles.prodName}>{p.product.name}</p>
                  <p className={styles.prodSKU}>{p.sku}</p>
                  <div className={styles.badgesRow}>
                    <Badge variant="secondary">{p.size}</Badge>
                    <Badge variant="secondary">{p.color}</Badge>
                  </div>
                </div>
                <div className={styles.prodFooter}>
                  <span className={styles.prodPrice}>{formatCurrency(p.price_override)}</span>
                  <button className={styles.addCircle}>
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel: Shopping Cart & Totals */}
      <div className={styles.rightPanel}>
        <div className={styles.cartCard}>
          <div className={styles.cartHeader}>
            <div className={styles.cartHeaderTitle}>
              <ShoppingCart size={20} />
              <span>Carrito de Compras</span>
            </div>
            {cart.length > 0 && (
              <Badge variant="destructive">{cart.length} prendas</Badge>
            )}
          </div>

          <div className={styles.cartItems}>
            {cart.length === 0 ? (
              <div className={styles.emptyCart}>
                <ShoppingCart size={40} className={styles.emptyIcon} />
                <p>Escanea prendas con la pistola o selecciónalas del panel.</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.variant_id} className={styles.cartItem}>
                  <div className={styles.itemMain}>
                    <p className={styles.itemName}>{item.variant.product.name}</p>
                    <p className={styles.itemDetails}>{item.variant.sku} • {item.variant.size} • {item.variant.color}</p>
                  </div>
                  <div className={styles.itemActions}>
                    <div className={styles.quantityControls}>
                      <button onClick={() => updateCartQuantity(item.variant_id, item.quantity - 1)}>
                        <Minus size={14} />
                      </button>
                      <span>{item.quantity}</span>
                      <button onClick={() => updateCartQuantity(item.variant_id, item.quantity + 1)}>
                        <Plus size={14} />
                      </button>
                    </div>
                    
                    {/* Inline Item Discount */}
                    <button
                      className={styles.discountBtn}
                      onClick={() => {
                        const amt = prompt('Ingresa el monto de descuento en pesos para este artículo:');
                        if (amt !== null) {
                          applyItemDiscount(item.variant_id, parseFloat(amt || '0'));
                          addToast('Descuento aplicado al artículo', 'success');
                        }
                      }}
                    >
                      <Tag size={12} />
                      <span>{item.discount > 0 ? `-${formatCurrency(item.discount)}` : 'Dcto'}</span>
                    </button>

                    <span className={styles.itemTotal}>{formatCurrency(item.total)}</span>
                    <button onClick={() => {
                      removeFromCart(item.variant_id);
                      addToast('Artículo removido del carrito', 'info');
                    }} className={styles.deleteBtn}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Checkout Panel */}
          {cart.length > 0 && (
            <div className={styles.totalsPanel}>
              {/* Apply Global Discount Form */}
              <form onSubmit={handleApplyGlobalDiscount} className={styles.discountForm}>
                <Input
                  placeholder="Monto descuento global ($)..."
                  value={manualDiscountAmount}
                  onChange={(e) => setManualDiscountAmount(e.target.value)}
                  type="number"
                  id="global-discount-input"
                />
                <Button size="sm" variant="outline" type="submit">Aplicar</Button>
              </form>

              <div className={styles.totalsRow}>
                <span>Subtotal prendas</span>
                <span>{formatCurrency(totals.subtotal)}</span>
              </div>
              {totals.itemDiscounts > 0 && (
                <div className={[styles.totalsRow, styles.discountRow].join(' ')}>
                  <span>Descuentos artículos</span>
                  <span>-{formatCurrency(totals.itemDiscounts)}</span>
                </div>
              )}
              {totals.globalDiscount > 0 && (
                <div className={[styles.totalsRow, styles.discountRow].join(' ')}>
                  <span>Descuento global</span>
                  <span>-{formatCurrency(totals.globalDiscount)}</span>
                </div>
              )}
              <div className={styles.totalsRow}>
                <span>IVA (19%)</span>
                <span>{formatCurrency(totals.tax)}</span>
              </div>
              <div className={[styles.totalsRow, styles.grandTotalRow].join(' ')}>
                <span>Total a Cobrar</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>

              <div className={styles.paymentSection}>
                <label className={styles.paymentLabel}>Método de Pago:</label>
                <select
                  value={selectedPayment}
                  onChange={(e) => setSelectedPayment(e.target.value)}
                  className={styles.paymentSelect}
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Tarjeta">Tarjeta de Crédito/Débito</option>
                  <option value="Transferencia">Transferencia Bancaria</option>
                </select>
              </div>

              <Button variant="success" className={styles.checkoutBtn} onClick={handleCheckout}>
                <DollarSign size={18} />
                <span>Cobrar y Generar Factura</span>
              </Button>
            </div>
          )}
        </div>

        {/* Shift closure */}
        <div className={styles.closureCard}>
          <h3 className={styles.closureTitle}>Cierre de Caja y Arqueo Diario</h3>
          <div className={styles.closureForm}>
            <Input
              placeholder="Contar Efectivo Físico..."
              type="number"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              id="actual-cash-closure-input"
            />
            <Button variant="outline" size="sm" onClick={handleCloseShift}>
              Cerrar Turno Hoy
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POS;
