/**
 * Helper para verificar permisos de acceso a módulos.
 * @param {Object} profile - Objeto de perfil del usuario (contiene role)
 * @param {Array} permissions - Lista de permisos del usuario (user_module_permissions)
 * @param {string} moduleKey - Identificador del módulo (ej: 'ventas', 'inventario')
 * @returns {boolean} - true si tiene acceso
 */
export const canAccess = (profile, permissions, moduleKey) => {
    if (!profile) return false;

    // Admin tiene acceso total
    if (profile.role === 'admin') return true;

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
    if (profile.role === 'admin') return true;
    if (!permissions) return false;

    const perm = permissions.find(p => p.module_key === moduleKey);
    return perm ? !!perm.can_edit : false;
};

export const MODULES = [
    { key: 'ventas', label: 'Ventas' },
    { key: 'recibo-ingreso', label: 'Recibo de Ingreso' },
    { key: 'compras', label: 'Compras' },
    { key: 'pedidos', label: 'Pedidos' },
    { key: 'cotizaciones', label: 'Cotizaciones' },
    { key: 'orden-compra', label: 'Orden de Compra' },
    { key: 'devoluciones', label: 'Devoluciones' },
    { key: 'pago-suplidores', label: 'Pago a Suplidores' },
    { key: 'pago-comisiones-vendedor', label: 'Pago Comisiones' },
    { key: 'mercancias', label: 'Inventario - Mercancías' },
    { key: 'entrada-mercancia', label: 'Entrada Mercancía' },
    { key: 'salida-mercancia', label: 'Salida Mercancía' },
    { key: 'actualizar-ubicacion', label: 'Actualizar Ubicación' },
    { key: 'etiquetas-masivas', label: 'Impresión Etiquetas' },
    { key: 'reporte-compras', label: 'Reporte de Compras' },
    { key: 'reporte-transacciones-diarias', label: 'Transacciones Diarias' },
    { key: 'inventario-fisico', label: 'Reporte - Inventario Físico' },
    { key: 'clientes', label: 'Catálogo - Clientes' },
    { key: 'suplidores', label: 'Catálogo - Suplidores' },
    { key: 'tipos-producto', label: 'Catálogo - Tipos de Producto' },
    { key: 'marcas', label: 'Catálogo - Marcas' },
    { key: 'modelos', label: 'Catálogo - Modelos' },
    { key: 'ubicaciones', label: 'Catálogo - Ubicaciones' },
    { key: 'usuarios', label: 'Configuración - Usuarios' },
];
