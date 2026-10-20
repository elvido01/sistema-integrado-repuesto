import React, { useEffect, useState, lazy as reactLazy } from 'react';

// (15/10/2026) Cada pantalla diferida se anota para PRECARGARLA en segundo
// plano al entrar. Así una pestaña abierta sigue abriendo todas sus pantallas
// aunque se publique una versión nueva (los archivos viejos desaparecen del
// servidor). Antes, en ese caso, la página se recargaba sola y se perdía lo
// que estuviera a medias — p. ej. una venta.
const importadores = [];
const lazy = (importar) => { importadores.push(importar); return reactLazy(importar); };
export function precargarPantallas() {
  let i = 0;
  const siguiente = () => {
    if (i >= importadores.length) return;
    importadores[i++]().catch(() => {}).finally(() => setTimeout(siguiente, 150));
  };
  siguiente();
}
import { PanelContext, usePanels } from './panelCore';
import { panelActivo, publicarModulos } from '@/lib/pantallaContexto';
import { Home, ShoppingCart, Truck, BarChart2, Package, MapPin, FileText, Settings, CornerUpLeft, ListOrdered, Users, Briefcase, Archive, Upload, Download, ListChecks, Receipt, DollarSign, UserCog, RefreshCw, Barcode, ClipboardList, Building2, Shield, CreditCard, Warehouse, BellRing, Brain, FileImage, MessageCircle, RadioTower, Sparkles, ShieldAlert, PieChart, CalendarClock, Wallet, PiggyBank, Landmark } from 'lucide-react';

import HomePage from '@/pages/HomePage';
const VentasPage = lazy(() => import('@/pages/VentasPage'));
const ComprasPage = lazy(() => import('@/pages/ComprasPage'));
const OrdenCompraPage = lazy(() => import('@/pages/OrdenCompraPage'));
const ProductsPage = lazy(() => import('@/pages/ProductsPage'));
const UpdateLocationPage = lazy(() => import('@/pages/UpdateLocationPage'));
const ReporteComprasPage = lazy(() => import('@/pages/ReporteComprasPage'));
const ReporteTransaccionesDiariasPage = lazy(() => import('@/pages/ReporteTransaccionesDiariasPage'));
const DevolucionesPage = lazy(() => import('@/pages/DevolucionesPage'));
const PedidosPage = lazy(() => import('@/pages/PedidosPage'));
const CotizacionPage = lazy(() => import('@/pages/CotizacionPage'));
const ClientesPage = lazy(() => import('@/pages/ClientesPage'));
const SuplidoresPage = lazy(() => import('@/pages/SuplidoresPage'));
const EntradaMercanciaPage = lazy(() => import('@/pages/EntradaMercanciaPage'));
const SalidaMercanciaPage = lazy(() => import('@/pages/SalidaMercanciaPage'));
const ReciboIngresoPage = lazy(() => import('@/pages/ReciboIngresoPage'));
const PagoSuplidoresPage = lazy(() => import('@/pages/PagoSuplidoresPage'));
const PagoComisionesPage = lazy(() => import('@/pages/PagoComisionesPage'));
const UsuariosPermissionsPage = lazy(() => import('@/pages/Configuracion/UsuariosPermissionsPage'));
const CierreCajaPage = lazy(() => import('@/pages/Configuracion/CierreCajaPage'));
const CambioCodigoPage = lazy(() => import('@/pages/CambioCodigoPage'));
const ConfiguracionSistemaPage = lazy(() => import('@/pages/Configuracion/ConfiguracionSistemaPage'));
const CatalogPage = lazy(() => import('@/pages/CatalogPage'));
const EtiquetasMasivasPage = lazy(() => import('@/pages/EtiquetasMasivasPage'));
const VendedoresPage = lazy(() => import('@/pages/VendedoresPage'));
const InventarioFisicoPage = lazy(() => import('@/pages/InventarioFisicoPage'));
const ReporteMovimientosPage = lazy(() => import('@/pages/ReporteMovimientosPage'));
const SolicitudesPage = lazy(() => import('@/pages/SolicitudesPage'));
const SolicitudesComprasPage = lazy(() => import('@/pages/SolicitudesComprasPage'));
const CartaRutaPage = lazy(() => import('@/pages/CartaRutaPage'));
const DocumentacionClientePage = lazy(() => import('@/pages/DocumentacionClientePage'));
const ReportesDGIIPage = lazy(() => import('@/pages/ReportesDGIIPage'));
const LibrosContablesPage = lazy(() => import('@/pages/LibrosContablesPage'));
const EstadoResultadosPage = lazy(() => import('@/pages/EstadoResultadosPage'));
const AlertasGerencialesPage = lazy(() => import('@/pages/AlertasGerencialesPage'));
const RentabilidadDiariaPage = lazy(() => import('@/pages/RentabilidadDiariaPage'));
const InventarioInteligentePage = lazy(() => import('@/pages/InventarioInteligentePage'));
const FlujoCajaPage = lazy(() => import('@/pages/FlujoCajaPage'));
const CarteraClientesPage = lazy(() => import('@/pages/CarteraClientesPage'));
const RecomendadorPreciosPage = lazy(() => import('@/pages/RecomendadorPreciosPage'));
const CotizacionesMagnaPage = lazy(() => import('@/pages/CotizacionesMagnaPage'));
const PerfilEmpresa = lazy(() => import('@/pages/Configuracion/PerfilEmpresa'));
const ComprobantesPage = lazy(() => import('@/pages/Configuracion/ComprobantesPage'));
const DgiiMonitorPage = lazy(() => import('@/pages/Configuracion/DgiiMonitorPage'));
const PresupuestoInteligentePage = lazy(() => import('@/pages/Configuracion/PresupuestoInteligentePage'));
const CuentasBancariasPage = lazy(() => import('@/pages/CuentasBancariasPage'));
const AprobacionesComprasPage = lazy(() => import('@/pages/AprobacionesComprasPage'));
const GruposEquivalentesPage = lazy(() => import('@/pages/GruposEquivalentesPage'));
const AdminDashboard = lazy(() => import('@/pages/Admin/AdminDashboard'));
const AICeoPage = lazy(() => import('@/pages/AICeoPage'));
const GestionEmpresarialPage = lazy(() => import('@/pages/GestionEmpresarialPage'));
const EquipoIAPage = lazy(() => import('@/pages/EquipoIAPage'));
const PlanesPage = lazy(() => import('@/pages/PlanesPage'));
const WhatsAppCrmPage = lazy(() => import('@/pages/WhatsAppCrmPage'));
const GpsDashboardPage = lazy(() => import('@/pages/gps/GpsDashboardPage'));
const GpsDevicesPage = lazy(() => import('@/pages/gps/GpsDevicesPage'));
const GpsMapPage = lazy(() => import('@/pages/gps/GpsMapPage'));
const GpsAlertsPage = lazy(() => import('@/pages/gps/GpsAlertsPage'));
const GpsFinancingPage = lazy(() => import('@/pages/gps/GpsFinancingPage'));
const GpsDeviceDetailPage = lazy(() => import('@/pages/gps/GpsDeviceDetailPage'));
const FinancieraPrestamosPage = lazy(() => import('@/pages/FinancieraPrestamosPage'));
const ReciboPagoFinancieraPage = lazy(() => import('@/pages/ReciboPagoFinancieraPage'));
const OtrasTransaccionesPage = lazy(() => import('@/pages/OtrasTransaccionesPage'));
const HistoricoClientePage = lazy(() => import('@/pages/HistoricoClientePage'));
const NotasComentariosPage = lazy(() => import('@/pages/NotasComentariosPage'));
const ListaChasisPrestamosPage = lazy(() => import('@/pages/ListaChasisPrestamosPage'));
const ResumenCarteraPage = lazy(() => import('@/pages/ResumenCarteraPage'));
const GestionCobroPage = lazy(() => import('@/pages/GestionCobroPage'));
const CuentasIncobrablesPage = lazy(() => import('@/pages/CuentasIncobrablesPage'));
const SeguimientosHoyPage = lazy(() => import('@/pages/SeguimientosHoyPage'));
const NominaPage = lazy(() => import('@/pages/NominaPage'));
const SanPage = lazy(() => import('@/pages/SanPage'));
const NotaCreditoFinancieraPage = lazy(() => import('@/pages/NotaCreditoFinancieraPage'));
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

// (11/10/2026) Pantallas con carga diferida (React.lazy): antes las 67 iban en
// el archivo principal (5.7 MB) y se bajaban al entrar aunque no se abrieran.
// Cada una se descarga la primera vez que se abre. El "Cargando…" y la
// recarga ante archivos viejos tras publicar están en PanelManager.
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
  'ai-ceo': { component: () => <Protected module="ai-ceo"><AICeoPage /></Protected>, icon: Brain, name: 'MOTOFLOW IA CEO' },
  'gestion-empresarial': { component: () => <Protected module="gestion-empresarial"><GestionEmpresarialPage /></Protected>, icon: Brain, name: 'Gestión Empresarial IA' },
  // El permiso real vive en la base (public.equipo_ia_permitido). Aquí solo
  // se registra el panel: la propia página enseña "es del dueño" si no toca.
  'equipo-ia': { component: () => <EquipoIAPage />, icon: Brain, name: 'Equipo IA' },
  'whatsapp-crm': { component: ({ extraData }) => <Protected module="whatsapp-crm"><PlanGate nombre="Sales Hub / CRM"><WhatsAppCrmPage extraData={extraData} /></PlanGate></Protected>, icon: MessageCircle, name: 'Sales Hub' },
  'seguimientos-hoy': { component: () => <Protected module="clientes"><SeguimientosHoyPage /></Protected>, icon: CalendarClock, name: 'Seguimientos de Hoy' },
  'gps-dashboard': { component: () => <Protected module="gps-dashboard"><GpsDashboardPage /></Protected>, icon: RadioTower, name: 'GPS Dashboard' },
  'gps-dispositivos': { component: () => <Protected module="gps-dispositivos"><GpsDevicesPage /></Protected>, icon: RadioTower, name: 'GPS Dispositivos' },
  'gps-mapa': { component: () => <Protected module="gps-mapa"><GpsMapPage /></Protected>, icon: MapPin, name: 'GPS Mapa' },
  'gps-alertas': { component: () => <Protected module="gps-alertas"><GpsAlertsPage /></Protected>, icon: BellRing, name: 'GPS Alertas' },
  'gps-financiamiento': { component: () => <Protected module="gps-financiamiento"><GpsFinancingPage /></Protected>, icon: DollarSign, name: 'GPS Financiamiento' },
  'gps-dispositivo-detalle': { component: ({ extraData }) => <Protected module="gps-dispositivos"><GpsDeviceDetailPage extraData={extraData} /></Protected>, icon: RadioTower, name: 'GPS Detalle' },
  'planes': { component: PlanesPage, icon: CreditCard, name: 'Planes y Precios' },
  'prestamos': { component: ({ extraData }) => <Protected module="prestamos"><FinancieraPrestamosPage extraData={extraData} /></Protected>, icon: DollarSign, name: 'Préstamos' },
  'gestion-cobro': { component: () => <Protected module="gestion-cobro"><GestionCobroPage /></Protected>, icon: MessageCircle, name: 'Gestion de Cobro' },
  'cuentas-incobrables': { component: () => <Protected module="cuentas-incobrables"><CuentasIncobrablesPage /></Protected>, icon: ShieldAlert, name: 'Cuentas Incobrables' },
  'recibo-pago': { component: ({ extraData }) => <Protected module="prestamos"><ReciboPagoFinancieraPage extraData={extraData} /></Protected>, icon: Receipt, name: 'Recibo de Pago' },
  'nota-credito': { component: () => <Protected module="nota-credito"><NotaCreditoFinancieraPage /></Protected>, icon: Receipt, name: 'Nota de Crédito' },
  'otras-transacciones': { component: () => <Protected module="otras-transacciones"><OtrasTransaccionesPage /></Protected>, icon: Receipt, name: 'Otras Transacciones' },
  'historico-cliente': { component: () => <Protected module="historico-cliente"><HistoricoClientePage /></Protected>, icon: Receipt, name: 'Histórico de Cliente' },
  'notas-comentarios': { component: () => <Protected module="notas-comentarios"><NotasComentariosPage /></Protected>, icon: FileText, name: 'Notas y Comentarios' },
  'lista-chasis-prestamos': { component: () => <Protected module="lista-chasis-prestamos"><ListaChasisPrestamosPage /></Protected>, icon: Receipt, name: 'Lista de Chasis en Préstamos' },
  'resumen-cartera': { component: () => <Protected module="resumen-cartera"><ResumenCarteraPage /></Protected>, icon: PieChart, name: 'Resumen de Cartera' },
  'san': { component: () => <Protected module="san"><SanPage /></Protected>, icon: PiggyBank, name: 'SAN Ahorro' },
};

export { PanelContext, usePanels };  // re-export desde panelCore para no romper imports

export const PanelProvider = ({ children }) => {
  const [panels, setPanels] = useState([{ id: 'inicio', ...componentMapping['inicio'] }]);
  const [activePanel, setActivePanel] = useState('inicio');

  // Precarga de todas las pantallas, 8 s después de entrar (sin estorbar el
  // arranque). Ver precargarPantallas.
  useEffect(() => {
    const t = setTimeout(precargarPantallas, 8000);
    return () => clearTimeout(t);
  }, []);

  // El agente sabe en qué pantalla estás. Al cambiar de panel se borran los
  // datos del anterior: que hable del cierre de caja mientras miras Ventas
  // sería peor que no saber nada.
  useEffect(() => {
    panelActivo(activePanel, componentMapping[activePanel]?.name || activePanel);
  }, [activePanel]);

  // La lista de módulos que existen, para que el agente pueda abrirlos por
  // nombre. Cada uno sigue envuelto en <Protected>, así que si el usuario no
  // tiene permiso, la pantalla se lo niega igual: el agente puede pedir
  // abrirla, no saltarse el permiso.
  useEffect(() => {
    publicarModulos(
      Object.entries(componentMapping).map(([id, m]) => ({ id, nombre: m.name || id })),
    );
  }, []);

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

