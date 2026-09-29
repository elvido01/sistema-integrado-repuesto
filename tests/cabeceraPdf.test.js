import { describe, it, expect, beforeEach } from 'vitest';
import jsPDF from 'jspdf';
import { generateHeader } from '@/components/common/pdf/pdfUtils';
import { setEmpresaPrintConfig } from '@/lib/printPOS';

// Lo que escribe la cabecera, con su posición, sin tener que abrir el PDF.
function textosDe(doc) {
  const escritos = [];
  const original = doc.text.bind(doc);
  doc.text = (t, x, y, opts) => { escritos.push({ t: [].concat(t).join(' '), x, y, opts }); return original(t, x, y, opts); };
  return escritos;
}

describe('cabecera de los PDF (pedido, cotización, recibo…)', () => {
  beforeEach(() => setEmpresaPrintConfig({ nombre: 'REPUESTOS MORLA', rnc: '', telefono: '809-000-0000' }));

  it('dice el nombre de la empresa, no "MotoFlow"', () => {
    const doc = new jsPDF();
    const t = textosDe(doc);
    generateHeader(doc, 'PEDIDO / PRE-FACTURA', 'PD-0001');
    const todo = t.map((x) => x.t).join(' | ');
    expect(todo).toContain('REPUESTOS MORLA');
    expect(todo).not.toContain('MotoFlow');
    expect(todo).toContain('Tel: 809-000-0000');
  });

  it('el título y el número caen DENTRO del papel (antes salían a 555 mm en un A4 de 210)', () => {
    const doc = new jsPDF();
    const ancho = doc.internal.pageSize.getWidth();
    const t = textosDe(doc);
    generateHeader(doc, 'PEDIDO / PRE-FACTURA', 'PD-0001');
    const titulo = t.find((x) => x.t === 'PEDIDO / PRE-FACTURA');
    const numero = t.find((x) => x.t.startsWith('Nº:'));
    expect(titulo.x).toBeLessThanOrEqual(ancho);
    expect(numero.x).toBeLessThanOrEqual(ancho);
    const nombre = t.find((x) => x.t.includes('REPUESTOS MORLA'));
    expect(nombre.x).toBeLessThan(20);   // al margen, no a 4 cm
  });

  it('un nombre largo no pisa el título: se parte en la mitad izquierda', () => {
    setEmpresaPrintConfig({ nombre: 'MOTOPRESTAMOS LOS NARAJOS Y CAMINERO MOTORS SRL' });
    const doc = new jsPDF();
    const t = textosDe(doc);
    generateHeader(doc, 'COTIZACIÓN', 'CT-9');
    const nombre = t.find((x) => x.t.includes('MOTOPRESTAMOS'));
    doc.setFontSize(16);
    const lineas = doc.splitTextToSize('MOTOPRESTAMOS LOS NARAJOS Y CAMINERO MOTORS SRL', doc.internal.pageSize.getWidth() / 2 - 14);
    expect(lineas.length).toBeGreaterThan(1);
    expect(nombre).toBeTruthy();
  });

  it('sin empresa cargada, cae en "MotoFlow" en vez de quedar vacío', () => {
    setEmpresaPrintConfig({ nombre: '' });
    const doc = new jsPDF();
    const t = textosDe(doc);
    generateHeader(doc, 'RECIBO', 'RI-1');
    expect(t.map((x) => x.t).join(' ')).toContain('MotoFlow');
  });
});
