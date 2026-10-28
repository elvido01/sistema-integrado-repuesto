// (28/10/2026) La comisión "monto fijo por unidad" cuenta VEHÍCULOS (producto
// con chasis o de tipo motocicleta) e INMUEBLES (productos.naturaleza =
// 'inmueble'): ver sql/comision_fija_por_inmueble.sql. El texto sigue a lo que
// vende cada empresa. En las que no venden unidades así (repuestos, servicios)
// la opción no se ofrece: no contaría nada.
const UNIDADES = {
  dealer: { singular: 'motocicleta', plural: 'motocicletas', corta: 'moto', vendidas: 'Motos vendidas' },
  // MotoPréstamos vende motores del inventario compartido con Caminero.
  financiera: { singular: 'motocicleta', plural: 'motocicletas', corta: 'moto', vendidas: 'Motos vendidas' },
  inmobiliaria: { singular: 'inmueble', plural: 'inmuebles', corta: 'inmueble', vendidas: 'Inmuebles vendidos' },
};

/** null = esta empresa no paga por unidad (solo %). */
export const unidadComision = (tipoNegocio) => UNIDADES[tipoNegocio] || null;
