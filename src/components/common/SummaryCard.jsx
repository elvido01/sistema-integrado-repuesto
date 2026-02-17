import React from 'react';
import { motion } from 'framer-motion';

const SummaryCard = ({ icon: Icon, title, value, description, color }) => {
  const colorVariants = {
    red: {
      bg: 'bg-red-100 dark:bg-red-900/50',
      text: 'text-red-600 dark:text-red-400',
      icon: 'text-red-600 dark:text-red-400',
    },
    green: {
      bg: 'bg-green-100 dark:bg-green-900/50',
      text: 'text-green-600 dark:text-green-400',
      icon: 'text-green-600 dark:text-green-400',
    },
    blue: {
      bg: 'bg-blue-100 dark:bg-blue-900/50',
      text: 'text-blue-600 dark:text-blue-400',
      icon: 'text-blue-600 dark:text-blue-400',
    },
    purple: {
      bg: 'bg-purple-100 dark:bg-purple-900/50',
      text: 'text-purple-600 dark:text-purple-400',
      icon: 'text-purple-600 dark:text-purple-400',
    },
    primary: {
        bg: 'bg-primary/10',
        text: 'text-primary',
        icon: 'text-primary',
    },
    accent: {
        bg: 'bg-accent/10',
        text: 'text-accent',
        icon: 'text-accent',
    },
    destructive: {
      bg: 'bg-destructive/10',
      text: 'text-destructive',
      icon: 'text-destructive',
    },
  };

  const selectedColor = colorVariants[color] || colorVariants.primary;

  return (
    <motion.div
      className="bg-card p-4 rounded-lg shadow-sm flex items-start space-x-4 border border-border"
      whileHover={{ y: -4, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
      transition={{ duration: 0.15 }}
    >
      <div className={`p-3 rounded-full ${selectedColor.bg}`}>
        <Icon className={`w-6 h-6 ${selectedColor.icon}`} />
      </div>
      <div>
        <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wider">{title}</p>
        <p className={`text-2xl font-bold ${selectedColor.text}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  );
};

export default SummaryCard;