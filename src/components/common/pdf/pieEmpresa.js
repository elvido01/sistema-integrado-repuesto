// Pie de página con la dirección y el teléfono de la empresa (26/11/2026).
// Antes iban arriba, centrados en y=12/17: se encimaban con el nombre de la
// empresa y salían repetidos cuando la empresa tiene el mismo texto en los
// dos campos (Motopréstamos). Ahora van abajo en cada página, sin repetir.

const clave = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
const digitos = (x) => String(x || '').replace(/\D/g, '');

/** "dirección · teléfono" sin repetidos: iguales (sin contar mayúsculas ni
 *  espacios) salen una vez; el teléfono (7+ dígitos) no se repite si ya está
 *  dentro de la dirección. */
export function textoPieEmpresa(empresa) {
  const e = empresa || {};
  const dir = String(e.direccion || '').replace(/\s+/g, ' ').trim();
  const tel = String(e.telefono || '').replace(/\s+/g, ' ').trim();
  if (!dir) return tel;
  if (!tel || clave(dir) === clave(tel)) return dir;
  const dTel = digitos(tel);
  if (dTel.length >= 7 && digitos(dir).includes(dTel)) return dir;
  return `${dir} · ${tel}`;
}

/** Espacio (mm) que el pie ocupa abajo: lo que va encima no debe pasar de aquí. */
export const RESERVA_PIE = 16;

/** Si un bloque de `alto` mm no cabe desde `y` antes del pie, abre página
 *  nueva y devuelve dónde empezar en ella; si cabe, devuelve `y`. */
export function espacioPara(doc, y, alto, arriba = 20) {
  if (y + alto <= doc.internal.pageSize.height - RESERVA_PIE) return y;
  doc.addPage();
  return arriba;
}

/** Escribe el pie en todas las páginas. Llamar justo antes de abrir/guardar el PDF. */
export function pieEmpresa(doc, empresa, margin = 14) {
  const pie = textoPieEmpresa(empresa);
  if (!pie) return;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const total = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  // Máximo 2 líneas; si no cabe, la segunda termina en "…". Si envuelve, sube.
  let lineas = doc.splitTextToSize(pie, pageWidth - margin * 2);
  if (lineas.length > 2) lineas = [lineas[0], `${String(lineas[1]).replace(/.{0,2}$/, '')}…`];
  const y = pageHeight - 8 - (lineas.length - 1) * 3.5;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(lineas, pageWidth / 2, y, { align: 'center' });
    doc.setTextColor(0);
  }
}
