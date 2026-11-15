// E2E de navegador SIN Docker (M33): Vite real + Chromium real contra un backend sintético en memoria
// (e2e/synthetic/backend.cjs). Solo se emula la dependencia externa (Supabase); Wompi NO está conectado:
// el pago no se simula como real (ver recorrido 6). Uso:  node apps/web/e2e/e2e_synthetic.cjs
// Salida con código 1 si falla algún recorrido. Solo escucha en 127.0.0.1.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { chromium } = require('playwright');
const backend = require('./synthetic/backend.cjs');

const ROOT = path.resolve(__dirname, '../../..');
const WEB = path.join(ROOT, 'apps/web');
const API = 54321; const APP = Number(process.env.E2E_PORT || 3110);
const BASE = `http://127.0.0.1:${APP}`; const API_URL = `http://127.0.0.1:${API}`;

// Variables del fixture público de CI (config/env/local-ci.env: valores ficticios, no son credenciales).
function ciEnv() {
  const out = {};
  for (const l of fs.readFileSync(path.join(ROOT, 'config/env/local-ci.env'), 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m) out[m[1]] = m[2]; }
  return out;
}
const j = (r) => r.json();
const reset = () => fetch(`${API_URL}/__reset`).then(j);
const state = () => fetch(`${API_URL}/__state`).then(j);

const results = [];
async function journey(name, fn, browser, allowConsole = null, ctxOpts = { viewport: { width: 1280, height: 900 } }) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  await reset();
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const problems = [];
  page.on('dialog', (d) => d.accept().catch(() => {})); // confirmaciones nativas de la interfaz
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|wompi|\/api\/wompi|net::ERR/i.test(m.text()) && !(allowConsole && allowConsole.test(m.text()))) problems.push(`console.error: ${m.text().slice(0, 160)}`); });
  if (process.env.E2E_DEBUG) { page.on('framenavigated', (f) => console.log('   nav', f.url())); page.on('dialog', (d) => console.log('   dialog', d.message().slice(0, 50))); }
  const t0 = Date.now(); let ok = true; let detail = '';
  try { await fn(page, ctx); } catch (e) { ok = false; if (process.env.E2E_DEBUG) console.log(e.message); detail = String(e.message).split('\n')[0]; await page.screenshot({ path: path.join(WEB, 'e2e', `fail-${name.replace(/\W+/g, '_')}.png`) }).catch(() => {}); }
  if (ok && problems.length) { ok = false; detail = `errores de consola/página: ${problems.slice(0, 2).join(' · ')}`; }
  results.push({ name, ok, ms: Date.now() - t0, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`);
  await ctx.close();
}

const expectText = async (page, text, timeout = 8000) => page.getByText(text, { exact: false }).first().waitFor({ timeout });
async function addToCart(page, slug, size, color) {
  await page.goto(`${BASE}/producto/${slug}`);
  if (color) await page.getByRole('button', { name: `Color ${color}` }).click();
  await page.getByRole('button', { name: `Talla ${size}`, exact: true }).click();
  await page.getByRole('button', { name: 'AGREGAR AL CARRITO' }).first().click();
}
async function fillCheckout(page, over = {}) {
  const f = { firstName: 'Juan', lastName: 'Pérez', email: 'juan@correo.co', phone: '3001234567', city: 'Medellín', address: 'Calle 10 # 5-20', ...over };
  // Ejecución 146: causa del recorrido 30 intermitente. Con sesión, el checkout completa nombre/correo/teléfono VACÍOS
  // cuando llegan el usuario y su perfil (asíncrono). Si eso cae entre el «seleccionar todo» y el «insertar texto» de
  // fill(), el texto se añade al valor completado («sara@correo.cosara@correo.co»). Se comprueba y se repite.
  for (const k of ['firstName', 'lastName', 'email', 'phone', 'city', 'address']) {
    const input = page.locator(`input[name=${k}]`);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await input.fill(f[k]);
      if ((await input.inputValue()) === f[k]) break;
    }
  }
  await page.locator('select[name=department]').selectOption({ label: 'Antioquia' });
}
const login = async (page, url, email, password, submit) => {
  await page.goto(`${BASE}${url}`);
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: submit }).click();
};

// Móvil: la página no debe desplazarse en horizontal; si lo hace, nombra los elementos que se salen.
async function assertNoHorizontalOverflow(page, where) {
  const measure = () => page.evaluate(async () => {
    // mide con las animaciones/transiciones terminadas (p. ej. un aviso que entra desde la derecha)
    await Promise.race([Promise.all(document.getAnimations().map((x) => x.finished.catch(() => {}))), new Promise((ok) => setTimeout(ok, 1500))]);
    const vw = document.documentElement.clientWidth;
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const off = [];
    if (sw > vw) {
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width && (b.right > vw + 1 || b.left < -1)) {
          let clipped = false; // dentro de un contenedor con overflow oculto/desplazable no desborda la página
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o !== 'visible') { clipped = true; break; } }
          const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30);
          if (!clipped) off.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}«${label}»[${Math.round(b.left)},${Math.round(b.right)}]`);
        }
      }
    }
    return { vw, sw, off: off.slice(-6) };
  });
  let r = await measure();
  if (r.sw > r.vw) { if (process.env.E2E_DEBUG) console.log(`   desborde transitorio en ${where}: ${r.off.join(' ')}`); await page.waitForTimeout(500); r = await measure(); } // solo cuenta si persiste
  if (r.sw > r.vw) throw new Error(`${where}: desborde horizontal ${r.sw}px > ${r.vw}px · ${r.off.join(' ')}`);
}
// Móvil: el control está dentro del ancho de la pantalla y su tamaño táctil es razonable (≥ 32 px de alto).
async function assertTappable(locator, where) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  const vw = await locator.page().evaluate(() => document.documentElement.clientWidth);
  if (!b) throw new Error(`${where}: control no visible`);
  if (b.x < 0 || b.x + b.width > vw + 1) throw new Error(`${where}: control fuera de pantalla (${Math.round(b.x)}–${Math.round(b.x + b.width)} de ${vw})`);
  if (b.height < 32) throw new Error(`${where}: control de ${Math.round(b.height)} px de alto (< 32)`);
}
// Móvil: comprueba TODOS los controles visibles de `scope` (botones, enlaces, selectores y campos de texto) y
// acumula los fallos en `failures`; los enlaces dentro de una frase —`p a`— quedan fuera (excepción de
// enlace en línea de WCAG 2.5.8). Devuelve cuántos controles comprobó.
async function checkAllControls(page, scope, where, failures) {
  const controls = page.locator(['button', 'a:not(p a)', 'select', 'input:not([type=checkbox]):not([type=radio]):not([type=file])', 'textarea'].map((x) => `${scope} ${x}:visible`).join(', '));
  const n = await controls.count();
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i);
    const label = ((await c.getAttribute('aria-label')) || (await c.innerText().catch(() => '')) || (await c.getAttribute('placeholder')) || '').trim().slice(0, 30);
    await assertTappable(c, `${where} «${label}»`).catch((e) => failures.push(e.message));
  }
  return n;
}
// Móvil (D114/D115): a 375 y 320 px, con fuentes ensanchadas salvo `NO_WIDEN`, mide cada pantalla de `list`
// ([url, abrir (o null), nombre del diálogo (o null: se mide `main`), texto que indica que cargó]): ningún control
// fuera de la pantalla (`html, body { overflow-x: hidden }` corta en vez de desbordar), ningún contenedor que se
// desplace en X escondiendo contenido (salvo tablas y carruseles con snap), la página sin desborde. Con `links`
// también se miden los enlaces y el pie de página. Acumula en `failures`.
async function measureMobileScreens(p, list, failures, { links = false } = {}) {
  for (const width of [375, 320]) {
    await p.setViewportSize({ width, height: 812 });
    for (const [url, opener, dialog, text] of list) {
      await p.goto(`${BASE}${url}`);
      await p.locator('main').first().waitFor({ timeout: 10000 });
      await p.waitForLoadState('networkidle').catch(() => {});
      // D116: el recorrido 69 falló una vez en CI con solo «locator.waitFor: Timeout 8000ms» (sin decir qué pantalla);
      // ahora el error nombra pantalla, ancho y texto esperado, e incluye el comienzo de lo que sí se veía.
      const seen = async () => (await p.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
      if (text) await p.getByText(text, { exact: false }).first().waitFor({ timeout: 15000 }).catch(async () => { throw new Error(`${width}px ${url}: no apareció «${text}»; se veía: «${await seen()}»`); });
      if (opener) await opener(p).click();
      if (dialog) { await p.getByRole('dialog', { name: dialog }).waitFor({ timeout: 8000 }).catch(async () => { throw new Error(`${width}px ${url}: no se abrió «${dialog}»; se veía: «${await seen()}»`); }); await p.waitForTimeout(400); }
      if (!process.env.NO_WIDEN) await p.addStyleTag({ content: 'body *{letter-spacing:0.06em !important} input,select,textarea{font-size:1.05rem !important}' });
      await p.waitForTimeout(250);
      const where = `${width}px ${url}${dialog ? ` · ${dialog}` : ''}`;
      const r = await p.evaluate(({ isDialog, links }) => {
        const vw = document.documentElement.clientWidth;
        const root = isDialog ? [...document.querySelectorAll('[role=dialog]')].pop() : document.querySelector('main');
        const name = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}«${(el.getAttribute('aria-label') || el.textContent || el.placeholder || el.name || '').trim().slice(0, 24)}»`;
        const bad = []; let controls = 0;
        const sel = `input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea, button${links ? ', a[href]' : ''}`;
        // con `links`, también el pie de página (fuera de `main`): enlaces, boletín y redes
        const footer = !isDialog && links ? [...document.querySelectorAll('footer')].flatMap((x) => [...x.querySelectorAll(sel)]) : [];
        for (const el of [...root.querySelectorAll(sel), ...footer]) {
          const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
          controls += 1;
          let clipped = false; // dentro de una tabla o un carrusel desplazable propio: intencional
          for (let a = el.parentElement; a && a !== root && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if ((a.querySelector(':scope > table') || cs.scrollSnapType !== 'none') && cs.overflowX !== 'visible') { clipped = true; break; } }
          if (!clipped && (b.left < -0.5 || b.right > vw + 0.5)) bad.push(`${name(el)}[${b.left.toFixed(0)},${b.right.toFixed(0)}]`);
        }
        // `html, body { overflow-x: hidden }`: lo que se sale por la derecha no desborda, se corta. Los iconos de la
        // cabecera (búsqueda, cuenta, favoritos, carrito) deben quedar enteros en la pantalla.
        for (const el of document.querySelectorAll('header .header-action-btn, header .header-icon-touch, .jm-admin-header button, .jm-admin-header input, .jm-admin-header > div')) {
          const b = el.getBoundingClientRect(); if (b.width && (b.left < -0.5 || b.right > vw + 0.5)) bad.push(`cabecera ${name(el)}[${b.left.toFixed(0)},${b.right.toFixed(0)}]`);
        }
        const scrollers = []; // contenedores que se desplazan en X sin ser una tabla ni un carrusel con snap
        for (const el of [root, ...root.querySelectorAll('*'), ...(!isDialog && links ? document.querySelectorAll('footer, footer *') : [])]) {
          const cs = getComputedStyle(el);
          if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1 && !el.querySelector(':scope > table') && cs.scrollSnapType === 'none') scrollers.push(`${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
        }
        const rb = root.getBoundingClientRect();
        return { vw, sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), bad, scrollers, controls, rootOut: rb.left < -0.5 || rb.right > vw + 0.5 };
      }, { isDialog: !!dialog, links });
      if (process.env.E2E_DEBUG) console.log(where, r.controls, r.bad.join(' '), '|', r.scrollers.join(' '), r.sw);
      if (process.env.E2E_DEBUG && r.sw > r.vw) console.log('   ancho:', await p.evaluate(() => { const vw = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter((el) => { const b = el.getBoundingClientRect(); const pb = el.parentElement.getBoundingClientRect(); return b.width && b.right > vw + 0.5 && !(pb.right > vw + 0.5); }).slice(0, 5).map((el) => `${el.tagName}.${el.className}«${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}» r=${el.getBoundingClientRect().right.toFixed(0)}`).join(' ; '); }));
      if (r.bad.length) failures.push(`${where}: ${r.bad.slice(0, 3).join(' ')}`);
      else if (r.scrollers.length) failures.push(`${where}: se desplaza en horizontal ${r.scrollers.slice(0, 2).join(' ')}`);
      else if (r.rootOut) failures.push(`${where}: el panel se sale de la pantalla`);
      else if (r.sw > r.vw) failures.push(`${where}: desborde ${r.sw}px > ${r.vw}px`);
    }
  }
}
// Teclado en modales (D71): abre con Enter desde el control enfocado, el foco entra en el diálogo, Tab y Mayús+Tab
// no salen de él (una vuelta completa + 1), Escape lo cierra y el foco vuelve al control que lo abrió.
async function checkDialogKeyboard(page, opener, dialogName, where, failures) {
  const fail = (m) => { failures.push(`${where}: ${m}`); };
  await opener.waitFor({ timeout: 8000 });
  const handle = await opener.elementHandle();
  await opener.focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('dialog', { name: dialogName });
  try { await dlg.waitFor({ timeout: 8000 }); } catch { fail('no se abrió con Enter'); return false; }
  await page.waitForTimeout(150);
  const inside = () => dlg.evaluate((d) => d.contains(document.activeElement));
  if (!(await inside())) fail('el foco no entró en el diálogo al abrir');
  const n = await dlg.evaluate((d) => d.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])').length);
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i <= n; i++) {
      await page.keyboard.press(key);
      if (!(await inside())) { fail(`${key} sacó el foco del diálogo (paso ${i + 1} de ${n + 1})`); break; }
    }
  }
  await page.keyboard.press('Escape');
  try { await dlg.waitFor({ state: 'detached', timeout: 5000 }); } catch { fail('Escape no cerró el diálogo'); return false; }
  const back = await handle.evaluate((el) => el.isConnected && el === document.activeElement).catch(() => false);
  if (!back) fail('el foco no volvió al control que abrió el diálogo');
  return true;
}
// Accesibilidad (D77): nombres accesibles calculados por el propio Chromium (árbol de accesibilidad por CDP, sin
// dependencia nueva: axe-core no está en el lockfile) y contraste de texto WCAG 1.4.3 medido en la página.
const NAMED_ROLES = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'listbox', 'menuitem', 'tab', 'image', 'img', 'dialog']);
// `scope` (opcional): selector de un modal abierto; solo se mide su texto y se desplaza su propio contenedor con scroll.
async function auditA11y(page, where, failures, scope = null) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(300);
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable'); await cdp.send('Accessibility.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    for (const n of nodes) {
      const role = n.role?.value;
      if (n.ignored || !NAMED_ROLES.has(role) || (n.name?.value || '').trim()) continue;
      let html = '?';
      try {
        const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId });
        const r = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true,
          functionDeclaration: 'function(){ const v = this.checkVisibility ? this.checkVisibility({ visibilityProperty: true }) : true; return { v, html: this.outerHTML.replace(/\\s+/g, " ").slice(0, 110) }; }' });
        if (!r.result.value.v) continue; // oculto: no lo anuncia nadie
        html = r.result.value.html;
      } catch { /* nodo efímero */ }
      failures.push(`${where}: ${role} sin nombre accesible ${html}`);
    }
  } finally { await cdp.detach().catch(() => {}); }
  const low = await page.evaluate(async (scope) => {
    const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [r, g, b, a]; };
    const over = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map((i) => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a); };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const out = []; const seen = new Set();
    const vh = window.innerHeight;
    const root = scope ? document.querySelector(scope) : document.body;
    if (!root) return [`no se encontró ${scope}`];
    // contenedor que se desplaza: la ventana o, dentro de un modal, el elemento con scroll más alto
    let scroller = null;
    if (scope) for (const e of [root, ...root.querySelectorAll('*')]) { const o = getComputedStyle(e).overflowY; if (/(auto|scroll)/.test(o) && e.scrollHeight > e.clientHeight + 2 && (!scroller || e.scrollHeight > scroller.scrollHeight)) scroller = e; }
    const H = scope ? (scroller ? scroller.scrollHeight : 1) : document.documentElement.scrollHeight;
    const step = scroller ? Math.max(100, scroller.clientHeight - 60) : Math.max(200, vh - 100);
    for (let y = 0; y < H; y += step) {
      if (scroller) scroller.scrollTop = y; else if (!scope) window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const el = t.parentElement; const txt = t.textContent.trim();
        if (!el || !txt || seen.has(t) || el.closest('script,style,noscript,[disabled],[aria-disabled="true"],option,[aria-hidden="true"]')) continue;
        const range = document.createRange(); range.selectNodeContents(t);
        const rect = [...range.getClientRects()].find((r) => r.width > 2 && r.height > 2);
        if (!rect) continue;
        const cx = rect.left + Math.min(rect.width / 2, 8); const cy = rect.top + rect.height / 2;
        if (cy < 0 || cy > vh || cx < 0 || cx > window.innerWidth) continue;
        seen.add(t);
        const cs = getComputedStyle(el);
        if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
        let fg = parse(cs.color); if (!fg) continue;
        let op = 1; for (let a = el; a; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
        if (op < 0.1) continue;
        // pila de capas en el punto: el texto debe estar arriba (si otra capa lo tapa, no se ve y no se mide)
        const stack = document.elementsFromPoint(cx, cy);
        // (un elemento con pointer-events:none no sale en la pila: se toman él y sus antecesores hasta el primero que sí)
        let start = stack.indexOf(el); let layers;
        if (start < 0) {
          start = stack.findIndex((s) => s.contains(el)); if (start < 0 || stack.slice(0, start).some((s) => !el.contains(s))) continue;
          layers = []; for (let a = el; a && a !== stack[start]; a = a.parentElement) layers.push(a);
          layers = layers.concat(stack.slice(start));
        } else if (stack.slice(0, start).some((s) => !el.contains(s))) continue;
        else layers = stack.slice(start);
        // capas debajo del texto: si alguna es imagen/vídeo/degradado el fondo no se conoce → no se mide
        let bg = [0, 0, 0, 0]; let unknown = false;
        for (const s of layers) {
          const sc = getComputedStyle(s);
          if (s !== el && /^(IMG|VIDEO|CANVAS|PICTURE|IFRAME)$/i.test(s.tagName)) { unknown = true; break; }
          if (sc.backgroundImage !== 'none') { unknown = true; break; }
          const c = parse(sc.backgroundColor); if (c && c[3]) { bg = over(bg, c); if (bg[3] > 0.99) break; }
        }
        if (unknown) continue;
        if (bg[3] < 0.99) bg = over(bg, [255, 255, 255, 1]);
        fg = [fg[0], fg[1], fg[2], fg[3] * op]; const fgc = over(fg, bg);
        const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
        const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
        const r = ratio(fgc, bg);
        if (r + 0.005 < need) out.push(`${el.tagName.toLowerCase()}«${txt.slice(0, 28)}» ${r.toFixed(2)}:1 < ${need} (${cs.color} sobre rgb(${bg.slice(0, 3).map(Math.round).join(',')}), ${size}px)`);
      }
    }
    if (scroller) scroller.scrollTop = 0; else if (!scope) window.scrollTo(0, 0);
    return [...new Set(out)];
  }, scope);
  for (const l of low) failures.push(`${where}: contraste ${l}`);
}
const MOBILE = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

// Ejecución 113/114: tras un envío inválido, el foco debe quedar en el control culpable con aria-invalid y un aviso
// enlazado (aria-describedby) que exista, se vea y esté dentro de la pantalla. Lo usan los recorridos 45 y 46.
function makeFocusChecker(p, failures, checked) {
  return async (where, { text, invalid = true, name = null } = {}) => {
    await p.waitForTimeout(150); // el foco se mueve en el siguiente frame (requestAnimationFrame)
    const r = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { none: true };
      const vh = window.innerHeight; const vw = window.innerWidth;
      const inView = (n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < vh && b.right > 0 && b.left < vw; };
      const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const msgs = ids.map((id) => {
        const m = document.getElementById(id);
        if (!m) return { id, missing: true };
        const cs = getComputedStyle(m); const b = m.getBoundingClientRect();
        return { id, text: m.textContent.trim(), visible: cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0, inView: inView(m) };
      });
      const label = el.getAttribute('aria-label') || (el.labels && el.labels[0] ? el.labels[0].textContent.trim() : '') || el.id || el.tagName;
      const fb = el.getBoundingClientRect();
      return { tag: el.tagName, label, invalid: el.getAttribute('aria-invalid'), msgs, fieldInView: inView(el), pos: `campo y=${Math.round(fb.top)}..${Math.round(fb.bottom)} vh=${vh} scrollY=${Math.round(window.scrollY)} url=${location.pathname}` };
    });
    if (r.none) { failures.push(`${where}: el foco no quedó en ningún control`); return; }
    const who = `${where} [${r.tag} «${r.label}»]`;
    if (name && !name.test(r.label)) failures.push(`${who}: el foco quedó en otro control (se esperaba ${name})`);
    if (invalid && r.invalid !== 'true') failures.push(`${who}: aria-invalid=${r.invalid}`);
    if (!r.msgs.length) failures.push(`${who}: sin aria-describedby`);
    for (const m of r.msgs) {
      if (m.missing) failures.push(`${who}: aria-describedby → #${m.id} no existe`);
      else if (!m.visible || !m.text) failures.push(`${who}: el aviso #${m.id} no es visible`);
      else if (!m.inView) failures.push(`${who}: el aviso #${m.id} queda fuera de la pantalla`);
    }
    if (text && !r.msgs.some((m) => text.test(m.text || ''))) failures.push(`${who}: el aviso no dice ${text} (dice «${r.msgs.map((m) => m.text).join(' | ')}»)`);
    if (!r.fieldInView) failures.push(`${who}: el campo con foco queda fuera de la pantalla (${r.pos})`);
    checked.push(where);
  };
}

async function main() {
  const be = await backend.start(API);
  const env = { ...process.env, ...ciEnv() };
  const vite = spawn(path.join(WEB, 'node_modules/.bin/vite'), ['--port', String(APP), '--host', '127.0.0.1', '--strictPort'], { cwd: WEB, env, stdio: 'ignore' });
  const stop = async () => { vite.kill(); await be.close(); };
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* arrancando */ } await new Promise((r) => setTimeout(r, 500)); }
    const browser = await chromium.launch();

    await journey('1. Catálogo: navegación y filtro por categoría', async (p) => {
      await p.goto(`${BASE}/ropa`);
      await expectText(p, 'MOSTRANDO 2 PRENDAS');
      await p.getByText('Camiseta Básica').first().waitFor(); await p.getByText('Polo Clásico').first().waitFor();
      await p.getByText('Camisetas (2)').first().click();
      await p.getByText('Camiseta Básica').first().click();
      await p.waitForURL(/\/producto\/camiseta-basica/);
    }, browser);

    await journey('15. Catálogo: búsqueda sin tildes, ocasión real y filtros en móvil', async (p) => {
      // búsqueda desde la cabecera, sin tilde: «clasico» encuentra «Polo Clásico»
      await p.goto(`${BASE}/ropa?q=clasico`);
      await expectText(p, 'MOSTRANDO 1 PRENDAS');
      await p.getByText('Polo Clásico').first().waitFor();
      if (await p.getByText('Camiseta Básica').count()) throw new Error('la búsqueda devolvió la camiseta');
      // ocasión con el nombre de la BD (no de mockData)
      await p.goto(`${BASE}/ropa`);
      await expectText(p, 'MOSTRANDO 2 PRENDAS');
      if (await p.getByText('TRABAJO & OFICINA').count()) throw new Error('aún se muestran ocasiones de mockData');
      await p.locator('aside').getByRole('button', { name: 'Oficina', exact: true }).click();
      await expectText(p, 'MOSTRANDO 1 PRENDAS');
      // precio: sin límite por defecto; el tope del control es el precio real más alto
      const max = await p.locator('aside input[aria-label="Precio máximo"]').getAttribute('max');
      if (max !== '120000') throw new Error(`tope de precio ${max}`);
      // móvil: el panel incluye talla y precio, y filtra
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto(`${BASE}/ropa`);
      await expectText(p, 'MOSTRANDO 2 PRENDAS');
      await p.getByRole('button', { name: /FILTRAR/ }).click();
      const drawer = p.locator('.modal-overlay');
      await drawer.getByText('PRECIO MÁXIMO').waitFor();
      await drawer.getByRole('button', { name: 'S', exact: true }).click();
      await drawer.getByRole('button', { name: /VER RESULTADOS \(1\)/ }).click();
      await expectText(p, 'MOSTRANDO 1 PRENDAS');
      await p.getByText('Camiseta Básica').first().waitFor();
    }, browser);

    await journey('16. Portada: líneas, categorías y ocasiones desde la BD', async (p) => {
      await p.goto(`${BASE}/`);
      // BD sintética: 1 categoría (Camisetas), 1 línea (Urbana) y 1 ocasión (Oficina) con productos
      await p.locator('.featured-categories-grid a[href="/ropa/camisetas"]').waitFor({ timeout: 8000 });
      await p.locator('.occasions-grid a[href="/colecciones?ocasion=oficina"]').waitFor();
      const hrefs = await p.$$eval('.featured-categories-grid a, .occasions-grid a', (as) => as.map((a) => a.getAttribute('href')));
      for (const stale of ['/ropa/jeans', '/ropa/accesorios', '/colecciones?ocasion=trabajo']) if (hrefs.includes(stale)) throw new Error(`enlace de mockData: ${stale}`);
      if (await p.getByRole('button', { name: 'Explorar línea Elegante' }).count()) throw new Error('línea sin productos visible');
      await p.getByRole('button', { name: 'Explorar línea Urbana' }).click();
      await p.waitForURL(/\/linea\/urbana/);
      await expectText(p, 'MOSTRANDO 2 PRENDAS');
      await p.goto(`${BASE}/`);
      await p.locator('a[href="/colecciones?ocasion=oficina"]').first().click();
      await expectText(p, 'MOSTRANDO 1 PRENDAS');
      await p.getByText('Polo Clásico').first().waitFor();
    }, browser);

    await journey('21. Portada: boletín «Únete al club J&M» guarda el correo en la BD', async (p) => {
      await p.goto(`${BASE}/`);
      const form = p.locator('section[aria-labelledby="jm-newsletter-title"]');
      await form.scrollIntoViewIfNeeded();
      if (/10\s*%/.test(await form.textContent())) throw new Error('el boletín sigue prometiendo un 10% inexistente');
      const input = form.getByLabel('Correo electrónico para el boletín');
      await input.fill('club@');
      await form.getByRole('button', { name: 'Suscribirme' }).click();
      await form.getByRole('alert').filter({ hasText: 'nombre@dominio' }).waitFor();
      if ((await state()).newsletter.length) throw new Error('se guardó un correo inválido');
      await input.fill('  Club.Cliente@Example.co ');
      await form.getByRole('button', { name: 'Suscribirme' }).click();
      await form.getByRole('status').filter({ hasText: 'quedó registrado' }).waitFor();
      const subs = (await state()).newsletter;
      if (subs.length !== 1 || subs[0].email_normalized !== 'club.cliente@example.co' || subs[0].source !== 'home') throw new Error(`suscriptores: ${JSON.stringify(subs)}`);
      // repetir con otra capitalización no duplica
      await p.reload(); await form.scrollIntoViewIfNeeded();
      await input.fill('CLUB.cliente@example.co');
      await form.getByRole('button', { name: 'Suscribirme' }).click();
      await form.getByRole('status').waitFor();
      if ((await state()).newsletter.length !== 1) throw new Error('suscripción duplicada');
    }, browser);

    await journey('22. Catálogo: agregado rápido con el color elegido en la tarjeta', async (p) => {
      await p.setViewportSize({ width: 1440, height: 900 });
      await p.goto(`${BASE}/ropa`);
      // única tarjeta de la camiseta en /ropa: las etiquetas de sus botones son únicas en la página
      await p.getByRole('group', { name: 'Colores de Camiseta Básica' }).waitFor({ timeout: 8000 });
      await p.getByRole('heading', { name: 'Camiseta Básica' }).hover();
      // Negro por defecto: S no existe en Negro; tras elegir Blanco, M agotada y S disponible
      await p.getByRole('button', { name: 'Camiseta Básica en Blanco' }).click();
      const mAgotada = p.getByRole('button', { name: 'Talla M agotada en Blanco' });
      await mAgotada.waitFor();
      if (!(await mAgotada.isDisabled())) throw new Error('talla agotada en Blanco seleccionable');
      await p.getByRole('button', { name: 'Agregar talla S en Blanco al carrito' }).click();
      await p.waitForFunction(() => {
        const items = JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items;
        return items.length === 1 && items[0].sku === 'CAM-S-BLA';
      });
    }, browser);

    await journey('17. Cabecera: menú de líneas y categorías desde la BD', async (p) => {
      await p.setViewportSize({ width: 1440, height: 900 });
      await p.goto(`${BASE}/`);
      const nav = p.locator('nav[aria-label="Navegación principal"]');
      await nav.locator('a[href="/linea/urbana"]').waitFor({ timeout: 8000 });
      // `/linea/urbana` también está en el menú de respaldo (mientras carga la BD): esperar a que termine la lectura
      // antes de mirar los enlaces (ejecución 102: falló 1 de 3 pasadas completas leyendo el respaldo).
      await p.waitForLoadState('networkidle');
      // BD sintética: solo la línea Urbana y la categoría Camisetas (sin Calzado ni Accesorios)
      const desk = await nav.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      for (const stale of ['/linea/elegante', '/linea/casual', '/calzado', '/accesorios']) if (desk.includes(stale)) throw new Error(`enlace fijo en la cabecera: ${stale}`);
      await p.setViewportSize({ width: 390, height: 844 });
      await p.getByRole('button', { name: 'Abrir menú de navegación' }).click();
      const drawer = p.locator('.modal-overlay');
      await drawer.locator('a[href="/ropa/camisetas"]').waitFor();
      if (await drawer.locator('a[href="/ropa/polos"]').count()) throw new Error('subcategoría fija en el menú móvil');
      await drawer.locator('a[href="/ropa/camisetas"]').click();
      await p.waitForURL(/\/ropa\/camisetas/);
    }, browser);

    await journey('2. Producto: precio, talla, color y disponibilidad', async (p) => {
      await p.goto(`${BASE}/producto/camiseta-basica`);
      await expectText(p, '$80.000');
      await p.getByRole('button', { name: 'Color Blanco' }).click();
      await expectText(p, 'COLOR: Blanco');
      // Blanco/M está agotado (0 en stock): no se puede agregar
      const agotada = p.getByRole('button', { name: 'Talla M agotada' });
      await agotada.waitFor();
      if (!(await agotada.isDisabled())) throw new Error('la talla agotada se puede seleccionar');
      // Negro/M sí
      await p.getByRole('button', { name: 'Color Negro' }).click();
      await p.getByRole('button', { name: 'Talla M', exact: true }).click();
      await p.getByRole('button', { name: 'AGREGAR AL CARRITO' }).first().click();
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items.length === 1);
    }, browser);

    await journey('18. Producto: «Encuentra tu talla» sugiere una talla real y la aplica con un color que la tiene', async (p) => {
      await p.goto(`${BASE}/producto/camiseta-basica`);
      await p.getByRole('button', { name: 'Color Blanco' }).click(); // Blanco/M agotado
      await p.getByRole('button', { name: /Encuentra tu talla/ }).click();
      // Ejecución 115: la preferencia de ajuste es un grupo con nombre y expone cuál está elegida (aria-pressed)
      const fitGroup = p.getByRole('group', { name: '¿Cómo te gusta sentir la ropa?' });
      await fitGroup.getByRole('button', { name: 'Normal / Estándar', pressed: true }).waitFor({ timeout: 5000 });
      await fitGroup.getByRole('button', { name: 'Holgada' }).click();
      await fitGroup.getByRole('button', { name: 'Holgada', pressed: true }).waitFor({ timeout: 5000 });
      if ((await fitGroup.getByRole('button', { pressed: true }).count()) !== 1) throw new Error('más de una preferencia de ajuste marcada');
      await fitGroup.getByRole('button', { name: 'Normal / Estándar' }).click();
      await p.getByRole('button', { name: /CALCULAR MI TALLA/ }).click(); // 175 cm / 74 kg / normal → M
      await expectText(p, 'TALLA M');
      const body = await p.textContent('body');
      if (/94\s?%/.test(body)) throw new Error('el recomendador muestra una estadística inventada');
      await p.getByRole('button', { name: 'USAR TALLA M' }).click();
      await p.getByRole('button', { name: 'Talla M', exact: true, pressed: true }).waitFor();
      await p.getByRole('button', { name: 'Color Negro', pressed: true }).waitFor();
      await p.getByRole('button', { name: 'AGREGAR AL CARRITO' }).first().click();
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items.length === 1);
    }, browser);

    await journey('19. Completa el look: talla elegida por prenda, nada se agrega sin elegirla', async (p) => {
      await p.goto(`${BASE}/`); // la sección se monta en la portada
      const look = p.getByRole('region', { name: 'Outfit recomendado Completa el Look' });
      const buy = look.getByRole('button', { name: /COMPRAR EL LOOK COMPLETO/ });
      await buy.click();
      await look.getByText('Elige la talla de: Camiseta Básica').waitFor();
      const cart = () => p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items.map((i) => `${i.sku}`));
      if ((await cart()).length) throw new Error('se agregó algo sin elegir talla');
      await look.getByLabel('Color de Camiseta Básica').selectOption('Blanco');
      const mBlanco = look.getByLabel('Talla de Camiseta Básica').locator('option[value="M"]');
      if (!(await mBlanco.isDisabled())) throw new Error('M/Blanco (agotada) se puede elegir');
      await look.getByLabel('Talla de Camiseta Básica').selectOption('S');
      await buy.click();
      await look.getByText('2 prenda(s) agregada(s) al carrito.').waitFor();
      const skus = (await cart()).sort().join(',');
      if (skus !== 'CAM-S-BLA,POL-M-NEG') throw new Error(`carrito: ${skus}`);
    }, browser);

    await journey('20. Favoritos: «Agregar todo al carrito» con talla elegida por prenda', async (p) => {
      await p.goto(`${BASE}/ropa`);
      await p.getByRole('button', { name: 'Guardar en favoritos: Camiseta Básica' }).first().click();
      await p.getByRole('button', { name: 'Guardar en favoritos: Polo Clásico' }).first().click();
      await p.goto(`${BASE}/cuenta/favoritos`);
      const cart = () => p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items.map((i) => `${i.sku}`));
      const moveAll = p.getByRole('button', { name: /AGREGAR TODO AL CARRITO/ });
      await moveAll.click();
      await p.getByText('Elige la talla de: Camiseta Básica').waitFor();
      if ((await cart()).length) throw new Error('se agregó algo sin elegir talla');
      await p.getByLabel('Color de Camiseta Básica').selectOption('Negro');
      await p.getByLabel('Talla de Camiseta Básica').selectOption('L');
      await moveAll.click();
      await p.getByText('2 prenda(s) agregada(s) al carrito.').waitFor();
      const skus = (await cart()).sort().join(',');
      if (skus !== 'CAM-L-NEG,POL-M-NEG') throw new Error(`carrito: ${skus}`);
    }, browser);

    await journey('3. Carrito: cantidades, límite de stock, persistencia y eliminación', async (p) => {
      await addToCart(p, 'camiseta-basica', 'L', 'Negro'); // L/Negro: solo 1 en stock
      await p.goto(`${BASE}/carrito`);
      await expectText(p, 'CARRITO DE COMPRAS (1)');
      await p.getByRole('button', { name: /Aumentar cantidad/ }).first().click();
      await expectText(p, 'Solo hay 1');
      await p.reload();
      await expectText(p, 'CARRITO DE COMPRAS (1)'); // persistencia tras recargar
      await p.getByRole('button', { name: /Eliminar/ }).first().click();
      await expectText(p, 'actualmente vacío');
    }, browser);

    await journey('4. Cupón y envío: totales de la BD', async (p) => {
      await addToCart(p, 'polo-clasico', 'M'); // 120.000
      await p.goto(`${BASE}/carrito`);
      await expectText(p, '$132.000'); // + envío 12.000
      await p.getByRole('button', { name: /Aumentar cantidad/ }).first().click(); // 240.000 → envío gratis
      await expectText(p, '$240.000');
      await p.getByPlaceholder(/cup[oó]n|c[oó]digo/i).first().fill('JM10');
      await p.getByRole('button', { name: 'APLICAR' }).click();
      await expectText(p, 'JM10');
      await expectText(p, '$216.000'); // 240.000 - 10%
      await p.reload();
      await expectText(p, '$216.000');
      // Textos de envío leídos de shipping_methods (standard: 12.000, gratis desde 200.000), no cifras fijas.
      await p.goto(`${BASE}/envios`);
      await expectText(p, 'ENVÍOS GRATIS EN COLOMBIA POR COMPRAS DESDE $200.000 COP');
      await expectText(p, '$12.000 COP para compras inferiores al monto mínimo');
    }, browser);

    await journey('5. Checkout: validación y creación de pedido con reserva de stock', async (p) => {
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await p.goto(`${BASE}/checkout`);
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await expectText(p, 'Escribe tu nombre'); // validación en el navegador
      await fillCheckout(p);
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/, { timeout: 15000 });
      const st = await state();
      if (st.orders.length !== 1) throw new Error(`pedidos creados: ${st.orders.length} (se esperaba 1)`);
      const o = st.orders[0];
      if (o.total !== 92000) throw new Error(`total del pedido ${o.total} ≠ 92000 (80.000 + 12.000 envío)`);
      if (o.status !== 'payment_pending') throw new Error(`estado ${o.status}`);
      const reserved = st.inventories.find((i) => i.sku === 'CAM-M-NEG').reserved;
      if (reserved !== 1) throw new Error(`stock reservado ${reserved} ≠ 1`);
      // El pago NO se completó (Wompi no está conectado): el carrito debe conservarse
      const items = await p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14')).state.items.length);
      if (items !== 1) throw new Error('el carrito se vació sin pago confirmado');
      // El método de envío del pedido se muestra con su nombre configurado (shipping_methods.name)
      const metodo = await p.getByTestId('order-shipping-method').filter({ hasText: /Estándar/ }).textContent({ timeout: 10000 }).catch(() => p.getByTestId('order-shipping-method').textContent());
      if (!/Estándar/.test(metodo)) throw new Error(`método de envío en la confirmación: «${metodo}»`);
    }, browser);

    await journey('29. Móvil 375×812: portada → catálogo → producto → carrito → checkout sin desbordes', async (p) => {
      await p.goto(`${BASE}/`);
      await p.locator('.featured-categories-grid a[href="/ropa/camisetas"]').waitFor({ timeout: 8000 });
      await assertNoHorizontalOverflow(p, 'portada');
      await p.getByRole('button', { name: 'Abrir menú de navegación' }).tap();
      const drawer = p.locator('.modal-overlay');
      await drawer.locator('a[href="/ropa/camisetas"]').tap();
      await p.waitForURL(/\/ropa\/camisetas/);
      await expectText(p, 'MOSTRANDO 2 PRENDAS');
      await assertNoHorizontalOverflow(p, 'catálogo');
      await p.getByText('Camiseta Básica').first().tap();
      await p.waitForURL(/\/producto\/camiseta-basica/);
      await expectText(p, '$80.000');
      await assertNoHorizontalOverflow(p, 'producto');
      await p.getByRole('button', { name: 'Color Negro' }).tap();
      const talla = p.getByRole('button', { name: 'Talla M', exact: true });
      await assertTappable(talla, 'talla M'); await talla.tap();
      const add = p.getByRole('button', { name: 'AGREGAR AL CARRITO' }).first();
      await assertTappable(add, 'agregar al carrito'); await add.tap();
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items.length === 1);
      await assertNoHorizontalOverflow(p, 'producto tras agregar');
      await p.goto(`${BASE}/carrito`);
      await expectText(p, 'CARRITO DE COMPRAS (1)');
      await assertNoHorizontalOverflow(p, 'carrito');
      const mas = p.getByRole('button', { name: /Aumentar cantidad/ }).first();
      await assertTappable(mas, 'aumentar cantidad'); await mas.tap();
      await expectText(p, 'CARRITO DE COMPRAS (2)');
      const go = p.getByRole('link', { name: /FINALIZAR|CHECKOUT|PAGAR/i }).or(p.getByRole('button', { name: /FINALIZAR|CHECKOUT|PAGAR/i })).first();
      await assertTappable(go, 'ir al checkout'); await go.tap();
      await p.waitForURL(/\/checkout$/);
      await assertNoHorizontalOverflow(p, 'checkout');
      await fillCheckout(p);
      const pay = p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' });
      await assertTappable(pay, 'confirmar y pagar');
      await assertNoHorizontalOverflow(p, 'checkout lleno');
      await pay.tap();
      await p.waitForURL(/\/checkout\/confirmacion/, { timeout: 15000 });
      await assertNoHorizontalOverflow(p, 'confirmación');
      const st = await state();
      if (st.orders.length !== 1 || st.orders[0].total !== 172000) throw new Error(`pedido: ${JSON.stringify(st.orders.map((o) => o.total))} (se esperaba 1 de 172.000 = 2×80.000 + 12.000)`);
    }, browser, null, MOBILE);

    await journey('30. Móvil 375×812: registro, cuenta, «Mis pedidos» y enlace de seguimiento sin desbordes', async (p) => {
      await p.goto(`${BASE}/cuenta`);
      await assertNoHorizontalOverflow(p, '/cuenta sin sesión');
      await assertTappable(p.getByRole('button', { name: '¿Olvidaste tu contraseña?' }), 'olvidé mi contraseña');
      await assertTappable(p.getByRole('button', { name: 'Empieza →' }), 'cambiar a registro (/cuenta)');
      await p.goto(`${BASE}/login`);
      await assertNoHorizontalOverflow(p, 'login');
      const crear = p.getByRole('button', { name: 'Crear cuenta' });
      await assertTappable(crear, 'pestaña crear cuenta'); await crear.tap();
      await p.getByPlaceholder(/Juan/i).first().fill('Sara Ríos');
      await p.locator('input[type=email]').fill('sara@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await assertNoHorizontalOverflow(p, 'registro lleno');
      const submit = p.locator('button[type=submit]');
      await assertTappable(submit, 'crear cuenta'); await submit.tap();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      for (let i = 0; i < 2; i += 1) {
        await addToCart(p, 'camiseta-basica', 'M', 'Negro');
        await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'sara@correo.co' });
        await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).tap();
        // Pendiente 0(bb): falló UNA vez aquí (30 s) y no se reprodujo en 11 pasadas; si vuelve, el mensaje dice qué
        // mostraba el checkout (alerta, campos marcados, botón) en lugar de solo «timeout».
        try { await p.waitForURL(/\/checkout\/confirmacion/, { timeout: 20000 }); }
        catch (e) {
          const why = await p.evaluate(() => ({ url: location.pathname, alerts: [...document.querySelectorAll('[role=alert]')].map((x) => x.textContent.trim()).filter(Boolean).slice(0, 3),
            invalid: [...document.querySelectorAll('[aria-invalid=true]')].map((x) => `${x.name}=«${x.value}»`), button: document.querySelector('button[type=submit]')?.disabled,
            session: Object.keys(localStorage).some((k) => k.includes('auth-token')) })).catch(() => ({}));
          throw new Error(`pedido ${i + 1}: sin confirmación tras CONFIRMAR Y PAGAR · ${JSON.stringify(why)} · ${String(e.message).split('\n')[0]}`);
        }
        await expectText(p, 'Pedido registrado');
      }
      const [pending, paid] = (await state()).orders; // unshift: el más reciente primero
      await fetch(`${API_URL}/__synthetic-mark-paid/${paid.order_number}`);
      for (const url of ['/cuenta', '/cuenta/datos', '/cuenta/direcciones']) {
        await p.goto(`${BASE}${url}`);
        await p.waitForLoadState('networkidle');
        await assertNoHorizontalOverflow(p, url);
      }
      await p.goto(`${BASE}/cuenta/pedidos`);
      await expectText(p, `PEDIDO #${pending.order_number}`);
      await expectText(p, `PEDIDO #${paid.order_number}`);
      await p.getByTestId('order-shipping-method').first().waitFor();
      await assertNoHorizontalOverflow(p, 'mis pedidos');
      await assertTappable(p.getByTestId('order-pay').first(), 'pagar ahora (lista)');
      await assertTappable(p.getByTestId('order-cancel').first(), 'cancelar pedido (lista)');
      const detalle = p.getByRole('button', { name: 'Ver Detalle' }).first();
      await assertTappable(detalle, 'ver detalle'); await detalle.tap();
      await p.waitForURL(/\/checkout\/confirmacion\?order=/);
      await expectText(p, 'Pedido registrado');
      await assertNoHorizontalOverflow(p, 'detalle del pedido');
      // Enlace de seguimiento en un navegador nuevo (sin sesión ni localStorage), también en móvil.
      const ctxB = await browser.newContext(MOBILE);
      try {
        const b = await ctxB.newPage();
        const link = (o) => `${BASE}/checkout/confirmacion?order=${encodeURIComponent(o.order_number)}&token=${encodeURIComponent(o.public_token)}`;
        await b.goto(link(pending));
        await expectText(b, 'Pedido registrado');
        await assertNoHorizontalOverflow(b, 'seguimiento (pendiente)');
        await assertTappable(b.getByRole('button', { name: 'Pagar ahora' }), 'pagar ahora (enlace)');
        await assertTappable(b.getByRole('button', { name: 'Cancelar pedido' }), 'cancelar pedido (enlace)');
        await b.goto(link(paid));
        await expectText(b, '¡Gracias por tu compra!');
        await assertNoHorizontalOverflow(b, 'seguimiento (pagado)');
      } finally { await ctxB.close(); }
    }, browser, null, MOBILE);

    await journey('31. Móvil 375×812: admin (login, menú, dashboard, pedidos con detalle, inventario y productos) sin desbordes', async (p) => {
      // un pedido pagado (sintético) para que el dashboard y la lista de pedidos tengan filas reales
      await addToCart(p, 'polo-clasico', 'M'); await p.goto(`${BASE}/checkout`); await fillCheckout(p);
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).tap(); await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      await p.evaluate(() => localStorage.clear());
      await p.goto(`${BASE}/admin/login`);
      await assertNoHorizontalOverflow(p, 'login admin');
      await p.locator('input[type=email]').fill('admin@jm.test'); await p.locator('input[type=password]').fill('Admin-Sintetico-1');
      const entrar = p.getByRole('button', { name: 'INICIAR SESIÓN ADM' });
      await assertTappable(entrar, 'iniciar sesión admin'); await entrar.tap();
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      await expectText(p, num);
      await assertNoHorizontalOverflow(p, 'dashboard');
      // menú lateral: oculto en móvil, se abre con ☰ y navega
      const menu = p.getByRole('button', { name: 'Abrir menú' });
      await assertTappable(menu, 'abrir menú'); await menu.tap();
      const pedidosLink = p.getByRole('link', { name: /^Pedidos/ });
      await assertTappable(pedidosLink, 'menú → pedidos'); await pedidosLink.tap();
      await p.waitForURL(/\/admin\/pedidos$/, { timeout: 8000 });
      await expectText(p, num);
      await assertNoHorizontalOverflow(p, 'pedidos');
      const gestionar = p.locator('tr', { hasText: num }).getByRole('button', { name: 'GESTIONAR' });
      await assertTappable(gestionar, 'gestionar pedido'); await gestionar.tap();
      const guardar = p.getByRole('button', { name: 'GUARDAR CAMBIOS' });
      await guardar.waitFor({ timeout: 8000 });
      await assertNoHorizontalOverflow(p, 'detalle del pedido');
      await assertTappable(guardar, 'guardar cambios del pedido');
      for (const [url, text] of [['/admin/inventario', 'INVENTARIO (5 variantes)'], ['/admin/productos', 'Polo Clásico'], ['/admin/clientes', 'CLIENTES']]) {
        await p.goto(`${BASE}${url}`);
        await expectText(p, text);
        await p.waitForLoadState('networkidle');
        await assertNoHorizontalOverflow(p, url);
      }
      // productos: acciones de la fila y formulario de edición
      await p.goto(`${BASE}/admin/productos?q=POL-001`);
      await assertTappable(p.getByRole('link', { name: 'Ver inventario de Polo Clásico' }), 'ver inventario del producto');
      const editar = p.locator('tr', { hasText: 'Polo Clásico' }).getByTitle('Editar prenda');
      await assertTappable(editar, 'editar prenda'); await editar.tap();
      await p.waitForURL(/\/admin\/productos\/nuevo\?editId=/, { timeout: 8000 });
      await p.waitForLoadState('networkidle');
      await assertNoHorizontalOverflow(p, 'formulario de producto');
      const row = p.locator('tr', { hasText: 'POL-M-NEG' });
      await p.goto(`${BASE}/admin/inventario`); await row.waitFor();
      await assertTappable(row.getByLabel('Cantidad a ajustar POL-M-NEG'), 'cantidad del ajuste');
      await assertTappable(row.getByLabel('Motivo del ajuste POL-M-NEG'), 'motivo del ajuste');
      await assertTappable(row.getByRole('button').first(), 'aplicar ajuste de inventario');
    }, browser, null, MOBILE);

    await journey('32. Móvil 375×812: resto del admin (descuentos, reseñas, boletín, imágenes, colecciones, analytics, configuración y sus modales) sin desbordes', async (p) => {
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      const pages = [['/admin/descuentos', 'JM10'], ['/admin/reviews', 'RESEÑAS'], ['/admin/boletin', 'BOLETÍN'], ['/admin/imagenes', 'IMÁGENES'],
        ['/admin/colecciones', 'COLECCIONES'], ['/admin/analytics', 'ANALÍTICA'], ['/admin/configuracion', 'ENVÍO'], ['/admin/clientes?rol=todos', 'Ver detalle']];
      const failures = [];
      const checkControls = (scope, where) => checkAllControls(p, scope, where, failures);
      for (const [url, text] of pages) {
        await p.goto(`${BASE}${url}`);
        await expectText(p, text);
        await p.waitForLoadState('networkidle');
        await assertNoHorizontalOverflow(p, url).catch((e) => failures.push(e.message));
        await checkControls('main', url);
      }
      // formularios y fichas modales (cupón, colección, método de envío, imagen de la portada, cliente)
      for (const [url, opener, dialog] of [['/admin/descuentos', p.locator('tbody tr', { hasText: 'JM10' }).getByRole('button', { name: 'Editar' }), 'Editar cupón'],
        ['/admin/colecciones', p.getByRole('button', { name: 'Editar', exact: false }).first(), 'Editar colección'],
        ['/admin/configuracion', p.getByRole('button', { name: /^Editar / }).first(), 'Editar método de envío'],
        ['/admin/imagenes', p.getByRole('button', { name: /^Cambiar imagen / }).first(), /^Editar /],
        ['/admin/clientes?rol=todos', p.getByRole('button', { name: 'Ver detalle' }).first(), /^Cliente /]]) {
        await p.goto(`${BASE}${url}`);
        await opener.tap();
        await p.getByRole('dialog', { name: dialog }).waitFor({ timeout: 8000 });
        await p.waitForLoadState('networkidle');
        await assertNoHorizontalOverflow(p, `${url} · ${dialog}`).catch((e) => failures.push(e.message));
        if (!(await checkControls('[role=dialog]', `${url} · ${dialog}`))) failures.push(`${url} · ${dialog}: sin controles visibles`);
      }
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    }, browser, null, MOBILE);

    await journey('33. Móvil 375×812: TODOS los controles visibles de la tienda (cabecera, menú, catálogo y filtros, ficha y sus guías, carrito, checkout, favoritos y cuenta)', async (p) => {
      const failures = [];
      const check = async (scope, where, { min = 1 } = {}) => {
        const n = await checkAllControls(p, scope, where, failures);
        if (n < min) failures.push(`${where}: ${n} controles visibles (se esperaban ≥ ${min})`);
      };
      const visit = async (url, text) => {
        await p.goto(`${BASE}${url}`);
        if (text) await expectText(p, text);
        await p.waitForLoadState('networkidle');
        await assertNoHorizontalOverflow(p, url).catch((e) => failures.push(e.message));
      };
      // sesión de cliente (favoritos y cuenta la requieren)
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).tap();
      await p.getByPlaceholder(/Juan/i).first().fill('Nora Gil');
      await p.locator('input[type=email]').fill('nora@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').tap();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      // portada: cabecera, contenido y barra inferior; menú de navegación
      await visit('/');
      await check('header', 'cabecera', { min: 2 });
      await check('main', 'portada');
      await check('.mobile-only-bottom-bar', 'barra inferior', { min: 2 });
      await p.getByRole('button', { name: 'Abrir menú de navegación' }).tap();
      await p.locator('.modal-overlay').first().waitFor();
      await check('.modal-overlay', 'menú de navegación', { min: 3 });
      await p.keyboard.press('Escape'); await p.goto(`${BASE}/ropa`);
      // catálogo y panel de filtros
      await visit('/ropa', 'MOSTRANDO 2 PRENDAS');
      await check('main', '/ropa', { min: 2 });
      await p.getByRole('button', { name: /FILTRAR/ }).tap();
      await p.locator('.modal-overlay').getByText('PRECIO MÁXIMO').waitFor();
      await check('.modal-overlay', 'panel de filtros', { min: 3 });
      // ficha de producto (selector, reseñas, «Completa el look») y sus dos guías
      await visit('/producto/camiseta-basica', 'Camiseta Básica');
      await check('main', 'ficha de producto', { min: 5 });
      for (const [opener, where] of [[/Guía de medidas/, 'guía de medidas'], [/Encuentra tu talla/, 'encuentra tu talla']]) {
        await p.getByRole('button', { name: opener }).first().tap();
        await p.locator('.modal-overlay').first().waitFor();
        await assertNoHorizontalOverflow(p, where).catch((e) => failures.push(e.message));
        await check('.modal-overlay', where, { min: 1 });
        await p.goto(`${BASE}/producto/camiseta-basica`); await expectText(p, 'Camiseta Básica');
      }
      // favoritos con una prenda guardada (desde la tarjeta del catálogo)
      await p.goto(`${BASE}/ropa`); await expectText(p, 'MOSTRANDO 2 PRENDAS');
      await p.getByRole('button', { name: 'Guardar en favoritos: Camiseta Básica' }).tap();
      await p.getByRole('button', { name: 'Quitar de favoritos: Camiseta Básica' }).waitFor();
      await p.waitForLoadState('networkidle');
      if ((await state()).wishlist.length !== 1) throw new Error('el favorito no se guardó en la cuenta');
      await visit('/cuenta/favoritos', 'AGREGAR TODO AL CARRITO');
      await check('main', 'favoritos', { min: 4 });
      // carrito y checkout
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await visit('/carrito', 'Camiseta Básica');
      await check('main', 'carrito', { min: 3 });
      await visit('/checkout');
      await p.locator('input[name=email]').waitFor();
      await check('main', 'checkout', { min: 6 });
      // cuenta
      for (const url of ['/cuenta', '/cuenta/pedidos', '/cuenta/datos', '/cuenta/direcciones']) { await visit(url); await check('main', url); }
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    }, browser, null, MOBILE);

    await journey('34. Móvil 375×812: TODOS los controles de páginas informativas, pie, login/restablecer, confirmación del pedido y ficha con reseñas', async (p) => {
      const failures = [];
      const check = async (scope, where, { min = 1 } = {}) => {
        const n = await checkAllControls(p, scope, where, failures);
        if (n < min) failures.push(`${where}: ${n} controles visibles (se esperaban ≥ ${min})`);
      };
      const visit = async (url, text) => {
        await p.goto(`${BASE}${url}`);
        if (text) await expectText(p, text);
        await p.waitForLoadState('networkidle');
        await assertNoHorizontalOverflow(p, url).catch((e) => failures.push(e.message));
      };
      // páginas informativas (sin sesión) y pie de página
      for (const url of ['/guia-de-tallas', '/envios', '/cambios-y-devoluciones', '/preguntas-frecuentes', '/contacto', '/nosotros', '/tiendas', '/terminos', '/privacidad']) {
        await visit(url); await check('main', url, { min: 0 });
      }
      await check('footer', 'pie de página', { min: 5 });
      // acceso, registro, recuperación y restablecimiento
      // /login vive fuera del layout público (sin <main>); /cuenta/restablecer sin enlace de recuperación solo muestra un aviso con enlace en línea
      await visit('/login'); await check('body', '/login', { min: 3 });
      await p.getByRole('button', { name: 'Crear cuenta' }).tap(); await check('body', '/login · crear cuenta', { min: 4 });
      await visit('/cuenta/restablecer', 'Crear una contraseña nueva'); await check('main', '/cuenta/restablecer', { min: 0 });
      // ficha con reseña aprobada (fixture) y formulario de reseña de un comprador con pedido entregado
      await fetch(`${API_URL}/__synthetic-review`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'polo-clasico', author_name: 'Luis P.', title: 'Gran polo', comment: 'Tela gruesa y buen ajuste en los hombros.', admin_reply: '¡Gracias, Luis!' }) });
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).tap();
      await p.getByPlaceholder(/Juan/i).first().fill('Rosa Díaz');
      await p.locator('input[type=email]').fill('rosa@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').tap();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'rosa@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).tap(); await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      // confirmación con pago pendiente (sin Wompi configurado) y después pagada (webhook SINTÉTICO)
      await expectText(p, num); await p.waitForLoadState('networkidle');
      await assertNoHorizontalOverflow(p, 'confirmación pendiente').catch((e) => failures.push(e.message));
      await check('main', 'confirmación pendiente');
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      await p.reload(); await expectText(p, num); await p.waitForLoadState('networkidle');
      await assertNoHorizontalOverflow(p, 'confirmación pagada').catch((e) => failures.push(e.message));
      await check('main', 'confirmación pagada');
      await fetch(`${API_URL}/__synthetic-mark-delivered/${num}`);
      await visit('/producto/polo-clasico', 'Gran polo');
      await p.getByTestId('review-form').getByText(num).waitFor({ timeout: 8000 });
      await check('main', 'ficha con reseñas y formulario', { min: 8 });
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    }, browser, null, MOBILE);

    await journey('35. Móvil 375×812: TODOS los controles de /admin/login, «No autorizado», ruta inexistente, confirmación rechazada/vencida/cerrada y estados vacíos', async (p) => {
      const failures = [];
      const check = async (scope, where, { min = 1 } = {}) => {
        const n = await checkAllControls(p, scope, where, failures);
        if (n < min) failures.push(`${where}: ${n} controles visibles (se esperaban ≥ ${min})`);
      };
      const visit = async (url, text) => {
        await p.goto(`${BASE}${url}`);
        if (text) await expectText(p, text);
        await p.waitForLoadState('networkidle');
        await assertNoHorizontalOverflow(p, url).catch((e) => failures.push(e.message));
      };
      // acceso del admin (fuera del layout público) y error de credenciales
      await visit('/admin/login'); await check('body', '/admin/login', { min: 3 });
      await p.locator('input[type=email]').fill('nadie@correo.co'); await p.locator('input[type=password]').fill('incorrecta-1');
      await p.locator('button[type=submit]').tap(); await p.waitForLoadState('networkidle');
      await check('body', '/admin/login · error', { min: 3 });
      // «No autorizado» y ruta inexistente (redirige a la portada)
      await visit('/unauthorized', 'Acceso Denegado'); await check('body', '/unauthorized'); // fuera del layout público (sin <main>)
      if (await p.locator('a button, button a').count()) failures.push('/unauthorized: botón anidado dentro de un enlace');
      await p.getByRole('button', { name: 'Volver al Inicio' }).tap(); await p.waitForURL(`${BASE}/`);
      await p.goto(`${BASE}/ruta-que-no-existe`); await p.waitForURL(`${BASE}/`);
      // estados vacíos sin sesión
      await visit('/carrito', 'vacío'); await check('main', 'carrito vacío');
      await visit('/ropa?q=zzzzqqq', 'No encontramos productos'); await check('main', 'búsqueda sin resultados', { min: 2 });
      // confirmación: enlace inválido, pago que no se pudo abrir (?pago=error), ventana vencida y pedidos cerrados
      await visit('/checkout/confirmacion?order=JM-999999&token=nope', 'Pedido no encontrado'); await check('main', 'confirmación · no encontrado');
      const fixture = async (status, extra = {}) => (await fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, customer_email: 'fix@correo.co', ...extra }) })).json();
      const conf = (o, q = '') => `/checkout/confirmacion?order=${o.order_number}&token=${o.public_token}${q}`;
      const pend = await fixture('payment_pending', { payment_expires_at: new Date(Date.now() + 3600e3).toISOString() });
      await visit(conf(pend, '&pago=error'), 'no se pudo abrir el pago'); await check('main', 'confirmación · pago rechazado/reintento', { min: 2 });
      await fetch(`${API_URL}/__synthetic-expire-window/${pend.order_number}`);
      await visit(conf(pend), 'El tiempo para pagar este pedido terminó'); await check('main', 'confirmación · ventana vencida');
      for (const st of ['expired', 'cancelled']) { const o = await fixture(st); await visit(conf(o), 'Pedido cerrado'); await check('main', `confirmación · ${st}`, { min: 0 }); }
      // con sesión: favoritos y pedidos vacíos
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).tap();
      await p.getByPlaceholder(/Juan/i).first().fill('Eva Ruiz');
      await p.locator('input[type=email]').fill('eva@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').tap();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await visit('/cuenta/favoritos'); await check('main', 'favoritos vacíos');
      await visit('/cuenta/pedidos'); await check('main', 'pedidos vacíos');
      // un cliente que intenta abrir el admin
      await p.goto(`${BASE}/admin`); await p.waitForLoadState('networkidle');
      if (/\/admin(\/|$)(?!login)/.test(new URL(p.url()).pathname) && !/login/.test(p.url())) failures.push(`un cliente quedó en ${p.url()}`);
      await assertNoHorizontalOverflow(p, `cliente en ${new URL(p.url()).pathname}`).catch((e) => failures.push(e.message));
      await check('body', `cliente en ${new URL(p.url()).pathname}`);
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    }, browser, /AdminLogin Password Exception/, MOBILE); // el error de credenciales se registra a propósito

    await journey('36. Teclado: todos los modales de la tienda y del admin (foco dentro, Tab atrapado, Escape cierra, foco de vuelta)', async (p) => {
      const failures = []; const checked = [];
      const kb = async (opener, name, where) => { if (await checkDialogKeyboard(p, opener, name, where, failures)) checked.push(where); };
      // tienda en escritorio: búsqueda y carrito de la cabecera, ficha (foto ampliada y sus tres guías)
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await p.goto(`${BASE}/producto/camiseta-basica`); await expectText(p, 'Camiseta Básica');
      await p.waitForLoadState('networkidle');
      await kb(p.getByRole('button', { name: 'Buscar en la tienda' }), 'Buscar', 'búsqueda');
      await kb(p.getByRole('button', { name: /^Abrir carrito/ }), 'Carrito', 'carrito');
      await kb(p.getByRole('button', { name: 'Ampliar imagen de Camiseta Básica' }), 'Imagen ampliada', 'foto ampliada');
      await kb(p.getByRole('button', { name: '¿Qué significa el Fit?' }), '¿Qué significa el fit?', 'guía de fit');
      await kb(p.getByRole('button', { name: /Guía de medidas/ }).first(), 'Guía de tallas', 'guía de medidas');
      await kb(p.getByRole('button', { name: /Encuentra tu talla/ }).first(), 'Encuentra tu talla ideal', 'encuentra tu talla');
      // tienda en móvil: menú de navegación y panel de filtros
      await p.setViewportSize({ width: 375, height: 812 });
      await p.goto(`${BASE}/ropa`); await expectText(p, 'MOSTRANDO 2 PRENDAS');
      await kb(p.getByRole('button', { name: 'Abrir menú de navegación' }), 'Menú', 'menú de navegación');
      await kb(p.getByRole('button', { name: /FILTRAR/ }), 'Filtros', 'panel de filtros');
      await p.setViewportSize({ width: 1280, height: 900 });
      // pedido pagado para el detalle del admin
      await p.goto(`${BASE}/checkout`); await fillCheckout(p);
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click(); await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      await p.evaluate(() => localStorage.clear());
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      const admin = [
        ['/admin/pedidos', num, () => p.locator('tr', { hasText: num }).getByRole('button', { name: 'GESTIONAR' }), /^Orden #/, 'detalle de pedido'],
        ['/admin/descuentos', 'JM10', () => p.locator('tbody tr', { hasText: 'JM10' }).getByRole('button', { name: 'Editar' }), 'Editar cupón', 'editar cupón'],
        ['/admin/descuentos', 'JM10', () => p.getByRole('button', { name: /CREAR CUPÓN/ }), 'Crear cupón', 'crear cupón'],
        ['/admin/colecciones', 'COLECCIONES', () => p.getByRole('button', { name: /NUEVA COLECCIÓN/ }), 'Nueva colección', 'nueva colección'],
        ['/admin/configuracion', 'ENVÍO', () => p.getByRole('button', { name: /^Editar / }).first(), 'Editar método de envío', 'método de envío'],
        ['/admin/imagenes', 'IMÁGENES', () => p.getByRole('button', { name: /^Cambiar imagen / }).first(), /^Editar /, 'imagen editorial'],
        ['/admin/clientes?rol=todos', 'Ver detalle', () => p.getByRole('button', { name: 'Ver detalle' }).first(), /^Cliente /, 'ficha de cliente'],
      ];
      for (const [url, text, opener, name, where] of admin) {
        await p.goto(`${BASE}${url}`); await expectText(p, text); await p.waitForLoadState('networkidle');
        await kb(opener(), name, where);
      }
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
      if (checked.length !== 15) throw new Error(`solo se comprobaron ${checked.length}/15 modales: ${checked.join(', ')}`);
    }, browser);

    await journey('37. Teclado: cajón del menú del admin en móvil y «Confirmar restauración» de la portada', async (p) => {
      const failures = []; const checked = [];
      const kb = async (opener, name, where) => { if (await checkDialogKeyboard(p, opener, name, where, failures)) checked.push(where); };
      // FIXTURE sintético: imagen propia del Hero (fila de site_content) → aparece «Restaurar»
      await fetch(`${API_URL}/__synthetic-site-content`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'hero_main', alt_text: 'Hero propio' }) });
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      await p.goto(`${BASE}/admin/imagenes`); await expectText(p, 'IMÁGENES'); await p.waitForLoadState('networkidle');
      const restore = p.getByRole('button', { name: 'Restaurar imagen Banner principal (Hero)' });
      await kb(restore, 'Confirmar restauración', 'confirmar restauración');
      // y restaurar de verdad: la fila desaparece de la BD sintética y el botón también
      await restore.click();
      await p.getByRole('dialog', { name: 'Confirmar restauración' }).getByRole('button', { name: 'Restaurar', exact: true }).click();
      await expectText(p, 'volvió a la imagen original');
      if ((await state()).siteContent.some((r) => r.key === 'hero_main')) failures.push('la fila hero_main sigue en site_content');
      if (await restore.count()) failures.push('«Restaurar» sigue visible tras restaurar');
      // móvil: el cajón cerrado no recibe el foco; abierto es un diálogo modal con teclado completo
      await p.setViewportSize({ width: 375, height: 812 });
      await p.goto(`${BASE}/admin/dashboard`); await p.waitForLoadState('networkidle');
      const menu = p.getByRole('button', { name: 'Abrir menú' });
      await menu.focus();
      for (let i = 0; i < 25; i++) {
        await p.keyboard.press('Tab');
        if (await p.evaluate(() => !!document.activeElement?.closest('aside'))) { failures.push(`Tab llegó al menú lateral cerrado (paso ${i + 1})`); break; }
      }
      await kb(menu, 'Menú de administración', 'cajón del menú (Enter, Tab, Escape)');
      // un enlace del cajón navega y lo cierra; el foco no se queda en un menú oculto
      await menu.click();
      await p.getByRole('dialog', { name: 'Menú de administración' }).getByRole('link', { name: 'Pedidos' }).click();
      await p.waitForURL(/\/admin\/pedidos/);
      try { await p.getByRole('dialog', { name: 'Menú de administración' }).waitFor({ state: 'detached', timeout: 5000 }); } catch { failures.push('el cajón siguió abierto tras navegar'); }
      // el foco vuelve a ☰ en el efecto de cierre de DialogPanel (un fotograma después de desmontar el diálogo)
      try { await p.waitForFunction(() => !document.activeElement?.closest('aside'), null, { timeout: 2000 }); }
      catch { failures.push(`el foco quedó en el menú cerrado tras navegar: ${await p.evaluate(() => document.activeElement.outerHTML.slice(0, 120))}`); }
      // escritorio: la barra lateral vuelve a ser navegable con Tab
      await p.setViewportSize({ width: 1280, height: 900 });
      // el cambio de matchMedia llega por evento y re-render: se espera (antes se miraba en el mismo instante y falló
      // 2 de 5 pasadas completas en la ejecución 102 aunque el atributo se quitaba enseguida).
      try { await p.waitForFunction(() => !document.querySelector('aside[inert]'), null, { timeout: 3000 }); }
      catch { failures.push('la barra lateral sigue inert en escritorio'); }
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
      if (checked.length !== 2) throw new Error(`solo se comprobaron ${checked.length}/2 diálogos: ${checked.join(', ')}`);
    }, browser);

    await journey('38. Navegación: aria-current por segmentos, secciones de «Mi cuenta» y panel solo para admin', async (p) => {
      const failures = [];
      const cur = (loc) => loc.getAttribute('aria-current');
      // escritorio: la línea y la categoría actuales quedan marcadas (página exacta = page, sección = true)
      const mainNav = p.getByRole('navigation', { name: 'Navegación principal' });
      await p.goto(`${BASE}/linea/urbana`); await mainNav.getByRole('link', { name: 'URBANA' }).waitFor();
      if (await cur(mainNav.getByRole('link', { name: 'URBANA' })) !== 'page') failures.push('URBANA sin aria-current=page en /linea/urbana');
      if (await cur(mainNav.getByRole('link', { name: 'ROPA', exact: true }))) failures.push('ROPA marcada en /linea/urbana');
      await p.goto(`${BASE}/ropa/camisetas`); await mainNav.waitFor();
      if (await cur(mainNav.getByRole('link', { name: 'ROPA', exact: true })) !== 'true') failures.push('ROPA sin aria-current=true en /ropa/camisetas');
      // móvil, cliente recién registrado: menú sin acceso al panel y con la página actual marcada
      await p.setViewportSize({ width: 375, height: 812 });
      await p.goto(`${BASE}/login`); await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Nora Gil');
      await p.locator('input[type=email]').fill('nora@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/ropa/camisetas`);
      await p.getByRole('button', { name: 'Abrir menú de navegación' }).click();
      const menu = p.getByRole('dialog', { name: 'Menú' });
      await menu.getByRole('navigation', { name: 'Categorías' }).waitFor();
      if (await menu.getByRole('link', { name: /Panel de Administración/ }).count()) failures.push('un cliente ve «Panel de Administración» en el menú móvil');
      if (await cur(menu.getByRole('link', { name: /Camisetas/ })) !== 'page') failures.push('menú móvil: Camisetas sin aria-current=page');
      await p.keyboard.press('Escape');
      // cada ruta de la cuenta lleva a su sección (desplazamiento + foco en el título) y la marca en el menú de la cuenta
      const accountNav = p.getByRole('navigation', { name: 'Secciones de mi cuenta' });
      const lands = async (url, headingId, label) => {
        try { await p.waitForFunction((id) => document.activeElement?.id === id, headingId, { timeout: 8000 }); }
        catch { failures.push(`${url}: el foco no llegó a #${headingId} (está en ${await p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)})`); return; }
        const top = await p.evaluate((id) => document.getElementById(id).getBoundingClientRect().top, headingId);
        if (top < -1 || top > 812) failures.push(`${url}: el título no quedó en pantalla (top=${Math.round(top)})`);
        if (await cur(accountNav.getByRole('link', { name: label, exact: true })) !== 'page') failures.push(`${url}: «${label}» sin aria-current=page`);
        if (await accountNav.locator('[aria-current]').count() !== 1) failures.push(`${url}: más de una sección marcada`);
      };
      await p.goto(`${BASE}/cuenta/direcciones`); await lands('/cuenta/direcciones', 'direcciones-titulo', 'Direcciones');
      await accountNav.getByRole('link', { name: 'Mis datos', exact: true }).click(); await p.waitForURL(/\/cuenta\/datos$/);
      await lands('/cuenta/datos', 'perfil-titulo', 'Mis datos');
      await accountNav.getByRole('link', { name: 'Mis pedidos', exact: true }).click(); await p.waitForURL(/\/cuenta\/pedidos$/);
      await lands('/cuenta/pedidos', 'pedidos-titulo', 'Mis pedidos');
      await p.goto(`${BASE}/cuenta`); await accountNav.waitFor();
      if (await accountNav.locator('[aria-current]').count()) failures.push('/cuenta: una sección marcada en el resumen');
      await p.goto(`${BASE}/cuenta/favoritos`);
      if (await cur(accountNav.getByRole('link', { name: 'Favoritos', exact: true })) !== 'page') failures.push('/cuenta/favoritos: «Favoritos» sin aria-current=page');
      // admin: el menú móvil sí ofrece el panel
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      await p.goto(`${BASE}/`);
      await p.getByRole('button', { name: 'Abrir menú de navegación' }).click();
      try { await p.getByRole('dialog', { name: 'Menú' }).getByRole('link', { name: /Panel de Administración/ }).waitFor({ timeout: 8000 }); }
      catch { failures.push('el admin no ve «Panel de Administración» en el menú móvil'); }
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    }, browser);

    await journey('39. Accesibilidad: «Ir al contenido», foco al cambiar de página y un único <h1> por página', async (p) => {
      const failures = [];
      const active = () => p.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, text: (a?.textContent || '').trim().slice(0, 60), inMain: !!a?.closest('main') }; });
      // 1) el primer Tab muestra «Ir al contenido» y al activarlo el foco pasa al título de la página
      await p.goto(`${BASE}/ropa`); await p.locator('main h1').waitFor();
      await p.keyboard.press('Tab');
      let a = await active();
      if (a.tag !== 'A' || a.text !== 'Ir al contenido') failures.push(`primer Tab en /ropa: ${a.tag} «${a.text}» (se esperaba «Ir al contenido»)`);
      else {
        const box = await p.getByRole('link', { name: 'Ir al contenido' }).boundingBox();
        if (!box || box.y < 0) failures.push('«Ir al contenido» no se ve al recibir el foco');
        await p.keyboard.press('Enter');
        a = await active();
        if (a.tag !== 'H1' || !a.inMain) failures.push(`«Ir al contenido» dejó el foco en ${a.tag} «${a.text}»`);
        if (!/\/ropa$/.test(p.url())) failures.push(`«Ir al contenido» cambió la URL: ${p.url()}`);
      }
      // 2) al cambiar de página el foco llega al <h1> de la página nueva (no queda en el enlace pulsado)
      const landsOnH1 = async (where, re) => {
        try { await p.waitForFunction((src) => { const a = document.activeElement; return a?.tagName === 'H1' && !!a.closest('main') && new RegExp(src, 'i').test(a.textContent); }, re.source, { timeout: 8000 }); }
        catch { const x = await active(); failures.push(`${where}: el foco quedó en ${x.tag} «${x.text}»`); }
      };
      await p.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'URBANA' }).click();
      await p.waitForURL(/\/linea\/urbana$/); await landsOnH1('cabecera → /linea/urbana', /urbana/);
      await p.locator('main a[href="/producto/camiseta-basica"]').first().click();
      await p.waitForURL(/\/producto\/camiseta-basica$/); await landsOnH1('tarjeta → ficha', /camiseta/);
      const scrollY = await p.evaluate(() => window.scrollY);
      if (scrollY > 400) failures.push(`la ficha quedó desplazada (scrollY=${scrollY})`);
      // 3) exactamente un <h1> en cada página de la tienda (estados vacíos, no encontrado y sin sesión incluidos)
      const routes = ['/', '/ropa', '/ropa/camisetas', '/nuevo', '/linea/urbana', '/buscar?q=zzzz', '/producto/camiseta-basica', '/producto/no-existe',
        '/guia-de-tallas', '/envios', '/cambios-y-devoluciones', '/preguntas-frecuentes', '/contacto', '/nosotros', '/tiendas', '/terminos', '/privacidad',
        '/carrito', '/checkout', '/checkout/confirmacion', '/cuenta', '/cuenta/favoritos', '/cuenta/restablecer', '/login', '/unauthorized'];
      for (const r of routes) {
        await p.goto(`${BASE}${r}`);
        try { await p.locator('h1').first().waitFor({ timeout: 8000 }); } catch { failures.push(`${r}: sin <h1>`); continue; }
        await p.waitForTimeout(400);
        const n = await p.locator('h1').count();
        if (n !== 1) failures.push(`${r}: ${n} <h1>`);
      }
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    }, browser);

    await journey('40. Accesibilidad del admin: «Ir al contenido», foco al <h1> al cambiar de página, un <h1> por ruta y buscador de la cabecera', async (p) => {
      const failures = [];
      const active = () => p.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, text: (a?.textContent || '').trim().slice(0, 60), inMain: !!a?.closest('main') }; });
      const landsOnH1 = async (where, re) => {
        try { await p.waitForFunction((src) => { const a = document.activeElement; return a?.tagName === 'H1' && !!a.closest('main') && new RegExp(src, 'i').test(a.textContent); }, re.source, { timeout: 8000 }); }
        catch { const x = await active(); failures.push(`${where}: el foco quedó en ${x.tag} «${x.text}»`); }
      };
      // /admin/login: un <h1> y landmark <main>
      await p.goto(`${BASE}/admin/login`); await p.locator('h1').first().waitFor();
      if (await p.locator('h1').count() !== 1) failures.push(`/admin/login: ${await p.locator('h1').count()} <h1>`);
      if (await p.locator('main').count() !== 1) failures.push('/admin/login: sin landmark <main>');
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      // 1) primer Tab = «Ir al contenido»; Enter → <h1> del dashboard sin cambiar la URL
      await p.goto(`${BASE}/admin/dashboard`); await p.locator('main h1').waitFor();
      await p.keyboard.press('Tab');
      let a = await active();
      if (a.tag !== 'A' || a.text !== 'Ir al contenido') failures.push(`primer Tab en el admin: ${a.tag} «${a.text}»`);
      else {
        await p.keyboard.press('Enter'); a = await active();
        if (a.tag !== 'H1' || !a.inMain) failures.push(`«Ir al contenido» dejó el foco en ${a.tag} «${a.text}»`);
        if (!/\/admin\/dashboard$/.test(p.url())) failures.push(`«Ir al contenido» cambió la URL: ${p.url()}`);
      }
      // 2) cada enlace del menú lateral lleva el foco al <h1> de la página nueva, que es único
      const pages = [['Productos', /\/admin\/productos$/, /productos/], ['Inventario', /\/admin\/inventario$/, /inventario/], ['Pedidos', /\/admin\/pedidos$/, /pedidos/],
        ['Clientes', /\/admin\/clientes$/, /clientes/], ['Boletín', /\/admin\/boletin$/, /bolet/], ['Colecciones', /\/admin\/colecciones$/, /colecciones/],
        ['Imágenes', /\/admin\/imagenes$/, /im[aá]genes/], ['Descuentos', /\/admin\/descuentos$/, /cupones/], ['Reviews', /\/admin\/reviews$/, /rese/],
        ['Analytics', /\/admin\/analytics$/, /anal/], ['Configuración', /\/admin\/configuracion$/, /configuraci/], ['Dashboard', /\/admin\/dashboard$/, /./]];
      const side = p.locator('aside nav');
      for (const [label, url, re] of pages) {
        const link = side.getByRole('link', { name: new RegExp(`^${label}`) }).first();
        if (!(await link.count())) { failures.push(`menú sin «${label}»`); continue; }
        await link.click(); await p.waitForURL(url);
        await landsOnH1(`menú → ${label}`, re);
        await p.waitForTimeout(300);
        const n = await p.locator('h1').count();
        if (n !== 1) failures.push(`${label}: ${n} <h1>`);
      }
      // nuevo producto (también mientras carga) y edición
      await p.goto(`${BASE}/admin/productos`); await p.locator('main h1').waitFor();
      await p.getByRole('button', { name: /nuevo producto/i }).first().click().catch(() => failures.push('sin botón «Nuevo producto»'));
      await p.waitForURL(/\/admin\/productos\/nuevo/).catch(() => {});
      await landsOnH1('productos → nuevo', /nuevo producto/);
      // 3) buscador de la cabecera: Enter va a la lista más probable; las 4 listas se ofrecen como enlaces
      const search = p.getByRole('searchbox', { name: 'Buscar SKU, pedido o cliente' });
      await search.fill('JM-000001'); await search.press('Enter');
      try { await p.waitForURL(/\/admin\/pedidos\?q=JM-000001$/, { timeout: 5000 }); } catch { failures.push(`Enter con número de pedido → ${p.url()}`); }
      await landsOnH1('buscador → pedidos', /pedidos/);
      if (await search.inputValue() !== '') failures.push('el buscador no se vació tras buscar');
      await search.fill('cliente@correo.co'); await search.press('Enter');
      try { await p.waitForURL(/\/admin\/clientes\?q=cliente%40correo\.co$/, { timeout: 5000 }); } catch { failures.push(`Enter con correo → ${p.url()}`); }
      await search.fill('CAM-M-NEG');
      const opt = p.getByRole('link', { name: /Buscar «CAM-M-NEG» en Inventario/ });
      try { await opt.waitFor({ timeout: 3000 }); } catch { failures.push('no se ofrecen las listas al escribir'); }
      if (await p.getByRole('search', { name: 'Buscar en el admin' }).getByRole('link').count() !== 4) failures.push('el buscador no ofrece 4 listas');
      await search.press('Escape');
      if (await opt.count()) failures.push('Escape no cierra las opciones del buscador');
      await search.fill(''); await search.fill('CAM-M-NEG'); await opt.click();
      try { await p.waitForURL(/\/admin\/inventario\?q=CAM-M-NEG$/, { timeout: 5000 }); } catch { failures.push(`opción Inventario → ${p.url()}`); }
      try { await p.getByText('CAM-M-NEG').first().waitFor({ timeout: 8000 }); } catch { failures.push('inventario filtrado sin la variante CAM-M-NEG'); }
      await search.fill('camiseta'); await search.press('Enter');
      try { await p.waitForURL(/\/admin\/productos\?q=camiseta$/, { timeout: 5000 }); } catch { failures.push(`Enter con texto → ${p.url()}`); }
      try { await p.getByText(/camiseta b[aá]sica/i).first().waitFor({ timeout: 8000 }); } catch { failures.push('productos filtrados sin «Camiseta básica»'); }
      // 4) móvil: enlace del cajón → foco al <h1> nuevo (no vuelve al botón ☰)
      await p.setViewportSize({ width: 375, height: 812 });
      await p.getByRole('button', { name: 'Abrir menú' }).click();
      await p.getByRole('dialog', { name: 'Menú de administración' }).getByRole('link', { name: /^Clientes/ }).click();
      await p.waitForURL(/\/admin\/clientes$/); await landsOnH1('cajón móvil → Clientes', /clientes/);
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    }, browser);

    await journey('41. Campana del admin: avisos reales de pedidos por preparar y reseñas por moderar, con enlaces a las listas filtradas', async (p) => {
      const failures = [];
      // fixtures sintéticos: un pedido pagado y una reseña pendiente (los recorridos corren en paralelo: no se asumen totales fijos)
      await fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_name: 'Aviso Campana', customer_email: 'campana@correo.co', status: 'paid' }) });
      await fetch(`${API_URL}/__synthetic-review`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'polo-clasico', author_name: 'Campana R.', title: 'Pendiente de moderar', comment: 'Reseña de la campana del admin.', status: 'pending' }) });
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      const bell = p.locator('header').getByRole('button', { name: /^Avisos:/ });
      try { await bell.waitFor({ timeout: 8000 }); } catch { throw new Error('la cabecera no tiene un botón «Avisos»'); }
      let name = '';
      try { await p.waitForFunction(() => /pedidos? pagados? por preparar.*rese/.test(document.querySelector('[data-testid="admin-notifications"]')?.textContent || ''), null, { timeout: 8000 }); }
      catch { failures.push(`la campana no avisa de pedidos y reseñas: «${await bell.textContent()}»`); }
      name = (await bell.textContent()) || '';
      const nums = [...name.matchAll(/(\d+) (?:pedidos?|reseñas?)/g)].map((m) => Number(m[1]));
      const badge = await p.locator('[data-testid="admin-notifications-badge"]').textContent().catch(() => null);
      const sum = nums.reduce((a, b) => a + b, 0);
      if (badge !== (sum > 99 ? '99+' : String(sum))) failures.push(`insignia «${badge}» no es la suma de «${name}»`);
      if (await bell.getAttribute('aria-expanded') !== 'false') failures.push('la campana empieza abierta');
      await assertTappable(bell, 'campana').catch((e) => failures.push(e.message));
      // teclado: Enter abre, Escape cierra y devuelve el foco
      await bell.focus(); await p.keyboard.press('Enter');
      const panel = p.getByRole('region', { name: 'Avisos' });
      try { await panel.waitFor({ timeout: 3000 }); } catch { failures.push('Enter no abre los avisos'); }
      await panel.getByRole('link').first().focus(); await p.keyboard.press('Escape');
      if (await panel.count()) failures.push('Escape no cierra los avisos');
      if (!(await bell.evaluate((el) => el === document.activeElement))) failures.push('Escape no devuelve el foco a la campana');
      // reseñas → /admin/reviews?estado=pending con la reseña pendiente del fixture
      await bell.click();
      await panel.getByRole('link', { name: /por moderar/ }).click();
      try { await p.waitForURL(/\/admin\/reviews\?estado=pending$/, { timeout: 5000 }); } catch { failures.push(`enlace de reseñas → ${p.url()}`); }
      try { await p.getByText('Pendiente de moderar').first().waitFor({ timeout: 8000 }); } catch { failures.push('la lista de reseñas pendientes no muestra la del fixture'); }
      if (await panel.count()) failures.push('el panel sigue abierto tras elegir un aviso');
      // pedidos → /admin/pedidos?estado=paid con el pedido del fixture
      await bell.click();
      await panel.getByRole('link', { name: /por preparar/ }).click();
      try { await p.waitForURL(/\/admin\/pedidos\?estado=paid$/, { timeout: 5000 }); } catch { failures.push(`enlace de pedidos → ${p.url()}`); }
      try { await p.getByText('Aviso Campana').first().waitFor({ timeout: 8000 }); } catch { failures.push('la lista de pedidos pagados no muestra el del fixture'); }
      // móvil: la campana sigue visible y su panel no desborda la pantalla
      await p.setViewportSize({ width: 375, height: 812 });
      await bell.click(); await panel.waitFor().catch(() => {});
      await assertNoHorizontalOverflow(p, 'avisos en móvil').catch((e) => failures.push(e.message));
      const box = await panel.boundingBox();
      if (!box || box.x < 0 || box.x + box.width > 375) failures.push(`panel de avisos fuera de la pantalla en móvil: ${JSON.stringify(box)}`);
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    }, browser);

    const a11yRoutes = async (p) => {
      const failures = [];
      const visit = async (url, ready) => { await p.goto(`${BASE}${url}`); if (ready) await ready().catch(() => failures.push(`${url}: no cargó`)); await auditA11y(p, url, failures); };
      const h1 = () => p.locator('h1').first().waitFor({ timeout: 8000 });
      for (const url of ['/', '/ropa', '/producto/camiseta-basica', '/guia-de-tallas', '/contacto', '/login', '/cuenta/favoritos']) await visit(url, h1);
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await visit('/carrito', h1);
      await visit('/checkout', h1);
      await fillCheckout(p);
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/); await h1(); await auditA11y(p, '/checkout/confirmacion', failures);
      // cliente con sesión
      await p.goto(`${BASE}/login`); await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Ana Contraste');
      await p.locator('input[type=email]').fill('ana.contraste@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      for (const url of ['/cuenta', '/cuenta/pedidos', '/cuenta/datos', '/cuenta/direcciones']) await visit(url, h1);
      // admin
      await visit('/admin/login');
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      for (const url of ['/admin/dashboard', '/admin/productos', '/admin/productos/nuevo', '/admin/inventario', '/admin/pedidos', '/admin/clientes', '/admin/boletin', '/admin/colecciones',
        '/admin/imagenes', '/admin/descuentos', '/admin/reviews', '/admin/analytics', '/admin/configuracion']) await visit(url, h1);
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    };
    await journey('42. Accesibilidad: nombres accesibles (árbol de Chromium) y contraste WCAG 1.4.3 en las rutas principales de la tienda y del admin', async (p) => {
      await a11yRoutes(p);
    }, browser);
    await journey('44. Accesibilidad en móvil 375×812: las mismas 30 rutas del recorrido 42 (contraste y nombres accesibles)', async (p) => {
      await a11yRoutes(p);
    }, browser, null, MOBILE);

    await journey('43. Accesibilidad de los modales abiertos (tienda escritorio y móvil, admin): contraste, nombres accesibles y, en móvil, objetivo táctil', async (p) => {
      const failures = []; const checked = []; let tapChecked = 0;
      const audit = async (opener, name, where) => {
        try { await opener.waitFor({ timeout: 8000 }); await opener.click(); } catch { failures.push(`${where}: no se pudo abrir`); return; }
        const dlg = p.getByRole('dialog', { name });
        try { await dlg.waitFor({ timeout: 8000 }); } catch { failures.push(`${where}: no apareció el diálogo`); return; }
        await p.waitForTimeout(400); // animación de entrada: el contraste se mide con la opacidad final
        await auditA11y(p, where, failures, '[role="dialog"]');
        // en móvil, además, objetivo táctil (≥ 32 px y dentro de la pantalla) de TODOS los controles del modal
        if ((p.viewportSize() || {}).width <= 375) tapChecked += await checkAllControls(p, '[role="dialog"]', where, failures);
        checked.push(where);
        await p.keyboard.press('Escape');
        await dlg.waitFor({ state: 'detached', timeout: 5000 }).catch(() => failures.push(`${where}: Escape no lo cerró`));
      };
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await p.goto(`${BASE}/producto/camiseta-basica`); await expectText(p, 'Camiseta Básica'); await p.waitForLoadState('networkidle');
      await audit(p.getByRole('button', { name: 'Buscar en la tienda' }), 'Buscar', 'búsqueda');
      await audit(p.getByRole('button', { name: /^Abrir carrito/ }), 'Carrito', 'carrito');
      await audit(p.getByRole('button', { name: 'Ampliar imagen de Camiseta Básica' }), 'Imagen ampliada', 'foto ampliada');
      await audit(p.getByRole('button', { name: '¿Qué significa el Fit?' }), '¿Qué significa el fit?', 'guía de fit');
      await audit(p.getByRole('button', { name: /Guía de medidas/ }).first(), 'Guía de tallas', 'guía de medidas');
      await audit(p.getByRole('button', { name: /Encuentra tu talla/ }).first(), 'Encuentra tu talla ideal', 'encuentra tu talla');
      // móvil 375×812: carrito, guía de medidas, menú y filtros
      await p.setViewportSize({ width: 375, height: 812 });
      await p.goto(`${BASE}/producto/camiseta-basica`); await expectText(p, 'Camiseta Básica'); await p.waitForLoadState('networkidle');
      await audit(p.getByRole('button', { name: /^Abrir carrito/ }), 'Carrito', 'carrito (móvil)');
      await audit(p.getByRole('button', { name: /Guía de medidas/ }).first(), 'Guía de tallas', 'guía de medidas (móvil)');
      await audit(p.getByRole('button', { name: /Encuentra tu talla/ }).first(), 'Encuentra tu talla ideal', 'encuentra tu talla (móvil)');
      await p.goto(`${BASE}/ropa`); await expectText(p, 'MOSTRANDO 2 PRENDAS');
      await audit(p.getByRole('button', { name: 'Abrir menú de navegación' }), 'Menú', 'menú de navegación (móvil)');
      await audit(p.getByRole('button', { name: /FILTRAR/ }), 'Filtros', 'panel de filtros (móvil)');
      await p.setViewportSize({ width: 1280, height: 900 });
      await p.goto(`${BASE}/checkout`); await fillCheckout(p);
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click(); await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      await p.evaluate(() => localStorage.clear());
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      const admin = [
        ['/admin/pedidos', num, () => p.locator('tr', { hasText: num }).getByRole('button', { name: 'GESTIONAR' }), /^Orden #/, 'detalle de pedido'],
        ['/admin/descuentos', 'JM10', () => p.locator('tbody tr', { hasText: 'JM10' }).getByRole('button', { name: 'Editar' }), 'Editar cupón', 'editar cupón'],
        ['/admin/descuentos', 'JM10', () => p.getByRole('button', { name: /CREAR CUPÓN/ }), 'Crear cupón', 'crear cupón'],
        ['/admin/colecciones', 'COLECCIONES', () => p.getByRole('button', { name: /NUEVA COLECCIÓN/ }), 'Nueva colección', 'nueva colección'],
        ['/admin/configuracion', 'ENVÍO', () => p.getByRole('button', { name: /^Editar / }).first(), 'Editar método de envío', 'método de envío'],
        ['/admin/imagenes', 'IMÁGENES', () => p.getByRole('button', { name: /^Cambiar imagen / }).first(), /^Editar /, 'imagen editorial'],
        ['/admin/clientes?rol=todos', 'Ver detalle', () => p.getByRole('button', { name: 'Ver detalle' }).first(), /^Cliente /, 'ficha de cliente'],
      ];
      for (const [url, text, opener, name, where] of admin) {
        await p.goto(`${BASE}${url}`); await expectText(p, text); await p.waitForLoadState('networkidle');
        await audit(opener(), name, where);
      }
      // los mismos modales del admin en móvil
      await p.setViewportSize({ width: 375, height: 812 });
      for (const [url, text, opener, name, where] of admin) {
        await p.goto(`${BASE}${url}`); await expectText(p, text); await p.waitForLoadState('networkidle');
        await audit(opener(), name, `${where} (móvil)`);
      }
      await p.goto(`${BASE}/admin/dashboard`); await p.waitForLoadState('networkidle');
      await audit(p.getByRole('button', { name: 'Abrir menú' }), 'Menú de administración', 'cajón del menú (móvil)');
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
      if (checked.length !== 26) throw new Error(`solo se midieron ${checked.length}/26 modales: ${checked.join(', ')}`);
      if (tapChecked < 100) throw new Error(`solo se comprobó el objetivo táctil de ${tapChecked} controles en los modales móviles`);
    }, browser);


    // Ejecución 113 (0(bm)): lo que jsdom no puede demostrar. En Chromium real, tras un envío inválido el foco queda en el
    // control que causó el error, ese control está marcado (aria-invalid, salvo botones) y su aria-describedby apunta a un
    // texto VISIBLE (con caja, sin display:none/visibility:hidden), y tanto el control como el aviso quedan dentro de la
    // pantalla (si el aviso queda fuera, quien ve la pantalla no sabe por qué no se envió).
    await journey('45. Errores de formulario en Chromium: foco en el campo culpable y aviso enlazado visible (tienda y admin, escritorio y móvil)', async (p) => {
      const failures = []; const checked = [];
      const expectFocusLinked = makeFocusChecker(p, failures, checked);
      const submitIn = (scope) => p.locator(`${scope} button[type=submit]`).first().click();

      const store = async (sfx) => {
        // boletín de la portada: correo incompleto
        await p.goto(`${BASE}/`); const nl = p.getByLabel('Correo electrónico para el boletín');
        await nl.scrollIntoViewIfNeeded(); await nl.fill('ana@');
        await nl.locator('xpath=ancestor::form').locator('button[type=submit]').click();
        await expectFocusLinked(`boletín${sfx}`, { text: /nombre@dominio/, name: /boletín/ });
        // cupón de /carrito: vacío y luego rechazado por la BD
        await addToCart(p, 'camiseta-basica', 'M', 'Negro');
        await p.goto(`${BASE}/carrito`); const cup = p.getByLabel('Código del cupón');
        await cup.waitFor({ timeout: 8000 }); await cup.press('Enter');
        await expectFocusLinked(`cupón vacío${sfx}`, { text: /Escribe el código/, name: /cupón/ });
        await cup.fill('NOEXISTE'); await cup.press('Enter');
        await p.getByText(/NOEXISTE/).first().waitFor({ timeout: 8000 }).catch(() => {});
        await expectFocusLinked(`cupón rechazado${sfx}`, { text: /no existe/, name: /cupón/ });
      };
      await store('');
      await p.setViewportSize({ width: 375, height: 812 });
      await store(' (móvil)');
      await p.setViewportSize({ width: 1280, height: 900 });

      // cliente con sesión: restablecer contraseña y reseña de un producto comprado
      await p.goto(`${BASE}/login`); await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Rita Foco');
      await p.locator('input[type=email]').fill('rita.foco@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/cuenta/restablecer`); await p.locator('input[name=password]').waitFor({ timeout: 8000 });
      await submitIn('form');
      await expectFocusLinked('restablecer: contraseña corta', { text: /al menos 8/, name: /Nueva contraseña/ });
      await p.locator('input[name=password]').fill('Segura123'); await p.locator('input[name=confirm]').fill('Segura124');
      await submitIn('form');
      await expectFocusLinked('restablecer: no coinciden', { text: /no coinciden/, name: /Repite/ });
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'rita.foco@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click(); await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      for (const [vp, sfx] of [[{ width: 1280, height: 900 }, ''], [{ width: 375, height: 812 }, ' (móvil)']]) {
        await p.setViewportSize(vp);
        await p.goto(`${BASE}/producto/camiseta-basica`);
        const caja = p.getByTestId('review-form'); await caja.getByText(num).waitFor({ timeout: 8000 });
        await caja.getByRole('button', { name: 'Enviar opinión' }).click();
        await expectFocusLinked(`reseña vacía${sfx}`, { text: /calificación/, invalid: false, name: /1 de 5 estrellas/ });
        await caja.getByRole('button', { name: '4 de 5 estrellas' }).click();
        await caja.getByRole('button', { name: 'Enviar opinión' }).click();
        await expectFocusLinked(`reseña sin título${sfx}`, { name: /Título/ });
      }
      await p.setViewportSize({ width: 1280, height: 900 });

      // admin
      await p.evaluate(() => localStorage.clear());
      await p.goto(`${BASE}/admin/login`); await p.getByLabel(/Correo/i).first().fill('admin@jm.test');
      await submitIn('form');
      await expectFocusLinked('admin login sin contraseña', { name: /Contraseña/i });
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      const admin = async (sfx) => {
        await p.goto(`${BASE}/admin/productos/nuevo`); await p.locator('#pf-name').waitFor({ timeout: 8000 });
        await p.locator('#pf-name').fill('Prenda Foco'); await p.locator('#pf-price').fill('0');
        await submitIn('form');
        await expectFocusLinked(`producto: precio 0${sfx}`, { name: /pf-price|Precio/i });
        await p.goto(`${BASE}/admin/descuentos`); await expectText(p, 'JM10');
        await p.getByRole('button', { name: /CREAR CUPÓN/ }).click();
        const dlg = p.getByRole('dialog');
        await dlg.getByLabel('Código').fill('JM95'); await dlg.getByLabel(/^Porcentaje \(/).fill('95');
        await submitIn('[role=dialog]');
        await expectFocusLinked(`cupón 95%${sfx}`, { name: /Porcentaje/ });
        await p.goto(`${BASE}/admin/colecciones`); await expectText(p, 'COLECCIONES');
        await p.getByRole('button', { name: /NUEVA COLECCIÓN/ }).click();
        await dlg.getByLabel('Nombre').fill('Look noche'); await dlg.getByLabel('Slug').fill('Look Noche');
        await submitIn('[role=dialog]');
        await expectFocusLinked(`colección: slug inválido${sfx}`, { text: /Slug: minúsculas/, name: /Slug/ });
        await p.goto(`${BASE}/admin/configuracion`); await expectText(p, 'ENVÍO');
        await p.getByRole('button', { name: /NUEVO MÉTODO/ }).click();
        await dlg.getByLabel('Código').fill('express'); await dlg.getByLabel('Orden').fill('-1');
        await submitIn('[role=dialog]');
        await expectFocusLinked(`envío sin nombre${sfx}`, { text: /nombre es obligatorio/, name: /Nombre/ });
        await p.goto(`${BASE}/admin/inventario`); const qty = p.locator('input[aria-label^="Cantidad a ajustar "]').first();
        await qty.waitFor({ timeout: 8000 }); await qty.locator('xpath=..').locator('button').first().click();
        await expectFocusLinked(`inventario sin cantidad${sfx}`, { text: /cantidad entera/, name: /Cantidad a ajustar/ });
        await p.goto(`${BASE}/admin/imagenes`); await expectText(p, 'IMÁGENES');
        await p.getByRole('button', { name: /^Cambiar imagen / }).first().click();
        await dlg.locator('input[placeholder="https://…"]').fill('http://img.test/a.jpg');
        await dlg.getByRole('button', { name: 'GUARDAR Y PUBLICAR' }).click();
        await expectFocusLinked(`imagen editorial http${sfx}`, { text: /https:\/\//, name: /URL/ });
        await p.goto(`${BASE}/admin/pedidos`); await expectText(p, num);
        await p.locator('tr', { hasText: num }).getByRole('button', { name: 'GESTIONAR' }).click();
        const sel = p.locator('#order-next-status'); await sel.waitFor({ timeout: 8000 });
        if (!(await sel.locator('option[value="shipped"]').count())) { // pagado → primero «En preparación» (cambio válido)
          await sel.selectOption('processing'); await dlg.getByRole('button', { name: 'GUARDAR' }).click();
          await expectText(p, 'Pagado → En preparación'); // el modal se cierra al guardar: se vuelve a abrir
          await p.locator('tr', { hasText: num }).getByRole('button', { name: 'GESTIONAR' }).click();
          await sel.locator('option[value="shipped"]').waitFor({ state: 'attached', timeout: 8000 });
        }
        await sel.selectOption('shipped');
        await dlg.getByLabel('Transportadora').fill('Coordinadora');
        await dlg.getByRole('button', { name: 'GUARDAR' }).click();
        await expectFocusLinked(`pedido enviado sin guía${sfx}`, { text: /número de guía/, name: /Número de guía/ });
      };
      await admin('');
      await p.setViewportSize({ width: 375, height: 812 });
      await admin(' (móvil)');
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
      if (checked.length !== 27) throw new Error(`solo se comprobaron ${checked.length}/27 envíos inválidos: ${checked.join(', ')}`);
    }, browser);

    // Ejecución 114 (D85): el resto de formularios con `required` nativo. /login y /cuenta sin sesión no tenían
    // `noValidate`: Chromium mostraba su globo y el aviso de la página no salía; /cuenta además no asociaba etiquetas.
    await journey('46. Errores de formulario en Chromium (2): acceso de la tienda, checkout y «Mi cuenta» (escritorio y móvil)', async (p) => {
      const failures = []; const checked = [];
      const expectFocusLinked = makeFocusChecker(p, failures, checked);
      const formOf = (sel) => p.locator('form', { has: p.locator(sel) });
      const sendForm = (sel) => formOf(sel).locator('button[type=submit]').first().click();

      const access = async (sfx) => {
        // /login (Login.jsx)
        await p.goto(`${BASE}/login`); await p.evaluate(() => localStorage.clear()); await p.reload();
        await p.locator('#login-email').waitFor({ timeout: 8000 });
        await sendForm('#login-email');
        await expectFocusLinked(`/login vacío${sfx}`, { text: /Escribe tu correo/, name: /Correo/ });
        await p.locator('#login-email').fill('ana@'); await sendForm('#login-email');
        await expectFocusLinked(`/login correo incompleto${sfx}`, { text: /nombre@dominio/, name: /Correo/ });
        await p.locator('#login-email').fill('admin@jm.test'); await sendForm('#login-email');
        await expectFocusLinked(`/login sin contraseña${sfx}`, { text: /Escribe tu contraseña/, name: /Contraseña/ });
        await p.locator('#login-password').fill('Clave-Equivocada-9'); await sendForm('#login-email');
        await p.locator('#login-field-error').waitFor({ timeout: 8000 });
        await expectFocusLinked(`/login credenciales erróneas${sfx}`, { text: /incorrectos/, name: /Contraseña/ });
        await p.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
        await p.locator('#login-fullname').waitFor({ timeout: 8000 }); await sendForm('#login-email');
        await expectFocusLinked(`/login registro sin nombre${sfx}`, { text: /nombre completo/, name: /Nombre/ });
        await p.locator('#login-fullname').fill('Rita Foco'); await p.locator('#login-password').fill('corta'); await sendForm('#login-email');
        await expectFocusLinked(`/login registro contraseña corta${sfx}`, { text: /al menos 8/, name: /Contraseña/ });

        // /cuenta sin sesión (AccountPage)
        await p.goto(`${BASE}/cuenta`); await p.locator('#account-auth-email').waitFor({ timeout: 8000 });
        await sendForm('#account-auth-email');
        await expectFocusLinked(`/cuenta vacío${sfx}`, { text: /Escribe tu correo/, name: /Correo/ });
        await p.getByRole('button', { name: /Olvidaste tu contraseña/ }).click();
        await expectFocusLinked(`/cuenta recuperar sin correo${sfx}`, { text: /recuperación/, name: /Correo/ });
        await p.locator('#account-auth-email').fill('admin@jm.test'); await p.locator('#account-auth-password').fill('Clave-Equivocada-9');
        await sendForm('#account-auth-email');
        await p.locator('#account-auth-error').waitFor({ timeout: 8000 });
        await expectFocusLinked(`/cuenta credenciales erróneas${sfx}`, { text: /incorrectos/, name: /Contraseña/ });
        await p.getByRole('button', { name: /Empieza/ }).click();
        await p.locator('#account-auth-name').waitFor({ timeout: 8000 }); await sendForm('#account-auth-email');
        await expectFocusLinked(`/cuenta registro sin nombre${sfx}`, { text: /nombre completo/, name: /Nombre/ });
        await p.locator('#account-auth-name').fill('Rita Foco'); await p.locator('#account-auth-password').fill('corta');
        await sendForm('#account-auth-email');
        await expectFocusLinked(`/cuenta registro contraseña corta${sfx}`, { text: /al menos 8/, name: /Contraseña/ });

        // checkout sin sesión
        await addToCart(p, 'camiseta-basica', 'M', 'Negro');
        await p.goto(`${BASE}/checkout`); await p.locator('input[name=firstName]').waitFor({ timeout: 8000 });
        await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
        await expectFocusLinked(`checkout vacío${sfx}`, { text: /Escribe tu nombre/, name: /Nombre/ });
        await fillCheckout(p, { email: 'juan@correo' });
        await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
        await expectFocusLinked(`checkout correo inválido${sfx}`, { text: /correo válido/, name: /Correo|Email/i });
      };
      await access('');
      await p.setViewportSize({ width: 375, height: 812 });
      await access(' (móvil)');
      await p.setViewportSize({ width: 1280, height: 900 });

      // «Mi cuenta» con sesión: datos, direcciones y contraseña
      await p.evaluate(() => localStorage.clear());
      await p.goto(`${BASE}/login`); await p.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
      await p.locator('#login-fullname').fill('Rita Cuenta');
      await p.locator('#login-email').fill('rita.cuenta@correo.co'); await p.locator('#login-password').fill('Clave-Segura-1');
      await sendForm('#login-email');
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      for (const [vp, sfx] of [[{ width: 1280, height: 900 }, ''], [{ width: 375, height: 812 }, ' (móvil)']]) {
        await p.setViewportSize(vp);
        await p.goto(`${BASE}/cuenta`); const nameIn = p.locator('#profile-full-name');
        await nameIn.waitFor({ timeout: 8000 });
        // Ejecución 134: con el equipo cargado (GitHub), las secciones de arriba terminaban de cargar DESPUÉS del clic
        // y desplazaban el formulario por debajo del pliegue (campo en y=1026 con scrollY=0): esperar a la red quieta.
        await p.waitForLoadState('networkidle').catch(() => {});
        await nameIn.fill(' ');
        await p.getByRole('button', { name: 'Guardar datos' }).click();
        await expectFocusLinked(`mis datos sin nombre${sfx}`, { text: /nombre completo/, name: /Nombre completo/ });
        await p.getByRole('button', { name: /Agregar dirección/ }).click();
        await p.getByTestId('address-form').waitFor({ timeout: 8000 });
        await p.locator('#addr-recipient_name').fill('');
        await p.getByRole('button', { name: 'Guardar dirección' }).click();
        await expectFocusLinked(`dirección vacía${sfx}`, { text: /quien recibe/, name: /Quien recibe/ });
        await p.getByTestId('address-form').getByRole('button', { name: 'Cancelar' }).click();
        await p.locator('#acc-new-password').fill('corta');
        await p.getByRole('button', { name: 'Cambiar contraseña' }).click();
        await expectFocusLinked(`contraseña corta${sfx}`, { text: /al menos 8/, name: /Nueva contraseña/ });
      }
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
      if (checked.length !== 32) throw new Error(`solo se comprobaron ${checked.length}/32 envíos inválidos: ${checked.join(', ')}`);
    }, browser, /Login Exception|Invalid login|400/);

    await journey('6. Pedido pagado (webhook SINTÉTICO, no Wompi): confirmación y carrito vacío', async (p) => {
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p);
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const st = await state(); const num = st.orders[0].order_number;
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      await p.reload();
      await expectText(p, num);
      const s2 = await state();
      if (s2.orders[0].status !== 'paid') throw new Error('estado no pagado');
      if (s2.inventories.find((i) => i.sku === 'CAM-M-NEG').stock !== 4) throw new Error('stock no descontado al pagar');
    }, browser);

    await journey('7. Checkout: sin stock al confirmar → error claro y carrito intacto', async (p) => {
      await addToCart(p, 'camiseta-basica', 'L', 'Negro'); // 1 unidad
      await p.goto(`${BASE}/checkout`); await fillCheckout(p);
      await fetch(`${API_URL}/rest/v1/rpc/create_order`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_customer: { name: 'Otro', email: 'o@c.co', phone: '3000000000' }, p_shipping: { department: 'A', city: 'B', address: 'C 123' }, p_items: [{ variant_id: 'va-l-neg', quantity: 1 }], p_shipping_method: 'standard', p_idempotency_key: 'otro-cliente' }) });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await expectText(p, 'stock', 10000);
      if ((await state()).orders.length !== 1) throw new Error('se creó un pedido sin stock');
      const items = await p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14')).state.items.length);
      if (items !== 1) throw new Error('se perdió el carrito');
    }, browser);

    await journey('11. Cuenta: perfil, direcciones y checkout con dirección guardada', async (p) => {
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Luisa Mora');
      await p.locator('input[type=email]').fill('luisa@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/cuenta`);
      // perfil: validación visible y guardado real
      const perfil = p.getByTestId('profile-section');
      await perfil.locator('input[name=full_name]').fill('Luisa Fernanda Mora');
      await perfil.locator('input[name=phone]').fill('12');
      await perfil.getByRole('button', { name: 'Guardar datos' }).click();
      await perfil.getByText(/7 a 15 dígitos/).first().waitFor({ timeout: 5000 });
      await perfil.locator('input[name=phone]').fill('3109876543');
      await perfil.getByRole('button', { name: 'Guardar datos' }).click();
      await perfil.getByText('Datos guardados').waitFor({ timeout: 5000 });
      await p.locator('h1').filter({ hasText: 'Luisa Fernanda Mora' }).waitFor({ timeout: 5000 });
      // direcciones: dos direcciones, la segunda pasa a principal
      const libreta = p.getByTestId('address-book');
      const nueva = async (dept, city, line) => {
        await libreta.getByRole('button', { name: 'Agregar dirección' }).click();
        const f = libreta.getByTestId('address-form');
        await f.locator('select[name=department]').selectOption({ label: dept });
        await f.locator('input[name=city]').fill(city); await f.locator('input[name=address_line]').fill(line);
        await f.getByRole('button', { name: 'Guardar dirección' }).click();
        await libreta.getByText(line).first().waitFor({ timeout: 5000 });
      };
      await nueva('Antioquia', 'Envigado', 'Calle 40 Sur # 25-10');
      await nueva('Caldas', 'Manizales', 'Carrera 23 # 65-11');
      await libreta.getByTestId('address-item').filter({ hasText: 'Manizales' }).getByRole('button', { name: 'Hacer principal' }).click();
      await libreta.getByTestId('address-item').filter({ hasText: 'Manizales' }).getByText('Principal', { exact: true }).waitFor({ timeout: 5000 });
      // tras recargar, persiste (BD, no estado local)
      await p.reload();
      await p.getByTestId('address-item').first().filter({ hasText: 'Manizales' }).getByText('Principal', { exact: true }).waitFor({ timeout: 8000 });
      if ((await p.getByTestId('address-item').count()) !== 2) throw new Error('se esperaban 2 direcciones tras recargar');
      // checkout: sale la principal y se puede cambiar a la otra
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`);
      await p.waitForFunction(() => document.querySelector('input[name=address]')?.value === 'Carrera 23 # 65-11', null, { timeout: 8000 });
      if ((await p.locator('input[name=phone]').inputValue()) !== '3109876543') throw new Error('el teléfono del perfil no llegó al checkout');
      const opt = await p.getByTestId('saved-address-select').locator('option', { hasText: 'Envigado' }).getAttribute('value');
      await p.getByTestId('saved-address-select').selectOption(opt);
      if ((await p.locator('input[name=city]').inputValue()) !== 'Envigado') throw new Error('elegir otra dirección guardada no cambió el formulario');
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const o = (await state()).orders[0];
      if (o.shipping_city !== 'Envigado' || o.shipping_address !== 'Calle 40 Sur # 25-10') throw new Error(`pedido con dirección inesperada: ${o.shipping_city} / ${o.shipping_address}`);
    }, browser);

    await journey('12. Cuenta: guardar la dirección del checkout y cambiar la contraseña', async (p) => {
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Marta Ruiz');
      await p.locator('input[type=email]').fill('marta@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      // checkout con dirección escrita a mano y «Guardar esta dirección en mi cuenta»
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'marta@correo.co', city: 'Rionegro', address: 'Calle 49 # 50-12' });
      const guardar = p.getByTestId('save-address-checkbox');
      await guardar.check();
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      await p.goto(`${BASE}/cuenta`);
      const item = p.getByTestId('address-item').filter({ hasText: 'Calle 49 # 50-12' });
      await item.getByText('Principal', { exact: true }).waitFor({ timeout: 8000 });
      if ((await p.getByTestId('address-item').count()) !== 1) throw new Error('se esperaba 1 dirección guardada desde el checkout');
      // cambiar la contraseña: la misma se rechaza con un motivo claro; una nueva sirve para volver a entrar
      const sec = p.getByTestId('account-password');
      await sec.locator('input[name=password]').fill('Clave-Segura-1'); await sec.locator('input[name=confirm]').fill('Clave-Segura-1');
      await sec.getByRole('button', { name: 'Cambiar contraseña' }).click();
      await sec.getByText(/distinta de la actual/).waitFor({ timeout: 5000 });
      await sec.locator('input[name=password]').fill('Clave-Nueva-22'); await sec.locator('input[name=confirm]').fill('Clave-Nueva-22');
      await sec.getByRole('button', { name: 'Cambiar contraseña' }).click();
      await sec.getByText(/Contraseña actualizada/).waitFor({ timeout: 5000 });
      await p.getByText(/cerrar sesi[oó]n/i).first().click();
      await p.waitForFunction(() => !Object.keys(localStorage).some((k) => k.includes('auth-token')));
      await p.goto(`${BASE}/cuenta`);
      await p.locator('input[type=email]').fill('marta@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.getByRole('button', { name: 'Iniciar sesión' }).first().click();
      await expectText(p, 'Correo o contraseña incorrectos');
      await p.locator('input[type=password]').fill('Clave-Nueva-22');
      await p.getByRole('button', { name: 'Iniciar sesión' }).first().click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
    }, browser);

    await journey('13. Enlace del pedido en otro navegador: pagar (rechazo de la BD → estado real) y cancelar', async (p) => {
      // Navegador A crea dos pedidos; el navegador B (contexto nuevo, sin localStorage) solo tiene el enlace.
      for (let i = 0; i < 2; i += 1) {
        await addToCart(p, 'camiseta-basica', 'M', 'Negro');
        await p.goto(`${BASE}/checkout`); await fillCheckout(p);
        await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
        await p.waitForURL(/\/checkout\/confirmacion/);
        await expectText(p, 'Pedido registrado');
      }
      const st = await state();
      const [second, first] = st.orders; // unshift: el más reciente primero
      const link = (o) => `${BASE}/checkout/confirmacion?order=${encodeURIComponent(o.order_number)}&token=${encodeURIComponent(o.public_token)}`;
      const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
      try {
        const b = await ctxB.newPage();
        // /api/wompi/signature interceptado: se comprueba que el navegador B envía id + token del enlace; la BD
        // sintética marca el pedido como pagado (webhook SINTÉTICO) y la API responde «ya no admite pagos».
        let sent = null;
        await b.route('**/api/wompi/signature', async (route) => {
          sent = JSON.parse(route.request().postData() || '{}');
          await fetch(`${API_URL}/__synthetic-mark-paid/${first.order_number}`);
          await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Este pedido ya no admite pagos.', code: 'JM_ORDER_NOT_PAYABLE' }) });
        });
        await b.goto(link(first));
        await expectText(b, 'Pedido registrado');
        if (await b.getByText('Este pedido se creó en otro navegador').count()) throw new Error('el enlace no permite actuar sobre el pedido');
        await b.getByRole('button', { name: 'Pagar ahora' }).click();
        await b.getByRole('alert').filter({ hasText: 'Este pedido ya no admite pagos.' }).waitFor({ timeout: 8000 });
        await expectText(b, '¡Gracias por tu compra!');
        if (!sent || sent.order_id !== first.id || sent.public_token !== first.public_token) throw new Error(`firma pedida con ${JSON.stringify(sent)}`);
        if (await b.getByRole('button', { name: 'Pagar ahora' }).count()) throw new Error('sigue ofreciendo pagar un pedido pagado');
        // Cancelar el segundo pedido desde B libera la reserva.
        b.on('dialog', (d) => d.accept().catch(() => {}));
        await b.goto(link(second));
        await b.getByRole('button', { name: 'Cancelar pedido' }).click();
        await expectText(b, 'Este pedido fue cancelado.');
        const s2 = await state();
        if (s2.orders.find((o) => o.id === second.id).status !== 'cancelled') throw new Error('el pedido no quedó cancelado');
        if (s2.inventories.find((i) => i.sku === 'CAM-M-NEG').reserved !== 0) throw new Error('la reserva no se liberó');
        // B recuerda los pedidos sobre los que actuó.
        const remembered = await b.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{}').state?.orders?.map((o) => o.id) ?? []);
        if (!remembered.includes(first.id)) throw new Error('el pedido pagado desde el enlace no quedó en este navegador');
      } finally { await ctxB.close(); }
    }, browser);

    await journey('8. Registro, cierre e inicio de sesión, historial de pedidos', async (p) => {
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Ana Gómez');
      await p.locator('input[type=email]').fill('ana@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      const aviso = p.getByRole('status').filter({ hasText: 'Cuenta creada' }).waitFor(); // aviso en pantalla tras crear la cuenta
      await p.locator('button[type=submit]').click(); await aviso; await p.waitForTimeout(300);
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      // compra con sesión
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'ana@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await p.goto(`${BASE}/cuenta/pedidos`); await expectText(p, num);
      // El nombre llega al cargar shipping_methods; antes se ve el nombre de respaldo («Envío estándar»): esperar al final.
      const metodo = await p.getByTestId('order-shipping-method').filter({ hasText: /Estándar/ }).first().textContent({ timeout: 10000 }).catch(() => p.getByTestId('order-shipping-method').first().textContent());
      if (!/Estándar/.test(metodo)) throw new Error(`método de envío en «Mis pedidos»: «${metodo}»`);
      // cerrar sesión, comprobar que la cuenta ya no muestra el pedido, volver a entrar
      await p.getByText(/cerrar sesi[oó]n/i).first().click();
      await p.waitForFunction(() => !Object.keys(localStorage).some((k) => k.includes('auth-token')));
      await p.goto(`${BASE}/cuenta`);
      await p.locator('input[type=email]').fill('ana@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.getByRole('button', { name: 'Iniciar sesión' }).first().click();
      // esperar a que el login termine (sesión guardada) antes de navegar: si no, la navegación interrumpe la petición
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/cuenta/pedidos`); await expectText(p, num);
    }, browser);

    await journey('47. Cliente registrado de punta a punta: registro → compra → pago (webhook SINTÉTICO) → «Mis pedidos» pagado, stock y carrito', async (p) => {
      const before = (await state()).inventories.find((i) => i.sku === 'POL-M-NEG');
      if (!before) throw new Error('sin variante de polo M en el inventario sintético');
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Sara Ríos');
      await p.locator('input[type=email]').fill('sara.rios@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`);
      // con sesión, el correo de la cuenta llega solo al checkout
      await p.waitForFunction(() => document.querySelector('input[name=email]')?.value === 'sara.rios@correo.co', null, { timeout: 8000 });
      await fillCheckout(p, { firstName: 'Sara', lastName: 'Ríos', email: 'sara.rios@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const st = await state();
      const order = st.orders.find((o) => o.customer_email === 'sara.rios@correo.co');
      if (!order) throw new Error('pedido no creado con el correo de la cuenta');
      if (!order.user_id) throw new Error('el pedido no quedó asociado a la cuenta (user_id vacío)');
      if (order.status !== 'payment_pending') throw new Error(`estado inicial «${order.status}»`);
      // pendiente en «Mis pedidos» antes del pago
      await p.goto(`${BASE}/cuenta/pedidos`);
      const card = () => p.locator('div').filter({ hasText: order.order_number }).filter({ has: p.getByText(/Pago pendiente|Compra completada/) }).last();
      await card().getByText('Pago pendiente').first().waitFor({ timeout: 8000 });
      await fetch(`${API_URL}/__synthetic-mark-paid/${order.order_number}`);
      await p.reload();
      await card().getByText('Compra completada').first().waitFor({ timeout: 8000 });
      const after = (await state()).inventories.find((i) => i.sku === before.sku);
      if (after.stock !== before.stock - 1) throw new Error(`stock ${before.stock} → ${after.stock} (se esperaba −1)`);
      const items = await p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items.length);
      if (items !== 0) throw new Error(`carrito con ${items} artículo(s) tras el pago`);
      // cerrar sesión y volver a entrar: el pedido pagado sigue en la cuenta (BD, no estado local)
      await p.getByText(/cerrar sesi[oó]n/i).first().click();
      await p.waitForFunction(() => !Object.keys(localStorage).some((k) => k.includes('auth-token')));
      await login(p, '/cuenta', 'sara.rios@correo.co', 'Clave-Segura-1', 'Iniciar sesión');
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/cuenta/pedidos`);
      await card().getByText('Compra completada').first().waitFor({ timeout: 8000 });
    }, browser);

    await journey('49. Invitado que luego crea cuenta con el mismo correo: su pedido NO pasa a la cuenta; lo ve por el enlace (D88)', async (p) => {
      const register = async (page, name, email) => {
        await page.goto(`${BASE}/login`);
        await page.getByRole('button', { name: 'Crear cuenta' }).click();
        await page.getByPlaceholder(/Juan/i).first().fill(name);
        await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill('Clave-Segura-1');
        await page.locator('button[type=submit]').click();
        await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      };
      const remembered = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"orders":[]}}').state.orders.map((o) => o.order_number));
      // 1) compra como invitado
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { firstName: 'Eva', lastName: 'Gil', email: 'eva.gil@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const guest = (await state()).orders.find((o) => o.customer_email === 'eva.gil@correo.co');
      if (!guest || guest.user_id) throw new Error('el pedido de invitado no se creó sin cuenta');
      // la confirmación sin sesión ofrece el enlace limpio del pedido
      const link = p.getByTestId('guest-order-link');
      await link.waitFor({ timeout: 8000 });
      const url = await link.getByLabel('Enlace del pedido').inputValue();
      if (url !== `${BASE}/checkout/confirmacion?order=${guest.order_number}&token=${guest.public_token}`) throw new Error(`enlace inesperado: ${url}`);
      // 2) crea la cuenta con el MISMO correo en este navegador
      await register(p, 'Eva Gil', 'eva.gil@correo.co');
      await p.goto(`${BASE}/cuenta/pedidos`);
      const box = p.getByTestId('guest-orders');
      await box.waitFor({ timeout: 8000 });
      await expectText(p, 'AÚN NO TIENES PEDIDOS'); // el pedido de invitado no se mezcla con los de la cuenta
      await box.getByText('no se agregan a tu cuenta').waitFor();
      await box.getByRole('link', { name: guest.order_number }).click();
      await p.waitForURL(/\/checkout\/confirmacion\?order=/);
      await expectText(p, `Pedido registrado · ${guest.order_number}`);
      if (await p.getByTestId('guest-order-link').count()) throw new Error('con sesión no debe ofrecerse el enlace de invitado');
      // 3) compra con la cuenta y cierra sesión: el navegador olvida el pedido de la cuenta, conserva el de invitado
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { firstName: 'Eva', lastName: 'Gil', email: 'eva.gil@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const mine = (await state()).orders.find((o) => o.customer_email === 'eva.gil@correo.co' && o.user_id);
      if (!mine) throw new Error('pedido con cuenta no creado');
      if (!(await remembered(p)).includes(mine.order_number)) throw new Error('el pedido con cuenta no quedó recordado antes de cerrar sesión');
      await p.goto(`${BASE}/cuenta/pedidos`);
      await p.getByText(/cerrar sesi[oó]n/i).first().click();
      await p.waitForFunction(() => !Object.keys(localStorage).some((k) => k.includes('auth-token')));
      await p.waitForFunction((n) => !JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14')).state.orders.some((o) => o.order_number === n), mine.order_number, { timeout: 8000 });
      const left = await remembered(p);
      if (!left.includes(guest.order_number)) throw new Error(`se perdió el pedido de invitado: ${left}`);
      // la confirmación sin parámetros ya no lista el pedido de la cuenta (otra persona en este equipo)
      await p.goto(`${BASE}/checkout/confirmacion`);
      await p.getByRole('heading', { level: 1, name: 'Pedidos hechos en este navegador' }).waitFor({ timeout: 8000 });
      if (await p.getByText('Pedido no encontrado').count()) throw new Error('sin enlace no debe decir «Pedido no encontrado» (ejecución 117)');
      if (await p.getByRole('link', { name: mine.order_number }).count()) throw new Error('el pedido de la cuenta sigue visible tras cerrar sesión');
      await p.getByRole('link', { name: guest.order_number }).waitFor();
    }, browser);

    await journey('50. Misma cuenta en dos navegadores: el carrito es de cada navegador; los pedidos son de la cuenta (D89)', async (p, ctx) => {
      const ctxB = await ctx.browser().newContext({ viewport: { width: 1280, height: 900 } });
      try {
        const b = await ctxB.newPage();
        const cartCount = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items.length);
        const signIn = async (page) => {
          await login(page, '/cuenta', 'tomas@correo.co', 'Clave-Segura-1', 'Iniciar sesión');
          await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
        };
        // A: crea la cuenta, agrega dos prendas y hace un pedido con una
        await p.goto(`${BASE}/login`);
        await p.getByRole('button', { name: 'Crear cuenta' }).click();
        await p.getByPlaceholder(/Juan/i).first().fill('Tomás León');
        await p.locator('input[type=email]').fill('tomas@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
        await p.locator('button[type=submit]').click();
        await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
        await addToCart(p, 'polo-clasico', 'M');
        await p.goto(`${BASE}/checkout`); await fillCheckout(p, { firstName: 'Tomás', lastName: 'León', email: 'tomas@correo.co' });
        await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
        await p.waitForURL(/\/checkout\/confirmacion/);
        const order = (await state()).orders.find((o) => o.customer_email === 'tomas@correo.co');
        if (!order?.user_id) throw new Error('pedido sin cuenta');
        await addToCart(p, 'camiseta-basica', 'M', 'Negro');
        const inA = await cartCount(p);
        if (inA < 1) throw new Error('el carrito de A quedó vacío');
        // B: la misma cuenta en otro navegador
        await signIn(b);
        await b.goto(`${BASE}/cuenta/pedidos`);
        await b.locator('div').filter({ hasText: order.order_number }).filter({ has: b.getByText(/Pago pendiente/) }).last().waitFor({ timeout: 8000 });
        if ((await cartCount(b)) !== 0) throw new Error('el carrito de A apareció en B (se decidió carrito por navegador)');
        // el pedido de la cuenta no aparece como «sin cuenta» en B
        if (await b.getByTestId('guest-orders').getByRole('link').count()) throw new Error('B lista pedidos de invitado que no existen');
        await addToCart(b, 'camiseta-basica', 'M', 'Negro');
        await p.reload();
        if ((await cartCount(p)) !== inA) throw new Error('el carrito de B cambió el de A');
        // pago del pedido: ambos navegadores ven el estado de la BD
        await fetch(`${API_URL}/__synthetic-mark-paid/${order.order_number}`);
        for (const page of [p, b]) {
          await page.goto(`${BASE}/cuenta/pedidos`);
          await page.locator('div').filter({ hasText: order.order_number }).filter({ has: page.getByText(/Compra completada/) }).last().waitFor({ timeout: 8000 });
        }
      } finally { await ctxB.close(); }
    }, browser);

    await journey('51. Pago rechazado → el cliente cambia el carrito → paga desde «Mis pedidos»: solo sale del carrito lo comprado', async (p) => {
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Nora Paz');
      await p.locator('input[type=email]').fill('nora.paz@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      const cart = () => p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{"state":{"items":[]}}').state.items.map((i) => `${i.sku}x${i.quantity}`).sort());
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { firstName: 'Nora', lastName: 'Paz', email: 'nora.paz@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const order = (await state()).orders.find((o) => o.customer_email === 'nora.paz@correo.co');
      if (!order || order.status !== 'payment_pending') throw new Error('pedido pendiente no creado');
      const bought = await cart();
      if (bought.length !== 1) throw new Error(`carrito tras crear el pedido: ${bought}`);
      // el pago fue rechazado (vuelve con pago=error): el carrito se conserva y el cliente agrega otra prenda
      await p.goto(`${BASE}/checkout/confirmacion?order=${order.order_number}&token=${order.public_token}&pago=error`);
      await expectText(p, `Pedido registrado · ${order.order_number}`);
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      const before = await cart();
      if (before.length !== 2) throw new Error(`carrito tras agregar: ${before}`);
      // paga el pedido original desde «Mis pedidos» (la firma la pide con id + token; el webhook SINTÉTICO lo marca pagado)
      let sent = null;
      await p.route('**/api/wompi/signature', async (route) => {
        sent = JSON.parse(route.request().postData() || '{}');
        await fetch(`${API_URL}/__synthetic-mark-paid/${order.order_number}`);
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Este pedido ya no admite pagos.', code: 'JM_ORDER_NOT_PAYABLE' }) });
      });
      await p.goto(`${BASE}/cuenta/pedidos`);
      const card = p.locator('div').filter({ has: p.getByText(`PEDIDO #${order.order_number}`, { exact: true }) }).filter({ has: p.getByTestId('order-shipping-method') }).last();
      await card.getByTestId('order-pay').click();
      await card.getByText('Compra completada').waitFor({ timeout: 8000 });
      if (!sent || sent.order_id !== order.id) throw new Error(`firma pedida con ${JSON.stringify(sent)}`);
      await p.waitForFunction((n) => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14')).state.items.length === n, 1, { timeout: 8000 })
        .catch(async () => { throw new Error(`carrito tras el pago: ${await cart()} (se esperaba solo la camiseta)`); });
      const after = await cart();
      if (after.length !== 1 || after[0] === bought[0]) throw new Error(`carrito tras el pago: ${after}; comprado: ${bought}`);
      // la prenda agregada después sigue en el carrito visible y se puede comprar
      await p.goto(`${BASE}/carrito`);
      await p.locator('main').getByText('Camiseta Básica').first().waitFor({ timeout: 8000 });
      if (await p.locator('main').getByText('Polo Clásico').count()) throw new Error('el polo ya pagado sigue en el carrito');
      await p.unroute('**/api/wompi/signature');
    }, browser);

    await journey('52. Checkout con un pedido anterior pendiente: aviso, cancelarlo libera la reserva y se crea uno solo nuevo', async (p) => {
      const polo = async () => (await state()).inventories.find((i) => i.sku === 'POL-M-NEG').reserved;
      const reservedBefore = await polo();
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { firstName: 'Iris', lastName: 'Vega', email: 'iris.vega@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const first = (await state()).orders.find((o) => o.customer_email === 'iris.vega@correo.co');
      if (!first || first.status !== 'payment_pending') throw new Error('pedido pendiente no creado');
      if (await polo() !== reservedBefore + 1) throw new Error('el pedido no reservó el polo');
      // mismo carrito: el checkout avisa y ofrece pagarlo sin crear otro
      await p.goto(`${BASE}/checkout`);
      const notice = p.getByTestId('pending-order-notice');
      await notice.waitFor({ timeout: 8000 });
      if (await notice.getAttribute('data-same-cart') !== 'true') throw new Error('con el mismo carrito debía indicar que es el mismo pedido');
      if (await p.getByTestId('pending-order-pay').getAttribute('href') !== `/checkout/confirmacion?order=${encodeURIComponent(first.order_number)}&token=${encodeURIComponent(first.public_token)}`) throw new Error('enlace de pago incorrecto');
      // el cliente cambia el carrito: el aviso explica que el anterior seguiría reservando stock
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await p.goto(`${BASE}/checkout`);
      await notice.waitFor({ timeout: 8000 });
      if (await notice.getAttribute('data-same-cart') !== 'false') throw new Error('con el carrito cambiado debía avisar');
      await expectText(p, 'seguirá reservando stock');
      p.once('dialog', (d) => d.accept().catch(() => {}));
      await p.getByTestId('pending-order-cancel').click();
      await p.getByTestId('pending-order-cancelled').waitFor({ timeout: 8000 });
      const cancelled = (await state()).orders.find((o) => o.id === first.id);
      if (cancelled.status !== 'cancelled') throw new Error(`estado del pedido anterior: ${cancelled.status}`);
      if (await polo() !== reservedBefore) throw new Error('cancelar no liberó la reserva del polo');
      // confirmar ahora crea UN pedido nuevo con el carrito actual; no queda otro pendiente de esta clienta
      await fillCheckout(p, { firstName: 'Iris', lastName: 'Vega', email: 'iris.vega@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const mine = (await state()).orders.filter((o) => o.customer_email === 'iris.vega@correo.co');
      const pendingNow = mine.filter((o) => o.status === 'payment_pending');
      if (mine.length !== 2 || pendingNow.length !== 1 || pendingNow[0].online_order_items.length !== 2) {
        throw new Error(`pedidos de la clienta: ${mine.map((o) => `${o.status}/${o.online_order_items.length}`).join(', ')}`);
      }
      if (await polo() !== reservedBefore + 1) throw new Error('el pedido nuevo no reservó el polo');
    }, browser);

    await journey('53. Carrito: variante agotada o con menos stock mientras está en el carrito → aviso por línea y ajuste antes del checkout', async (p) => {
      const setStock = (sku, n) => fetch(`${API_URL}/__synthetic-set-stock/${sku}/${n}`).then(j);
      await addToCart(p, 'polo-clasico', 'M');
      await addToCart(p, 'polo-clasico', 'M');
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await p.goto(`${BASE}/carrito`);
      await expectText(p, 'CARRITO DE COMPRAS (3)');
      const checkoutBtn = p.getByRole('button', { name: /PROCEDER AL CHECKOUT/ });
      await p.waitForFunction(() => !document.querySelector('[data-stock-short]'), null, { timeout: 8000 });
      if (await checkoutBtn.isDisabled()) throw new Error('con stock el checkout no debía estar bloqueado');
      // catálogo ya cargado (los selectores de talla se habilitan con él): lo que sigue lo detecta solo la cotización
      await p.waitForFunction(() => [...document.querySelectorAll('select[aria-label^="Talla de"]')].every((s) => !s.disabled), null, { timeout: 8000 });
      // otra persona compra mientras el carrito está abierto: camiseta agotada y solo 1 polo
      await setStock('CAM-M-NEG', 0); await setStock('POL-M-NEG', 1);
      await p.evaluate(() => window.dispatchEvent(new Event('focus'))); // el cliente vuelve a la pestaña
      const short = p.locator('[data-stock-short="true"]');
      await p.waitForFunction(() => document.querySelectorAll('[data-stock-short="true"]').length === 2, null, { timeout: 8000 });
      await short.filter({ hasText: 'Camiseta Básica' }).getByText('Agotado: ya no quedan unidades').waitFor();
      await short.filter({ hasText: 'Polo Clásico' }).getByText('Solo quedan 1; tienes 2 en el carrito.').waitFor();
      if (!(await checkoutBtn.isDisabled())) throw new Error('con líneas sin stock el checkout debía estar bloqueado');
      // «+» ya respeta lo que dice la BD (no el catálogo cargado antes)
      await p.getByRole('button', { name: 'Aumentar cantidad de Polo Clásico' }).click();
      await expectText(p, 'Solo hay 1 unidad(es) disponibles.');
      await p.getByRole('button', { name: 'Ajustar el carrito al stock disponible' }).click();
      await p.waitForFunction(() => !document.querySelector('[data-stock-short]'), null, { timeout: 8000 });
      await expectText(p, 'Quitamos Camiseta Básica (M, Negro): está agotado.');
      await expectText(p, 'CARRITO DE COMPRAS (1)');
      await p.waitForFunction(() => !document.querySelector('button[disabled]')?.textContent.includes('PROCEDER'), null, { timeout: 8000 });
      await checkoutBtn.click();
      await p.waitForURL(/\/checkout$/);
      await fillCheckout(p, { email: 'stock.cart@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const o = (await state()).orders.find((x) => x.customer_email === 'stock.cart@correo.co');
      if (!o || o.online_order_items.length !== 1 || o.online_order_items[0].quantity !== 1) throw new Error(`pedido tras ajustar: ${JSON.stringify(o?.online_order_items?.map((i) => i.quantity))}`);
    }, browser);

    await journey('54. Carrito lateral: variante agotada o con menos stock → aviso por línea, quitar/ajustar y checkout con lo ajustado', async (p) => {
      const setStock = (sku, n) => fetch(`${API_URL}/__synthetic-set-stock/${sku}/${n}`).then(j);
      await addToCart(p, 'polo-clasico', 'M');
      await addToCart(p, 'polo-clasico', 'M');
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      // página nueva con el catálogo YA cargado (la reconciliación al cargarlo ajusta sola; aquí se prueba la cotización)
      await p.goto(`${BASE}/ropa`);
      await p.getByText('Polo Clásico').first().waitFor({ timeout: 8000 });
      await p.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 8000 });
      const openBtn = p.getByRole('button', { name: /^Abrir carrito, 3 productos$/ });
      await openBtn.click();
      const dlg = p.getByRole('dialog', { name: 'Carrito' });
      await dlg.waitFor();
      await p.waitForTimeout(400);
      if (await dlg.locator('[data-stock-short]').count()) throw new Error('con stock no debía haber avisos en el carrito lateral');
      await dlg.getByRole('button', { name: 'Cerrar' }).click();
      // otra persona compra: camiseta agotada y solo 1 polo; el cliente vuelve a abrir el carrito
      await setStock('CAM-M-NEG', 0); await setStock('POL-M-NEG', 1);
      await openBtn.click();
      await p.waitForFunction(() => document.querySelectorAll('[role="dialog"] [data-stock-short="true"]').length === 2, null, { timeout: 8000 });
      const short = dlg.locator('[data-stock-short="true"]');
      await short.filter({ hasText: 'Camiseta Básica' }).getByText('Agotado: ya no quedan unidades').waitFor();
      await short.filter({ hasText: 'Polo Clásico' }).getByText('Solo quedan 1; tienes 2 en el carrito.').waitFor();
      await dlg.getByText('2 prendas de tu carrito ya no tienen stock suficiente.').waitFor();
      // «+» ya respeta la BD
      await dlg.getByRole('button', { name: 'Aumentar cantidad de Polo Clásico' }).click();
      await dlg.getByText('Solo hay 1 unidad(es) disponibles.').waitFor();
      // por línea: ajustar el polo; luego quitar la camiseta
      await short.filter({ hasText: 'Polo Clásico' }).getByRole('button', { name: 'Ajustar a 1' }).click();
      await p.waitForFunction(() => document.querySelectorAll('[role="dialog"] [data-stock-short="true"]').length === 1, null, { timeout: 8000 });
      await dlg.locator('[data-stock-short="true"]').getByRole('button', { name: 'Quitar del carrito' }).click();
      await p.waitForFunction(() => !document.querySelector('[role="dialog"] [data-stock-short]'), null, { timeout: 8000 });
      await dlg.getByText('Quitamos Camiseta Básica (M, Negro): está agotado.').waitFor();
      await dlg.getByText('(1)').waitFor();
      await dlg.getByRole('button', { name: /FINALIZAR COMPRA/ }).click();
      await p.waitForURL(/\/checkout$/);
      await fillCheckout(p, { email: 'stock.drawer@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const o = (await state()).orders.find((x) => x.customer_email === 'stock.drawer@correo.co');
      if (!o || o.online_order_items.length !== 1 || o.online_order_items[0].quantity !== 1) throw new Error(`pedido tras ajustar: ${JSON.stringify(o?.online_order_items?.map((i) => i.quantity))}`);
    }, browser);

    await journey('55. Checkout: variante agotada o con menos stock con el checkout abierto → aviso por línea, quitar/ajustar y pedido con lo ajustado', async (p) => {
      const setStock = (sku, n) => fetch(`${API_URL}/__synthetic-set-stock/${sku}/${n}`).then(j);
      await addToCart(p, 'polo-clasico', 'M');
      await addToCart(p, 'polo-clasico', 'M');
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await p.goto(`${BASE}/checkout`);
      await fillCheckout(p, { email: 'stock.checkout@correo.co' });
      const pay = p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' });
      await p.waitForFunction(() => !document.querySelector('[data-stock-short]'), null, { timeout: 8000 });
      await p.waitForTimeout(400);
      if (await pay.isDisabled()) throw new Error('con stock el pago no debía estar bloqueado');
      // otra persona compra con el checkout abierto: camiseta agotada y solo 1 polo; el cliente vuelve a la pestaña
      await setStock('CAM-M-NEG', 0); await setStock('POL-M-NEG', 1);
      await p.evaluate(() => window.dispatchEvent(new Event('focus')));
      await p.waitForFunction(() => document.querySelectorAll('[data-stock-short="true"]').length === 2, null, { timeout: 8000 });
      await expectText(p, 'Algunos productos ya no tienen stock suficiente:');
      await expectText(p, 'Camiseta Básica (M, Negro): agotado.');
      if (!(await pay.isDisabled())) throw new Error('con líneas sin stock el pago debía estar bloqueado');
      await p.getByRole('button', { name: 'Ajustar Polo Clásico (M, Negro) a 1' }).click();
      await p.waitForFunction(() => document.querySelectorAll('[data-stock-short="true"]').length === 1, null, { timeout: 8000 });
      await expectText(p, 'Polo Clásico (M, Negro): cantidad ajustada a 1.');
      await p.getByRole('button', { name: 'Quitar Camiseta Básica (M, Negro) del carrito' }).click();
      await p.waitForFunction(() => !document.querySelector('[data-stock-short]'), null, { timeout: 8000 });
      await expectText(p, 'Quitamos Camiseta Básica (M, Negro): está agotado.');
      await expectText(p, 'TU PEDIDO (1)');
      await p.waitForFunction(() => { const b = [...document.querySelectorAll('button[type=submit]')].find((x) => x.textContent.includes('CONFIRMAR')); return b && !b.disabled; }, null, { timeout: 8000 });
      // los datos del formulario se conservan tras ajustar
      if ((await p.locator('input[name="email"]').inputValue()) !== 'stock.checkout@correo.co') throw new Error('se perdió el correo del formulario');
      await pay.click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      const o = (await state()).orders.find((x) => x.customer_email === 'stock.checkout@correo.co');
      if (!o || o.online_order_items.length !== 1 || o.online_order_items[0].quantity !== 1) throw new Error(`pedido tras ajustar: ${JSON.stringify(o?.online_order_items?.map((i) => i.quantity))}`);
    }, browser);

    await journey('56. Admin: un pedido con la ventana de pago cumplida (sin tarea programada) se vence al abrir el panel, libera su reserva y no cuenta «por preparar»', async (p, ctx) => {
      // la última talla L negra queda reservada por un pedido sin pagar
      await addToCart(p, 'camiseta-basica', 'L', 'Negro');
      await p.goto(`${BASE}/checkout`);
      await fillCheckout(p, { email: 'vencido@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      let st = await state();
      const pending = st.orders.find((o) => o.customer_email === 'vencido@correo.co');
      const cam = () => st.inventories.find((i) => i.sku === 'CAM-L-NEG');
      if (!pending || pending.status !== 'payment_pending' || cam().reserved !== 1) throw new Error(`reserva inicial: ${pending?.status} ${JSON.stringify(cam())}`);
      // un pedido pagado para preparar; la ventana del pendiente vence sin que corra ninguna tarea programada
      await fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_name: 'Por Preparar', customer_email: 'preparar@correo.co', status: 'paid' }) });
      await fetch(`${API_URL}/__synthetic-expire-window/${pending.order_number}`);
      st = await state();
      if (st.orders.find((o) => o.id === pending.id).status !== 'payment_pending' || cam().reserved !== 1) throw new Error('el vencimiento no debía ocurrir antes de abrir el panel');
      // otra persona: con la reserva vigente la talla figura agotada
      const other = await ctx.newPage();
      await other.goto(`${BASE}/producto/camiseta-basica`);
      await other.getByRole('button', { name: 'Color Negro' }).click();
      const lAgotada = other.getByRole('button', { name: /^Talla L agotada/ });
      await lAgotada.waitFor({ timeout: 8000 });
      if (!(await lAgotada.isDisabled())) throw new Error('con la reserva vigente la talla L negra debía estar agotada');
      // el admin abre el panel: se vence y libera la reserva antes de mostrar nada
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      await p.locator('[aria-label="1 pedido por preparar"]').first().waitFor({ timeout: 8000 });
      await p.goto(`${BASE}/admin/pedidos`);
      const row = p.locator('tbody tr').filter({ hasText: pending.order_number });
      await row.getByText('Vencido', { exact: true }).first().waitFor({ timeout: 8000 });
      st = await state();
      if (st.orders.find((o) => o.id === pending.id).status !== 'expired') throw new Error('el pedido no quedó vencido en la BD');
      if (cam().reserved !== 0 || cam().stock !== 1) throw new Error(`reserva no liberada: ${JSON.stringify(cam())}`);
      const ev = st.orders.find((o) => o.id === pending.id).order_events[0];
      if (ev.to_status !== 'expired' || ev.actor !== 'system') throw new Error(`evento: ${JSON.stringify(ev)}`);
      await p.goto(`${BASE}/admin/inventario`);
      await p.locator('tbody tr').filter({ hasText: 'CAM-L-NEG' }).getByText('stock 1 · reservado 0').waitFor({ timeout: 8000 });
      // el menú sigue contando solo el pagado
      await p.locator('[aria-label="1 pedido por preparar"]').first().waitFor({ timeout: 8000 });
      // la talla vuelve a estar a la venta para los demás
      await other.reload();
      await other.getByRole('button', { name: 'Color Negro' }).click();
      await other.getByRole('button', { name: 'Talla L', exact: true }).click({ timeout: 8000 });
      if (await other.getByRole('button', { name: 'AGREGAR AL CARRITO' }).first().isDisabled()) throw new Error('la talla liberada no se puede agregar');
    }, browser);

    await journey('57. Ficha de producto: la talla elegida baja de stock o se agota mientras el cliente está en otra pestaña → se ajusta y se avisa al volver', async (p) => {
      const setStock = (sku, n) => fetch(`${API_URL}/__synthetic-set-stock/${sku}/${n}`).then(j);
      await p.goto(`${BASE}/producto/polo-clasico`);
      await p.getByRole('button', { name: 'Talla M', exact: true }).click();
      const plus = p.getByRole('button', { name: 'Aumentar cantidad' }).first();
      for (let i = 0; i < 3; i += 1) await plus.click();
      const qty = () => plus.evaluate((b) => b.previousElementSibling.textContent);
      if ((await qty()) !== '4') throw new Error(`cantidad inicial: ${await qty()}`);
      const notice = p.getByTestId('pdp-stock-notice');
      // otra persona compra: quedan 2; el cliente vuelve a la pestaña
      await setStock('POL-M-NEG', 2);
      await p.evaluate(() => window.dispatchEvent(new Event('focus')));
      await notice.filter({ hasText: 'Solo quedan 2 unidad(es) de la talla M en Negro; ajustamos la cantidad.' }).waitFor({ timeout: 8000 });
      if ((await qty()) !== '2') throw new Error(`cantidad tras ajustar: ${await qty()}`);
      if (!(await plus.isDisabled())) throw new Error('«+» debía respetar el nuevo máximo');
      if ((await p.getByRole('button', { name: 'Talla M', exact: true }).getAttribute('aria-pressed')) !== 'true') throw new Error('se perdió la talla elegida');
      // se agota del todo mientras el cliente mira otra cosa (cambio de visibilidad)
      await setStock('POL-M-NEG', 0);
      await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await notice.filter({ hasText: 'La talla M en Negro se acaba de agotar. Elige otra talla o color.' }).waitFor({ timeout: 8000 });
      const sold = p.getByRole('button', { name: 'Talla M agotada' });
      if (!(await sold.isDisabled())) throw new Error('la talla agotada debía quedar deshabilitada');
      await expectText(p, 'Producto agotado');
      // agregar sin talla pide elegirla (no llega al carrito una variante agotada)
      await p.getByRole('button', { name: 'AGREGAR AL CARRITO' }).first().click();
      await expectText(p, 'Por favor selecciona una talla antes de agregar al carrito.');
      if ((await p.evaluate(() => JSON.parse(localStorage.getItem('jm-fashion-store-cart-v14') || '{}')?.state?.items?.length ?? 0)) !== 0) throw new Error('no debía agregarse nada al carrito');
      // repone stock: vuelve a estar a la venta sin recargar
      await setStock('POL-M-NEG', 3);
      await p.evaluate(() => window.dispatchEvent(new Event('focus')));
      await p.getByRole('button', { name: 'Talla M', exact: true }).click({ timeout: 8000 });
      if (await notice.count()) throw new Error('el aviso debía desaparecer al elegir talla');
      await p.getByRole('button', { name: 'AGREGAR AL CARRITO' }).first().click();
      await p.getByRole('button', { name: /^Abrir carrito, 1 producto/ }).waitFor({ timeout: 8000 });
    }, browser);

    await journey('58. Admin: pedido vencido pagado tarde sin stock → «Requiere revisión» con la causa y la línea faltante (el cliente ve «en revisión»); el admin cierra la revisión con motivo', async (p, ctx) => {
      // A reserva la última L negra y no paga a tiempo
      await addToCart(p, 'camiseta-basica', 'L', 'Negro');
      await p.goto(`${BASE}/checkout`);
      await fillCheckout(p, { email: 'tarde@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      let st = await state();
      const late = st.orders.find((o) => o.customer_email === 'tarde@correo.co');
      await fetch(`${API_URL}/__synthetic-expire-window/${late.order_number}`);
      // el admin abre el panel: el pedido vence y la unidad vuelve a la venta
      const adm = await ctx.newPage();
      await login(adm, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await adm.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      for (let i = 0; i < 50 && (await state()).orders.find((o) => o.id === late.id).status !== 'expired'; i += 1) await new Promise((r) => setTimeout(r, 200));
      // B compra esa unidad y paga
      const b = await ctx.browser().newContext({ viewport: { width: 1280, height: 900 } });
      const bp = await b.newPage();
      await addToCart(bp, 'camiseta-basica', 'L', 'Negro');
      await bp.goto(`${BASE}/checkout`);
      await fillCheckout(bp, { email: 'atiempo@correo.co' });
      await bp.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await bp.waitForURL(/\/checkout\/confirmacion/);
      const onTime = (await state()).orders.find((o) => o.customer_email === 'atiempo@correo.co');
      await fetch(`${API_URL}/__synthetic-mark-paid/${onTime.order_number}`);
      await b.close();
      // llega tarde el pago de A (webhook SINTÉTICO): se respeta, sin stock → requiere revisión
      const r = await fetch(`${API_URL}/__synthetic-mark-paid/${late.order_number}`).then(j);
      if (r.shortages.length !== 1) throw new Error(`se esperaba 1 faltante: ${JSON.stringify(r)}`);
      st = await state();
      const cam = st.inventories.find((i) => i.sku === 'CAM-L-NEG');
      if (cam.stock !== 0 || cam.reserved !== 0) throw new Error(`el inventario no debía quedar negativo: ${JSON.stringify(cam)}`);
      // el CLIENTE (enlace de seguimiento) ve que su pedido pagado está en revisión, sin la promesa de despacho (ejecución 125)
      await p.reload();
      const notice = p.getByTestId('order-review-notice');
      await notice.waitFor({ timeout: 8000 });
      if (!/Estamos revisando la disponibilidad de tu pedido y te escribiremos a tarde@correo\.co/.test(await notice.textContent())) throw new Error(`aviso: «${await notice.textContent()}»`);
      if (await p.getByText('cuando despachemos tu pedido').count()) throw new Error('promete el despacho de un pedido en revisión');
      if (await p.getByText(/CAM-L-NEG|PAID_WITHOUT_STOCK|faltan/).count()) throw new Error('el cliente ve el detalle interno de la revisión');
      // dashboard: alerta con 1 pedido → lista filtrada
      await adm.goto(`${BASE}/admin/dashboard`);
      await expectText(adm, '1 pedido');
      await adm.goto(`${BASE}/admin/pedidos?revision=1`);
      const row = adm.locator('tbody tr').filter({ hasText: late.order_number });
      await row.getByText('REQUIERE REVISIÓN').waitFor({ timeout: 8000 });
      if (await adm.locator('tbody tr').filter({ hasText: onTime.order_number }).count()) throw new Error('el pedido pagado a tiempo no requiere revisión');
      await row.getByRole('button', { name: 'GESTIONAR' }).click();
      const box = adm.getByTestId('order-attention');
      await box.getByText('El pago llegó cuando ya no había stock').waitFor({ timeout: 8000 });
      const line = await adm.getByTestId('order-attention-shortage').textContent();
      if (!/CAM-L-NEG/.test(line) || !/pagó 1, había 0 disponibles · faltan 1/.test(line)) throw new Error(`línea faltante: «${line}»`);
      await adm.locator('summary', { hasText: 'Historial del pedido' }).click();
      await adm.getByTestId('order-event').filter({ hasText: 'Pagado sin stock suficiente → Pagado · Wompi (webhook)' }).waitFor();
      if (await adm.getByText('PAID_WITHOUT_STOCK').count()) throw new Error('el historial muestra códigos internos');
      // sin motivo no se cierra; con motivo sí
      await adm.getByTestId('order-resolve-attention').click();
      await expectText(adm, 'Escribe cómo se resolvió');
      if (await adm.locator('#order-resolve-note').getAttribute('aria-invalid') !== 'true') throw new Error('la nota vacía no quedó marcada');
      if (!(await state()).orders.find((o) => o.id === late.id).needs_attention) throw new Error('se cerró sin motivo');
      await adm.getByLabel('Cómo se resolvió').fill('Repuse 1 unidad del proveedor y despaché');
      await adm.getByTestId('order-resolve-attention').click();
      await adm.getByRole('status').filter({ hasText: `${late.order_number}: revisión cerrada.` }).waitFor({ timeout: 8000 });
      await row.waitFor({ state: 'detached', timeout: 8000 }); // sale de la lista «solo los que requieren revisión»
      const done = (await state()).orders.find((o) => o.id === late.id);
      const resolved = done.order_events.find((e) => e.event_type === 'ATTENTION_RESOLVED');
      if (done.needs_attention || done.status !== 'paid' || !resolved || resolved.note !== 'Repuse 1 unidad del proveedor y despaché' || resolved.actor !== 'admin') throw new Error(`cierre: ${JSON.stringify(done)}`);
      await adm.goto(`${BASE}/admin/dashboard`);
      await expectText(adm, '0 pedidos');
      // revisión cerrada: el cliente vuelve a ver la confirmación normal
      await p.reload();
      await expectText(p, 'cuando despachemos tu pedido');
      if (await p.getByTestId('order-review-notice').count()) throw new Error('el aviso sigue tras cerrar la revisión');
    }, browser);

    await journey('59. Admin: pedido pagado tarde con una línea sin stock → «Reembolsar y cerrar» registra el reembolso, reingresa solo lo vendido y cierra la revisión', async (p, ctx) => {
      // A pide la última L negra + 2 M negras y no paga a tiempo
      await addToCart(p, 'camiseta-basica', 'L', 'Negro');
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await p.goto(`${BASE}/checkout`);
      await fillCheckout(p, { email: 'reembolso@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/);
      let st = await state();
      const late = st.orders.find((o) => o.customer_email === 'reembolso@correo.co');
      const mBefore = st.inventories.find((i) => i.sku === 'CAM-M-NEG').stock;
      await fetch(`${API_URL}/__synthetic-expire-window/${late.order_number}`);
      const adm = await ctx.newPage();
      await login(adm, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await adm.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      for (let i = 0; i < 50 && (await state()).orders.find((o) => o.id === late.id).status !== 'expired'; i += 1) await new Promise((r) => setTimeout(r, 200));
      // otra compra (B) se lleva la L; luego llega tarde el pago de A (webhook SINTÉTICO): la M se vende, la L falta
      await fetch(`${API_URL}/__synthetic-set-stock/CAM-L-NEG/0`);
      const r = await fetch(`${API_URL}/__synthetic-mark-paid/${late.order_number}`).then(j);
      if (r.shortages.length !== 1) throw new Error(`se esperaba 1 faltante: ${JSON.stringify(r)}`);
      st = await state();
      if (st.inventories.find((i) => i.sku === 'CAM-M-NEG').stock !== mBefore - 2) throw new Error('las 2 M debían venderse');
      await adm.goto(`${BASE}/admin/pedidos?revision=1`);
      const row = adm.locator('tbody tr').filter({ hasText: late.order_number });
      await row.getByRole('button', { name: 'GESTIONAR' }).click();
      const box = adm.getByTestId('order-attention');
      await box.getByText('El pago llegó cuando ya no había stock').waitFor({ timeout: 8000 });
      // sin motivo: aviso enlazado, sin diálogo ni cambios
      let asked = null;
      adm.on('dialog', (d) => { asked = d.message(); d.accept().catch(() => {}); });
      await adm.getByTestId('order-refund-attention').click();
      await expectText(adm, 'Escribe cómo se resolvió');
      if (asked) throw new Error('pidió confirmación sin motivo');
      if ((await state()).orders.find((o) => o.id === late.id).status !== 'paid') throw new Error('cambió sin motivo');
      await adm.getByLabel('Cómo se resolvió').fill('Sin talla L para reponer: reembolsado en Wompi');
      await adm.getByTestId('order-refund-attention').click();
      await adm.getByRole('status').filter({ hasText: `${late.order_number}: reembolso registrado y revisión cerrada.` }).waitFor({ timeout: 8000 });
      if (!asked || !asked.includes(late.order_number) || !/Wompi/.test(asked)) throw new Error(`confirmación: «${asked}»`);
      await row.waitFor({ state: 'detached', timeout: 8000 });
      st = await state();
      const done = st.orders.find((o) => o.id === late.id);
      const closed = done.order_events.find((e) => e.event_type === 'ATTENTION_RESOLVED');
      if (done.status !== 'refunded' || done.needs_attention || !closed?.metadata?.refunded || closed.note !== 'Sin talla L para reponer: reembolsado en Wompi') throw new Error(`reembolso: ${JSON.stringify(done)}`);
      if (st.inventories.find((i) => i.sku === 'CAM-M-NEG').stock !== mBefore) throw new Error('las M vendidas debían volver al inventario');
      if (st.inventories.find((i) => i.sku === 'CAM-L-NEG').stock !== 0) throw new Error('la L que faltó NO debía reingresar');
      // ejecución 127: el cliente (seguimiento del pedido) lee que se le devuelve el dinero, sin promesa de despacho
      await p.reload();
      await p.getByRole('heading', { name: `Pedido reembolsado · ${late.order_number}` }).waitFor({ timeout: 8000 });
      const refundText = await p.getByTestId('order-refund-notice').textContent();
      if (!refundText.includes('Registramos la devolución de') || !refundText.includes('Este pedido no se enviará.')) throw new Error(`aviso de reembolso: «${refundText}»`);
      const body = await p.locator('body').textContent();
      if (/cuando despachemos|Pedido cerrado|Pedido en revisión/.test(body)) throw new Error('el cliente ve un estado ambiguo tras el reembolso');
      // el historial lo dice en palabras; el dashboard ya no cuenta la revisión
      await adm.goto(`${BASE}/admin/pedidos?q=${late.order_number}`);
      await adm.locator('tbody tr').filter({ hasText: late.order_number }).getByRole('button', { name: 'GESTIONAR' }).click();
      if (await adm.getByTestId('order-attention').count()) throw new Error('el panel de revisión sigue abierto');
      await adm.locator('summary', { hasText: 'Historial del pedido' }).click();
      await adm.getByTestId('order-event').filter({ hasText: 'Revisión cerrada con reembolso · admin · Sin talla L para reponer' }).waitFor({ timeout: 8000 });
      await adm.goto(`${BASE}/admin/dashboard`);
      await expectText(adm, '0 pedidos');
    }, browser);

    await journey('60. Cliente registrado: pedido pagado que el admin cancela y otro que reembolsa → «Mis pedidos» y el seguimiento dicen que el dinero vuelve y que no se enviará', async (p) => {
      const email = 'lina.mora@correo.co';
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Lina Mora');
      await p.locator('input[type=email]').fill(email); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      // dos compras pagadas (webhook SINTÉTICO): A la cancelará el admin, B la reembolsará
      const buy = async () => {
        await addToCart(p, 'polo-clasico', 'M');
        await p.goto(`${BASE}/checkout`);
        await p.waitForFunction((e) => document.querySelector('input[name=email]')?.value === e, email, { timeout: 8000 });
        await fillCheckout(p, { firstName: 'Lina', lastName: 'Mora', email });
        const known = new Set((await state()).orders.map((o) => o.id));
        await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
        await p.waitForURL(/\/checkout\/confirmacion/);
        const o = (await state()).orders.find((x) => x.customer_email === email && !known.has(x.id));
        if (!o || !o.user_id) throw new Error('pedido no creado o sin user_id');
        await fetch(`${API_URL}/__synthetic-mark-paid/${o.order_number}`);
        await p.reload();
        await p.getByText('¡Gracias por tu compra!', { exact: false }).first().waitFor({ timeout: 8000 });
        return o;
      };
      const A = await buy();
      const B = await buy();
      // el admin, en su propio navegador, cancela A y reembolsa B (ambos exigen motivo)
      const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      try {
        const adm = await actx.newPage();
        adm.on('dialog', (d) => d.accept().catch(() => {}));
        await login(adm, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
        await adm.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
        for (const [o, to, note] of [[A, 'cancelled', 'Sin tela para confeccionar'], [B, 'refunded', 'Cliente desistió; devuelto en Wompi']]) {
          await adm.goto(`${BASE}/admin/pedidos`);
          await adm.locator('tbody tr').filter({ hasText: o.order_number }).getByRole('button', { name: 'GESTIONAR' }).click();
          await adm.locator('#order-next-status').selectOption(to);
          await adm.getByLabel('Nota del cambio').fill(note);
          await adm.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
          await adm.locator('#order-next-status').waitFor({ state: 'detached', timeout: 8000 });
          for (let i = 0; i < 25 && (await state()).orders.find((x) => x.id === o.id).status !== to; i += 1) await new Promise((r) => setTimeout(r, 200));
          const now = (await state()).orders.find((x) => x.id === o.id).status;
          if (now !== to) throw new Error(`${o.order_number}: estado ${now} ≠ ${to}`);
        }
      } finally { await actx.close(); }
      // el cliente vuelve a «Mis pedidos»
      await p.goto(`${BASE}/cuenta/pedidos`);
      // la tarjeta de un pedido: el div más interno con su número y sin el del otro pedido
      const card = (num) => p.locator('div').filter({ hasText: `PEDIDO #${num}` }).filter({ hasNotText: `PEDIDO #${num === A.order_number ? B.order_number : A.order_number}` }).first();
      const noticeA = card(A.order_number).getByTestId('order-refund-notice');
      await noticeA.waitFor({ timeout: 8000 });
      const tA = await noticeA.textContent();
      if (!tA.includes('Pedido cancelado · devolución registrada.') || !tA.includes('Este pedido no se enviará.') || !/devoluci[oó]n de \$/.test(tA)) throw new Error(`aviso de A: «${tA}»`);
      const tB = await card(B.order_number).getByTestId('order-refund-notice').textContent();
      if (!tB.includes('Reembolso registrado.') || !tB.includes('Este pedido no se enviará.')) throw new Error(`aviso de B: «${tB}»`);
      // la lista puede volver a pintarse (recarga al recuperar el foco): esperar a que se estabilice en 2
      let notices = -1;
      for (let i = 0; i < 40; i += 1) {
        notices = await p.getByTestId('order-refund-notice').count();
        if (notices === 2) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (notices !== 2) throw new Error(`se esperaban exactamente 2 avisos de devolución; hay ${notices}`);
      await card(A.order_number).getByText('Cancelado', { exact: true }).first().waitFor({ timeout: 4000 });
      await card(B.order_number).getByText('Reembolsado', { exact: true }).first().waitFor({ timeout: 4000 });
      // el enlace de seguimiento de A (como el del correo): título claro, sin «Pedido cerrado» ni pago
      await p.goto(`${BASE}/checkout/confirmacion?order=${A.order_number}&token=${A.public_token}`);
      await p.getByText(`Pedido cancelado · ${A.order_number}`).waitFor({ timeout: 8000 });
      const body = await p.locator('main, body').first().textContent();
      if (body.includes('Pedido cerrado') || body.includes('Este pedido fue cancelado.') || body.includes('Pagar ahora')) throw new Error('confirmación de A con textos de pedido cerrado sin pago');
      if (!(await p.getByTestId('order-refund-notice').textContent()).includes('Este pedido no se enviará.')) throw new Error('confirmación de A sin aviso de devolución');
    }, browser);

    await journey('61. Admin: cancelar un pedido pagado deja la devolución registrada en el detalle (monto, motivo, pendiente en Wompi); uno sin pago no', async (p) => {
      const mk = async (name, status) => (await (await fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_name: name, customer_email: `${name.toLowerCase().replace(/\s+/g, '.')}@correo.co`, status }) })).json()).order_number;
      const paid = await mk('Devolucion Pagada', 'paid');
      const unpaid = await mk('Cancelado Sinpago', 'payment_pending');
      p.on('dialog', (d) => d.accept().catch(() => {}));
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      const open = async (num) => {
        await p.goto(`${BASE}/admin/pedidos?q=${num}`);
        await p.locator('tbody tr').filter({ hasText: num }).getByRole('button', { name: 'GESTIONAR' }).click();
        await p.getByText(`ORDEN #${num}`).waitFor({ timeout: 8000 });
      };
      for (const [num, note] of [[paid, 'Sin tela: devolver al cliente'], [unpaid, 'Cliente pidió anular']]) {
        await open(num);
        if (await p.getByTestId('order-refunds').count()) throw new Error(`${num}: devolución antes de cancelar`);
        await p.locator('#order-next-status').selectOption('cancelled');
        await p.getByLabel('Nota del cambio').fill(note);
        await p.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
        await p.locator('#order-next-status').waitFor({ state: 'detached', timeout: 8000 });
        for (let i = 0; i < 25 && (await state()).orders.find((x) => x.order_number === num).status !== 'cancelled'; i += 1) await new Promise((r) => setTimeout(r, 200));
      }
      await open(paid);
      const box = p.getByTestId('order-refunds');
      await box.waitFor({ timeout: 8000 });
      const t = await box.textContent();
      if (!/DEVOLUCIÓN REGISTRADA · \$\s?62\.000/.test(t) || !t.includes('Motivo: Sin tela: devolver al cliente') || !t.includes('Inventario repuesto al cancelar')) throw new Error(`sección de devolución: «${t}»`);
      if ((await p.getByTestId('order-refund-status').textContent()) !== 'Estado: Registrada · pendiente de hacer en Wompi') throw new Error('estado de la devolución');
      if (!(await p.getByTestId('order-refund-pending').textContent()).includes('panel de Wompi')) throw new Error('sin aviso de hacerla en Wompi');
      await open(unpaid);
      if (await p.getByTestId('order-refunds').count()) throw new Error('un pedido cancelado sin pago muestra devolución');
    }, browser);

    await journey('62. Admin: marcar la devolución como hecha en Wompi (id obligatorio, estado «Devuelta», historial) sin tocar estado ni stock', async (p) => {
      const num = (await (await fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_name: 'Devolucion Wompi', customer_email: 'devolucion.wompi@correo.co', status: 'paid' }) })).json()).order_number;
      p.on('dialog', (d) => d.accept().catch(() => {}));
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      const open = async () => {
        await p.goto(`${BASE}/admin/pedidos?q=${num}`);
        await p.locator('tbody tr').filter({ hasText: num }).getByRole('button', { name: 'GESTIONAR' }).click();
        await p.getByText(`ORDEN #${num}`).waitFor({ timeout: 8000 });
      };
      await open();
      await p.locator('#order-next-status').selectOption('cancelled');
      await p.getByLabel('Nota del cambio').fill('Cliente desistió');
      await p.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
      await p.locator('#order-next-status').waitFor({ state: 'detached', timeout: 8000 });
      const order = async () => (await state()).orders.find((x) => x.order_number === num);
      for (let i = 0; i < 25 && (await order()).status !== 'cancelled'; i += 1) await new Promise((r) => setTimeout(r, 200));
      const stockBefore = JSON.stringify((await state()).inventories);
      await open();
      const field = p.getByLabel('Id de la devolución en Wompi');
      await field.waitFor({ timeout: 8000 });
      // Sin id: error enlazado al campo y foco en él; la BD no cambia.
      await p.getByTestId('order-refund-mark-processed').click();
      await p.getByTestId('order-refund-error').waitFor({ timeout: 5000 });
      if ((await field.getAttribute('aria-invalid')) !== 'true') throw new Error('el campo vacío no queda marcado como inválido');
      // El foco se mueve en un setTimeout tras pintar el error: se espera (hasta 3 s) en vez de leerlo en el mismo instante
      // (ejecución 132: la lectura inmediata fallaba ~1 de cada 5 pasadas también sin cambios de código).
      if (!(await field.evaluate((el) => new Promise((ok) => { const t0 = Date.now(); const tick = () => (el === document.activeElement ? ok(true) : Date.now() - t0 > 3000 ? ok(false) : setTimeout(tick, 50)); tick(); })))) throw new Error('el foco no va al campo del id');
      if ((await order()).order_refunds[0].status !== 'requested') throw new Error('se marcó sin id');
      await field.fill('  12345-1700000000-99999  ');
      await p.getByTestId('order-refund-mark-processed').click();
      await expectText(p, 'marcada como hecha en Wompi');
      const o = await order();
      if (o.order_refunds[0].status !== 'processed' || o.order_refunds[0].provider_refund_id !== '12345-1700000000-99999') throw new Error(`devolución: ${JSON.stringify(o.order_refunds)}`);
      if (o.status !== 'cancelled') throw new Error(`el estado del pedido cambió: ${o.status}`);
      if (JSON.stringify((await state()).inventories) !== stockBefore) throw new Error('el stock cambió al marcar la devolución');
      await open();
      if ((await p.getByTestId('order-refund-status').textContent()) !== 'Estado: Devuelta · Wompi 12345-1700000000-99999') throw new Error('estado tras marcar');
      if (await p.getByTestId('order-refund-pending').count()) throw new Error('sigue pidiendo hacerla en Wompi');
      if (await p.getByTestId('order-refund-mark-processed').count()) throw new Error('el botón sigue visible');
      // El historial (plegado) registra el evento con el id de Wompi.
      const events = await p.getByTestId('order-event').allTextContents();
      if (!events.some((e) => e.includes('Devolución hecha en Wompi') && e.includes('12345-1700000000-99999'))) throw new Error(`historial: ${events.join(' | ')}`);
    }, browser);

    // Ejecución 131: los recorridos corren en paralelo y comparten el backend; no se afirman conteos globales exactos.
    await journey('63. Admin: devoluciones pendientes en Wompi — menú, campana, tarjeta del dashboard, filtro ?devolucion=pendiente y salida al marcarla hecha', async (p) => {
      const mk = async (name, status) => (await (await fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_name: name, customer_email: `${name.toLowerCase().replace(/\s+/g, '.')}@correo.co`, status }) })).json()).order_number;
      const num = await mk('Devolucion Pendiente', 'paid');
      const other = await mk('Sin Devolucion', 'paid');
      p.on('dialog', (d) => d.accept().catch(() => {}));
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      // Cancelar el pedido pagado registra la devolución (requested).
      await p.goto(`${BASE}/admin/pedidos?q=${num}`);
      await p.locator('tbody tr').filter({ hasText: num }).getByRole('button', { name: 'GESTIONAR' }).click();
      await p.locator('#order-next-status').selectOption('cancelled');
      await p.getByLabel('Nota del cambio').fill('Cliente desistió');
      await p.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
      await p.locator('#order-next-status').waitFor({ state: 'detached', timeout: 8000 });
      const order = async () => (await state()).orders.find((x) => x.order_number === num);
      for (let i = 0; i < 25 && !(await order()).order_refunds.length; i += 1) await new Promise((r) => setTimeout(r, 200));
      // Ejecución 132 (0(cc)): el menú «Pedidos» y la campana avisan de la devolución pendiente.
      await p.goto(`${BASE}/admin/dashboard`);
      const navRefunds = p.getByTestId('admin-nav-refund-badge');
      await navRefunds.waitFor({ timeout: 8000 });
      const refundsInNav = async () => (await navRefunds.count() ? Number(/^(\d+) devoluci/.exec(await navRefunds.getAttribute('aria-label'))?.[1]) : 0);
      const n0 = await refundsInNav();
      if (!(n0 >= 1)) throw new Error(`insignia de devoluciones en el menú: ${n0}`);
      if (!(await p.getByRole('link', { name: /^Pedidos/ }).filter({ has: navRefunds }).count())) throw new Error('la insignia no está en «Pedidos»');
      await p.getByTestId('admin-notifications').click();
      const bellRefunds = p.getByTestId('admin-notification-devoluciones');
      await bellRefunds.waitFor({ timeout: 8000 });
      if ((await bellRefunds.textContent()) !== `${n0} ${n0 === 1 ? 'devolución pendiente' : 'devoluciones pendientes'} en Wompi`) throw new Error(`campana: ${await bellRefunds.textContent()}`);
      await bellRefunds.click();
      await p.waitForURL(/\/admin\/pedidos\?devolucion=pendiente$/, { timeout: 8000 });
      await p.locator('tbody tr').filter({ hasText: num }).waitFor({ timeout: 8000 });
      // Dashboard: tarjeta con al menos esta devolución, monto y enlace al filtro.
      await p.goto(`${BASE}/admin/dashboard`);
      const card = p.getByRole('link', { name: /^Ver pedidos con devolución pendiente en Wompi: \d+ devoluci/ });
      await card.waitFor({ timeout: 8000 });
      const n = Number(/: (\d+) devoluci/.exec(await card.getAttribute('aria-label'))[1]);
      if (!(n >= 1)) throw new Error(`conteo de devoluciones pendientes: ${n}`);
      if (!/por devolver en Wompi/.test(await card.textContent())) throw new Error(`detalle de la tarjeta: ${await card.textContent()}`);
      if ((await card.locator('[data-warn]').getAttribute('data-warn')) !== 'true') throw new Error('la tarjeta no alerta');
      await card.click();
      await p.waitForURL(/\/admin\/pedidos\?devolucion=pendiente$/, { timeout: 8000 });
      const filter = p.getByLabel(/^Solo con devolución pendiente en Wompi \(\d+\)$/);
      await filter.waitFor({ timeout: 8000 });
      if (!(await filter.isChecked())) throw new Error('el filtro no queda marcado desde el enlace');
      const row = p.locator('tbody tr').filter({ hasText: num });
      await row.waitFor({ timeout: 8000 });
      if (!(await row.getByTestId('order-row-pending-refund').count())) throw new Error('la fila no marca la devolución pendiente');
      if (await p.locator('tbody tr').filter({ hasText: other }).count()) throw new Error('aparece un pedido sin devolución');
      // Marcarla hecha en Wompi la saca del filtro.
      await row.getByRole('button', { name: 'GESTIONAR' }).click();
      await p.getByLabel('Id de la devolución en Wompi').fill('W-63-0001');
      await p.getByTestId('order-refund-mark-processed').click();
      await expectText(p, 'marcada como hecha en Wompi');
      // El aviso del menú baja en uno sin recargar (evento del panel) y desaparece si era la única.
      await p.waitForFunction((want) => {
        const b = document.querySelector('[data-testid="admin-nav-refund-badge"]');
        return (b ? Number(/^(\d+) devoluci/.exec(b.getAttribute('aria-label'))?.[1]) : 0) === want;
      }, n0 - 1, { timeout: 8000 }).catch(async () => { throw new Error(`el menú no bajó de ${n0} a ${n0 - 1}: ${await refundsInNav()}`); });
      await p.goto(`${BASE}/admin/pedidos?devolucion=pendiente&q=${num}`);
      await expectText(p, 'No hay pedidos con estos filtros.');
      // Sin el filtro el pedido sigue en la lista, sin la marca.
      await filter.uncheck();
      const after = p.locator('tbody tr').filter({ hasText: num });
      await after.waitFor({ timeout: 8000 });
      if (await after.getByTestId('order-row-pending-refund').count()) throw new Error('sigue marcada como pendiente');
      if (/devolucion=/.test(p.url())) throw new Error(`el parámetro sigue en la URL: ${p.url()}`);
      // Ejecución 135 (0(cg)): el mismo pedido con una devolución HECHA y otra PENDIENTE (fixture sintético).
      const extra = await fetch(`${API_URL}/__synthetic-extra-refund/${num}`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: 15000, reason: 'Diferencia de envío' }) });
      if (!extra.ok) throw new Error(`fixture de segunda devolución: HTTP ${extra.status}`);
      await p.goto(`${BASE}/admin/pedidos?devolucion=pendiente&q=${num}`);
      const again = p.locator('tbody tr').filter({ hasText: num });
      await again.waitFor({ timeout: 8000 });
      if ((await again.count()) !== 1) throw new Error(`el pedido aparece ${await again.count()} veces en el filtro`);
      if (!(await again.getByTestId('order-row-pending-refund').count())) throw new Error('la fila no marca la segunda devolución pendiente');
      await again.getByRole('button', { name: 'GESTIONAR' }).click();
      const items = p.getByTestId('order-refund');
      await items.nth(1).waitFor({ timeout: 8000 });
      if ((await items.count()) !== 2) throw new Error(`devoluciones en el detalle: ${await items.count()}`);
      const st = await p.getByTestId('order-refund-status').allTextContents();
      if (!/Hecha|Procesad|Devuelta/i.test(st[0]) || !/W-63-0001/.test(st[0]) || /W-63/.test(st[1])) throw new Error(`estados: ${JSON.stringify(st)}`);
      if ((await p.getByTestId('order-refund-provider-id').count()) !== 1) throw new Error('solo la pendiente debe tener campo para el id de Wompi');
      const heading = await p.locator('#order-refunds-title').textContent();
      if (!/DEVOLUCIONES REGISTRADAS · \$\s?77\.000/.test(heading)) throw new Error(`título: ${heading}`);
      if (!/1 pendiente/.test(heading)) throw new Error(`el título no dice cuántas faltan: ${heading}`);
      // El mismo id de Wompi no sirve para la segunda devolución.
      await p.getByLabel('Id de la devolución en Wompi').fill('W-63-0001');
      await p.getByTestId('order-refund-mark-processed').click();
      await expectText(p, 'Ese id de Wompi ya está registrado en otra devolución.');
      await p.getByLabel('Id de la devolución en Wompi').fill('W-63-0002');
      await p.getByTestId('order-refund-mark-processed').click();
      await expectText(p, 'marcada como hecha en Wompi');
      await p.getByTestId('order-refund-pending').waitFor({ state: 'detached', timeout: 8000 });
      const refundsNow = (await order()).order_refunds.map((r) => `${r.status}:${r.provider_refund_id}`).sort();
      if (JSON.stringify(refundsNow) !== JSON.stringify(['processed:W-63-0001', 'processed:W-63-0002'])) throw new Error(`backend: ${refundsNow}`);
      await p.goto(`${BASE}/admin/pedidos?devolucion=pendiente&q=${num}`);
      await expectText(p, 'No hay pedidos con estos filtros.');
    }, browser);

    await journey('48. Admin: «Cambiar mi contraseña» lleva al cambio con reautenticación de «Mi cuenta»', async (p) => {
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      await p.getByTestId('admin-change-password').click();
      await p.waitForURL(/\/cuenta\/datos$/, { timeout: 8000 });
      await p.getByRole('button', { name: 'Cambiar contraseña' }).waitFor({ timeout: 8000 });
    }, browser);

    await journey('14. Mis pedidos: pagar (rechazo de la BD → estado real), cancelar y ventana vencida desde la lista', async (p) => {
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Luis Mora');
      await p.locator('input[type=email]').fill('luis@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      for (let i = 0; i < 3; i += 1) {
        await addToCart(p, 'camiseta-basica', 'M', 'Negro');
        await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'luis@correo.co' });
        await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
        await p.waitForURL(/\/checkout\/confirmacion/);
        await expectText(p, 'Pedido registrado');
      }
      const [toExpire, toCancel, toPay] = (await state()).orders; // unshift: el más reciente primero
      await fetch(`${API_URL}/__synthetic-expire-window/${toExpire.order_number}`);
      let sent = null;
      await p.route('**/api/wompi/signature', async (route) => {
        sent = JSON.parse(route.request().postData() || '{}');
        await fetch(`${API_URL}/__synthetic-mark-paid/${toPay.order_number}`);
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Este pedido ya no admite pagos.', code: 'JM_ORDER_NOT_PAYABLE' }) });
      });
      p.on('dialog', (d) => d.accept().catch(() => {}));
      await p.goto(`${BASE}/cuenta/pedidos`);
      const card = (o) => p.locator('div').filter({ has: p.getByText(`PEDIDO #${o.order_number}`, { exact: true }) }).filter({ has: p.getByTestId('order-shipping-method') }).last();
      // Ventana vencida: sin «Pagar ahora», marcado como vencido.
      await card(toExpire).getByTestId('order-window-closed').waitFor({ timeout: 10000 });
      if (await card(toExpire).getByTestId('order-pay').count()) throw new Error('ofrece pagar con la ventana vencida');
      await card(toExpire).getByText('Pago vencido').waitFor();
      // Pagar desde la lista: la firma se pide con id + token; la BD ya lo tenía pagado → estado real.
      await card(toPay).getByTestId('order-pay-deadline').waitFor();
      await card(toPay).getByTestId('order-pay').click();
      await card(toPay).getByTestId('order-action-error').filter({ hasText: 'ya no admite pagos' }).waitFor({ timeout: 8000 });
      await card(toPay).getByText('Compra completada').waitFor({ timeout: 8000 });
      if (!sent || sent.order_id !== toPay.id || sent.public_token !== toPay.public_token) throw new Error(`firma pedida con ${JSON.stringify(sent)}`);
      if (await card(toPay).getByTestId('order-pay').count()) throw new Error('sigue ofreciendo pagar un pedido pagado');
      // Cancelar desde la lista libera la reserva.
      await card(toCancel).getByTestId('order-cancel').click();
      await card(toCancel).getByText('Cancelado', { exact: true }).waitFor({ timeout: 8000 });
      const s2 = await state();
      if (s2.orders.find((o) => o.id === toCancel.id).status !== 'cancelled') throw new Error('el pedido no quedó cancelado');
      if (await card(toCancel).getByTestId('order-cancel').count()) throw new Error('sigue ofreciendo cancelar un pedido cancelado');
    }, browser);

    await journey('9. Login: credenciales incorrectas y rutas protegidas', async (p) => {
      await login(p, '/login', 'nadie@correo.co', 'mala-clave', 'Iniciar Sesión');
      await expectText(p, 'Correo o contraseña incorrectos');
      await p.goto(`${BASE}/admin/dashboard`);
      await p.waitForURL(/\/admin\/login/); // anónimo → login de admin
      // un cliente registrado NO entra al panel
      await p.goto(`${BASE}/login`); await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Cliente'); await p.locator('input[type=email]').fill('c@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      const aviso = p.getByRole('status').filter({ hasText: 'Cuenta creada' }).waitFor(); // aviso en pantalla tras crear la cuenta
      await p.locator('button[type=submit]').click(); await aviso; await p.waitForTimeout(300);
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/admin/dashboard`);
      await p.waitForURL(/\/admin\/login/);
      await expectText(p, 'permisos administrativos');
    }, browser, /\[Login Exception\]/); // el login fallido registra ese error a propósito

    await journey('23. Admin: boletín, búsqueda, baja, reactivación y CSV', async (p) => {
      // suscripción real desde la portada con un correo propio de este recorrido
      await p.goto(`${BASE}/`);
      const form = p.locator('section[aria-labelledby="jm-newsletter-title"]');
      await form.scrollIntoViewIfNeeded();
      await form.getByLabel('Correo electrónico para el boletín').fill('boletin.admin@example.co');
      await form.getByRole('button', { name: 'Suscribirme' }).click();
      await form.getByRole('status').filter({ hasText: 'quedó registrado' }).waitFor();
      await p.evaluate(() => localStorage.clear());
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      await p.getByRole('link', { name: 'Boletín' }).first().click();
      await p.waitForURL(/\/admin\/boletin/);
      await p.getByLabel('Buscar suscriptores').fill('BOLETIN.ADMIN');
      const row = p.locator('tbody tr', { hasText: 'boletin.admin@example.co' });
      await row.waitFor();
      if ((await p.locator('tbody tr').count()) !== 1) throw new Error('la búsqueda no filtró');
      await row.getByRole('button', { name: 'Dar de baja boletin.admin@example.co' }).click();
      await p.getByRole('status').filter({ hasText: 'dado de baja' }).waitFor();
      let s = (await state()).newsletter.find((x) => x.email_normalized === 'boletin.admin@example.co');
      if (!s.unsubscribed_at) throw new Error('la baja no se guardó');
      await p.getByLabel('Filtrar por estado').selectOption('bajas');
      await row.getByRole('button', { name: 'Reactivar boletin.admin@example.co' }).click();
      await p.getByRole('status').filter({ hasText: 'reactivado' }).waitFor();
      s = (await state()).newsletter.find((x) => x.email_normalized === 'boletin.admin@example.co');
      if (s.unsubscribed_at) throw new Error('la reactivación no se guardó');
      await p.getByLabel('Filtrar por estado').selectOption('todos');
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Exportar CSV/ }).click()]);
      const csv = fs.readFileSync(await dl.path(), 'utf8');
      if (!/^\uFEFFcorreo,estado,origen/.test(csv) || !csv.includes('boletin.admin@example.co,activo,home')) throw new Error(`CSV: ${csv.slice(0, 200)}`);
      if (!/^suscriptores-boletin-todos-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename())) throw new Error(`nombre: ${dl.suggestedFilename()}`);
      // filtros en la URL (ejecución 84): sobreviven a la recarga
      const u = new URL(p.url());
      if (u.searchParams.get('q') !== 'BOLETIN.ADMIN' || u.searchParams.get('estado') !== 'todos') throw new Error(`URL: ${p.url()}`);
      await p.reload();
      await p.locator('tbody tr', { hasText: 'boletin.admin@example.co' }).waitFor();
      if ((await p.getByLabel('Buscar suscriptores').inputValue()) !== 'BOLETIN.ADMIN') throw new Error('la búsqueda no se restauró');
      if ((await p.getByLabel('Filtrar por estado').inputValue()) !== 'todos') throw new Error('el estado no se restauró');
    }, browser);

    await journey('27. Admin: cupones, búsqueda sin tildes y estado en la URL', async (p) => {
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      await p.goto(`${BASE}/admin/descuentos`);
      const rowsOf = () => p.locator('tbody tr td:first-child').allInnerTexts();
      await p.locator('tbody tr', { hasText: 'LIQUIDACION' }).waitFor();
      await p.getByLabel('Buscar cupones').fill('PROMOCIÓN');
      await p.waitForURL(/q=PROMOCI/);
      assert.deepEqual((await rowsOf()).map((t) => t.split('\n')[0]), ['LIQUIDACION']);
      await p.getByLabel('Filtrar por estado').selectOption('activos');
      await p.getByText('No hay cupones con este filtro.').waitFor();
      await p.getByLabel('Buscar cupones').fill('');
      await p.waitForURL((u) => u.search === '?estado=activos');
      await p.reload();
      await p.locator('tbody tr', { hasText: 'JM10' }).waitFor();
      assert.equal(await p.getByLabel('Filtrar por estado').inputValue(), 'activos');
      assert.deepEqual((await rowsOf()).map((t) => t.split('\n')[0]), ['JM10']);
      // Ejecución 86: uso real (canjes pagados/pendientes; el liberado no cuenta) y confirmación al desactivar.
      const usos = await p.getByTestId('usos-JM10').innerText();
      assert.match(usos, /8\.000 descontados/); assert.match(usos, /\+1 con pago pendiente/);
      let asked = '';
      p.removeAllListeners('dialog'); // el page() global acepta todo; aquí se cancela para comprobar que no desactiva
      p.once('dialog', (d) => { asked = d.message(); d.dismiss().catch(() => {}); });
      await p.locator('tbody tr', { hasText: 'JM10' }).getByRole('button', { name: 'Desactivar' }).click();
      assert.match(asked, /JM10.*2 pedidos.*1 con pago pendiente/);
      await p.waitForTimeout(300);
      assert.equal(await p.locator('tbody tr', { hasText: 'JM10' }).locator('td').nth(5).innerText(), 'Activo');
      // Ejecución 87: «Ver pedidos» en USOS abre /admin/pedidos filtrado por el cupón; quitar el filtro limpia la URL.
      await p.getByTestId('pedidos-cupon-JM10').click();
      await p.waitForURL((u) => u.pathname === '/admin/pedidos' && u.searchParams.get('cupon') === 'JM10');
      await p.getByTestId('orders-coupon-filter').filter({ hasText: 'Cupón: JM10' }).waitFor();
      const st = await (await fetch(`${API_URL}/__state`)).json();
      const expected = st.orders.filter((o) => o.coupon_code === 'JM10').map((o) => o.order_number).sort();
      await p.waitForFunction((n) => !document.body.innerText.includes('Cargando') && document.querySelectorAll('tbody tr').length >= n, expected.length, { timeout: 8000 }).catch(() => {});
      const shown = (await p.locator('tbody tr td:first-child').allInnerTexts()).map((t) => t.trim()).filter((t) => /^JM-/.test(t)).sort();
      assert.deepEqual(shown, expected);
      await p.getByRole('button', { name: 'Quitar filtro del cupón JM10' }).click();
      await p.waitForURL((u) => !u.searchParams.has('cupon'));
      // Ejecución 90: desde el detalle de un pedido con JM10, el SKU abre el producto y el cupón abre /admin/descuentos.
      const fixtureSku = st.inventories[0].sku;
      const withCoupon = await (await fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_email: 'cupon.fixture@jm.test', coupon_code: 'JM10', sku: fixtureSku }) })).json();
      await p.goto(`${BASE}/admin/pedidos?q=${withCoupon.order_number}`);
      await p.locator('tbody tr').filter({ hasText: withCoupon.order_number }).locator('td:last-child button').click();
      const skuLink = p.getByTestId('order-item-sku-0');
      const sku = (await skuLink.innerText()).trim();
      assert.equal(sku, fixtureSku);
      await skuLink.click();
      await p.waitForURL((u) => u.pathname === '/admin/productos' && u.searchParams.get('q') === sku);
      assert.equal(await p.getByPlaceholder('Buscar por nombre, referencia o SKU...').inputValue(), sku);
      await p.waitForFunction(() => document.querySelectorAll('tbody tr').length >= 1 && !document.body.innerText.includes('No hay productos'), null, { timeout: 8000 });
      await p.goBack();
      await p.locator('tbody tr').filter({ hasText: withCoupon.order_number }).locator('td:last-child button').click();
      await p.getByTestId('order-coupon-link').click();
      await p.waitForURL((u) => u.pathname === '/admin/descuentos' && u.searchParams.get('q') === 'JM10');
      await p.locator('tbody tr', { hasText: 'JM10' }).waitFor();
      assert.deepEqual((await rowsOf()).map((t) => t.split('\n')[0]), ['JM10']);
    }, browser);

    await journey('28. Admin: «Ver pedidos» de un cliente con la misma atribución que la lista y enlaces pedido ↔ cliente', async (p) => {
      // Ejecución 88: cuenta con 1 pedido propio, 1 pedido de invitado con su correo (suyo) y otra cuenta que usó su correo (no es suyo).
      const tag = crypto.randomBytes(3).toString('hex'); const email = `cliente.${tag}@jm.test`;
      const signup = async (mail, name) => (await fetch(`${API_URL}/auth/v1/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: mail, password: 'Clave-Segura-1', data: { full_name: name } }) })).json();
      const ana = await signup(email, `Ana ${tag}`); const otro = await signup(`otro.${tag}@jm.test`, `Otro ${tag}`);
      const order = (userId, status) => fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: userId, customer_email: email, customer_name: `Ana ${tag}`, status }) }).then(j);
      const own = await order(ana.user.id, 'paid'); const guest = await order(null, 'payment_pending'); const foreign = await order(otro.user.id, 'paid');
      const nums = (x) => x.order_number;
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      await p.goto(`${BASE}/admin/clientes?q=${email}`);
      const link = p.getByTestId(`pedidos-cliente-${ana.user.id}`);
      await link.waitFor();
      assert.equal((await link.innerText()).trim(), 'Ver pedidos (2)');
      await link.click();
      await p.waitForURL((u) => u.pathname === '/admin/pedidos' && u.searchParams.get('cliente') === ana.user.id);
      await p.getByTestId('orders-customer-filter').filter({ hasText: `Cliente: Ana ${tag}` }).waitFor();
      const shownNow = async () => (await p.locator('tbody tr td:first-child').allInnerTexts()).map((t) => t.trim()).filter((t) => /^JM-/.test(t)).sort();
      await p.waitForFunction(() => !document.body.innerText.includes('Cargando') && document.querySelectorAll('tbody tr').length >= 2, null, { timeout: 8000 }).catch(() => {});
      assert.deepEqual(await shownNow(), [nums(own), nums(guest)].sort());
      assert.ok(!(await shownNow()).includes(nums(foreign)), 'mostró el pedido de otra cuenta');
      // combinado con la búsqueda: un solo filtro lógico
      await p.getByLabel('Buscar pedidos').fill(nums(guest));
      await p.waitForURL((u) => u.searchParams.get('q') === nums(guest) && u.searchParams.has('cliente'), { timeout: 8000 });
      await p.waitForFunction((n) => [...document.querySelectorAll('tbody tr td:first-child')].map((td) => td.innerText.trim()).filter((t) => t.startsWith('JM-')).join() === n, nums(guest), { timeout: 8000 });
      await p.getByRole('button', { name: 'Quitar filtro del cliente' }).click();
      await p.waitForURL((u) => !u.searchParams.has('cliente') && u.searchParams.get('q') === nums(guest));
      // Ejecución 89: enlaces cruzados. Detalle de su pedido con cuenta → ficha del cliente → su pedido de invitado.
      await p.goto(`${BASE}/admin/pedidos?q=${nums(own)}`);
      const ownRow = p.locator('tbody tr').filter({ hasText: nums(own) });
      await ownRow.locator('td:last-child button').click();
      const toCustomer = p.getByTestId('order-customer-link');
      assert.equal((await toCustomer.innerText()).trim(), 'Ver ficha del cliente');
      await toCustomer.click();
      await p.waitForURL((u) => u.pathname === '/admin/clientes' && u.searchParams.get('cliente') === ana.user.id);
      const dialog = p.getByRole('dialog', { name: `Cliente Ana ${tag}` });
      await dialog.waitFor();
      await dialog.getByTestId(`pedido-${nums(guest)}`).click();
      await p.waitForURL((u) => u.pathname === '/admin/pedidos' && u.searchParams.get('q') === nums(guest));
      await p.waitForFunction((n) => [...document.querySelectorAll('tbody tr td:first-child')].map((td) => td.innerText.trim()).filter((t) => t.startsWith('JM-')).join() === n, nums(guest), { timeout: 8000 });
      // pedido de invitado → búsqueda por su correo en todos los roles
      await p.locator('tbody tr').filter({ hasText: nums(guest) }).locator('td:last-child button').click();
      const toSearch = p.getByTestId('order-customer-link');
      assert.equal((await toSearch.innerText()).trim(), 'Buscar cliente por correo');
      await toSearch.click();
      await p.waitForURL((u) => u.pathname === '/admin/clientes' && u.searchParams.get('q') === email && u.searchParams.get('rol') === 'todos');
      await p.getByTestId(`pedidos-cliente-${ana.user.id}`).waitFor();
    }, browser);

    await journey('24. Cuenta: baja y alta del boletín desde «Mis datos»', async (p) => {
      // suscripción en la portada con el mismo correo (otra capitalización) que luego usa la cuenta
      await p.goto(`${BASE}/`);
      const form = p.locator('section[aria-labelledby="jm-newsletter-title"]');
      await form.scrollIntoViewIfNeeded();
      await form.getByLabel('Correo electrónico para el boletín').fill('Marta.Club@Correo.co');
      await form.getByRole('button', { name: 'Suscribirme' }).click();
      await form.getByRole('status').filter({ hasText: 'quedó registrado' }).waitFor();
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Marta Club');
      await p.locator('input[type=email]').fill('marta.club@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/cuenta`);
      const perfil = p.getByTestId('profile-section');
      const box = perfil.locator('input[name=marketing_opt_in]');
      await perfil.getByText('Estás suscrito').waitFor({ timeout: 8000 });
      if (!(await box.isChecked())) throw new Error('la casilla no refleja la suscripción de la portada');
      await box.uncheck();
      await perfil.getByRole('button', { name: 'Guardar datos' }).click();
      await perfil.getByText('Te diste de baja del boletín').waitFor({ timeout: 5000 });
      const row = () => state().then((st) => st.newsletter.find((x) => x.email_normalized === 'marta.club@correo.co'));
      if (!(await row()).unsubscribed_at) throw new Error('la baja no se guardó en la lista');
      await p.reload();
      await perfil.getByText('Puedes darte de baja').waitFor({ timeout: 8000 });
      if (await box.isChecked()) throw new Error('tras recargar la casilla sigue marcada');
      await box.check();
      await perfil.getByRole('button', { name: 'Guardar datos' }).click();
      await perfil.getByText('Quedaste suscrito').waitFor({ timeout: 5000 });
      if ((await row()).unsubscribed_at) throw new Error('el alta no se guardó en la lista');
    }, browser);

    await journey('25. Producto: el comprador opina y la reseña queda pendiente de moderación', async (p) => {
      await p.goto(`${BASE}/producto/camiseta-basica`);
      const caja = p.getByTestId('review-form');
      await caja.getByText('Inicia sesión').waitFor({ timeout: 8000 }); // sin sesión: invitación, sin formulario
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Lucía Pérez');
      await p.locator('input[type=email]').fill('lucia.resena@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      // sin compra pagada: no hay formulario
      await p.goto(`${BASE}/producto/camiseta-basica`);
      await caja.getByText('Solo los clientes que compraron').waitFor({ timeout: 8000 });
      await addToCart(p, 'camiseta-basica', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'lucia.resena@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click(); await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      await p.goto(`${BASE}/producto/camiseta-basica`);
      await caja.getByText(num).waitFor({ timeout: 8000 });
      await caja.getByRole('button', { name: 'Enviar opinión' }).click(); // vacío → errores en pantalla, nada guardado
      await caja.getByText('Elige una calificación').waitFor();
      if ((await state()).reviews.length) throw new Error('se guardó una reseña inválida');
      await caja.getByRole('button', { name: '5 de 5 estrellas' }).click();
      await caja.getByLabel('Título').fill('Excelente camiseta');
      await caja.getByLabel('Comentario').fill('La tela es suave y la talla M me quedó perfecta.');
      await caja.getByLabel('Ciudad (opcional)').fill('Cali');
      await caja.getByRole('button', { name: 'Enviar opinión' }).click();
      await caja.getByText('Recibimos tu opinión').waitFor({ timeout: 5000 });
      await caja.getByText('pendiente de aprobación').waitFor();
      const rv = (await state()).reviews;
      if (rv.length !== 1 || rv[0].status !== 'pending' || rv[0].author_name !== 'Lucía P.' || rv[0].rating !== 5) throw new Error(`reseña guardada: ${JSON.stringify(rv)}`);
      await p.reload();
      await caja.getByText('pendiente de aprobación').waitFor({ timeout: 8000 });
      if (await caja.getByRole('button', { name: 'Enviar opinión' }).count()) throw new Error('se permite opinar dos veces sobre la misma compra');
      if (await p.getByText('Excelente camiseta').count() !== 1) throw new Error('la reseña pendiente aparece publicada en la ficha');
    }, browser);

    await journey('26. Entregado: invitación a opinar, reseña, respuesta del admin y columnas privadas', async (p) => {
      // Lectura pública sin identificadores internos (GRANT por columnas): pedir user_id falla con 42501.
      const priv = await fetch(`${API_URL}/rest/v1/product_reviews?select=id,user_id`);
      if (priv.status !== 401 || (await priv.json()).code !== '42501') throw new Error(`user_id legible en product_reviews: ${priv.status}`);
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Marta Gómez');
      await p.locator('input[type=email]').fill('marta.entrega@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'marta.entrega@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click(); await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      // pagado sin entregar: sin invitación
      await p.goto(`${BASE}/cuenta/pedidos`); await expectText(p, num);
      if (await p.getByText('OPINA SOBRE TUS COMPRAS').count()) throw new Error('invitación a opinar antes de la entrega');
      await fetch(`${API_URL}/__synthetic-mark-delivered/${num}`);
      await p.reload();
      await p.getByText('OPINA SOBRE TUS COMPRAS').waitFor({ timeout: 8000 });
      await p.getByRole('link', { name: 'Opinar sobre Polo Clásico' }).click();
      await p.waitForURL(/\/producto\/polo-clasico#opiniones$/);
      const caja = p.getByTestId('review-form');
      await caja.getByText(num).waitFor({ timeout: 8000 });
      await caja.getByRole('button', { name: '4 de 5 estrellas' }).click();
      await caja.getByLabel('Título').fill('Buen polo');
      await caja.getByLabel('Comentario').fill('Buena tela, el cuello no se deforma al lavarlo.');
      await caja.getByRole('button', { name: 'Enviar opinión' }).click();
      await caja.getByText('Recibimos tu opinión').waitFor({ timeout: 5000 });
      // ya opinó: la invitación desaparece
      await p.goto(`${BASE}/cuenta/pedidos`); await expectText(p, num);
      await p.waitForTimeout(500);
      if (await p.getByText('OPINA SOBRE TUS COMPRAS').count()) throw new Error('la invitación sigue tras opinar');
      // admin aprueba con respuesta pública
      await p.evaluate(() => localStorage.clear());
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      // ejecución 73: el menú cuenta la reseña pendiente; filtro por producto y por texto
      await p.getByLabel('1 reseña pendiente').waitFor({ timeout: 8000 });
      await p.goto(`${BASE}/admin/reviews`);
      await p.getByRole('tab', { name: 'Pendiente (1)' }).waitFor({ timeout: 8000 });
      const prodSel = p.getByLabel('Filtrar por producto');
      await prodSel.selectOption({ label: 'Polo Clásico (1 · 1 pendiente)' });
      await p.getByLabel('Buscar reseñas').fill('CUELLO');
      // ejecución 83: producto y búsqueda viajan en la URL y sobreviven a recargar la página
      await p.waitForURL(/\/admin\/reviews\?producto=[^&]+&q=CUELLO$/, { timeout: 8000 });
      await p.reload();
      await p.getByRole('tab', { name: 'Pendiente (1)', selected: true }).waitFor({ timeout: 8000 });
      if ((await p.getByLabel('Buscar reseñas').inputValue()) !== 'CUELLO') throw new Error('la búsqueda de reseñas no sobrevivió a recargar');
      const card = p.getByRole('article', { name: /Buen polo/ });
      await card.getByLabel('Respuesta de la tienda').fill('¡Gracias, Marta! Nos alegra que te guste.');
      await card.getByRole('button', { name: 'Aprobar' }).click();
      await p.getByText('Reseña de Marta G.: aprobada.').waitFor({ timeout: 8000 });
      await p.getByRole('tab', { name: 'Pendiente (0)' }).waitFor({ timeout: 8000 });
      await p.waitForFunction(() => !document.querySelector('[aria-label="1 reseña pendiente"]'), null, { timeout: 8000 });
      // ejecución 92: el producto de la reseña enlaza a /admin/productos con la búsqueda por slug
      await p.getByRole('tab', { name: /^Todas/ }).click();
      const revCard = p.getByRole('article', { name: /Buen polo/ });
      if ((await revCard.getByRole('link', { name: 'Ver Polo Clásico en la tienda' }).getAttribute('href')) !== '/producto/polo-clasico') throw new Error('enlace de la reseña a la tienda incorrecto');
      await revCard.getByRole('link', { name: 'Ver Polo Clásico en productos' }).click();
      await p.waitForURL(/\/admin\/productos\?q=polo-clasico$/, { timeout: 8000 });
      await p.getByText('Polo Clásico').first().waitFor({ timeout: 8000 });
      if ((await p.getByLabel('Buscar productos').inputValue()) !== 'polo-clasico') throw new Error('la búsqueda de productos no recibió el slug de la reseña');
      // el público ve la reseña y la respuesta de J&M
      await p.evaluate(() => localStorage.clear());
      await p.goto(`${BASE}/producto/polo-clasico`);
      await p.getByText('Buen polo').waitFor({ timeout: 8000 });
      await p.getByRole('note', { name: 'Respuesta de J&M' }).getByText('¡Gracias, Marta! Nos alegra que te guste.').waitFor();
    }, browser);

    await journey('10. Admin: acceso, panel, inventario y gestión de pedidos', async (p) => {
      // crea un pedido como cliente anónimo y lo paga (sintético)
      await addToCart(p, 'polo-clasico', 'M'); await p.goto(`${BASE}/checkout`); await fillCheckout(p);
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click(); await p.waitForURL(/\/checkout\/confirmacion/);
      const num = (await state()).orders[0].order_number;
      await fetch(`${API_URL}/__synthetic-mark-paid/${num}`);
      await p.evaluate(() => localStorage.clear());
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      await expectText(p, num);
      // Ejecución 76: tarjeta «Por preparar» del dashboard → /admin/pedidos?estado=paid con la pestaña «Pagado» activa
      const paidCount = (await state()).orders.filter((x) => x.status === 'paid').length;
      const prepCard = p.getByRole('link', { name: /^Ver pedidos pagados por preparar/ });
      await prepCard.filter({ hasText: `${paidCount} pedido` }).waitFor({ timeout: 8000 });
      await prepCard.click();
      await p.waitForURL(/\/admin\/pedidos\?estado=paid$/, { timeout: 8000 });
      await p.getByRole('button', { name: `Pagado (${paidCount})`, pressed: true }).waitFor({ timeout: 8000 });
      await expectText(p, num);
      await p.reload();
      await p.getByRole('button', { name: `Pagado (${paidCount})`, pressed: true }).waitFor({ timeout: 8000 });
      // Ejecución 77: tarjeta «Alertas de stock» del dashboard → /admin/inventario?stock=alerta con las mismas variantes
      const lowNow = (await state()).inventories.filter((x) => x.stock - x.reserved <= 2).length; // min_stock = 2 en la BD sintética
      await p.goto(`${BASE}/admin/dashboard`);
      const stockCard = p.getByRole('link', { name: /^Ver variantes con stock bajo o agotado/ });
      await stockCard.filter({ hasText: `${lowNow} variante` }).waitFor({ timeout: 8000 });
      await stockCard.click();
      await p.waitForURL(/\/admin\/inventario\?stock=alerta$/, { timeout: 8000 });
      if (await p.getByLabel('Filtrar por estado de stock').inputValue() !== 'alerta') throw new Error('filtro de stock no aplicado');
      if (lowNow > 0) {
        await p.locator('tbody tr').nth(lowNow - 1).waitFor({ timeout: 8000 });
        const shown = await p.locator('tbody tr').count();
        if (shown !== lowNow) throw new Error(`variantes en alerta mostradas ${shown} ≠ ${lowNow}`);
      } else await expectText(p, 'Ninguna variante coincide con el filtro.');
      // Ejecución 78: la tarjeta KPI del inventario muestra el mismo número y, pulsada otra vez, quita el filtro
      const kpiAlert = p.getByRole('button', { name: new RegExp(`^Quitar filtro: ${lowNow} variante\\(s\\) stock bajo o agotado$`) });
      if ((await kpiAlert.getAttribute('aria-pressed')) !== 'true') throw new Error('tarjeta KPI de alertas no marcada');
      await kpiAlert.click();
      await p.waitForURL(/\/admin\/inventario$/, { timeout: 8000 });
      if (await p.getByLabel('Filtrar por estado de stock').inputValue() !== 'todos') throw new Error('la tarjeta KPI no quitó el filtro');
      // tarjeta «Requieren revisión» → /admin/pedidos?revision=1 con la casilla marcada
      await p.goto(`${BASE}/admin/dashboard`);
      await p.getByRole('link', { name: /^Ver pedidos que requieren revisión/ }).click();
      await p.waitForURL(/\/admin\/pedidos\?revision=1$/, { timeout: 8000 });
      if (!(await p.getByLabel(/^Solo los que requieren revisión/).isChecked())) throw new Error('casilla de revisión sin marcar');
      // Ejecución 79: /admin/productos busca sin tildes y por referencia; la búsqueda queda en ?q=
      await p.goto(`${BASE}/admin/productos?q=basica`);
      await expectText(p, 'Camiseta Básica');
      if (await p.getByText('Polo Clásico').count()) throw new Error('la búsqueda «basica» no filtró');
      await p.getByLabel('Buscar productos').fill('POL-001');
      await p.waitForURL(/\/admin\/productos\?q=POL-001$/, { timeout: 8000 });
      await expectText(p, 'Polo Clásico');
      if (await p.getByText('Camiseta Básica').count()) throw new Error('la búsqueda por referencia no filtró');
      // Ejecución 81: /admin/clientes busca sin tildes; búsqueda y rol quedan en ?q= y ?rol=
      // (solo el perfil admin: los recorridos corren en paralelo y los clientes varían)
      await p.goto(`${BASE}/admin/clientes?q=SINTETICO`);
      await expectText(p, 'No hay resultados.');
      await p.getByLabel('Filtrar por rol').selectOption('todos');
      await p.waitForURL(/\/admin\/clientes\?q=SINTETICO&rol=todos$/, { timeout: 8000 });
      await expectText(p, 'Admin Sintético');
      await p.getByLabel('Buscar clientes').fill('zz-nadie');
      await p.waitForURL(/\/admin\/clientes\?q=zz-nadie&rol=todos$/, { timeout: 8000 });
      await expectText(p, 'No hay resultados.');
      // Ejecución 82: /admin/pedidos conserva búsqueda (?q=) y método de envío (?envio=) en la URL
      await p.goto(`${BASE}/admin/pedidos?q=zz-nadie`);
      await expectText(p, 'No hay pedidos con estos filtros.');
      if ((await p.getByLabel('Buscar pedidos').inputValue()) !== 'zz-nadie') throw new Error('?q= no llenó la búsqueda de pedidos');
      await p.getByLabel('Buscar pedidos').fill('');
      await p.waitForURL(/\/admin\/pedidos$/, { timeout: 8000 });
      await p.getByLabel('Buscar pedidos').fill('zz-otro');
      await p.waitForURL(/\/admin\/pedidos\?q=zz-otro$/, { timeout: 8000 });
      await expectText(p, 'No hay pedidos con estos filtros.');
      // inventario: ajuste con motivo
      await p.goto(`${BASE}/admin/inventario`);
      await expectText(p, 'INVENTARIO (5 variantes)');
      const row = p.locator('tr', { hasText: 'POL-M-NEG' });
      await row.locator('input').first().fill('7');
      await row.locator('input').nth(1).fill('Llegó mercancía del proveedor');
      await row.getByRole('button').first().click();
      // el ajuste es asíncrono: sondear la BD sintética (hasta 10 s) en vez de leer justo tras el clic
      let inv; for (let i = 0; i < 50; i++) { inv = (await state()).inventories.find((x) => x.sku === 'POL-M-NEG'); if (inv.stock === 16) break; await new Promise((r) => setTimeout(r, 200)); }
      if (inv.stock !== 16) throw new Error(`stock tras el ajuste ${inv.stock} ≠ 16 (10 − 1 vendida + 7)`);
      // Ejecución 80: el inventario busca sin tildes y por referencia; la búsqueda queda en ?q=
      await p.goto(`${BASE}/admin/inventario?q=BASICA`);
      await expectText(p, 'CAM-M-NEG');
      if (await p.locator('tr', { hasText: 'POL-M-NEG' }).count()) throw new Error('la búsqueda «BASICA» del inventario no filtró');
      await p.getByLabel('Buscar en inventario').fill('pol-001');
      await p.waitForURL(/\/admin\/inventario\?q=pol-001$/, { timeout: 8000 });
      await expectText(p, 'POL-M-NEG');
      if (await p.locator('tr', { hasText: 'CAM-M-NEG' }).count()) throw new Error('la búsqueda por referencia del inventario no filtró');
      // Ejecución 91: variante del inventario → su producto (?q=<sku>) → «Ver inventario» (?q=<referencia>)
      await p.getByRole('link', { name: 'POL-M-NEG', exact: true }).click();
      await p.waitForURL(/\/admin\/productos\?q=POL-M-NEG$/, { timeout: 8000 });
      await expectText(p, 'Polo Clásico');
      if (await p.getByText('Camiseta Básica').count()) throw new Error('el enlace del SKU no filtró el producto');
      await p.getByRole('link', { name: 'Ver inventario de Polo Clásico' }).click();
      await p.waitForURL(/\/admin\/inventario\?q=POL-001$/, { timeout: 8000 });
      await expectText(p, 'POL-M-NEG');
      if (await p.locator('tr', { hasText: 'CAM-M-NEG' }).count()) throw new Error('«Ver inventario» no filtró por la referencia');
      // pedidos: pagado → procesando → enviado (con guía)
      await p.goto(`${BASE}/admin/pedidos`); await expectText(p, num);
      // Paginación real: el total viene del conteo exacto de la BD (Content-Range), no de las filas cargadas.
      const info = await p.getByTestId('orders-page-info').textContent({ timeout: 10000 });
      if (!/^Mostrando \d+ de \d+ pedidos/.test(info)) throw new Error(`info de paginación: «${info}»`);
      const cambiar = async (estado, extra) => {
        await p.locator('tr', { hasText: num }).getByRole('button', { name: 'GESTIONAR' }).click();
        await p.locator('#order-next-status').selectOption(estado);
        if (extra) await extra();
        await p.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
        await p.locator('#order-next-status').waitFor({ state: 'detached' });
      };
      // Ejecución 75: insignia «pedidos por preparar» del menú = pedidos pagados en la BD (HEAD count=exact)
      const paidNow = async () => (await state()).orders.filter((x) => x.status === 'paid').length;
      const badge = p.getByRole('link', { name: /^Pedidos/ }).locator('[aria-label$="por preparar"]');
      const paidBefore = await paidNow();
      if (paidBefore < 1) throw new Error('se esperaba al menos un pedido pagado');
      await badge.filter({ hasText: String(paidBefore) }).waitFor({ timeout: 8000 });
      await cambiar('processing');
      // al pasar a «En preparación» la insignia se recuenta sin recargar la página
      const paidAfter = await paidNow();
      if (paidAfter !== paidBefore - 1) throw new Error(`pagados tras preparar ${paidAfter} ≠ ${paidBefore - 1}`);
      if (paidAfter === 0) await badge.waitFor({ state: 'detached', timeout: 8000 });
      else await badge.filter({ hasText: String(paidAfter) }).waitFor({ timeout: 8000 });
      // enviar sin guía: la interfaz lo impide
      await p.locator('tr', { hasText: num }).getByRole('button', { name: 'GESTIONAR' }).click();
      await p.locator('#order-next-status').selectOption('shipped');
      await p.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
      await expectText(p, 'transportadora y número de guía');
      await p.getByLabel('Transportadora').fill('Coordinadora'); await p.getByLabel('Número de guía').fill('GUIA-123');
      await p.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
      await p.locator('#order-next-status').waitFor({ state: 'detached' });
      const o = (await state()).orders[0];
      if (o.status !== 'shipped' || o.carrier !== 'Coordinadora' || o.tracking_number !== 'GUIA-123') throw new Error(`estado final ${o.status}/${o.carrier}/${o.tracking_number}`);
      const ev = o.order_events.map((e) => e.to_status);
      if (!ev.includes('processing') || !ev.includes('shipped')) throw new Error(`historial incompleto: ${ev}`);
    }, browser);

    // Ejecución 134: en GitHub Actions (otras fuentes) la barra «ORDENAR POR» de /ropa se salía 1 px a 375 px
    // (recorridos 29/33/35). Aquí se fuerzan métricas de texto más anchas para no depender de las fuentes del equipo.
    await journey('64. Móvil 320/375: la barra «FILTRAR / ORDENAR POR» del catálogo no se sale de la pantalla aunque las fuentes sean más anchas', async (p) => {
      for (const width of [375, 320]) {
        await p.setViewportSize({ width, height: 812 });
        for (const url of ['/ropa', '/ropa?q=zzzzqqq']) {
          await p.goto(`${BASE}${url}`);
          await p.locator('#catalog-sort').waitFor();
          await p.addStyleTag({ content: 'body *{letter-spacing:0.06em !important}' });
          await p.waitForTimeout(200);
          const r = await p.evaluate(() => {
            const vw = document.documentElement.clientWidth; const box = (el) => el && el.getBoundingClientRect();
            const sel = box(document.querySelector('#catalog-sort')); const lab = box(document.querySelector('label[for=catalog-sort]'));
            const btn = box(document.querySelector('.mobile-filter-btn'));
            return { vw, sw: document.documentElement.scrollWidth, sel: [sel.left, sel.right], lab: [lab.left, lab.right], btn: btn && [btn.left, btn.right] };
          });
          const where = `${width}px ${url}`;
          for (const [k, v] of Object.entries({ sel: r.sel, lab: r.lab, btn: r.btn })) {
            if (v && (v[0] < 0 || v[1] > r.vw + 0.5)) throw new Error(`${where}: ${k} fuera de la pantalla [${v.map((x) => x.toFixed(1))}] vw=${r.vw}`);
          }
          if (r.sw > r.vw) throw new Error(`${where}: desborde horizontal ${r.sw}px > ${r.vw}px`);
        }
      }
      // el selector sigue funcionando
      await p.locator('#catalog-sort').selectOption('precio-asc');
      if ((await p.locator('#catalog-sort').inputValue()) !== 'precio-asc') throw new Error('el orden no cambió');
    }, browser, null, MOBILE);

    // Ejecución 135: el recorrido 33 falló 1 de 2 pasadas completas con «/carrito: desborde 376px > 375px · APLICAR».
    // El campo del cupón tenía `flex: 1` sin `minWidth: 0` y no podía encogerse por debajo de su ancho intrínseco
    // (depende de la fuente), así que empujaba el botón fuera. Aquí se ensancha la fuente para que no dependa del runner.
    await journey('65. Móvil 320/375: el cupón del carrito y el buscador de la cabecera caben en la pantalla aunque las fuentes sean más anchas', async (p) => {
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      for (const width of [375, 320]) {
        await p.setViewportSize({ width, height: 812 });
        await p.goto(`${BASE}/carrito`);
        const apply = p.getByRole('button', { name: 'APLICAR' });
        await apply.waitFor({ timeout: 8000 });
        await p.addStyleTag({ content: 'body *{letter-spacing:0.06em !important} input{font-size:1.05rem !important}' });
        await p.waitForTimeout(200);
        const r = await p.evaluate(() => {
          const vw = document.documentElement.clientWidth; const box = (el) => el && el.getBoundingClientRect();
          const inp = box(document.querySelector('input[aria-label="Código del cupón"]'));
          const btn = box([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'APLICAR'));
          return { vw, sw: document.documentElement.scrollWidth, inp: [inp.left, inp.right], btn: [btn.left, btn.right], bw: btn.width };
        });
        for (const [k, v] of Object.entries({ inp: r.inp, btn: r.btn })) {
          if (v[0] < 0 || v[1] > r.vw + 0.5) throw new Error(`${width}px: ${k} fuera de la pantalla [${v.map((x) => x.toFixed(1))}] vw=${r.vw}`);
        }
        if (r.sw > r.vw) throw new Error(`${width}px: desborde horizontal ${r.sw}px > ${r.vw}px`);
        if (r.bw < 60) throw new Error(`${width}px: APLICAR aplastado (${r.bw.toFixed(1)}px)`);
      }
      // El buscador de la cabecera tenía el mismo patrón (campo `flex: 1` sin `minWidth: 0` + botón «Buscar»).
      for (const width of [375, 320]) {
        await p.setViewportSize({ width, height: 812 });
        await p.goto(`${BASE}/`);
        await p.getByRole('button', { name: 'Buscar en la tienda' }).click();
        const go = p.getByRole('dialog', { name: 'Buscar' }).getByRole('button', { name: 'Buscar', exact: true });
        await go.waitFor({ timeout: 8000 });
        await p.addStyleTag({ content: 'body *{letter-spacing:0.06em !important} input{font-size:1.05rem !important}' });
        await p.waitForTimeout(200);
        const b = await go.boundingBox(); const vw = await p.evaluate(() => document.documentElement.clientWidth);
        if (!b || b.x < 0 || b.x + b.width > vw + 0.5) throw new Error(`${width}px: «Buscar» fuera de la pantalla [${b && [b.x, b.x + b.width].map((x) => x.toFixed(1))}] vw=${vw}`);
        if (b.width < 60) throw new Error(`${width}px: «Buscar» aplastado (${b.width.toFixed(1)}px)`);
      }
      await p.setViewportSize({ width: 375, height: 812 });
      await p.goto(`${BASE}/carrito`);
      // el cupón sigue funcionando
      await p.getByLabel('Código del cupón').fill('JM10');
      await p.getByRole('button', { name: 'APLICAR' }).click();
      await expectText(p, 'JM10');
    }, browser, null, MOBILE);

    // Ejecución 136 (D111): mismo patrón (campo `flex: 1` sin `minWidth: 0`) en las barras de búsqueda del admin.
    // Recorre las pantallas del admin a 375 y 320 px con fuentes más anchas y comprueba que ningún campo, selector
    // ni botón de la zona principal queda fuera de la pantalla y que la página no se desplaza en horizontal.
    await journey('66. Móvil 320/375: las barras de búsqueda y filtros del admin caben en la pantalla aunque las fuentes sean más anchas', async (p) => {
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      const routes = ['/admin/dashboard', '/admin/pedidos', '/admin/productos', '/admin/inventario', '/admin/clientes', '/admin/descuentos', '/admin/reviews', '/admin/boletin', '/admin/colecciones', '/admin/imagenes', '/admin/analytics', '/admin/configuracion'];
      const failures = [];
      for (const width of [375, 320]) {
        await p.setViewportSize({ width, height: 812 });
        for (const route of routes) {
          await p.goto(`${BASE}${route}`);
          await p.locator('main').first().waitFor({ timeout: 10000 });
          await p.waitForLoadState('networkidle').catch(() => {});
          if (!process.env.NO_WIDEN) await p.addStyleTag({ content: 'body *{letter-spacing:0.06em !important} input,select{font-size:1.05rem !important}' });
          await p.waitForTimeout(250);
          // `main` del admin tiene `overflowX: auto`: lo que no cabe NO desborda la página, se desplaza dentro de
          // `main` y queda fuera de la vista. Por eso se miden los controles contra la pantalla ignorando `main`
          // (solo cuentan como recortados los que están dentro de un contenedor propio, p. ej. una tabla desplazable)
          // y además que `main` no tenga desplazamiento horizontal.
          const r = await p.evaluate(() => {
            const vw = document.documentElement.clientWidth; const bad = []; const main = document.querySelector('main');
            for (const el of main.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, button')) {
              const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
              let clipped = false;
              for (let a = el.parentElement; a && a !== main; a = a.parentElement) { if (getComputedStyle(a).overflowX !== 'visible') { clipped = true; break; } }
              if (!clipped && (b.left < -0.5 || b.right > vw + 0.5)) bad.push(`${el.tagName.toLowerCase()}«${(el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().slice(0, 24)}»[${b.left.toFixed(0)},${b.right.toFixed(0)}]`);
            }
            const wide = []; // diagnóstico: elementos más externos que pasan del borde de `main`
            const mr = main.getBoundingClientRect().right;
            for (const el of main.querySelectorAll('*')) { const b = el.getBoundingClientRect(); if (b.width && b.right > mr + 0.5 && !(el.parentElement && el.parentElement !== main && el.parentElement.getBoundingClientRect().right > mr + 0.5)) wide.push(`${el.tagName.toLowerCase()}«${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}»w${b.width.toFixed(0)}`); }
            return { vw, sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), msw: main.scrollWidth, mcw: main.clientWidth, bad, wide: wide.slice(0, 4) };
          });
          if (process.env.E2E_DEBUG) console.log(width, route, r.msw, r.mcw, r.bad.length, r.wide.join(' '));
          if (r.bad.length) failures.push(`${width}px ${route}: ${r.bad.slice(0, 3).join(' ')}`);
          else if (r.sw > r.vw) failures.push(`${width}px ${route}: desborde ${r.sw}px > ${r.vw}px`);
          else if (r.msw > r.mcw + 1) failures.push(`${width}px ${route}: el contenido del admin se desplaza en horizontal (${r.msw}px > ${r.mcw}px)`);
        }
      }
      if (failures.length) throw new Error(failures.slice(0, 6).join(' · '));
      // en 320 la búsqueda y los filtros de productos siguen funcionando
      await p.goto(`${BASE}/admin/productos`);
      await p.getByRole('table').getByText('Camiseta Básica').first().waitFor({ timeout: 8000 });
      await p.getByLabel('Buscar productos').fill('polo');
      await p.getByRole('table').getByText('Polo Clásico').first().waitFor({ timeout: 8000 });
      if (await p.getByRole('table').getByText('Camiseta Básica').count()) throw new Error('la búsqueda «polo» sigue mostrando la camiseta');
      await assertTappable(p.getByRole('button', { name: 'CREAR NUEVO PRODUCTO' }), '320px /admin/productos «CREAR NUEVO PRODUCTO»');
    }, browser, null, MOBILE);

    await journey('67. Móvil 320/375: formulario de producto, detalle del pedido y modales del admin sin desplazamiento horizontal oculto aunque las fuentes sean más anchas', async (p) => {
      const order = (await (await fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_name: 'Movil Detalle', customer_email: 'movil.detalle@correo.co', status: 'processing' }) })).json()).order_number;
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      // [url, abrir (o null: la página misma), nombre del diálogo, texto que indica que cargó]
      const screens = [
        ['/admin/productos/nuevo', null, null, 'Nombre'],
        ['/admin/productos?q=POL-001', (q) => q.locator('tr', { hasText: 'Polo Clásico' }).getByTitle('Editar prenda'), null, 'Polo Clásico'],
        [`/admin/pedidos?q=${order}`, (q) => q.locator('tbody tr').filter({ hasText: order }).getByRole('button', { name: 'GESTIONAR' }), `Orden #`, null],
        ['/admin/descuentos', (q) => q.getByRole('button', { name: /CREAR CUPÓN/ }), 'Crear cupón', null],
        ['/admin/descuentos', (q) => q.locator('tbody tr', { hasText: 'JM10' }).getByRole('button', { name: 'Editar' }), 'Editar cupón', null],
        ['/admin/colecciones', (q) => q.getByRole('button', { name: 'Editar', exact: false }).first(), 'Editar colección', null],
        ['/admin/configuracion', (q) => q.getByRole('button', { name: /^Editar / }).first(), 'Editar método de envío', null],
        ['/admin/imagenes', (q) => q.getByRole('button', { name: /^Cambiar imagen / }).first(), /^Editar /, null],
        ['/admin/clientes?rol=todos', (q) => q.getByRole('button', { name: 'Ver detalle' }).first(), /^Cliente /, null],
      ];
      const failures = [];
      for (const width of [375, 320]) {
        await p.setViewportSize({ width, height: 812 });
        for (const [url, opener, dialog, text] of screens) {
          await p.goto(`${BASE}${url}`);
          await p.locator('main').first().waitFor({ timeout: 10000 });
          await p.waitForLoadState('networkidle').catch(() => {});
          if (opener) { await opener(p).first().click(); if (!dialog) await p.waitForLoadState('networkidle').catch(() => {}); }
          if (dialog) await p.getByRole('dialog', { name: dialog }).waitFor({ timeout: 8000 });
          // en preparación → «Enviado» muestra transportadora, guía y URL de rastreo
          if (dialog === 'Orden #') { await p.locator('#order-next-status').selectOption('shipped'); await p.getByLabel('Número de guía').waitFor({ timeout: 4000 }); }
          if (text) await p.getByText(text, { exact: false }).first().waitFor({ timeout: 8000 });
          if (!process.env.NO_WIDEN) await p.addStyleTag({ content: 'body *{letter-spacing:0.06em !important} input,select,textarea{font-size:1.05rem !important}' });
          await p.waitForTimeout(250);
          const where = `${width}px ${url}${dialog ? ` · ${typeof dialog === 'string' ? dialog : 'diálogo'}` : ''}`;
          // Igual que el recorrido 66, pero sobre el diálogo o `main`: un contenedor con overflow (el panel con
          // `overflowY: auto` también desplaza en X) esconde lo que no cabe en vez de desbordar la página.
          const r = await p.evaluate((isDialog) => {
            const vw = document.documentElement.clientWidth;
            const root = isDialog ? document.querySelector('[role=dialog]') : document.querySelector('main');
            const name = (el) => `${el.tagName.toLowerCase()}«${(el.getAttribute('aria-label') || el.textContent || el.placeholder || el.name || '').trim().slice(0, 24)}»`;
            const bad = []; let controls = 0;
            for (const el of root.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea, button')) {
              const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
              controls += 1;
              let clipped = false; // dentro de una tabla desplazable propia: se considera intencional
              for (let a = el.parentElement; a && a !== root; a = a.parentElement) { if (a.querySelector(':scope > table') && getComputedStyle(a).overflowX !== 'visible') { clipped = true; break; } }
              if (!clipped && (b.left < -0.5 || b.right > vw + 0.5)) bad.push(`${name(el)}[${b.left.toFixed(0)},${b.right.toFixed(0)}]`);
            }
            const scrollers = []; // contenedores (el propio raíz incluido) que se desplazan en X sin ser una tabla
            for (const el of [root, ...root.querySelectorAll('*')]) {
              const cs = getComputedStyle(el);
              if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1 && !el.querySelector(':scope > table')) scrollers.push(`${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
            }
            const rb = root.getBoundingClientRect();
            return { vw, sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), bad, scrollers, controls, rootOut: rb.left < -0.5 || rb.right > vw + 0.5 };
          }, !!dialog);
          if (process.env.E2E_DEBUG) console.log(where, r.controls, r.bad.join(' '), '|', r.scrollers.join(' '));
          if (!r.controls) failures.push(`${where}: sin controles visibles`);
          else if (r.bad.length) failures.push(`${where}: ${r.bad.slice(0, 3).join(' ')}`);
          else if (r.scrollers.length) failures.push(`${where}: se desplaza en horizontal ${r.scrollers.slice(0, 2).join(' ')}`);
          else if (r.rootOut) failures.push(`${where}: el panel se sale de la pantalla`);
          else if (r.sw > r.vw) failures.push(`${where}: desborde ${r.sw}px > ${r.vw}px`);
        }
      }
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.slice(0, 6).join(' · ')}`);
    }, browser, null, MOBILE);

    // Ejecución 138 (punto 0(cj)): la misma medida del recorrido 67 sobre la TIENDA: páginas con formularios
    // (carrito, checkout, acceso, cuenta, direcciones, restablecer) y sus modales (menú, búsqueda, carrito, filtros,
    // guías de tallas y fit, recomendador) a 375 y 320 px con fuentes ensanchadas. Ningún control fuera de la
    // pantalla, ningún contenedor que se desplace en horizontal escondiendo contenido, la página sin desborde.
    await journey('68. Móvil 320/375: formularios y modales de la tienda sin desplazamiento horizontal oculto aunque las fuentes sean más anchas', async (p) => {
      await p.goto(`${BASE}/login`); await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Rosa Mora');
      await p.locator('input[type=email]').fill('rosa.mora@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      const btn = (name) => (q) => q.getByRole('button', { name }).first();
      // [url, abrir (o null), nombre del diálogo (o null: se mide `main`), texto que indica que cargó]
      const screens = [
        ['/carrito', null, null, 'APLICAR'],
        ['/checkout', null, null, 'CONFIRMAR Y PAGAR'],
        ['/cuenta/datos', null, null, 'Mis datos'],
        ['/cuenta/direcciones', btn('Agregar dirección'), null, 'Direcciones'],
        ['/producto/camiseta-basica', null, null, 'AGREGAR AL CARRITO'],
        ['/producto/camiseta-basica', btn(/Guía de medidas/), 'Guía de tallas', null],
        ['/producto/camiseta-basica', btn('¿Qué significa el Fit?'), '¿Qué significa el fit?', null],
        ['/producto/camiseta-basica', btn(/Encuentra tu talla/), 'Encuentra tu talla ideal', null],
        ['/ropa', btn(/FILTRAR/), 'Filtros', null],
        ['/ropa', btn('Abrir menú de navegación'), 'Menú', null],
        ['/ropa', btn('Buscar en la tienda'), 'Buscar', null],
        ['/ropa', btn(/^Abrir carrito/), 'Carrito', null],
        ['/guia-de-tallas', null, null, null],
        ['/contacto', null, null, null],
      ];
      const failures = []; const run = (list) => measureMobileScreens(p, list, failures);
      await run(screens);
      // sin sesión: acceso (iniciar sesión y crear cuenta) y la cuenta como invitado
      await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes('auth-token')) localStorage.removeItem(k); });
      await run([
        ['/login', null, null, null],
        ['/login', btn('Crear cuenta'), null, null],
        ['/cuenta', null, null, null],
        ['/cuenta/restablecer', null, null, null],
      ]);
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.slice(0, 6).join(' · ')}`);
    }, browser, null, MOBILE);

    // Ejecución 139 (punto 0(ck), D115): la misma medida a 375/320 px con fuentes ensanchadas sobre las páginas de
    // contenido de la tienda (inicio, catálogos, búsqueda, favoritos, «Mis pedidos», confirmación y seguimiento del
    // pedido, páginas informativas) midiendo también los ENLACES (tarjetas, migas, menús) y el pie de página.
    await journey('69. Móvil 320/375: inicio, catálogo, favoritos, confirmación, páginas informativas y pie sin nada fuera de la pantalla', async (p) => {
      await p.goto(`${BASE}/login`); await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Lina Gómez');
      await p.locator('input[type=email]').fill('lina.gomez@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/ropa`);
      await p.getByRole('button', { name: 'Guardar en favoritos: Camiseta Básica' }).first().click();
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'lina.gomez@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/, { timeout: 20000 }); await expectText(p, 'Pedido registrado', 15000);
      const order = (await state()).orders[0];
      const confirm = `/checkout/confirmacion?order=${encodeURIComponent(order.order_number)}&token=${encodeURIComponent(order.public_token)}`;
      const failures = [];
      await measureMobileScreens(p, [
        ['/', null, null, null],
        ['/ropa', null, null, 'Camiseta Básica'],
        ['/ropa/camisetas', null, null, 'Camiseta Básica'],
        ['/nuevo', null, null, null],
        ['/ofertas', null, null, null],
        ['/linea/urbana', null, null, null],
        ['/buscar?q=camiseta', null, null, 'Camiseta Básica'],
        ['/buscar?q=zzzz', null, null, null],
        ['/cuenta/favoritos', null, null, 'Camiseta Básica'],
        ['/cuenta/pedidos', null, null, `#${order.order_number}`],
        [confirm, null, null, 'Pedido registrado'],
        ['/envios', null, null, null],
        ['/preguntas-frecuentes', null, null, null],
        ['/cambios-y-devoluciones', null, null, null],
        ['/nosotros', null, null, null],
        ['/tiendas', null, null, null],
        ['/terminos', null, null, null],
        ['/privacidad', null, null, null],
      ], failures, { links: true });
      // pagado y en un navegador sin sesión (enlace de seguimiento)
      await fetch(`${API_URL}/__synthetic-mark-paid/${order.order_number}`);
      await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes('auth-token')) localStorage.removeItem(k); });
      await measureMobileScreens(p, [[confirm, null, null, order.order_number], ['/cuenta/favoritos', null, null, null]], failures, { links: true });
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.slice(0, 6).join(' · ')}`);
    }, browser, null, MOBILE);

    // Ejecución 140 (punto 0(cl)(2), D116): la medida del recorrido 69 (con ENLACES) sobre las listas del admin que
    // los recorridos 66/67 solo medían por sus barras o sus modales: dashboard, pedidos, inventario, productos,
    // clientes, descuentos, reseñas, boletín, imágenes, colecciones, analytics y configuración, a 375 y 320 px.
    await journey('70. Móvil 320/375: listas del admin (pedidos, inventario, productos, clientes, cupones, reseñas, boletín, envíos…) con sus enlaces dentro de la pantalla', async (p) => {
      const order = (await (await fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_name: 'Movil Listas', customer_email: 'movil.listas@correo.co', status: 'paid' }) })).json()).order_number;
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
      const failures = [];
      await measureMobileScreens(p, [
        ['/admin/dashboard', null, null, null],
        ['/admin/pedidos', null, null, order],
        [`/admin/pedidos?estado=paid&q=${order}`, null, null, order],
        ['/admin/inventario', null, null, null],
        ['/admin/productos', null, null, 'Polo Clásico'],
        ['/admin/clientes?rol=todos', null, null, 'Ver detalle'],
        ['/admin/descuentos', null, null, 'JM10'],
        ['/admin/reviews', null, null, null],
        ['/admin/boletin', null, null, null],
        ['/admin/imagenes', null, null, null],
        ['/admin/colecciones', null, null, 'Editar'],
        ['/admin/analytics', null, null, null],
        ['/admin/configuracion', null, null, 'Estándar'],
      ], failures, { links: true });
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.slice(0, 6).join(' · ')}`);
    }, browser, null, MOBILE);

    // Ejecución 142 (D118): el recorrido 69 falló en CI con «MIS FAVORITOS (0)»: el favorito se marcó mientras
    // syncWishlist aún leía la BD tras iniciar sesión y la lectura lo borró. Aquí la lectura de wishlist_items se
    // retrasa 1,5 s para reproducir la carrera siempre: marcar uno y desmarcar otro durante la lectura debe quedar.
    await journey('71. Favoritos marcados y quitados mientras se sincroniza la lista, o con la petición cortada por una recarga, no se pierden', async (p) => {
      // Respuesta de la lectura retrasada 1,5 s DESPUÉS de leer la BD: lo que el cliente haga en ese tiempo no está en ella.
      let reads = 0;
      await p.route('**/rest/v1/wishlist_items*', async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        reads += 1;
        const resp = await route.fetch().catch(() => null);
        if (!resp) return route.abort().catch(() => {});
        await new Promise((r) => setTimeout(r, 1500));
        await route.fulfill({ response: resp }).catch(() => {});
      });
      const db = async (want) => {
        let rows = [];
        for (let i = 0; i < 20; i += 1) { rows = (await state()).wishlist; if (rows.length === want) break; await p.waitForTimeout(250); }
        return rows;
      };
      await p.goto(`${BASE}/login`); await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Rosa Pérez');
      await p.locator('input[type=email]').fill('rosa.perez@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      // (1) primera sincronización de la cuenta: el favorito aún es solo local cuando se marca
      const before = reads;
      await p.goto(`${BASE}/ropa`);
      await p.getByRole('button', { name: 'Guardar en favoritos: Camiseta Básica' }).first().click();
      await p.waitForTimeout(2500);
      if (reads === before) throw new Error('(1) la lectura de favoritos no pasó por la ruta retrasada');
      if (!(await p.getByRole('button', { name: 'Quitar de favoritos: Camiseta Básica' }).count())) throw new Error('(1) la lectura borró de la pantalla el favorito recién marcado');
      let rows = await db(1);
      if (rows.length !== 1) throw new Error(`(1) BD: se esperaba 1 favorito, hay ${rows.length}`);
      const camiseta = rows[0].product_id;
      // (2) con la cuenta ya sincronizada: guardar uno y quitar otro mientras la lectura (anterior a ambos) vuelve
      const before2 = reads;
      await p.reload();
      await p.getByRole('button', { name: 'Quitar de favoritos: Camiseta Básica' }).first().click();
      await p.getByRole('button', { name: 'Guardar en favoritos: Polo Clásico' }).first().click();
      await p.waitForTimeout(2500);
      if (reads === before2) throw new Error('(2) la lectura de favoritos no pasó por la ruta retrasada');
      const fails = [];
      if (!(await p.getByRole('button', { name: 'Quitar de favoritos: Polo Clásico' }).count())) fails.push('Polo Clásico desapareció de la pantalla');
      if (await p.getByRole('button', { name: 'Quitar de favoritos: Camiseta Básica' }).count()) fails.push('Camiseta Básica reapareció en la pantalla');
      rows = await db(1);
      if (rows.length !== 1 || rows[0].product_id === camiseta) fails.push(`BD: ${rows.length} favoritos (${rows.map((r) => r.product_id).join(', ')})`);
      if (fails.length) throw new Error(`(2) ${fails.join(' · ')}`);
      await p.unroute('**/rest/v1/wishlist_items*');
      // (3) D119: la petición que guarda el favorito se corta (recarga o pestaña cerrada justo después del clic,
      // como hace el recorrido 69 con su p.goto inmediato). Al volver, la sincronización debe reenviarla.
      // La petición queda retenida (sin respuesta) y la página se recarga con ella en vuelo.
      let held = 0;
      await p.route('**/rest/v1/wishlist_items*', (route) => {
        if (route.request().method() === 'POST' && !held) { held += 1; return undefined; } // retenida: nunca llega a la BD
        return route.continue();
      });
      await p.getByRole('button', { name: 'Guardar en favoritos: Camiseta Básica' }).first().click();
      for (let i = 0; i < 20 && !held; i += 1) await p.waitForTimeout(100);
      if (!held) throw new Error('(3) el clic no envió la petición de guardado');
      if ((await state()).wishlist.length !== 1) throw new Error('(3) la petición cortada llegó a la BD: el caso no se reprodujo');
      await p.reload();
      rows = await db(2);
      await p.unroute('**/rest/v1/wishlist_items*', { behavior: 'ignoreErrors' });
      if (rows.length !== 2) throw new Error(`(3) tras recargar, la BD tiene ${rows.length} favoritos (se esperaban 2): el guardado cortado se perdió`);
      await p.goto(`${BASE}/cuenta/favoritos`);
      await expectText(p, 'MIS FAVORITOS (2)', 10000); await expectText(p, 'Polo Clásico', 10000); await expectText(p, 'Camiseta Básica', 10000);
    }, browser);

    // Ejecución 143 (punto 0(cm)(2), D120): flujos de la tienda que no tenían recorrido en móvil estrecho: libreta con
    // VARIAS direcciones (una muy larga) a 320 px — agregar, editar, hacer principal y eliminar — y la ficha de producto
    // con reseñas publicadas y el formulario de reseña de un comprador, hasta enviarla.
    await journey('72. Móvil 320: libreta con varias direcciones (agregar, editar, principal, eliminar) y reseña de un comprador, todo dentro de la pantalla', async (p) => {
      await p.setViewportSize({ width: 320, height: 640 });
      await p.goto(`${BASE}/login`); await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Sara Ortiz');
      await p.locator('input[type=email]').fill('sara.ortiz@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/cuenta/direcciones`);
      const libreta = p.getByTestId('address-book'); await libreta.waitFor({ timeout: 10000 });
      const failures = [];
      // el primer campo del formulario debe quedar enfocado y a la vista (en móvil la lista empuja el formulario hacia abajo)
      const formInView = async (where) => {
        const f = libreta.getByTestId('address-form'); await f.waitFor({ timeout: 5000 });
        await p.waitForTimeout(500);
        const r = await f.evaluate((form) => { const el = form.querySelector('input[name=recipient_name]'); const b = el.getBoundingClientRect();
          return { focused: document.activeElement === el, top: b.top, bottom: b.bottom, vh: window.innerHeight }; });
        if (!r.focused) failures.push(`${where}: el foco no fue a «Quien recibe»`);
        if (r.top < 0 || r.bottom > r.vh) failures.push(`${where}: «Quien recibe» fuera de la vista (${r.top.toFixed(0)}–${r.bottom.toFixed(0)} de ${r.vh})`);
        return f;
      };
      const nueva = async (dept, city, line, extra = {}) => {
        await libreta.getByRole('button', { name: 'Agregar dirección' }).click();
        const f = await formInView(`agregar ${city}`);
        await f.locator('input[name=recipient_name]').fill(extra.name || 'Sara Ortiz'); await f.locator('input[name=phone]').fill('3001112233');
        await f.locator('select[name=department]').selectOption({ label: dept });
        await f.locator('input[name=city]').fill(city); await f.locator('input[name=address_line]').fill(line);
        if (extra.reference) await f.locator('textarea[name=reference]').fill(extra.reference);
        await f.getByRole('button', { name: 'Guardar dirección' }).click();
        await libreta.getByText(line).first().waitFor({ timeout: 8000 });
      };
      const larga = 'Carrera 43A # 1 Sur-100, Torre Empresarial Milla de Oro, Oficina 1503';
      await nueva('Antioquia', 'Medellín', 'Calle 10 # 5-20');
      await nueva('Cundinamarca', 'Bogotá', 'Avenida Carrera 68 # 24-35 Sur');
      await nueva('Antioquia', 'Envigado', larga, { name: 'María José Fernández de los Ríos', reference: 'Portería principal; preguntar por recepción del piso 15 y dejar el paquete con el vigilante de turno' });
      if ((await libreta.getByTestId('address-item').count()) !== 3) failures.push(`se esperaban 3 direcciones, hay ${await libreta.getByTestId('address-item').count()}`);
      // editar la PRIMERA de la lista (la más alejada del formulario)
      await libreta.getByRole('button', { name: 'Editar dirección Calle 10 # 5-20' }).click();
      const f = await formInView('editar la primera');
      await f.locator('input[name=city]').fill('Sabaneta'); await f.getByRole('button', { name: 'Guardar dirección' }).click();
      await libreta.getByTestId('address-item').filter({ hasText: 'Sabaneta' }).waitFor({ timeout: 8000 });
      // la larga pasa a principal
      await libreta.getByTestId('address-item').filter({ hasText: 'Torre Empresarial' }).getByRole('button', { name: 'Hacer principal' }).click();
      await libreta.getByTestId('address-item').filter({ hasText: 'Torre Empresarial' }).getByText('Principal', { exact: true }).waitFor({ timeout: 8000 });
      // eliminar la de Bogotá: cancelar el diálogo no elimina; aceptarlo sí
      p.removeAllListeners('dialog'); p.once('dialog', (d) => d.dismiss().catch(() => {}));
      await libreta.getByRole('button', { name: 'Eliminar dirección Avenida Carrera 68 # 24-35 Sur' }).click();
      await p.waitForTimeout(500);
      if ((await libreta.getByTestId('address-item').count()) !== 3) failures.push('cancelar «¿Eliminar esta dirección?» eliminó la dirección');
      p.on('dialog', (d) => d.accept().catch(() => {}));
      await libreta.getByRole('button', { name: 'Eliminar dirección Avenida Carrera 68 # 24-35 Sur' }).click();
      await libreta.getByText('Dirección eliminada.').waitFor({ timeout: 8000 });
      await p.reload(); await libreta.getByTestId('address-item').first().waitFor({ timeout: 10000 });
      const items = await libreta.getByTestId('address-item').allInnerTexts();
      if (items.length !== 2 || items.some((t) => t.includes('Bogotá')) || !items.some((t) => t.includes('Sabaneta'))) failures.push(`tras recargar: ${items.map((t) => t.replace(/\s+/g, ' ').slice(0, 40)).join(' | ')}`);
      // medida de la libreta (con la dirección larga como principal) y del formulario de edición abierto
      const btn = (name) => (q) => q.getByRole('button', { name }).first();
      await measureMobileScreens(p, [
        ['/cuenta/direcciones', null, null, 'Torre Empresarial'],
        ['/cuenta/direcciones', btn(/^Editar dirección Carrera 43A/), null, 'Torre Empresarial'],
      ], failures, { links: true });
      // checkout: la principal sale primero y el selector de direcciones guardadas cabe a 320
      await p.setViewportSize({ width: 320, height: 640 });
      await addToCart(p, 'polo-clasico', 'M');
      await measureMobileScreens(p, [['/checkout', null, null, 'CONFIRMAR Y PAGAR']], failures);
      await p.waitForFunction((l) => document.querySelector('input[name=address]')?.value === l, larga, { timeout: 8000 }).catch(() => failures.push('el checkout no propuso la dirección principal'));
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
      await p.waitForURL(/\/checkout\/confirmacion/, { timeout: 20000 });
      const order = (await state()).orders[0];
      if (order.shipping_address !== larga) failures.push(`pedido con dirección ${order.shipping_address}`);
      // reseña: ficha con una reseña publicada larga (con respuesta) y el formulario del comprador con pedido entregado
      await fetch(`${API_URL}/__synthetic-mark-paid/${order.order_number}`);
      await fetch(`${API_URL}/__synthetic-mark-delivered/${order.order_number}`);
      await fetch(`${API_URL}/__synthetic-review`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'polo-clasico', author_name: 'Bartolomé Q.', city: 'Santa Rosa de Cabal', title: 'Excelente_calidad_y_horma_perfecta_para_el_día_a_día',
          comment: 'Lo uso para la oficina y para el fin de semana; después de varias lavadas conserva el color y la forma. https://ejemplo.co/una-direccion-muy-larga-sin-espacios-que-no-debe-desbordar', admin_reply: '¡Gracias por tu opinión, Bartolomé!' }) });
      await measureMobileScreens(p, [['/producto/polo-clasico', null, null, 'Bartolomé Q.']], failures, { links: true });
      await p.setViewportSize({ width: 320, height: 640 });
      await p.goto(`${BASE}/producto/polo-clasico`);
      const caja = p.getByTestId('review-form'); await caja.getByText(order.order_number).waitFor({ timeout: 10000 });
      await caja.getByRole('button', { name: '5 de 5 estrellas' }).click();
      await caja.locator('#review-title').fill('Me_queda_perfecto_la_talla_M_y_la_tela_es_fresquisima');
      await caja.locator('#review-comment').fill('La talla M me quedó justa y la tela es fresca para el calor.');
      await caja.locator('#review-city').fill('Envigado');
      await caja.getByRole('button', { name: 'Enviar opinión' }).click();
      await caja.getByText(/Recibimos tu opinión/).waitFor({ timeout: 8000 }).catch(() => failures.push('no apareció la confirmación de la reseña'));
      const mine = (await state()).reviews.find((r) => r.title.startsWith('Me_queda_perfecto'));
      if (!mine || mine.status !== 'pending' || mine.rating !== 5) failures.push(`reseña guardada: ${JSON.stringify(mine && { status: mine.status, rating: mine.rating })}`);
      // «Tu opinión» con la reseña enviada (título largo sin espacios) también dentro de la pantalla
      await measureMobileScreens(p, [['/producto/polo-clasico', null, null, 'Me_queda_perfecto']], failures, { links: true });
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.slice(0, 6).join(' · ')}`);
    }, browser, null, MOBILE);

    await journey('73. Móvil 320: «Mis pedidos» con muchos pedidos en estados mixtos dentro de la pantalla, y teclado del formulario de dirección (Escape/Cancelar/Guardar devuelven el foco)', async (p) => {
      // Ejecución 144: una cuenta con 10 pedidos (pendiente con ventana abierta y vencida, vencido, pagado, en revisión,
      // en preparación, enviado con guía larga, entregado con nombres largos, cancelado y reembolsado).
      const tag = crypto.randomBytes(3).toString('hex'); const email = `muchos.${tag}@jm.test`;
      const su = await (await fetch(`${API_URL}/auth/v1/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Clave-Segura-1', data: { full_name: `Valentina Restrepo ${tag}` } }) })).json();
      const largo = [{ product_name: 'Chaqueta Impermeable Técnica Ultraligera Edición Montaña', size_code: 'XXL', color_name: 'Azul petróleo jaspeado', quantity: 2 },
        { product_name: 'Pantalón Cargo Relajado de Algodón Orgánico', size_code: '34', color_name: 'Verde oliva', quantity: 1 }];
      const mk = (status, extra = {}) => fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: su.user.id, customer_email: email, customer_name: `Valentina ${tag}`, status, items: largo, ...extra }) }).then(j);
      const soon = new Date(Date.now() + 30 * 60e3).toISOString(); const past = new Date(Date.now() - 5 * 60e3).toISOString();
      const made = [];
      for (const [st, extra] of [['refunded', {}], ['cancelled', {}], ['delivered', { tracking_number: 'SRV-0000000000000123456789-COL' }],
        ['shipped', { carrier: 'Coordinadora Mercantil', tracking_number: 'CO-99887766554433221100-XYZ', tracking_url: 'https://ejemplo.co/rastreo/CO-99887766554433221100-XYZ' }],
        ['processing', {}], ['paid', { needs_attention: true }], ['paid', {}], ['expired', {}], ['payment_pending', { payment_expires_at: past }], ['payment_pending', { payment_expires_at: soon }]]) made.push(await mk(st, extra));
      await p.setViewportSize({ width: 320, height: 640 });
      await login(p, '/login', email, 'Clave-Segura-1', 'Iniciar Sesión');
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      const failures = [];
      await p.goto(`${BASE}/cuenta/pedidos`);
      await p.getByText(made[0].order_number, { exact: false }).first().waitFor({ timeout: 15000 });
      const shown = await p.evaluate(() => [...document.querySelectorAll('main')].map((m) => m.innerText).join(' ').match(/JM-\d{6}/g) || []);
      for (const o of made) if (!shown.includes(o.order_number)) failures.push(`no aparece ${o.order_number}`);
      if ((await p.getByTestId('order-pay').count()) !== 1) failures.push(`«Pagar ahora» en ${await p.getByTestId('order-pay').count()} pedidos (se esperaba 1: el de ventana abierta)`);
      await measureMobileScreens(p, [['/cuenta/pedidos', null, null, made[0].order_number]], failures, { links: true });
      // Teclado en la libreta: Escape cierra el formulario y el foco vuelve al botón que lo abrió.
      await p.setViewportSize({ width: 320, height: 640 });
      await p.goto(`${BASE}/cuenta/direcciones`);
      const libreta = p.getByTestId('address-book'); await libreta.waitFor({ timeout: 10000 });
      const focused = () => p.evaluate(() => (document.activeElement?.getAttribute('aria-label') || document.activeElement?.innerText || document.activeElement?.tagName || '').trim());
      await libreta.getByRole('button', { name: 'Agregar dirección' }).click();
      let f = libreta.getByTestId('address-form'); await f.waitFor({ timeout: 5000 });
      await f.locator('input[name=city]').fill('Pereira');
      await p.keyboard.press('Escape');
      if (await libreta.getByTestId('address-form').count()) failures.push('Escape no cerró «Nueva dirección»');
      if ((await focused()) !== 'Agregar dirección') failures.push(`tras Escape el foco quedó en «${await focused()}»`);
      // Guardar con Enter: el foco vuelve a «Agregar dirección»
      await p.keyboard.press('Enter');
      f = libreta.getByTestId('address-form'); await f.waitFor({ timeout: 5000 });
      await f.locator('input[name=phone]').fill('3004445566'); await f.locator('select[name=department]').selectOption({ label: 'Risaralda' });
      await f.locator('input[name=city]').fill('Pereira'); await f.locator('input[name=address_line]').fill('Calle 19 # 8-34');
      await f.locator('input[name=address_line]').press('Enter');
      await libreta.getByText('Dirección guardada.').waitFor({ timeout: 8000 });
      await p.waitForTimeout(300);
      if ((await focused()) !== 'Agregar dirección') failures.push(`tras guardar el foco quedó en «${await focused()}»`);
      // Editar → Cancelar con teclado: el foco vuelve a «Editar» de esa dirección
      const edit = libreta.getByRole('button', { name: 'Editar dirección Calle 19 # 8-34' });
      await edit.focus(); await p.keyboard.press('Enter');
      f = libreta.getByTestId('address-form'); await f.waitFor({ timeout: 5000 });
      await f.getByRole('button', { name: 'Cancelar' }).focus(); await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      if (await libreta.getByTestId('address-form').count()) failures.push('Cancelar no cerró «Editar dirección»');
      if ((await focused()) !== 'Editar dirección Calle 19 # 8-34') failures.push(`tras Cancelar el foco quedó en «${await focused()}»`);
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.slice(0, 6).join(' · ')}`);
    }, browser, null, MOBILE);

    await journey('74. Móvil 320: «Mis pedidos» con 45 pedidos se pagina de 20 en 20 (contador con el total, «Ver más pedidos», foco en el primer pedido nuevo)', async (p) => {
      // Ejecución 145: antes se pedían TODOS los pedidos con sus líneas, sin límite (PostgREST corta en max_rows sin avisar).
      const tag = crypto.randomBytes(3).toString('hex'); const email = `paginas.${tag}@jm.test`;
      const su = await (await fetch(`${API_URL}/auth/v1/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Clave-Segura-1', data: { full_name: `Paginas ${tag}` } }) })).json();
      const made = []; // del más antiguo al más reciente
      for (let i = 0; i < 45; i += 1) {
        made.push(await fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ user_id: su.user.id, customer_email: email, customer_name: `Paginas ${tag}`, status: i % 3 ? 'delivered' : 'paid' }) }).then(j));
      }
      const newest = [...made].reverse();
      const limits = [];
      p.on('request', (r) => { const u = new URL(r.url()); if (r.method() === 'GET' && u.pathname.endsWith('/rest/v1/online_orders')) limits.push(u.searchParams.get('limit')); });
      await p.setViewportSize({ width: 320, height: 640 });
      await login(p, '/login', email, 'Clave-Segura-1', 'Iniciar Sesión');
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      const failures = [];
      await p.goto(`${BASE}/cuenta/pedidos`);
      await p.getByText(newest[0].order_number, { exact: false }).first().waitFor({ timeout: 15000 });
      const shownNumbers = () => p.evaluate(() => [...document.querySelectorAll('[data-order-id]')].map((c) => (c.innerText.match(/JM-\d{6}/) || [''])[0]));
      let shown = await shownNumbers();
      if (shown.length !== 20) failures.push(`primera página: ${shown.length} pedidos (se esperaban 20)`);
      if (shown.join() !== newest.slice(0, 20).map((o) => o.order_number).join()) failures.push('la primera página no son los 20 más recientes en orden');
      if (!limits.length || limits.some((l) => !l || Number(l) > 21)) failures.push(`consulta sin límite acotado (limit=${limits.join('/') || 'ninguno'})`);
      const more = p.getByTestId('orders-load-more');
      if (!(await more.innerText()).includes('Mostrando 20 de 45 pedidos')) failures.push(`texto del pie: «${await more.innerText()}»`);
      await measureMobileScreens(p, [['/cuenta/pedidos', null, null, newest[0].order_number]], failures, { links: true });
      await p.setViewportSize({ width: 320, height: 640 });
      await p.goto(`${BASE}/cuenta/pedidos`);
      await more.waitFor({ timeout: 15000 });
      const btn = more.getByRole('button', { name: 'Ver más pedidos' });
      const box = await btn.boundingBox();
      if (!box || box.height < 44 || box.x < 0 || box.x + box.width > 320) failures.push(`botón «Ver más pedidos» fuera de medida: ${JSON.stringify(box)}`);
      await btn.focus(); await p.keyboard.press('Enter');
      await p.waitForFunction(() => document.querySelectorAll('[data-order-id]').length === 40, null, { timeout: 10000 }).catch(() => {});
      shown = await shownNumbers();
      if (shown.length !== 40) failures.push(`tras «Ver más»: ${shown.length} pedidos (se esperaban 40)`);
      const focusedNumber = () => p.evaluate(() => ((document.activeElement?.closest('[data-order-id]')?.innerText || '').match(/JM-\d{6}/) || [document.activeElement?.tagName || ''])[0]);
      if ((await focusedNumber()) !== newest[20].order_number) failures.push(`tras «Ver más» el foco quedó en «${await focusedNumber()}» (se esperaba ${newest[20].order_number})`);
      await more.getByRole('button', { name: 'Ver más pedidos' }).click();
      await p.waitForFunction(() => document.querySelectorAll('[data-order-id]').length === 45, null, { timeout: 10000 }).catch(() => {});
      shown = await shownNumbers();
      if (shown.join() !== newest.map((o) => o.order_number).join()) failures.push(`lista final: ${shown.length} pedidos, ${new Set(shown).size} distintos (se esperaban los 45 en orden)`);
      if (await p.getByTestId('orders-load-more').count()) failures.push('«Ver más pedidos» sigue visible con todos cargados');
      if ((await focusedNumber()) !== newest[40].order_number) failures.push(`tras cargar el resto el foco quedó en «${await focusedNumber()}»`);
      const badge = await p.evaluate(() => [...document.querySelectorAll('main span')].map((s) => s.innerText.trim()).find((t) => /^\d+$/.test(t)));
      if (badge !== '45') failures.push(`contador de pedidos: «${badge}» (se esperaba 45)`);
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.slice(0, 6).join(' · ')}`);
    }, browser, null, MOBILE);

    await journey('75. Móvil 320: la ficha con 30 opiniones aprobadas las pagina de 12 en 12 (total real, «Ver más opiniones» con teclado, foco en la primera nueva, sin pendientes)', async (p) => {
      // Ejecución 146 (D123): antes la ficha leía solo las 12 más recientes, decía «(N opiniones)» y no había forma de ver el resto.
      const tag = crypto.randomBytes(3).toString('hex'); const base = Date.parse('2030-01-01T00:00:00Z');
      const made = []; // del más antiguo al más reciente; fechas futuras para que sean las más recientes del producto
      for (let i = 0; i < 30; i += 1) {
        made.push(await fetch(`${API_URL}/__synthetic-review`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug: 'camiseta-basica', author_name: `Opina ${tag} ${String(i + 1).padStart(2, '0')}`, title: `Opinión ${i + 1}`, comment: `Comentario de prueba número ${i + 1}.`, created_at: new Date(base + i * 60e3).toISOString() }) }).then(j));
      }
      await fetch(`${API_URL}/__synthetic-review`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'camiseta-basica', author_name: `Pendiente ${tag}`, status: 'pending', created_at: new Date(base + 99 * 60e3).toISOString() }) });
      const st = await state(); const productId = st.reviews.find((r) => r.id === made[0].id)?.product_id;
      const approved = st.reviews.filter((r) => r.status === 'approved' && r.product_id === productId);
      const total = approved.length; // 30 nuevas + las aprobadas que dejaron recorridos anteriores
      const expectedIds = [...approved].sort((a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : (b.id > a.id ? 1 : -1))).map((r) => r.id);
      const ranges = [];
      p.on('request', (r) => { const u = new URL(r.url()); if (r.method() === 'GET' && u.pathname.endsWith('/rest/v1/product_reviews')) ranges.push([u.searchParams.get('offset'), u.searchParams.get('limit'), u.searchParams.get('status')]); });
      const failures = [];
      await p.setViewportSize({ width: 320, height: 640 });
      await p.goto(`${BASE}/producto/camiseta-basica`);
      const shown = () => p.evaluate(() => [...document.querySelectorAll('#opiniones [data-review-id]')].map((c) => c.getAttribute('data-review-id')));
      await p.waitForFunction(() => document.querySelectorAll('#opiniones [data-review-id]').length > 0, null, { timeout: 15000 }).catch(() => {});
      let ids = await shown();
      if (ids.length !== 12) failures.push(`primera página: ${ids.length} opiniones (se esperaban 12)`);
      if (ids.join() !== expectedIds.slice(0, 12).join()) failures.push('la primera página no son las 12 más recientes en orden');
      if (!ranges.length || ranges.some(([, l, s]) => !l || Number(l) > 13 || s !== 'eq.approved')) failures.push(`consulta sin límite acotado o sin filtro de aprobadas: ${JSON.stringify(ranges)}`);
      if (await p.getByText(`Pendiente ${tag}`).count()) failures.push('se ve una reseña pendiente');
      const more = p.getByTestId('reviews-load-more');
      if (!(await more.innerText().catch(() => '')).includes(`Mostrando 12 de ${total} opiniones`)) failures.push(`texto del pie: «${await more.innerText().catch(() => '(sin pie)')}»`);
      await measureMobileScreens(p, [['/producto/camiseta-basica', null, null, `Opina ${tag} 30`]], failures, { links: true });
      await p.setViewportSize({ width: 320, height: 640 });
      await p.goto(`${BASE}/producto/camiseta-basica`);
      await more.waitFor({ timeout: 15000 });
      const btn = more.getByRole('button', { name: 'Ver más opiniones' });
      await btn.scrollIntoViewIfNeeded();
      const box = await btn.boundingBox();
      if (!box || box.height < 44 || box.x < 0 || box.x + box.width > 320) failures.push(`botón «Ver más opiniones» fuera de medida: ${JSON.stringify(box)}`);
      const focused = () => p.evaluate(() => document.activeElement?.getAttribute('data-review-id') || document.activeElement?.tagName || '');
      let loaded = 12;
      while (loaded < total) {
        await more.getByRole('button', { name: 'Ver más opiniones' }).focus(); await p.keyboard.press('Enter');
        const want = Math.min(total, loaded + 12);
        await p.waitForFunction((n) => document.querySelectorAll('#opiniones [data-review-id]').length === n, want, { timeout: 10000 }).catch(() => {});
        ids = await shown();
        if (ids.length !== want) { failures.push(`tras «Ver más»: ${ids.length} opiniones (se esperaban ${want})`); break; }
        if ((await focused()) !== expectedIds[loaded]) failures.push(`tras «Ver más» el foco quedó en «${await focused()}» (se esperaba la opinión ${loaded + 1})`);
        loaded = want;
      }
      if (ids.join() !== expectedIds.join()) failures.push(`lista final: ${ids.length} opiniones, ${new Set(ids).size} distintas (se esperaban ${total} en orden)`);
      if (await p.getByTestId('reviews-load-more').count()) failures.push('«Ver más opiniones» sigue visible con todas cargadas');
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.slice(0, 6).join(' · ')}`);
    }, browser, null, MOBILE);

    await journey('76. Admin con teclado: moderar reseñas, dar de baja en el boletín y ajustar stock no dejan el foco en <body> (D125)', async (p) => {
      // Ejecución 147 (D125): antes, la fila que salía del filtro (o la tabla que se recargaba) se llevaba el foco y el
      // siguiente Tab volvía a «Ir al contenido».
      const tag = crypto.randomBytes(3).toString('hex');
      for (const i of [1, 2, 3]) {
        await fetch(`${API_URL}/__synthetic-review`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug: 'camiseta-basica', author_name: `Foco ${tag} ${i}`, title: `Pendiente ${i}`, status: 'pending', created_at: new Date(Date.parse('2031-01-01T00:00:00Z') - i * 60e3).toISOString() }) });
      }
      const env = ciEnv();
      for (const e of [`foco1.${tag}@example.co`, `foco2.${tag}@example.co`]) {
        const r = await fetch(`${API_URL}/rest/v1/rpc/subscribe_newsletter`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY || 'anon', authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY || 'anon'}` }, body: JSON.stringify({ p_email: e, p_source: 'home' }) });
        if (!r.ok) throw new Error(`no se pudo sembrar el boletín: ${r.status}`);
      }
      const failures = [];
      const focusInfo = () => p.evaluate(() => {
        const a = document.activeElement;
        return { tag: a?.tagName, key: a?.getAttribute('data-row-key') || a?.closest('[data-row-key]')?.getAttribute('data-row-key') || null,
          label: a?.getAttribute('aria-label') || a?.textContent?.trim().slice(0, 60) || '', action: a?.getAttribute('data-row-action') || null };
      });
      const pressOn = async (loc) => { await loc.focus(); await p.keyboard.press('Enter'); };
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });

      // Reseñas en «Pendiente» filtradas por este recorrido: aprobar la primera → foco en la que ocupó su lugar.
      await p.goto(`${BASE}/admin/reviews?q=${encodeURIComponent(`Foco ${tag}`)}`);
      const art = (i) => p.locator('article', { hasText: `Foco ${tag} ${i}` });
      await art(1).waitFor({ timeout: 10000 });
      await pressOn(art(1).getByRole('button', { name: 'Aprobar' }));
      await p.getByRole('status').filter({ hasText: `Foco ${tag} 1` }).waitFor();
      await art(1).waitFor({ state: 'detached' });
      await p.waitForTimeout(150);
      let f = await focusInfo();
      if (!(f.label || '').includes(`Foco ${tag} 2`)) failures.push(`reseñas: tras aprobar, foco en ${JSON.stringify(f)} (se esperaba la reseña 2)`);
      await p.keyboard.press('Tab');
      f = await focusInfo();
      if (/Ir al contenido/i.test(f.label)) failures.push('reseñas: el siguiente Tab volvió a «Ir al contenido»');
      // escribir respuesta y guardar: el botón desaparece → foco en la respuesta de esa reseña
      const ta = art(2).getByRole('textbox', { name: 'Respuesta de la tienda' });
      await ta.fill('Gracias por tu opinión');
      await pressOn(art(2).getByRole('button', { name: 'Guardar respuesta' }));
      await p.getByRole('status').filter({ hasText: 'Respuesta guardada' }).waitFor();
      await p.waitForTimeout(150);
      if (!(await ta.evaluate((el) => el === document.activeElement))) failures.push(`reseñas: tras guardar respuesta, foco en ${JSON.stringify(await focusInfo())}`);
      // rechazar las dos que quedan → lista vacía → foco en el aviso de vacío
      await pressOn(art(3).getByRole('button', { name: 'Rechazar' }));
      await art(3).waitFor({ state: 'detached' });
      await pressOn(art(2).getByRole('button', { name: 'Rechazar' }));
      await art(2).waitFor({ state: 'detached' });
      await p.waitForTimeout(150);
      f = await focusInfo();
      if (!/No hay reseñas/.test(f.label)) failures.push(`reseñas: con la lista vacía, foco en ${JSON.stringify(f)}`);

      // Boletín en «Activos»: dar de baja (confirmación aceptada) → la fila sale → foco en la que ocupó su lugar.
      await p.goto(`${BASE}/admin/boletin?q=${encodeURIComponent(`.${tag}@`)}`);
      const row1 = p.locator('tbody tr', { hasText: `foco1.${tag}@example.co` });
      await row1.waitFor({ timeout: 10000 });
      await pressOn(row1.getByRole('button', { name: `Dar de baja foco1.${tag}@example.co` }));
      await p.getByRole('status').filter({ hasText: 'dado de baja' }).waitFor();
      await row1.waitFor({ state: 'detached' });
      await p.waitForTimeout(150);
      f = await focusInfo();
      if (f.label !== `foco2.${tag}@example.co`) failures.push(`boletín: tras la baja, foco en ${JSON.stringify(f)} (se esperaba la fila de foco2)`);
      await p.keyboard.press('Tab');
      f = await focusInfo();
      if (f.action !== 'toggle') failures.push(`boletín: el Tab siguiente fue a ${JSON.stringify(f)} (se esperaba «Dar de baja» de esa fila)`);

      // Inventario: ajustar con teclado → la tabla se recarga → foco de vuelta en «Ajustar» de la misma variante.
      await p.goto(`${BASE}/admin/inventario`);
      const inv = p.locator('tbody tr', { hasText: 'POL-M-NEG' });
      await inv.waitFor({ timeout: 10000 });
      await inv.getByLabel('Cantidad a ajustar POL-M-NEG').fill('2');
      await inv.getByLabel('Motivo del ajuste POL-M-NEG').fill(`foco ${tag}`);
      await pressOn(inv.getByRole('button', { name: 'Ajustar' }));
      await p.getByRole('status').filter({ hasText: 'POL-M-NEG: stock' }).waitFor({ timeout: 10000 });
      await p.waitForTimeout(150);
      f = await focusInfo();
      if (f.action !== 'adjust' || f.key == null) failures.push(`inventario: tras ajustar, foco en ${JSON.stringify(f)}`);
      else if (!(await inv.getByRole('button', { name: 'Ajustar' }).evaluate((el) => el === document.activeElement))) failures.push('inventario: el foco volvió a «Ajustar» de otra variante');
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.slice(0, 6).join(' · ')}`);
    }, browser);

    await journey('77. Admin con teclado: cambiar el estado de un pedido, despublicar un producto o desactivar un cupón que sale del filtro no deja el foco en <body> (D126)', async (p) => {
      // Ejecución 148 (D126): mismo criterio que D125 en pedidos (el modal se cierra y la tabla se recarga), productos y
      // cupones. Antes, si la fila salía del filtro, el foco caía en <body> y el siguiente Tab volvía a «Ir al contenido».
      const tag = crypto.randomBytes(3).toString('hex');
      const nums = [];
      for (const i of [1, 2]) {
        const r = await fetch(`${API_URL}/__synthetic-order`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ customer_name: `Foco ${tag} ${i}`, customer_email: `foco${i}.${tag}@correo.co`, status: 'paid' }) });
        nums.push((await r.json()).order_number);
      }
      const failures = [];
      const focusInfo = () => p.evaluate(() => {
        const a = document.activeElement;
        return { tag: a?.tagName, key: a?.getAttribute('data-row-key') || a?.closest('[data-row-key]')?.getAttribute('data-row-key') || null,
          label: a?.getAttribute('aria-label') || a?.textContent?.trim().slice(0, 60) || '', action: a?.getAttribute('data-row-action') || null };
      });
      const pressOn = async (loc) => { await loc.focus(); await p.keyboard.press('Enter'); };
      const settle = () => p.waitForTimeout(200);
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });

      // Pedidos en «Pagado» de este recorrido: el primero pasa a «En preparación» → sale del filtro → foco en el segundo.
      await p.goto(`${BASE}/admin/pedidos?estado=paid&q=${encodeURIComponent(tag)}`);
      const ord = (n) => p.locator('tbody tr', { hasText: n });
      await ord(nums[1]).waitFor({ timeout: 10000 });
      const first = (await ord(nums[0]).count()) ? 0 : 1;
      const [gone, stays] = first === 0 ? [nums[0], nums[1]] : [nums[1], nums[0]];
      await pressOn(ord(gone).getByRole('button', { name: 'GESTIONAR' }));
      await p.locator('#order-next-status').selectOption('processing');
      await pressOn(p.getByRole('button', { name: 'GUARDAR CAMBIOS' }));
      await p.locator('#order-next-status').waitFor({ state: 'detached' });
      await ord(gone).waitFor({ state: 'detached', timeout: 10000 });
      await ord(stays).waitFor();
      await settle();
      let f = await focusInfo();
      if (f.label !== `Pedido ${stays}`) failures.push(`pedidos: tras cambiar el estado, foco en ${JSON.stringify(f)} (se esperaba el pedido ${stays})`);
      await p.keyboard.press('Tab');
      f = await focusInfo();
      if (/Ir al contenido/i.test(f.label)) failures.push('pedidos: el siguiente Tab volvió a «Ir al contenido»');
      // el último: lista vacía → foco en el aviso de vacío
      await pressOn(ord(stays).getByRole('button', { name: 'GESTIONAR' }));
      await p.locator('#order-next-status').selectOption('processing');
      await pressOn(p.getByRole('button', { name: 'GUARDAR CAMBIOS' }));
      await p.getByText('No hay pedidos con estos filtros.').waitFor({ timeout: 10000 });
      await settle();
      f = await focusInfo();
      if (!/No hay pedidos/.test(f.label)) failures.push(`pedidos: con la lista vacía, foco en ${JSON.stringify(f)}`);
      // sin filtro de estado la fila sigue: foco de vuelta en «GESTIONAR» del mismo pedido
      await p.goto(`${BASE}/admin/pedidos?q=${encodeURIComponent(tag)}`);
      await ord(gone).waitFor({ timeout: 10000 });
      await pressOn(ord(gone).getByRole('button', { name: 'GESTIONAR' }));
      await p.locator('#order-next-status').selectOption('cancelled').catch(() => {});
      const opt = await p.locator('#order-next-status').inputValue();
      if (opt) {
        const t = await p.locator('#order-next-status option:checked').textContent();
        if (/motivo/.test(t || '')) await p.getByLabel('Nota del cambio').fill(`foco ${tag}`);
        await pressOn(p.getByRole('button', { name: 'GUARDAR CAMBIOS' }));
        await p.locator('#order-next-status').waitFor({ state: 'detached' });
        await p.getByRole('status').filter({ hasText: gone }).waitFor({ timeout: 10000 });
        await settle();
        f = await focusInfo();
        if (f.action !== 'open' || f.key == null) failures.push(`pedidos: con la fila presente, foco en ${JSON.stringify(f)} (se esperaba GESTIONAR)`);
        else if (!(await ord(gone).getByRole('button', { name: 'GESTIONAR' }).evaluate((el) => el === document.activeElement))) failures.push('pedidos: el foco volvió a GESTIONAR de otro pedido');
      } else failures.push('pedidos: «En preparación» no ofrece «Cancelado» en el sintético');

      // Productos en «Publicado»: despublicar el Polo → sale del filtro → foco en la fila que queda.
      await p.goto(`${BASE}/admin/productos?estado=active`);
      const prow = (name) => p.locator('tbody tr', { hasText: name });
      await prow('Polo Clásico').waitFor({ timeout: 10000 });
      await pressOn(prow('Polo Clásico').getByRole('button', { name: 'DESPUBLICAR' }));
      await prow('Polo Clásico').waitFor({ state: 'detached', timeout: 10000 });
      await settle();
      f = await focusInfo();
      if (f.label !== 'Producto Camiseta Básica') failures.push(`productos: tras despublicar, foco en ${JSON.stringify(f)} (se esperaba la fila de Camiseta Básica)`);
      // en «Borrador» publicarlo de nuevo (deja el catálogo como estaba) → lista vacía → aviso de vacío
      await p.goto(`${BASE}/admin/productos?estado=draft`);
      await prow('Polo Clásico').waitFor({ timeout: 10000 });
      await pressOn(prow('Polo Clásico').getByRole('button', { name: 'PUBLICAR' }));
      await p.getByText('No hay productos registrados').waitFor({ timeout: 10000 });
      await settle();
      f = await focusInfo();
      if (!/No hay productos/.test(f.label)) failures.push(`productos: con la lista vacía, foco en ${JSON.stringify(f)}`);

      // Cupones en «Inactivos»: activar LIQUIDACION → sale → aviso de vacío; en «Todos» la fila sigue → mismo botón.
      await p.goto(`${BASE}/admin/descuentos?estado=inactivos`);
      const crow = p.locator('tbody tr', { hasText: 'LIQUIDACION' });
      await crow.waitFor({ timeout: 10000 });
      await pressOn(crow.getByRole('button', { name: 'Activar' }));
      await p.getByText('No hay cupones con este filtro.').waitFor({ timeout: 10000 });
      await settle();
      f = await focusInfo();
      if (!/No hay cupones/.test(f.label)) failures.push(`cupones: con la lista vacía, foco en ${JSON.stringify(f)}`);
      await p.goto(`${BASE}/admin/descuentos`);
      await crow.waitFor({ timeout: 10000 });
      await pressOn(crow.getByRole('button', { name: 'Desactivar' }));
      await crow.getByRole('button', { name: 'Activar' }).waitFor({ timeout: 10000 });
      await settle();
      f = await focusInfo();
      if (f.action !== 'toggle' || f.label !== 'Activar') failures.push(`cupones: con la fila presente, foco en ${JSON.stringify(f)} (se esperaba «Activar» de LIQUIDACION)`);
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.slice(0, 6).join(' · ')}`);
    }, browser);

    await journey('78. Admin con teclado: eliminar una colección o restaurar una imagen de la portada no deja el foco en <body> (D127)', async (p) => {
      // Ejecución 149 (D127): la tarjeta eliminada (o el botón «Restaurar», que desaparece) se llevaba el foco.
      const tag = crypto.randomBytes(3).toString('hex');
      for (const i of [1, 2]) {
        await fetch(`${API_URL}/__synthetic-collection`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug: `foco-${tag}-${i}`, name: `Foco ${tag} ${i}`, sort_order: 90 + i }) });
      }
      await fetch(`${API_URL}/__synthetic-site-content`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'hero_main', alt_text: 'Hero foco' }) });
      const failures = [];
      const focusInfo = () => p.evaluate(() => {
        const a = document.activeElement;
        return { tag: a?.tagName, key: a?.getAttribute('data-row-key') || a?.closest('[data-row-key]')?.getAttribute('data-row-key') || null,
          label: a?.getAttribute('aria-label') || a?.textContent?.trim().slice(0, 60) || '' };
      });
      const pressOn = async (loc) => { await loc.focus(); await p.keyboard.press('Enter'); };
      await login(p, '/admin/login', 'admin@jm.test', 'Admin-Sintetico-1', 'INICIAR SESIÓN ADM');
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });

      await p.goto(`${BASE}/admin/colecciones`);
      const del = (i) => p.getByRole('button', { name: `Eliminar Foco ${tag} ${i}`, exact: true });
      await del(2).waitFor({ timeout: 10000 });
      await pressOn(del(1)); // el arnés acepta las confirmaciones nativas
      await del(1).waitFor({ state: 'detached', timeout: 10000 });
      await p.waitForTimeout(200);
      let f = await focusInfo();
      if (f.tag === 'BODY' || !/^Colección /.test(f.label)) failures.push(`colecciones: tras eliminar, foco en ${JSON.stringify(f)} (se esperaba la tarjeta que ocupó su lugar)`);
      await p.keyboard.press('Tab');
      f = await focusInfo();
      if (/Ir al contenido/i.test(f.label)) failures.push('colecciones: el siguiente Tab volvió a «Ir al contenido»');
      p.removeAllListeners('dialog');
      p.once('dialog', (d) => d.dismiss().catch(() => {}));
      await pressOn(del(2));
      await p.waitForTimeout(300);
      p.on('dialog', (d) => d.accept().catch(() => {}));
      f = await focusInfo();
      if (f.label !== `Eliminar Foco ${tag} 2`) failures.push(`colecciones: al cancelar, foco en ${JSON.stringify(f)}`);
      await pressOn(del(2));
      await del(2).waitFor({ state: 'detached', timeout: 10000 });

      await p.goto(`${BASE}/admin/imagenes`); await expectText(p, 'IMÁGENES'); await p.waitForLoadState('networkidle');
      const restore = p.getByRole('button', { name: 'Restaurar imagen Banner principal (Hero)' });
      await pressOn(restore);
      const dlg = p.getByRole('dialog', { name: 'Confirmar restauración' });
      await pressOn(dlg.getByRole('button', { name: 'Restaurar', exact: true }));
      await restore.waitFor({ state: 'detached', timeout: 10000 });
      await p.waitForTimeout(200);
      f = await focusInfo();
      if (f.label !== 'Cambiar imagen Banner principal (Hero)') failures.push(`imágenes: tras restaurar, foco en ${JSON.stringify(f)} (se esperaba «Cambiar» del Hero)`);
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    }, browser);

    await journey('79. Tienda con teclado: quitar líneas del carrito, cambiar su talla o quitar un favorito no deja el foco en <body> (D128)', async (p) => {
      // Ejecución 150 (D128): la línea (o la tarjeta) se desmontaba con el botón pulsado y el foco caía en <body>; al
      // cambiar la talla la línea cambia de id y el selector se remontaba sin foco.
      const failures = [];
      const focusInfo = () => p.evaluate(() => {
        const a = document.activeElement;
        return { tag: a?.tagName, key: a?.getAttribute('data-row-key') || a?.closest('[data-row-key]')?.getAttribute('data-row-key') || null,
          action: a?.getAttribute('data-row-action') || null, label: a?.getAttribute('aria-label') || a?.textContent?.trim().slice(0, 60) || '' };
      });
      const pressOn = async (loc) => { await loc.focus(); await p.keyboard.press('Enter'); };
      const settle = () => p.waitForTimeout(200);
      const line = (name) => p.locator('.cart-line', { hasText: name });

      // /carrito
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/carrito`);
      await line('Polo Clásico').waitFor({ timeout: 10000 });
      const size = p.getByLabel('Talla de Camiseta Básica');
      await p.waitForFunction(() => { const el = document.querySelector('select[aria-label="Talla de Camiseta Básica"]'); return el && !el.disabled && el.options.length > 1; }, null, { timeout: 10000 }).catch(() => {});
      const other = await size.evaluate((el) => [...el.options].find((o) => !o.disabled && o.value !== el.value)?.value ?? null);
      if (!other) failures.push('carrito: la Camiseta no ofrece otra talla con stock');
      else {
        await size.focus();
        await size.selectOption(other);
        await p.waitForFunction((v) => document.querySelector('select[aria-label="Talla de Camiseta Básica"]')?.value === v, other, { timeout: 10000 });
        await settle();
        const f = await focusInfo();
        if (f.label !== 'Talla de Camiseta Básica') failures.push(`carrito: tras cambiar la talla, foco en ${JSON.stringify(f)} (se esperaba el selector de talla)`);
      }
      await pressOn(line('Camiseta Básica').getByRole('button', { name: 'Eliminar', exact: true }));
      await line('Camiseta Básica').waitFor({ state: 'detached', timeout: 10000 });
      await settle();
      let f = await focusInfo();
      if (!(await line('Polo Clásico').evaluate((el) => el === document.activeElement))) failures.push(`carrito: tras eliminar, foco en ${JSON.stringify(f)} (se esperaba la línea del Polo)`);
      await p.keyboard.press('Tab');
      f = await focusInfo();
      if (/Ir al contenido/i.test(f.label)) failures.push('carrito: el siguiente Tab volvió a «Ir al contenido»');
      await pressOn(line('Polo Clásico').getByRole('button', { name: 'Guardar para después' }));
      await p.getByText('Tu carrito está actualmente vacío').waitFor({ timeout: 10000 });
      await settle();
      f = await focusInfo();
      if (!/actualmente vac/.test(f.label)) failures.push(`carrito: con el carrito vacío, foco en ${JSON.stringify(f)}`);

      // carrito lateral (se abre al agregar)
      await addToCart(p, 'camiseta-basica', 'M', 'Negro');
      await addToCart(p, 'polo-clasico', 'M');
      const drawer = p.getByRole('dialog').filter({ has: p.locator('.drawer-line') });
      await drawer.locator('.drawer-line', { hasText: 'Polo Clásico' }).waitFor({ timeout: 10000 });
      await pressOn(drawer.getByRole('button', { name: 'Eliminar Camiseta Básica del carrito' }));
      await drawer.locator('.drawer-line', { hasText: 'Camiseta Básica' }).waitFor({ state: 'detached', timeout: 10000 });
      await settle();
      if (!(await drawer.locator('.drawer-line', { hasText: 'Polo Clásico' }).evaluate((el) => el.contains(document.activeElement)))) failures.push(`carrito lateral: tras eliminar, foco en ${JSON.stringify(await focusInfo())}`);
      await pressOn(drawer.getByRole('button', { name: 'Eliminar Polo Clásico del carrito' }));
      await p.getByText('Tu carrito está vacío', { exact: true }).waitFor({ timeout: 10000 });
      await settle();
      f = await focusInfo();
      if (f.label !== 'Tu carrito está vacío') failures.push(`carrito lateral: vacío, foco en ${JSON.stringify(f)}`);
      await p.keyboard.press('Escape');

      // /cuenta/favoritos (el Polo quedó guardado con «Guardar para después»)
      await p.goto(`${BASE}/ropa`);
      await p.getByRole('button', { name: 'Guardar en favoritos: Camiseta Básica' }).first().click();
      await p.goto(`${BASE}/cuenta/favoritos`);
      const card = (name) => p.getByTestId('wishlist-item').filter({ hasText: name });
      await card('Polo Clásico').waitFor({ timeout: 10000 });
      await pressOn(p.getByRole('button', { name: 'Quitar de favoritos: Camiseta Básica' }));
      await card('Camiseta Básica').waitFor({ state: 'detached', timeout: 10000 });
      await settle();
      const onPolo = await card('Polo Clásico').evaluate((el) => document.activeElement === el);
      if (!onPolo) failures.push(`favoritos: tras quitar, foco en ${JSON.stringify(await focusInfo())} (se esperaba la tarjeta del Polo, no su corazón)`);
      await pressOn(p.getByRole('button', { name: 'Quitar de favoritos: Polo Clásico' }));
      await p.getByText('No tienes productos guardados en favoritos').waitFor({ timeout: 10000 });
      await settle();
      f = await focusInfo();
      if (!/No tienes productos guardados/.test(f.label)) failures.push(`favoritos: vacía, foco en ${JSON.stringify(f)}`);
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    }, browser);

    await journey('80. Teclado: quitar el cupón y «Cancelar pedido» (checkout, confirmación, «Mis pedidos») no dejan el foco en <body> (D129)', async (p) => {
      // Ejecución 151 (D129): los cuatro botones desaparecen (o quedan deshabilitados) al usarse y el foco caía en <body>.
      const failures = [];
      const focusInfo = () => p.evaluate(() => {
        const a = document.activeElement;
        return { tag: a?.tagName, testid: a?.getAttribute('data-testid'), order: a?.getAttribute('data-order-id'), label: a?.getAttribute('aria-label') || a?.textContent?.trim().slice(0, 60) || '' };
      });
      const pressOn = async (loc) => { await loc.focus(); await p.keyboard.press('Enter'); };
      const settle = () => p.waitForTimeout(250);
      const nextTabNotSkip = async (where) => {
        await p.keyboard.press('Tab');
        const f = await focusInfo();
        if (f.tag === 'BODY' || /Ir al contenido/i.test(f.label)) failures.push(`${where}: el siguiente Tab fue a ${JSON.stringify(f)}`);
      };
      p.on('dialog', (d) => d.accept().catch(() => {}));

      // /carrito: quitar el cupón → campo del código
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/carrito`);
      const cup = p.getByLabel('Código del cupón');
      await cup.waitFor({ timeout: 10000 });
      await cup.fill('JM10'); await cup.press('Enter');
      const quitar = p.getByRole('button', { name: 'Quitar cupón' });
      await quitar.waitFor({ timeout: 10000 });
      await pressOn(quitar);
      await cup.waitFor({ timeout: 10000 });
      await settle();
      if (!(await cup.evaluate((el) => el === document.activeElement))) failures.push(`cupón: tras quitarlo, foco en ${JSON.stringify(await focusInfo())} (se esperaba el campo del código)`);

      // cuenta + pedido pendiente
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Lía Mora');
      await p.locator('input[type=email]').fill('lia.mora@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      const placeOrder = async () => {
        await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'lia.mora@correo.co' });
        await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click();
        await p.waitForURL(/\/checkout\/confirmacion/, { timeout: 20000 });
        await expectText(p, 'Pedido registrado');
      };

      // checkout: «Cancelar ese pedido» del aviso → confirmación «Pedido … cancelado»
      await placeOrder();
      await p.goto(`${BASE}/checkout`);
      const pcancel = p.getByTestId('pending-order-cancel');
      await pcancel.waitFor({ timeout: 10000 });
      await pressOn(pcancel);
      await p.getByTestId('pending-order-cancelled').waitFor({ timeout: 10000 });
      await settle();
      let f = await focusInfo();
      if (f.testid !== 'pending-order-cancelled') failures.push(`checkout: tras cancelar el pedido anterior, foco en ${JSON.stringify(f)}`);
      else await nextTabNotSkip('checkout');

      // confirmación: «Cancelar pedido» → título
      await placeOrder();
      await pressOn(p.getByRole('button', { name: 'Cancelar pedido', exact: true }));
      await expectText(p, 'Este pedido fue cancelado.', 10000);
      await settle();
      f = await focusInfo();
      if (f.tag !== 'H1') failures.push(`confirmación: tras cancelar, foco en ${JSON.stringify(f)} (se esperaba el título)`);
      else await nextTabNotSkip('confirmación');

      // «Mis pedidos»: «Cancelar pedido» → tarjeta del pedido
      await placeOrder();
      const mine = (await state()).orders.find((o) => o.customer_email === 'lia.mora@correo.co' && o.status === 'payment_pending');
      await p.goto(`${BASE}/cuenta/pedidos`);
      const card = p.locator(`[data-order-id="${mine.id}"]`);
      await card.getByTestId('order-cancel').waitFor({ timeout: 10000 });
      await pressOn(card.getByTestId('order-cancel'));
      await card.getByTestId('order-cancel').waitFor({ state: 'detached', timeout: 10000 });
      await settle();
      f = await focusInfo();
      if (f.order !== mine.id) failures.push(`«Mis pedidos»: tras cancelar, foco en ${JSON.stringify(f)} (se esperaba la tarjeta del pedido)`);
      else await nextTabNotSkip('«Mis pedidos»');
      const st = await state();
      const notCancelled = st.orders.filter((o) => o.customer_email === 'lia.mora@correo.co' && o.status !== 'cancelled');
      if (notCancelled.length) failures.push(`pedidos sin cancelar: ${notCancelled.map((o) => `${o.order_number}/${o.status}`).join(', ')}`);
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    }, browser);

    await journey('81. Teclado: «Aumentar cantidad» al tope, «Guardar datos» (boletín) y «Enviar opinión» no dejan el foco en <body> (D130)', async (p) => {
      // Ejecución 152 (D130): botones que se deshabilitan (al llegar al stock o mientras guardan) o desaparecen al
      // terminar: Chromium les quita el foco y el siguiente Tab iba a «Ir al contenido».
      const failures = [];
      const focusInfo = () => p.evaluate(() => {
        const a = document.activeElement;
        return { tag: a?.tagName, testid: a?.getAttribute('data-testid'), label: a?.getAttribute('aria-label') || a?.textContent?.trim().slice(0, 60) || '' };
      });
      const settle = () => p.waitForTimeout(250);
      const nextTabNotSkip = async (where) => {
        await p.keyboard.press('Tab');
        const f = await focusInfo();
        if (f.tag === 'BODY' || /Ir al contenido/i.test(f.label)) failures.push(`${where}: el siguiente Tab fue a ${JSON.stringify(f)}`);
      };

      // ficha: «Aumentar cantidad» con Enter hasta el stock disponible → el foco pasa a «Disminuir cantidad»
      await p.goto(`${BASE}/producto/camiseta-basica`);
      await p.getByRole('button', { name: 'Talla M', exact: true }).click(); // negro M: 5 en stock
      const inc = p.getByRole('button', { name: 'Aumentar cantidad', exact: true });
      if (await inc.isDisabled()) failures.push('cantidad: «Aumentar» deshabilitado desde el inicio (fixture sin stock)');
      await inc.focus();
      for (let i = 0; i < 12 && !(await inc.isDisabled()); i += 1) { await p.keyboard.press('Enter'); await p.waitForTimeout(60); }
      if (!(await inc.isDisabled())) failures.push('cantidad: «Aumentar» nunca llegó al tope');
      await settle();
      let f = await focusInfo();
      if (f.label !== 'Disminuir cantidad') failures.push(`cantidad: al llegar al tope, foco en ${JSON.stringify(f)} (se esperaba «Disminuir cantidad»)`);
      else await nextTabNotSkip('cantidad');

      // cuenta: alta y baja del boletín con «Guardar datos» → el foco vuelve al botón
      await p.goto(`${BASE}/login`);
      await p.getByRole('button', { name: 'Crear cuenta' }).click();
      await p.getByPlaceholder(/Juan/i).first().fill('Nora Paz');
      await p.locator('input[type=email]').fill('nora.paz@correo.co'); await p.locator('input[type=password]').fill('Clave-Segura-1');
      await p.locator('button[type=submit]').click();
      await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')), null, { timeout: 10000 });
      await p.goto(`${BASE}/cuenta`);
      const perfil = p.getByTestId('profile-section');
      const box = perfil.locator('input[name=marketing_opt_in]');
      await box.waitFor({ timeout: 10000 });
      await p.waitForFunction(() => !document.querySelector('[data-testid="profile-section"] input[name=marketing_opt_in]')?.disabled, null, { timeout: 10000 });
      const guardar = perfil.getByRole('button', { name: 'Guardar datos' });
      for (const [want, text] of [[true, 'Quedaste suscrito'], [false, 'Te diste de baja']]) {
        if ((await box.isChecked()) !== want) { await box.focus(); await p.keyboard.press('Space'); }
        await guardar.focus(); await p.keyboard.press('Enter');
        await perfil.getByText(text).waitFor({ timeout: 10000 });
        await settle();
        f = await focusInfo();
        if (f.label !== 'Guardar datos') failures.push(`boletín (${want ? 'alta' : 'baja'}): tras guardar, foco en ${JSON.stringify(f)}`);
        else await nextTabNotSkip(`boletín (${want ? 'alta' : 'baja'})`);
      }

      // ficha: «Enviar opinión» de la única compra → el formulario desaparece y el foco va al aviso «¡Gracias!…»
      await addToCart(p, 'polo-clasico', 'M');
      await p.goto(`${BASE}/checkout`); await fillCheckout(p, { email: 'nora.paz@correo.co' });
      await p.getByRole('button', { name: 'CONFIRMAR Y PAGAR' }).click(); await p.waitForURL(/\/checkout\/confirmacion/, { timeout: 20000 });
      const mine = (await state()).orders.find((o) => o.customer_email === 'nora.paz@correo.co');
      await fetch(`${API_URL}/__synthetic-mark-paid/${mine.order_number}`);
      await p.goto(`${BASE}/producto/polo-clasico`);
      const caja = p.getByTestId('review-form'); await caja.getByText(mine.order_number).waitFor({ timeout: 10000 });
      await caja.getByRole('button', { name: '5 de 5 estrellas' }).click();
      await caja.getByLabel('Título').fill('Muy buena');
      await caja.getByLabel('Comentario').fill('La tela es suave y la talla es la esperada.');
      const send = caja.getByRole('button', { name: 'Enviar opinión' });
      await send.focus(); await p.keyboard.press('Enter');
      await caja.getByText('¡Gracias! Recibimos tu opinión').waitFor({ timeout: 10000 });
      await settle();
      f = await focusInfo();
      if (!/¡Gracias! Recibimos tu opinión/.test(f.label)) failures.push(`opinión: tras enviarla, foco en ${JSON.stringify(f)} (se esperaba el aviso)`);
      else await nextTabNotSkip('opinión');
      if (failures.length) throw new Error(`${failures.length} fallos: ${failures.join(' · ')}`);
    }, browser);

    await browser.close();
  } finally { await stop(); }
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(WEB, 'e2e', 'last-synthetic-result.json'), JSON.stringify({ when: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2));
  console.log(`\nE2E sintético: ${results.length - failed.length}/${results.length} recorridos OK`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
