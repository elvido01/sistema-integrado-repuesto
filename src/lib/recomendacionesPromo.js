// =====================================================================
// Recomendaciones en palabras a partir de "¿Qué publicación vende?" (21/11/2026)
// ---------------------------------------------------------------------
// Lo que ContentStudio, Klaviyo y Shopify dan y aquí faltaba: no solo la
// tabla, sino qué hacer con ella. Sale de efectividad_publicaciones (60 días):
// alcance de la publicación y ventas de la pieza 7 días antes y después.
//
// Reglas para no decir tonterías:
//   · una comparación pide al menos MIN_GRUPO publicaciones en cada lado,
//   · y una diferencia de al menos 25 % para llamarla "más";
//   · las ventas solo cuentan con 3+ días medidos después de publicar.
// Cada consejo dice de dónde sale (n publicaciones) y, si se puede, trae
// una acción: hoy, "volver a publicar" la que más vendió.
// =====================================================================

export const MIN_GRUPO = 3;
const DIFERENCIA = 1.25;

const OBJETIVO = { venta: 'Venta', educativo: 'Educar', interaccion: 'Conversación', manual: 'A mano' };
const num = (v) => Number(v) || 0;
const prom = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (a, b) => Math.round((a / b - 1) * 100);
const entero = (n) => Math.round(n).toLocaleString('es-DO');

function horaRD(iso) {
  const h = Number(new Date(iso).toLocaleString('en-US', { timeZone: 'America/Santo_Domingo', hour: 'numeric', hour12: false }));
  return h === 24 ? 0 : h;
}
export function franjaDe(iso) {
  const h = horaRD(iso);
  if (h < 12) return 'mañana';
  if (h < 17) return 'tarde';
  return 'noche';
}
const FRANJA = { mañana: 'en la mañana (antes de las 12)', tarde: 'en la tarde (12 a 5 pm)', noche: 'en la noche (después de las 5 pm)' };

/** El mejor y el peor grupo por alcance promedio, si la diferencia es real. */
function compararAlcance(filas, clave) {
  const grupos = {};
  filas.forEach((f) => { const k = clave(f); if (k) (grupos[k] ||= []).push(num(f.alcance)); });
  const validos = Object.entries(grupos).filter(([, xs]) => xs.length >= MIN_GRUPO)
    .map(([k, xs]) => ({ k, n: xs.length, media: prom(xs) }));
  if (validos.length < 2) return null;
  validos.sort((a, b) => b.media - a.media);
  const mejor = validos[0];
  const peor = validos[validos.length - 1];
  if (peor.media <= 0 || mejor.media / peor.media < DIFERENCIA) return null;
  return { mejor, peor };
}

export function recomendaciones(filas = []) {
  const out = [];
  const conAlcance = filas.filter((f) => num(f.alcance) > 0);

  // 1) Objetivo: venta / educar / conversación.
  const obj = compararAlcance(conAlcance, (f) => (f.objetivo && f.objetivo !== 'manual' ? f.objetivo : null));
  if (obj) {
    out.push({
      id: 'objetivo', tono: 'bueno',
      titulo: `Las de ${OBJETIVO[obj.mejor.k] || obj.mejor.k} llegan a ${pct(obj.mejor.media, obj.peor.media)}% más gente`,
      detalle: `${entero(obj.mejor.media)} personas de promedio contra ${entero(obj.peor.media)} en las de ${OBJETIVO[obj.peor.k] || obj.peor.k} (${obj.mejor.n} y ${obj.peor.n} publicaciones). Úsalas para darte a conocer; las de venta, para vender.`,
    });
  }

  // 2) Formato: reel o imagen.
  const fmt = compararAlcance(conAlcance, (f) => f.formato);
  if (fmt) {
    out.push({
      id: 'formato', tono: 'bueno',
      titulo: `Con ${fmt.mejor.k === 'reel' ? 'reel' : 'solo imagen'} llegas a ${pct(fmt.mejor.media, fmt.peor.media)}% más personas`,
      detalle: `${entero(fmt.mejor.media)} contra ${entero(fmt.peor.media)} de promedio (${fmt.mejor.n} y ${fmt.peor.n} publicaciones).${fmt.mejor.k === 'reel' ? ' No publiques sin el reel si lo tienes.' : ''}`,
    });
  }

  // 3) Hora.
  const hora = compararAlcance(conAlcance, (f) => (f.publicado_at ? franjaDe(f.publicado_at) : null));
  if (hora) {
    out.push({
      id: 'hora', tono: 'bueno',
      titulo: `Lo que sale ${hora.mejor.k === 'mañana' ? 'temprano' : `en la ${hora.mejor.k}`} llega más lejos`,
      detalle: `Publicado ${FRANJA[hora.mejor.k]}: ${entero(hora.mejor.media)} personas de promedio; ${FRANJA[hora.peor.k]}: ${entero(hora.peor.media)} (${hora.mejor.n} y ${hora.peor.n} publicaciones).`,
    });
  }

  // 4) La que más vendió después de publicarla: repetirla.
  const medidas = filas.filter((f) => num(f.dias_despues) >= 3);
  const ganadora = [...medidas]
    .filter((f) => num(f.uds_despues) > num(f.uds_antes) && num(f.uds_despues) >= 2)
    .sort((a, b) => (num(b.uds_despues) - num(b.uds_antes)) - (num(a.uds_despues) - num(a.uds_antes)))[0];
  if (ganadora) {
    out.push({
      id: `repetir-${ganadora.bundle_id}`, tono: 'bueno',
      titulo: `Repite: ${ganadora.descripcion}`,
      detalle: `Vendió ${entero(num(ganadora.uds_despues))} en la semana después de publicarla (${entero(num(ganadora.uds_antes))} la semana antes), RD$${entero(num(ganadora.ventas_despues))}.`,
      accion: { tipo: 'reusar', bundle_id: ganadora.bundle_id, producto_id: ganadora.producto_id, texto: 'Volver a publicar' },
    });
  }

  // 5) Las que no movieron nada.
  const sinEfecto = medidas.filter((f) => num(f.uds_despues) === 0);
  if (medidas.length >= MIN_GRUPO && sinEfecto.length / medidas.length >= 0.5) {
    out.push({
      id: 'sin-efecto', tono: 'ojo',
      titulo: `${sinEfecto.length} de ${medidas.length} promociones no vendieron ni una`,
      detalle: `En la semana después de publicarlas no salió ninguna. Ejemplos: ${sinEfecto.slice(0, 3).map((f) => f.descripcion).join(', ')}. Para esas piezas prueba Educar o Conversación, o no las repitas.`,
    });
  }

  // 6) Descuento: ¿vende más con el 5 %?
  const ventasPor = (cond) => medidas.filter(cond).map((f) => num(f.uds_despues));
  const conD = ventasPor((f) => f.con_descuento);
  const sinD = ventasPor((f) => !f.con_descuento);
  if (conD.length >= MIN_GRUPO && sinD.length >= MIN_GRUPO) {
    const a = prom(conD);
    const b = prom(sinD);
    if (a > 0 && b > 0 && Math.max(a, b) / Math.min(a, b) >= DIFERENCIA) {
      const gana = a > b ? 'con' : 'sin';
      out.push({
        id: 'descuento', tono: gana === 'sin' ? 'bueno' : 'ojo',
        titulo: gana === 'con' ? 'El 5% de descuento sí está vendiendo más' : 'Sin descuento se vende igual o más',
        detalle: `Unidades en la semana después: ${a.toFixed(1)} de promedio con descuento (${conD.length}) y ${b.toFixed(1)} sin descuento (${sinD.length}).${gana === 'sin' ? ' Te puedes ahorrar el 5%.' : ''}`,
      });
    }
  }

  return out;
}
