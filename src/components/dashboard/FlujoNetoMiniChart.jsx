import React, { useLayoutEffect, useRef, useState } from 'react';
import { formatCurrencyDOP } from '@/lib/flujoNeto';

// -----------------------------------------------------------------------
// Mini grafico comparativo (SVG inline, sin librerias externas).
// Dos series acumuladas por dia del mes: mes actual (verde) vs mes
// anterior (azul). Soporta valores negativos (linea en cero), se adapta
// al ancho del contenedor y muestra un tooltip al pasar el mouse.
// -----------------------------------------------------------------------

const HEIGHT = 84;
const PAD_Y = 10;
const COLOR_ACTUAL = '#059669';   // emerald-600
const COLOR_ANTERIOR = '#2563eb'; // blue-600

const FlujoNetoMiniChart = ({ seriesActual = [], seriesAnterior = [], diasEnMes = 30 }) => {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(300);
  const [hover, setHover] = useState(null); // { x, dia, actual, anterior }

  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => setWidth(el.clientWidth || 300);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxDia = Math.max(diasEnMes || 30, 2);
  const allVals = [
    ...seriesActual.map((p) => Number(p.valor) || 0),
    ...seriesAnterior.map((p) => Number(p.valor) || 0),
    0,
  ];
  let min = Math.min(...allVals);
  let max = Math.max(...allVals);
  if (min === max) { min -= 1; max += 1; } // evitar division por cero

  const xFor = (dia) => ((Math.min(dia, maxDia) - 1) / (maxDia - 1)) * width;
  const yFor = (val) => {
    const t = (val - min) / (max - min);
    return HEIGHT - PAD_Y - t * (HEIGHT - PAD_Y * 2);
  };
  const y0 = yFor(0);

  const toLine = (pts) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.dia).toFixed(1)} ${yFor(Number(p.valor) || 0).toFixed(1)}`).join(' ');

  const areaPath = (pts) => {
    if (!pts.length) return '';
    const line = pts.map((p) => `L ${xFor(p.dia).toFixed(1)} ${yFor(Number(p.valor) || 0).toFixed(1)}`).join(' ');
    return `M ${xFor(pts[0].dia).toFixed(1)} ${y0.toFixed(1)} ${line} L ${xFor(pts[pts.length - 1].dia).toFixed(1)} ${y0.toFixed(1)} Z`;
  };

  const valorEnDia = (serie, dia) => {
    // ultimo punto con dia <= objetivo (serie acumulada)
    let v = null;
    for (const p of serie) { if (p.dia <= dia) v = Number(p.valor) || 0; }
    return v;
  };

  const handleMove = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || width <= 0) return;
    const px = e.clientX - rect.left;
    const dia = Math.min(maxDia, Math.max(1, Math.round((px / width) * (maxDia - 1)) + 1));
    setHover({
      x: xFor(dia),
      dia,
      actual: valorEnDia(seriesActual, dia),
      anterior: valorEnDia(seriesAnterior, dia),
    });
  };

  const hasData = seriesActual.length > 0 || seriesAnterior.length > 0;

  return (
    <div ref={wrapRef} className="relative w-full select-none" style={{ height: HEIGHT }}>
      {!hasData ? (
        <div className="flex h-full items-center justify-center text-[11px] text-slate-400 italic">
          Sin movimientos este mes
        </div>
      ) : (
        <>
          <svg
            width={width}
            height={HEIGHT}
            className="block"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
          >
            {/* linea en cero (si hay negativos) */}
            {min < 0 && max > 0 && (
              <line x1="0" y1={y0} x2={width} y2={y0} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
            )}

            {/* mes anterior (azul) */}
            {seriesAnterior.length > 0 && (
              <path d={toLine(seriesAnterior)} fill="none" stroke={COLOR_ANTERIOR} strokeWidth="1.75"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.85" />
            )}

            {/* mes actual (verde, con area) */}
            {seriesActual.length > 0 && (
              <>
                <path d={areaPath(seriesActual)} fill={COLOR_ACTUAL} opacity="0.08" />
                <path d={toLine(seriesActual)} fill="none" stroke={COLOR_ACTUAL} strokeWidth="2.25"
                  strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </>
            )}

            {/* guia + puntos del hover */}
            {hover && (
              <>
                <line x1={hover.x} y1="0" x2={hover.x} y2={HEIGHT} stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
                {hover.anterior !== null && (
                  <circle cx={hover.x} cy={yFor(hover.anterior)} r="2.5" fill={COLOR_ANTERIOR} />
                )}
                {hover.actual !== null && (
                  <circle cx={hover.x} cy={yFor(hover.actual)} r="3" fill={COLOR_ACTUAL} />
                )}
              </>
            )}
          </svg>

          {hover && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] shadow-md"
              style={{ left: Math.min(Math.max(hover.x, 46), width - 46), top: -4 }}
            >
              <div className="font-bold text-slate-500">Día {hover.dia}</div>
              <div className="flex items-center gap-1 text-emerald-600 font-semibold">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
                {hover.actual !== null ? formatCurrencyDOP(hover.actual, { decimals: 0 }) : '—'}
              </div>
              <div className="flex items-center gap-1 text-blue-600 font-semibold">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-600" />
                {hover.anterior !== null ? formatCurrencyDOP(hover.anterior, { decimals: 0 }) : '—'}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FlujoNetoMiniChart;
