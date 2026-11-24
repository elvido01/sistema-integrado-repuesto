// Factura de MotoFlow a sus clientes (24/11/2026). El emisor es el dueño
// (persona física); sus datos viajan copiados dentro de cada factura
// (f.emisor), así una factura vieja se reimprime igual aunque cambien.

export const fmtRD = (n) =>
  Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDoc = (d) => {
  const s = String(d || '').replace(/\D/g, '');
  if (s.length === 11) return `${s.slice(0, 3)}-${s.slice(3, 10)}-${s.slice(10)}`;
  if (s.length === 9) return `${s.slice(0, 1)}-${s.slice(1, 3)}-${s.slice(3, 8)}-${s.slice(8)}`;
  return s;
};

const fecha = (x) => (x ? new Date(x).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

// Abre la factura en una ventana para imprimir o guardar como PDF.
// Devuelve false si el navegador bloqueó la ventana.
export function imprimirFacturaMotoflow(f) {
  const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const e = f.emisor || {};
  const meses = Number(f.meses) === 1 ? '1 mes' : `${f.meses} meses`;
  const anulada = f.estado === 'anulada';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Factura ${esc(f.numero_txt)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;font-size:13px}
  .top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}
  h1{font-size:20px;margin:0} .marca{color:#2563eb;font-weight:bold;font-size:12px;letter-spacing:.5px}
  .caja{border:1px solid #111;padding:8px 12px;text-align:right;min-width:210px}
  .caja b{font-size:16px}
  .cli{margin:18px 0;border:1px solid #ccc;padding:8px 12px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{text-align:left;border-bottom:2px solid #111;padding:6px 4px;font-size:11px;text-transform:uppercase}
  td{border-bottom:1px solid #ddd;padding:6px 4px} .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .tot{margin-left:auto;width:300px;margin-top:10px} .tot td{border:0;padding:3px 4px}
  .tot tr.g td{font-weight:bold;font-size:15px;border-top:2px solid #111}
  .nota{font-size:11px;color:#555;margin-top:22px}
  .anulada{color:#b91c1c;border:3px solid #b91c1c;display:inline-block;padding:4px 10px;font-weight:bold;font-size:18px;transform:rotate(-4deg);margin-top:10px}
  @media print{body{margin:12mm}}
</style></head><body>
<div class="top"><div>
  <div class="marca">MOTOFLOW</div>
  <h1>${esc(e.nombre)}</h1>
  <div>Cédula/RNC: ${esc(fmtDoc(e.documento))}</div>
  ${e.direccion ? `<div>${esc(e.direccion)}</div>` : ''}
  ${e.telefono || e.email ? `<div>${esc([e.telefono, e.email].filter(Boolean).join(' · '))}</div>` : ''}
</div><div class="caja">
  <div>FACTURA</div><b>${esc(f.numero_txt)}</b>
  ${f.ncf ? `<div>NCF: <b style="font-size:13px">${esc(f.ncf)}</b></div>` : ''}
  <div>Fecha: ${fecha(f.fecha)}</div>
</div></div>
${anulada ? `<div class="anulada">ANULADA</div>${f.motivo_anulacion ? `<div>Motivo: ${esc(f.motivo_anulacion)}</div>` : ''}` : ''}
<div class="cli">
  <div><b>Cliente:</b> ${esc(f.cliente_nombre)}</div>
  ${f.cliente_documento ? `<div><b>RNC/Cédula:</b> ${esc(fmtDoc(f.cliente_documento))}</div>` : ''}
  ${f.cliente_direccion ? `<div><b>Dirección:</b> ${esc(f.cliente_direccion)}</div>` : ''}
</div>
<table><thead><tr><th>Descripción</th><th class="n">Importe</th></tr></thead><tbody>
  <tr><td>Membresía MotoFlow — plan ${esc(f.plan_nombre)} · ${esc(meses)}${f.periodo_hasta ? ` (vigente hasta ${fecha(f.periodo_hasta)})` : ''}</td><td class="n">${fmtRD(f.precio_lista)}</td></tr>
  ${Number(f.descuento) > 0 ? `<tr><td>Descuento especial${f.motivo_descuento ? ` — ${esc(f.motivo_descuento)}` : ''}</td><td class="n">-${fmtRD(f.descuento)}</td></tr>` : ''}
</tbody></table>
<table class="tot">
  ${Number(f.itbis) > 0 ? `<tr><td>Subtotal</td><td class="n">RD$ ${fmtRD(f.subtotal)}</td></tr><tr><td>ITBIS 18%</td><td class="n">RD$ ${fmtRD(f.itbis)}</td></tr>` : ''}
  <tr class="g"><td>Total</td><td class="n">RD$ ${fmtRD(f.total)}</td></tr>
</table>
${f.metodo_pago ? `<div style="margin-top:10px">Pagado por: ${esc(f.metodo_pago)}${f.referencia ? ` · Ref. ${esc(f.referencia)}` : ''}</div>` : ''}
${e.nota_pie ? `<div class="nota">${esc(e.nota_pie)}</div>` : ''}
<div class="nota">Gracias por usar MotoFlow · motoflow.com.do</div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

// Precio mensual a proponer para un plan: primero el recordado al facturar
// (familia/amigos, motoflow_precios_cliente), luego el pactado de la empresa
// si es de ese plan (o de cualquiera). null = precio de lista del plan.
export function precioSugerido(prep, plan) {
  const p = String(plan || '').toUpperCase();
  const rec = (prep?.recordados || []).find((r) => r.plan === p);
  if (rec) return { precio: Number(rec.precio), motivo: rec.motivo || '', origen: 'recordado' };
  const pac = prep?.pactado;
  if (pac && Number(pac.precio) > 0 && (!pac.plan || pac.plan === p)) {
    return { precio: Number(pac.precio), motivo: pac.nota || '', origen: 'pactado' };
  }
  return null;
}
