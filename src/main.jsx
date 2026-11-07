import './index.css';
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import { instalarRegistroErrores } from '@/lib/registroErrores';

// Errores no controlados → errores_app (solo los lee el superadmin).
instalarRegistroErrores();

// (07/11/2026) Pestaña abierta desde antes de una publicación de hace más de
// 2 días (scripts/conservar-assets.mjs): ya no están los archivos que pide.
// NO se recarga sola (tumbaría una venta a medias): se avisa y la persona
// decide cuándo presionar F5. Antes salía "Failed to fetch dynamically
// imported module …" en el cuadro rojo.
window.addEventListener('vite:preloadError', () => {
  if (document.getElementById('aviso-version-nueva')) return;
  const aviso = document.createElement('div');
  aviso.id = 'aviso-version-nueva';
  aviso.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;background:#1e40af;color:#fff;'
    + 'padding:12px 18px;border-radius:12px;font:600 14px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:92vw;text-align:center';
  aviso.textContent = 'Hay una versión nueva del sistema. Termine lo que está haciendo y presione F5 para actualizar.';
  document.body.appendChild(aviso);
});


// Version marker for debugging deployment updates
console.log("%c MotoFlow - VERSION: 2024-02-21-v1 (Formula Fix) ", "background: #222; color: #bada55; font-size: 16px; font-weight: bold;");

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
)