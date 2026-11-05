import React from 'react';
import { motion } from 'framer-motion';
import MotoFlowLogo, { ICONO_MOTOFLOW } from '@/components/common/MotoFlowLogo';
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

  // Tenant sin logo propio: la "M" de MotoFlow por defecto + su nombre
  if (empresa?.nombre) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 min-w-0"
      >
        <img
          src={ICONO_MOTOFLOW}
          alt="MotoFlow"
          className="object-contain shrink-0"
          style={{ width: iconSize, height: iconSize }}
        />
        <span className={`font-bold ${textColor} ${textSize} truncate`}>
          {empresa.nombre}
        </span>
      </motion.div>
    );
  }

  // Sin empresa (superadmin o sin config): logo MotoFlow completo
  return <MotoFlowLogo size="sm" />;
};

export default Logo;
