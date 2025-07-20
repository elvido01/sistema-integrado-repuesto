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
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { usePanels } from '@/contexts/PanelContext';
import Logo from '@/components/common/Logo';

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
    ],
  },
  {
    title: 'Reportes',
    icon: BarChart2,
    subItems: [
      { title: 'Reporte de Compras', id: 'reporte-compras' },
      { title: 'Transacciones Diarias', id: 'reporte-transacciones-diarias', icon: ListChecks },
    ],
  },
  {
    title: 'Catálogo',
    icon: Briefcase,
    subItems: [
      { title: 'Clientes', id: 'clientes', icon: Users },
      { title: 'Suplidores', id: 'suplidores', icon: Truck },
      { title: 'Mercancías', id: 'mercancias', icon: Package },
    ],
  },
  {
    title: 'Configuración',
    icon: Settings,
    subItems: [
        { title: 'Usuarios', id: 'usuarios', icon: UserCog },
    ],
  },
];

const Sidebar = ({ sidebarOpen }) => {
  const { openPanel, activePanel } = usePanels();

  const renderNavItem = (item) => {
    const isActive = activePanel === item.id;
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => openPanel(item.id)}
        className={`w-full flex items-center text-left px-4 py-2.5 text-sm rounded-lg transition-colors duration-200 ${
          isActive
            ? 'bg-morla-blue text-white shadow-lg'
            : 'text-gray-600 dark:text-gray-300 hover:bg-morla-blue/10 hover:text-morla-blue'
        }`}
      >
        <Icon className="w-5 h-5 mr-3" />
        <span className={`${!sidebarOpen && 'hidden'}`}>{item.title}</span>
      </button>
    );
  };

  return (
    <motion.div
      animate={{ width: sidebarOpen ? 256 : 80 }}
      className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col fixed top-0 left-0 h-full z-50 transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } ${sidebarOpen ? 'md:w-64' : 'md:w-20'}`}
    >
      <div className="flex items-center justify-center p-4 border-b h-16">
        <Logo isCollapsed={!sidebarOpen} />
      </div>
      <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
        <Accordion type="multiple" className="w-full" defaultValue={['Cuentas por Pagar', 'Configuración']}>
          {navItems.map((item) =>
            item.subItems ? (
              <AccordionItem value={item.title} key={item.title} className="border-none">
                <AccordionTrigger
                  className={`w-full flex items-center text-left px-4 py-2.5 text-sm rounded-lg transition-colors duration-200 text-gray-600 dark:text-gray-300 hover:bg-morla-blue/10 hover:text-morla-blue hover:no-underline`}
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  <span className={`${!sidebarOpen && 'hidden'}`}>{item.title}</span>
                </AccordionTrigger>
                <AccordionContent className="pl-8 space-y-1 pb-0">
                  {sidebarOpen && item.subItems.map((subItem) => {
                    const isSubActive = activePanel === subItem.id;
                    const SubIcon = subItem.icon;
                    return (
                      <button
                        key={subItem.id}
                        onClick={() => openPanel(subItem.id)}
                        className={`w-full text-left text-sm py-2 px-4 rounded-md flex items-center ${
                          isSubActive
                            ? 'bg-morla-blue/20 text-morla-blue font-semibold'
                            : 'text-gray-500 dark:text-gray-400 hover:bg-morla-blue/10'
                        }`}
                      >
                        {SubIcon && <SubIcon className="w-4 h-4 mr-2" />}
                        {subItem.title}
                      </button>
                    );
                  })}
                </AccordionContent>
              </AccordionItem>
            ) : (
              renderNavItem(item)
            )
          )}
        </Accordion>
      </nav>
    </motion.div>
  );
};

export default Sidebar;