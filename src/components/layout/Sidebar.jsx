import { tieneModulo } from '@/lib/modulos';
import React, { useState, useEffect, useCallback } from 'react';
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
  BellRing,
  Brain,
  FileImage,
  MessageCircle,
  RadioTower,
  MapPinned,
  Sparkles,
  ShieldAlert,
  PieChart,
  CalendarClock,
  PiggyBank,
  Landmark,
  TrendingUp,
  Bot,
} from 'lucide-react';
import { usePanels } from '@/contexts/PanelContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { canAccess } from '@/lib/permissionsHelper';
import Logo from '@/components/common/Logo';
import { useTheme } from '@/contexts/ThemeContext';
import NotificationBell from '@/components/layout/NotificationBell';
import AiCeoBell from '@/components/layout/AiCeoBell';
import { supabase } from '@/lib/customSupabaseClient';
import { useWhatsAppNotifications } from '@/contexts/WhatsAppNotificationContext';
import { useSuscripcion } from '@/contexts/SuscripcionContext';

const navItems = [
  {
    title: 'GPS',
    icon: RadioTower,
    subItems: [
      { title: 'Dashboard GPS', id: 'gps-dashboard', icon: RadioTower, modulo: 'gps' },
      { title: 'Dispositivos', id: 'gps-dispositivos', icon: RadioTower, modulo: 'gps' },
      { title: 'Mapa GPS', id: 'gps-mapa', icon: MapPinned, modulo: 'gps' },
      { title: 'Alertas GPS', id: 'gps-alertas', icon: BellRing, modulo: 'gps' },
      { title: 'Financiamiento', id: 'gps-financiamiento', icon: DollarSign, modulo: 'gps' },
    ],
  },
  {
    title: 'MOTOFLOW IA CEO',
    icon: Brain,
    subItems: [
      // (21/10/2026) IA CEO en MODO PRUEBA: solo Repuestos Morla y solo con
      // admin@repuestosmorla.com (decisión del dueño). La función ia-ceo-guia
      // y tenant_credit_plan lo limitan igual del lado del servidor.
      { title: 'Dashboard IA', id: 'ai-ceo', icon: Brain, modulo: 'ai_ceo_dashboard',
        emailOnly: ['admin@repuestosmorla.com'] },
      // Morla + MotoPréstamos Los Naranjos. A la financiera se le habilitó SOLO
      // este submódulo (el Dashboard IA sigue siendo exclusivo de Morla).
      { title: 'Gestión Empresarial IA', id: 'gestion-empresarial', icon: TrendingUp,
        modulo: 'gestion_empresarial' },
      // Equipo IA: del dueño, no de un puesto. Por eso va por correo y no
      // por rol — un admin nuevo mañana no debería heredarlo sin querer.
      // Esto solo lo ESCONDE; quien manda es public.equipo_ia_permitido()
      // en la base, que es donde una comprobación cuenta.
      { title: 'Equipo IA', id: 'equipo-ia', icon: Bot,
        modulo: 'equipo_ia',
        emailOnly: ['elvidocaminero@gmail.com', 'admin@repuestosmorla.com'] },
    ],
  },
  {
    title: 'CRM',
    icon: MessageCircle,
    subItems: [
      { title: 'Sales Hub', id: 'whatsapp-crm', icon: MessageCircle },
      { title: 'Seguimientos de Hoy', id: 'seguimientos-hoy', icon: CalendarClock, permissionKey: 'clientes', modulo: 'seguimientos_hoy' },
      { title: 'Clientes', id: 'clientes', icon: Users },
      { title: 'Cartera de Clientes', id: 'cartera-clientes', icon: Users },
    ],
  },
  {
    title: 'Transacciones',
    icon: ShoppingCart,
    subItems: [
      { title: 'Ventas', id: 'ventas' },
      { title: 'Recibo de Ingreso', id: 'recibo-ingreso', icon: Receipt },
      { title: 'Pedidos', id: 'pedidos', ocultarCon: 'ocultar_pedidos' },
      // Caminero Motors (terceros) + financieras que venden y financian propio
      { title: 'Solicitudes de Compras', id: 'solicitudes-compras', icon: ClipboardList, modulo: 'solicitudes_compras' },
      { title: 'Carta de Ruta', id: 'carta-ruta', icon: FileText, modulo: 'carta_ruta' },
      // (27/10/2026) Inmobiliaria: solares vendidos, el traspaso (3%) y el contrato.
      { title: 'Inmuebles Vendidos', id: 'inmuebles-vendidos', icon: Landmark, tipoNegocio: 'inmobiliaria', permissionKey: 'ventas' },
      { title: 'Cotizaciones', id: 'cotizaciones' },
      { title: 'Cot. Facturas Magna', id: 'cotizaciones-magna', icon: FileText, modulo: 'cotizaciones_magna' },
      { title: 'Devoluciones', id: 'devoluciones' },
    ],
  },
  {
    // Financieras + Caminero Motors (igual al menú Documentos del sistema
    // viejo). Caminero y Naranjos comparten los datos de este módulo.
    // Notas y Comentarios incluye la Documentación Cliente (formulario
    // combinado); el listado general se abre desde un botón interno.
    title: 'Documentos',
    icon: FileText,
    subItems: [
      { title: 'Notas y Comentarios', id: 'notas-comentarios', icon: FileText, tipoNegocio: 'financiera', moduloOr: 'notas_comentarios' },
    ],
  },
  {
    title: 'Cuentas por Pagar',
    icon: DollarSign,
    subItems: [
      { title: 'Orden de Compra', id: 'orden-compra', ocultarEnTipos: ['servicios', 'inmobiliaria'] },
      { title: 'Compras', id: 'compras' },
      { title: 'Pago a Suplidores', id: 'pago-suplidores', icon: Truck },
      { title: 'Pago Comisiones', id: 'pago-comisiones-vendedor', icon: Users },
      { title: 'Nómina', id: 'nomina', icon: Users },
    ],
  },
  {
    title: 'Financiera',
    icon: DollarSign,
    subItems: [
      { title: 'Resumen de Cartera', id: 'resumen-cartera', icon: PieChart, featFlag: 'feat_financiera' },
      { title: 'Préstamos', id: 'prestamos', icon: DollarSign, featFlag: 'feat_financiera' },
      { title: 'Nota de Crédito', id: 'nota-credito', icon: Receipt, featFlag: 'feat_financiera', adminOnly: true },
      { title: 'Gestion de Cobro', id: 'gestion-cobro', icon: MessageCircle, featFlag: 'feat_financiera' },
      { title: 'Cuentas Incobrables', id: 'cuentas-incobrables', icon: ShieldAlert, featFlag: 'feat_financiera' },
      { title: 'Otras Transacciones', id: 'otras-transacciones', icon: Receipt, featFlag: 'feat_financiera' },
      { title: 'Histórico de Cliente', id: 'historico-cliente', icon: Receipt, featFlag: 'feat_financiera' },
      { title: 'Lista de Chasis en Préstamos', id: 'lista-chasis-prestamos', icon: Receipt, featFlag: 'feat_financiera' },
    ],
  },
  {
    title: 'Inventario',
    icon: Package,
    subItems: [
      { title: 'Mercancías', id: 'mercancias' },
      { title: 'Almacenes', id: 'almacenes', icon: Warehouse, ocultarEnTipos: ['servicios'] },
      { title: 'Entrada Mercancía', id: 'entrada-mercancia', icon: Download, ocultarEnTipos: ['servicios'] },
      { title: 'Salida Mercancía', id: 'salida-mercancia', icon: Upload, ocultarEnTipos: ['servicios'] },
      { title: 'Actualizar Ubicación', id: 'actualizar-ubicacion', ocultarEnTipos: ['servicios', 'inmobiliaria'] },
      { title: 'Imp. Etiquetas', id: 'etiquetas-masivas', icon: Barcode, ocultarEnTipos: ['servicios', 'inmobiliaria'] },
      { title: 'Solicitudes Agotados', id: 'solicitudes', icon: ClipboardList, ocultarEnTipos: ['servicios', 'inmobiliaria'] },
    ],
  },
  {
    title: 'Cuentas Bancarias',
    icon: Landmark,
    subItems: [
      { title: 'Cuentas y Saldos', id: 'cuentas-bancarias', icon: Landmark },
      { title: 'SAN Ahorro', id: 'san', icon: PiggyBank, modulo: 'san' },
    ],
  },
  {
    title: 'Reportes',
    icon: BarChart2,
    subItems: [
      { title: 'Reporte de Compras', id: 'reporte-compras' },
      { title: 'Transacciones de Inventario', id: 'reporte-movimientos', ocultarEnTipos: ['servicios'] },
      { title: 'Transacciones Diarias', id: 'reporte-transacciones-diarias', icon: ListChecks },
      { title: 'Inventario Físico', id: 'inventario-fisico', icon: Archive, ocultarEnTipos: ['servicios'] },
      { title: 'Reportes DGII (606/607/608)', id: 'reportes-dgii', icon: FileText },
      { title: 'Libros Contables', id: 'libros-contables', icon: FileText },
      { title: 'Estado de Resultado', id: 'estado-resultados', icon: DollarSign },
      { title: 'Alertas Gerenciales', id: 'alertas-gerenciales', icon: BellRing },
      { title: 'Rentabilidad Diaria', id: 'rentabilidad-diaria', icon: DollarSign },
      { title: 'Inventario Inteligente', id: 'inventario-inteligente', icon: Warehouse, ocultarEnTipos: ['servicios', 'inmobiliaria'] },
      { title: 'Flujo de Caja', id: 'flujo-caja', icon: DollarSign },
      { title: 'Cartera de Clientes', id: 'cartera-clientes', icon: Users },
      { title: 'Recomendador de Precios', id: 'recomendador-precios', icon: DollarSign, ocultarEnTipos: ['servicios', 'inmobiliaria'] },
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
      { title: 'Marcas', id: 'marcas', ocultarEnTipos: ['servicios', 'inmobiliaria'] },
      { title: 'Modelos', id: 'modelos', ocultarEnTipos: ['servicios', 'inmobiliaria'] },
      { title: 'Ubicaciones', id: 'ubicaciones', ocultarEnTipos: ['servicios', 'inmobiliaria'] },
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
      { title: 'Monitor e-CF DGII', id: 'dgii-monitor', icon: FileText },
    ],
  },
];

// (27/10/2026) El nombre de "Mercancías" según lo que vende la empresa.
const TITULOS_POR_TIPO = {
  servicios: { mercancias: 'Servicios' },
  inmobiliaria: { mercancias: 'Inmuebles y Servicios' },
};
const tituloPorTipo = (sub, tipo) => TITULOS_POR_TIPO[tipo]?.[sub.id] || sub.title;

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
  const { profile, permissions, user, signOut, isSuperAdmin, tenantId, empresa } = useAuth();
  const { planActual } = useSuscripcion();
  // Funciones Plus: solo planes PRO/ENTERPRISE (y super admin).
  const puedePlus = isSuperAdmin || ['PRO', 'ENTERPRISE'].includes((planActual || '').toUpperCase());
  const { theme, toggleTheme } = useTheme();
  const { totalUnread } = useWhatsAppNotifications();
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [adminAlertCount, setAdminAlertCount] = useState(0);

  // Multi-empresa: mismo usuario/contraseña en varias empresas (como el
  // selector del sistema viejo). Solo aparece si pertenece a más de una.
  const [misEmpresas, setMisEmpresas] = useState([]);
  const [cambiandoEmpresa, setCambiandoEmpresa] = useState(false);

  useEffect(() => {
    if (!user?.id) { setMisEmpresas([]); return; }
    supabase.rpc('get_mis_empresas').then(({ data, error }) => {
      if (!error && Array.isArray(data)) setMisEmpresas(data);
    }, () => {});
  }, [user?.id]);

  const cambiarEmpresa = async (nuevoTenant) => {
    if (!nuevoTenant || nuevoTenant === tenantId) return;
    setCambiandoEmpresa(true);
    const { error } = await supabase.rpc('cambiar_empresa_activa', { p_tenant: nuevoTenant });
    if (error) {
      setCambiandoEmpresa(false);
      console.error('cambiar_empresa_activa:', error.message);
      return;
    }
    // Recarga completa: todo el estado (paneles, cachés) es de la otra empresa
    window.location.reload();
  };

  const fetchAdminAlerts = useCallback(async () => {
    if (!isSuperAdmin) {
      setAdminAlertCount(0);
      return;
    }

    try {
      const [pagosRes, tenantsRes] = await Promise.all([
        supabase.rpc('admin_get_pagos_pendientes'),
        supabase.rpc('admin_get_tenants_detalle'),
      ]);

      const pagosCount = !pagosRes.error && Array.isArray(pagosRes.data) ? pagosRes.data.length : 0;
      const tenantsData = !tenantsRes.error && Array.isArray(tenantsRes.data) ? tenantsRes.data : [];
      const membresiasUrgentes = tenantsData.filter((tenant) => {
        const sub = tenant.suscripcion || {};
        const estado = sub.estado || 'sin_suscripcion';
        const dias = Number(sub.dias_restantes || 0);
        return estado === 'vencido' || estado === 'sin_suscripcion' || (['activo', 'trial'].includes(estado) && dias > 0 && dias <= 3);
      }).length;

      setAdminAlertCount(pagosCount + membresiasUrgentes);
    } catch (err) {
      console.warn('[Sidebar] No se pudieron cargar alertas admin:', err.message);
      setAdminAlertCount(0);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    const group = findGroupForPanel(activePanel);
    if (group) setExpandedGroup(group);
  }, [activePanel]);

  useEffect(() => {
    fetchAdminAlerts();
    if (!isSuperAdmin) return undefined;

    const interval = setInterval(fetchAdminAlerts, 2 * 60 * 1000);
    const onFocus = () => fetchAdminAlerts();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchAdminAlerts, isSuperAdmin]);

  const toggleGroup = (title) => {
    setExpandedGroup(prev => prev === title ? null : title);
  };

  const handleGroupClick = (title) => {
    if (!sidebarOpen) {
      setSidebarOpen(true);
      setExpandedGroup(title);
      return;
    }
    toggleGroup(title);
  };

  const handleNavClick = (id) => {
    if (!sidebarOpen && window.innerWidth >= 768) {
      setSidebarOpen(true);
    }
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
            // Empresa solo-consulta (ej. REPUESTOS MORLA VIEJA): se ocultan
            // Pedidos y Cotizaciones. El Punto de Venta (ventas) SÍ se deja
            // abierto para consultar y mover productos al sistema nuevo, pero
            // el cobro queda bloqueado (banner + trigger en la BD).
            if (empresa?.solo_consulta && ['pedidos', 'cotizaciones', 'cotizaciones-magna'].includes(sub.id)) return false;
            // Módulos apagados para toda la empresa (config_empresa.modulos_deshabilitados)
            const apagados = empresa?.modulos_deshabilitados || [];
            if (apagados.includes(sub.id) || apagados.includes(sub.permissionKey)) return false;
            // (10/10/2026) Módulos por empresa: config_empresa.modulos (antes,
            // uuids de empresas fijos en el código). sql/modulos_por_empresa.sql
            if (sub.modulo && !tieneModulo(empresa, sub.modulo)) return false;
            if (sub.ocultarCon && tieneModulo(empresa, sub.ocultarCon)) return false;
            // Módulos de una persona concreta, no de un rol (ej. Equipo IA).
            if (sub.emailOnly && !sub.emailOnly.includes((user?.email || '').toLowerCase())) return false;
            if (sub.featFlag && !empresa?.[sub.featFlag]) return false; // módulos por flag de empresa (ej. financiera)
            // módulos por tipo de negocio (ej. Documentos); moduloOr = módulo que
            // también lo enciende aunque la empresa no sea de ese tipo
            // (27/10/2026) Lo que no aplica a un tipo de empresa (servicios no tiene inventario).
            if (sub.ocultarEnTipos?.includes(empresa?.tipo_negocio)) return false;
            if (sub.tipoNegocio && empresa?.tipo_negocio !== sub.tipoNegocio
                && !(sub.moduloOr && tieneModulo(empresa, sub.moduloOr))) return false;
            if (sub.adminOnly && !['admin', 'owner', 'manager', 'gerente'].includes(profile?.role)) return false; // ej. Nota de Crédito
            if (sub.id === 'whatsapp-crm' && !puedePlus) return false; // Sales Hub = función Plus (PRO/ENTERPRISE)
            return canAccess(profile, permissions, sub.permissionKey || sub.id);
          });
          if (allowedSubItems.length === 0) return null;

          const isExpanded = expandedGroup === item.title;
          const hasActiveChild = isGroupActive(item);
          const Icon = item.icon;
          const groupUnread = item.title === 'CRM' ? totalUnread : 0;

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
                onClick={() => handleGroupClick(item.title)}
                className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                  isExpanded && sidebarOpen
                    ? 'bg-blue-50/80 text-blue-700'
                    : hasActiveChild
                      ? 'text-blue-700'
                      : 'text-slate-500 hover:bg-blue-50/60 hover:text-slate-700'
                }`}
              >
                <div className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${
                  hasActiveChild
                    ? 'bg-blue-100 text-blue-600'
                    : isExpanded
                      ? 'bg-blue-100/70 text-blue-500'
                      : 'bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500'
                }`}>
                  <Icon className="w-[18px] h-[18px]" />
                  {!sidebarOpen && groupUnread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[9px] font-black flex items-center justify-center bg-emerald-500 text-white">
                      {groupUnread > 9 ? '9+' : groupUnread}
                    </span>
                  )}
                </div>
                {sidebarOpen && (
                  <>
                    <span className="flex-1 text-left truncate">{item.title}</span>
                    {groupUnread > 0 && (
                      <span className="min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center bg-emerald-500 text-white shadow-sm shadow-emerald-200">
                        {groupUnread > 99 ? '99+' : groupUnread}
                      </span>
                    )}
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
                        const subUnread = subItem.id === 'whatsapp-crm' ? totalUnread : 0;
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
                            <span className="truncate flex-1">{tituloPorTipo(subItem, empresa?.tipo_negocio)}</span>
                            {subUnread > 0 && (
                              <span className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center ${
                                isSubActive ? 'bg-white text-emerald-600' : 'bg-emerald-500 text-white'
                              }`}>
                                {subUnread > 99 ? '99+' : subUnread}
                              </span>
                            )}
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
              <span className="flex-1 text-left">Admin Dashboard</span>
              {adminAlertCount > 0 && (
                <span
                  className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center ${
                    activePanel === 'master-panel'
                      ? 'bg-white text-red-600'
                      : 'bg-red-600 text-white shadow-sm shadow-red-200'
                  }`}
                  title={`${adminAlertCount} alerta${adminAlertCount === 1 ? '' : 's'} de pagos o membresias`}
                >
                  {adminAlertCount > 99 ? '99+' : adminAlertCount}
                </span>
              )}
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
            {/* Selector de empresa (solo si el usuario pertenece a varias) */}
            {misEmpresas.length > 1 && (
              <select
                value={tenantId || ''}
                onChange={(e) => cambiarEmpresa(e.target.value)}
                disabled={cambiandoEmpresa}
                className="w-full h-8 text-[11px] font-bold border border-blue-200/60 rounded-lg px-2 bg-white text-blue-700 cursor-pointer"
                title="Cambiar de empresa (mismo usuario y contraseña)"
              >
                {misEmpresas.map((e) => (
                  <option key={e.tenant_id} value={e.tenant_id}>{e.nombre}</option>
                ))}
              </select>
            )}
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2 text-[11px] text-blue-700 bg-blue-100/60 px-2.5 py-2 rounded-lg flex-1 overflow-hidden border border-blue-200/50">
                <User className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" />
                <span className="truncate">{user?.email}</span>
              </div>
              <AiCeoBell />
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
            {/* >>> PLEGADO NO SE CIERRA SESION <<<
                Aquí había un botón que llamaba a signOut() directo. Un icono
                de 40px, sin texto y sin confirmación, en el borde de la
                pantalla: el sitio exacto donde se hace clic sin querer. Y lo
                que se pierde no es un clic, es la sesión — con la factura a
                medias, si estabas facturando.

                Ahora abre el menú, igual que el botón de arriba. Salir sigue
                estando a un clic de distancia, pero después de ver la palabra
                "Cerrar Sesión" escrita. */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="h-10 w-10 p-0 flex items-center justify-center rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-100 transition-colors"
              title="Abrir el menú (para cerrar sesión, ábrelo primero)"
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
