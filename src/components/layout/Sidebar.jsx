import React from 'react';
import { motion } from 'framer-motion';
import {
  Home,
  ShoppingCart,
  Truck,
  Package,
  FileText,
  BarChart2,
  Users,
  Briefcase,
  Settings,
  CornerUpLeft,
  ListOrdered,
  Download,
  Upload,
  MapPin,
  ListChecks,
  Receipt,
  DollarSign,
  UserCog,
  RefreshCw,
  Barcode,
  Archive,
  ClipboardList,
  LogOut,
  User,
  Sun,
  Moon,
  Building2,
  Shield,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { usePanels } from '@/contexts/PanelContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { canAccess } from '@/lib/permissionsHelper';
import Logo from '@/components/common/Logo';
import { useTheme } from '@/contexts/ThemeContext';
import NotificationBell from '@/components/layout/NotificationBell';
import { Button } from '@/components/ui/button';

const navItems = [
  {
    title: 'Dashboard',
    icon: Home,
    id: 'inicio',
  },
  {
    title: 'Transacciones',
    icon: ShoppingCart,
    subItems: [
      { title: 'Ventas', id: 'ventas' },
      { title: 'Recibo de Ingreso', id: 'recibo-ingreso', icon: Receipt },
      { title: 'Compras', id: 'compras' },
      { title: 'Pedidos', id: 'pedidos' },
      { title: 'Cotizaciones', id: 'cotizaciones' },
      { title: 'Cot. Facturas Magna', id: 'cotizaciones-magna', icon: FileText },
      { title: 'Orden de Compra', id: 'orden-compra' },
      { title: 'Devoluciones', id: 'devoluciones' },
    ],
  },
  {
    title: 'Cuentas por Pagar',
    icon: DollarSign,
    subItems: [
      { title: 'Pago a Suplidores', id: 'pago-suplidores', icon: Truck },
      { title: 'Pago Comisiones', id: 'pago-comisiones-vendedor', icon: Users },
    ],
  },
  {
    title: 'Inventario',
    icon: Package,
    subItems: [
      { title: 'Mercancías', id: 'mercancias' },
      { title: 'Entrada Mercancía', id: 'entrada-mercancia', icon: Download },
      { title: 'Salida Mercancía', id: 'salida-mercancia', icon: Upload },
      { title: 'Actualizar Ubicación', id: 'actualizar-ubicacion' },
      { title: 'Imp. Etiquetas', id: 'etiquetas-masivas', icon: Barcode },
      { title: 'Solicitudes Agotados', id: 'solicitudes', icon: ClipboardList },
    ],
  },
  {
    title: 'Reportes',
    icon: BarChart2,
    subItems: [
      { title: 'Reporte de Compras', id: 'reporte-compras' },
      { title: 'Transacciones Diarias', id: 'reporte-transacciones-diarias', icon: ListChecks },
      { title: 'Inventario Físico', id: 'inventario-fisico', icon: Archive },
    ],
  },
  {
    title: 'Catálogo',
    icon: Briefcase,
    subItems: [
      { title: 'Clientes', id: 'clientes', icon: Users },
      { title: 'Vendedores', id: 'vendedores', icon: Briefcase },
      { title: 'Suplidores', id: 'suplidores', icon: Truck },
      { title: 'Mercancías', id: 'mercancias', icon: Package },
      { title: 'Tipos de Producto', id: 'tipos-producto' },
      { title: 'Marcas', id: 'marcas' },
      { title: 'Modelos', id: 'modelos' },
      { title: 'Ubicaciones', id: 'ubicaciones' },
    ],
  },
  {
    title: 'Configuración',
    icon: Settings,
    subItems: [
      { title: 'Usuarios y Permisos', id: 'usuarios', icon: UserCog },
      { title: 'Configuraciones del Sistema', id: 'config_sistema', icon: Settings },
      { title: 'Perfil Empresa', id: 'perfil-empresa', icon: Building2 },
      { title: 'Cierre de Caja', id: 'cierre-caja', icon: Settings },
    ],
  },
];

const Sidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const { openPanel, activePanel } = usePanels();
  const { profile, permissions, user, signOut, isSuperAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Helper: open panel AND close sidebar on mobile
  const handleNavClick = (id) => {
    openPanel(id);
    // Close sidebar on mobile (screen width < 768px)
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };


  const renderNavItem = (item) => {
    // Verificar acceso al módulo raíz (si no tiene id, asumimos que depende de subItems)
    if (item.id && !canAccess(profile, permissions, item.id)) return null;

    const isActive = activePanel === item.id;
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => handleNavClick(item.id)}
        className={`w-full flex items-center text-left px-4 py-2.5 text-sm rounded-lg transition-colors duration-200 ${isActive
          ? 'bg-morla-blue text-white shadow-lg'
          : 'text-gray-600 dark:text-gray-300 hover:bg-morla-blue/10 hover:text-morla-blue'
          }`}
      >
        <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
        <span className={`${!sidebarOpen && 'hidden'}`}>{item.title}</span>
      </button>
    );
  };

  return (
    <motion.div
      animate={{ width: sidebarOpen ? 256 : 80 }}
      className={`bg-slate-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col fixed top-0 left-0 h-full z-50 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${sidebarOpen ? 'md:w-64' : 'md:w-20'}`}
    >
      <div className={`flex items-center ${sidebarOpen ? 'justify-between px-4' : 'justify-center'} border-b flex-shrink-0 h-16`}>
        <div className={`${!sidebarOpen && 'hidden'}`}>
          <Logo />
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-morla-blue ${!sidebarOpen && 'w-full flex justify-center'}`}
        >
          {sidebarOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto w-full overflow-hidden">
        <Accordion type="multiple" className="w-full" defaultValue={navItems.map(i => i.title)}>
          {navItems.map((item) => {
            // Si es un grupo con subItems, filtrar los subItems
            if (item.subItems) {
              const allowedSubItems = item.subItems.filter(sub => canAccess(profile, permissions, sub.id));

              // Si no quedan subItems permitidos, ocultar todo el grupo
              if (allowedSubItems.length === 0) return null;

              return (
                <AccordionItem value={item.title} key={item.title} className="border-none w-full">
                  <AccordionTrigger
                    className={`w-full flex items-center text-left px-4 py-2.5 text-sm rounded-lg transition-colors duration-200 text-gray-600 dark:text-gray-300 hover:bg-morla-blue/10 hover:text-morla-blue hover:no-underline`}
                  >
                    <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                    <span className={`${!sidebarOpen && 'hidden'} truncate`}>{item.title}</span>
                  </AccordionTrigger>
                  <AccordionContent className="pl-6 space-y-1 pb-0 w-full">
                    {sidebarOpen && allowedSubItems.map((subItem) => {
                      const isSubActive = activePanel === subItem.id;
                      const SubIcon = subItem.icon;
                      return (
                        <button
                          key={subItem.id}
                          onClick={() => handleNavClick(subItem.id)}
                          className={`w-full text-left text-sm py-2 px-4 rounded-md flex items-center truncate ${isSubActive
                            ? 'bg-morla-blue/20 text-morla-blue font-semibold'
                            : 'text-gray-500 dark:text-gray-400 hover:bg-morla-blue/10'
                            }`}
                        >
                          {SubIcon && <SubIcon className="w-4 h-4 mr-2 flex-shrink-0" />}
                          <span className="truncate">{subItem.title}</span>
                        </button>
                      );
                    })}
                  </AccordionContent>
                </AccordionItem>
              );
            }

            return renderNavItem(item);
          })}
        </Accordion>

        {/* SuperAdmin Section */}
        {isSuperAdmin && sidebarOpen && (
          <div className="mt-4 pt-3 border-t border-purple-200 dark:border-purple-800">
            <div className="px-4 mb-2 text-[10px] font-black uppercase text-purple-500 tracking-widest">SuperAdmin</div>
            <button
              onClick={() => handleNavClick('master-panel')}
              className={`w-full flex items-center text-left px-4 py-2.5 text-sm rounded-lg transition-colors duration-200 ${
                activePanel === 'master-panel'
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/20'
              }`}
            >
              <Shield className="w-5 h-5 mr-3 flex-shrink-0" />
              <span>Admin Dashboard</span>
            </button>
          </div>
        )}
      </nav>

      {/* Footer Section */}
      <div className={`p-3 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2 ${sidebarOpen ? '' : 'items-center'}`}>
        {sidebarOpen ? (
          <>
            <div className="flex items-center justify-between gap-2 px-2 py-1 mb-1">
              <div className="flex items-center gap-2 text-xs text-primary-foreground bg-primary px-2 py-1.5 rounded-md flex-1 overflow-hidden">
                <User className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{user?.email}</span>
              </div>
              <NotificationBell />
            </div>

            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleTheme}
                className="h-9 px-0 w-10 flex-shrink-0"
                title={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => await signOut()}
                className="h-9 flex-1 text-xs flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar Sesión</span>
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2">
              <NotificationBell />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="h-10 w-10 p-0 mb-2 rounded-full"
              title={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => await signOut()}
              className="h-10 w-10 p-0 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              title="Cerrar Sesión"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </>
        )}
      </div>

    </motion.div>
  );
};

export default Sidebar;