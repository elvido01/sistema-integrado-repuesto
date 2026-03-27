import React from 'react';
import { motion } from 'framer-motion';
import MotoFlowLogo from '@/components/common/MotoFlowLogo';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * Logo — Muestra el logo del tenant activo.
 * - Si el tenant tiene logo_url: muestra su imagen.
 * - Si el tenant tiene nombre pero no logo: muestra el nombre como texto.
 * - Si no hay tenant (superadmin sin tenant): muestra el logo de MotoFlow.
 */
const Logo = ({ size = 'default' }) => {
  const { empresa } = useAuth();

  const iconSize = size === 'large' ? 40 : 32;
  const textSize = size === 'large' ? 'text-lg' : 'text-base';

  // Tenant tiene logo propio
  if (empresa?.logo_url) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2"
      >
        <img
          src={empresa.logo_url}
          alt={empresa.nombre || 'Logo'}
          className="object-contain"
          style={{ height: iconSize }}
        />
        {empresa.nombre && size === 'large' && (
          <span className={`font-bold text-gray-800 dark:text-white ${textSize}`}>
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
        className="flex items-center gap-2"
      >
        <div
          className="rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shrink-0"
          style={{ width: iconSize, height: iconSize, fontSize: iconSize * 0.45 }}
        >
          {empresa.nombre.charAt(0).toUpperCase()}
        </div>
        <span className={`font-bold text-gray-800 dark:text-white ${textSize} truncate max-w-[140px]`}>
          {empresa.nombre}
        </span>
      </motion.div>
    );
  }

  // Fallback: logo de MotoFlow (superadmin o sin config)
  const logoSize = size === 'large' ? 'lg' : 'md';
  return (
    <MotoFlowLogo
      size={logoSize}
      showText={true}
      showSlogan={size === 'large'}
    />
  );
};

export default Logo;
