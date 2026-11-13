// @vitest-environment jsdom
// DialogPanel (D71): foco inicial dentro, Tab no escapa, Escape cierra solo el de arriba, el foco vuelve al que abrió.
import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { DialogPanel } from '../components/Common/DialogPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

const key = (k, opts = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts });
  (document.activeElement || document.body).dispatchEvent(ev);
  return ev;
};

const Harness = ({ withAutoFocus = false, nested = false }) => {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <div>
      <button type="button" id="before">antes</button>
      <button type="button" id="opener" onClick={() => setOpen(true)}>abrir</button>
      {open && (
        <DialogPanel aria-label="Prueba" onClose={() => setOpen(false)}>
          {withAutoFocus ? <input id="auto" autoFocus /> : null}
          <button type="button" id="first">uno</button>
          <button type="button" id="inner-open" onClick={() => setInner(true)}>dos</button>
          <button type="button" id="last" onClick={() => setOpen(false)}>cerrar</button>
          {nested && inner && (
            <DialogPanel aria-label="Interior" onClose={() => setInner(false)}>
              <button type="button" id="inner-btn">interior</button>
            </DialogPanel>
          )}
        </DialogPanel>
      )}
    </div>
  );
};

const click = (id) => act(() => { document.getElementById(id).click(); });
const openFromOpener = () => { document.getElementById('opener').focus(); click('opener'); };

describe('DialogPanel', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('expone role=dialog con aria-modal y mueve el foco al primer control', () => {
    act(() => root.render(<Harness />));
    openFromOpener();
    const dlg = document.querySelector('[role="dialog"]');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.getAttribute('aria-label')).toBe('Prueba');
    expect(document.activeElement.id).toBe('first');
  });

  it('respeta el autoFocus de los hijos', () => {
    act(() => root.render(<Harness withAutoFocus />));
    openFromOpener();
    expect(document.activeElement.id).toBe('auto');
  });

  it('Tab y Mayús+Tab dan la vuelta dentro del panel', () => {
    act(() => root.render(<Harness />));
    openFromOpener();
    document.getElementById('last').focus();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe('first');
    expect(key('Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe('last');
    // Un Tab desde fuera del panel vuelve a entrar.
    document.getElementById('before').focus();
    key('Tab');
    expect(document.activeElement.id).toBe('first');
  });

  it('Escape cierra y el foco vuelve al control que abrió', () => {
    act(() => root.render(<Harness />));
    openFromOpener();
    act(() => { key('Escape'); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement.id).toBe('opener');
  });

  it('cerrar con un botón interno también devuelve el foco', () => {
    act(() => root.render(<Harness />));
    openFromOpener();
    click('last');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement.id).toBe('opener');
  });

  it('con dos paneles, Escape cierra solo el de arriba', () => {
    act(() => root.render(<Harness nested />));
    openFromOpener();
    document.getElementById('inner-open').focus();
    click('inner-open');
    expect(document.activeElement.id).toBe('inner-btn');
    act(() => { key('Escape'); });
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
    expect(document.activeElement.id).toBe('inner-open');
    act(() => { key('Escape'); });
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
    expect(document.activeElement.id).toBe('opener');
  });
});
