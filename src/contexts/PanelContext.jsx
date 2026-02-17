import React, { createContext, useState, useContext } from 'react';
import { Home, ShoppingCart, Truck, BarChart2, Package, MapPin, FileText, Settings, CornerUpLeft, ListOrdered, Users, Briefcase, Archive, Upload, Download, ListChecks, Receipt, DollarSign, UserCog, RefreshCw, Barcode, ClipboardList } from 'lucide-react';

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
import UsuariosPermissionsPage from '@/pages/Configuracion/UsuariosPermissionsPage';
import CambioCodigoPage from '@/pages/CambioCodigoPage';
import CatalogPage from '@/pages/CatalogPage';
import EtiquetasMasivasPage from '@/pages/EtiquetasMasivasPage';
import VendedoresPage from '@/pages/VendedoresPage';
import InventarioFisicoPage from '@/pages/InventarioFisicoPage';
import SolicitudesPage from '@/pages/SolicitudesPage';
import RouteGuard from '@/components/auth/RouteGuard';

const Protected = ({ module, children }) => (
  <RouteGuard moduleKey={module}>
    {children}
  </RouteGuard>
);

const componentMapping = {
  'inicio': { component: HomePage, icon: Home, name: 'Inicio' },
  'ventas': { component: () => <Protected module="ventas"><VentasPage /></Protected>, icon: ShoppingCart, name: 'Ventas' },
  'recibo-ingreso': { component: () => <Protected module="recibo-ingreso"><ReciboIngresoPage /></Protected>, icon: Receipt, name: 'Recibo de Ingreso' },
  'pago-suplidores': { component: () => <Protected module="pago-suplidores"><PagoSuplidoresPage /></Protected>, icon: Truck, name: 'Pago a Suplidores' },
  'pago-comisiones-vendedor': { component: () => <Protected module="pago-comisiones-vendedor"><PagoComisionesPage /></Protected>, icon: Users, name: 'Pago Comisiones' },
  'compras': { component: () => <Protected module="compras"><ComprasPage /></Protected>, icon: Truck, name: 'Compras' },
  'pedidos': { component: () => <Protected module="pedidos"><PedidosPage /></Protected>, icon: ListOrdered, name: 'Pedidos' },
  'cotizaciones': { component: () => <Protected module="cotizaciones"><CotizacionPage /></Protected>, icon: FileText, name: 'Cotizaciones' },
  'orden-compra': { component: () => <Protected module="orden-compra"><OrdenCompraPage /></Protected>, icon: FileText, name: 'Orden de Compra' },
  'devoluciones': { component: () => <Protected module="devoluciones"><DevolucionesPage /></Protected>, icon: CornerUpLeft, name: 'Devoluciones' },
  'mercancias': { component: () => <Protected module="mercancias"><ProductsPage /></Protected>, icon: Package, name: 'Mercancías' },
  'entrada-mercancia': { component: () => <Protected module="entrada-mercancia"><EntradaMercanciaPage /></Protected>, icon: Download, name: 'Entrada Mercancía' },
  'salida-mercancia': { component: () => <Protected module="salida-mercancia"><SalidaMercanciaPage /></Protected>, icon: Upload, name: 'Salida Mercancía' },
  'actualizar-ubicacion': { component: () => <Protected module="actualizar-ubicacion"><UpdateLocationPage /></Protected>, icon: MapPin, name: 'Actualizar Ubicación' },
  'cambio-codigo': { component: () => <Protected module="cambio-codigo"><CambioCodigoPage /></Protected>, icon: RefreshCw, name: 'Cambio de Código' },
  'reporte-compras': { component: () => <Protected module="reporte-compras"><ReporteComprasPage /></Protected>, icon: BarChart2, name: 'Reporte de Compras' },
  'reporte-transacciones-diarias': { component: () => <Protected module="reporte-transacciones-diarias"><ReporteTransaccionesDiariasPage /></Protected>, icon: ListChecks, name: 'Transacciones Diarias' },
  'clientes': { component: () => <Protected module="clientes"><ClientesPage /></Protected>, icon: Users, name: 'Clientes' },
  'suplidores': { component: () => <Protected module="suplidores"><SuplidoresPage /></Protected>, icon: Briefcase, name: 'Suplidores' },
  'usuarios': { component: () => <Protected module="usuarios"><UsuariosPermissionsPage /></Protected>, icon: UserCog, name: 'Usuarios y Permisos' },
  'tipos-producto': { component: () => <Protected module="tipos-producto"><CatalogPage catalogType="tipos-producto" /></Protected>, icon: Briefcase, name: 'Tipos de Producto' },
  'marcas': { component: () => <Protected module="marcas"><CatalogPage catalogType="marcas" /></Protected>, icon: Briefcase, name: 'Marcas' },
  'modelos': { component: () => <Protected module="modelos"><CatalogPage catalogType="modelos" /></Protected>, icon: Briefcase, name: 'Modelos' },
  'ubicaciones': { component: () => <Protected module="ubicaciones"><CatalogPage catalogType="ubicaciones" /></Protected>, icon: MapPin, name: 'Ubicaciones' },
  'etiquetas-masivas': { component: () => <Protected module="etiquetas-masivas"><EtiquetasMasivasPage /></Protected>, icon: Barcode, name: 'Impresión Etiquetas' },
  'vendedores': { component: () => <Protected module="vendedores"><VendedoresPage /></Protected>, icon: Users, name: 'Vendedores' },
  'inventario-fisico': { component: () => <Protected module="inventario-fisico"><InventarioFisicoPage /></Protected>, icon: Archive, name: 'Inventario Físico' },
  'solicitudes': { component: () => <Protected module="solicitudes"><SolicitudesPage /></Protected>, icon: ClipboardList, name: 'Solicitudes Agotados' },
};

const PanelContext = createContext();

export const PanelProvider = ({ children }) => {
  const [panels, setPanels] = useState([{ id: 'inicio', ...componentMapping['inicio'] }]);
  const [activePanel, setActivePanel] = useState('inicio');

  const openPanel = (id, extraData = null) => {
    if (!componentMapping[id]) {
      console.error(`No component mapping found for id: ${id}`);
      return;
    }

    setPanels(prevPanels => {
      const existingPanel = prevPanels.find(p => p.id === id);
      if (existingPanel) {
        // If it exists, update its extraData and make it active
        setActivePanel(id);
        return prevPanels.map(p => p.id === id ? { ...p, extraData } : p);
      }
      return [...prevPanels, { id, ...componentMapping[id], extraData }];
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