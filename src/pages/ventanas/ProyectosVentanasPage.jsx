// =====================================================================
// Ventanas y aluminio · Proyectos (09/11/2026)
// ---------------------------------------------------------------------
// Cada trabajo de un cliente es un proyecto: se crea, se mide en la obra
// (ventanas con sistema, hojas, ancho y alto en pulgadas) y avanza por
// estados: sin medir → medido → cotizado → aprobado → en fabricación →
// instalado → cobrado. Tres vistas: Todas (lista con filtros), Tablero (una
// columna por estado) y Calendario (citas de medir/instalar).
// El desglose, las barras y el presupuesto vienen en las partes siguientes.
// SQL: sql/ventanas_base.sql
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { FolderKanban, Plus, Search, Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import ProyectoVentanaModal from '@/components/ventanas/ProyectoVentanaModal';
import NuevoProyectoModal from '@/components/ventanas/NuevoProyectoModal';
import { ESTADOS_PROYECTO, estadoProyecto, numeroProyecto } from '@/lib/ventanas';

const campo = 'h-9 rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const sinTilde = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });

export default function ProyectosVentanasPage() {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [vista, setVista] = useState('todas');          // todas | tablero | calendario
  const [cargando, setCargando] = useState(true);
  const [proyectos, setProyectos] = useState([]);
  const [conteoMedidas, setConteoMedidas] = useState(new Map());
  const [buscar, setBuscar] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState(null);         // id del proyecto abierto
  const [mes, setMes] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  const error = useCallback((t, d) => toast({ title: t, description: d ? String(d) : undefined, variant: 'destructive' }), [toast]);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    try {
      // Empresa de aluminio sin sistemas todavía (creada antes de este módulo): se cargan solos.
      const { count } = await supabase.from('vent_sistemas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
      if (!count) await supabase.rpc('vent_preparar_empresa');
      const [pr, me] = await Promise.all([
        supabase.from('vent_proyectos').select('*, clientes(nombre, telefono)').eq('tenant_id', tenantId).order('numero', { ascending: false }),
        supabase.from('vent_medidas').select('proyecto_id, cantidad').eq('tenant_id', tenantId),
      ]);
      if (pr.error) throw pr.error;
      setProyectos(pr.data || []);
      const c = new Map();
      for (const m of me.data || []) c.set(m.proyecto_id, (c.get(m.proyecto_id) || 0) + Number(m.cantidad || 0));
      setConteoMedidas(c);
    } catch (e) {
      error('No se pudieron cargar los proyectos', e?.message);
    } finally {
      setCargando(false);
    }
  }, [tenantId, error]);
  useEffect(() => { cargar(); }, [cargar]);

  const clienteDe = (p) => p.clientes?.nombre || p.cliente_nombre || 'Cliente por defecto';

  const filtrados = useMemo(() => {
    const q = sinTilde(buscar).trim();
    return proyectos.filter((p) => (!fEstado || p.estado === fEstado)
      && (!q || sinTilde(`${p.nombre} ${clienteDe(p)} ${numeroProyecto(p.numero)} ${p.direccion || ''}`).includes(q)));
  }, [proyectos, buscar, fEstado]);

  const porEstado = useMemo(() => {
    const m = new Map(ESTADOS_PROYECTO.map((e) => [e.k, 0]));
    for (const p of proyectos) m.set(p.estado, (m.get(p.estado) || 0) + 1);
    return m;
  }, [proyectos]);
  const activos = proyectos.filter((p) => !['cobrado', 'cancelado'].includes(p.estado)).length;

  const cambiarEstado = async (p, estado) => {
    const { data, error: e } = await supabase.from('vent_proyectos').update({ estado }).eq('id', p.id).eq('tenant_id', tenantId).select('id');
    if (e || !data?.length) return error('No se pudo cambiar el estado', e?.message || 'Sin permiso');
    setProyectos((ps) => ps.map((x) => (x.id === p.id ? { ...x, estado } : x)));
    return undefined;
  };

  const Tarjeta = ({ p, compacta }) => {
    const est = estadoProyecto(p.estado);
    return (
      <button type="button" onClick={() => setAbierto(p.id)}
        className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-300 hover:shadow-sm transition">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 truncate">{p.nombre}</div>
            <div className="text-xs text-gray-500">{numeroProyecto(p.numero)} · {clienteDe(p)}</div>
          </div>
          {!compacta && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${est.c}`}>{est.t}</span>}
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-500">
          <span>{conteoMedidas.get(p.id) || 0} ventana(s)</span>
          {p.fecha_cita && <span>Cita: {new Date(`${p.fecha_cita}T12:00:00`).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })}{p.hora_cita ? ` ${p.hora_cita.slice(0, 5)}` : ''}</span>}
        </div>
      </button>
    );
  };

  // ── Calendario del mes ──
  const diasMes = useMemo(() => {
    const primero = new Date(mes.y, mes.m, 1);
    const inicio = (primero.getDay() + 6) % 7;                  // lunes primero
    const total = new Date(mes.y, mes.m + 1, 0).getDate();
    const celdas = Array.from({ length: inicio }, () => null);
    for (let d = 1; d <= total; d++) celdas.push(`${mes.y}-${String(mes.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    return celdas;
  }, [mes]);
  const citas = useMemo(() => {
    const m = new Map();
    for (const p of proyectos) if (p.fecha_cita) m.set(p.fecha_cita, [...(m.get(p.fecha_cita) || []), p]);
    return m;
  }, [proyectos]);
  const hoy = hoyISO();

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      <Helmet><title>Proyectos — Ventanas</title></Helmet>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <FolderKanban className="w-6 h-6 text-blue-700" />
          <div>
            <h1 className="text-xl font-black text-gray-900 uppercase">Proyectos</h1>
            <p className="text-xs text-gray-500">{proyectos.length} proyectos · {activos} activos · {porEstado.get('cobrado') || 0} cobrados</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={cargar} disabled={cargando}><RefreshCw className={`w-4 h-4 mr-1 ${cargando ? 'animate-spin' : ''}`} /> Actualizar</Button>
            <Button onClick={() => setNuevo(true)}><Plus className="w-4 h-4 mr-1" /> Nuevo proyecto</Button>
          </div>
        </div>

        <div className="flex gap-1 rounded-lg bg-white border border-gray-200 p-1 w-fit">
          {[['todas', 'Todas'], ['tablero', 'Tablero'], ['calendario', 'Calendario']].map(([k, t]) => (
            <button key={k} type="button" onClick={() => setVista(k)}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold ${vista === k ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{t}</button>
          ))}
        </div>

        {cargando ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : vista === 'todas' ? (
          <>
            <div className="rounded-lg bg-white border border-gray-200 p-3 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
                <input className={`${campo} w-full pl-8`} placeholder="Buscar por proyecto, cliente, número o dirección…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setFEstado('')}
                  className={`text-xs font-semibold px-3 py-1 rounded-full border ${!fEstado ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-300'}`}>
                  Todas {proyectos.length}
                </button>
                {ESTADOS_PROYECTO.map((e) => (
                  <button key={e.k} type="button" onClick={() => setFEstado(fEstado === e.k ? '' : e.k)}
                    className={`text-xs font-semibold px-3 py-1 rounded-full border ${fEstado === e.k ? 'bg-blue-700 text-white border-blue-700' : e.c}`}>
                    {e.t} {porEstado.get(e.k) || 0}
                  </button>
                ))}
              </div>
            </div>
            {filtrados.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filtrados.map((p) => <Tarjeta key={p.id} p={p} />)}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white py-14 text-center text-gray-500">
                {proyectos.length ? 'Ningún proyecto con esos filtros.' : 'Todavía no hay proyectos. Crea el primero para medir.'}
                {!proyectos.length && <div className="mt-3"><Button onClick={() => setNuevo(true)}><Plus className="w-4 h-4 mr-1" /> Crear proyecto</Button></div>}
              </div>
            )}
          </>
        ) : vista === 'tablero' ? (
          <div className="flex gap-3 overflow-x-auto pb-3">
            {ESTADOS_PROYECTO.map((e) => {
              const lista = proyectos.filter((p) => p.estado === e.k);
              return (
                <div key={e.k} className="min-w-[250px] w-[250px] shrink-0 rounded-lg bg-gray-100 border border-gray-200 p-2">
                  <div className={`text-xs font-bold uppercase px-2 py-1 rounded-md border mb-2 ${e.c}`}>{e.t} · {lista.length}</div>
                  <div className="space-y-2">
                    {lista.map((p) => (
                      <div key={p.id} className="space-y-1">
                        <Tarjeta p={p} compacta />
                        <select className={`${campo} w-full h-7 text-xs`} value={p.estado} onChange={(ev) => cambiarEstado(p, ev.target.value)} title="Mover a otro estado">
                          {ESTADOS_PROYECTO.map((x) => <option key={x.k} value={x.k}>{x.t}</option>)}
                        </select>
                      </div>
                    ))}
                    {!lista.length && <div className="text-xs text-gray-400 text-center py-4">—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-3">
              <Button size="sm" variant="ghost" onClick={() => setMes(({ y, m }) => (m ? { y, m: m - 1 } : { y: y - 1, m: 11 }))}><ChevronLeft className="w-4 h-4" /></Button>
              <div className="font-bold text-gray-800">{MESES[mes.m]} {mes.y}</div>
              <Button size="sm" variant="ghost" onClick={() => setMes(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}><ChevronRight className="w-4 h-4" /></Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-[11px] font-bold text-gray-500 uppercase text-center mb-1">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {diasMes.map((d, i) => (
                <div key={d || `v${i}`} className={`min-h-[84px] rounded-md border p-1 ${d ? 'bg-white border-gray-200' : 'border-transparent'} ${d === hoy ? 'ring-2 ring-blue-400' : ''}`}>
                  {d && <div className="text-[11px] text-gray-500 font-semibold">{Number(d.slice(8))}</div>}
                  {(citas.get(d) || []).map((p) => (
                    <button key={p.id} type="button" onClick={() => setAbierto(p.id)}
                      className={`mt-0.5 w-full truncate text-left text-[11px] px-1 rounded border ${estadoProyecto(p.estado).c}`}>
                      {p.hora_cita ? `${p.hora_cita.slice(0, 5)} ` : ''}{p.nombre}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">Pon la fecha de la cita (medir o instalar) dentro de cada proyecto.</p>
          </div>
        )}
      </div>

      {nuevo && (
        <NuevoProyectoModal tenantId={tenantId} siguiente={(proyectos[0]?.numero || 0) + 1} onClose={() => setNuevo(false)} onError={error}
          onCreado={(p) => { setNuevo(false); cargar(); setAbierto(p.id); }} />
      )}
      {abierto && (
        <ProyectoVentanaModal proyectoId={abierto} tenantId={tenantId} onClose={() => { setAbierto(null); cargar(); }} onError={error} />
      )}
    </div>
  );
}
