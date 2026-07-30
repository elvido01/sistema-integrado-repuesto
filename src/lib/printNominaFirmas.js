// ============================================================
// printNominaFirmas.js — hoja de pago para firmar
// ============================================================
// Reemplaza el Excel que se llenaba a mano cada quincena:
//
//     MOTOPRESTAMOS LOS NARANJOS Y CAMINERO MOTORS
//     NOMINA DE PAGO CORRESP. A LA QUINCENA TERMINADA
//     ┌──────────────────────┬──────────┬──────────────────┐
//     │ OFICINA              │  MONTO   │      FIRMA       │
//     ├──────────────────────┼──────────┼──────────────────┤
//     │ YERLIN CARABALLO     │ 15,000.00│                  │
//
// Lo que cambia frente al Excel: el monto sale de la nómina, así que no
// hay que teclearlo ni puede quedar desactualizado.
//
// Se imprime en hoja carta. Las filas van altas a propósito (12mm) para
// que quepa una firma de verdad, y la tabla lleva `thead` repetido por si
// la nómina pasa de una página.
// ============================================================

import { formatFechaDMY } from '@/lib/dateUtils';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  .format(Number(v) || 0);
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TITULO_PERIODO = {
  quincenal: 'NÓMINA DE PAGO CORRESP. A LA QUINCENA TERMINADA',
  semanal: 'NÓMINA DE PAGO CORRESP. A LA SEMANA TERMINADA',
  mensual: 'NÓMINA DE PAGO CORRESP. AL MES TERMINADO',
};

/**
 * Hoja de firmas de una nómina.
 *
 * @param {object}   nomina    fila de `nominas` (numero, frecuencia, fecha_desde/hasta, fecha_pago, total_neto)
 * @param {object[]} detalle   filas de `nomina_detalle` con `empleados` incrustado
 * @param {object}   empresa   config_empresa (nombre, rnc)
 * @returns {string} HTML completo listo para printHtmlSmart
 */
export const buildNominaFirmasHTML = (nomina = {}, detalle = [], empresa = {}) => {
  // Solo quien cobra: un neto en cero no tiene qué firmar.
  const filas = (detalle || []).filter((d) => Number(d.neto) > 0);
  const total = filas.reduce((a, d) => a + (Number(d.neto) || 0), 0);
  const titulo = TITULO_PERIODO[nomina.frecuencia] || 'NÓMINA DE PAGO';
  const periodo = [nomina.fecha_desde, nomina.fecha_hasta].filter(Boolean).map(formatFechaDMY).join(' — ');

  const cuerpo = filas.map((d) => `
      <tr>
        <td class="nom">${esc(d.empleados?.nombre || '')}${
          d.empleados?.puesto ? `<span class="puesto"> — ${esc(d.empleados.puesto)}</span>` : ''
        }</td>
        <td class="num">${fmt(d.neto)}</td>
        <td class="firma"></td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Nómina ${esc(nomina.numero ?? '')}</title>
<style>
  @page { size: letter; margin: 12mm 14mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #000; }
  .cab { text-align: center; margin-bottom: 10px; }
  .cab h1 { margin: 0; font-size: 15px; letter-spacing: .5px; }
  .cab h2 { margin: 2px 0 0; font-size: 12px; font-weight: bold; }
  .cab .meta { margin-top: 6px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #e8c9c9; border: 1px solid #000; padding: 5px 6px;
       font-size: 12px; font-weight: bold; text-align: left; }
  th.num, td.num { text-align: right; }
  th.firma { text-align: center; }
  /* alto de fila generoso: es lo que hace que la firma quepa */
  td { border: 1px solid #000; padding: 0 6px; height: 12mm; font-size: 12px; vertical-align: middle; }
  td.nom { font-weight: bold; text-transform: uppercase; }
  td.nom .puesto { font-weight: normal; text-transform: none; color: #444; font-size: 10px; }
  td.num { font-weight: bold; white-space: nowrap; }
  td.firma { width: 46%; }
  tr.total td { height: auto; padding: 6px; background: #e8c9c9; font-weight: bold; }
  .pie { margin-top: 14px; font-size: 10px; color: #444; display: flex; }
  .pie .rec { flex: 1; }
</style></head>
<body onload="window.print()">
  <div class="cab">
    <h1>${esc((empresa?.nombre || '').toUpperCase())}</h1>
    <h2>${titulo}</h2>
    <div class="meta">
      ${periodo ? `Período: <b>${periodo}</b>` : ''}
      ${nomina.fecha_pago ? ` &nbsp;·&nbsp; Fecha de pago: <b>${formatFechaDMY(nomina.fecha_pago)}</b>` : ''}
      ${nomina.numero != null ? ` &nbsp;·&nbsp; Nómina #<b>${esc(nomina.numero)}</b>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr><th>OFICINA</th><th class="num">MONTO</th><th class="firma">FIRMA</th></tr>
    </thead>
    <tbody>
      ${cuerpo || '<tr><td colspan="3" style="text-align:center">Sin empleados que cobren en esta nómina.</td></tr>'}
    </tbody>
    <tfoot>
      <tr class="total">
        <td>TOTAL &nbsp;(${filas.length} empleado${filas.length === 1 ? '' : 's'})</td>
        <td class="num">${fmt(total)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="pie">
    <div class="rec">Recibí conforme el monto indicado frente a mi nombre.</div>
    <div>Impreso: ${formatFechaDMY(new Date())}</div>
  </div>
</body></html>`;
};
