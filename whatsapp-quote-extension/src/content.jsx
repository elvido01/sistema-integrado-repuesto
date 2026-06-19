import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { styles } from './styles.js';

const ROOT_ID = 'motoflow-whatsapp-quote-root';
const LAYOUT_STYLE_ID = 'motoflow-layout-style';

// Cuando el panel esta abierto, encogemos WhatsApp Web para que la
// conversacion se vea completa al lado del panel (no debajo).
function injectLayoutStyle() {
  if (document.getElementById(LAYOUT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = LAYOUT_STYLE_ID;
  style.textContent = `
    html.mf-panel-open #app {
      width: calc(100% - 410px) !important;
      transition: width 0.15s ease;
    }
  `;
  document.head.appendChild(style);
}

function mount() {
  if (document.getElementById(ROOT_ID)) return;

  injectLayoutStyle();

  const host = document.createElement('div');
  host.id = ROOT_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = styles;

  const appRoot = document.createElement('div');
  appRoot.id = 'motoflow-quote-app';

  shadow.append(style, appRoot);
  createRoot(appRoot).render(<App />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
