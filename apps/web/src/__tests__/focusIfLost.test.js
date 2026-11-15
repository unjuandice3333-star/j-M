// @vitest-environment jsdom
// Ejecución 152 (D130): helper que devuelve el foco solo si se perdió.
import { describe, it, expect, beforeEach } from 'vitest';
import { focusIfLost, focusLost } from '../utils/focusIfLost';

let host;
beforeEach(() => { document.body.innerHTML = ''; host = document.createElement('div'); document.body.appendChild(host); });
const btn = (text) => { const b = document.createElement('button'); b.textContent = text; host.appendChild(b); return b; };

describe('focusIfLost', () => {
  it('con el foco en <body> enfoca el primer candidato usable (salta deshabilitados y desconectados)', () => {
    const a = btn('a'); a.disabled = true;
    const gone = document.createElement('button');
    const c = btn('c');
    expect(focusIfLost([a, gone, null, c])).toBe(c);
    expect(document.activeElement).toBe(c);
  });
  it('no arrastra el foco si el usuario ya está en otro control', () => {
    const other = btn('otro'); const target = btn('destino');
    other.focus();
    expect(focusIfLost(target)).toBeNull();
    expect(document.activeElement).toBe(other);
  });
  it('trata como perdido el foco en el control de origen que quedó deshabilitado', () => {
    const inc = btn('+'); const dec = btn('-');
    inc.focus(); inc.disabled = true;
    expect(focusLost(document, inc)).toBe(true);
    expect(focusIfLost(dec, { from: inc })).toBe(dec);
  });
  it('a un elemento no enfocable (aviso) le da tabindex=-1', () => {
    const note = document.createElement('div'); note.textContent = 'Gracias'; host.appendChild(note);
    expect(focusIfLost(note)).toBe(note);
    expect(note.getAttribute('tabindex')).toBe('-1');
  });
});
