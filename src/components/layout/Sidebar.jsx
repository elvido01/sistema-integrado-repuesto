import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Download,
  Upload,
  ListChecks,
  Receipt,
  DollarSign,
  UserCog,
  Barcode,
  Archive,
  ClipboardList,
  LogOut,
  User,
  Sun,
  Moon,
  Building2,
  Shield,
  ChevronDown,
  Warehouse,
} from 'lucide-react';
import { usePanels } from '@/contexts/PanelContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { canAccess } from '@/lib/permissionsHelper';
import Logo from '@/components/common/Logo';
import { useTheme } from '@/contexts/ThemeContext';
import NotificationBell from '@/components/layout/NotificationBell';

const navItems = [
  {
    title: 'Transacciones',
    icon: ShoppingCart,
    subItems: [
      { title: 'Ventas', id: 'ventas' },
      { title: 'Recibo de Ingreso', id: 'recibo-ingreso', icon: Receipt },
      { title: 'Compras', id: 'compras' },
      { title: 'Pedidos', id: 'pedidos', tenantExclude: 'b39506c3-27dc-467d-830b-096731b83113' },
      { title: 'Solicitudes de Compras', id: 'solicitudes-compras', icon: ClipboardList, tenantOnly: 'b39506c3-27dc-467d-830b-096731b83113' },
      { title: 'Cotizaciones', id: 'cotizaciones' },
      { title: 'Cot. Facturas Magna', id: 'cotizaciones-magna', icon: FileText, tenantOnly: '00000000-0000-0000-0000-000000000001' },
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
      { title: 'Almacenes', id: 'almacenes', icon: Warehouse },
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
      { title: 'Entradas y Salidas', id: 'reporte-movimientos' },
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
      { title: 'Comprobantes Fiscales', id: 'comprobantes-fiscales', icon: FileText },
    ],
  },
];

const findGroupForPanel = (panelId) => {
  for (const item of navItems) {
    if (item.subItems?.some(sub => sub.id === panelId)) {
      return item.title;
    }
  }
  return null;
};

const listVariants = {
  open: {
    height: 'auto',
    opacity: 1,
    transition: {
      height: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
      opacity: { duration: 0.2, delay: 0.05 },
    },
  },
  closed: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
      opacity: { duration: 0.1 },
    },
  },
};

const Sidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const { openPanel, activePanel } = usePanels();
  const { profile, permissions, user, signOut, isSuperAdmin, tenantId } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [expandedGroup, setExpandedGroup] = useState(null);

  useEffect(() => {
    const group = findGroupForPanel(activePanel);
    if (group) setExpandedGroup(group);
  }, [activePanel]);

  const toggleGroup = (title) => {
    setExpandedGroup(prev => prev === title ? null : title);
  };

  const handleNavClick = (id) => {
    openPanel(id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const isGroupActive = (item) => item.subItems?.some(sub => sub.id === activePanel);

  return (
    <motion.div
      animate={{ width: sidebarOpen ? 260 : 80 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-transform duration-300 border-r ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
      style={{
        background: 'linear-gradient(180deg, #EFF6FF 0%, #E8F0FE 40%, #F0F4FF 100%)',
        borderColor: '#D4DEF0',
      }}
    >
      {/* ── Header ── */}
      <div className={`flex items-center ${sidebarOpen ? 'justify-between px-4' : 'justify-center'} h-16 flex-shrink-0`}
        style={{ borderBottom: '1px solid #D4DEF0' }}
      >
        {sidebarOpen && (
          <div className="min-w-0 flex-1">
            <Logo />
          </div>
        )}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`p-1.5 rounded-lg hover:bg-blue-100 text-slate-400 hover:text-blue-600 focus:outline-none transition-colors ${!sidebarOpen && 'w-full flex justify-center'}`}
        >
          {sidebarOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto overflow-x-hidden custom-sidebar-scroll-light">

        {/* Dashboard */}
        {canAccess(profile, permissions, 'inicio') && (
          <button
            onClick={() => handleNavClick('inicio')}
            className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
              activePanel === 'inicio'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
            }`}
          >
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${
              activePanel === 'inicio'
                ? 'bg-white/20 text-white'
                : 'bg-blue-100/60 text-blue-500 group-hover:bg-blue-100 group-hover:text-blue-600'
            }`}>
              <Home className="w-[18px] h-[18px]" />
            </div>
            {sidebarOpen && <span>Dashboard</span>}
          </button>
        )}

        {sidebarOpen && (
          <div className="pt-2 pb-1 px-3">
            <div className="h-px bg-blue-200/50" />
          </div>
        )}

        {/* Groups */}
        {navItems.map((item) => {
          const allowedSubItems = item.subItems.filter(sub => {
            if (sub.tenantOnly && sub.tenantOnly !== tenantId) return false;
            if (sub.tenantExclude && sub.tenantExclude === tenantId) return false;
            return canAccess(profile, permissions, sub.id);
          });
          if (allowedSubItems.length === 0) return null;

          const isExpanded = expandedGroup === item.title;
          const hasActiveChild = isGroupActive(item);
          const Icon = item.icon;

          return (
            <div key={item.title} className="relative">
              {/* Left accent bar */}
              {hasActiveChild && sidebarOpen && (
                <motion.div
                  layoutId="sidebar-active-bar"
                  className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full"
                  style={{ background: '#2563EB' }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}

              {/* Group trigger */}
              <button
                onClick={() => sidebarOpen ? toggleGroup(item.title) : null}
                className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                  isExpanded && sidebarOpen
                    ? 'bg-blue-50/80 text-blue-700'
                    : hasActiveChild
                      ? 'text-blue-700'
                      : 'text-slate-500 hover:bg-blue-50/60 hover:text-slate-700'
                }`}
              >
                <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${
                  hasActiveChild
                    ? 'bg-blue-100 text-blue-600'
                    : isExpanded
                      ? 'bg-blue-100/70 text-blue-500'
                      : 'bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500'
                }`}>
                  <Icon className="w-[18px] h-[18px]" />
                </div>
                {sidebarOpen && (
                  <>
                    <span className="flex-1 text-left truncate">{item.title}</span>
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex-shrink-0"
                    >
                      <ChevronDown className={`w-4 h-4 transition-colors ${
                        isExpanded ? 'text-blue-500' : 'text-slate-300'
                      }`} />
                    </motion.div>
                  </>
                )}
              </button>

              {/* Sub items */}
              <AnimatePresence initial={false}>
                {isExpanded && sidebarOpen && (
                  <motion.div
                    key={`${item.title}-content`}
                    initial="closed"
                    animate="open"
                    exit="closed"
                    variants={listVariants}
                    className="overflow-hidden"
                  >
                    <div className="ml-[22px] pl-4 py-1 space-y-0.5 border-l-2 border-blue-200/60">
                      {allowedSubItems.map((subItem) => {
                        const isSubActive = activePanel === subItem.id;
                        const SubIcon = subItem.icon;
                        return (
                          <button
                            key={subItem.id}
                            onClick={() => handleNavClick(subItem.id)}
                            className={`group/sub w-full text-left text-[12.5px] py-2 px-3 rounded-lg flex items-center gap-2.5 transition-all duration-150 ${
                              isSubActive
                                ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-200'
                                : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                          >
                            {SubIcon ? (
                              <SubIcon className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                                isSubActive ? 'text-white' : 'text-slate-400 group-hover/sub:text-blue-500'
                              }`} />
                            ) : (
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all ${
                                isSubActive ? 'bg-white scale-125' : 'bg-slate-300 group-hover/sub:bg-blue-400'
                              }`} />
                            )}
                            <span className="truncate">{subItem.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* SuperAdmin */}
        {isSuperAdmin && sidebarOpen && (
          <div className="mt-3 pt-3 border-t border-purple-200/50">
            <div className="px-3 mb-2 text-[10px] font-black uppercase text-purple-500/60 tracking-widest">SuperAdmin</div>
            <button
              onClick={() => handleNavClick('master-panel')}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                activePanel === 'master-panel'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                  : 'text-purple-500/70 hover:bg-purple-50 hover:text-purple-700'
              }`}
            >
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                activePanel === 'master-panel'
                  ? 'bg-white/20 text-white'
                  : 'bg-purple-100/50 text-purple-400 group-hover:bg-purple-100 group-hover:text-purple-500'
              }`}>
                <Shield className="w-[18px] h-[18px]" />
              </div>
              <span>Admin Dashboard</span>
            </button>
          </div>
        )}
      </nav>

      {/* ── Footer ── */}
      <div className={`p-3 flex flex-col gap-2 ${sidebarOpen ? '' : 'items-center'}`}
        style={{ borderTop: '1px solid #D4DEF0' }}
      >
        {sidebarOpen ? (
          <>
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2 text-[11px] text-blue-700 bg-blue-100/60 px-2.5 py-2 rounded-lg flex-1 overflow-hidden border border-blue-200/50">
                <User className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" />
                <span className="truncate">{user?.email}</span>
              </div>
              <NotificationBell />
            </div>

            <div className="flex gap-2 w-full">
              <button
                onClick={toggleTheme}
                className="h-9 w-10 flex-shrink-0 flex items-center justify-center rounded-lg border border-blue-200/60 bg-white hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                title={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                onClick={async () => await signOut()}
                className="h-9 flex-1 text-xs flex items-center justify-center gap-2 rounded-lg border border-blue-200/60 bg-white hover:bg-red-50 text-slate-500 hover:text-red-500 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-1">
              <NotificationBell />
            </div>
            <button
              onClick={toggleTheme}
              className="h-10 w-10 p-0 flex items-center justify-center rounded-full hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors mb-1"
              title={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={async () => await signOut()}
              className="h-10 w-10 p-0 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default Sidebar;