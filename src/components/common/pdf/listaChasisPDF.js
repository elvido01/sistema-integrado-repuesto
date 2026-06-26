import jsPDF from 'jspdf';
import { openPdf } from './openPdf';
import autoTable from 'jspdf-autotable';
import { formatInTimeZone } from '@/lib/dateUtils';

const fmt = (v) => (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fdate = (d) => { try { return d ? formatInTimeZone(new Date(`${String(d).slice(0,10)}T00:00:00`), 'dd/MM/yyyy') : ''; } catch { return ''; } };

const ESTADOS = { todos: 'Todos', pagados: 'Pagados', pendientes: 'Pendientes' };

// Lista de Chasis relacionados con Préstamos en A4 horizontal (apaisado).
export const generateListaChasisPDF = (rows = [], filtros = {}, empresa = {}) => {
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.width;
  const margin = 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text((empresa.nombre || 'MotoPréstamos').toUpperCase(), margin, 13);
  doc.setFontSize(12);
  doc.text('LISTA DE CHASIS RELACIONADOS CON PRÉSTAMOS', pageWidth / 2, 19, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Impresión: ${formatInTimeZone(new Date(), 'dd/MM/yyyy hh:mm a')}`, pageWidth - margin, 13, { align: 'right' });
  doc.text(`Estatus: ${ESTADOS[filtros.estado] || 'Todos'}`, margin, 25);

  const body = rows.map((r) => [
    r.prestamo || '',
    fdate(r.fecha),
    fmt(r.balance),
    r.cliente || '',
    (r.nombre || '').substring(0, 28),
    r.chasis || '',
    r.tipo || '',
    r.marca || '',
    r.modelo || '',
    r.anio || '',
  ]);

  const totalBalance = rows.reduce((a, r) => a + (Number(r.balance) || 0), 0);

  autoTable(doc, {
    head: [['PRÉSTAMO', 'FECHA', 'BALANCE', 'CLIENTE', 'NOMBRE', 'CHASIS', 'TIPO', 'MARCA', 'MODELO', 'AÑO']],
    body,
    startY: 28,
    theme: 'grid',
    styles: { fontSize: 7, font: 'helvetica', cellPadding: 1.3 },
    headStyles: { fillColor: [4, 53, 115], textColor: 255, fontSize: 7 },
    columnStyles: {
      2: { halign: 'right' },
      9: { halign: 'center' },
    },
    margin: { left: margin, right: margin },
  });

  const finalY = doc.lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Préstamos: ${rows.length}`, margin, finalY);
  doc.text(`Balance total pendiente: ${fmt(totalBalance)}`, pageWidth - margin, finalY, { align: 'right' });

  openPdf(doc, `Lista-Chasis-Prestamos.pdf`);
};
