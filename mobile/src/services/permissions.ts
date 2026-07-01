export type ModulePermission = {
  module_key: string;
  can_view?: boolean | null;
  can_edit?: boolean | null;
};

export type MobileModule = {
  key: string;
  label: string;
  description: string;
};

export const MOBILE_MODULES: MobileModule[] = [
  { key: 'scanner', label: 'Scanner', description: 'Escaneo rapido de codigos.' },
  { key: 'catalogo', label: 'Catalogo', description: 'Buscar productos y agregar al carrito.' },
  { key: 'ventas', label: 'Venta / POS', description: 'Facturar desde la app movil.' },
  { key: 'cotizaciones', label: 'Cotizaciones', description: 'Crear y enviar cotizaciones.' },
  { key: 'pedidos', label: 'Pedidos', description: 'Crear pedidos moviles.' },
  { key: 'recibo-ingreso', label: 'Recibo de Ingreso', description: 'Cobros y recibos de clientes.' },
  { key: 'solicitudes-compras', label: 'Solicitudes de Compra', description: 'Solicitudes de vehiculos y financiamiento.' },
  { key: 'orden-compra', label: 'Orden de Compra', description: 'Crear ordenes de compra.' },
  { key: 'actualizar-ubicacion', label: 'Ubicacion de Productos', description: 'Cambiar ubicaciones de mercancias.' },
  { key: 'actualizar-existencia', label: 'Actualizar Existencia', description: 'Ajustar existencia fisica.' },
  { key: 'recepcion-mercancia', label: 'Recepcion de Mercancia', description: 'Recibir mercancias pendientes.' },
  { key: 'impresora-bluetooth', label: 'Impresora Bluetooth', description: 'Vincular y probar impresora.' },
  { key: 'configuracion', label: 'Configuracion', description: 'Gestionar cargos y permisos.' },
];

export const isFullAccessRole = (role?: string | null, isSuperAdmin?: boolean | null) => {
  const normalized = String(role || '').toLowerCase();
  return !!isSuperAdmin || normalized === 'admin' || normalized === 'owner';
};

export const canAccessModule = (
  profile: { role?: string | null; is_superadmin?: boolean | null } | null,
  permissions: ModulePermission[] | null | undefined,
  moduleKey: string
) => {
  if (!profile) return false;
  if (isFullAccessRole(profile.role, profile.is_superadmin)) return true;
  return !!permissions?.find((perm) => perm.module_key === moduleKey && perm.can_view);
};
