import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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

// (13/11/2026) PostgREST corta en 1000 filas: sin paginar, un mes grande
// salía con el TXT incompleto. armar() devuelve la consulta ya ordenada.
const traerTodo = async (armar) => {
  const out = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999);
    if (error) throw error;
    for (const r of data || []) out.push(r);
    if (!data || data.length < 1000) break;
  }
  return out;
};

// NCF de las facturas que lo tienen en documentos_fiscales. En lotes de 200
// (la URL tiene tope) y por fecha: si hay varios, queda el más reciente.
const ncfDeDocumentos = async (ids, soloEmitidos) => {
  const mapa = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const docs = await traerTodo(() => {
      let q = supabase.from('documentos_fiscales').select('id, factura_id, ncf, proveedor_number, encf, created_at').in('factura_id', lote);
      if (soloEmitidos) q = q.eq('estado', 'emitido');
      return q.order('created_at', { ascending: true }).order('id', { ascending: true });
    });
    docs.forEach((d) => { const n = d.ncf || d.encf || d.proveedor_number; if (n) mapa.set(d.factura_id, n); });
  }
  return mapa;
};

// (17/11/2026) Lo de un mes (607, 606 y 608), en una función aparte: la usa
// la pantalla para el mes elegido y el Excel de varios meses, mes por mes
// (cada 606 se revisa dentro de su mes, como se declara).
// Cada consulta va filtrada por la empresa con la que se empezó: si alguien
// cambia de empresa a mitad de un rango, no se mezclan meses de dos empresas.
// `que` dice qué reportes hacen falta (el Excel de un rango trae solo uno).
const TODO = { v607: true, c606: true, a608: true };
const traerPeriodo = async (desde, hasta, tenant, que = TODO) => {
  if (!tenant) throw new Error('No hay empresa activa.');
  const rango = rangoDeFechas(desde, hasta);
  let ventas = [];
  let compras = [];
  let anulados = [];

  if (que.v607) {
    // 607: ventas con NCF en el mes (no anuladas).
    // El NCF puede estar en facturas.ncf O en documentos_fiscales.ncf
    // (cuando se emitio via PSFE como Alegra). Buscamos en ambas fuentes.
    const vRaw = await traerTodo(() => supabase
      .from('facturas')
      .select('id, numero, fecha, ncf, tipo_ncf, subtotal, itbis, total, propina, itbis_retenido, isr_retenido, forma_pago, tipo_pago, estado, cliente_id, clientes(nombre, rnc)')
      .eq('tenant_id', tenant)
      .gte('fecha', rango.desde)
      .lte('fecha', rango.hasta)
      .neq('estado', 'ANULADA')
      .eq('es_saldo_inicial', false) // saldos iniciales: deuda vieja, no venta de este periodo
      .order('fecha', { ascending: true }).order('id', { ascending: true }));

    // Para las facturas sin NCF directo, buscar en documentos_fiscales
    const facturasSinNcf = (vRaw || []).filter(f => !f.ncf || f.ncf === '');
    const docsByFacturaId = await ncfDeDocumentos(facturasSinNcf.map(f => f.id), true);

    const v = (vRaw || []).map(f => ({
      ...f,
      ncf: f.ncf || docsByFacturaId.get(f.id) || null,
    })).filter(f => f.ncf && f.ncf !== '');

    // (14/11/2026) Notas de crédito electrónicas (E34) de las devoluciones:
    // van en el 607 como una línea más, con el NCF que modifican. El MES y
    // los MONTOS son los del e-CF (fecha de emisión, MontoTotal, TotalITBIS),
    // no los de la devolución: lo declarado cuadra con lo que tiene la DGII.
    // Solo las emitidas que la DGII no rechazó.
    const ncRaw = await traerTodo(() => supabase
      .from('documentos_fiscales')
      .select('id, encf, emitted_at, estado_dgii, request_payload, devolucion:devoluciones!documentos_fiscales_devolucion_id_fkey(numero, ncf_modificado, cliente_info, factura:facturas(forma_pago, tipo_pago, clientes(nombre, rnc)))')
      .eq('tenant_id', tenant)
      .eq('tipo_documento', 'nota_credito')
      .eq('estado', 'emitido')
      .gte('emitted_at', rango.desde)
      .lte('emitted_at', rango.hasta)
      .order('emitted_at', { ascending: true }).order('id', { ascending: true }));
    const notasCredito = (ncRaw || [])
      .filter((d) => d.estado_dgii !== 'rechazado' && d.encf)
      .map((d) => {
        const imp = d.request_payload?.impresion || {};
        const dv = d.devolucion || {};
        return {
          id: `nc-${d.id}`, numero: `DV-${dv.numero ?? ''}`,
          fecha: new Date(d.emitted_at).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }),
          ncf: d.encf, ncf_modificado: d.request_payload?.encf_modificado || dv.ncf_modificado,
          itbis: Number(imp.total_itbis) || 0, total: Number(imp.monto_total) || 0, propina: 0,
          forma_pago: dv.factura?.forma_pago, tipo_pago: dv.factura?.tipo_pago, es_nota_credito: true,
          cliente_nombre: dv.factura?.clientes?.nombre || dv.cliente_info?.nombre,
          cliente_rnc: dv.factura?.clientes?.rnc || dv.cliente_info?.rnc,
        };
      });

    ventas = [...v.map(r => ({
      ...r,
      cliente_nombre: r.clientes?.nombre,
      cliente_rnc: r.clientes?.rnc,
    })), ...notasCredito];
  }

  if (que.c606) {
    // 606: compras con NCF en el mes
    // Sin las anuladas ni los saldos iniciales, igual que la Hoja del IT-1
    // (_contab_compras_606): una compra anulada no se reporta.
    const c = await traerTodo(() => supabase
      .from('compras')
      .select('id, numero, fecha, ncf, ncf_modificado, tipo_retencion_isr, tipo_bienes_servicios, total_exento, total_gravado, itbis_total, total_compra, forma_pago, tipo_pago_detalle, itbis_retenido_pct, isr_retenido_pct, suplidor_id, proveedores(nombre, rnc), compras_detalle(importe, itbis_pct, productos(naturaleza))')
      .eq('tenant_id', tenant)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .not('ncf', 'is', null)
      .neq('ncf', '')
      .or('estado.is.null,estado.neq.ANULADA')
      .not('es_saldo_inicial', 'is', true)
      .order('fecha', { ascending: true }).order('id', { ascending: true }));

    // (12/11/2026) Comprobantes de gastos APROBADOS (foto de la factura del
    // gasto: sql/ayudante_contable_fase2.sql). Entran al 606 como una compra
    // más. Si esta consulta falla no sale nada: un 606 sin los gastos no puede salir callado.
    const FORMA = { '01': 'Contado', '02': 'Transferencia', '03': 'Tarjeta', '04': 'Credito' };
    const gc = await traerTodo(() => supabase
      .from('gastos_comprobantes')
      .select('id, fecha, ncf, rnc, proveedor_nombre, tipo_bs, monto_gravado, monto_exento, itbis, propina, total, forma_pago')
      .eq('tenant_id', tenant)
      .eq('estado', 'aprobado')
      .eq('entra_606', true)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true }).order('id', { ascending: true }));
    const gastosComoCompras = (gc || []).map((g) => ({
      id: `gasto-${g.id}`, numero: 'GASTO', fecha: g.fecha, ncf: g.ncf,
      tipo_bienes_servicios: g.tipo_bs, total_exento: g.monto_exento, total_gravado: g.monto_gravado,
      itbis_total: g.itbis, total_compra: g.total, propina: g.propina, forma_pago: FORMA[g.forma_pago] || 'Contado',
      itbis_retenido_pct: 0, isr_retenido_pct: 0,
      suplidor_nombre: g.proveedor_nombre, suplidor_rnc: g.rnc, es_gasto: true,
    }));

    compras = [
      ...(c || []).map(r => {
        // Base (sin ITBIS) de las líneas que son productos de SERVICIO: van
        // en la col. 8 del 606. Sin líneas de servicio, null (como antes).
        const lineasServ = (r.compras_detalle || []).filter((d) => d.productos?.naturaleza === 'servicio');
        const montoServicios = lineasServ.length
          ? Math.round(lineasServ.reduce((s, d) => {
            const pct = Number(d.itbis_pct) || 0;
            return s + (Number(d.importe) || 0) / (1 + (pct > 1 ? pct / 100 : pct));
          }, 0) * 100) / 100
          : null;
        const { compras_detalle: _det, ...resto } = r;
        return {
          ...resto,
          monto_servicios: montoServicios,
          suplidor_nombre: r.proveedores?.nombre,
          suplidor_rnc: r.proveedores?.rnc,
        };
      }),
      ...gastosComoCompras,
    ].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  }

  if (que.a608) {
    // 608: facturas anuladas en el mes (mismo fallback de NCF que 607)
    const aRaw = await traerTodo(() => supabase
      .from('facturas')
      .select('id, numero, fecha, ncf, updated_at, estado')
      .eq('tenant_id', tenant)
      .gte('fecha', rango.desde)
      .lte('fecha', rango.hasta)
      .eq('estado', 'ANULADA')
      .order('fecha', { ascending: true }).order('id', { ascending: true }));

    const anuladasSinNcf = (aRaw || []).filter(f => !f.ncf || f.ncf === '');
    const docsAnul = await ncfDeDocumentos(anuladasSinNcf.map(f => f.id), false);
    anulados = (aRaw || []).map(f => ({
      ...f,
      ncf: f.ncf || docsAnul.get(f.id) || null,
    })).filter(f => f.ncf && f.ncf !== '');
  }

  return { ventas, compras, anulados };
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
  // Mes y empresa de lo que está en pantalla: el Excel de un mes sale con ESTO,
  // no con el selector (que cambia antes de que llegue el mes nuevo).
  const [cargado, setCargado] = useState(null);

  const { desde, hasta } = useMemo(() => rangoMes(year, month), [year, month]);

  const pedido = useRef(0); // para descartar la respuesta de un mes que ya no se está mirando

  const cargarDatos = useCallback(async () => {
    if (!tenantId) return;
    const n = ++pedido.current;
    setLoading(true);
    setCargado(null);
    try {
      const datos = await traerPeriodo(desde, hasta, tenantId);
      if (n !== pedido.current) return; // ya se pidió otro mes
      // Los tres juntos y al final: nunca un mes con las ventas de otro.
      setVentas(datos.ventas);
      setCompras(datos.compras);
      setAnulados(datos.anulados);
      setCargado({ year, month, tenantId });
    } catch (error) {
      if (n === pedido.current) {
        // Sin datos a medias en pantalla: no se puede bajar un TXT de un mes con filas de otro.
        setVentas([]); setCompras([]); setAnulados([]); setCargado(null);
        toast({ variant: 'destructive', title: 'Error al cargar datos', description: error.message });
      }
    } finally {
      if (n === pedido.current) setLoading(false);
    }
  }, [tenantId, desde, hasta, year, month, toast]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // ── Totales ──
  const totales607 = useMemo(() => ({
    cant: ventas.length,
    // Las notas de crédito (E34) van en positivo en el TXT pero RESTAN aquí.
    subtotal: ventas.reduce((s, v) => s + (v.es_nota_credito ? -1 : 1) * montoFacturado607(v), 0), // sin ITBIS y ya con descuentos
    itbis: ventas.reduce((s, v) => s + (v.es_nota_credito ? -1 : 1) * parseFloat(v.itbis || 0), 0),
    total: ventas.reduce((s, v) => s + (v.es_nota_credito ? -1 : 1) * parseFloat(v.total || 0), 0),
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
  // (17/11/2026) Uno o varios meses en el mismo archivo. Con varios, cada fila
  // lleva su período (AAAAMM) al final —en el 606 después de las 23 columnas,
  // para que se sigan pegando tal cual— y hay una hoja "Resumen" mes por mes.
  // periodos: [{ year, month, ventas, rev606, anulados }]
  const exportExcel = async (reporte, periodos) => {
    const varios = periodos.length > 1;
    const per = (p) => `${p.year}${String(p.month).padStart(2, '0')}`;
    const r2 = (x) => Math.round(x * 100) / 100;
    const primero = periodos[0];
    const ultimo = periodos[periodos.length - 1];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(varios ? `${reporte} ${per(primero)}-${per(ultimo)}` : `${reporte} ${primero.year}-${String(primero.month).padStart(2, '0')}`);
    const colPeriodo = varios ? [{ header: 'Período', key: 'periodo', width: 10 }] : [];
    const resumen = [];

    if (reporte === '607') {
      ws.columns = [
        { header: 'RNC/Cédula', key: 'rnc', width: 15 },
        { header: 'Cliente', key: 'cliente', width: 30 },
        { header: 'Tipo ID', key: 'tipoId', width: 8 },
        { header: 'NCF', key: 'ncf', width: 15 },
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Subtotal', key: 'subtotal', width: 12 },
        { header: 'ITBIS', key: 'itbis', width: 12 },
        { header: 'Propina', key: 'propina', width: 10 },
        { header: 'Total', key: 'total', width: 12 },
        { header: 'Forma Pago', key: 'forma_pago', width: 14 },
        ...colPeriodo,
      ];
      periodos.forEach((p) => {
        let monto = 0; let itbis = 0; let total = 0;
        p.ventas.forEach((v) => {
          // Las notas de crédito (E34) van en positivo en la fila pero RESTAN en el resumen.
          const signo = v.es_nota_credito ? -1 : 1;
          monto += signo * montoFacturado607(v);
          itbis += signo * parseFloat(v.itbis || 0);
          total += signo * parseFloat(v.total || 0);
          ws.addRow({
            rnc: cleanRncCedula(v.cliente_rnc) || '(sin RNC)',
            cliente: v.cliente_nombre || '',
            tipoId: v.cliente_rnc ? tipoIdentificacion(v.cliente_rnc) : '',
            ncf: v.ncf,
            fecha: fmtFecha(v.fecha),
            subtotal: montoFacturado607(v),
            propina: parseFloat(v.propina || 0),
            itbis: parseFloat(v.itbis || 0),
            total: parseFloat(v.total || 0),
            forma_pago: v.forma_pago || '',
            periodo: per(p),
          });
        });
        resumen.push({ periodo: per(p), mes: `${MESES[p.month - 1]} ${p.year}`, registros: p.ventas.length, monto: r2(monto), itbis: r2(itbis), total: r2(total) });
      });
    } else if (reporte === '606') {
      const COLS = ['RNC o Cédula', 'Tipo Id', 'Tipo Bienes y Servicios Comprados', 'NCF', 'NCF o Documento Modificado',
        'Fecha Comprobante', 'Fecha Pago', 'Monto Facturado en Servicios', 'Monto Facturado en Bienes', 'Total Monto Facturado',
        'ITBIS Facturado', 'ITBIS Retenido', 'ITBIS sujeto a Proporcionalidad (Art. 349)', 'ITBIS llevado al Costo',
        'ITBIS por Adelantar', 'ITBIS percibido en compras', 'Tipo de Retención en ISR', 'Monto Retención Renta',
        'ISR Percibido en compras', 'Impuesto Selectivo al Consumo', 'Otros Impuestos/Tasas', 'Monto Propina Legal', 'Forma de Pago'];
      ws.columns = [...COLS.map((h, i) => ({ header: h, key: `c${i}`, width: i < 7 ? 15 : 13 })),
        { header: 'Suplidor (no se pega)', key: 'sup', width: 30 }, { header: 'Aviso (no se pega)', key: 'aviso', width: 45 },
        ...colPeriodo];
      const excluidas = [];
      periodos.forEach((p) => {
        let monto = 0; let itbis = 0; let total = 0;
        // Códigos y NCF como texto: Excel no les quita los ceros.
        p.rev606.incluidas.forEach((c) => {
          const f = fila606(c);
          const fila = {};
          f.forEach((v, i) => { fila[`c${i}`] = (i >= 7 && i <= 21 && i !== 16) ? Number(v || 0) : v; });
          ws.addRow({ ...fila, sup: c.suplidor_nombre || '', aviso: c.avisos.join(' · '), periodo: per(p) });
          monto += parseFloat(c.total_gravado || 0) + parseFloat(c.total_exento || 0);
          itbis += parseFloat(c.itbis_total || 0);
          total += parseFloat(c.total_compra || 0);
        });
        p.rev606.excluidas.forEach((c) => excluidas.push({ c, periodo: per(p) }));
        resumen.push({ periodo: per(p), mes: `${MESES[p.month - 1]} ${p.year}`, registros: p.rev606.incluidas.length, monto: r2(monto), itbis: r2(itbis), total: r2(total), noVan: p.rev606.excluidas.length });
      });
      if (excluidas.length) {
        const wx = wb.addWorksheet('No van en el 606');
        wx.columns = [
          { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'NCF', key: 'ncf', width: 16 },
          { header: 'Suplidor', key: 'sup', width: 30 }, { header: 'RNC', key: 'rnc', width: 14 },
          { header: 'Total', key: 'total', width: 12 }, { header: 'Por qué no va', key: 'motivo', width: 60 },
          { header: 'Qué hacer', key: 'accion', width: 60 }, ...colPeriodo,
        ];
        excluidas.forEach(({ c, periodo }) => wx.addRow({
          fecha: fmtFecha(c.fecha), ncf: c.ncf, sup: c.suplidor_nombre || '', rnc: cleanRncCedula(c.suplidor_rnc),
          total: parseFloat(c.total_compra || 0), motivo: c.motivo, accion: c.accion, periodo,
        }));
        wx.getRow(1).font = { bold: true };
      }
    } else if (reporte === '608') {
      ws.columns = [
        { header: 'NCF', key: 'ncf', width: 15 },
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Tipo Anulación', key: 'tipo', width: 15 },
        ...colPeriodo,
      ];
      periodos.forEach((p) => {
        p.anulados.forEach((a) => ws.addRow({
          ncf: a.ncf,
          fecha: fmtFecha(a.updated_at || a.fecha),
          tipo: '02 - Errores de impresión',
          periodo: per(p),
        }));
        resumen.push({ periodo: per(p), mes: `${MESES[p.month - 1]} ${p.year}`, registros: p.anulados.length });
      });
    }

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };

    if (varios) {
      const wr = wb.addWorksheet('Resumen');
      const conMontos = reporte !== '608';
      wr.columns = [
        { header: 'Período', key: 'periodo', width: 10 }, { header: 'Mes', key: 'mes', width: 16 },
        { header: 'Registros', key: 'registros', width: 10 },
        ...(conMontos ? [
          { header: 'Monto (sin ITBIS)', key: 'monto', width: 16, style: { numFmt: '#,##0.00' } },
          { header: 'ITBIS', key: 'itbis', width: 14, style: { numFmt: '#,##0.00' } },
          { header: 'Total', key: 'total', width: 16, style: { numFmt: '#,##0.00' } },
        ] : []),
        ...(reporte === '606' ? [{ header: 'No van en el 606', key: 'noVan', width: 16 }] : []),
      ];
      resumen.forEach((r) => wr.addRow(r));
      const sum = (k) => Math.round(resumen.reduce((s, r) => s + (Number(r[k]) || 0), 0) * 100) / 100;
      const tot = wr.addRow({ periodo: 'TOTAL', registros: sum('registros'), monto: sum('monto'), itbis: sum('itbis'), total: sum('total'), noVan: sum('noVan') });
      tot.font = { bold: true };
      wr.getRow(1).font = { bold: true };
      wr.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = varios ? `${reporte}_${per(primero)}-${per(ultimo)}.xlsx` : `${reporte}_${per(primero)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const deQue = varios
      ? `${MESES[primero.month - 1]} ${primero.year} a ${MESES[ultimo.month - 1]} ${ultimo.year} (${periodos.length} meses)`
      : `${MESES[primero.month - 1]} ${primero.year}`;
    toast({ title: 'Excel descargado', description: `${reporte} · ${deQue}` });
  };

  // El mes que está en pantalla.
  const excelDelMes = (reporte) => {
    if (!cargado || cargado.year !== year || cargado.month !== month || cargado.tenantId !== tenantId) {
      toast({ title: 'Espere un momento', description: 'El mes todavía se está cargando.' });
      return;
    }
    exportExcel(reporte, [{ year: cargado.year, month: cargado.month, ventas, rev606, anulados }]);
  };

  // ── Excel de varios meses ──
  const [rDesdeY, setRDesdeY] = useState(hoy.getFullYear());
  const [rDesdeM, setRDesdeM] = useState(1);
  const [rHastaY, setRHastaY] = useState(hoy.getFullYear());
  const [rHastaM, setRHastaM] = useState(hoy.getMonth() + 1);
  const [rangoEstado, setRangoEstado] = useState(null); // texto mientras carga
  const tenantRef = useRef(tenantId);
  tenantRef.current = tenantId;
  const enCurso = useRef(false); // dos clics rápidos no arman dos archivos
  const montado = useRef(true); // si sale de la pantalla, no baja nada
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const excelDelRango = async (reporte) => {
    if (enCurso.current) return;
    const ini = rDesdeY * 12 + (rDesdeM - 1);
    const fin = rHastaY * 12 + (rHastaM - 1);
    if (fin < ini) {
      toast({ variant: 'destructive', title: 'Rango al revés', description: 'El mes "Hasta" es anterior al mes "Desde".' });
      return;
    }
    if (fin - ini + 1 > 24) {
      toast({ variant: 'destructive', title: 'Rango muy largo', description: 'Hasta 24 meses por archivo.' });
      return;
    }
    const tenantInicio = tenantId;
    const que = { v607: reporte === '607', c606: reporte === '606', a608: reporte === '608' };
    const periodos = [];
    enCurso.current = true;
    try {
      for (let k = ini; k <= fin; k++) {
        const y = Math.floor(k / 12);
        const m = (k % 12) + 1;
        setRangoEstado(`Cargando ${MESES[m - 1]} ${y}… (${k - ini + 1} de ${fin - ini + 1})`);
        const r = rangoMes(y, m);
        const d = await traerPeriodo(r.desde, r.hasta, tenantInicio, que);
        if (!montado.current) return;
        // Las consultas ya van con la empresa del inicio; esto solo avisa.
        if (tenantRef.current !== tenantInicio) throw new Error('Cambió de empresa mientras se cargaba. Vuelva a intentarlo.');
        periodos.push({ year: y, month: m, ventas: d.ventas, rev606: que.c606 ? revisar606(d.compras, empresa?.rnc) : null, anulados: d.anulados });
      }
      await exportExcel(reporte, periodos);
    } catch (error) {
      if (montado.current) toast({ variant: 'destructive', title: 'No se pudo armar el Excel', description: error.message });
    } finally {
      enCurso.current = false;
      if (montado.current) setRangoEstado(null);
    }
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

          {/* (17/11/2026) Excel de varios meses: un archivo con todos, mes por mes. */}
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="text-xs font-semibold text-slate-600 mr-1 self-center">Excel de varios meses:</div>
            <div>
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Desde</Label>
              <div className="flex gap-1">
                <select value={rDesdeM} onChange={e => setRDesdeM(parseInt(e.target.value))} className="h-8 px-1 border rounded text-xs">
                  {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select value={rDesdeY} onChange={e => setRDesdeY(parseInt(e.target.value))} className="h-8 px-1 border rounded text-xs">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Hasta</Label>
              <div className="flex gap-1">
                <select value={rHastaM} onChange={e => setRHastaM(parseInt(e.target.value))} className="h-8 px-1 border rounded text-xs">
                  {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select value={rHastaY} onChange={e => setRHastaY(parseInt(e.target.value))} className="h-8 px-1 border rounded text-xs">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            {['606', '607', '608'].map((r) => (
              <Button key={r} variant="outline" size="sm" className="h-8" disabled={!!rangoEstado || !tenantId} onClick={() => excelDelRango(r)}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> {r}
              </Button>
            ))}
            {rangoEstado && (
              <span className="text-xs text-blue-700 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {rangoEstado}</span>
            )}
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
                onExcel={() => excelDelMes('607')}
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
                onExcel={() => excelDelMes('606')}
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
                onExcel={() => excelDelMes('608')}
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
