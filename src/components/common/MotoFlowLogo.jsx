import React from 'react';
import { motion } from 'framer-motion';

// PNG sin fondo en public/. El icono es la "M" sola, para espacios chicos
// y como logo por defecto de las empresas que no han subido el suyo.
export const LOGO_MOTOFLOW = '/logo-motoflow.png';
export const ICONO_MOTOFLOW = '/logo-motoflow-icono.png';

/**
 * MotoFlowLogo — Logo oficial de la plataforma MotoFlow.
 * @param {'sm' | 'md' | 'lg'} size
 * @param {boolean} showText — false = solo la "M"
 */
const MotoFlowLogo = ({ size = 'md', showText = true, className = '' }) => {
  const alturas = showText
    ? { sm: 28, md: 44, lg: 72 }   // logo completo (lleva el eslogan)
    : { sm: 24, md: 36, lg: 64 };
  const alto = alturas[size] || alturas.md;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex items-center ${className}`}
    >
      <img
        src={showText ? LOGO_MOTOFLOW : ICONO_MOTOFLOW}
        alt="MotoFlow"
        className="object-contain max-w-full"
        style={{ height: alto }}
      />
    </motion.div>
  );
};

export default MotoFlowLogo;
