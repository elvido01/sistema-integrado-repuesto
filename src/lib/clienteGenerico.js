// Quién es "el cliente genérico", en un solo sitio.
//
// >>> QUE ES <<<
// Una venta de contado no lleva cliente registrado. En vez de dejar el
// campo vacío, el sistema apunta a una fila centinela — el Cliente
// Genérico — que significa "aquí no hay cliente, es consumidor final".
//
// Son DOS filas por razones históricas, y las dos viven en el tenant de
// Repuestos Morla aunque las usen cuatro empresas. Eso es intencional: el
// centinela es del SISTEMA, no de una empresa. Al mirar los datos parece un
// error de multiempresa y no lo es.
//
// >>> POR QUE ESTE ARCHIVO <<<
// (2026-08-17) Esta lista estaba copiada a mano en 13 archivos, 18 veces.
// Trece copias de la misma verdad es trece sitios donde puede quedar
// desactualizada — y ya pasó: DevolucionesPage no tenía la comprobación,
// hacía `cliente.id` a secas, y grabar una devolución de contado reventaba
// con "Cannot read properties of null". El cajero veía un error rojo sin
// más explicación.
//
// El centinela no aparece al buscar clientes de TU empresa (correctamente:
// no es tuyo), así que quien lo busque filtrando por tenant recibe null.
// Todo lo que trate con clientes tiene que contar con eso.

/** Las filas centinela. Si aparece una tercera, se agrega AQUÍ y ya. */
export const IDS_GENERICOS = Object.freeze([
  '00000000-0000-0000-0000-000000000000',   // Cliente Genérico
  '2749fa36-3d7c-4bdf-ad61-df88eda8365a',   // CLIENTE GENERICO CAMINERO
]);

/** El que usan las pantallas al elegir "consumidor final". */
export const ID_GENERICO_FINAL = '2749fa36-3d7c-4bdf-ad61-df88eda8365a';

/** El histórico, con el que nace el objeto centinela en Ventas y Cotizaciones. */
export const ID_GENERICO_BASE = '00000000-0000-0000-0000-000000000000';

/**
 * ¿Este id es el centinela? Acepta el id suelto o el objeto cliente, porque
 * en unos sitios se tiene uno y en otros el otro, y obligar a recordar cuál
 * es lo que produce las copias divergentes que esto viene a eliminar.
 */
export function esClienteGenerico(clienteOId) {
  if (!clienteOId) return false;
  const id = typeof clienteOId === 'string' ? clienteOId : clienteOId?.id;
  return IDS_GENERICOS.includes(id);
}

/**
 * El nombre que se enseña e imprime.
 *
 * Orden: lo que se escribió a mano en el documento gana — es lo que el
 * cajero tecleó para ESTA venta. Después el nombre del cliente si es uno de
 * verdad. Y si no hay nada, "CONSUMIDOR FINAL", que es la verdad y no un
 * hueco en blanco en un comprobante.
 */
export function nombreDeCliente(cliente, documento = null) {
  const manual = documento?.manual_cliente_nombre?.trim();
  if (manual) return manual;
  if (cliente?.nombre && !esClienteGenerico(cliente)) return cliente.nombre;
  return cliente?.nombre || 'CONSUMIDOR FINAL';
}
