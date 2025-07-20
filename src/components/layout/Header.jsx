import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LogOut, User, Menu, X, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import Logo from '@/components/common/Logo';
import { useTheme } from '@/contexts/ThemeContext';

const Header = ({ setSidebarOpen }) => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
      className={`sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-all duration-300 ${
        isScrolled ? 'shadow-lg backdrop-blur-sm bg-white/95 dark:bg-gray-800/95' : ''
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

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="h-8 w-8 p-0"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
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
            className="md:hidden border-t border-gray-200 dark:border-gray-700 mt-2 pt-2 pb-1"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 px-2 py-1.5 bg-gray-50 dark:bg-gray-700 rounded-md">
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

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="h-8 justify-start text-xs flex items-center gap-2"
            >
              {theme === 'dark' ? (
                <Sun className="w-3 h-3" />
              ) : (
                <Moon className="w-3 h-3" />
              )}
              <span className="ml-2">Tema</span>
            </Button>
          </div>
          </motion.div>
        )}
      </div>
    </motion.header>
  );
};

export default Header;