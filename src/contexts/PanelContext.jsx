import React, { useState } from 'react';
import { PanelContext, usePanels } from './panelCore';
import { Home, ShoppingCart, Truck, BarChart2, Package, MapPin, FileText, Settings, CornerUpLeft, ListOrdered, Users, Briefcase, Archive, Upload, Download, ListChecks, Receipt, DollarSign, UserCog, RefreshCw, Barcode, ClipboardList, Building2, Shield, CreditCard, Warehouse, BellRing, Brain, FileImage, MessageCircle, RadioTower, Sparkles, ShieldAlert, PieChart, CalendarClock, Wallet, PiggyBank, Landmark } from 'lucide-react';

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
import CierreCajaPage from '@/pages/Configuracion/CierreCajaPage';
import CambioCodigoPage from '@/pages/CambioCodigoPage';
import ConfiguracionSistemaPage from '@/pages/Configuracion/ConfiguracionSistemaPage';
import CatalogPage from '@/pages/CatalogPage';
import EtiquetasMasivasPage from '@/pages/EtiquetasMasivasPage';
import VendedoresPage from '@/pages/VendedoresPage';
import InventarioFisicoPage from '@/pages/InventarioFisicoPage';
import ReporteMovimientosPage from '@/pages/ReporteMovimientosPage';
import SolicitudesPage from '@/pages/SolicitudesPage';
import SolicitudesComprasPage from '@/pages/SolicitudesComprasPage';
import CartaRutaPage from '@/pages/CartaRutaPage';
import DocumentacionClientePage from '@/pages/DocumentacionClientePage';
import ReportesDGIIPage from '@/pages/ReportesDGIIPage';
import LibrosContablesPage from '@/pages/LibrosContablesPage';
import EstadoResultadosPage from '@/pages/EstadoResultadosPage';
import AlertasGerencialesPage from '@/pages/AlertasGerencialesPage';
import RentabilidadDiariaPage from '@/pages/RentabilidadDiariaPage';
import InventarioInteligentePage from '@/pages/InventarioInteligentePage';
import FlujoCajaPage from '@/pages/FlujoCajaPage';
import CarteraClientesPage from '@/pages/CarteraClientesPage';
import RecomendadorPreciosPage from '@/pages/RecomendadorPreciosPage';
import CotizacionesMagnaPage from '@/pages/CotizacionesMagnaPage';
import PerfilEmpresa from '@/pages/Configuracion/PerfilEmpresa';
import ComprobantesPage from '@/pages/Configuracion/ComprobantesPage';
import DgiiMonitorPage from '@/pages/Configuracion/DgiiMonitorPage';
import PresupuestoInteligentePage from '@/pages/Configuracion/PresupuestoInteligentePage';
import CuentasBancariasPage from '@/pages/CuentasBancariasPage';
import AprobacionesComprasPage from '@/pages/AprobacionesComprasPage';
import GruposEquivalentesPage from '@/pages/GruposEquivalentesPage';
import AdminDashboard from '@/pages/Admin/AdminDashboard';
import AICeoPage from '@/pages/AICeoPage';
import PlanesPage from '@/pages/PlanesPage';
import WhatsAppCrmPage from '@/pages/WhatsAppCrmPage';
import GpsDashboardPage from '@/pages/gps/GpsDashboardPage';
import GpsDevicesPage from '@/pages/gps/GpsDevicesPage';
import GpsMapPage from '@/pages/gps/GpsMapPage';
import GpsAlertsPage from '@/pages/gps/GpsAlertsPage';
import GpsFinancingPage from '@/pages/gps/GpsFinancingPage';
import GpsDeviceDetailPage from '@/pages/gps/GpsDeviceDetailPage';
import FinancieraPrestamosPage from '@/pages/FinancieraPrestamosPage';
import ReciboPagoFinancieraPage from '@/pages/ReciboPagoFinancieraPage';
import OtrasTransaccionesPage from '@/pages/OtrasTransaccionesPage';
import HistoricoClientePage from '@/pages/HistoricoClientePage';
import NotasComentariosPage from '@/pages/NotasComentariosPage';
import ListaChasisPrestamosPage from '@/pages/ListaChasisPrestamosPage';
import ResumenCarteraPage from '@/pages/ResumenCarteraPage';
import GestionCobroPage from '@/pages/GestionCobroPage';
import CuentasIncobrablesPage from '@/pages/CuentasIncobrablesPage';
import SeguimientosHoyPage from '@/pages/SeguimientosHoyPage';
import NominaPage from '@/pages/NominaPage';
import SanPage from '@/pages/SanPage';
import NotaCreditoFinancieraPage from '@/pages/NotaCreditoFinancieraPage';
import RouteGuard from '@/components/auth/RouteGuard';
import SuperAdminGuard from '@/components/auth/SuperAdminGuard';
import PlanGate from '@/components/auth/PlanGate';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const Protected = ({ module, children }) => (
  <RouteGuard moduleKey={module}>
    {children}
  </RouteGuard>
);

// "Recibo de Ingreso": en empresas tipo financiera muestra el recibo de
// pago de prestamos (igual al sistema viejo); en el resto, el normal.
const ReciboIngresoRouter = ({ extraData }) => {
  const { empresa } = useAuth();
  return empresa?.feat_financiera
    ? <ReciboPagoFinancieraPage extraData={extraData} />
    : <ReciboIngresoPage extraData={extraData} />;
};

const componentMapping = {
  'inicio': { component: HomePage, icon: Home, name: 'Inicio' },
  'ventas': { component: () => <Protected module="ventas"><VentasPage /></Protected>, icon: ShoppingCart, name: 'Ventas' },
  'recibo-ingreso': { component: ({ extraData }) => <Protected module="recibo-ingreso"><ReciboIngresoRouter extraData={extraData} /></Protected>, icon: Receipt, name: 'Recibo de Ingreso' },
  'pago-suplidores': { component: () => <Protected module="pago-suplidores"><PagoSuplidoresPage /></Protected>, icon: Truck, name: 'Pago a Suplidores' },
  'pago-comisiones-vendedor': { component: () => <Protected module="pago-comisiones-vendedor"><PagoComisionesPage /></Protected>, icon: Users, name: 'Pago Comisiones' },
  'nomina': { component: () => <Protected module="nomina"><NominaPage /></Protected>, icon: Wallet, name: 'Nómina' },
  'compras': { component: () => <Protected module="compras"><ComprasPage /></Protected>, icon: Truck, name: 'Compras' },
  'pedidos': { component: () => <Protected module="pedidos"><PedidosPage /></Protected>, icon: ListOrdered, name: 'Pedidos' },
  'cotizaciones': { component: () => <Protected module="cotizaciones"><CotizacionPage /></Protected>, icon: FileText, name: 'Cotizaciones' },
  'cotizaciones-magna': { component: () => <Protected module="cotizaciones-magna"><CotizacionesMagnaPage /></Protected>, icon: FileText, name: 'Cot. Facturas Magna' },
  'orden-compra': { component: () => <Protected module="orden-compra"><OrdenCompraPage /></Protected>, icon: FileText, name: 'Orden de Compra' },
  'devoluciones': { component: () => <Protected module="devoluciones"><DevolucionesPage /></Protected>, icon: CornerUpLeft, name: 'Devoluciones' },
  'mercancias': { component: ({ extraData }) => <Protected module="mercancias"><ProductsPage extraData={extraData} /></Protected>, icon: Package, name: 'Mercancías' },
  'entrada-mercancia': { component: () => <Protected module="entrada-mercancia"><EntradaMercanciaPage /></Protected>, icon: Download, name: 'Entrada Mercancía' },
  'salida-mercancia': { component: () => <Protected module="salida-mercancia"><SalidaMercanciaPage /></Protected>, icon: Upload, name: 'Salida Mercancía' },
  'actualizar-ubicacion': { component: () => <Protected module="actualizar-ubicacion"><UpdateLocationPage /></Protected>, icon: MapPin, name: 'Actualizar Ubicación' },
  'cambio-codigo': { component: () => <Protected module="cambio-codigo"><CambioCodigoPage /></Protected>, icon: RefreshCw, name: 'Cambio de Código' },
  'reporte-compras': { component: () => <Protected module="reporte-compras"><ReporteComprasPage /></Protected>, icon: BarChart2, name: 'Reporte de Compras' },
  'reporte-transacciones-diarias': { component: () => <Protected module="reporte-transacciones-diarias"><ReporteTransaccionesDiariasPage /></Protected>, icon: ListChecks, name: 'Transacciones Diarias' },
  'reporte-movimientos': { component: () => <Protected module="reporte-movimientos"><ReporteMovimientosPage /></Protected>, icon: BarChart2, name: 'Transacciones de Inventario' },
  'clientes': { component: () => <Protected module="clientes"><ClientesPage /></Protected>, icon: Users, name: 'Clientes' },
  'suplidores': { component: () => <Protected module="suplidores"><SuplidoresPage /></Protected>, icon: Briefcase, name: 'Suplidores' },
  'usuarios': { component: () => <Protected module="usuarios"><UsuariosPermissionsPage /></Protected>, icon: UserCog, name: 'Usuarios y Permisos' },
  'tipos-producto': { component: () => <Protected module="tipos-producto"><CatalogPage catalogType="tipos-producto" /></Protected>, icon: Briefcase, name: 'Tipos de Producto' },
  'marcas': { component: () => <Protected module="marcas"><CatalogPage catalogType="marcas" /></Protected>, icon: Briefcase, name: 'Marcas' },
  'modelos': { component: () => <Protected module="modelos"><CatalogPage catalogType="modelos" /></Protected>, icon: Briefcase, name: 'Modelos' },
  'ubicaciones': { component: () => <Protected module="ubicaciones"><CatalogPage catalogType="ubicaciones" /></Protected>, icon: MapPin, name: 'Ubicaciones' },
  'almacenes': { component: () => <Protected module="almacenes"><CatalogPage catalogType="almacenes" /></Protected>, icon: Warehouse, name: 'Almacenes' },
  'etiquetas-masivas': { component: () => <Protected module="etiquetas-masivas"><EtiquetasMasivasPage /></Protected>, icon: Barcode, name: 'Impresión Etiquetas' },
  'vendedores': { component: () => <Protected module="vendedores"><VendedoresPage /></Protected>, icon: Users, name: 'Vendedores' },
  'inventario-fisico': { component: () => <Protected module="inventario-fisico"><InventarioFisicoPage /></Protected>, icon: Archive, name: 'Inventario Físico' },
  'solicitudes': { component: () => <Protected module="solicitudes"><SolicitudesPage /></Protected>, icon: ClipboardList, name: 'Solicitudes Agotados' },
  'solicitudes-compras': { component: () => <Protected module="solicitudes-compras"><SolicitudesComprasPage /></Protected>, icon: ClipboardList, name: 'Solicitudes de Compras' },
  'carta-ruta': { component: ({ extraData }) => <Protected module="carta-ruta"><CartaRutaPage extraData={extraData} /></Protected>, icon: FileText, name: 'Carta de Ruta' },
  'documentacion-cliente': { component: () => <Protected module="documentacion-cliente"><DocumentacionClientePage /></Protected>, icon: FileImage, name: 'Documentación Cliente' },
  'reportes-dgii': { component: () => <Protected module="reportes-dgii"><ReportesDGIIPage /></Protected>, icon: FileText, name: 'Reportes DGII' },
  'libros-contables': { component: () => <Protected module="libros-contables"><LibrosContablesPage /></Protected>, icon: FileText, name: 'Libros Contables' },
  'estado-resultados': { component: () => <Protected module="estado-resultados"><EstadoResultadosPage /></Protected>, icon: DollarSign, name: 'Estado de Resultado' },
  'alertas-gerenciales': { component: () => <Protected module="alertas-gerenciales"><AlertasGerencialesPage /></Protected>, icon: BellRing, name: 'Alertas Gerenciales' },
  'rentabilidad-diaria': { component: () => <Protected module="rentabilidad-diaria"><RentabilidadDiariaPage /></Protected>, icon: DollarSign, name: 'Rentabilidad Diaria' },
  'inventario-inteligente': { component: () => <Protected module="inventario-inteligente"><InventarioInteligentePage /></Protected>, icon: Warehouse, name: 'Inventario Inteligente' },
  'flujo-caja': { component: () => <Protected module="flujo-caja"><FlujoCajaPage /></Protected>, icon: DollarSign, name: 'Flujo de Caja' },
  'cartera-clientes': { component: () => <Protected module="cartera-clientes"><CarteraClientesPage /></Protected>, icon: Users, name: 'Cartera de Clientes' },
  'recomendador-precios': { component: () => <Protected module="recomendador-precios"><RecomendadorPreciosPage /></Protected>, icon: DollarSign, name: 'Recomendador de Precios' },
  'cierre-caja': { component: () => <Protected module="cierre-caja"><CierreCajaPage /></Protected>, icon: Settings, name: 'Cierre de Caja' },
  'cuentas-bancarias': { component: () => <Protected module="cuentas-bancarias"><CuentasBancariasPage /></Protected>, icon: Landmark, name: 'Cuentas Bancarias' },
  'config_sistema': { component: () => <Protected module="config_sistema"><ConfiguracionSistemaPage /></Protected>, icon: Settings, name: 'Configuracion del Sistema' },
  'perfil-empresa': { component: () => <Protected module="perfil-empresa"><PerfilEmpresa /></Protected>, icon: Building2, name: 'Perfil Empresa' },
  'comprobantes-fiscales': { component: () => <Protected module="comprobantes-fiscales"><ComprobantesPage /></Protected>, icon: FileText, name: 'Comprobantes Fiscales' },
  'dgii-monitor': { component: () => <Protected module="dgii-monitor"><DgiiMonitorPage /></Protected>, icon: FileText, name: 'Monitor e-CF DGII' },
  'presupuesto-inteligente': { component: () => <Protected module="presupuesto-inteligente"><PresupuestoInteligentePage /></Protected>, icon: Sparkles, name: 'Presupuesto Inteligente' },
  'aprobaciones-compras': { component: () => <Protected module="aprobaciones-compras"><AprobacionesComprasPage /></Protected>, icon: ClipboardList, name: 'Aprobaciones de Compras' },
  'grupos-equivalentes': { component: () => <Protected module="grupos-equivalentes"><GruposEquivalentesPage /></Protected>, icon: Sparkles, name: 'Productos Equivalentes' },
  'master-panel': { component: () => <SuperAdminGuard><AdminDashboard /></SuperAdminGuard>, icon: Shield, name: 'Admin Dashboard' },
  'ai-ceo': { component: () => <Protected module="ai-ceo"><AICeoPage /></Protected>, icon: Brain, name: 'MORLA AI CEO' },
  'whatsapp-crm': { component: () => <Protected module="whatsapp-crm"><PlanGate nombre="Sales Hub / CRM"><WhatsAppCrmPage /></PlanGate></Protected>, icon: MessageCircle, name: 'Sales Hub' },
  'seguimientos-hoy': { component: () => <Protected module="clientes"><SeguimientosHoyPage /></Protected>, icon: CalendarClock, name: 'Seguimientos de Hoy' },
  'gps-dashboard': { component: () => <Protected module="gps-dashboard"><GpsDashboardPage /></Protected>, icon: RadioTower, name: 'GPS Dashboard' },
  'gps-dispositivos': { component: () => <Protected module="gps-dispositivos"><GpsDevicesPage /></Protected>, icon: RadioTower, name: 'GPS Dispositivos' },
  'gps-mapa': { component: () => <Protected module="gps-mapa"><GpsMapPage /></Protected>, icon: MapPin, name: 'GPS Mapa' },
  'gps-alertas': { component: () => <Protected module="gps-alertas"><GpsAlertsPage /></Protected>, icon: BellRing, name: 'GPS Alertas' },
  'gps-financiamiento': { component: () => <Protected module="gps-financiamiento"><GpsFinancingPage /></Protected>, icon: DollarSign, name: 'GPS Financiamiento' },
  'gps-dispositivo-detalle': { component: ({ extraData }) => <Protected module="gps-dispositivos"><GpsDeviceDetailPage extraData={extraData} /></Protected>, icon: RadioTower, name: 'GPS Detalle' },
  'planes': { component: PlanesPage, icon: CreditCard, name: 'Planes y Precios' },
  'prestamos': { component: ({ extraData }) => <Protected module="prestamos"><FinancieraPrestamosPage extraData={extraData} /></Protected>, icon: DollarSign, name: 'Préstamos' },
  'gestion-cobro': { component: () => <Protected module="prestamos"><GestionCobroPage /></Protected>, icon: MessageCircle, name: 'Gestion de Cobro' },
  'cuentas-incobrables': { component: () => <Protected module="prestamos"><CuentasIncobrablesPage /></Protected>, icon: ShieldAlert, name: 'Cuentas Incobrables' },
  'recibo-pago': { component: ({ extraData }) => <Protected module="prestamos"><ReciboPagoFinancieraPage extraData={extraData} /></Protected>, icon: Receipt, name: 'Recibo de Pago' },
  'nota-credito': { component: () => <Protected module="prestamos"><NotaCreditoFinancieraPage /></Protected>, icon: Receipt, name: 'Nota de Crédito' },
  'otras-transacciones': { component: () => <Protected module="prestamos"><OtrasTransaccionesPage /></Protected>, icon: Receipt, name: 'Otras Transacciones' },
  'historico-cliente': { component: () => <Protected module="prestamos"><HistoricoClientePage /></Protected>, icon: Receipt, name: 'Histórico de Cliente' },
  'notas-comentarios': { component: () => <Protected module="notas-comentarios"><NotasComentariosPage /></Protected>, icon: FileText, name: 'Notas y Comentarios' },
  'lista-chasis-prestamos': { component: () => <Protected module="prestamos"><ListaChasisPrestamosPage /></Protected>, icon: Receipt, name: 'Lista de Chasis en Préstamos' },
  'resumen-cartera': { component: () => <Protected module="prestamos"><ResumenCarteraPage /></Protected>, icon: PieChart, name: 'Resumen de Cartera' },
  'san': { component: () => <Protected module="san"><SanPage /></Protected>, icon: PiggyBank, name: 'SAN Ahorro' },
};

export { PanelContext, usePanels };  // re-export desde panelCore para no romper imports

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

// usePanels viene re-exportado desde panelCore.js arriba.

