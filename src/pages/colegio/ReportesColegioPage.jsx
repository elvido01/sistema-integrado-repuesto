// =====================================================================
// Reportes del Colegio (centros educativos, parte 4 · 06/11/2026)
// ---------------------------------------------------------------------
// Los que pidió el colegio: deudores por grado, deudores por mes,
// antigüedad de saldos (30 / 60), cobrado por día o por mes, listado
// correlativo de recibos (vigente / anulado), arqueo por forma de pago y
// la proyección de reservas del año próximo. Cada pestaña arma UNA tabla
// que sirve igual para la pantalla, la hoja impresa y el Excel.
// Los datos salen de funciones de la base (sql/centros_educativos_reportes.sql)
// para no chocar con el tope de 1,000 filas de la pantalla.
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { BarChart3, Loader2, Printer, FileSpreadsheet, RefreshCw, FileText } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { printHtmlSmart } from '@/lib/printHtmlSmart';
import { exportToExcel } from '@/lib/excelExport';
import { reporteColegioHTML, numeroRecibo } from '@/lib/printColegio';
import { MESES, ESTADO_ESTUDIANTE } from '@/lib/colegio';
import { hoyRD, diasAtraso, tramoAntiguedad, datosColegio, imprimirEstadoCuenta, TANDAS } from '@/lib/colegioReportes';

const n2 = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const campo = 'h-9 rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;
const mesDe = (periodo) => (periodo ? `${MESES[Number(String(periodo).slice(5, 7)) - 1]} ${String(periodo).slice(0, 4)}` : '');
const fechaDO = (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const horaDO = (t) => (t ? new Date(t).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santo_Domingo' }) : '');
const primeroDelMes = () => `${hoyRD().slice(0, 7)}-01`;
const ANUALES = ['inscripcion', 'reservacion', 'utileria'];
const esEfectivo = (forma) => /efectivo/i.test(forma || '');

const PESTANAS = [
  ['grado', 'Deudores por grado'],
  ['mes', 'Deudores por mes'],
  ['antiguedad', 'Antigüedad de saldos'],
  ['cobrado', 'Cobrado'],
  ['recibos', 'Listado de recibos'],
  ['arqueo', 'Arqueo'],
  ['reservas', 'Reservas año próximo'],
  ['confirmar', 'Por confirmar'],
];
const CON_RANGO = ['cobrado', 'recibos', 'arqueo'];
const CON_PENDIENTES = ['grado', 'mes', 'antiguedad'];

export default function ReportesColegioPage() {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [pestana, setPestana] = useState('grado');
  const [pendientes, setPendientes] = useState(null);
  const [cobros, setCobros] = useState(null);
  const [reservas, setReservas] = useState(null);
  const [porConfirmar, setPorConfirmar] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [desde, setDesde] = useState(hoyRD());
  const [hasta, setHasta] = useState(hoyRD());
  const [agrupar, setAgrupar] = useState('dia');      // cobrado: 'dia' | 'mes'
  const [incluirPorVencer, setIncluirPorVencer] = useState(false);
  const [filtroReserva, setFiltroReserva] = useState('todos');

  const error = useCallback((t, d) => toast({ title: t, description: d ? String(d) : undefined, variant: 'destructive' }), [toast]);

  const cargarPendientes = useCallback(async () => {
    setCargando(true);
    const { data, error: e } = await supabase.rpc('edu_reporte_pendientes');
    setCargando(false);
    if (e) return error('No se pudo cargar lo pendiente', e.message);
    setPendientes(data || []);
    return undefined;
  }, [error]);

  const cargarCobros = useCallback(async () => {
    if (!desde || !hasta || hasta < desde) return error('Rango de fechas no válido');
    setCargando(true);
    const { data, error: e } = await supabase.rpc('edu_reporte_cobros', { p_desde: desde, p_hasta: hasta });
    setCargando(false);
    if (e) return error('No se pudieron cargar los cobros', e.message);
    setCobros(data || []);
    return undefined;
  }, [desde, hasta, error]);

  const cargarReservas = useCallback(async () => {
    setCargando(true);
    const { data, error: e } = await supabase.rpc('edu_reporte_reservas');
    setCargando(false);
    if (e) return error('No se pudieron cargar las reservas', e.message);
    setReservas(data || { filas: [] });
    return undefined;
  }, [error]);

  // Los que subieron de curso en el cambio de año sin confirmar que siguen.
  const cargarPorConfirmar = useCallback(async () => {
    setCargando(true);
    const { data, error: e } = await supabase.rpc('edu_reporte_por_confirmar');
    setCargando(false);
    if (e) return error('No se pudo cargar la lista', e.message);
    setPorConfirmar(data || []);
    return undefined;
  }, [error]);

  // Carga lo que la pestaña necesita la primera vez que se abre.
  useEffect(() => {
    if (!tenantId) return;
    if (CON_PENDIENTES.includes(pestana) && pendientes === null) cargarPendientes();
    if (CON_RANGO.includes(pestana) && cobros === null) cargarCobros();
    if (pestana === 'reservas' && reservas === null) cargarReservas();
    if (pestana === 'confirmar' && porConfirmar === null) cargarPorConfirmar();
  }, [tenantId, pestana, pendientes, cobros, reservas, porConfirmar, cargarPendientes, cargarCobros, cargarReservas, cargarPorConfirmar]);

  const actualizar = () => {
    if (CON_PENDIENTES.includes(pestana)) cargarPendientes();
    else if (CON_RANGO.includes(pestana)) cargarCobros();
    else if (pestana === 'confirmar') cargarPorConfirmar();
    else cargarReservas();
  };

  // ── Lo vencido (o todo, si se pide) con sus días de atraso ──
  const deuda = useMemo(() => {
    const hoy = hoyRD();
    return (pendientes || [])
      .map((c) => ({ ...c, pendiente: Number(c.pendiente), dias: diasAtraso(c.desde, hoy) }))
      .filter((c) => incluirPorVencer || c.dias > 0);
  }, [pendientes, incluirPorVencer]);

  const cobrosVigentes = useMemo(() => (cobros || []).filter((p) => !p.anulado), [cobros]);
  const rango = desde === hasta ? fechaDO(desde) : `Del ${fechaDO(desde)} al ${fechaDO(hasta)}`;

  // ── Cada pestaña → { titulo, subtitulo, columnas, filas, total, nota } ──
  const tabla = useMemo(() => {
    if (pestana === 'grado') return tablaPorGrado(deuda, incluirPorVencer);
    if (pestana === 'mes') return tablaPorMes(deuda, incluirPorVencer);
    if (pestana === 'antiguedad') return tablaAntiguedad(pendientes || []);
    if (pestana === 'cobrado') return tablaCobrado(cobrosVigentes, agrupar, rango);
    if (pestana === 'recibos') return tablaRecibos(cobros || [], rango);
    if (pestana === 'arqueo') return tablaArqueo(cobros || [], rango);
    if (pestana === 'confirmar') return tablaPorConfirmar(porConfirmar || []);
    return tablaReservas(reservas, filtroReserva);
  }, [pestana, deuda, incluirPorVencer, pendientes, cobrosVigentes, cobros, agrupar, rango, reservas, filtroReserva, porConfirmar]);

  const imprimir = async () => {
    try {
      const colegio = await datosColegio(tenantId);
      await printHtmlSmart(reporteColegioHTML({ colegio, ...tabla }), { tipo: 'carta' });
    } catch (e) { error('No se pudo imprimir', e?.message); }
  };

  const excel = async () => {
    const cols = tabla.columnas;
    const filas = [...tabla.filas, ...(tabla.total ? [tabla.total] : [])]
      .map((r) => (r._grupo ? { [cols[0].k]: r._grupo } : r))
      .map((r) => Object.fromEntries(cols.map((c) => [c.k, c.m ? (r[c.k] === '' || r[c.k] == null ? '' : r2(r[c.k])) : (r[c.k] ?? '')])));
    try {
      await exportToExcel(filas, Object.fromEntries(cols.map((c) => [c.k, c.t])), tabla.titulo.replace(/\s+/g, '_'));
    } catch (e) { error('No se pudo exportar', e?.message); }
  };

  const verEstado = (familiaId) => imprimirEstadoCuenta(familiaId, tenantId).catch((e) => error('No se pudo imprimir', e?.message));

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6">
      <Helmet><title>Reportes del Colegio</title></Helmet>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-700" />
            <div>
              <h1 className="text-lg font-black text-gray-800 uppercase tracking-wide">Reportes del Colegio</h1>
              <p className="text-xs text-gray-500">Deudores, cobros, arqueo y reservas · se imprimen en hoja o se bajan a Excel</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={actualizar} disabled={cargando}>
              <RefreshCw className={`w-4 h-4 mr-1 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
            </Button>
            <Button variant="outline" size="sm" onClick={imprimir}><Printer className="w-4 h-4 mr-1" /> Imprimir</Button>
            <Button variant="outline" size="sm" onClick={excel}><FileSpreadsheet className="w-4 h-4 mr-1" /> Excel</Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-gray-200">
          {PESTANAS.map(([id, t]) => (
            <button key={id} type="button" onClick={() => setPestana(id)}
              className={`px-3 py-2 text-sm font-semibold rounded-t-md -mb-px border ${pestana === id
                ? 'bg-white border-gray-200 border-b-white text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Filtros de la pestaña ── */}
        <div className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-lg p-3">
          {CON_RANGO.includes(pestana) && (
            <>
              <label className="text-xs font-bold text-gray-600 uppercase">Desde
                <input type="date" className={`${campo} block mt-1`} value={desde} onChange={(e) => setDesde(e.target.value)} />
              </label>
              <label className="text-xs font-bold text-gray-600 uppercase">Hasta
                <input type="date" className={`${campo} block mt-1`} value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </label>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setDesde(hoyRD()); setHasta(hoyRD()); }}>Hoy</Button>
                <Button size="sm" variant="ghost" onClick={() => { setDesde(primeroDelMes()); setHasta(hoyRD()); }}>Este mes</Button>
              </div>
              {pestana === 'cobrado' && (
                <label className="text-xs font-bold text-gray-600 uppercase">Agrupar
                  <select className={`${campo} block mt-1`} value={agrupar} onChange={(e) => setAgrupar(e.target.value)}>
                    <option value="dia">Por día</option>
                    <option value="mes">Por mes</option>
                  </select>
                </label>
              )}
              <Button size="sm" onClick={cargarCobros} disabled={cargando}>Ver</Button>
            </>
          )}
          {(pestana === 'grado' || pestana === 'mes') && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={incluirPorVencer} onChange={(e) => setIncluirPorVencer(e.target.checked)} />
              Incluir lo que todavía no vence (todo lo que falta del año)
            </label>
          )}
          {pestana === 'antiguedad' && <span className="text-sm text-gray-500">Días desde que venció cada cargo. Lo que no ha vencido sale aparte.</span>}
          {pestana === 'reservas' && (
            <label className="text-xs font-bold text-gray-600 uppercase">Mostrar
              <select className={`${campo} block mt-1`} value={filtroReserva} onChange={(e) => setFiltroReserva(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="sin_reservar">Sin reservar</option>
                <option value="pendiente">Cargada sin pagar (no cuenta)</option>
                <option value="pagada">Reservado y pagado</option>
                <option value="gradua">Se gradúan</option>
              </select>
            </label>
          )}
        </div>

        {pestana === 'reservas' && reservas && <ResumenReservas reservas={reservas} />}
        {pestana === 'arqueo' && cobros && (
          <p className="text-xs text-gray-500 px-1">
            Es el mismo dinero de los recibos de ingreso del colegio, que también entran solos en el <b>Cierre de Caja</b>. El efectivo en dólares se cuenta en pesos a la tasa del cobro.
          </p>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          {cargando && !tabla.filas.length ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div>
          ) : (
            <TablaReporte tabla={tabla} onFamilia={verEstado} />
          )}
        </div>
      </div>
    </div>
  );
}

function TablaReporte({ tabla, onFamilia }) {
  const { columnas, filas, total } = tabla;
  const celda = (c, r) => (c.m ? (r[c.k] === '' || r[c.k] == null ? '' : n2(r[c.k])) : (r[c.k] ?? ''));
  const conFamilia = filas.some((r) => r._familia_id);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-800 text-white text-xs">
          {columnas.map((c) => <th key={c.k} className={`px-3 py-2 ${c.m ? 'text-right' : 'text-left'}`}>{c.t}</th>)}
          {conFamilia && <th className="w-10" />}
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 && <tr><td colSpan={columnas.length + 1} className="px-3 py-6 text-center text-gray-400">Sin datos</td></tr>}
        {filas.map((r, i) => {
          if (r._grupo) {
            return <tr key={`g${i}`} className="bg-blue-50"><td colSpan={columnas.length + (conFamilia ? 1 : 0)} className="px-3 py-1.5 font-black text-blue-900">{r._grupo}</td></tr>;
          }
          return (
            <tr key={i} className={`border-b ${r._sub ? 'bg-gray-50 font-bold' : ''} ${r._anulado ? 'text-gray-400 line-through' : ''}`}>
              {columnas.map((c) => <td key={c.k} className={`px-3 py-1.5 ${c.m ? 'text-right font-mono whitespace-nowrap' : ''}`}>{celda(c, r)}</td>)}
              {conFamilia && (
                <td className="pr-2 text-right">
                  {r._familia_id && (
                    <button type="button" title="Estado de cuenta de la familia" className="text-gray-400 hover:text-blue-700" onClick={() => onFamilia(r._familia_id)}>
                      <FileText className="w-4 h-4" />
                    </button>
                  )}
                </td>
              )}
            </tr>
          );
        })}
        {total && (
          <tr className="border-t-2 border-slate-800 font-black bg-white">
            {columnas.map((c) => <td key={c.k} className={`px-3 py-2 ${c.m ? 'text-right font-mono whitespace-nowrap' : ''}`}>{celda(c, total)}</td>)}
            {conFamilia && <td />}
          </tr>
        )}
      </tbody>
    </table>
  );
}

function ResumenReservas({ reservas }) {
  const f = reservas.filas || [];
  const cuenta = (k) => f.filter((x) => x.reserva === k).length;
  const continuan = f.length - cuenta('gradua');
  const pagadas = cuenta('pagada');
  const caja = [
    ['Reservaron y pagaron', pagadas, 'text-emerald-700'],
    ['Cargada sin pagar (no cuenta)', cuenta('pendiente'), 'text-amber-700'],
    ['Sin reservar', cuenta('sin_reservar'), 'text-red-700'],
    ['Se gradúan', cuenta('gradua'), 'text-gray-600'],
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {caja.map(([t, v, c]) => (
        <div key={t} className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 uppercase font-bold">{t}</div>
          <div className={`text-2xl font-black ${c}`}>{v}</div>
        </div>
      ))}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="text-xs text-gray-500 uppercase font-bold">Asegurado {reservas.anio_siguiente}</div>
        <div className="text-2xl font-black text-blue-800">{continuan ? Math.round((pagadas / continuan) * 100) : 0}%</div>
        <div className="text-[11px] text-gray-500">{pagadas} de {continuan} que pueden seguir</div>
      </div>
    </div>
  );
}

// ── Armado de cada reporte ──────────────────────────────────────────────

// Suma por estudiante: RD$, US$ y cuántas mensualidades debe.
function porEstudiante(cargos) {
  const m = new Map();
  cargos.forEach((c) => {
    const k = c.estudiante_id;
    if (!m.has(k)) {
      m.set(k, {
        estudiante: c.estudiante, matricula: c.matricula, curso: c.curso, curso_orden: c.curso_orden,
        tanda: TANDAS[c.tanda] || '', tutor: c.tutor || '', telefono: c.telefono || '', estado: c.estado,
        _familia_id: c.familia_id, familia: c.familia, meses: [], rd: 0, usd: 0,
      });
    }
    const e = m.get(k);
    if (c.moneda === 'USD') e.usd += c.pendiente; else e.rd += c.pendiente;
    if (c.tipo === 'mensualidad') e.meses.push(mesDe(c.periodo).split(' ')[0].slice(0, 3));
  });
  return [...m.values()].map((e) => ({ ...e, rd: r2(e.rd), usd: r2(e.usd), n_meses: e.meses.length, meses_txt: e.meses.join(', ') }));
}

function tablaPorGrado(deuda, todo) {
  // El nombre del curso desempata: dos secciones con el mismo orden no se mezclan.
  const ests = porEstudiante(deuda).sort((a, b) => a.curso_orden.localeCompare(b.curso_orden) || a.curso.localeCompare(b.curso) || a.estudiante.localeCompare(b.estudiante));
  const filas = [];
  let curso = null; let sub = null;
  const cerrar = () => { if (sub) filas.push({ estudiante: `Total ${curso} (${sub.n})`, rd: r2(sub.rd), usd: r2(sub.usd) || '', _sub: true }); };
  ests.forEach((e) => {
    if (e.curso !== curso) { cerrar(); curso = e.curso; sub = { n: 0, rd: 0, usd: 0 }; filas.push({ _grupo: curso }); }
    sub.n += 1; sub.rd += e.rd; sub.usd += e.usd;
    filas.push({ ...e, estudiante: `${e.estudiante}${e.estado !== 'activo' ? ` (${ESTADO_ESTUDIANTE[e.estado] || e.estado})` : ''}`, usd: e.usd || '' });
  });
  cerrar();
  const tot = ests.reduce((s, e) => ({ rd: s.rd + e.rd, usd: s.usd + e.usd }), { rd: 0, usd: 0 });
  return {
    titulo: 'Deudores por grado', subtitulo: `${todo ? 'Todo lo pendiente' : 'Lo vencido'} al ${fechaDO(hoyRD())}`, horizontal: true,
    columnas: [
      { t: 'Estudiante', k: 'estudiante' }, { t: 'Mat.', k: 'matricula' }, { t: 'Tanda', k: 'tanda' },
      { t: 'Meses que debe', k: 'meses_txt' }, { t: 'Tutor', k: 'tutor' }, { t: 'Teléfono', k: 'telefono' },
      { t: 'Debe RD$', k: 'rd', m: true }, { t: 'US$', k: 'usd', m: true },
    ],
    filas,
    total: { estudiante: `TOTAL (${ests.length} estudiantes)`, rd: r2(tot.rd), usd: r2(tot.usd) || '' },
    nota: 'Los hermanos salen cada uno en su curso; el estado de cuenta de la familia los junta en una hoja.',
  };
}

function tablaPorMes(deuda, todo) {
  // Mensualidad, sala de tareas y recargo por mes; lo anual aparte.
  const m = new Map();
  deuda.forEach((c) => {
    const k = c.periodo ? String(c.periodo).slice(0, 7) : '9999-99';
    if (!m.has(k)) m.set(k, { k, nombre: c.periodo ? mesDe(c.periodo) : 'Conceptos del año (inscripción, reservación, utilería, Sistema Bilingüe, otros)', ests: new Set(), mens: 0, sala: 0, rec: 0, otros: 0, usd: 0, lista: new Map() });
    const g = m.get(k);
    g.ests.add(c.estudiante_id);
    if (c.moneda === 'USD') g.usd += c.pendiente;
    else if (c.tipo === 'mensualidad') g.mens += c.pendiente;
    else if (c.tipo === 'sala_tareas') g.sala += c.pendiente;
    else if (c.tipo === 'recargo') g.rec += c.pendiente;
    else g.otros += c.pendiente;
    const e = g.lista.get(c.estudiante_id) || { estudiante: c.estudiante, curso: c.curso, tutor: c.tutor || '', telefono: c.telefono || '', rd: 0, usd: 0, _familia_id: c.familia_id };
    if (c.moneda === 'USD') e.usd += c.pendiente; else e.rd += c.pendiente;
    g.lista.set(c.estudiante_id, e);
  });
  const grupos = [...m.values()].sort((a, b) => a.k.localeCompare(b.k));
  const filas = [];
  grupos.forEach((g) => {
    filas.push({ _grupo: `${g.nombre} · ${g.ests.size} estudiante${g.ests.size === 1 ? '' : 's'}` });
    [...g.lista.values()].sort((a, b) => a.curso.localeCompare(b.curso) || a.estudiante.localeCompare(b.estudiante))
      .forEach((e) => filas.push({ ...e, rd: r2(e.rd), usd: r2(e.usd) || '' }));
    const rd = g.mens + g.sala + g.rec + g.otros;
    filas.push({ estudiante: `Total ${g.nombre.split(' (')[0]}`, curso: [g.mens && `Mens. ${n2(g.mens)}`, g.sala && `Sala ${n2(g.sala)}`, g.rec && `Recargos ${n2(g.rec)}`].filter(Boolean).join(' · '), rd: r2(rd), usd: r2(g.usd) || '', _sub: true });
  });
  const tot = deuda.reduce((s, c) => (c.moneda === 'USD' ? { ...s, usd: s.usd + c.pendiente } : { ...s, rd: s.rd + c.pendiente }), { rd: 0, usd: 0 });
  return {
    titulo: 'Deudores por mes', subtitulo: `${todo ? 'Todo lo pendiente' : 'Lo vencido'} al ${fechaDO(hoyRD())}`,
    columnas: [
      { t: 'Estudiante', k: 'estudiante' }, { t: 'Curso', k: 'curso' }, { t: 'Tutor', k: 'tutor' }, { t: 'Teléfono', k: 'telefono' },
      { t: 'Debe RD$', k: 'rd', m: true }, { t: 'US$', k: 'usd', m: true },
    ],
    filas,
    total: { estudiante: 'TOTAL', rd: r2(tot.rd), usd: r2(tot.usd) || '' },
  };
}

function tablaAntiguedad(pendientes) {
  const hoy = hoyRD();
  const m = new Map();
  pendientes.forEach((c0) => {
    if (c0.moneda === 'USD') return;   // el Sistema Bilingüe en US$ va en los otros reportes
    const c = { ...c0, pendiente: Number(c0.pendiente) };
    const tramo = tramoAntiguedad(diasAtraso(c.desde, hoy));
    const e = m.get(c.estudiante_id) || {
      estudiante: `${c.estudiante}${c.estado !== 'activo' ? ` (${ESTADO_ESTUDIANTE[c.estado] || c.estado})` : ''}`, curso: c.curso, curso_orden: c.curso_orden, tutor: c.tutor || '', telefono: c.telefono || '',
      _familia_id: c.familia_id, por_vencer: 0, d30: 0, d60: 0, d60mas: 0,
    };
    e[tramo] += c.pendiente;
    m.set(c.estudiante_id, e);
  });
  const filas = [...m.values()]
    .map((e) => ({ ...e, vencido: r2(e.d30 + e.d60 + e.d60mas) }))
    .filter((e) => e.vencido > 0 || e.por_vencer > 0)
    .sort((a, b) => b.d60mas - a.d60mas || b.d60 - a.d60 || b.vencido - a.vencido)
    .map((e) => ({ ...e, por_vencer: r2(e.por_vencer) || '', d30: r2(e.d30) || '', d60: r2(e.d60) || '', d60mas: r2(e.d60mas) || '' }));
  const sum = (k) => r2(filas.reduce((s, e) => s + Number(e[k] || 0), 0));
  return {
    titulo: 'Antigüedad de saldos', subtitulo: `Al ${fechaDO(hoy)} · RD$`, horizontal: true,
    columnas: [
      { t: 'Estudiante', k: 'estudiante' }, { t: 'Curso', k: 'curso' }, { t: 'Tutor', k: 'tutor' }, { t: 'Teléfono', k: 'telefono' },
      { t: '1 a 30 días', k: 'd30', m: true }, { t: '31 a 60 días', k: 'd60', m: true }, { t: 'Más de 60', k: 'd60mas', m: true },
      { t: 'Total vencido', k: 'vencido', m: true }, { t: 'Por vencer', k: 'por_vencer', m: true },
    ],
    filas,
    total: { estudiante: `TOTAL (${filas.length})`, d30: sum('d30'), d60: sum('d60'), d60mas: sum('d60mas'), vencido: sum('vencido'), por_vencer: sum('por_vencer') },
    nota: 'Los días cuentan desde el día límite de pago de cada mes (o desde que se cargó el concepto). El Sistema Bilingüe en dólares no entra aquí.',
  };
}

function tablaCobrado(pagos, agrupar, rango) {
  const m = new Map();
  pagos.forEach((p) => {
    const k = agrupar === 'mes' ? String(p.fecha).slice(0, 7) : String(p.fecha).slice(0, 10);
    const g = m.get(k) || { k, recibos: 0, mens: 0, anuales: 0, bilingue: 0, otros: 0, total: 0 };
    g.recibos += 1; g.total += Number(p.total);
    (p.lineas || []).forEach((l) => {
      const v = Number(l.monto);
      if (l.tipo === 'mensualidad') g.mens += v;
      else if (ANUALES.includes(l.tipo)) g.anuales += v;
      else if (l.tipo === 'bilingue') g.bilingue += v;
      else g.otros += v;
    });
    m.set(k, g);
  });
  const filas = [...m.values()].sort((a, b) => a.k.localeCompare(b.k)).map((g) => ({
    periodo: agrupar === 'mes' ? mesDe(`${g.k}-01`) : fechaDO(g.k),
    recibos: g.recibos, mens: r2(g.mens), anuales: r2(g.anuales), otros: r2(g.otros), bilingue: r2(g.bilingue), total: r2(g.total),
  }));
  const sum = (k) => r2(filas.reduce((s, e) => s + Number(e[k] || 0), 0));
  return {
    titulo: agrupar === 'mes' ? 'Cobrado por mes' : 'Cobrado por día', subtitulo: rango,
    columnas: [
      { t: agrupar === 'mes' ? 'Mes' : 'Día', k: 'periodo' }, { t: 'Recibos', k: 'recibos' },
      { t: 'Mensualidades', k: 'mens', m: true }, { t: 'Inscripción / reserva / utilería', k: 'anuales', m: true },
      { t: 'Sala, recargos y otros', k: 'otros', m: true }, { t: 'Sistema Bilingüe (terceros)', k: 'bilingue', m: true },
      { t: 'Total RD$', k: 'total', m: true },
    ],
    filas,
    total: { periodo: 'TOTAL', recibos: sum('recibos'), mens: sum('mens'), anuales: sum('anuales'), otros: sum('otros'), bilingue: sum('bilingue'), total: sum('total') },
    nota: 'Sin los recibos anulados. El Sistema Bilingüe se cobra por cuenta de la compañía: cuando se le pague, va en Gastos Diarios como pago a terceros.',
  };
}

function tablaRecibos(pagos, rango) {
  const filas = pagos.map((p) => ({
    numero: numeroRecibo(p.numero), fecha: `${fechaDO(p.fecha)} ${horaDO(p.created_at)}`,
    familia: `${p.tutor || ''}${p.tutor ? ' · ' : ''}Fam. ${p.familia}`, estudiantes: p.estudiantes || '',
    conceptos: [...new Set((p.lineas || []).map((l) => l.descripcion))].join(', '),
    total: Number(p.total), estado: p.anulado ? `Anulado${p.motivo_anulacion ? `: ${p.motivo_anulacion}` : ''}` : 'Vigente',
    usuario: p.usuario || '', ri: p.recibo_ingreso || '', ncf: p.ncf || '', _anulado: p.anulado,
  }));
  const vig = pagos.filter((p) => !p.anulado);
  return {
    titulo: 'Listado de recibos', subtitulo: rango, horizontal: true,
    columnas: [
      { t: 'Recibo', k: 'numero' }, { t: 'Fecha', k: 'fecha' }, { t: 'Tutor / familia', k: 'familia' }, { t: 'Estudiante(s)', k: 'estudiantes' },
      { t: 'Conceptos', k: 'conceptos' }, { t: 'Total RD$', k: 'total', m: true }, { t: 'Estado', k: 'estado' },
      { t: 'Cajero', k: 'usuario' }, { t: 'Ref. caja', k: 'ri' }, { t: 'NCF', k: 'ncf' },
    ],
    filas,
    total: { numero: `${vig.length} vigentes`, fecha: `${pagos.length - vig.length} anulados`, total: r2(vig.reduce((s, p) => s + Number(p.total), 0)), estado: 'Total vigente' },
  };
}

function tablaArqueo(pagos, rango) {
  const m = new Map();
  const vig = pagos.filter((p) => !p.anulado);
  vig.forEach((p) => {
    (p.formas_pago || []).filter((f) => Number(f.monto) > 0).forEach((f) => {
      const cuenta = f.cuenta_id ? [f.banco, f.alias].filter(Boolean).join(' ') || 'Cuenta bancaria' : '';
      const k = `${f.forma}|${cuenta}`;
      const g = m.get(k) || { forma: f.forma, cuenta, n: 0, monto: 0, efectivo: esEfectivo(f.forma) };
      g.n += 1; g.monto += Number(f.monto);
      m.set(k, g);
    });
  });
  const grupos = [...m.values()].sort((a, b) => (b.efectivo - a.efectivo) || a.forma.localeCompare(b.forma));
  const efectivo = grupos.filter((g) => g.efectivo).reduce((s, g) => s + g.monto, 0);
  const filas = grupos.map((g) => ({ forma: g.forma, cuenta: g.cuenta, n: g.n, monto: r2(g.monto) }));
  filas.push({ forma: 'Efectivo que debe haber en caja', cuenta: '(efectivo + efectivo en dólares, en pesos)', monto: r2(efectivo), _sub: true });
  const anul = pagos.filter((p) => p.anulado);
  if (anul.length) filas.push({ forma: 'Recibos anulados (no cuentan)', cuenta: anul.map((p) => numeroRecibo(p.numero)).join(', '), n: anul.length, monto: r2(anul.reduce((s, p) => s + Number(p.total), 0)), _anulado: true });
  return {
    titulo: 'Arqueo por forma de pago', subtitulo: rango,
    columnas: [{ t: 'Forma de pago', k: 'forma' }, { t: 'Cuenta / detalle', k: 'cuenta' }, { t: 'Cobros', k: 'n' }, { t: 'Monto RD$', k: 'monto', m: true }],
    filas,
    total: { forma: `TOTAL COBRADO (${vig.length} recibos)`, monto: r2(vig.reduce((s, p) => s + Number(p.total), 0)) },
    nota: 'El arqueo con el conteo de billetes y el cierre se hace en Cierre de Caja: los cobros del colegio ya están ahí como recibos de ingreso.',
  };
}

const ESTADO_RESERVA = { pagada: 'Reservado y pagado', pendiente: 'Cargada sin pagar', sin_reservar: 'Sin reservar', gradua: 'Se gradúa' };
function tablaPorConfirmar(lista) {
  const filas = [];
  let curso = null;
  lista.forEach((x) => {
    if (x.curso !== curso) { curso = x.curso; filas.push({ _grupo: curso }); }
    filas.push({
      estudiante: x.estudiante, matricula: x.matricula, tutor: x.tutor || '', telefono: x.telefono || '',
      tarifa: Number(x.tarifa), debe: Number(x.debe), _familia_id: x.familia_id,
    });
  });
  return {
    titulo: 'Por confirmar que siguen', subtitulo: `Al ${fechaDO(hoyRD())} · ${lista.length} estudiante${lista.length === 1 ? '' : 's'}`,
    columnas: [
      { t: 'Estudiante', k: 'estudiante' }, { t: 'Mat.', k: 'matricula' }, { t: 'Tutor', k: 'tutor' }, { t: 'Teléfono', k: 'telefono' },
      { t: 'Mensualidad', k: 'tarifa', m: true }, { t: 'Debe RD$', k: 'debe', m: true },
    ],
    filas,
    total: null,
    nota: 'Subieron de curso en el cambio de año, pero la familia no ha confirmado que siguen: no están en las aulas ni se les cargan mensualidades. Llamar a la familia: sigue cuando paga la reservación en la Caja del Colegio (botón "Reservar cupo" y se cobra); si se fue, "No sigue". El curso que sale es el que les toca este año.',
  };
}

function tablaReservas(reservas, filtro) {
  const todas = reservas?.filas || [];
  const lista = todas.filter((x) => filtro === 'todos' || x.reserva === filtro);
  // Proyección por el curso que tendrán el año próximo.
  const proy = new Map();
  todas.filter((x) => x.reserva !== 'gradua').forEach((x) => {
    const g = proy.get(x.curso_siguiente) || { orden: x.curso_siguiente_orden, pagada: 0, pendiente: 0, sin_reservar: 0 };
    g[x.reserva] += 1;
    proy.set(x.curso_siguiente, g);
  });
  const filas = [{ _grupo: `Proyección ${reservas?.anio_siguiente || ''} por curso` }];
  [...proy.entries()].sort((a, b) => a[1].orden.localeCompare(b[1].orden)).forEach(([curso, g]) => {
    filas.push({ estudiante: curso, curso: `Pagaron ${g.pagada} · sin pagar ${g.pendiente} · sin reservar ${g.sin_reservar}`, reserva: `${g.pagada} de ${g.pagada + g.pendiente + g.sin_reservar} pagaron`, _sub: true });
  });
  filas.push({ _grupo: `Estudiantes (${lista.length})` });
  lista.forEach((x) => filas.push({
    estudiante: x.estudiante, curso: `${x.curso} → ${x.curso_siguiente}`, reserva: ESTADO_RESERVA[x.reserva] || x.reserva,
    tutor: x.tutor || '', telefono: x.telefono || '', tarifa: Number(x.tarifa), _familia_id: x.familia_id,
  }));
  return {
    titulo: `Reservas ${reservas?.anio_siguiente || 'año próximo'}`, subtitulo: `Al ${fechaDO(hoyRD())}`,
    columnas: [
      { t: 'Estudiante / curso', k: 'estudiante' }, { t: 'Curso ahora → próximo', k: 'curso' }, { t: 'Reserva', k: 'reserva' },
      { t: 'Tutor', k: 'tutor' }, { t: 'Teléfono', k: 'telefono' }, { t: 'Mensualidad', k: 'tarifa', m: true },
    ],
    filas,
    total: null,
    nota: 'La reservación se cobra en la Caja del Colegio con el botón "Reservar cupo". Al cambiar de año, al que ya pagó no se le vuelve a cobrar.',
  };
}
