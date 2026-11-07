// Smoke NO destructivo (M36): solo lectura del catálogo y estado local del navegador (el carrito vive en localStorage).
// No crea pedidos, no escribe en la BD y no toca el pago. Agnóstico a los datos: sirve igual con el backend sintético
// local y con Supabase QA detrás de un Preview (usa el primer producto comprable que encuentre).
import { test, expect } from './fixtures.js';

const sizeButtons = (page) => page.locator('button[aria-label^="Talla "]');
const enabledSizes = (page) => page.locator('button[aria-label^="Talla "]:not([disabled])');

/** Abre el primer producto del catálogo que tenga al menos una talla disponible. Devuelve su ruta. */
async function openFirstPurchasableProduct(page) {
  await page.goto('/ropa');
  const links = page.locator('a[href^="/producto/"]');
  await expect(links.first()).toBeVisible();
  const hrefs = [...new Set(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href'))))].slice(0, 8);
  for (const href of hrefs) {
    await page.goto(href);
    // el producto se carga de forma asíncrona: esperar a que se pinten las tallas antes de contar las disponibles
    await sizeButtons(page).first().waitFor({ timeout: 8000 }).catch(() => {});
    if (await enabledSizes(page).count() > 0) return href;
  }
  test.skip(true, 'ningún producto del catálogo tiene tallas disponibles (no se puede probar el carrito)');
}

async function addFirstAvailableSizeToCart(page) {
  const size = enabledSizes(page).first();
  await size.click();
  await expect(size).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'AGREGAR AL CARRITO' }).first().click();
}

test.describe('smoke · tienda (solo lectura)', () => {
  test('home carga con marca, navegación principal y sin errores', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByText('J&M FASHION STORE').first()).toBeVisible();
    for (const label of ['ROPA', 'OFERTAS']) await expect(page.getByRole('link', { name: label, exact: true }).first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('catálogo lista productos con nombre y precio', async ({ page }) => {
    await page.goto('/ropa');
    await expect(page.getByText(/MOSTRANDO \d+ PRENDAS?/)).toBeVisible();
    const cards = page.locator('a[href^="/producto/"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(page.getByText(/\$\s?\d/).first()).toBeVisible();
  });

  test('detalle de producto muestra nombre, precio, tallas y botón de compra', async ({ page }) => {
    await openFirstPurchasableProduct(page);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByText(/\$\s?\d/).first()).toBeVisible();
    expect(await sizeButtons(page).count()).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'AGREGAR AL CARRITO' }).first()).toBeVisible();
  });

  test('selección de variante: talla marcada y color (si hay más de uno)', async ({ page }) => {
    await openFirstPurchasableProduct(page);
    const size = enabledSizes(page).first();
    await size.click();
    await expect(size).toHaveAttribute('aria-pressed', 'true');
    const colors = page.locator('button[aria-label^="Color "]');
    if (await colors.count() > 1) {
      const second = colors.nth(1);
      const name = (await second.getAttribute('aria-label')).replace(/^Color /, '');
      await second.click();
      await expect(page.getByText(`COLOR: ${name}`, { exact: false })).toBeVisible();
    }
  });

  test('añadir al carrito y verlo en la página del carrito', async ({ page }) => {
    await openFirstPurchasableProduct(page);
    await addFirstAvailableSizeToCart(page);
    await page.goto('/carrito');
    await expect(page.getByText('CARRITO DE COMPRAS (1)')).toBeVisible();
    await expect(page.getByRole('button', { name: /Eliminar/ }).first()).toBeVisible();
    await expect(page.getByText(/TOTAL/).first()).toBeVisible();
  });

  test('el carrito persiste tras recargar y permite cambiar la cantidad', async ({ page }) => {
    await openFirstPurchasableProduct(page);
    await addFirstAvailableSizeToCart(page);
    await page.goto('/carrito');
    await page.reload();
    await expect(page.getByText('CARRITO DE COMPRAS (1)')).toBeVisible();
    // Subir la cantidad: o sube a 2, o la tienda avisa del tope de stock (ambos comportamientos son correctos).
    await page.getByRole('button', { name: /Aumentar cantidad/ }).first().click();
    await expect(page.getByText(/Solo hay \d+|\b2\b/).first()).toBeVisible();
    await page.getByRole('button', { name: /Disminuir cantidad/ }).first().click();
    await expect(page.getByText('CARRITO DE COMPRAS (1)')).toBeVisible();
  });

  test('eliminar el producto deja el carrito vacío', async ({ page }) => {
    await openFirstPurchasableProduct(page);
    await addFirstAvailableSizeToCart(page);
    await page.goto('/carrito');
    await page.getByRole('button', { name: /Eliminar/ }).first().click();
    await expect(page.getByText('actualmente vacío')).toBeVisible();
    await expect(page.getByText('CARRITO DE COMPRAS (0)')).toBeVisible();
  });
});
