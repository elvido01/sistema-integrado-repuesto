/**
 * secuenciasRepository — Centraliza la generación de números secuenciales
 * para documentos del sistema (Fase 2.3).
 *
 * Antes había ~20 llamadas dispersas tipo:
 *   const { data, error } = await supabase.rpc('get_next_xxx_numero');
 *
 * Aquí encapsulamos cada secuencia con nombre semántico y manejo de error
 * consistente.
 *
 * **Importante**: cada RPC genera y persiste el siguiente número en BD
 * (atómico, por tenant). Llamarla "reserva" el número — si después
 * la operación falla, el número queda saltado.
 */

import { supabase } from '@/lib/customSupabaseClient';
import { runRpc } from './errorHandler';

/**
 * Mapping de tipos de documento → RPC name.
 * Mantener sincronizado con los nombres de funciones en sql/.
 */
const RPC_BY_TIPO = Object.freeze({
  factura:         'get_next_factura_numero',
  cotizacion:      'get_next_cotizacion_numero',
  pedido:          'get_next_pedido_numero',
  compra:          'get_next_compra_numero',
  ordenCompra:     'get_next_orden_compra_numero',
  entrada:         'get_next_entrada_numero',
  salida:          'get_next_salida_numero',
  reciboIngreso:   'get_next_recibo_ingreso_numero',
  pagoSuplidor:    'get_next_pago_suplidor_numero',
  devolucion:      'get_next_devolucion_numero',
  cartaRuta:       'get_next_carta_ruta_numero',
});

/**
 * Obtiene el próximo número para un tipo de documento.
 *
 * @param {keyof typeof RPC_BY_TIPO} tipo - Tipo de documento (factura, cotizacion, ...)
 * @returns {Promise<{ data: string|null, error: object|null }>}
 *
 * @example
 *   const { data: numero, error } = await secuenciasRepository.getNext('factura');
 *   if (error) {
 *     toast({ variant: 'destructive', title: error.title, description: error.message });
 *     return;
 *   }
 *   setNumero(numero);  // ej. "F-0001234"
 */
export const getNext = async (tipo) => {
  const rpcName = RPC_BY_TIPO[tipo];
  if (!rpcName) {
    return {
      data: null,
      error: {
        title: 'Tipo invalido',
        message: `Tipo de documento desconocido: '${tipo}'. Valores permitidos: ${Object.keys(RPC_BY_TIPO).join(', ')}`,
        code: 'invalid_param',
      },
    };
  }
  return runRpc(
    supabase.rpc(rpcName),
    `No se pudo generar el numero de ${tipo}`,
  );
};

// Helpers semánticos (sugar) para los tipos más usados — útiles cuando
// quieres autocomplete del editor.
export const getNextFacturaNumero        = () => getNext('factura');
export const getNextCotizacionNumero     = () => getNext('cotizacion');
export const getNextPedidoNumero         = () => getNext('pedido');
export const getNextCompraNumero         = () => getNext('compra');
export const getNextOrdenCompraNumero    = () => getNext('ordenCompra');
export const getNextEntradaNumero        = () => getNext('entrada');
export const getNextSalidaNumero         = () => getNext('salida');
export const getNextReciboIngresoNumero  = () => getNext('reciboIngreso');
export const getNextPagoSuplidorNumero   = () => getNext('pagoSuplidor');
export const getNextDevolucionNumero     = () => getNext('devolucion');
export const getNextCartaRutaNumero      = () => getNext('cartaRuta');

export default {
  getNext,
  getNextFacturaNumero,
  getNextCotizacionNumero,
  getNextPedidoNumero,
  getNextCompraNumero,
  getNextOrdenCompraNumero,
  getNextEntradaNumero,
  getNextSalidaNumero,
  getNextReciboIngresoNumero,
  getNextPagoSuplidorNumero,
  getNextDevolucionNumero,
  getNextCartaRutaNumero,
};
