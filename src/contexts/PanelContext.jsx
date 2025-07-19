import React, { createContext, useState, useContext } from 'react';
import { Home, ShoppingCart, Truck, BarChart2, Package, MapPin, FileText, Settings, CornerUpLeft, ListOrdered, Users, Briefcase, Archive, Upload, Download, ListChecks, Receipt, DollarSign, UserCog, RefreshCw } from 'lucide-react';

import HomePage from '@/pages/HomePage';
import VentasPage from '@/pages/VentasPage';
import ComprasPage from '@/pages/ComprasPage';
import OrdenCompraPage from '@/pages/OrdenCompraPage';
import ProductsPage from '@/pages/ProductsPage';
import UpdateLocationPage from '@/pages/UpdateLocationPage';
import ReporteComprasPage from '@/pages/ReporteComprasPage';
import ReporteTransaccionesDiariasPage from '@/pages/ReporteTransaccionesDiariasPage';
import DevolucionesPage from '@/pages/DevolucionesPage';
import PedidosPage from '@/pages/PedidosPage';
import CotizacionPage from '@/pages/CotizacionPage';
import ClientesPage from '@/pages/ClientesPage';
import SuplidoresPage from '@/pages/SuplidoresPage';
import EntradaMercanciaPage from '@/pages/EntradaMercanciaPage';
import SalidaMercanciaPage from '@/pages/SalidaMercanciaPage';
import ReciboIngresoPage from '@/pages/ReciboIngresoPage';
import PagoSuplidoresPage from '@/pages/PagoSuplidoresPage';
import PagoComisionesPage from '@/pages/PagoComisionesPage';
import UsuariosPage from '@/pages/UsuariosPage';
import CambioCodigoPage from '@/pages/CambioCodigoPage';

const componentMapping = {
  'inicio': { component: HomePage, icon: Home, name: 'Inicio' },
  'ventas': { component: VentasPage, icon: ShoppingCart, name: 'Ventas' },
  'recibo-ingreso': { component: ReciboIngresoPage, icon: Receipt, name: 'Recibo de Ingreso' },
  'pago-suplidores': { component: PagoSuplidoresPage, icon: Truck, name: 'Pago a Suplidores' },
  'pago-comisiones-vendedor': { component: PagoComisionesPage, icon: Users, name: 'Pago Comisiones' },
  'compras': { component: ComprasPage, icon: Truck, name: 'Compras' },
  'pedidos': { component: PedidosPage, icon: ListOrdered, name: 'Pedidos' },
  'cotizaciones': { component: CotizacionPage, icon: FileText, name: 'Cotizaciones' },
  'orden-compra': { component: OrdenCompraPage, icon: FileText, name: 'Orden de Compra' },
  'devoluciones': { component: DevolucionesPage, icon: CornerUpLeft, name: 'Devoluciones' },
  'mercancias': { component: ProductsPage, icon: Package, name: 'Mercancías' },
  'entrada-mercancia': { component: EntradaMercanciaPage, icon: Download, name: 'Entrada Mercancía' },
  'salida-mercancia': { component: SalidaMercanciaPage, icon: Upload, name: 'Salida Mercancía' },
  'actualizar-ubicacion': { component: UpdateLocationPage, icon: MapPin, name: 'Actualizar Ubicación' },
  'cambio-codigo': { component: CambioCodigoPage, icon: RefreshCw, name: 'Cambio de Código' },
  'reporte-compras': { component: ReporteComprasPage, icon: BarChart2, name: 'Reporte de Compras' },
  'reporte-transacciones-diarias': { component: ReporteTransaccionesDiariasPage, icon: ListChecks, name: 'Transacciones Diarias' },
  'clientes': { component: ClientesPage, icon: Users, name: 'Clientes' },
  'suplidores': { component: SuplidoresPage, icon: Briefcase, name: 'Suplidores' },
  'usuarios': { component: UsuariosPage, icon: UserCog, name: 'Usuarios' },
};

const PanelContext = createContext();

export const PanelProvider = ({ children }) => {
  const [panels, setPanels] = useState([{ id: 'inicio', ...componentMapping['inicio'] }]);
  const [activePanel, setActivePanel] = useState('inicio');

  const openPanel = (id) => {
    if (!componentMapping[id]) {
      console.error(`No component mapping found for id: ${id}`);
      return;
    }
    
    setPanels(prevPanels => {
      if (prevPanels.find(p => p.id === id)) {
        setActivePanel(id);
        return prevPanels;
      }
      return [...prevPanels, { id, ...componentMapping[id] }];
    });
    setActivePanel(id);
  };

  const closePanel = (id) => {
    if (id === 'inicio') return; // Cannot close home panel

    setPanels(prevPanels => {
      const panelIndex = prevPanels.findIndex(p => p.id === id);
      const newPanels = prevPanels.filter(p => p.id !== id);
      
      if (activePanel === id) {
        const newActivePanel = newPanels[panelIndex - 1] || newPanels[0];
        if (newActivePanel) {
          setActivePanel(newActivePanel.id);
        } else {
          // This case should ideally not happen if 'inicio' is always present
          // but as a fallback, we can set it to 'inicio'
          setActivePanel('inicio');
        }
      }
      
      return newPanels;
    });
  };

  const value = {
    panels,
    activePanel,
    openPanel,
    closePanel,
    setActivePanel,
  };

  return (
    <PanelContext.Provider value={value}>
      {children}
    </PanelContext.Provider>
  );
};

export const usePanels = () => {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanels must be used within a PanelProvider');
  }
  return context;
};