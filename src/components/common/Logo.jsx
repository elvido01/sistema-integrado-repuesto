import React from 'react';
import { motion } from 'framer-motion';

const Logo = () => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2"
    >
      <div className="relative">
        <div className="w-7 h-7 bg-gradient-to-br from-morla-blue to-blue-700 rounded-lg flex items-center justify-center shadow-sm">
          <span className="text-white font-bold text-xs">RM</span>
        </div>
        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-gradient-to-br from-morla-gold-start to-morla-gold-end rounded-full"></div>
      </div>
      
      <div className="flex flex-col">
        <h1 className="text-sm font-bold text-morla-blue leading-none">
          Repuestos Morla
        </h1>
        <p className="text-xs text-gray-500 leading-none">
          Sistema Integrado
        </p>
      </div>
    </motion.div>
  );
};

export default Logo;