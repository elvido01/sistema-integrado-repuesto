import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LogOut, User, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import Logo from '@/components/common/Logo';

const Header = () => {
  const { user, signOut } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`sticky top-0 z-50 bg-white border-b border-gray-200 transition-all duration-300 ${
        isScrolled ? 'shadow-lg backdrop-blur-sm bg-white/95' : ''
      }`}
    >
      <div className="px-3 sm:px-4 lg:px-6 py-2">
        <div className="flex items-center justify-between h-9">
          <div className="flex items-center">
            <Logo />
          </div>
          
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-600 px-2 py-1 bg-gray-50 rounded-md">
              <User className="w-3 h-3" />
              <span className="max-w-32 truncate">{user?.email}</span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="h-8 px-3 text-xs flex items-center gap-1.5"
            >
              <LogOut className="w-3 h-3" />
              <span className="hidden lg:inline">Cerrar Sesión</span>
            </Button>
          </div>

          <div className="md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="h-8 w-8 p-0"
            >
              {isMobileMenuOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-gray-200 mt-2 pt-2 pb-1"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs text-gray-600 px-2 py-1.5 bg-gray-50 rounded-md">
                <User className="w-3 h-3" />
                <span className="truncate">{user?.email}</span>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="h-8 justify-start text-xs flex items-center gap-2"
              >
                <LogOut className="w-3 h-3" />
                Cerrar Sesión
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.header>
  );
};

export default Header;