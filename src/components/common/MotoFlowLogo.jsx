import React from 'react';
import { motion } from 'framer-motion';

/**
 * MotoFlowLogo — Logo oficial de la plataforma SaaS MotoFlow.
 * SVG inline del logo con la M estilizada con flecha ascendente.
 * @param {'sm' | 'md' | 'lg'} size — Tamaño del logo
 * @param {boolean} showText — Mostrar nombre "MotoFlow" 
 * @param {boolean} showSlogan — Mostrar eslogan debajo
 */
const MotoFlowLogo = ({ size = 'md', showText = true, showSlogan = false, className = '' }) => {
  const sizes = {
    sm: { icon: 24, gap: 'gap-1.5' },
    md: { icon: 36, gap: 'gap-2' },
    lg: { icon: 64, gap: 'gap-3' },
  };

  const s = sizes[size] || sizes.md;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex items-center ${s.gap} ${className}`}
    >
      <img 
        src="/logo completo.png" 
        alt="MotoFlow Logo" 
        className="object-contain"
        style={{ height: s.icon }}
        onError={(e) => {
          // Fallback visual si la imagen aún no se ha subido
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'flex';
        }}
      />
      {/* SVG Fallback */}
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 hidden"
      >
        <defs>
          <linearGradient id="mf-grad-1" x1="0" y1="48" x2="48" y2="0">
            <stop offset="0%" stopColor="#1e40af" />
            <stop offset="50%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        <path
          d="M6 38V14L16 26L24 16L32 26L42 14V38"
          stroke="url(#mf-grad-1)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

    </motion.div>
  );
};

export default MotoFlowLogo;
