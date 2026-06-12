/**
 * Helper para verificar permisos de acceso a módulos.
 * @param {Object} profile - Objeto de perfil del usuario (contiene role)
 * @param {Array} permissions - Lista de permisos del usuario (user_module_permissions)
 * @param {string} moduleKey - Identificador del módulo (ej: 'ventas', 'inventario')
 * @returns {boolean} - true si tiene acceso
 */
export const canAccess = (profile, permissions, moduleKey) => {
    if (!profile) return false;

    // Admin y Owner tienen acceso total
    if (profile.role === 'admin' || profile.role === 'owner') return true;

    // Si no hay permisos definidos y es vendedor, por defecto denegar (o permitir según política)
    if (!permissions || !Array.isArray(permissions)) return false;

    // Buscar permiso por moduleKey
    const perm = permissions.find(p => p.module_key === moduleKey);

    // El permiso debe existir y tener can_view = true
    return perm ? !!perm.can_view : false;
};

/**
 * Helper para verificar permiso de edición.
 */
export const canEdit = (profile, permissions, moduleKey) => {
    if (!profile) return false;
    if (profile.role === 'admin' || profile.role === 'owner') return true;
    if (!permissions) return false;

    const perm = permissions.find(p => p.module_key === moduleKey);
    return perm ? !!perm.can_edit : false;
};

export const MODULES = [
    { key: 'ventas', label: 'Ventas' },
    { key: 'recibo-ingreso', label: 'Recibo de Ingreso' },
    { key: 'compras', label: 'Compras' },
    { key: 'pedidos', label: 'Pedidos' },
    { key: 'solicitudes-compras', label: 'Solicitudes de Compras' },
    { key: 'carta-ruta', label: 'Carta de Ruta' },
    { key: 'documentacion-cliente', label: 'Documentación Cliente' },
    { key: 'cotizaciones', label: 'Cotizaciones' },
    { key: 'cotizaciones-magna', label: 'Cot. Facturas Magna' },
    { key: 'orden-compra', label: 'Orden de Compra' },
    { key: 'ai-ceo', label: 'MORLA AI CEO' },
    { key: 'whatsapp-crm', label: 'Sales Hub' },
    { key: 'gps-dashboard', label: 'GPS - Dashboard' },
    { key: 'gps-dispositivos', label: 'GPS - Dispositivos' },
    { key: 'gps-mapa', label: 'GPS - Mapa' },
    { key: 'gps-alertas', label: 'GPS - Alertas' },
    { key: 'gps-financiamiento', label: 'GPS - Financiamiento' },
    { key: 'devoluciones', label: 'Devoluciones' },
    { key: 'pago-suplidores', label: 'Pago a Suplidores' },
    { key: 'pago-comisiones-vendedor', label: 'Pago Comisiones' },
    { key: 'mercancias', label: 'Inventario - Mercancías' },
    { key: 'entrada-mercancia', label: 'Entrada Mercancía' },
    { key: 'salida-mercancia', label: 'Salida Mercancía' },
    { key: 'actualizar-ubicacion', label: 'Actualizar Ubicación' },
    { key: 'etiquetas-masivas', label: 'Impresión Etiquetas' },
    { key: 'solicitudes', label: 'Inventario - Solicitudes Agotados' },
    { key: 'reporte-compras', label: 'Reporte de Compras' },
    { key: 'reporte-transacciones-diarias', label: 'Transacciones Diarias' },
    { key: 'inventario-fisico', label: 'Reporte - Inventario Físico' },
    { key: 'reportes-dgii', label: 'Reportes DGII (606/607/608)' },
    { key: 'libros-contables', label: 'Libros Contables Auxiliares' },
    { key: 'estado-resultados', label: 'Estado de Resultado' },
    { key: 'alertas-gerenciales', label: 'Alertas Gerenciales' },
    { key: 'rentabilidad-diaria', label: 'Rentabilidad Diaria' },
    { key: 'inventario-inteligente', label: 'Inventario Inteligente' },
    { key: 'flujo-caja', label: 'Flujo de Caja' },
    { key: 'cartera-clientes', label: 'Cartera de Clientes' },
    { key: 'recomendador-precios', label: 'Recomendador de Precios' },
    { key: 'clientes', label: 'Catálogo - Clientes' },
    { key: 'suplidores', label: 'Catálogo - Suplidores' },
    { key: 'tipos-producto', label: 'Catálogo - Tipos de Producto' },
    { key: 'marcas', label: 'Catálogo - Marcas' },
    { key: 'modelos', label: 'Catálogo - Modelos' },
    { key: 'ubicaciones', label: 'Catálogo - Ubicaciones' },
    { key: 'usuarios', label: 'Configuración - Usuarios' },
    { key: 'cierre-caja', label: 'Configuración - Cierre de Caja' },
    { key: 'config_sistema', label: 'Configuración - Sistema' },
    { key: 'perfil-empresa', label: 'Configuración - Perfil Empresa' },
    { key: 'comprobantes-fiscales', label: 'Configuración - Comprobantes Fiscales' },
    { key: 'presupuesto-inteligente', label: 'Configuración - Presupuesto Inteligente' },
    { key: 'aprobaciones-compras', label: 'Compras - Aprobaciones (supervisor)' },
    { key: 'grupos-equivalentes', label: 'Catálogo - Productos Equivalentes' },
    { key: 'vendedores', label: 'Catálogo - Vendedores' },
    { key: 'cambio-codigo', label: 'Inventario - Cambio de Código' },
];
