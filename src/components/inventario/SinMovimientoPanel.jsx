// ============================================================
// Inventario Inteligente · Sin movimiento + listas para confirmar (23/11/2026)
// ------------------------------------------------------------
// Filtra la mercancía con existencia por días sin compra ni venta, se
// marca lo que se quiere revisar y se manda a un usuario de la empresa, que
// confirma existencia y ubicación en la app (Inicio → Por confirmar).
// Cuando vuelve, aquí se revisa y se aplica con inv_verif_aplicar: en UNA
// transacción del servidor graba la ENTRADA/SALIDA tipo AJUSTE (el mismo
// camino del Inventario Físico), corrige ubicaciones y cierra la lista; un
// segundo clic o un reintento no ajusta dos veces.
// Datos: sql/inventario_verificaciones.sql + _ajustes.sql.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Send, ClipboardCheck, Search, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { usePanels } from '@/contexts/PanelContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const RANGOS = [
  { k: '30-60', min: 30, max: 60, label: '30 a 60 días' },
  { k: '60-90', min: 60, max: 90, label: '60 a 90 días' },
  { k: '90-180', min: 90, max: 180, label: '90 a 180 días' },
  { k: '180+', min: 180, max: null, label: 'Más de 180 días' },
];
const money = (v) => Number(v || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => Number(v || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
const fecha = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' }) : '—');

const ESTADO = {
  pendiente: { t: 'En el celular', c: 'bg-amber-100 text-amber-800', i: Clock },
  enviada: { t: 'Confirmada · por aplicar', c: 'bg-blue-100 text-blue-800', i: ClipboardCheck },
  aplicada: { t: 'Aplicada', c: 'bg-emerald-100 text-emerald-800', i: CheckCircle2 },
  cancelada: { t: 'Cancelada', c: 'bg-gray-100 text-gray-600', i: XCircle },
};

export default function SinMovimientoPanel() {
  const { toast } = useToast();
  const [rango, setRango] = useState('60-90');
  const [busqueda, setBusqueda] = useState('');
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [enviarOpen, setEnviarOpen] = useState(false);
  const [listas, setListas] = useState([]);
  const [revisar, setRevisar] = useState(null);

  const r = RANGOS.find((x) => x.k === rango);
  const { activePanel } = usePanels();
  const activoRef = React.useRef(true);
  activoRef.current = activePanel === 'inventario-inteligente';
  // Al volver a esta pestaña, también se refresca.
  useEffect(() => { if (activePanel === 'inventario-inteligente') refrescar.current?.(); }, [activePanel]);

  // silencioso = refresco solo (al volver a la ventana / cada minuto): sin
  // spinner, sin aviso de error y sin borrar lo que ya está marcado.
  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true);
    const { data, error } = await supabase.rpc('get_inventario_sin_movimiento', { p_dias_min: r.min, p_dias_max: r.max, p_search: busqueda.trim() });
    if (!silencioso) setCargando(false);
    if (error) { if (!silencioso) toast({ variant: 'destructive', title: 'No se pudo cargar', description: error.message }); return; }
    setFilas(data || []);
    if (silencioso) {
      const libres = new Set((data || []).filter((x) => !x.en_verificacion).map((x) => x.id));
      setMarcadas((m) => new Set([...m].filter((id) => libres.has(id))));
    } else setMarcadas(new Set());
  }, [r.min, r.max, busqueda, toast]);

  // (25/11/2026) Las listas abiertas (en el celular o por aplicar) salen
  // TODAS; de las cerradas, las 15 más recientes. Antes eran 15 en total y
  // una lista vieja por aplicar podía quedar sin botón.
  const cargarListas = useCallback(async () => {
    const campos = 'id, titulo, estado, asignado_a, created_at, enviada_at, aplicada_at, inv_verificacion_items(resultado)';
    const [ab, ce] = await Promise.all([
      supabase.from('inv_verificaciones').select(campos).in('estado', ['pendiente', 'enviada']).order('created_at', { ascending: false }),
      supabase.from('inv_verificaciones').select(campos).in('estado', ['aplicada', 'cancelada']).order('created_at', { ascending: false }).limit(15),
    ]);
    if (ab.error || ce.error) return;   // se queda lo que había
    setListas([...(ab.data || []), ...(ce.data || [])]);
  }, []);

  useEffect(() => { cargar(); }, [rango]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargarListas(); }, [cargarListas]);

  // (25/11/2026) Lo que hacen en el teléfono se ve aquí sin recargar: al
  // volver a esta ventana y cada minuto mientras está a la vista.
  const refrescar = React.useRef(null);
  refrescar.current = () => { cargar({ silencioso: true }); cargarListas(); };
  useEffect(() => {
    // Las pestañas escondidas siguen montadas: solo refresca si esta es la que se ve.
    const siVisible = () => { if (document.visibilityState === 'visible' && activoRef.current) refrescar.current?.(); };
    const cada = setInterval(siVisible, 60000);
    window.addEventListener('focus', siVisible);
    document.addEventListener('visibilitychange', siVisible);
    return () => { clearInterval(cada); window.removeEventListener('focus', siVisible); document.removeEventListener('visibilitychange', siVisible); };
  }, []);

  // Totales del servidor: reales aunque la lista se corte en 2,000.
  const totales = useMemo(() => ({
    piezas: Number(filas[0]?.total_piezas ?? filas.length),
    valor: Number(filas[0]?.total_valor ?? filas.reduce((s, f) => s + Number(f.valor || 0), 0)),
  }), [filas]);
  const MAX = 500;
  const seleccionables = filas.filter((f) => !f.en_verificacion);
  const todas = marcadas.size > 0 && marcadas.size >= Math.min(MAX, seleccionables.length);

  const alternar = (id) => setMarcadas((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id);
    else if (s.size >= MAX) toast({ title: `Máximo ${MAX} piezas por lista` });
    else s.add(id);
    return s;
  });
  const alternarTodas = () => setMarcadas(marcadas.size > 0 ? new Set() : new Set(seleccionables.slice(0, MAX).map((f) => f.id)));

  return (
    <div className="bg-white border rounded-lg shadow-sm">
      <div className="px-4 py-3 border-b flex flex-wrap items-center gap-2">
        <h2 className="font-bold text-slate-800 mr-2">Sin movimiento</h2>
        {RANGOS.map((x) => (
          <button key={x.k} type="button" onClick={() => setRango(x.k)}
            className={`px-3 py-1 rounded-full text-xs font-bold border ${rango === x.k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
            {x.label}
          </button>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); cargar(); }} className="flex items-center gap-1 ml-auto">
          <div className="flex items-center border rounded-md px-2 h-8">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Código, descripción, ubicación"
              className="ml-1 text-sm outline-none w-56" />
          </div>
          <Button type="submit" variant="outline" size="sm" className="h-8">Buscar</Button>
        </form>
      </div>

      <div className="px-4 py-2 flex flex-wrap items-center gap-3 text-xs text-slate-600 border-b bg-slate-50">
        <span><b>{num(totales.piezas)}</b> piezas con existencia · <b>RD$ {money(totales.valor)}</b> parado</span>
        {totales.piezas > filas.length && <span className="text-amber-700 font-semibold">Se muestran las {num(filas.length)} de más valor: busca para ver otras</span>}
        <span className="text-slate-400">Movimiento = compra o venta (los ajustes no cuentan)</span>
        <Button size="sm" className="h-8 ml-auto" disabled={marcadas.size === 0} onClick={() => setEnviarOpen(true)}>
          <Send className="w-3.5 h-3.5 mr-1" />Enviar a confirmar{marcadas.size ? ` (${marcadas.size})` : ''}
        </Button>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {cargando ? (
          <div className="p-8 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Buscando…</div>
        ) : filas.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No hay mercancía con existencia en ese rango.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white shadow-sm">
              <tr className="text-left text-xs text-slate-500">
                <th className="px-3 py-2 w-8"><input type="checkbox" checked={todas} onChange={alternarTodas} title="Marcar todas (máx. 500)" /></th>
                <th className="py-2">Producto</th>
                <th className="py-2">Ubicación</th>
                <th className="py-2 text-right">Existencia</th>
                <th className="py-2 text-right">Último mov.</th>
                <th className="py-2 text-right">Días</th>
                <th className="py-2 pr-4 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={`border-t hover:bg-slate-50 ${marcadas.has(f.id) ? 'bg-blue-50/60' : ''}`}
                  onClick={() => !f.en_verificacion && alternar(f.id)}>
                  <td className="px-3 py-1.5">
                    <input type="checkbox" disabled={f.en_verificacion} checked={marcadas.has(f.id)} onChange={() => alternar(f.id)} onClick={(e) => e.stopPropagation()} />
                  </td>
                  <td className="py-1.5">
                    <div className="font-semibold text-slate-800">{f.codigo} · {f.descripcion}</div>
                    <div className="text-[11px] text-slate-500">
                      {f.marca || 'Sin marca'}
                      {/* (25/11/2026) En qué paso va: contar en el teléfono, o ya contada y falta aplicar aquí. */}
                      {f.en_verificacion && (f.verificacion_estado === 'enviada'
                        ? <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold" title="Ya la contaron en el teléfono. Abajo, en las listas, toca «Revisar y aplicar» para cerrarla.">contada · falta aplicar</span>
                        : f.verificacion_estado === 'pendiente'
                          ? <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold" title="Está en una lista que todavía no han contado en el teléfono.">en lista · por contar</span>
                          : <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">en una lista</span>)}
                    </div>
                  </td>
                  <td className="py-1.5 text-slate-700">{f.ubicacion || <span className="text-slate-400">—</span>}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{num(f.existencia)}</td>
                  <td className="py-1.5 text-right text-slate-600">{fecha(f.ultimo_movimiento)}</td>
                  <td className="py-1.5 text-right tabular-nums">{f.dias}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">RD$ {money(f.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Listas enviadas */}
      {listas.length > 0 && (
        <div className="border-t">
          <div className="px-4 pt-3 pb-1 text-xs font-black uppercase tracking-wide text-slate-500">Listas para confirmar</div>
          <div className="divide-y">
            {listas.map((l) => {
              const items = l.inv_verificacion_items || [];
              const hechas = items.filter((i) => i.resultado !== 'pendiente').length;
              const dif = items.filter((i) => ['diferencia', 'no_esta'].includes(i.resultado)).length;
              const e = ESTADO[l.estado] || ESTADO.pendiente;
              return (
                <div key={l.id} className="px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${e.c}`}><e.i className="w-3 h-3" />{e.t}</span>
                  <span className="font-semibold text-slate-800">{l.titulo}</span>
                  <span className="text-xs text-slate-500">{fecha(l.created_at)} · {hechas}/{items.length} contadas{dif ? ` · ${dif} con diferencia` : ''}</span>
                  <div className="ml-auto flex gap-2">
                    {['enviada', 'aplicada', 'pendiente'].includes(l.estado) && (
                      <Button size="sm" variant={l.estado === 'enviada' ? 'default' : 'outline'} className="h-7" onClick={() => setRevisar(l)}>
                        {l.estado === 'enviada' ? 'Revisar y aplicar' : 'Ver'}
                      </Button>
                    )}
                    {['pendiente', 'enviada'].includes(l.estado) && (
                      <Button size="sm" variant="ghost" className="h-7 text-slate-500" onClick={async () => {
                        if (!window.confirm('¿Cancelar esta lista? No se toca el inventario.')) return;
                        const { error } = await supabase.rpc('inv_verif_cancelar', { p_id: l.id });
                        if (error) toast({ variant: 'destructive', title: 'No se pudo', description: error.message });
                        cargarListas(); cargar();
                      }}>Cancelar</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EnviarDialog open={enviarOpen} onClose={() => setEnviarOpen(false)} ids={[...marcadas]} rango={r}
        onEnviada={() => { setEnviarOpen(false); cargar(); cargarListas(); }} />
      <RevisarDialog lista={revisar} onClose={() => setRevisar(null)} onAplicada={() => { setRevisar(null); cargar(); cargarListas(); }} />
    </div>
  );
}

function EnviarDialog({ open, onClose, ids, rango, onEnviada }) {
  const { toast } = useToast();
  const [usuarios, setUsuarios] = useState([]);
  const [asignado, setAsignado] = useState('');
  const [titulo, setTitulo] = useState('');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo(`Confirmar: sin movimiento ${rango.label}`); setNota(''); setAsignado('');
    supabase.rpc('get_usuarios_panel').then(({ data }) => setUsuarios((data || []).filter((u) => u.activo !== false)));
  }, [open, rango.label]);

  const enviar = async () => {
    if (!asignado) { toast({ variant: 'destructive', title: 'Escoge a quién se la mandas' }); return; }
    setEnviando(true);
    const { error } = await supabase.rpc('inv_verif_crear', { p_asignado: asignado, p_titulo: titulo, p_productos: ids, p_nota: nota || null });
    setEnviando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo enviar', description: error.message }); return; }
    const u = usuarios.find((x) => x.id === asignado);
    toast({ title: 'Lista enviada', description: `${ids.length} piezas a ${u?.display_name || 'el usuario'}. La ve en la app: Inicio → Por confirmar.` });
    onEnviada();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Enviar {ids.length} pieza{ids.length === 1 ? '' : 's'} a confirmar</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">¿A quién?</span>
            <select value={asignado} onChange={(e) => setAsignado(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2">
              <option value="">Escoge un usuario de la empresa…</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.display_name || u.email}{u.rol ? ` · ${u.rol}` : ''}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Nombre de la lista</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2" />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Nota (opcional)</span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: revisar el almacén de atrás" className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2" />
          </label>
          <p className="text-xs text-slate-500">Le llega a su campanita y la abre en la app. Lo que confirme vuelve aquí; el inventario no cambia hasta que tú lo apliques.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={enviar} disabled={enviando}>{enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1" />Enviar</>}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RevisarDialog({ lista, onClose, onAplicada }) {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(null);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    if (!lista) return;
    setCargando(true); setErrorCarga(null); setItems([]);
    supabase.from('inv_verificacion_items')
      .select('id, producto_id, codigo, descripcion, existencia_sistema, ubicacion_sistema, existencia_al_contar, existencia_contada, ubicacion_confirmada, resultado, nota')
      .eq('verificacion_id', lista.id).order('codigo')
      .then(({ data, error }) => {
        if (error) setErrorCarga(error.message); else setItems(data || []);
        setCargando(false);
      });
  }, [lista]);

  if (!lista) return null;
  const delta = (i) => (i.existencia_contada == null || i.existencia_al_contar == null ? 0 : Number(i.existencia_contada) - Number(i.existencia_al_contar));
  const ajustes = items.filter((i) => Math.abs(delta(i)) > 0.0001);
  const ubicaciones = items.filter((i) => i.resultado !== 'no_esta' && i.ubicacion_confirmada
    && String(i.ubicacion_confirmada).toUpperCase() !== String(i.ubicacion_sistema || '').toUpperCase());

  const aplicar = async () => {
    if (!window.confirm(`Se ajustará la existencia de ${ajustes.length} pieza(s) y la ubicación de ${ubicaciones.length}. ¿Aplicar?`)) return;
    setAplicando(true);
    try {
      // Todo en el servidor, en una transacción (inv_verif_aplicar).
      const { data, error } = await supabase.rpc('inv_verif_aplicar', { p_id: lista.id });
      if (error) throw error;
      toast({ title: 'Aplicado', description: `${(data?.suben || 0) + (data?.bajan || 0)} ajuste(s) de existencia y ${data?.ubicaciones || 0} ubicación(es) corregida(s).` });
      onAplicada();
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se aplicó', description: err.message, duration: 15000 });
    } finally {
      setAplicando(false);
    }
  };
  const icono = (res) => res === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
    : res === 'no_esta' ? <XCircle className="w-4 h-4 text-red-600" />
      : res === 'diferencia' ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <Clock className="w-4 h-4 text-slate-400" />;

  return (
    <Dialog open={!!lista} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader><DialogTitle>{lista.titulo}</DialogTitle></DialogHeader>
        {errorCarga ? (
          <div className="p-6 text-sm text-red-700">No se pudo cargar la lista: {errorCarga}. Cierra y vuelve a abrirla.</div>
        ) : cargando ? <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div> : (
          <>
            <div className="max-h-[55vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs text-slate-500">
                    <th className="py-1 w-6" /><th>Producto</th><th className="text-right">Sistema</th><th className="text-right">Contado</th>
                    <th className="text-right">Diferencia</th><th className="pl-4">Ubicación</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const d = delta(i);
                    const cambioUb = ubicaciones.includes(i);
                    return (
                      <tr key={i.id} className="border-t align-top">
                        <td className="py-1.5">{icono(i.resultado)}</td>
                        <td className="py-1.5">
                          <div className="font-semibold">{i.codigo} · {i.descripcion}</div>
                          {i.nota && <div className="text-[11px] text-slate-500">“{i.nota}”</div>}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{num(i.existencia_al_contar ?? i.existencia_sistema)}</td>
                        <td className="py-1.5 text-right tabular-nums font-semibold">{i.resultado === 'pendiente' ? '—' : i.resultado === 'no_esta' ? 'No está' : num(i.existencia_contada)}</td>
                        <td className={`py-1.5 text-right tabular-nums font-bold ${d > 0 ? 'text-emerald-700' : d < 0 ? 'text-red-700' : 'text-slate-400'}`}>
                          {Math.abs(d) > 0.0001 ? `${d > 0 ? '+' : ''}${num(d)}` : '—'}
                        </td>
                        <td className="py-1.5 pl-4">
                          {cambioUb
                            ? <span><span className="line-through text-slate-400">{i.ubicacion_sistema || '—'}</span> → <b className="text-blue-700">{i.ubicacion_confirmada}</b></span>
                            : <span className="text-slate-600">{i.ubicacion_confirmada || i.ubicacion_sistema || '—'}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {lista.estado === 'enviada' ? (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
                <span className="text-sm text-slate-600 mr-auto">
                  {ajustes.length} ajuste(s) de existencia · {ubicaciones.length} ubicación(es) a corregir. La diferencia se calcula contra lo que decía el sistema cuando se contó.
                </span>
                <Button variant="outline" onClick={onClose}>Cerrar</Button>
                <Button onClick={aplicar} disabled={aplicando || items.length === 0}>{aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aplicar ajustes'}</Button>
              </div>
            ) : (
              <div className="flex justify-end pt-2 border-t"><Button variant="outline" onClick={onClose}>Cerrar</Button></div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
