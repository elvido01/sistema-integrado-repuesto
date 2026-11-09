// Hoja carta del desglose de un proyecto de ventanas (09/11/2026): datos del
// proyecto, cortes de cada ventana, perfiles (pies y barras con su plan de
// corte) y cristales. Se imprime o se guarda como PDF (printHtmlSmart).
import { desgloseVentana, materialesProyecto, croquisVidrios, pulgadasTexto, numeroProyecto, estadoProyecto } from '@/lib/ventanas';

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

// ── Croquis de vidrios (09/11/2026) ─────────────────────────────────────
// Dibujo de una ventana a escala: el marco (ancho × alto), una división por
// hoja y en cada hoja el vidrio con su medida. SVG en texto: sirve para la
// pantalla (dangerouslySetInnerHTML) y para la hoja impresa.
export function croquisSVG(m, vidrio, { ancho = 260, alto = 190 } = {}) {
  const W = Number(m.ancho) || 1; const H = Number(m.alto) || 1;
  const pad = 26;
  const k = Math.min((ancho - pad * 2) / W, (alto - pad * 2) / H);
  const w = W * k; const h = H * k;
  const x0 = (ancho - w) / 2 + 6; const y0 = (alto - h) / 2 + 6;
  const hojas = Math.max(1, Number(m.hojas) || 1);
  const anchoHoja = w / hojas;
  const margen = Math.min(8, anchoHoja * 0.12, h * 0.1);
  const fs = Math.max(8, Math.min(12, anchoHoja / 7));
  let hojasSvg = '';
  for (let i = 0; i < hojas; i++) {
    const hx = x0 + i * anchoHoja;
    hojasSvg += `<rect x="${hx + margen}" y="${y0 + margen}" width="${anchoHoja - margen * 2}" height="${h - margen * 2}" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/>`;
    if (i > 0) hojasSvg += `<line x1="${hx}" y1="${y0}" x2="${hx}" y2="${y0 + h}" stroke="#16325c" stroke-width="2"/>`;
    if (vidrio) {
      const cx = hx + anchoHoja / 2; const cy = y0 + h / 2;
      hojasSvg += `<text x="${cx}" y="${cy - 2}" font-size="${fs}" text-anchor="middle" font-family="Arial" font-weight="700" fill="#1e3a8a">${esc(pulgadasTexto(vidrio.ancho))}"</text>`
        + `<text x="${cx}" y="${cy + fs}" font-size="${fs}" text-anchor="middle" font-family="Arial" fill="#1e3a8a">× ${esc(pulgadasTexto(vidrio.alto))}"</text>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho + 12} ${alto + 12}" width="100%" style="max-width:${ancho + 12}px">
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff" stroke="#16325c" stroke-width="3"/>
    ${hojasSvg}
    <text x="${x0 + w / 2}" y="${y0 - 8}" font-size="11" text-anchor="middle" font-family="Arial" fill="#374151">${esc(pulgadasTexto(W))}"</text>
    <text x="${x0 - 8}" y="${y0 + h / 2}" font-size="11" text-anchor="middle" font-family="Arial" fill="#374151" transform="rotate(-90 ${x0 - 8} ${y0 + h / 2})">${esc(pulgadasTexto(H))}"</text>
  </svg>`;
}

// Hoja carta del croquis: cada ventana dibujada con su vidrio y el pedido de
// vidrio (iguales juntos) para mandar a cortar.
export function croquisVidriosHTML({ empresa, proyecto, medidas, nombreSistema, piezasPorSistema, tipoVidrio }) {
  const cq = croquisVidrios(medidas, piezasPorSistema);
  const cliente = proyecto.clientes?.nombre || proyecto.cliente_nombre || 'Cliente por defecto';
  const tarjetas = cq.ventanas.map(({ n, medida: m, vidrio }) => `<div class="v">
      <div class="vt">Ventana ${n}${m.cantidad > 1 ? ` (×${m.cantidad})` : ''} · ${esc(pg(m.ancho))} × ${esc(pg(m.alto))}</div>
      <div class="vs">${esc(nombreSistema(m.sistema_id))} · ${m.hojas} hojas${m.ubicacion ? ` · ${esc(m.ubicacion)}` : ''}</div>
      ${croquisSVG(m, vidrio)}
      <div class="vv">${vidrio ? `<b>${vidrio.cantidad}</b> vidrio(s) de <b>${esc(pg(vidrio.ancho))} × ${esc(pg(vidrio.alto))}</b> · ${vidrio.pie2.toFixed(2)} pie²` : 'Sin medida de vidrio en el desglose de este sistema'}</div>
    </div>`).join('');
  const pedido = cq.pedido.map((g) => `<tr><td class="c"><b>${g.cantidad}</b></td><td class="m"><b>${esc(pg(g.ancho))} × ${esc(pg(g.alto))}</b></td>
      <td class="m">${g.pie2.toFixed(2)}</td><td>${g.ventanas.map((x) => `V${x}`).join(', ')}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Croquis de vidrios ${esc(numeroProyecto(proyecto.numero))}</title>
<style>
  @page { size: letter; margin: 11mm; }
  * { box-sizing: border-box; } body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 11.5px; color: #1b2330; }
  .cab { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #16325c; padding-bottom: 6px; }
  .cab img { width: 56px; height: 56px; object-fit: contain; }
  .cab h1 { margin: 0; font-size: 17px; color: #16325c; } .dat { color: #5b6472; font-size: 10.5px; }
  .tit { margin-left: auto; text-align: right; } .tit b { font-size: 14px; color: #16325c; display: block; }
  .info { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 8px 0; font-size: 11px; }
  h2 { font-size: 12.5px; color: #16325c; border-bottom: 2px solid #16325c; margin: 12px 0 6px; padding-bottom: 2px; text-transform: uppercase; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .v { border: 1px solid #c6ccd4; border-radius: 6px; padding: 6px; break-inside: avoid; text-align: center; }
  .vt { font-weight: 700; } .vs { color: #5b6472; font-size: 10px; } .vv { font-size: 10.5px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; } td, th { padding: 3px 5px; border-bottom: 1px solid #e1e5ea; }
  th { text-align: left; font-size: 10px; color: #5b6472; text-transform: uppercase; }
  .m { text-align: right; font-family: Consolas, monospace; white-space: nowrap; } .c { text-align: center; }
  .nota { margin-top: 10px; font-size: 9.5px; color: #5b6472; }
</style></head><body>
  <div class="cab">
    ${empresa?.logo_url ? `<img src="${esc(empresa.logo_url)}" alt="">` : ''}
    <div><h1>${esc(empresa?.nombre || '')}</h1><div class="dat">${esc([empresa?.direccion, empresa?.telefono].filter(Boolean).join(' · '))}</div></div>
    <div class="tit"><b>CROQUIS DE VIDRIOS</b>${esc(numeroProyecto(proyecto.numero))} · ${esc(new Date().toLocaleDateString('es-DO'))}</div>
  </div>
  <div class="info">
    <span><b>Proyecto:</b> ${esc(proyecto.nombre)}</span><span><b>Cliente:</b> ${esc(cliente)}</span>
    ${tipoVidrio ? `<span><b>Vidrio:</b> ${esc(tipoVidrio)}</span>` : ''}
  </div>
  <h2>Pedido de vidrio · ${cq.totalPiezas} pieza(s) · ${cq.totalPie2.toFixed(2)} pie²</h2>
  <table><thead><tr><th class="c">Cant.</th><th class="m">Medida (ancho × alto)</th><th class="m">pie²</th><th>Ventanas</th></tr></thead>
    <tbody>${pedido || '<tr><td colspan="4">Sin vidrios</td></tr>'}</tbody></table>
  <h2>Croquis por ventana</h2>
  <div class="grid">${tarjetas}</div>
  <div class="nota">Medidas en pulgadas. El vidrio sale del desglose de cada sistema (Configuración del desglose).</div>
</body></html>`;
}
