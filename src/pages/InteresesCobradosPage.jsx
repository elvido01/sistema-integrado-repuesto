// ============================================================
// Interés cobrado o acreditado — Financiera (12/11/2026)
// ------------------------------------------------------------
// El reporte del SiiF (Reportes → Intereses Cobrados): cada cobro del
// período con lo que fue a capital, a interés y a atraso (mora).
//   · Cobrado (RI): pagos de préstamos.  · Acreditado (NC): notas de crédito.
// Datos: RPC get_intereses_cobrados (sql/reporte_intereses_cobrados.sql).
// Los pagos viejos del SiiF salen desglosados cuando se corrió
// scripts/migracion-siif/desglose-pagos-siif.mjs; los que no, con su total y
// la marca "sin desglose".
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { useLayout } from '@/contexts/LayoutContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Printer, X, Search } from 'lucide-react';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import { generateInteresesCobradosPDF } from '@/components/common/pdf/interesesCobradosPDF';
import { formatFechaDMY } from '@/lib/dateUtils';

const PANEL_ID = 'intereses-cobrados';
const fmt = (v) => (v == null ? '—' : new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0));
const fdate = (d) => (d ? formatFechaDMY(String(d).slice(0, 10)) : '');
const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });

const InteresesCobradosPage = () => {
  const { toast } = useToast();
  const { empresa } = useAuth();
  const { closePanel, activePanel } = usePanels();
  const { setSidebarOpen } = useLayout();
  useEffect(() => { setSidebarOpen(false); }, [setSidebarOpen]);

  const [desde, setDesde] = useState(() => `${hoyRD().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoyRD);
  const [tipo, setTipo] = useState('cobrado');
  const [cliente, setCliente] = useState(null);
  const [codigoInput, setCodigoInput] = useState('');
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [consultado, setConsultado] = useState(false);

  // Cambiar un filtro borra lo consultado: si no, F5 imprimiría las filas
  // viejas con el título y las fechas nuevas.
  useEffect(() => { setRows([]); setConsultado(false); }, [desde, hasta, tipo, cliente]);

  const consultar = useCallback(async () => {
    // Un código escrito sin buscar (sin Enter) no es un cliente escogido.
    if (codigoInput.trim() && !cliente) {
      toast({ variant: 'destructive', title: 'Busca el cliente primero', description: 'Presiona Enter en el código, o F3, o deja el código vacío para todos.' });
      return;
    }
    if (!desde || !hasta || hasta < desde) {
      toast({ variant: 'destructive', title: 'Revisa las fechas', description: '"Hasta" no puede ser antes de "Desde".' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_intereses_cobrados', {
        p_desde: desde, p_hasta: hasta, p_cliente_id: cliente?.id || null, p_tipo: tipo,
      });
      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
      setConsultado(true);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo consultar', description: e.message });
      setRows([]);
    }
    setLoading(false);
  }, [desde, hasta, cliente, tipo, codigoInput, toast]);

  const totales = useMemo(() => rows.reduce((t, r) => ({
    capital: t.capital + (Number(r.capital) || 0),
    interes: t.interes + (Number(r.interes) || 0),
    atraso: t.atraso + (Number(r.atraso) || 0),
    cargos: t.cargos + (Number(r.cargos) || 0),
    total: t.total + (Number(r.total) || 0),
    sinDesglose: t.sinDesglose + (r.desglose === 'sin' ? 1 : 0),
  }), { capital: 0, interes: 0, atraso: 0, cargos: 0, total: 0, sinDesglose: 0 }), [rows]);
  const conCargos = totales.cargos > 0;

  const imprimir = useCallback(() => {
    if (!rows.length) { toast({ variant: 'destructive', title: 'No hay datos para imprimir' }); return; }
    generateInteresesCobradosPDF(rows, { desde, hasta, tipo, cliente: cliente?.nombre }, totales, empresa || {});
  }, [rows, desde, hasta, tipo, cliente, totales, empresa, toast]);

  const seleccionarCliente = (c) => {
    setCliente(c); setBuscarOpen(false);
    setCodigoInput(c.codigo || c.rnc || '');
  };

  const buscarPorCodigo = async () => {
    const q = codigoInput.trim();
    if (!q) { setCliente(null); return; }
    // Se piden 2: si el código o la cédula casa con más de un cliente, no se
    // escoge uno al azar, se manda a buscarlo con F3.
    const { data: cls, error } = await supabase
      .from('clientes').select('id, nombre, codigo, rnc').or(`codigo.eq.${q},rnc.eq.${q}`)
      .order('nombre').limit(2);
    if (error) { toast({ variant: 'destructive', title: 'Error al buscar', description: error.message }); return; }
    if (cls?.length === 1) seleccionarCliente(cls[0]);
    else if (cls?.length > 1) {
      toast({ title: 'Hay más de un cliente con ese código', description: 'Búscalo con F3 y escoge el correcto.' });
      setBuscarOpen(true);
    } else toast({ variant: 'destructive', title: 'Cliente no encontrado', description: `No hay cliente con código/cédula ${q}.` });
  };

  // Atajos como en el SiiF: F10 consultar, F5 imprimir, F3 buscar cliente.
  // Solo con ESTE panel al frente (los paneles escondidos siguen montados).
  useEffect(() => {
    const onKey = (e) => {
      if (activePanel !== PANEL_ID) return;
      if (e.key === 'F10') { e.preventDefault(); consultar(); }
      else if (e.key === 'F5') { e.preventDefault(); imprimir(); }
      else if (e.key === 'F3') { e.preventDefault(); setBuscarOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePanel, consultar, imprimir]);

  const cols = 8 + (conCargos ? 1 : 0);

  return (
    <div className="p-1.5 bg-slate-100">
      <Helmet><title>Interés Cobrado o Acreditado — Financiera</title></Helmet>
      <div className="bg-white rounded-lg shadow border w-full overflow-hidden">
        <div className="bg-gradient-to-r from-slate-300 to-slate-200 text-slate-800 text-center py-1 font-extrabold tracking-wide text-base">
          INTERÉS COBRADO O ACREDITADO
        </div>

        <div className="p-2 space-y-2">
          {/* Filtros */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 [&>*]:min-w-0">
            <div className="border rounded-md p-2 lg:col-span-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap w-24">Cliente</span>
                <Input
                  value={codigoInput}
                  onChange={(e) => { setCodigoInput(e.target.value); setCliente(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPorCodigo(); } }}
                  placeholder="Código o cédula (vacío = todos)" className="flex-1 h-8 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setBuscarOpen(true)}>
                  <Search className="w-3.5 h-3.5 mr-1" />F3
                </Button>
                {cliente && (
                  <Button type="button" variant="ghost" size="sm" title="Quitar el cliente (todos)"
                    onClick={() => { setCliente(null); setCodigoInput(''); }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <div className="text-sm font-bold text-blue-700 truncate pl-[6.5rem]" title={cliente?.nombre || ''}>
                {cliente?.nombre || 'Todos los clientes'}
              </div>
              <div className="flex items-center gap-4 text-xs pl-[6.5rem]">
                {[['cobrado', 'Cobrado (RI)'], ['acreditado', 'Acreditado (NC)']].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name="tipo-interes" checked={tipo === v} onChange={() => setTipo(v)} />{l}
                  </label>
                ))}
              </div>
            </div>
            <div className="border rounded-md p-2 space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs w-24">Fecha Desde</Label>
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-8 text-sm flex-1" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-24">Fecha Hasta</Label>
                <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-8 text-sm flex-1" />
              </div>
              <Button type="button" size="sm" className="w-full" onClick={consultar} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}Consultar (F10)
              </Button>
            </div>
          </div>

          {/* Tabla */}
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-auto h-[400px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 text-gray-700 font-bold border-b sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Fecha</th>
                    <th className="text-left px-2 py-1">Transacción</th>
                    <th className="text-left px-2 py-1">Cliente</th>
                    <th className="text-left px-2 py-1">Descripción</th>
                    <th className="text-right px-2 py-1">Capital</th>
                    <th className="text-right px-2 py-1">Interés</th>
                    <th className="text-right px-2 py-1">Atraso</th>
                    {conCargos && <th className="text-right px-2 py-1" title="Lo que el pago trajo para cargos manuales (Otras Transacciones)">Cargos</th>}
                    <th className="text-right px-2 py-1">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={cols} className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
                  {!loading && !consultado && <tr><td colSpan={cols} className="p-10 text-center italic text-slate-400">Escoge las fechas (y el cliente si quieres uno solo) y presiona <b>Consultar (F10)</b>.</td></tr>}
                  {!loading && consultado && rows.length === 0 && <tr><td colSpan={cols} className="p-10 text-center italic text-slate-400">Sin cobros en el período.</td></tr>}
                  {!loading && rows.map((r, i) => (
                    <tr key={`${r.transaccion}-${i}`} className={`border-b last:border-0 ${i % 2 === 1 ? 'bg-[#eef6ff]' : 'bg-white'}`}>
                      <td className="px-2 py-1 whitespace-nowrap">{fdate(r.fecha)}</td>
                      <td className="px-2 py-1 font-mono whitespace-nowrap">{r.transaccion}</td>
                      <td className="px-2 py-1 truncate max-w-[200px]" title={r.cliente}>{r.cliente}</td>
                      <td className="px-2 py-1 truncate max-w-[260px]" title={r.descripcion}>
                        {r.descripcion}
                        {r.desglose === 'sin' && <span className="ml-1 text-[10px] text-amber-700" title="Pago viejo del SiiF sin desglose: cuenta solo en el total">(sin desglose)</span>}
                      </td>
                      <td className="px-2 py-1 text-right">{fmt(r.capital)}</td>
                      <td className="px-2 py-1 text-right font-semibold text-emerald-800">{fmt(r.interes)}</td>
                      <td className="px-2 py-1 text-right">{fmt(r.atraso)}</td>
                      {conCargos && <td className="px-2 py-1 text-right">{Number(r.cargos) ? fmt(r.cargos) : ''}</td>}
                      <td className="px-2 py-1 text-right font-bold">{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot className="bg-gray-100 font-bold border-t sticky bottom-0">
                    <tr>
                      <td colSpan={4} className="px-2 py-1 text-right">TOTAL ({rows.length})</td>
                      <td className="px-2 py-1 text-right">{fmt(totales.capital)}</td>
                      <td className="px-2 py-1 text-right text-emerald-800">{fmt(totales.interes)}</td>
                      <td className="px-2 py-1 text-right">{fmt(totales.atraso)}</td>
                      {conCargos && <td className="px-2 py-1 text-right">{fmt(totales.cargos)}</td>}
                      <td className="px-2 py-1 text-right">{fmt(totales.total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Pie + acciones */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-t pt-2">
            <div className="text-xs text-slate-600">
              {totales.sinDesglose > 0 && (
                <span className="text-amber-700">
                  {totales.sinDesglose} cobro(s) viejos del SiiF sin desglose: cuentan solo en el total.
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={imprimir} disabled={!rows.length}><Printer className="w-4 h-4 mr-1" />Imprimir (F5)</Button>
              <Button type="button" variant="secondary" onClick={() => closePanel(activePanel)}><X className="w-4 h-4 mr-1" />Retornar</Button>
            </div>
          </div>
        </div>
      </div>
      <ClienteSearchModal isOpen={buscarOpen} onClose={() => setBuscarOpen(false)} onSelectCliente={seleccionarCliente} />
    </div>
  );
};

export default InteresesCobradosPage;
