// Eventos cross-panel para mantener los módulos sincronizados entre sí.
// Los paneles (Mercancía, Orden de Compra, Compras, Ventas) permanecen montados
// al navegar (PanelContext no los desmonta), así que cada uno carga sus datos una
// sola vez al abrirse. Cuando otro módulo cambia algo (crea un suplidor, registra
// una venta que baja el stock, etc.), estos eventos avisan a los paneles abiertos
// para que refresquen sin tener que cerrarlos y reabrirlos.
//
// Patrón establecido en el proyecto: window.CustomEvent (sin context ni estado global).

export const PROVEEDORES_ACTUALIZADO = 'proveedores:actualizado';
export const CATALOGO_ACTUALIZADO = 'catalogo:actualizado';
export const INVENTARIO_ACTUALIZADO = 'inventario:actualizado';

/** Notifica a todos los módulos abiertos que la lista de proveedores cambió. */
export const emitProveedoresActualizado = () => {
  window.dispatchEvent(new CustomEvent(PROVEEDORES_ACTUALIZADO));
};

/**
 * Suscribe un callback al evento de proveedores actualizados.
 * Retorna una función de limpieza lista para devolver desde un useEffect.
 */
export const onProveedoresActualizado = (callback) => {
  window.addEventListener(PROVEEDORES_ACTUALIZADO, callback);
  return () => window.removeEventListener(PROVEEDORES_ACTUALIZADO, callback);
};

/**
 * Notifica que un catálogo (marcas, modelos, tipos, ubicaciones, etc.) cambió,
 * para que los selectores de cualquier panel abierto se refresquen.
 */
export const emitCatalogoActualizado = () => {
  window.dispatchEvent(new CustomEvent(CATALOGO_ACTUALIZADO));
};

/**
 * Suscribe un callback al evento de catálogo actualizado.
 * Retorna una función de limpieza lista para devolver desde un useEffect.
 */
export const onCatalogoActualizado = (callback) => {
  window.addEventListener(CATALOGO_ACTUALIZADO, callback);
  return () => window.removeEventListener(CATALOGO_ACTUALIZADO, callback);
};

/**
 * Notifica que el stock de uno o más productos cambió (ej. tras una venta),
 * para que los paneles que muestran existencias (Orden de Compra) se refresquen.
 * @param {string[]} productoIds - IDs de los productos afectados (opcional).
 */
export const emitInventarioActualizado = (productoIds = []) => {
  window.dispatchEvent(new CustomEvent(INVENTARIO_ACTUALIZADO, { detail: { productoIds } }));
};

/**
 * Suscribe un callback al evento de inventario actualizado. El callback recibe
 * el evento; los IDs afectados están en `e.detail.productoIds`.
 * Retorna una función de limpieza lista para devolver desde un useEffect.
 */
export const onInventarioActualizado = (callback) => {
  window.addEventListener(INVENTARIO_ACTUALIZADO, callback);
  return () => window.removeEventListener(INVENTARIO_ACTUALIZADO, callback);
};
