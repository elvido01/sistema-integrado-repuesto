// =====================================================================
// Configuración del Colegio (centros educativos, 06/11/2026)
// ---------------------------------------------------------------------
// Lo que el colegio fija al empezar cada año escolar:
//   · Tarifas: la mensualidad de cada estudiante depende de su antigüedad y
//     NUNCA sube para un continuante. Cada año se agrega la tarifa de nuevo
//     ingreso (la última + el incremento automático, editable). Las viejas
//     se desactivan, no se borran: quien la tiene la sigue pagando.
//   · Conceptos de cobro (Inscripción, Reservación de cupo, Utilería,
//     Sistema Bilingüe en US$, Sala de Tareas, Recargo) y otros propios.
//   · Cursos y tandas, año escolar (mes de inicio) y reglas de cobro.
// Las tablas y la preparación inicial: sql/centros_educativos_base.sql
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { GraduationCap, Loader2, Plus, Save, RefreshCw, CheckCircle2, Ban, Star, ArrowRightCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { fmtMontoInput, parseMontoInput } from '@/lib/numberFormat';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { mesesDelAnio, tarifaSugerida } from '@/lib/colegio';

const fmt = (v, moneda = 'DOP') =>
  `${moneda === 'USD' ? 'US$' : 'RD$'}${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const campo = 'h-9 w-full rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const NIVELES = { inicial: 'Inicial', primaria: 'Primaria', secundaria: 'Secundaria' };
const TANDAS = [['matutina', 'Matutina'], ['vespertina', 'Vespertina'], ['extendida', 'Extendida']];
const FRECUENCIAS = { anual: 'Una vez al año', mensual: 'Cada mes', eventual: 'Cuando aplique' };
const APLICA = { todos: 'Todos', nuevo: 'Solo nuevo ingreso', continuante: 'Solo continuantes' };
const PESTANAS = [
  ['tarifas', 'Tarifas'],
  ['conceptos', 'Conceptos de cobro'],
  ['cursos', 'Cursos y tandas'],
  ['anios', 'Año escolar'],
  ['reglas', 'Reglas de cobro'],
];

export default function ColegioConfigPage() {
  const { tenantId, profile } = useAuth();
  const { toast } = useToast();
  // La misma regla que la base para el cambio de año (dueño/admin de ESTE colegio, o superadmin).
  const [esDireccion, setEsDireccion] = useState(['admin', 'owner'].includes(profile?.role));
  useEffect(() => {
    if (!tenantId) return;
    supabase.rpc('edu_soy_direccion').then(({ data, error: e }) => { if (!e) setEsDireccion(!!data); });
  }, [tenantId]);
  const [pestana, setPestana] = useState('tarifas');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [anios, setAnios] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [conceptos, setConceptos] = useState([]);
  const [nuevaTarifa, setNuevaTarifa] = useState(null);   // { monto, nota } mientras se agrega

  const error = useCallback((titulo, e) => {
    toast({ title: titulo, description: e?.message || String(e || ''), variant: 'destructive' });
  }, [toast]);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    try {
      let { data: c, error: e1 } = await supabase.from('edu_config').select('*').eq('tenant_id', tenantId).maybeSingle();
      if (e1) throw e1;
      if (!c) {
        // Colegio recién creado o de antes de este módulo: se prepara solo.
        const { error: eP } = await supabase.rpc('edu_preparar_colegio');
        if (eP) throw eP;
        ({ data: c } = await supabase.from('edu_config').select('*').eq('tenant_id', tenantId).maybeSingle());
      }
      const [a, cu, t, co] = await Promise.all([
        supabase.from('edu_anios').select('*').eq('tenant_id', tenantId).order('anio_inicio', { ascending: false }),
        supabase.from('edu_cursos').select('*').eq('tenant_id', tenantId).order('orden').order('nombre'),
        supabase.from('edu_tarifas').select('*').eq('tenant_id', tenantId).order('monto', { ascending: false }),
        supabase.from('edu_conceptos').select('*').eq('tenant_id', tenantId).order('orden').order('nombre'),
      ]);
      for (const r of [a, cu, t, co]) if (r.error) throw r.error;
      setCfg(c);
      setAnios(a.data || []);
      setCursos(cu.data || []);
      setTarifas(t.data || []);
      setConceptos(co.data || []);
    } catch (e) {
      error('No se pudo cargar la configuración del colegio', e);
    } finally {
      setCargando(false);
    }
  }, [tenantId, error]);

  useEffect(() => { cargar(); }, [cargar]);

  const anioActual = useMemo(() => anios.find((a) => a.actual) || anios[0] || null, [anios]);

  // Guarda una fila y confirma que de verdad cambió (update sin .select() miente).
  const actualizar = async (tabla, id, cambios, okMsg) => {
    setGuardando(true);
    try {
      const { data, error: e } = await supabase.from(tabla).update(cambios).eq('id', id).eq('tenant_id', tenantId).select('id');
      if (e) throw e;
      if (!data?.length) throw new Error('No se guardó (sin permiso o la fila ya no existe).');
      if (okMsg) toast({ title: okMsg });
      await cargar();
    } catch (e) {
      error('No se pudo guardar', e);
    } finally {
      setGuardando(false);
    }
  };

  const insertar = async (tabla, fila, okMsg) => {
    setGuardando(true);
    try {
      const { error: e } = await supabase.from(tabla).insert({ ...fila, tenant_id: tenantId });
      if (e) throw e;
      if (okMsg) toast({ title: okMsg });
      await cargar();
      return true;
    } catch (e) {
      error('No se pudo guardar', e);
      return false;
    } finally {
      setGuardando(false);
    }
  };

  if (cargando && !cfg) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6">
      <Helmet><title>Configuración del Colegio</title></Helmet>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-blue-700" />
            <div>
              <h1 className="text-lg font-black text-gray-800 uppercase tracking-wide">Configuración del Colegio</h1>
              <p className="text-xs text-gray-500">
                Año escolar {anioActual?.nombre || '—'} · lo que se fija al inicio de cada año
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={cargar} disabled={cargando}>
            <RefreshCw className={`w-4 h-4 mr-1 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </div>

        <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-200">
          {PESTANAS.map(([id, t]) => (
            <button key={id} type="button" onClick={() => setPestana(id)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-md -mb-px border ${pestana === id
                ? 'bg-white border-gray-200 border-b-white text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 md:p-5">
          {pestana === 'tarifas' && (
            <Tarifas tarifas={tarifas} cfg={cfg} anioActual={anioActual} guardando={guardando}
              nuevaTarifa={nuevaTarifa} setNuevaTarifa={setNuevaTarifa}
              actualizar={actualizar} insertar={insertar} tenantId={tenantId} error={error} recargar={cargar} />
          )}
          {pestana === 'conceptos' && (
            <Conceptos conceptos={conceptos} guardando={guardando} actualizar={actualizar} insertar={insertar} />
          )}
          {pestana === 'cursos' && (
            <Cursos cursos={cursos} guardando={guardando} actualizar={actualizar} insertar={insertar} />
          )}
          {pestana === 'anios' && (
            <Anios anios={anios} guardando={guardando} insertar={insertar} tenantId={tenantId} error={error} recargar={cargar} esDireccion={esDireccion} toast={toast} />
          )}
          {pestana === 'reglas' && (
            <Reglas cfg={cfg} tenantId={tenantId} error={error} recargar={cargar} toast={toast} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tarifas ──────────────────────────────────────────────────────────────
function Tarifas({ tarifas, cfg, anioActual, guardando, nuevaTarifa, setNuevaTarifa, actualizar, insertar, tenantId, error, recargar }) {
  const activas = tarifas.filter((t) => t.activa);
  const ultima = activas.length ? Math.max(...activas.map((t) => Number(t.monto))) : 0;
  const incremento = Number(cfg?.incremento_tarifa || 0);
  const [inc, setInc] = useState(String(incremento));
  useEffect(() => { setInc(String(incremento)); }, [incremento]);

  const guardarIncremento = async () => {
    const v = Number(inc);
    if (!Number.isFinite(v) || v < 0) return error('Incremento no válido', 'Pon un monto de 0 en adelante.');
    const { data, error: e } = await supabase.from('edu_config')
      .update({ incremento_tarifa: v, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId).select('tenant_id');
    if (e || !data?.length) return error('No se guardó el incremento', e || 'Sin cambios');
    recargar();
  };

  const empezar = () => { const sug = tarifaSugerida(tarifas, incremento); setNuevaTarifa({ monto: sug ? String(sug) : '', nota: '' }); };

  const guardarNueva = async () => {
    const monto = Number(nuevaTarifa?.monto);
    if (!Number.isFinite(monto) || monto <= 0) return error('Monto no válido', 'Escribe la mensualidad de la tarifa.');
    if (tarifas.some((t) => Number(t.monto) === monto)) return error('Esa tarifa ya existe', fmt(monto));
    const ok = await insertar('edu_tarifas', {
      monto, nota: nuevaTarifa.nota?.trim() || null, anio_inicio: anioActual?.anio_inicio ?? null, activa: true,
    }, 'Tarifa agregada');
    if (ok) setNuevaTarifa(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        La mensualidad de cada estudiante se queda <b>fija</b> desde que entra: a un continuante nunca se le sube.
        El estudiante nuevo recibe la tarifa más reciente; un hermano, la del hermano que ya está.
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-md border border-blue-100 bg-blue-50/50 p-3">
        <label className="text-xs font-bold text-gray-600 uppercase">
          Incremento automático
          <div className="flex gap-2 mt-1">
            <input type="text" inputMode="decimal" className={`${campo} w-32`} value={fmtMontoInput(inc)} onChange={(e) => setInc(parseMontoInput(e.target.value))} />
            <Button size="sm" variant="outline" onClick={guardarIncremento} disabled={String(incremento) === inc}>
              <Save className="w-4 h-4" />
            </Button>
          </div>
        </label>
        <p className="text-xs text-gray-500 flex-1 min-w-[200px]">
          Se sugiere la más alta ({fmt(ultima)}) + {fmt(incremento)} para el nuevo ingreso, pero se puede escribir cualquier monto (por ejemplo, una tarifa vieja que falte en la lista).
        </p>
        {!nuevaTarifa && (
          <Button size="sm" onClick={empezar}><Plus className="w-4 h-4 mr-1" /> Agregar tarifa</Button>
        )}
      </div>

      {nuevaTarifa && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
          <label className="text-xs font-bold text-gray-600 uppercase">
            Mensualidad RD$
            <input type="text" inputMode="decimal" autoFocus className={`${campo} w-40 mt-1`} value={fmtMontoInput(nuevaTarifa.monto)}
              onChange={(e) => setNuevaTarifa((p) => ({ ...p, monto: parseMontoInput(e.target.value) }))} />
          </label>
          <label className="text-xs font-bold text-gray-600 uppercase flex-1 min-w-[200px]">
            Nota (opcional)
            <input className={`${campo} mt-1`} placeholder={`Nuevo ingreso ${anioActual?.nombre || ''}`} value={nuevaTarifa.nota}
              onChange={(e) => setNuevaTarifa((p) => ({ ...p, nota: e.target.value }))} />
          </label>
          <Button size="sm" onClick={guardarNueva} disabled={guardando}>Guardar</Button>
          <Button size="sm" variant="ghost" onClick={() => setNuevaTarifa(null)}>Cancelar</Button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-gray-500 border-b">
            <th className="py-2">Mensualidad</th><th>Año en que se creó</th><th>Nota</th><th>Estado</th><th />
          </tr>
        </thead>
        <tbody>
          {tarifas.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-gray-400">
              Todavía no hay tarifas. Agrega las que el colegio cobra hoy (por ejemplo 4,500 · 5,000 · 5,900 · 6,150).
            </td></tr>
          )}
          {tarifas.map((t) => (
            <tr key={t.id} className={`border-b last:border-0 ${t.activa ? '' : 'text-gray-400'}`}>
              <td className="py-2 font-mono font-bold">
                {fmt(t.monto)}
                {t.activa && Number(t.monto) === ultima && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
                    <Star className="w-3 h-3" /> nuevo ingreso
                  </span>
                )}
              </td>
              <td>{t.anio_inicio ? `${t.anio_inicio}-${t.anio_inicio + 1}` : '—'}</td>
              <td className="text-gray-500">{t.nota || ''}</td>
              <td>{t.activa ? 'Activa' : 'Desactivada'}</td>
              <td className="text-right">
                <Button size="sm" variant="ghost" disabled={guardando}
                  title={t.activa ? 'Ya no se ofrece a estudiantes nuevos; quien la tiene la sigue pagando' : 'Volver a ofrecerla'}
                  onClick={() => actualizar('edu_tarifas', t.id, { activa: !t.activa }, t.activa ? 'Tarifa desactivada' : 'Tarifa activada')}>
                  {t.activa ? <><Ban className="w-4 h-4 mr-1" /> Desactivar</> : <><CheckCircle2 className="w-4 h-4 mr-1" /> Activar</>}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-400">
        Para un acuerdo especial (por ejemplo 5,500) no hace falta crear tarifa: el monto se escribe a mano en la ficha del estudiante.
      </p>
    </div>
  );
}

// ── Conceptos de cobro ───────────────────────────────────────────────────
function Conceptos({ conceptos, guardando, actualizar, insertar }) {
  const [editando, setEditando] = useState({});   // id → cambios
  const [nuevo, setNuevo] = useState(null);

  const cambio = (id, k, v) => setEditando((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
  const valor = (c, k) => (editando[c.id]?.[k] ?? c[k]);

  const guardar = async (c) => {
    const cambios = { ...editando[c.id] };
    if ('monto' in cambios) cambios.monto = Number(cambios.monto) || 0;
    if ('nombre' in cambios && !String(cambios.nombre).trim()) return;
    await actualizar('edu_conceptos', c.id, cambios, 'Concepto guardado');
    setEditando((p) => { const n = { ...p }; delete n[c.id]; return n; });
  };

  const guardarNuevo = async () => {
    if (!nuevo?.nombre?.trim()) return;
    const ok = await insertar('edu_conceptos', {
      tipo: 'otro', nombre: nuevo.nombre.trim(), monto: Number(nuevo.monto) || 0, moneda: nuevo.moneda,
      frecuencia: nuevo.frecuencia, aplica_a: 'todos', obligatorio: false, orden: 50,
    }, 'Concepto agregado');
    if (ok) setNuevo(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Lo que el colegio cobra además de la mensualidad. La <b>mensualidad</b> sale de la tarifa de cada estudiante.
        El <b>Sistema Bilingüe</b> se cobra en dólares (si pagan en pesos, a la tasa del día) y no es ingreso del colegio: se le paga a la compañía.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 border-b">
              <th className="py-2">Concepto</th><th>Monto</th><th>Moneda</th><th>Frecuencia</th><th>A quién</th><th>Obligatorio</th><th>Activo</th><th />
            </tr>
          </thead>
          <tbody>
            {conceptos.map((c) => {
              const sucio = !!editando[c.id];
              const esMensualidad = c.tipo === 'mensualidad';
              return (
                <tr key={c.id} className={`border-b last:border-0 ${valor(c, 'activo') ? '' : 'text-gray-400'}`}>
                  <td className="py-1.5 pr-2">
                    <input className={campo} value={valor(c, 'nombre')} onChange={(e) => cambio(c.id, 'nombre', e.target.value)} />
                  </td>
                  <td className="pr-2 w-32">
                    {esMensualidad
                      ? <span className="text-xs text-gray-500">Según tarifa</span>
                      : <input type="text" inputMode="decimal" className={campo} value={fmtMontoInput(valor(c, 'monto'))} onChange={(e) => cambio(c.id, 'monto', parseMontoInput(e.target.value))} />}
                  </td>
                  <td className="pr-2 w-24">
                    <select className={campo} value={valor(c, 'moneda')} disabled={esMensualidad} onChange={(e) => cambio(c.id, 'moneda', e.target.value)}>
                      <option value="DOP">RD$</option><option value="USD">US$</option>
                    </select>
                  </td>
                  <td className="pr-2 w-40">
                    <select className={campo} value={valor(c, 'frecuencia')} disabled={esMensualidad} onChange={(e) => cambio(c.id, 'frecuencia', e.target.value)}>
                      {Object.entries(FRECUENCIAS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                    </select>
                  </td>
                  <td className="pr-2 w-44">
                    <select className={campo} value={valor(c, 'aplica_a')} onChange={(e) => cambio(c.id, 'aplica_a', e.target.value)}>
                      {Object.entries(APLICA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                    </select>
                  </td>
                  <td className="text-center">
                    <input type="checkbox" checked={!!valor(c, 'obligatorio')} onChange={(e) => cambio(c.id, 'obligatorio', e.target.checked)} />
                  </td>
                  <td className="text-center">
                    <input type="checkbox" checked={!!valor(c, 'activo')} disabled={esMensualidad} onChange={(e) => cambio(c.id, 'activo', e.target.checked)} />
                  </td>
                  <td className="text-right w-24">
                    {sucio && <Button size="sm" onClick={() => guardar(c)} disabled={guardando}><Save className="w-4 h-4" /></Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {nuevo ? (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
          <label className="text-xs font-bold text-gray-600 uppercase flex-1 min-w-[200px]">
            Concepto
            <input autoFocus className={`${campo} mt-1`} placeholder="Ej. Uniforme, Excursión, Graduación" value={nuevo.nombre}
              onChange={(e) => setNuevo((p) => ({ ...p, nombre: e.target.value }))} />
          </label>
          <label className="text-xs font-bold text-gray-600 uppercase">
            Monto
            <input type="text" inputMode="decimal" className={`${campo} w-32 mt-1`} value={fmtMontoInput(nuevo.monto)} onChange={(e) => setNuevo((p) => ({ ...p, monto: parseMontoInput(e.target.value) }))} />
          </label>
          <label className="text-xs font-bold text-gray-600 uppercase">
            Moneda
            <select className={`${campo} w-24 mt-1`} value={nuevo.moneda} onChange={(e) => setNuevo((p) => ({ ...p, moneda: e.target.value }))}>
              <option value="DOP">RD$</option><option value="USD">US$</option>
            </select>
          </label>
          <label className="text-xs font-bold text-gray-600 uppercase">
            Frecuencia
            <select className={`${campo} w-40 mt-1`} value={nuevo.frecuencia} onChange={(e) => setNuevo((p) => ({ ...p, frecuencia: e.target.value }))}>
              {Object.entries(FRECUENCIAS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
          <Button size="sm" onClick={guardarNuevo} disabled={guardando}>Guardar</Button>
          <Button size="sm" variant="ghost" onClick={() => setNuevo(null)}>Cancelar</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setNuevo({ nombre: '', monto: '', moneda: 'DOP', frecuencia: 'eventual' })}>
          <Plus className="w-4 h-4 mr-1" /> Agregar concepto
        </Button>
      )}
    </div>
  );
}

// ── Cursos y tandas ──────────────────────────────────────────────────────
function Cursos({ cursos, guardando, actualizar, insertar }) {
  const [nuevo, setNuevo] = useState(null);

  const alternarTanda = (c, t) => {
    const tandas = c.tandas.includes(t) ? c.tandas.filter((x) => x !== t) : [...c.tandas, t];
    if (!tandas.length) return;   // al menos una tanda
    actualizar('edu_cursos', c.id, { tandas });
  };

  const guardarNuevo = async () => {
    if (!nuevo?.nombre?.trim()) return;
    const orden = (cursos.reduce((m, c) => Math.max(m, c.orden || 0), 0)) + 1;
    const ok = await insertar('edu_cursos', { nombre: nuevo.nombre.trim(), nivel: nuevo.nivel, orden, tandas: ['matutina'] }, 'Curso agregado');
    if (ok) setNuevo(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        El orden sirve para el cambio de año: cada estudiante pasa al curso que sigue. Marca en qué tandas se da cada curso.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-gray-500 border-b">
            <th className="py-2 w-14">Orden</th><th>Curso</th><th>Nivel</th>
            {TANDAS.map(([k, t]) => <th key={k} className="text-center">{t}</th>)}
            <th className="text-center">Activo</th>
          </tr>
        </thead>
        <tbody>
          {cursos.map((c) => (
            <tr key={c.id} className={`border-b last:border-0 ${c.activo ? '' : 'text-gray-400'}`}>
              <td className="py-1.5">
                <input type="number" className={`${campo} w-14`} defaultValue={c.orden}
                  onBlur={(e) => Number(e.target.value) !== c.orden && actualizar('edu_cursos', c.id, { orden: Number(e.target.value) || 0 })} />
              </td>
              <td className="font-semibold">{c.nombre}</td>
              <td>{NIVELES[c.nivel]}</td>
              {TANDAS.map(([k]) => (
                <td key={k} className="text-center">
                  <input type="checkbox" checked={c.tandas.includes(k)} disabled={guardando} onChange={() => alternarTanda(c, k)} />
                </td>
              ))}
              <td className="text-center">
                <input type="checkbox" checked={c.activo} disabled={guardando} onChange={() => actualizar('edu_cursos', c.id, { activo: !c.activo })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {nuevo ? (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
          <label className="text-xs font-bold text-gray-600 uppercase flex-1 min-w-[200px]">
            Curso
            <input autoFocus className={`${campo} mt-1`} value={nuevo.nombre} onChange={(e) => setNuevo((p) => ({ ...p, nombre: e.target.value }))} />
          </label>
          <label className="text-xs font-bold text-gray-600 uppercase">
            Nivel
            <select className={`${campo} w-40 mt-1`} value={nuevo.nivel} onChange={(e) => setNuevo((p) => ({ ...p, nivel: e.target.value }))}>
              {Object.entries(NIVELES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
          <Button size="sm" onClick={guardarNuevo} disabled={guardando}>Guardar</Button>
          <Button size="sm" variant="ghost" onClick={() => setNuevo(null)}>Cancelar</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setNuevo({ nombre: '', nivel: 'primaria' })}>
          <Plus className="w-4 h-4 mr-1" /> Agregar curso
        </Button>
      )}
    </div>
  );
}

// ── Año escolar ──────────────────────────────────────────────────────────
function Anios({ anios, guardando, insertar, tenantId, error, recargar, esDireccion, toast }) {
  const ultimo = anios[0];
  const actual = anios.find((a) => a.actual);
  const [nuevo, setNuevo] = useState(null);
  const [cambio, setCambio] = useState(false);

  const empezar = () => {
    const a = ultimo ? ultimo.anio_inicio + 1 : new Date().getFullYear();
    setNuevo({ anio_inicio: a, mes_inicio: 9, meses: 10 });
  };

  const guardarNuevo = async () => {
    const a = Number(nuevo.anio_inicio);
    if (anios.some((x) => x.anio_inicio === a)) return error('Ese año ya existe', `${a}-${a + 1}`);
    const ok = await insertar('edu_anios', {
      nombre: `${a}-${a + 1}`, anio_inicio: a, mes_inicio: Number(nuevo.mes_inicio), meses: Number(nuevo.meses), actual: false,
    }, 'Año escolar creado');
    if (ok) setNuevo(null);
  };

  // Un solo año actual: primero se apaga el que estaba, luego se enciende el nuevo.
  const marcarActual = async (anio) => {
    if (actual && !window.confirm(`Esto solo cambia cuál es el año actual (para corregir un error): NO sube a los estudiantes de curso ni prepara cuentas.

Para pasar al año siguiente usa "Cambio de año escolar".

¿Marcar ${anio.nombre} como actual?`)) return undefined;
    const { error: e1 } = await supabase.from('edu_anios').update({ actual: false })
      .eq('tenant_id', tenantId).eq('actual', true).select('id');
    if (e1) return error('No se pudo cambiar el año actual', e1);
    const { data, error: e2 } = await supabase.from('edu_anios').update({ actual: true })
      .eq('id', anio.id).eq('tenant_id', tenantId).select('id');
    if (e2 || !data?.length) return error('No se pudo cambiar el año actual', e2 || 'Sin cambios');
    recargar();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Normalmente las mensualidades van de <b>septiembre a junio</b> (10). Si un año empiezan en agosto, créalo con agosto como mes de inicio.
      </p>
      {anios.map((a) => (
        <div key={a.id} className={`rounded-md border p-3 ${a.actual ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-gray-800">
              {a.nombre}
              {a.actual && <span className="ml-2 text-[10px] font-bold text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">AÑO ACTUAL</span>}
              {a.cerrado && <span className="ml-2 text-[10px] font-bold text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">CERRADO</span>}
            </div>
            {/* Para corregir un año marcado por error. Pasar de año de verdad es el Cambio de año (promueve a los estudiantes). */}
            {!a.actual && !a.cerrado && (
              <Button size="sm" variant="outline" disabled={guardando} onClick={() => marcarActual(a)}>Marcar como actual</Button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {mesesDelAnio(a).map((m) => (
              <span key={`${m.anio}-${m.mes}`} className="text-[11px] bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-600">{m.nombre}</span>
            ))}
          </div>
        </div>
      ))}

      {nuevo ? (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="text-xs font-bold text-gray-600 uppercase">
            Año escolar
            <div className="mt-1 h-9 flex items-center font-mono text-sm text-gray-800">{nuevo.anio_inicio}-{Number(nuevo.anio_inicio) + 1}</div>
          </div>
          <label className="text-xs font-bold text-gray-600 uppercase">
            Primer mes de cobro
            <select className={`${campo} w-40 mt-1`} value={nuevo.mes_inicio} onChange={(e) => setNuevo((p) => ({ ...p, mes_inicio: e.target.value }))}>
              <option value={8}>Agosto</option><option value={9}>Septiembre</option>
            </select>
          </label>
          <label className="text-xs font-bold text-gray-600 uppercase">
            Mensualidades
            <input type="number" min="1" max="12" className={`${campo} w-24 mt-1`} value={nuevo.meses} onChange={(e) => setNuevo((p) => ({ ...p, meses: e.target.value }))} />
          </label>
          <Button size="sm" onClick={guardarNuevo} disabled={guardando}>Crear</Button>
          <Button size="sm" variant="ghost" onClick={() => setNuevo(null)}>Cancelar</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={empezar}><Plus className="w-4 h-4 mr-1" /> Crear el año escolar siguiente</Button>
      )}

      {actual && esDireccion && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 space-y-2">
          <div className="font-bold text-amber-900">Cambio de año escolar</div>
          <p className="text-sm text-amber-900">
            Al terminar {actual.nombre}: cada estudiante sube al curso siguiente (el de 6to de secundaria se gradúa), todos pasan a continuantes
            y la mensualidad <b>no cambia</b>. <b>Sigue</b> solo el que pagó la reservación: a ese se le prepara la cuenta del año nuevo.
            El que no la ha pagado queda <b>por confirmar</b> (fuera de las aulas y sin mensualidades) hasta que pague la reservación en la Caja.
            Lo que quedó debiendo del año viejo se sigue cobrando.
          </p>
          <Button size="sm" onClick={() => setCambio(true)}><ArrowRightCircle className="w-4 h-4 mr-1" /> Cambiar a {actual.anio_inicio + 1}-{actual.anio_inicio + 2}</Button>
        </div>
      )}
      {cambio && actual && (
        <CambioAnioDialog actual={actual} siguiente={anios.find((a) => a.anio_inicio === actual.anio_inicio + 1)} error={error}
          onClose={() => setCambio(false)}
          onDone={(r) => {
            setCambio(false);
            toast({ title: `Año ${r.anio} en marcha`, description: `${r.promovidos} suben de curso · ${r.repiten} repiten · ${r.graduados} graduados · ${r.retirados} no siguen · ${r.por_confirmar || 0} por confirmar · ${r.cargos} cargos creados` });
            recargar();
          }} />
      )}
    </div>
  );
}

// ── Cambio de año ────────────────────────────────────────────────────────
// Lista a todos los activos con el curso que tendrán y si reservaron. La
// dirección marca quién repite y quién no sigue; el resto sube de curso.
// SIGUE solo el que PAGÓ la reservación (regla del colegio: sin pago no hay
// cupo). El resto sube igual pero queda 'por_confirmar' (fuera del aula y sin
// mensualidades) hasta que pague la reservación en la Caja (07/11/2026).
// Todo pasa en la base en una sola transacción (edu_cambiar_anio).
const RESERVA_TXT = { pagada: 'Reservó y pagó', pendiente: 'Cargada sin pagar', sin_reservar: 'Sin reservar', gradua: 'Se gradúa' };
function CambioAnioDialog({ actual, siguiente, onClose, onDone, error }) {
  const nombreSig = `${actual.anio_inicio + 1}-${actual.anio_inicio + 2}`;
  const [filas, setFilas] = useState(null);
  const [marca, setMarca] = useState({});        // estudiante_id → 'repite' | 'retirar'
  const [preparar, setPreparar] = useState(true);
  const [mesInicio, setMesInicio] = useState(siguiente?.mes_inicio || actual.mes_inicio || 9);
  const [meses, setMeses] = useState(siguiente?.meses || actual.meses || 10);
  const [confirmar, setConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState('');

  // Sin concepto de reservación (o en 0) no hay cómo confirmarse: la base deja seguir a todos.
  const [conReserva, setConReserva] = useState(true);
  useEffect(() => {
    (async () => {
      const [{ data, error: e }, co] = await Promise.all([
        supabase.rpc('edu_reporte_reservas'),
        supabase.from('edu_conceptos').select('id').eq('tenant_id', actual.tenant_id).eq('tipo', 'reservacion').eq('activo', true).gt('monto', 0),
      ]);
      if (e) { error('No se pudo cargar la lista', e); onClose(); return; }
      setConReserva(co.error ? true : (co.data || []).length > 0);
      setFilas(data?.filas || []);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const poner = (id, v) => setMarca((m) => { const n = { ...m }; if (n[id] === v) delete n[id]; else n[id] = v; return n; });
  const cuenta = (v) => Object.values(marca).filter((x) => x === v).length;
  // A quién hay que confirmarle: todos menos el que se gradúa (salvo que repita) y el que no sigue.
  const aplica = (f) => marca[f.estudiante_id] !== 'retirar' && (f.reserva !== 'gradua' || marca[f.estudiante_id] === 'repite');
  const sinPagar = (f) => conReserva && aplica(f) && f.reserva !== 'pagada';
  const porConfirmar = (filas || []).filter(sinPagar);
  const visibles = (filas || []).filter((f) => !filtro || (filtro === 'por_confirmar' ? sinPagar(f) : f.reserva === filtro));
  const gradua = (filas || []).filter((f) => f.reserva === 'gradua' && !marca[f.estudiante_id]).length;

  const ok = async () => {
    if (confirmar.trim() !== nombreSig) return error('Falta confirmar', `Escribe ${nombreSig} para confirmar.`);
    setGuardando(true);
    const { data, error: e } = await supabase.rpc('edu_cambiar_anio', {
      p_anio_actual: actual.id,   // si otro ya cambió de año, la base no avanza otra vez
      p_repiten: Object.entries(marca).filter(([, v]) => v === 'repite').map(([id]) => id),
      p_retirar: Object.entries(marca).filter(([, v]) => v === 'retirar').map(([id]) => id),
      p_preparar: preparar,
      p_mes_inicio: Number(mesInicio), p_meses: Number(meses),
      // Quién queda por confirmar lo decide la base (mira el pago en ese momento).
    });
    setGuardando(false);
    if (e) return error('No se pudo cambiar de año', e);
    return onDone(data);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !guardando && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Cambiar de {actual.nombre} a {nombreSig}</DialogTitle></DialogHeader>
        {!filas ? <div className="py-10 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div> : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-bold text-gray-600 uppercase">
                Primer mes de cobro
                <select className={`${campo} w-40 mt-1`} value={mesInicio} onChange={(e) => setMesInicio(e.target.value)}>
                  <option value={8}>Agosto</option><option value={9}>Septiembre</option>
                </select>
              </label>
              <label className="text-xs font-bold text-gray-600 uppercase">
                Mensualidades
                <input type="number" min="1" max="12" className={`${campo} w-24 mt-1`} value={meses} onChange={(e) => setMeses(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={preparar} onChange={(e) => setPreparar(e.target.checked)} />
                Preparar la cuenta del año nuevo de los que siguen
              </label>
              <label className="text-xs font-bold text-gray-600 uppercase ml-auto">
                Mostrar
                <select className={`${campo} w-44 mt-1`} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                  <option value="">Todos ({filas.length})</option>
                  <option value="por_confirmar">Quedan por confirmar ({porConfirmar.length})</option>
                  <option value="sin_reservar">Sin reservar</option>
                  <option value="pendiente">Cargada sin pagar</option>
                  <option value="pagada">Reservó y pagó</option>
                  <option value="gradua">Se gradúan</option>
                </select>
              </label>
            </div>
            {porConfirmar.length > 0 && (
              <div className="text-sm rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
                <b>{porConfirmar.length}</b> estudiante{porConfirmar.length === 1 ? ' no ha' : 's no han'} pagado la reservación: suben de curso pero quedan
                <b> por confirmar</b>, sin aula y sin mensualidades, hasta que la paguen en la Caja. Si sabes que alguno se va, márcalo en <b>No sigue</b>.
              </div>
            )}
            <div className="border rounded-md max-h-[45vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-100 text-xs text-gray-600">
                  <tr><th className="text-left px-2 py-1.5">Estudiante</th><th className="text-left">Curso → próximo</th><th className="text-left">Reserva</th><th className="w-16">Sigue</th><th className="w-16">Repite</th><th className="w-16">No sigue</th></tr>
                </thead>
                <tbody>
                  {visibles.map((f) => (
                    <tr key={f.estudiante_id} className={`border-t ${marca[f.estudiante_id] === 'retirar' ? 'bg-red-50' : marca[f.estudiante_id] === 'repite' ? 'bg-amber-50' : sinPagar(f) ? 'bg-gray-50 text-gray-500' : ''}`}>
                      <td className="px-2 py-1">{f.estudiante} <span className="text-xs text-gray-400">· Fam. {f.familia}</span></td>
                      <td className="text-xs">{f.curso} → <b>{marca[f.estudiante_id] === 'repite' ? f.curso : marca[f.estudiante_id] === 'retirar' ? '—' : f.curso_siguiente}</b></td>
                      <td className={`text-xs ${f.reserva === 'pagada' ? 'text-emerald-700' : f.reserva === 'gradua' ? 'text-gray-500' : 'text-amber-700'}`}>{RESERVA_TXT[f.reserva] || f.reserva}</td>
                      <td className="text-center text-xs">{!aplica(f) ? null : sinPagar(f) ? <span className="text-amber-700" title="Sin la reservación pagada">Por confirmar</span> : <span className="text-emerald-700 font-bold" title="Pagó la reservación">✓</span>}</td>
                      <td className="text-center"><input type="checkbox" checked={marca[f.estudiante_id] === 'repite'} onChange={() => poner(f.estudiante_id, 'repite')} /></td>
                      <td className="text-center"><input type="checkbox" checked={marca[f.estudiante_id] === 'retirar'} onChange={() => poner(f.estudiante_id, 'retirar')} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-sm text-gray-700">
              Suben de curso: <b>{filas.length - cuenta('repite') - cuenta('retirar') - gradua}</b> ·
              Repiten: <b>{cuenta('repite')}</b> · Se gradúan: <b>{gradua}</b> ·
              No siguen: <b>{cuenta('retirar')}</b> ·
              <span className={porConfirmar.length ? 'text-amber-700' : ''}> Por confirmar: <b>{porConfirmar.length}</b></span>
            </div>
            <div className="rounded-md border border-red-200 bg-red-50/60 p-3 space-y-2">
              <p className="text-sm text-red-900">Esto no se deshace con un botón: {actual.nombre} queda cerrado y {nombreSig} pasa a ser el año actual. Para confirmar escribe <b>{nombreSig}</b>.</p>
              <div className="flex gap-2">
                <input className={`${campo} w-40`} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} placeholder={nombreSig} />
                <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
                <Button className="bg-red-700 hover:bg-red-800" onClick={ok} disabled={guardando || confirmar.trim() !== nombreSig}>
                  {guardando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Cambiar de año
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Reglas de cobro ──────────────────────────────────────────────────────
function Reglas({ cfg, tenantId, error, recargar, toast }) {
  const [f, setF] = useState(cfg || {});
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setF(cfg || {}); }, [cfg]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const cambios = {
        dia_limite_pago: Number(f.dia_limite_pago),
        recargo_monto: Number(f.recargo_monto),
        descuento_anual_pct: Number(f.descuento_anual_pct),
        beca_pct_defecto: Number(f.beca_pct_defecto),
        permite_medio_mes: !!f.permite_medio_mes,
        updated_at: new Date().toISOString(),
      };
      const { data, error: e } = await supabase.from('edu_config').update(cambios).eq('tenant_id', tenantId).select('tenant_id');
      if (e) throw e;
      if (!data?.length) throw new Error('No se guardó.');
      toast({ title: 'Reglas guardadas' });
      recargar();
    } catch (e) {
      error('No se pudieron guardar las reglas', e);
    } finally {
      setGuardando(false);
    }
  };

  const num = (k, props = {}) => (
    <input type="number" className={`${campo} w-32 mt-1`} value={f[k] ?? ''} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} {...props} />
  );

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-xs font-bold text-gray-600 uppercase">
          Pagar hasta el día
          {num('dia_limite_pago', { min: 1, max: 28 })}
          <span className="block normal-case font-normal text-gray-500 mt-1">Fecha oficial de pago: del 1 a este día de cada mes.</span>
        </label>
        <label className="text-xs font-bold text-gray-600 uppercase">
          Recargo por atraso RD$
          {num('recargo_monto', { min: 0, step: 50 })}
          <span className="block normal-case font-normal text-gray-500 mt-1">Se carga el día 1 del mes siguiente si el mes no se pagó completo.</span>
        </label>
        <label className="text-xs font-bold text-gray-600 uppercase">
          Descuento por pagar el año completo %
          {num('descuento_anual_pct', { min: 0, max: 100 })}
          <span className="block normal-case font-normal text-gray-500 mt-1">Solo sobre las mensualidades. Ej.: 5,000 × 10 = 50,000 − 5% = 47,500.</span>
        </label>
        <label className="text-xs font-bold text-gray-600 uppercase">
          Beca por defecto %
          {num('beca_pct_defecto', { min: 0, max: 100 })}
          <span className="block normal-case font-normal text-gray-500 mt-1">Solo descuenta las mensualidades. En la ficha se puede poner 100% como excepción.</span>
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={!!f.permite_medio_mes} onChange={(e) => setF((p) => ({ ...p, permite_medio_mes: e.target.checked }))} />
        <span>Permitir pagar <b>medio mes</b>. Fuera de eso solo se acepta el mes completo: no se puede abonar cualquier monto.</span>
      </label>
      <Button onClick={guardar} disabled={guardando}><Save className="w-4 h-4 mr-1" /> Guardar reglas</Button>
    </div>
  );
}
