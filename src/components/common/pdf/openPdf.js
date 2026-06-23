// Abre un PDF de jsPDF en una pestaña nueva de forma confiable.
//
// doc.output('dataurlnewwindow') falla en Chrome moderno: abre una pestaña
// about:blank en blanco porque el navegador bloquea la navegacion a data: URLs
// en el frame principal. Aqui usamos un blob URL (que Chrome SI renderiza) y,
// si el popup esta bloqueado, descargamos el archivo como respaldo.
export function openPdf(doc, filename = 'documento.pdf') {
  try {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      // Popup bloqueado -> descargar
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    try { doc.save(filename); } catch { /* noop */ }
  }
}
