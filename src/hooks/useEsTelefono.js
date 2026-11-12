// (11/11/2026) ¿La pantalla es de teléfono? Ventas cambia a la vista de
// teléfono (tarjetas grandes + barra de cobro abajo) sin tocar la lógica de
// la factura. Teléfono = menos de 768 px de ancho, o un teléfono acostado
// (táctil y bajito). Tabletas y computadoras siguen con la vista completa.
import { useEffect, useState } from 'react';

const CONSULTA = '(max-width: 767px), (hover: none) and (pointer: coarse) and (max-height: 500px)';

const medir = () => {
  try { return typeof window !== 'undefined' && !!window.matchMedia?.(CONSULTA).matches; } catch { return false; }
};

export function useEsTelefono() {
  const [es, setEs] = useState(medir);
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(CONSULTA); } catch { return undefined; }
    const cambio = () => setEs(mq.matches);
    cambio();
    // Safari viejo (iPhone con iOS < 14) solo tiene addListener.
    if (mq.addEventListener) mq.addEventListener('change', cambio); else mq.addListener?.(cambio);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', cambio); else mq.removeListener?.(cambio); };
  }, []);
  return es;
}

// La persona puede pedir la vista completa en su teléfono (y volver). Se
// recuerda en ese aparato; si el navegador no deja guardar, vale solo ahora.
const CLAVE = 'ventas_vista_completa';
export function leerVistaCompleta() {
  try { return localStorage.getItem(CLAVE) === '1'; } catch { return false; }
}
export function guardarVistaCompleta(v) {
  try { localStorage.setItem(CLAVE, v ? '1' : '0'); } catch { /* solo esta vez */ }
}
