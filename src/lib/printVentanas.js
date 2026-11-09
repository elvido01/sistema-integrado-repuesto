// Hoja carta del desglose de un proyecto de ventanas (09/11/2026): datos del
// proyecto, cortes de cada ventana, perfiles (pies y barras con su plan de
// corte) y cristales. Se imprime o se guarda como PDF (printHtmlSmart).
import { desgloseVentana, materialesProyecto, pulgadasTexto, numeroProyecto, estadoProyecto } from '@/lib/ventanas';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pg = (v) => `${pulgadasTexto(v)}"`;

export function desgloseProyectoHTML({ empresa, proyecto, medidas, nombreSistema, piezasPorSistema, cfg }) {
  const mat = materialesProyecto(medidas, piezasPorSistema, cfg || {});
  const cliente = proyecto.clientes?.nombre || proyecto.cliente_nombre || 'Cliente por defecto';
  const ventanas = medidas.map((m, i) => {
    const cortes = desgloseVentana(m, piezasPorSistema[m.sistema_id] || []);
    return `<div class="v">
      <div class="vt">Ventana ${i + 1}${m.cantidad > 1 ? ` (×${m.cantidad})` : ''} · ${esc(pg(m.ancho))} × ${esc(pg(m.alto))}</div>
      <div class="vs">${esc(nombreSistema(m.sistema_id))} · ${m.hojas} hojas${m.color ? ` · ${esc(m.color)}` : ''}${m.ubicacion ? ` · ${esc(m.ubicacion)}` : ''}</div>
      <table>${cortes.map((c) => `<tr><td>☐ ${esc(c.pieza.nombre)}</td><td class="m"><b>${c.cantidad}</b> × ${esc(pg(c.largo))}</td></tr>`).join('')}</table>
    </div>`;
  }).join('');
  const perfiles = mat.perfiles.map((p) => `<tr>
      <td><b>${esc(p.perfil)}</b></td><td>${esc(p.color || '—')}</td><td class="c">${p.cortes.length}</td>
      <td class="m">${p.pies.toFixed(2)}'</td><td class="m">${p.metros.toFixed(2)} m</td><td class="c"><b>${p.barras}</b></td></tr>
      <tr class="plan"><td colspan="6">${p.plan.barras.map((b, i) => `Barra ${i + 1}: ${b.cortes.map(pg).join(' + ')} <i>(sobra ${pg(b.sobrante)})</i>`).join('<br>')}</td></tr>`).join('');
  const cristales = mat.cristales.map((c) => `<tr><td>${esc(pg(c.medida.ancho))} × ${esc(pg(c.medida.alto))}${c.medida.ubicacion ? ` · ${esc(c.medida.ubicacion)}` : ''}</td>
      <td class="m">${esc(pg(c.ancho))} × ${esc(pg(c.alto))}</td><td class="c">${c.cantidad}</td><td class="m">${c.pie2.toFixed(2)}</td></tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Desglose ${esc(numeroProyecto(proyecto.numero))}</title>
<style>
  @page { size: letter; margin: 11mm; }
  * { box-sizing: border-box; } body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 11.5px; color: #1b2330; }
  .cab { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #16325c; padding-bottom: 6px; }
  .cab img { width: 56px; height: 56px; object-fit: contain; }
  .cab h1 { margin: 0; font-size: 17px; color: #16325c; } .dat { color: #5b6472; font-size: 10.5px; }
  .tit { margin-left: auto; text-align: right; } .tit b { font-size: 14px; color: #16325c; display: block; }
  .info { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 8px 0; font-size: 11px; }
  h2 { font-size: 12.5px; color: #16325c; border-bottom: 2px solid #16325c; margin: 12px 0 6px; padding-bottom: 2px; text-transform: uppercase; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .v { border: 1px solid #c6ccd4; border-radius: 6px; padding: 6px 8px; break-inside: avoid; }
  .vt { font-weight: 700; } .vs { color: #5b6472; font-size: 10px; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 2px 4px; border-bottom: 1px solid #e1e5ea; vertical-align: top; }
  th { text-align: left; font-size: 10px; color: #5b6472; text-transform: uppercase; }
  .m { text-align: right; font-family: Consolas, monospace; white-space: nowrap; } .c { text-align: center; }
  tr.plan td { font-size: 9.5px; color: #5b6472; font-family: Consolas, monospace; border-bottom: 1px solid #c6ccd4; }
  .nota { margin-top: 10px; font-size: 9.5px; color: #5b6472; }
</style></head><body>
  <div class="cab">
    ${empresa?.logo_url ? `<img src="${esc(empresa.logo_url)}" alt="">` : ''}
    <div><h1>${esc(empresa?.nombre || '')}</h1><div class="dat">${esc([empresa?.direccion, empresa?.telefono].filter(Boolean).join(' · '))}</div></div>
    <div class="tit"><b>DESGLOSE DE VENTANAS</b>${esc(numeroProyecto(proyecto.numero))} · ${esc(new Date().toLocaleDateString('es-DO'))}</div>
  </div>
  <div class="info">
    <span><b>Proyecto:</b> ${esc(proyecto.nombre)}</span><span><b>Cliente:</b> ${esc(cliente)}</span>
    ${proyecto.direccion ? `<span><b>Dirección:</b> ${esc(proyecto.direccion)}</span>` : ''}${proyecto.telefono ? `<span><b>Tel.:</b> ${esc(proyecto.telefono)}</span>` : ''}
    <span><b>Estado:</b> ${esc(estadoProyecto(proyecto.estado).t)}</span>
  </div>
  <h2>Cortes por ventana</h2>
  <div class="grid">${ventanas}</div>
  <h2>Perfiles · barras de ${mat.largoBarra / 12}' (${mat.largoBarra}")</h2>
  <table><thead><tr><th>Perfil</th><th>Color</th><th class="c">Cortes</th><th class="m">Pies</th><th class="m">Metros</th><th class="c">Barras</th></tr></thead><tbody>${perfiles}</tbody></table>
  <h2>Cristales · ${mat.totalPie2.toFixed(2)} pie²</h2>
  <table><thead><tr><th>Ventana</th><th class="m">Cristal</th><th class="c">Cant.</th><th class="m">pie²</th></tr></thead><tbody>${cristales || '<tr><td colspan="4">Sin cristales</td></tr>'}</tbody></table>
  <div class="nota">Medidas en pulgadas. Se pierde ${pg(mat.merma)} por corte.</div>
</body></html>`;
}
