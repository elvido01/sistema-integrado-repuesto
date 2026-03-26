import './index.css';
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';


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