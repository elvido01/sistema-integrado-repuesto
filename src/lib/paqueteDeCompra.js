// Cuántas unidades trae un "1" del suplidor.
//
// (2026-08-28) Se midieron 174 facturas con OCR guardado. De los 117 costos
// que hubo que corregir a mano, 48 no eran errores de nadie:
//
//   la factura dice   1 x TORNILLO 10 CAB. STRIA 16 NIQ. (100PCS) @ 583.00
//   el dueño guarda   100 x @ 5.83
//
// El OCR leyó bien. Abrir el paquete es un paso de negocio, y en 29 de esos
// casos el número está escrito en la propia descripción.
//
// Esto lee ese número. Es la red de seguridad: lo que manda es lo que el
// sistema ya aprendió de compras anteriores (compras_paquetes), y esto entra
// solo cuando de ese código no se sabe nada todavía.

// Formas reales vistas en las facturas: (100PCS), 100 PCS, X100, 100 UND.
// El paréntesis va primero porque es la más frecuente y la menos ambigua.
const PATRONES = [
  /\((\d{1,4})\s*(?:PCS|PZS|PZAS|UDS|UND|UNID|PIEZAS?)\)/i,
  /\b(\d{1,4})\s*(?:PCS|PZS|PZAS|UDS|UNID|PIEZAS)\b/i,
  /\bX\s?(\d{1,4})\s*(?:PCS|PZS|UDS|UND|UNID)\b/i,
];

/**
 * Lee el tamaño del paquete en la descripción de la línea.
 * Devuelve 1 cuando no dice nada: 1 es "viene suelto", no "no sé".
 *
 * @param {string} descripcion la descripción tal como vino de la factura
 * @returns {number} unidades por paquete
 */
export function paqueteEnLaDescripcion(descripcion) {
  const texto = String(descripcion || '');
  for (const patron of PATRONES) {
    const m = texto.match(patron);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    // Un paquete de 1 no es un paquete. Y por encima de 1,000 unidades en
    // una línea de factura de repuestos ya no es una caja: es un número mal
    // leído, y multiplicar por él destrozaría el inventario.
    if (n > 1 && n <= 1000) return n;
  }
  return 1;
}

/**
 * Cuánto multiplicar esta línea. Lo aprendido gana siempre sobre lo leído:
 * si el dueño abrió esa caja de otra forma tres veces, sabe algo que la
 * descripción no dice.
 *
 * @param {object} item        línea que devolvió el OCR
 * @param {object} aprendidos  { CODIGO: unidades } de este suplidor
 * @returns {{factor: number, origen: 'aprendido'|'descripcion'|null}}
 */
export function factorDePaquete(item, aprendidos = {}) {
  const codigo = String(item?.code || '').trim().toUpperCase();
  const sabido = Number(aprendidos?.[codigo]);
  if (sabido > 1) return { factor: sabido, origen: 'aprendido' };

  const leido = paqueteEnLaDescripcion(item?.descripcion ?? item?.description);
  if (leido > 1) return { factor: leido, origen: 'descripcion' };

  return { factor: 1, origen: null };
}
