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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, X, Search, FilePlus, ShieldAlert } from 'lucide-react';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import { round2 } from '@/components/financiera/amortizacion';
import { formatFechaDMY } from '@/lib/dateUtils';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const hoy = () => new Date().toISOString().slice(0, 10);
const ROLES_ADMIN = ['admin', 'owner', 'manager', 'gerente'];

// Formatea el texto del Monto Acreditado con separador de miles y decimales
const fmtMontoInput = (raw) => {
  if (raw === '' || raw == null) return '';
  const [ip, dp] = String(raw).split('.');
  const intFmt = ip ? Number(ip).toLocaleString('en-US') : '0';
  return dp !== undefined ? `${intFmt}.${dp}` : intFmt;
};

const cleanLoanNumber = (value) => {
  const raw = String(value || '').trim();
  const duplicatedLegacy = raw.match(/^(PT-\d+)-2\d+$/i);
  return duplicatedLegacy ? duplicatedLegacy[1] : raw;
};

const NotaCreditoFinancieraPage = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { closePanel, activePanel } = usePanels();
  const { setSidebarOpen } = useLayout();
  const esAdmin = ROLES_ADMIN.includes(profile?.role);

  useEffect(() => { setSidebarOpen(false); }, [setSidebarOpen]);

  const [cliente, setCliente] = useState(null);
  const [codigoInput, setCodigoInput] = useState('');
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [estado, setEstado] = useState(null);
  const [numero, setNumero] = useState('—');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [prestamoFiltro, setPrestamoFiltro] = useState('todos');
  const [abonos, setAbonos] = useState({}); // { rowKey: monto acreditado }
  const [editKey, setEditKey] = useState(null);
  const [selKey, setSelKey] = useState(null);
  const [montoText, setMontoText] = useState('');
  const [comentarios, setComentarios] = useState('');

  const cargarProximoNumero = useCallback(async () => {
    try {
      const { data } = await supabase.from('prestamo_notas_credito').select('numero').order('created_at', { ascending: false }).limit(1);
      const last = data?.[0]?.numero ? parseInt(String(data[0].numero).replace(/\D/g, ''), 10) : 0;
      setNumero('NC-' + String((last || 0) + 1).padStart(7, '0'));
    } catch { setNumero('—'); }
  }, []);

  useEffect(() => { cargarProximoNumero(); }, [cargarProximoNumero]);

  const cargarEstado = useCallback(async (clienteId) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_prestamos_cliente', { p_cliente_id: clienteId });
      if (error) throw error;
      setEstado(data);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cargar el estado', description: e.message });
      setEstado(null);
    }
    setLoading(false);
  }, [toast]);

  const seleccionarCliente = useCallback((c) => {
    setCliente(c); setBuscarOpen(false);
    setCodigoInput(c.codigo || c.rnc || '');
    setAbonos({}); setEditKey(null); setMontoText(''); setComentarios(''); setPrestamoFiltro('todos');
    cargarEstado(c.id);
  }, [cargarEstado]);

  const buscarPorCodigo = async () => {
    const q = codigoInput.trim();
    if (!q) return;
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, codigo, rnc, direccion, telefono')
        .or(`codigo.eq.${q},rnc.eq.${q}`)
        .eq('activo', true)
        .limit(1);
      if (error) throw error;
      if (data && data.length) seleccionarCliente(data[0]);
      else toast({ variant: 'destructive', title: 'Cliente no encontrado', description: `No hay cliente con código/cédula ${q}.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error al buscar', description: e.message });
    }
  };

  const nuevo = () => {
    setCliente(null); setEstado(null); setCodigoInput('');
    setAbonos({}); setEditKey(null); setMontoText(''); setComentarios('');
    setPrestamoFiltro('todos'); cargarProximoNumero();
  };

  const cuotas = estado?.cuotas || [];
  const cargos = estado?.cargos || [];
  const prestamosUnicos = useMemo(
    () => [...new Map(cuotas.map((c) => [c.prestamo_id, cleanLoanNumber(c.prestamo_numero)])).entries()].map(([id, num]) => ({ id, num })),
    [cuotas]
  );
  const cuotasFiltradas = useMemo(
    () => (prestamoFiltro === 'todos' ? cuotas : cuotas.filter((c) => c.prestamo_id === prestamoFiltro)),
    [cuotas, prestamoFiltro]
  );
  const cargosFiltrados = useMemo(
    () => (prestamoFiltro === 'todos' ? cargos : cargos.filter((c) => c.prestamo_id === prestamoFiltro)),
    [cargos, prestamoFiltro]
  );

  const capitalPend = cuotasFiltradas.reduce((a, c) => a + Number(c.capital_pend || 0), 0);
  const interesPend = cuotasFiltradas.reduce((a, c) => a + Number(c.interes_pend || 0), 0);
  const moraPend = cuotasFiltradas.reduce((a, c) => a + Number(c.mora_pend || 0), 0);
  const cargosPend = cargosFiltrados.reduce((a, c) => a + Number(c.pendiente || 0), 0);
  const balanceAnterior = round2(capitalPend + interesPend + moraPend + cargosPend);

  // Filas: igual que el Recibo de Pago (MORA y cargos como lineas aparte)
  const filas = useMemo(() => {
    const out = [];
    cuotasFiltradas.forEach((c) => {
      if (Number(c.mora_pend) > 0) {
        out.push({
          key: `${c.cuota_id}-mora`, cuota_id: c.cuota_id, esMora: true, esCargo: false,
          fecha: hoy(), vence: c.fecha_vencimiento, origen: '>>MORA<<',
          referencia: c.referencia, descripcion: 'Cargos por Atrasos (MORA)',
          monto: round2(c.mora_pend), pendiente: round2(c.mora_pend),
          capital_pend: 0, interes_pend: 0, mora_pend: round2(c.mora_pend),
        });
      }
      out.push({
        key: `${c.cuota_id}-fin`, cuota_id: c.cuota_id, esMora: false, esCargo: false,
        fecha: c.fecha || '', vence: c.fecha_vencimiento, origen: cleanLoanNumber(c.prestamo_numero),
        referencia: c.referencia, descripcion: 'Financiamiento',
        monto: round2(c.monto_cuota), pendiente: round2(Number(c.capital_pend) + Number(c.interes_pend)),
        capital_pend: round2(c.capital_pend), interes_pend: round2(c.interes_pend), mora_pend: 0,
      });
    });
    cargosFiltrados.forEach((cg) => {
      out.push({
        key: `cargo-${cg.cargo_id}`, cargo_id: cg.cargo_id, esMora: false, esCargo: true,
        fecha: cg.fecha || '', vence: cg.fecha || '', origen: cg.numero,
        referencia: cg.concepto || '', descripcion: cg.tipo + (cg.descripcion ? ` · ${cg.descripcion}` : ''),
        monto: round2(cg.monto), pendiente: round2(cg.pendiente),
        capital_pend: 0, interes_pend: 0, mora_pend: 0,
      });
    });
    return out;
  }, [cuotasFiltradas, cargosFiltrados]);

  const montoNum = round2(filas.reduce((a, r) => a + (Number(abonos[r.key]) || 0), 0));
  const balanceActual = Math.max(round2(balanceAnterior - montoNum), 0);

  const sumaAbonos = (mapa) => round2(filas.reduce((a, f) => a + (Number(mapa[f.key]) || 0), 0));

  const setAbonoFila = (r, val) => {
    const n = Math.min(Math.max(round2(Number(val) || 0), 0), round2(r.pendiente));
    const next = { ...abonos, [r.key]: n };
    setAbonos(next);
    const s = sumaAbonos(next);
    setMontoText(s ? String(s) : '');
  };

  // Reparto del Monto Acreditado: mora e intereses primero (mas viejo
  // primero), el capital de ULTIMO — como la pantalla del sistema viejo.
  const distribuirTotal = (total) => {
    let rest = round2(Number(total) || 0);
    const next = {};
    // Pasada 1: mora + parte de intereses de cada linea de financiamiento
    filas.forEach((r) => {
      if (r.esCargo) return;
      const tope = r.esMora ? r.pendiente : r.interes_pend;
      const ab = Math.min(rest, tope);
      if (ab > 0) next[r.key] = round2(ab);
      rest = round2(rest - ab);
    });
    // Pasada 2: capital de las lineas de financiamiento
    filas.forEach((r) => {
      if (r.esCargo || r.esMora) return;
      const ya = Number(next[r.key]) || 0;
      const ab = Math.min(rest, round2(r.pendiente - ya));
      if (ab > 0) next[r.key] = round2(ya + ab);
      rest = round2(rest - ab);
    });
    // Pasada 3: cargos manuales
    filas.forEach((r) => {
      if (!r.esCargo) return;
      const ab = Math.min(rest, r.pendiente);
      if (ab > 0) next[r.key] = round2(ab);
      rest = round2(rest - ab);
    });
    setAbonos(next);
  };

  const handleGrabar = async () => {
    if (!cliente?.id) { toast({ variant: 'destructive', title: 'Selecciona un cliente' }); return; }
    if (!(montoNum > 0)) { toast({ variant: 'destructive', title: 'Marca el monto a acreditar de al menos una línea' }); return; }
    if (montoNum > balanceAnterior + 0.01) { toast({ variant: 'destructive', title: 'El monto excede el balance pendiente' }); return; }

    // Abonos exactos por cuota (interes antes que capital; mora en su fila)
    const map = {};
    const cargosAlloc = [];
    filas.forEach((r) => {
      const ab = Number(abonos[r.key]) || 0;
      if (ab <= 0) return;
      if (r.esCargo) { cargosAlloc.push({ cargo_id: r.cargo_id, monto: round2(ab) }); return; }
      if (!map[r.cuota_id]) map[r.cuota_id] = { cuota_id: r.cuota_id, capital: 0, interes: 0, mora: 0 };
      if (r.esMora) {
        map[r.cuota_id].mora = round2(map[r.cuota_id].mora + ab);
      } else {
        const i = Math.min(ab, r.interes_pend);
        map[r.cuota_id].interes = round2(map[r.cuota_id].interes + i);
        map[r.cuota_id].capital = round2(map[r.cuota_id].capital + (ab - i));
      }
    });
    const allocations = Object.values(map);

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('registrar_nota_credito_prestamo', {
        p_cliente_id: cliente.id,
        p_monto: montoNum,
        p_fecha: null,
        p_comentarios: comentarios || null,
        p_prestamo_id: prestamoFiltro === 'todos' ? null : prestamoFiltro,
        p_abonos: allocations,
        p_cargos: cargosAlloc,
      });
      if (error) throw error;
      toast({ title: 'Nota de crédito grabada', description: `${data?.numero} · Acreditado ${fmt(data?.monto)} · Balance actual ${fmt(data?.balance_actual)}` });
      setAbonos({}); setEditKey(null); setMontoText(''); setComentarios('');
      await cargarEstado(cliente.id);
      await cargarProximoNumero();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo grabar la nota de crédito', description: e.message });
    }
    setSaving(false);
  };

  if (!esAdmin) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center text-slate-500 gap-2">
        <ShieldAlert className="w-10 h-10 text-amber-500" />
        <p className="font-bold">Solo administradores o gerentes pueden emitir notas de crédito.</p>
      </div>
    );
  }

  return (
    <div className="p-1.5 bg-slate-100">
      <Helmet><title>Nota de Crédito — Financiera</title></Helmet>

      <div className="bg-white rounded-lg shadow border w-full overflow-hidden">
        {/* Título (amarillo como la pantalla vieja) */}
        <div className="bg-gradient-to-r from-yellow-300 to-yellow-200 text-red-700 text-center py-1 font-extrabold tracking-wide text-base">
          NOTA DE CRÉDITO
        </div>

        <div className="p-2 space-y-1">
          {/* Fila superior: cliente / préstamo / numero-fecha-monto */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 [&>*]:min-w-0">
            {/* Cliente */}
            <div className="border rounded-md p-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Cliente</span>
                <Input
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPorCodigo(); } }}
                  placeholder="Código o cédula"
                  className="flex-1 h-8 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setBuscarOpen(true)}>
                  <Search className="w-3.5 h-3.5 mr-1" />F3
                </Button>
              </div>
              <div className="mt-2 text-sm font-bold text-blue-700 leading-tight truncate" title={cliente?.nombre || ''}>{cliente?.nombre || '—'}</div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 truncate flex-1 min-w-0" title={cliente?.direccion || ''}>{cliente?.direccion || '—'}</span>
                <span className="text-emerald-600 whitespace-nowrap font-semibold">{cliente?.telefono || '—'}</span>
              </div>
            </div>

            {/* Préstamo */}
            <div className="border rounded-md p-2 space-y-2">
              <div className="flex items-center gap-2 min-w-0">
                <Label className="text-xs w-20 shrink-0">Préstamo</Label>
                <Select value={prestamoFiltro} onValueChange={setPrestamoFiltro}>
                  <SelectTrigger className="h-8 text-sm flex-1 min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos…</SelectItem>
                    {prestamosUnicos.map((p) => <SelectItem key={p.id} value={p.id}>{p.num}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                La nota de crédito <b>descuenta deuda sin entrar dinero a caja</b>. Se aplica primero a mora e intereses y de último al capital.
              </p>
            </div>

            {/* Numero / Fecha / Monto Acreditado */}
            <div className="border rounded-md p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Número</span>
                  <span className="font-mono font-bold">{numero}</span>
                </div>
                <div className="flex items-baseline gap-2 justify-end">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Fecha</span>
                  <span className="font-bold">{formatFechaDMY(hoy())}</span>
                </div>
              </div>
              <div className="border-t pt-2 flex items-center gap-2 min-w-0">
                <Label className="text-[10px] font-bold text-slate-400 uppercase leading-none whitespace-nowrap shrink-0">Monto<br />Acreditado</Label>
                <Input
                  type="text" inputMode="decimal"
                  value={fmtMontoInput(montoText)}
                  onChange={(e) => {
                    let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
                    const parts = raw.split('.');
                    if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
                    const [ip, dp] = raw.split('.');
                    raw = dp !== undefined ? `${ip}.${dp.slice(0, 2)}` : ip;
                    setMontoText(raw);
                    distribuirTotal(raw);
                  }}
                  placeholder="0.00"
                  className="text-right font-bold text-lg h-9 flex-1 min-w-[96px] shrink-0"
                />
              </div>
            </div>
          </div>

          {/* Grid de líneas pendientes */}
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-y-auto h-[180px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 text-gray-700 font-bold border-b sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">Fecha</th>
                  <th className="text-left px-2 py-1">Vence</th>
                  <th className="text-left px-2 py-1">Origen</th>
                  <th className="text-left px-2 py-1">Referencia</th>
                  <th className="text-left px-2 py-1">Descripción</th>
                  <th className="text-right px-2 py-1">Monto</th>
                  <th className="text-right px-2 py-1">Pendiente</th>
                  <th className="text-right px-2 py-1 bg-yellow-50 w-28">Abono</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
                {!loading && !cliente && <tr><td colSpan={8} className="p-10 text-center italic text-slate-400">--- SELECCIONE UN CLIENTE PARA VER REGISTROS ---</td></tr>}
                {!loading && cliente && filas.length === 0 && <tr><td colSpan={8} className="p-10 text-center italic text-slate-400">Sin cuotas pendientes.</td></tr>}
                {filas.map((r, i) => {
                  const isSel = selKey === r.key;
                  return (
                  <tr key={r.key}
                      onClick={() => setSelKey(r.key)}
                      className={`select-none border-b last:border-0 cursor-pointer ${isSel ? 'bg-blue-500 text-white' : (i % 2 === 1 ? 'bg-[#e0fadd]' : 'bg-white')} ${r.esMora && !isSel ? 'text-red-600 font-semibold' : ''} ${r.esCargo && !isSel ? 'text-amber-700 font-semibold' : ''}`}>
                    <td className="px-2 py-1">{formatFechaDMY(r.fecha)}</td>
                    <td className="px-2 py-1">{formatFechaDMY(r.vence)}</td>
                    <td className={`px-2 py-1 ${isSel ? 'text-white' : (r.esMora ? '' : (r.esCargo ? 'font-bold' : 'font-bold text-blue-900'))}`}>{r.origen}</td>
                    <td className="px-2 py-1">{r.referencia}</td>
                    <td className="px-2 py-1">{r.descripcion}</td>
                    <td className="px-2 py-1 text-right">{fmt(r.monto)}</td>
                    <td className="px-2 py-1 text-right"
                        onDoubleClick={() => setAbonoFila(r, r.pendiente)}
                        title="Doble clic: acreditar todo el pendiente">{fmt(r.pendiente)}</td>
                    <td className="px-2 py-1 text-right"
                        onDoubleClick={() => setEditKey(r.key)}
                        title="Doble clic: editar monto acreditado">
                      {editKey === r.key ? (
                        <input
                          type="text" inputMode="decimal" autoFocus
                          defaultValue={(Number(abonos[r.key]) || 0) || ''}
                          onBlur={(e) => { setAbonoFila(r, e.target.value); setEditKey(null); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { setAbonoFila(r, e.target.value); setEditKey(null); }
                            if (e.key === 'Escape') setEditKey(null);
                          }}
                          className="w-full text-right border rounded px-1 py-0.5 text-xs font-bold text-emerald-700 box-border"
                        />
                      ) : (
                        <span className={`font-bold ${isSel ? 'text-white' : 'text-emerald-700'}`}>{fmt(Number(abonos[r.key]) || 0)}</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* Otras Informaciones · Comentarios · Balances */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 [&>*]:min-w-0 items-start">
            <div className="border rounded-md p-2 text-xs space-y-1 bg-slate-50">
              <div className="font-bold text-slate-500 mb-1">Otras Informaciones</div>
              <div className="flex justify-between"><span>Capital Pendiente</span><b>{fmt(capitalPend)}</b></div>
              <div className="flex justify-between"><span>Intereses Pendientes</span><b>{fmt(interesPend)}</b></div>
              <div className="flex justify-between"><span>Mora Pendiente</span><b className="text-red-600">{fmt(moraPend)}</b></div>
              {cargosPend > 0 && (
                <div className="flex justify-between"><span>Otros Cargos</span><b className="text-amber-700">{fmt(cargosPend)}</b></div>
              )}
            </div>

            <div className="border rounded-md p-2 max-h-[110px] overflow-hidden">
              <Label className="text-xs font-bold">Comentarios (motivo del crédito)</Label>
              <Textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} className="mt-1 h-14 text-sm resize-none" placeholder="Ej. Descuento por acuerdo de pago…" />
            </div>

            <div className="border rounded-md p-2 text-sm space-y-1">
              <div className="flex justify-between text-slate-500"><span>Balance Anterior</span><b className="text-slate-700">{fmt(balanceAnterior)}</b></div>
              <div className="flex justify-between font-bold border-t pt-1 text-red-700"><span>Total Acreditado</span><span>{fmt(montoNum)}</span></div>
              <div className="flex justify-between text-blue-700 font-bold border-t pt-1"><span>Balance Actual</span><span>{fmt(balanceActual)}</span></div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end flex-wrap gap-2 border-t pt-2">
            <Button type="button" variant="outline" onClick={nuevo}><FilePlus className="w-4 h-4 mr-1" />Nuevo</Button>
            <Button type="button" variant="secondary" onClick={() => closePanel(activePanel)}><X className="w-4 h-4 mr-1" />Retornar</Button>
            <Button type="button" onClick={handleGrabar} disabled={saving || !cliente}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}F10 - Grabar
            </Button>
          </div>
        </div>
      </div>

      <ClienteSearchModal isOpen={buscarOpen} onClose={() => setBuscarOpen(false)} onSelectCliente={seleccionarCliente} />
    </div>
  );
};

export default NotaCreditoFinancieraPage;
