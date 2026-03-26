import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/common/Logo';

const Header = ({ setSidebarOpen }) => {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`md:hidden sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-all duration-300 ${isScrolled ? 'shadow-lg backdrop-blur-sm bg-white/95 dark:bg-gray-800/95' : ''
        }`}
    >
      <div className="px-3 sm:px-4 lg:px-6 py-2">
        <div className="flex items-center justify-between h-9">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="md:hidden mr-2 h-8 w-8 p-0"
            >
              <Menu className="w-4 h-4" />
            </Button>
            <Logo />
          </div>
        </div>
      </div>
    </motion.header>
  );
};

export default Header;