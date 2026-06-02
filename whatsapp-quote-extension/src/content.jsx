import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { styles } from './styles.js';

const ROOT_ID = 'motoflow-whatsapp-quote-root';

function mount() {
  if (document.getElementById(ROOT_ID)) return;

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
