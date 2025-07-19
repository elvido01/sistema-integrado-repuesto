import React from 'react';
import { motion } from 'framer-motion';

const SummaryCard = ({ icon: Icon, title, value, description }) => {
  return (
    <motion.div 
      className="bg-white p-4 rounded-lg shadow-micro flex items-start space-x-4"
      whileHover={{ y: -4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      transition={{ duration: 0.15 }}
    >
      <div className="p-3 rounded-full bg-gradient-to-b from-morla-gold-start to-morla-gold-end">
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-semibold uppercase">{title}</p>
        <p className="text-2xl font-bold text-morla-blue">{value}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
    </motion.div>
  );
};

export default SummaryCard;