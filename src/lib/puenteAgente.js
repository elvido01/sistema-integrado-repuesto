// =====================================================================
// El puente: cómo un agente le pide algo a una pantalla
// ---------------------------------------------------------------------
// (2026-08-09) "quiero que abra el módulo de facturación y coloque los
// productos y luego me pregunte el método de pago".
//
// Hasta ahora el agente solo podía NAVEGAR (abrir_modulo). Esto le permite
// además dejar la pantalla preparada. Sigue sin grabar nada: llena la
// factura y la persona pulsa F10. Es la diferencia entre un ayudante que te
// adelanta el trabajo y uno que lo hace por su cuenta.
//
// >>> POR QUÉ UN BUZÓN Y NO UN EVENTO A SECAS <<<
// El agente abre el módulo y manda la orden casi al mismo tiempo, pero la
// pantalla tarda en montarse: un CustomEvent disparado antes de que el
// oyente exista se pierde sin dejar rastro, y el resultado es una factura
// vacía sin ningún error. Aquí la orden ESPERA hasta que alguien la reclame.
//
// >>> Y POR QUÉ SIRVE IGUAL PARA HERMES <<<
// Hermes vive en otra PC y no puede tocar este navegador. Pero sus
// respuestas llegan por hermes_chat, y si traen un campo `acciones` se
// entregan por este mismo buzón. Una sola tubería para los dos agentes: lo
// que se enseñe a hacer a uno, lo sabe hacer el otro.
// =====================================================================

const oyentes = new Map();   // panel -> función
const buzon = new Map();     // panel -> orden esperando

// La deja para el panel indicado. Si ya está escuchando, le llega ahora; si
// todavía se está montando, la encuentra al suscribirse.
export function ordenarPantalla(panel, orden) {
  if (!panel || !orden) return;
  const oyente = oyentes.get(panel);
  if (oyente) {
    try { oyente(orden); } catch (e) { console.error('[puente] la pantalla falló al recibir la orden:', e); }
    return;
  }
  buzon.set(panel, orden);
}

// La llama cada pantalla que sabe recibir órdenes. Devuelve la baja.
export function escucharOrdenes(panel, fn) {
  oyentes.set(panel, fn);

  const pendiente = buzon.get(panel);
  if (pendiente) {
    buzon.delete(panel);
    // En el siguiente ciclo: durante el primer render la pantalla todavía no
    // tiene sus manejadores listos y agregar productos ahí se pierde.
    setTimeout(() => { try { fn(pendiente); } catch (e) { console.error('[puente]', e); } }, 0);
  }

  return () => { if (oyentes.get(panel) === fn) oyentes.delete(panel); };
}

const FORMAS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE'];

const formaValida = (v) => (FORMAS.includes(String(v || '').toUpperCase())
  ? String(v).toUpperCase()
  : null);

const montoValido = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

// Las órdenes que llegan de un agente vienen de un modelo de lenguaje, así
// que se limpian antes de tocar una pantalla. No es desconfianza del agente:
// es que un número de más aquí es una factura mal hecha delante de un cliente.
//
// Dos pasos, y separados a propósito:
//
//   preparar_venta  deja la pantalla armada. No graba.
//   cobrar_venta    pone la forma de pago y GRABA E IMPRIME.
//
// >>> POR QUÉ NO ES UNA SOLA ORDEN CON UN INTERRUPTOR <<<
// Porque "grabar: false" y "grabar: true" se parecen demasiado para algo que
// emite un comprobante fiscal. Con dos nombres distintos, el modelo tiene que
// decir en voz alta cuál de las dos cosas quiere, y la que factura se lee
// entera en el registro de herramientas usadas.
export function normalizarOrdenVenta(cruda) {
  const o = cruda || {};

  if (o.tipo === 'cobrar_venta') {
    return {
      tipo: 'cobrar_venta',
      forma_pago: formaValida(o.forma_pago),
      recibido: montoValido(o.recibido),
    };
  }

  const lineas = Array.isArray(o.lineas) ? o.lineas : [];
  return {
    tipo: 'preparar_venta',
    // Número de cotización, para pasarla a factura sin volver a teclear nada.
    cotizacion: o.cotizacion ? String(o.cotizacion).trim().slice(0, 40) : null,
    lineas: lineas.slice(0, 25).map((l) => ({
      codigo: String(l?.codigo || '').trim(),
      // Tope de 50: pedir 5,000 unidades por un error de dictado dejaría la
      // pantalla colgada agregando líneas una por una.
      cantidad: Math.min(Math.max(parseInt(l?.cantidad, 10) || 1, 1), 50),
    })).filter((l) => l.codigo),
    cliente_nombre: o.cliente_nombre ? String(o.cliente_nombre).slice(0, 120) : null,
    forma_pago: formaValida(o.forma_pago),
    recibido: montoValido(o.recibido),
  };
}
