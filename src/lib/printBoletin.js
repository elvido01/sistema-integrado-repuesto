// Boletín de calificaciones del colegio (07/11/2026, plan EDUCA TOTAL).
// Copia del formato MINERD de primaria que trajo el dueño: carta horizontal,
// "Desempeño individual del / la estudiante", 3 competencias × P1-P4, C1-C3,
// final del área y recuperación; leyenda, escala numérica y firmas.
import { COMPETENCIAS, PERIODOS, finalCompetencia, finalArea } from '@/lib/colegio';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (v === null || v === undefined || v === '' ? '' : String(Math.round(Number(v) * 100) / 100));

const ESCALA = [
  ['90-100', 'Evidencia que el estudiante ha alcanzado un desempeño destacado con relación a los aspectos evaluados de la competencia de cada área, durante los períodos y al finalizar el año escolar.'],
  ['77-89', 'Evidencia que el estudiante ha logrado los aprendizajes esperados con relación a los aspectos evaluados de la competencia de cada área, durante los períodos y al finalizar el año escolar.'],
  ['65-76', 'Evidencia que el estudiante aún se encuentra en proceso con relación a los aspectos evaluados de la competencia de cada área, durante los períodos y al finalizar el año escolar.'],
  ['Menos de 65', 'Evidencia que el estudiante ha alcanzado un desempeño insuficiente con relación a los aspectos evaluados de la competencia de cada área, durante los períodos y al finalizar el año escolar.'],
];

const CSS = `
  @page { size: letter landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
  .hoja { page-break-after: always; }
  .hoja:last-child { page-break-after: auto; }
  .cab { display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; margin-bottom: 3px; }
  .cab b { text-transform: uppercase; }
  .cab .lin { border-bottom: 1px solid #111; padding: 0 4px; }
  table { border-collapse: collapse; width: 100%; }
  table.notas { table-layout: fixed; }
  .notas td, .notas th { border: 1px solid #5b7fa6; font-size: 10px; text-align: center; padding: 2px 1px; }
  .notas .banda { background: #3a7cc4; color: #fff; font-weight: bold; font-size: 12px; letter-spacing: .3px; }
  .notas th.comp { background: #dbe8f6; font-weight: bold; font-size: 9.5px; line-height: 1.15; height: 58px; }
  .notas th.fund { background: #dbe8f6; font-size: 13px; font-weight: bold; }
  .notas th.sub { background: #dbe8f6; font-weight: bold; }
  .notas td.asig { text-align: left; font-weight: bold; font-size: 9.5px; padding-left: 4px; text-transform: uppercase; height: 30px; }
  .notas td.n { font-size: 12px; font-family: 'Segoe Print', 'Comic Sans MS', cursive; color: #1d2b6b; }
  .notas td.fin { font-weight: bold; font-size: 11.5px; }
  .pie { display: flex; gap: 12px; margin-top: 8px; }
  .leyenda { width: 31%; }
  .leyenda .t { background: #dbe8f6; border: 1px solid #5b7fa6; text-align: center; font-weight: bold; font-size: 11px; padding: 3px; }
  .leyenda .c { border: 1px solid #5b7fa6; border-top: 0; font-size: 9.5px; padding: 6px 8px; display: flex; gap: 22px; line-height: 1.5; }
  .centro { margin-top: 6px; background: #3a7cc4; color: #fff; text-align: center; padding: 4px 6px 8px; }
  .centro .l { font-size: 11px; border-bottom: 1px solid rgba(255,255,255,.6); padding-bottom: 3px; margin-bottom: 5px; }
  .centro .nom { font-size: 12.5px; font-weight: bold; text-transform: uppercase; }
  .escala { flex: 1; }
  .escala td, .escala th { border: 1px solid #5b7fa6; font-size: 8.5px; padding: 2px 4px; }
  .escala th { background: #dbe8f6; font-size: 9.5px; }
  .escala td.e { text-align: center; font-weight: bold; width: 70px; font-size: 9.5px; }
  .firmas { display: flex; align-items: flex-end; gap: 16px; margin-top: 12px; }
  .firmas img { max-height: 42px; max-width: 70px; }
  .firma { flex: 1; text-align: center; font-size: 10px; }
  .firma .nombre { font-size: 13px; font-family: 'Segoe Print', 'Comic Sans MS', cursive; color: #1d2b6b; min-height: 18px; }
  .firma .raya { border-top: 1px solid #111; padding-top: 2px; }
`;

function hoja({ colegio, anio, curso, seccion, maestro, director, asignaturas, est }) {
  const cab = `
    <div class="cab">
      <div>Nombre(s) y Apellido(s): <span class="lin"><b>${esc(est.nombre)}</b></span></div>
      <div>Curso: <span class="lin">${esc(curso)}</span> &nbsp; Sección: <span class="lin">${esc(seccion || '')}</span> &nbsp; Período: <span class="lin">${esc(anio)}</span></div>
    </div>`;
  const filas = asignaturas.map((a) => {
    const n = est.notas?.[a.id] || {};
    const celdas = COMPETENCIAS.map((c) => PERIODOS.map((p) => `<td class="n">${num(n[`${c.n}-${p}`])}</td>`).join('')).join('');
    const cs = COMPETENCIAS.map((c) => `<td class="fin">${num(finalCompetencia(n, c.n))}</td>`).join('');
    return `<tr><td class="asig">${esc(a.nombre)}</td>${celdas}${cs}<td class="fin">${num(finalArea(n))}</td><td class="fin">${num(est.recuperacion?.[a.id])}</td></tr>`;
  }).join('');
  const tabla = `
    <table class="notas">
      <colgroup><col style="width:24%">${COMPETENCIAS.map(() => PERIODOS.map(() => '<col style="width:4.2%">').join('')).join('')}${COMPETENCIAS.map(() => '<col style="width:3.6%">').join('')}<col style="width:6.6%"><col style="width:8.2%"></colgroup>
      <tr><th class="fund" rowspan="2">COMPETENCIAS<br>FUNDAMENTALES</th><td class="banda" colspan="${COMPETENCIAS.length * 4 + 5}">DESEMPEÑO INDIVIDUAL DEL / LA ESTUDIANTE</td></tr>
      <tr>
        ${COMPETENCIAS.map((c) => `<th class="comp" colspan="4">${esc(c.largo)}</th>`).join('')}
        <th class="comp" colspan="3">Calificación final por competencia</th>
        <th class="comp" rowspan="2">Calificación Final del Área</th>
        <th class="comp" rowspan="2">Calificación Recuperación Final</th>
      </tr>
      <tr><th class="sub" style="font-size:9.5px">PERIODOS</th>${COMPETENCIAS.map(() => PERIODOS.map((p) => `<th class="sub">P${p}</th>`).join('')).join('')}${COMPETENCIAS.map((c) => `<th class="sub">C${c.n}</th>`).join('')}</tr>
      ${filas}
    </table>`;
  const pie = `
    <div class="pie">
      <div class="leyenda">
        <div class="t">LEYENDA</div>
        <div class="c">
          <div>${PERIODOS.map((p) => `(P${p}) &nbsp; Periodo ${p}`).join('<br>')}</div>
          <div>${COMPETENCIAS.map((c) => `(C${c.n}) &nbsp; Competencia ${c.n}`).join('<br>')}</div>
        </div>
        <div class="centro"><div class="l">Centro Educativo</div><div class="nom">${esc(colegio?.nombre)}</div></div>
      </div>
      <div class="escala">
        <table>
          <tr><th>ESCALA<br>NUMÉRICA</th><th>DESCRIPCIÓN</th></tr>
          ${ESCALA.map(([e, d]) => `<tr><td class="e">${e}</td><td>${d}</td></tr>`).join('')}
        </table>
        <div class="firmas">
          ${colegio?.logo_url ? `<img src="${esc(colegio.logo_url)}" alt="">` : ''}
          <div class="firma"><div class="nombre">${esc(maestro || '')}</div><div class="raya">Maestro(a) Encargado(a) del Grado</div></div>
          <div class="firma"><div class="nombre">${esc(director || '')}</div><div class="raya">Director(a) del Centro Educativo</div></div>
        </div>
      </div>
    </div>`;
  return `<div class="hoja">${cab}${tabla}${pie}</div>`;
}

/**
 * d = { colegio: { nombre, logo_url }, anio: '2026-2027', curso: '3ro de Primaria', seccion: 'A',
 *       maestro, director, asignaturas: [{ id, nombre }],
 *       estudiantes: [{ nombre: 'APELLIDOS, NOMBRES', notas: { [asigId]: { 'c-p': n } }, recuperacion: { [asigId]: n } }] }
 * Un boletín por hoja.
 */
export function boletinHTML(d) {
  const hojas = (d.estudiantes || []).map((est) => hoja({ ...d, est })).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Boletín de calificaciones</title><style>${CSS}</style></head><body>${hojas}</body></html>`;
}
