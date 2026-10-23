// La onda de la voz, como la del Jarvis del video: barras que se mueven con
// el nivel REAL del audio que está sonando (src/lib/vozJarvis.js lo mide con
// Web Audio). Si la voz es la del sistema no hay nivel que medir, y las barras
// respiran suave para que se vea que está hablando.
//
// Se pinta con refs y requestAnimationFrame, no con estado: 60 renders de
// React por segundo para mover unas barras sería pagar caro un adorno.
import React, { useEffect, useRef } from 'react';
import { alNivelVoz, nivelVoz } from '@/lib/vozJarvis';

export default function OndaVoz({ activa, barras = 24, alto = 40 }) {
  const refs = useRef([]);
  const nivelRef = useRef(0);

  useEffect(() => alNivelVoz((n) => { nivelRef.current = n; }), []);

  useEffect(() => {
    if (!activa) {
      refs.current.forEach((b) => { if (b) b.style.height = '3px'; });
      return undefined;
    }
    let raf = 0;
    const t0 = performance.now();
    const pintar = (ahora) => {
      const t = (ahora - t0) / 1000;
      const real = Math.max(nivelRef.current, nivelVoz());
      // Sin nivel medible (voz del sistema): un vaivén suave.
      const base = real > 0.02 ? real : 0.18 + 0.1 * Math.sin(t * 5);
      refs.current.forEach((b, i) => {
        if (!b) return;
        const centro = 1 - Math.abs(i - (barras - 1) / 2) / (barras / 2);   // más altas al medio
        const ruido = 0.55 + 0.45 * Math.sin(t * 9 + i * 1.7) * Math.cos(t * 4.3 + i * 0.6);
        const h = Math.max(3, Math.min(alto, alto * base * (0.35 + 0.65 * centro) * (0.6 + ruido)));
        b.style.height = `${h.toFixed(1)}px`;
      });
      raf = requestAnimationFrame(pintar);
    };
    raf = requestAnimationFrame(pintar);
    return () => cancelAnimationFrame(raf);
  }, [activa, barras, alto]);

  return (
    <div className="flex items-center justify-center gap-[3px]" style={{ height: alto }} aria-hidden="true">
      {Array.from({ length: barras }, (_, i) => (
        <span
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="w-[3px] rounded-full bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.8)]"
          style={{ height: 3, opacity: activa ? 0.9 : 0.25, transition: 'opacity 300ms' }}
        />
      ))}
    </div>
  );
}
