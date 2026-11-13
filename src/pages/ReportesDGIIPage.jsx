import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, FileText, Loader2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import ExcelJS from 'exceljs';
import { rangoDeFechas } from '@/lib/dateUtils';
import {
  generar607, generar608, revisar606, fila606, TIPOS_606, tipoBS606,
  downloadTxt, nombreArchivoDgii, fmtMonto, cleanRncCedula, tipoIdentificacion, fmtFecha,
  armarTxtDgii, MAX_REGISTROS_DGII, montoFacturado607,
} from '@/lib/dgiiExport';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// El primer y el último día del mes, como texto. Se arma con aritmética de
// calendario y no pasando un Date por toISOString(): eso convierte a UTC, y
// aquí el 31 a las 23:59 es el 1ro del mes siguiente en UTC. El 607 de
// agosto salía incluyendo el 1ro de septiembre.
const rangoMes = (year, month) => {
  const dd = (n) => String(n).padStart(2, '0');
  const ultimo = new Date(year, month, 0).getDate();
  return {
    desde: `${year}-${dd(month)}-01`,
    hasta: `${year}-${dd(month)}-${dd(ultimo)}`,
  };
};

const ReportesDGIIPage = () => {
  const { empresa, tenantId } = useAuth();
  const { toast } = useToast();

  const hoy = new Date();
  const [year, setYear] = useState(hoy.getFullYear());
  const [month, setMonth] = useState(hoy.getMonth() + 1); // mes anterior por defecto? lo dejamos actual
  const [loading, setLoading] = useState(false);
  const [ventas, setVentas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [anulados, setAnulados] = useState([]);

  const { desde, hasta } = useMemo(() => rangoMes(year, month), [year, month]);

  const cargarDatos = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // 607: ventas con NCF en el mes (no anuladas).
      // El NCF puede estar en facturas.ncf O en documentos_fiscales.ncf
      // (cuando se emitio via PSFE como Alegra). Buscamos en ambas fuentes.
      const { data: vRaw, error: ev } = await supabase
        .from('facturas')
        .select('id, numero, fecha, ncf, tipo_ncf, subtotal, itbis, total, itbis_retenido, isr_retenido, forma_pago, tipo_pago, estado, cliente_id, clientes(nombre, rnc)')
        .gte('fecha', rangoDeFechas(desde, hasta).desde)
        .lte('fecha', rangoDeFechas(desde, hasta).hasta)
        .neq('estado', 'ANULADA')
        .eq('es_saldo_inicial', false) // saldos iniciales: deuda vieja, no venta de este periodo
        .order('fecha', { ascending: true });
      if (ev) throw ev;

      // Para las facturas sin NCF directo, buscar en documentos_fiscales
      const facturasSinNcf = (vRaw || []).filter(f => !f.ncf || f.ncf === '');
      let docsByFacturaId = new Map();
      if (facturasSinNcf.length > 0) {
        const { data: docs } = await supabase
          .from('documentos_fiscales')
          .select('factura_id, ncf, proveedor_number, encf')
          .in('factura_id', facturasSinNcf.map(f => f.id))
          .eq('estado', 'emitido');
        (docs || []).forEach(d => {
          docsByFacturaId.set(d.factura_id, d.ncf || d.encf || d.proveedor_number);
        });
      }

      const v = (vRaw || []).map(f => ({
        ...f,
        ncf: f.ncf || docsByFacturaId.get(f.id) || null,
      })).filter(f => f.ncf && f.ncf !== '');

      // 606: compras con NCF en el mes
      const { data: c, error: ec } = await supabase
        .from('compras')
        .select('id, numero, fecha, ncf, tipo_bienes_servicios, total_exento, total_gravado, itbis_total, total_compra, forma_pago, itbis_retenido_pct, isr_retenido_pct, suplidor_id, proveedores(nombre, rnc)')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .not('ncf', 'is', null)
        .neq('ncf', '')
        .order('fecha', { ascending: true });
      if (ec) throw ec;

      // 608: facturas anuladas en el mes (mismo fallback de NCF que 607)
      const { data: aRaw, error: ea } = await supabase
        .from('facturas')
        .select('id, numero, fecha, ncf, updated_at, estado')
        .gte('fecha', rangoDeFechas(desde, hasta).desde)
        .lte('fecha', rangoDeFechas(desde, hasta).hasta)
        .eq('estado', 'ANULADA')
        .order('fecha', { ascending: true });
      if (ea) throw ea;

      const anuladasSinNcf = (aRaw || []).filter(f => !f.ncf || f.ncf === '');
      let docsAnul = new Map();
      if (anuladasSinNcf.length > 0) {
        const { data: docs } = await supabase
          .from('documentos_fiscales')
          .select('factura_id, ncf, proveedor_number, encf')
          .in('factura_id', anuladasSinNcf.map(f => f.id));
        (docs || []).forEach(d => {
          docsAnul.set(d.factura_id, d.ncf || d.encf || d.proveedor_number);
        });
      }
      const a = (aRaw || []).map(f => ({
        ...f,
        ncf: f.ncf || docsAnul.get(f.id) || null,
      })).filter(f => f.ncf && f.ncf !== '');

      setVentas((v || []).map(r => ({
        ...r,
        cliente_nombre: r.clientes?.nombre,
        cliente_rnc: r.clientes?.rnc,
      })));
      // (12/11/2026) Comprobantes de gastos APROBADOS (foto de la factura del
      // gasto: sql/ayudante_contable_fase2.sql). Entran al 606 como una compra
      // más. Si la tabla no existe todavía, el 606 sale solo con las compras.
      const FORMA = { '01': 'Contado', '02': 'Transferencia', '03': 'Tarjeta', '04': 'Credito' };
      const { data: gc, error: egc } = await supabase
        .from('gastos_comprobantes')
        .select('id, fecha, ncf, rnc, proveedor_nombre, tipo_bs, monto_gravado, monto_exento, itbis, propina, total, forma_pago')
        .eq('estado', 'aprobado')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: true })
        .limit(5000);
      // Solo se perdona que la tabla no exista todavía; cualquier otro fallo
      // se avisa: un 606 sin los gastos no puede salir callado.
      if (egc && !/gastos_comprobantes|42P01|PGRST205/i.test(`${egc.code || ''} ${egc.message || ''}`)) throw egc;
      const gastosComoCompras = (gc || []).map((g) => ({
        id: `gasto-${g.id}`, numero: 'GASTO', fecha: g.fecha, ncf: g.ncf,
        tipo_bienes_servicios: g.tipo_bs, total_exento: g.monto_exento, total_gravado: g.monto_gravado,
        itbis_total: g.itbis, total_compra: g.total, propina: g.propina, forma_pago: FORMA[g.forma_pago] || 'Contado',
        itbis_retenido_pct: 0, isr_retenido_pct: 0,
        suplidor_nombre: g.proveedor_nombre, suplidor_rnc: g.rnc, es_gasto: true,
      }));

      setCompras([
        ...(c || []).map(r => ({
          ...r,
          suplidor_nombre: r.proveedores?.nombre,
          suplidor_rnc: r.proveedores?.rnc,
        })),
        ...gastosComoCompras,
      ].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))));
      setAnulados(a || []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar datos', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, desde, hasta, toast]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // ── Totales ──
  const totales607 = useMemo(() => ({
    cant: ventas.length,
    subtotal: ventas.reduce((s, v) => s + montoFacturado607(v), 0), // sin ITBIS y ya con descuentos
    itbis: ventas.reduce((s, v) => s + parseFloat(v.itbis || 0), 0),
    total: ventas.reduce((s, v) => s + parseFloat(v.total || 0), 0),
  }), [ventas]);

  // (07/11/2026) Qué entra al 606 y qué no (lib/dgiiExport → revisar606).
  const rev606 = useMemo(() => revisar606(compras, empresa?.rnc), [compras, empresa]);
  const totales606 = useMemo(() => ({
    cant: rev606.incluidas.length,
    subtotal: rev606.incluidas.reduce((s, c) => s + parseFloat(c.total_gravado || 0) + parseFloat(c.total_exento || 0), 0),
    itbis: rev606.incluidas.reduce((s, c) => s + parseFloat(c.itbis_total || 0), 0),
    total: rev606.incluidas.reduce((s, c) => s + parseFloat(c.total_compra || 0), 0),
  }), [rev606]);

  // ── Validación: registros con problemas ──
  const alertas607 = useMemo(() => {
    return ventas.filter(v => !v.cliente_rnc || cleanRncCedula(v.cliente_rnc).length < 9).length;
  }, [ventas]);

  const conAviso606 = rev606.incluidas.filter((c) => c.avisos.length).length;

  // ── Exportar TXT ──
  const exportTxt = (reporte) => {
    const rnc = empresa?.rnc || '';
    const filename = nombreArchivoDgii(reporte, rnc, year, month);
    let contenido = '';
    if (reporte === '607') contenido = generar607(ventas);
    else if (reporte === '606') contenido = rev606.incluidas.map((c) => fila606(c).join('|')).join('\n');
    else if (reporte === '608') contenido = generar608(anulados.map(a => ({ ncf: a.ncf, fecha: a.updated_at || a.fecha, tipo_anulacion: '02' })));

    if (!contenido) {
      toast({ title: 'Sin datos', description: `No hay registros para el ${reporte} del período. Si no hubo operaciones, preséntelo en la Oficina Virtual como «Declaración en cero».` });
      return;
    }
    // (13/11/2026) El RNC va en la primera línea del archivo: sin él la DGII lo rechaza.
    const rncLimpio = cleanRncCedula(rnc);
    if (rncLimpio.length !== 9 && rncLimpio.length !== 11) {
      toast({ variant: 'destructive', title: 'Falta el RNC de la empresa', description: 'El archivo lleva el RNC (9 dígitos) o la cédula (11) en la primera línea. Póngalo en Perfil Empresa.' });
      return;
    }
    // Con el encabezado de la herramienta oficial: <formato>|<RNC>|<AAAAMM>|<registros>.
    const txt = armarTxtDgii(reporte, rnc, year, month, contenido);
    const registros = txt.split('\r\n').length - 1;
    const tope = MAX_REGISTROS_DGII[reporte];
    if (tope && registros > tope) {
      toast({ variant: 'destructive', title: `El ${reporte} tiene ${registros} registros`, description: `La DGII acepta hasta ${tope.toLocaleString('en-US')} por archivo. Consulte cómo dividir el envío antes de subirlo.` });
      return;
    }
    downloadTxt(txt, filename);
    toast({ title: 'Archivo generado', description: `${filename} · ${registros} registro(s), listo para subir a la Oficina Virtual.` });
  };

  // ── Exportar Excel (preview para contador) ──
  const exportExcel = async (reporte) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${reporte} ${year}-${String(month).padStart(2, '0')}`);

    if (reporte === '607') {
      ws.columns = [
        { header: 'RNC/Cédula', key: 'rnc', width: 15 },
        { header: 'Cliente', key: 'cliente', width: 30 },
        { header: 'Tipo ID', key: 'tipoId', width: 8 },
        { header: 'NCF', key: 'ncf', width: 15 },
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Subtotal', key: 'subtotal', width: 12 },
        { header: 'ITBIS', key: 'itbis', width: 12 },
        { header: 'Total', key: 'total', width: 12 },
        { header: 'Forma Pago', key: 'forma_pago', width: 14 },
      ];
      ventas.forEach(v => ws.addRow({
        rnc: cleanRncCedula(v.cliente_rnc) || '(sin RNC)',
        cliente: v.cliente_nombre || '',
        tipoId: v.cliente_rnc ? tipoIdentificacion(v.cliente_rnc) : '',
        ncf: v.ncf,
        fecha: fmtFecha(v.fecha),
        subtotal: montoFacturado607(v),
        itbis: parseFloat(v.itbis || 0),
        total: parseFloat(v.total || 0),
        forma_pago: v.forma_pago || '',
      }));
    } else if (reporte === '606') {
      const COLS = ['RNC o Cédula', 'Tipo Id', 'Tipo Bienes y Servicios Comprados', 'NCF', 'NCF o Documento Modificado',
        'Fecha Comprobante', 'Fecha Pago', 'Monto Facturado en Servicios', 'Monto Facturado en Bienes', 'Total Monto Facturado',
        'ITBIS Facturado', 'ITBIS Retenido', 'ITBIS sujeto a Proporcionalidad (Art. 349)', 'ITBIS llevado al Costo',
        'ITBIS por Adelantar', 'ITBIS percibido en compras', 'Tipo de Retención en ISR', 'Monto Retención Renta',
        'ISR Percibido en compras', 'Impuesto Selectivo al Consumo', 'Otros Impuestos/Tasas', 'Monto Propina Legal', 'Forma de Pago'];
      ws.columns = [...COLS.map((h, i) => ({ header: h, key: `c${i}`, width: i < 7 ? 15 : 13 })),
        { header: 'Suplidor (no se pega)', key: 'sup', width: 30 }, { header: 'Aviso (no se pega)', key: 'aviso', width: 45 }];
      // Códigos y NCF como texto: Excel no les quita los ceros.
      rev606.incluidas.forEach((c) => {
        const f = fila606(c);
        const fila = {};
        f.forEach((v, i) => { fila[`c${i}`] = (i >= 7 && i <= 21 && i !== 16) ? Number(v || 0) : v; });
        ws.addRow({ ...fila, sup: c.suplidor_nombre || '', aviso: c.avisos.join(' · ') });
      });
      ws.getRow(1).font = { bold: true };
      if (rev606.excluidas.length) {
        const wx = wb.addWorksheet('No van en el 606');
        wx.columns = [
          { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'NCF', key: 'ncf', width: 16 },
          { header: 'Suplidor', key: 'sup', width: 30 }, { header: 'RNC', key: 'rnc', width: 14 },
          { header: 'Total', key: 'total', width: 12 }, { header: 'Por qué no va', key: 'motivo', width: 60 },
          { header: 'Qué hacer', key: 'accion', width: 60 },
        ];
        rev606.excluidas.forEach((c) => wx.addRow({
          fecha: fmtFecha(c.fecha), ncf: c.ncf, sup: c.suplidor_nombre || '', rnc: cleanRncCedula(c.suplidor_rnc),
          total: parseFloat(c.total_compra || 0), motivo: c.motivo, accion: c.accion,
        }));
        wx.getRow(1).font = { bold: true };
      }
    } else if (reporte === '608') {
      ws.columns = [
        { header: 'NCF', key: 'ncf', width: 15 },
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Tipo Anulación', key: 'tipo', width: 15 },
      ];
      anulados.forEach(a => ws.addRow({
        ncf: a.ncf,
        fecha: fmtFecha(a.updated_at || a.fecha),
        tipo: '02 - Errores de impresión',
      }));
    }

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reporte}_${year}${String(month).padStart(2, '0')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Excel descargado', description: `${reporte} del período ${MESES[month - 1]} ${year}` });
  };

  const years = Array.from({ length: 6 }, (_, i) => hoy.getFullYear() - i);

  return (
    <>
      <Helmet><title>Reportes DGII — MotoFlow</title></Helmet>

      <div className="h-full flex flex-col p-4 bg-gray-50 space-y-3 overflow-y-auto">
        {/* Header */}
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold text-blue-800 flex items-center gap-2">
                <FileText className="w-5 h-5" /> Reportes DGII
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Formatos 606 (Compras), 607 (Ventas) y 608 (Anulados) — TXT oficial DGII + Excel para contador
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Mes</Label>
                <select
                  value={month}
                  onChange={e => setMonth(parseInt(e.target.value))}
                  className="h-9 px-2 border rounded text-sm block"
                >
                  {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Año</Label>
                <select
                  value={year}
                  onChange={e => setYear(parseInt(e.target.value))}
                  className="h-9 px-2 border rounded text-sm block"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>

          {!empresa?.rnc && (
            <div className="mt-3 flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs">
              <AlertCircle className="w-4 h-4" />
              Configure el RNC de su empresa en <strong>Perfil Empresa</strong> para que los archivos se nombren correctamente.
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border p-4 flex-grow">
          <Tabs defaultValue="607" className="w-full">
            <TabsList className="grid grid-cols-3 w-full max-w-md">
              <TabsTrigger value="607">607 — Ventas</TabsTrigger>
              <TabsTrigger value="606">606 — Compras</TabsTrigger>
              <TabsTrigger value="608">608 — Anulados</TabsTrigger>
            </TabsList>

            {/* 607 */}
            <TabsContent value="607" className="mt-4">
              <ReporteSection
                titulo="607 — Reporte de Ventas"
                subtitulo={`${ventas.length} facturas con NCF · Subtotal RD$ ${totales607.subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })} · ITBIS RD$ ${totales607.itbis.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`}
                alertas={alertas607}
                loading={loading}
                onTxt={() => exportTxt('607')}
                onExcel={() => exportExcel('607')}
              >
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Fecha</TableHead>
                      <TableHead>NCF</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>RNC/Céd</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="text-right">ITBIS</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : ventas.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-4">Sin ventas con NCF en el período</TableCell></TableRow>
                    ) : ventas.map(v => {
                      const rncMalo = !v.cliente_rnc || cleanRncCedula(v.cliente_rnc).length < 9;
                      return (
                        <TableRow key={v.id} className={rncMalo ? 'bg-amber-50' : ''}>
                          <TableCell>{fmtFecha(v.fecha)}</TableCell>
                          <TableCell className="font-mono">{v.ncf}</TableCell>
                          <TableCell className="truncate max-w-[200px]">{v.cliente_nombre}</TableCell>
                          <TableCell className="font-mono">{cleanRncCedula(v.cliente_rnc) || <span className="text-amber-600">(falta)</span>}</TableCell>
                          <TableCell className="text-right">{fmtMonto(montoFacturado607(v))}</TableCell>
                          <TableCell className="text-right">{fmtMonto(v.itbis)}</TableCell>
                          <TableCell className="text-right font-bold">{fmtMonto(v.total)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ReporteSection>
            </TabsContent>

            {/* 606 */}
            <TabsContent value="606" className="mt-4">
              <ReporteSection
                titulo="606 — Reporte de Compras y Gastos"
                subtitulo={`${totales606.cant} van en el 606 · Monto RD$ ${totales606.subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })} · ITBIS RD$ ${totales606.itbis.toLocaleString('es-DO', { minimumFractionDigits: 2 })}${rev606.excluidas.length ? ` · ${rev606.excluidas.length} no van (ver abajo)` : ''}`}
                alertas={conAviso606}
                textoAlerta="con aviso: revíselas antes de subir (fila amarilla)"
                loading={loading}
                onTxt={() => exportTxt('606')}
                onExcel={() => exportExcel('606')}
              >
                <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900 space-y-0.5">
                  <p><b>Van en el 606:</b> {Object.keys(TIPOS_606).join(', ')}. Las facturas electrónicas (E31…) recibidas también se reportan.</p>
                  <p><b>No van:</b> facturas de consumo B02 / E32 (consumidor final), NCF mal escritos, suplidores sin RNC y repetidas.</p>
                  <p>Si un suplidor ya está obligado a facturar electrónico, la DGII rechaza sus facturas B: pídale la E31. El Excel trae las 23 columnas en el orden de la herramienta de la DGII para pegarlas tal cual.</p>
                </div>
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Fecha</TableHead>
                      <TableHead>NCF</TableHead>
                      <TableHead>Suplidor</TableHead>
                      <TableHead>RNC</TableHead>
                      <TableHead>Tipo B/S</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">ITBIS</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : rev606.incluidas.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-4">Sin compras para el 606 en el período</TableCell></TableRow>
                    ) : rev606.incluidas.map(c => (
                      <TableRow key={c.id} className={c.avisos.length ? 'bg-amber-50' : ''} title={c.avisos.join(' · ')}>
                        <TableCell>{fmtFecha(c.fecha)}</TableCell>
                        <TableCell className="font-mono">{c.ncf}<span className="ml-1 text-[10px] text-slate-400">{TIPOS_606[c.tipo]}</span></TableCell>
                        <TableCell className="truncate max-w-[200px]">{c.suplidor_nombre}{c.avisos.length > 0 && <span className="block text-[10px] text-amber-700">{c.avisos.join(' · ')}</span>}</TableCell>
                        <TableCell className="font-mono">{c.rnc_606}</TableCell>
                        <TableCell>{tipoBS606(c)}</TableCell>
                        <TableCell className="text-right">{fmtMonto(parseFloat(c.total_gravado || 0) + parseFloat(c.total_exento || 0))}</TableCell>
                        <TableCell className="text-right">{fmtMonto(c.itbis_total)}</TableCell>
                        <TableCell className="text-right font-bold">{fmtMonto(c.total_compra)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!loading && rev606.excluidas.length > 0 && (
                  <div className="mt-5">
                    <h3 className="text-sm font-bold text-red-700 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> No van en el 606 ({rev606.excluidas.length})</h3>
                    <p className="text-xs text-slate-500 mb-2">No salen en el TXT ni en la hoja principal del Excel (van en la hoja "No van en el 606").</p>
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="bg-red-50">
                          <TableHead>Fecha</TableHead>
                          <TableHead>NCF</TableHead>
                          <TableHead>Suplidor</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Por qué no va</TableHead>
                          <TableHead>Qué hacer</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rev606.excluidas.map(c => (
                          <TableRow key={c.id}>
                            <TableCell>{fmtFecha(c.fecha)}</TableCell>
                            <TableCell className="font-mono">{c.ncf || '—'}</TableCell>
                            <TableCell className="truncate max-w-[180px]">{c.suplidor_nombre}</TableCell>
                            <TableCell className="text-right">{fmtMonto(c.total_compra)}</TableCell>
                            <TableCell className="text-red-700">{c.motivo}</TableCell>
                            <TableCell className="text-slate-600">{c.accion}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </ReporteSection>
            </TabsContent>

            {/* 608 */}
            <TabsContent value="608" className="mt-4">
              <ReporteSection
                titulo="608 — NCF Anulados"
                subtitulo={`${anulados.length} comprobantes anulados`}
                alertas={0}
                loading={loading}
                onTxt={() => exportTxt('608')}
                onExcel={() => exportExcel('608')}
              >
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>NCF</TableHead>
                      <TableHead>Fecha Anulación</TableHead>
                      <TableHead>Factura #</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={3} className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : anulados.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-slate-400 py-4">Sin NCF anulados en el período</TableCell></TableRow>
                    ) : anulados.map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono">{a.ncf}</TableCell>
                        <TableCell>{fmtFecha(a.updated_at || a.fecha)}</TableCell>
                        <TableCell>{a.numero}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ReporteSection>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

const ReporteSection = ({ titulo, subtitulo, alertas, textoAlerta, loading, onTxt, onExcel, children }) => (
  <div className="space-y-3">
    <div className="flex justify-between items-start gap-4 border-b pb-3">
      <div>
        <h2 className="text-base font-bold text-slate-800">{titulo}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{subtitulo}</p>
        {alertas > 0 && (
          <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {alertas} registro{alertas !== 1 ? 's' : ''} {textoAlerta || 'sin RNC/Cédula válido — revisar antes de subir a DGII'}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onExcel} disabled={loading}>
          <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
        </Button>
        <Button size="sm" className="bg-blue-700 hover:bg-blue-800 text-white" onClick={onTxt} disabled={loading}>
          <Download className="w-4 h-4 mr-1" /> TXT DGII
        </Button>
      </div>
    </div>
    <div className="max-h-[50vh] overflow-y-auto">
      {children}
    </div>
  </div>
);

export default ReportesDGIIPage;
