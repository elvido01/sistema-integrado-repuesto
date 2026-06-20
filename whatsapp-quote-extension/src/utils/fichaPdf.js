import { jsPDF } from 'jspdf';

// Construye el PDF "DATOS DE CLIENTE" para mandarlo al buscador.
// data = { empresa_nombre, cliente:{ codigo,nombre,rnc,telefono,email,direccion,ficha_dealer }, deuda:{ total, cuotas, facturas:[] } }
// Excluye a proposito la parte de credito/facturacion.
export function buildFichaPdf(data) {
  const cli = data?.cliente || {};
  const f = cli.ficha_dealer || {};
  const deuda = data?.deuda || {};

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const labelW = 130;
  let y = margin;

  const ensure = (h = 16) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const title = (text) => {
    ensure(26);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(20);
    doc.text(text, margin, y);
    y += 8;
    doc.setDrawColor(180);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
  };

  const section = (text) => {
    ensure(22);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(40, 90, 160);
    doc.text(text.toUpperCase(), margin, y);
    y += 14;
    doc.setTextColor(20);
  };

  const row = (label, value) => {
    const val = String(value == null ? '' : value).trim();
    if (!val) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(val, pageW - margin - margin - labelW);
    ensure(lines.length * 13 + 2);
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, margin + labelW, y);
    y += lines.length * 13 + 2;
  };

  // Encabezado
  title('DATOS DE CLIENTE');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`${data?.empresa_nombre || ''}  ·  ${new Date().toLocaleString('es-DO')}`, margin, y);
  y += 18;
  doc.setTextColor(20);

  // Datos personales
  section('Datos personales');
  row('Código:', cli.codigo);
  row('Nombre:', cli.nombre);
  row('Apodo:', f.apodo);
  row('Cédula/RNC:', cli.rnc);
  row('Celular:', cli.telefono);
  row('Tel. de casa:', f.telefono_casa);

  // Direccion
  section('Dirección');
  row('Calle:', cli.direccion);
  row('No. de casa:', f.numero);
  row('Barrio / Sector:', f.barrio);
  row('Ciudad:', f.ciudad);
  row('Casa propia:', f.casa_propia ? 'Sí' : (f.casa_propia === false ? 'No' : ''));
  row('Color de la casa:', f.color_casa);
  row('Apartamento:', f.apartamento);
  row('Cerca de:', f.cerca_de);

  // Trabajo
  section('Trabajo');
  row('Cargo / Ocupación:', f.cargo);
  row('Lugar de trabajo:', f.lugar_trabajo);
  row('Tel. trabajo:', f.lugar_trabajo_tel || f.telefono_trabajo);
  row('Nombre del jefe:', f.nombre_jefe);
  row('Dirección trabajo:', f.direccion_trabajo);

  // Familia / referencias
  section('Cónyuge / Familia');
  row('Cónyuge:', f.conyuge_nombre);
  row('Tel. cónyuge:', f.conyuge_tel);
  row('Papá:', f.papa_nombre);
  row('Tel. papá:', f.papa_tel);
  row('Dir. papá:', f.papa_direccion);
  row('Mamá:', f.mama_nombre);
  row('Tel. mamá:', f.mama_tel);
  row('Dir. mamá:', f.mama_direccion);

  section('Referencias');
  row('Referente 1:', f.ref1_nombre);
  row('Tel. ref. 1:', f.ref1_tel);
  row('Dir. ref. 1:', f.ref1_direccion);
  row('Referente 2:', f.ref2_nombre);
  row('Tel. ref. 2:', f.ref2_tel);
  row('Dir. ref. 2:', f.ref2_direccion);

  // Deuda (contexto para el buscador)
  if (deuda.total != null || (deuda.facturas && deuda.facturas.length)) {
    section('Deuda pendiente');
    if (deuda.total != null) {
      const monto = Number(deuda.total).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' });
      row('Total atrasado:', monto);
    }
    if (deuda.cuotas != null) row('Cuotas atrasadas:', String(deuda.cuotas));
    if (deuda.facturas && deuda.facturas.length) row('Facturas:', deuda.facturas.join(', '));
  }

  // Observaciones
  if (String(f.observaciones || '').trim()) {
    section('Observaciones');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(String(f.observaciones), pageW - margin - margin);
    ensure(lines.length * 13);
    doc.text(lines, margin, y);
    y += lines.length * 13;
  }

  const safeName = String(cli.nombre || 'cliente').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
  const filename = `Ficha-${safeName || 'cliente'}.pdf`;
  const blob = doc.output('blob');
  return new File([blob], filename, { type: 'application/pdf' });
}

// Descarga el PDF (respaldo cuando no se puede adjuntar automaticamente)
export function downloadPdf(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name || 'ficha.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
