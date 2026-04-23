import React from 'react';
import { motion } from 'framer-motion';
import MotoFlowLogo from '@/components/common/MotoFlowLogo';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * Logo — Muestra el logo del tenant activo.
 * - Si el tenant tiene logo_url: muestra su imagen.
 * - Si el tenant tiene nombre pero no logo: muestra el nombre como texto.
 * - Si no hay tenant (superadmin sin tenant): muestra el logo de MotoFlow.
 *
 * @param {string} variant - 'default' | 'light' (light = white text for dark backgrounds)
 */
const Logo = ({ size = 'default', variant = 'default' }) => {
  const { empresa } = useAuth();

  const iconSize = size === 'large' ? 40 : 32;
  const textSize = size === 'large' ? 'text-lg' : 'text-base';
  const textColor = variant === 'light'
    ? 'text-white'
    : 'text-gray-800 dark:text-white';

  // Tenant tiene logo propio
  if (empresa?.logo_url) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 min-w-0"
      >
        <img
          src={empresa.logo_url}
          alt={empresa.nombre || 'Logo'}
          className="object-contain shrink-0"
          style={{ height: iconSize }}
        />
        {empresa.nombre && (
          <span className={`font-bold ${textColor} ${textSize} truncate`}>
            {empresa.nombre}
          </span>
        )}
      </motion.div>
    );
  }

  // Tenant tiene nombre pero no logo
  if (empresa?.nombre) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 min-w-0"
      >
        <div
          className={`rounded-lg flex items-center justify-center text-white font-bold shrink-0 ${
            variant === 'light' ? 'bg-sky-500/30' : 'bg-blue-600'
          }`}
          style={{ width: iconSize, height: iconSize, fontSize: iconSize * 0.45 }}
        >
          {empresa.nombre.charAt(0).toUpperCase()}
        </div>
        <span className={`font-bold ${textColor} ${textSize} truncate`}>
          {empresa.nombre}
        </span>
      </motion.div>
    );
  }

  // Fallback: nombre genérico (superadmin o sin config)
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2"
    >
      <div
        className={`rounded-lg flex items-center justify-center text-white font-bold shrink-0 ${
          variant === 'light' ? 'bg-sky-500/30' : 'bg-blue-600'
        }`}
        style={{ width: iconSize, height: iconSize, fontSize: iconSize * 0.45 }}
      >
        S
      </div>
      <span className={`font-bold ${textColor} ${textSize} whitespace-nowrap`}>
        Sistema
      </span>
    </motion.div>
  );
};

export default Logo;
