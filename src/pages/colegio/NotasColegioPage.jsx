// =====================================================================
// Notas y Boletines del Colegio (07/11/2026, plan EDUCA TOTAL)
// ---------------------------------------------------------------------
// Registrar: el maestro escoge curso, sección, asignatura y período y
// llena las 3 competencias de cada estudiante (0-100). "Recuperación"
// es la calificación de recuperación final del área.
// Boletines: el boletín MINERD de cada estudiante (lib/printBoletin), uno
// por hoja, con el maestro(a) encargado(a) del curso/sección.
// Asignaturas: las del boletín por nivel; se agregan, renombran, ordenan
// o se desactivan (no se borran: tienen notas).
// SQL: sql/centros_educativos_notas.sql. Solo año escolar actual.
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { BookOpen, Loader2, Save, Printer, Plus, RefreshCw, Key, Globe } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { printHtmlSmart } from '@/lib/printHtmlSmart';
import { datosColegio } from '@/lib/colegioReportes';
import { boletinHTML } from '@/lib/printBoletin';
import { COMPETENCIAS, PERIODOS, NIVELES_CON_NOTAS, finalArea, notaValida } from '@/lib/colegio';

const campo = 'h-9 rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const PESTANAS = [['registrar', 'Registrar notas'], ['boletines', 'Boletines'], ['pagina', 'Página web (padres)'], ['asignaturas', 'Asignaturas']];
const nombreBoletin = (e) => `${e.apellidos}, ${e.nombres}`.toUpperCase();
const txt = (v) => (v === null || v === undefined ? '' : String(Number(v)));

/** Trae todas las filas (PostgREST corta en 1000). */
async function traerTodo(armar) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) return filas;
  }
}

export default function NotasColegioPage() {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [pestana, setPestana] = useState('registrar');
  const [anio, setAnio] = useState(null);
  const [cursos, setCursos] = useState([]);
  const [asignaturas, setAsignaturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cursoId, setCursoId] = useState('');
  const [seccion, setSeccion] = useState('');
  const [estudiantes, setEstudiantes] = useState([]);

  const error = useCallback((t, e) => toast({ title: t, description: e ? String(e.message || e) : undefined, variant: 'destructive' }), [toast]);

  const cargarBase = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    try {
      const [an, cu] = await Promise.all([
        supabase.from('edu_anios').select('*').eq('tenant_id', tenantId).eq('actual', true).maybeSingle(),
        supabase.from('edu_cursos').select('*').eq('tenant_id', tenantId).in('nivel', NIVELES_CON_NOTAS).eq('activo', true).order('orden'),
      ]);
      if (an.error) throw an.error;
      if (cu.error) throw cu.error;
      let { data: asg, error: e3 } = await supabase.from('edu_asignaturas').select('*').eq('tenant_id', tenantId).order('orden').order('nombre');
      if (e3) throw e3;
      if (!asg?.length) {
        const { error: e4 } = await supabase.rpc('edu_preparar_asignaturas');
        if (e4) throw e4;
        ({ data: asg, error: e3 } = await supabase.from('edu_asignaturas').select('*').eq('tenant_id', tenantId).order('orden').order('nombre'));
        if (e3) throw e3;
      }
      setAnio(an.data);
      setCursos(cu.data || []);
      setAsignaturas(asg || []);
    } catch (e) {
      error('No se pudo cargar', e);
    } finally {
      setCargando(false);
    }
  }, [tenantId, error]);
  useEffect(() => { cargarBase(); }, [cargarBase]);

  // Estudiantes activos del curso (todas las secciones; se filtran abajo).
  useEffect(() => {
    if (!tenantId || !cursoId) { setEstudiantes([]); return undefined; }
    let vivo = true;
    supabase.from('edu_estudiantes').select('id, nombres, apellidos, matricula, seccion, tanda')
      .eq('tenant_id', tenantId).eq('curso_id', cursoId).eq('estado', 'activo').order('apellidos').order('nombres')
      .then(({ data, error: e }) => { if (!vivo) return; if (e) error('No se pudieron cargar los estudiantes', e); setEstudiantes(data || []); });
    return () => { vivo = false; };
  }, [tenantId, cursoId, error]);

  const curso = cursos.find((c) => c.id === cursoId);
  const secciones = useMemo(() => [...new Set(estudiantes.map((e) => e.seccion || ''))].sort(), [estudiantes]);
  const delGrupo = useMemo(() => estudiantes.filter((e) => !seccion || (e.seccion || '') === seccion), [estudiantes, seccion]);
  const asignaturasDelCurso = useMemo(() => asignaturas.filter((a) => a.activa && a.nivel === curso?.nivel), [asignaturas, curso]);
  useEffect(() => { setSeccion(''); }, [cursoId]);

  const filtros = (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-bold text-gray-600 uppercase">Curso
        <select className={`${campo} block mt-1 w-48`} value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
          <option value="">— Escoge —</option>
          {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-gray-600 uppercase">Sección
        <select className={`${campo} block mt-1 w-32`} value={seccion} onChange={(e) => setSeccion(e.target.value)} disabled={!cursoId}>
          <option value="">Todas</option>
          {secciones.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6">
      <Helmet><title>Notas y Boletines</title></Helmet>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-blue-700" />
            <div>
              <h1 className="text-xl font-black text-gray-900">Notas y Boletines</h1>
              <p className="text-xs text-gray-500">Año escolar {anio?.nombre || '—'} · formato del boletín MINERD</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={cargarBase} disabled={cargando}><RefreshCw className="w-4 h-4" /></Button>
        </div>
        <div className="flex gap-1 border-b">
          {PESTANAS.map(([k, t]) => (
            <button key={k} type="button" onClick={() => setPestana(k)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${pestana === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{t}</button>
          ))}
        </div>
        {cargando ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div>
          : !anio ? <p className="text-sm text-gray-600">No hay año escolar actual. Créalo en Configuración del Colegio.</p>
          : pestana === 'asignaturas' ? <Asignaturas asignaturas={asignaturas} tenantId={tenantId} recargar={cargarBase} error={error} toast={toast} />
          : pestana === 'pagina' ? <PaginaWeb anio={anio} tenantId={tenantId} filtros={filtros} curso={curso} seccion={seccion} error={error} toast={toast} />
          : (
            <div className="space-y-3">
              {filtros}
              {!cursoId ? <p className="text-sm text-gray-500">Escoge el curso. (El nivel inicial no lleva notas numéricas.)</p>
                : !delGrupo.length ? <p className="text-sm text-gray-500">No hay estudiantes activos en este curso{seccion ? ` sección ${seccion}` : ''}.</p>
                : pestana === 'registrar'
                  ? <Registrar anio={anio} tenantId={tenantId} estudiantes={delGrupo} asignaturas={asignaturasDelCurso} error={error} toast={toast} key={`${cursoId}|${seccion}`} />
                  : <Boletines anio={anio} tenantId={tenantId} curso={curso} seccion={seccion} estudiantes={delGrupo} asignaturas={asignaturasDelCurso} error={error} toast={toast} key={`${cursoId}|${seccion}`} />}
            </div>
          )}
      </div>
    </div>
  );
}

// ── Registrar notas ───────────────────────────────────────────────────────
function Registrar({ anio, tenantId, estudiantes, asignaturas, error, toast }) {
  const [asigId, setAsigId] = useState(asignaturas[0]?.id || '');
  const [periodo, setPeriodo] = useState('1');           // '1'..'4' | 'R' (recuperación)
  const [orig, setOrig] = useState({});                  // clave → valor guardado (string)
  const [vals, setVals] = useState({});                  // clave → lo tecleado
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const esRec = periodo === 'R';
  const cols = esRec ? [{ n: 'R', corto: 'Recuperación final' }] : COMPETENCIAS;
  const clave = (estId, c) => `${estId}|${c}`;

  const cambios = Object.keys(vals).filter((k) => (vals[k] ?? '') !== (orig[k] ?? ''));
  const invalidos = cambios.filter((k) => !notaValida(vals[k]).ok);

  const cargar = useCallback(async () => {
    if (!asigId) return;
    setCargando(true);
    try {
      const ids = estudiantes.map((e) => e.id);
      const o = {};
      if (esRec) {
        const filas = await traerTodo(() => supabase.from('edu_notas_recuperacion').select('estudiante_id, nota')
          .eq('tenant_id', tenantId).eq('anio_id', anio.id).eq('asignatura_id', asigId).in('estudiante_id', ids));
        filas.forEach((f) => { o[clave(f.estudiante_id, 'R')] = txt(f.nota); });
      } else {
        const filas = await traerTodo(() => supabase.from('edu_notas').select('estudiante_id, competencia, nota')
          .eq('tenant_id', tenantId).eq('anio_id', anio.id).eq('asignatura_id', asigId).eq('periodo', Number(periodo)).in('estudiante_id', ids));
        filas.forEach((f) => { o[clave(f.estudiante_id, f.competencia)] = txt(f.nota); });
      }
      setOrig(o); setVals(o);
    } catch (e) {
      error('No se pudieron cargar las notas', e);
    } finally {
      setCargando(false);
    }
  }, [asigId, periodo, esRec, estudiantes, tenantId, anio, error]);
  useEffect(() => { cargar(); }, [cargar]);

  const cambiarFiltro = (fn) => {
    if (cambios.length && !window.confirm(`Hay ${cambios.length} nota(s) sin guardar. ¿Descartarlas?`)) return;
    fn();
  };

  const guardar = async () => {
    if (invalidos.length) return error('Hay notas no válidas', 'Cada nota va de 0 a 100 (en rojo las que no).');
    if (!cambios.length) return undefined;
    setGuardando(true);
    try {
      const subir = []; const borrar = [];
      cambios.forEach((k) => {
        const [estId, c] = k.split('|');
        const { valor } = notaValida(vals[k]);
        if (valor === null) { if ((orig[k] ?? '') !== '') borrar.push({ estId, c }); return; }
        subir.push(esRec
          ? { tenant_id: tenantId, anio_id: anio.id, estudiante_id: estId, asignatura_id: asigId, nota: valor }
          : { tenant_id: tenantId, anio_id: anio.id, estudiante_id: estId, asignatura_id: asigId, competencia: Number(c), periodo: Number(periodo), nota: valor });
      });
      const tabla = esRec ? 'edu_notas_recuperacion' : 'edu_notas';
      if (subir.length) {
        const { data, error: e } = await supabase.from(tabla)
          .upsert(subir, { onConflict: esRec ? 'estudiante_id,anio_id,asignatura_id' : 'estudiante_id,anio_id,asignatura_id,competencia,periodo' })
          .select('estudiante_id');
        if (e) throw e;
        if ((data || []).length !== subir.length) throw new Error(`Se guardaron ${(data || []).length} de ${subir.length}. Revisa tus permisos.`);
      }
      for (const b of borrar) {
        const filtro = { tenant_id: tenantId, anio_id: anio.id, estudiante_id: b.estId, asignatura_id: asigId,
          ...(esRec ? {} : { competencia: Number(b.c), periodo: Number(periodo) }) };
        const { error: e } = await supabase.from(tabla).delete().match(filtro).select('estudiante_id');
        if (e) throw e;
      }
      toast({ title: `Notas guardadas (${cambios.length})` });
      await cargar();
    } catch (e) {
      error('No se pudieron guardar las notas', e);
    } finally {
      setGuardando(false);
    }
    return undefined;
  };

  // Enter baja a la misma columna del siguiente estudiante.
  const bajar = (ev, i, c) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    document.getElementById(`nota-${i + 1}-${c}`)?.focus();
  };

  if (!asignaturas.length) return <p className="text-sm text-gray-500">Este nivel no tiene asignaturas activas. Agrégalas en la pestaña Asignaturas.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold text-gray-600 uppercase">Asignatura
          <select className={`${campo} block mt-1 w-72`} value={asigId} onChange={(e) => { const v = e.target.value; cambiarFiltro(() => setAsigId(v)); }}>
            {asignaturas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-gray-600 uppercase">Período
          <select className={`${campo} block mt-1 w-48`} value={periodo} onChange={(e) => { const v = e.target.value; cambiarFiltro(() => setPeriodo(v)); }}>
            {PERIODOS.map((p) => <option key={p} value={String(p)}>Período {p} (P{p})</option>)}
            <option value="R">Recuperación final</option>
          </select>
        </label>
        <Button onClick={guardar} disabled={guardando || !cambios.length} className="ml-auto">
          {guardando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Guardar{cambios.length ? ` (${cambios.length})` : ''}
        </Button>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        {cargando ? <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 w-10">#</th>
                <th className="text-left">Estudiante</th>
                <th className="text-left w-16">Sección</th>
                {cols.map((c) => <th key={c.n} className="w-36 px-2">{esRec ? c.corto : `C${c.n} · ${c.corto}`}</th>)}
              </tr>
            </thead>
            <tbody>
              {estudiantes.map((e, i) => (
                <tr key={e.id} className="border-t">
                  <td className="px-3 py-1 text-gray-400">{i + 1}</td>
                  <td className="font-medium">{nombreBoletin(e)}</td>
                  <td className="text-xs text-gray-500">{e.seccion || ''}</td>
                  {cols.map((c) => {
                    const k = clave(e.id, c.n);
                    const malo = !notaValida(vals[k]).ok;
                    const cambiado = (vals[k] ?? '') !== (orig[k] ?? '');
                    return (
                      <td key={c.n} className="px-2 py-1 text-center">
                        <input id={`nota-${i}-${c.n}`} inputMode="decimal" value={vals[k] ?? ''}
                          onChange={(ev) => { const v = ev.target.value; setVals((p) => ({ ...p, [k]: v })); }}
                          onKeyDown={(ev) => bajar(ev, i, c.n)}
                          className={`${campo} w-20 text-center ${malo ? 'border-red-500 bg-red-50' : cambiado ? 'border-amber-400 bg-amber-50' : ''}`} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-500">Notas de 0 a 100. Enter baja al siguiente estudiante. En amarillo lo cambiado sin guardar; vaciar una casilla borra esa nota al guardar. El boletín calcula solo C1-C3 y la final del área cuando están los 4 períodos.</p>
    </div>
  );
}

// ── Boletines ─────────────────────────────────────────────────────────────
function Boletines({ anio, tenantId, curso, seccion, estudiantes, asignaturas, error, toast }) {
  const [maestro, setMaestro] = useState('');
  const [maestroOrig, setMaestroOrig] = useState('');
  const [notas, setNotas] = useState(null);       // estId → asigId → 'c-p' → nota
  const [rec, setRec] = useState({});             // estId → asigId → nota
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const ids = estudiantes.map((e) => e.id);
        const [m, ns, rs] = await Promise.all([
          supabase.from('edu_grupos_maestro').select('maestro').eq('tenant_id', tenantId).eq('anio_id', anio.id).eq('curso_id', curso.id).eq('seccion', seccion).maybeSingle(),
          traerTodo(() => supabase.from('edu_notas').select('estudiante_id, asignatura_id, competencia, periodo, nota')
            .eq('tenant_id', tenantId).eq('anio_id', anio.id).in('estudiante_id', ids).order('id')),
          traerTodo(() => supabase.from('edu_notas_recuperacion').select('estudiante_id, asignatura_id, nota')
            .eq('tenant_id', tenantId).eq('anio_id', anio.id).in('estudiante_id', ids).order('estudiante_id')),
        ]);
        if (!vivo) return;
        const n = {};
        ns.forEach((f) => { ((n[f.estudiante_id] ||= {})[f.asignatura_id] ||= {})[`${f.competencia}-${f.periodo}`] = Number(f.nota); });
        const r = {};
        rs.forEach((f) => { (r[f.estudiante_id] ||= {})[f.asignatura_id] = Number(f.nota); });
        setNotas(n); setRec(r);
        setMaestro(m.data?.maestro || ''); setMaestroOrig(m.data?.maestro || '');
      } catch (e) {
        if (vivo) error('No se pudieron cargar las notas', e);
      }
    })();
    return () => { vivo = false; };
  }, [anio, tenantId, curso, seccion, estudiantes, error]);

  const guardarMaestro = async () => {
    if (maestro.trim() === maestroOrig.trim()) return true;
    const { data, error: e } = await supabase.from('edu_grupos_maestro')
      .upsert({ tenant_id: tenantId, anio_id: anio.id, curso_id: curso.id, seccion, maestro: maestro.trim() }, { onConflict: 'anio_id,curso_id,seccion' })
      .select('id');
    if (e || !data?.length) { error('No se guardó el maestro(a)', e || 'Sin permiso'); return false; }
    setMaestroOrig(maestro.trim());
    return true;
  };

  const imprimir = async (lista) => {
    setImprimiendo(true);
    try {
      await guardarMaestro();
      const colegio = await datosColegio(tenantId);
      const secc = seccion || [...new Set(lista.map((e) => e.seccion).filter(Boolean))].join(', ');
      await printHtmlSmart(boletinHTML({
        colegio, anio: anio.nombre, curso: curso.nombre, seccion: secc, maestro: maestro.trim(),
        asignaturas,
        estudiantes: lista.map((e) => ({ nombre: nombreBoletin(e), notas: notas?.[e.id] || {}, recuperacion: rec[e.id] || {} })),
      }), { tipo: 'carta' });
    } catch (e) {
      error('No se pudo imprimir', e);
    } finally {
      setImprimiendo(false);
    }
  };

  if (!notas) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold text-gray-600 uppercase">Maestro(a) encargado(a) del grado
          <input className={`${campo} block mt-1 w-72`} value={maestro} onChange={(e) => setMaestro(e.target.value)} onBlur={guardarMaestro}
            placeholder={seccion ? `De ${curso.nombre} ${seccion}` : `De ${curso.nombre}`} />
        </label>
        <Button className="ml-auto" onClick={() => imprimir(estudiantes)} disabled={imprimiendo}>
          {imprimiendo ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Printer className="w-4 h-4 mr-1" />} Imprimir todos ({estudiantes.length})
        </Button>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-xs text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Estudiante</th>
              <th className="text-left w-16">Sección</th>
              {asignaturas.map((a) => <th key={a.id} className="px-1 text-[10px] font-semibold" title={a.nombre}>{a.nombre.split(' ')[0].slice(0, 7)}</th>)}
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {estudiantes.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-1.5 font-medium">{nombreBoletin(e)}</td>
                <td className="text-xs text-gray-500">{e.seccion || ''}</td>
                {asignaturas.map((a) => {
                  const f = finalArea(notas[e.id]?.[a.id]);
                  const cuantas = Object.keys(notas[e.id]?.[a.id] || {}).length;
                  return (
                    <td key={a.id} className={`text-center text-xs ${f !== null && f < 65 ? 'text-red-700 font-bold' : ''}`} title={`${cuantas} de 12 notas`}>
                      {f !== null ? f : cuantas ? <span className="text-gray-400">{cuantas}/12</span> : '—'}
                    </td>
                  );
                })}
                <td className="text-right pr-2">
                  <Button size="sm" variant="outline" onClick={() => imprimir([e])} disabled={imprimiendo}><Printer className="w-4 h-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">Por asignatura sale la calificación final del área cuando están las 12 notas (3 competencias × 4 períodos); si no, cuántas lleva. En rojo, menos de 65 (va a recuperación).</p>
    </div>
  );
}

// ── Asignaturas ───────────────────────────────────────────────────────────
function Asignaturas({ asignaturas, tenantId, recargar, error, toast }) {
  const [nivel, setNivel] = useState('primaria');
  const [nueva, setNueva] = useState('');
  const [editando, setEditando] = useState({});     // id → { nombre, orden }
  const lista = asignaturas.filter((a) => a.nivel === nivel);

  const guardar = async (a, cambios) => {
    const { data, error: e } = await supabase.from('edu_asignaturas').update(cambios).eq('id', a.id).eq('tenant_id', tenantId).select('id');
    if (e || !data?.length) return error('No se guardó la asignatura', e || 'Sin permiso');
    setEditando((p) => { const n = { ...p }; delete n[a.id]; return n; });
    return recargar();
  };
  const agregar = async () => {
    const nombre = nueva.trim();
    if (!nombre) return undefined;
    const orden = Math.max(0, ...lista.map((a) => a.orden || 0)) + 1;
    const { data, error: e } = await supabase.from('edu_asignaturas').insert({ tenant_id: tenantId, nivel, nombre, orden }).select('id');
    if (e || !data?.length) return error('No se agregó', e?.code === '23505' ? 'Ya existe una asignatura con ese nombre en este nivel.' : (e || 'Sin permiso'));
    setNueva('');
    toast({ title: `${nombre} agregada` });
    return recargar();
  };

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex gap-2">
        {['primaria', 'secundaria'].map((n) => (
          <Button key={n} size="sm" variant={nivel === n ? 'default' : 'outline'} onClick={() => setNivel(n)}>{n === 'primaria' ? 'Primaria' : 'Secundaria'}</Button>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-xs text-gray-600">
            <tr><th className="w-20 px-3 py-2 text-left">Orden</th><th className="text-left">Asignatura (como sale en el boletín)</th><th className="w-20">Activa</th><th className="w-24" /></tr>
          </thead>
          <tbody>
            {lista.map((a) => {
              const ed = editando[a.id];
              return (
                <tr key={a.id} className={`border-t ${a.activa ? '' : 'text-gray-400'}`}>
                  <td className="px-3 py-1">
                    <input type="number" className={`${campo} w-16`} value={ed?.orden ?? a.orden}
                      onChange={(e) => setEditando((p) => ({ ...p, [a.id]: { nombre: p[a.id]?.nombre ?? a.nombre, orden: e.target.value } }))} />
                  </td>
                  <td>
                    <input className={`${campo} w-full`} value={ed?.nombre ?? a.nombre}
                      onChange={(e) => setEditando((p) => ({ ...p, [a.id]: { orden: p[a.id]?.orden ?? a.orden, nombre: e.target.value } }))} />
                  </td>
                  <td className="text-center"><input type="checkbox" checked={a.activa} onChange={(e) => guardar(a, { activa: e.target.checked })} title="Las inactivas no salen en el boletín (sus notas se guardan)" /></td>
                  <td className="text-right pr-3">
                    {ed && <Button size="sm" onClick={() => guardar(a, { nombre: String(ed.nombre).trim(), orden: Number(ed.orden) || 0 })} disabled={!String(ed.nombre).trim()}>Guardar</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <input className={`${campo} flex-1`} value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder={`Nueva asignatura de ${nivel}`} />
        <Button onClick={agregar} disabled={!nueva.trim()}><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
      </div>
      <p className="text-xs text-gray-500">Salen en el boletín en este orden. No se borran (pueden tener notas): se desactivan.</p>
    </div>
  );
}

// ── Notas en la página web (padres y estudiantes) ─────────────────────────
// La dirección publica cada período cuando está listo; cada estudiante entra
// a la página con su clave y ve las notas publicadas del año actual.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
const claveBonita = (c) => (c ? `${c.slice(0, 4)}-${c.slice(4)}` : '');

function PaginaWeb({ anio, tenantId, filtros, curso, seccion, error, toast }) {
  const [publicados, setPublicados] = useState(null);
  const [cambiando, setCambiando] = useState(null);
  const [lista, setLista] = useState(null);
  const [ocupado, setOcupado] = useState('');
  const [sitio, setSitio] = useState(null);

  const cargarPublicados = useCallback(async () => {
    const [{ data, error: e }, { data: si }] = await Promise.all([
      supabase.from('edu_notas_publicadas').select('periodo').eq('tenant_id', tenantId).eq('anio_id', anio.id),
      supabase.from('edu_sitio').select('slug, dominio').eq('tenant_id', tenantId).maybeSingle(),
    ]);
    if (e) error('No se pudo leer qué está publicado', e);
    setPublicados(new Set((data || []).map((x) => x.periodo)));
    setSitio(si || null);
  }, [tenantId, anio, error]);
  useEffect(() => { cargarPublicados(); }, [cargarPublicados]);

  const cargarLista = useCallback(async () => {
    if (!curso) { setLista(null); return; }
    let q = supabase.from('edu_estudiantes').select('id, nombres, apellidos, seccion, clave_portal')
      .eq('tenant_id', tenantId).eq('curso_id', curso.id).eq('estado', 'activo').order('apellidos').order('nombres');
    if (seccion) q = q.eq('seccion', seccion);
    const { data, error: e } = await q;
    if (e) error('No se pudieron cargar los estudiantes', e);
    setLista(data || []);
  }, [tenantId, curso, seccion, error]);
  useEffect(() => { cargarLista(); }, [cargarLista]);

  const alternar = async (p) => {
    const esta = publicados.has(p);
    if (!window.confirm(esta
      ? `¿Quitar el período ${p} de la página? Los padres dejarán de verlo.`
      : `¿Publicar las notas del período ${p}? Los padres y estudiantes las verán con su clave.`)) return;
    setCambiando(p);
    try {
      const { data, error: e } = esta
        ? await supabase.from('edu_notas_publicadas').delete().match({ anio_id: anio.id, periodo: p }).select('periodo')
        : await supabase.from('edu_notas_publicadas').insert({ tenant_id: tenantId, anio_id: anio.id, periodo: p }).select('periodo');
      if (e) throw e;
      if (!data?.length) throw new Error('Sin permiso');
      toast({ title: esta ? `Período ${p} quitado de la página` : `Período ${p} publicado` });
      await cargarPublicados();
    } catch (e) {
      error('No se pudo cambiar', e);
    } finally {
      setCambiando(null);
    }
  };

  const darClaves = async (estudianteId = null) => {
    if (estudianteId && !window.confirm('¿Darle una clave nueva? La anterior deja de funcionar.')) return;
    setOcupado(estudianteId || 'todas');
    try {
      const { data, error: e } = await supabase.rpc('edu_generar_claves_portal', estudianteId ? { p_estudiante: estudianteId } : { p_curso: curso.id });
      if (e) throw e;
      toast({ title: estudianteId ? 'Clave nueva lista' : `${data || 0} claves nuevas` });
      await cargarLista();
    } catch (e) {
      error('No se pudieron crear las claves', e);
    } finally {
      setOcupado('');
    }
  };

  const imprimirClaves = async () => {
    const conClave = (lista || []).filter((e) => e.clave_portal);
    if (!conClave.length) { error('Primero dé las claves'); return; }
    setOcupado('imprimir');
    try {
      const colegio = await datosColegio(tenantId);
      const url = sitio?.dominio ? sitio.dominio : sitio ? `${window.location.host}/sitio/${sitio.slug}` : window.location.host;
      const tarjetas = conClave.map((e) => `
        <div class="t">
          <div class="c">${esc(colegio.nombre)}</div>
          <div class="n">${esc(`${e.nombres} ${e.apellidos}`)}</div>
          <div class="g">${esc(curso.nombre)}${e.seccion ? ` · Sección ${esc(e.seccion)}` : ''}</div>
          <div class="k">${esc(claveBonita(e.clave_portal))}</div>
          <div class="i">Para ver las notas entre a <b>${esc(url)}</b>, vaya a <b>Notas</b> y escriba esta clave. Guárdela: es personal.</div>
        </div>`).join('');
      await printHtmlSmart(`<html><head><meta charset="utf-8"><style>
        @page { size: letter; margin: 10mm; }
        body { font-family: Arial, sans-serif; margin: 0; }
        .w { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
        .t { border: 1px dashed #888; border-radius: 6px; padding: 5mm; page-break-inside: avoid; }
        .c { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #555; }
        .n { font-size: 15px; font-weight: bold; margin-top: 3px; }
        .g { font-size: 11px; color: #444; }
        .k { font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; letter-spacing: 3px; margin: 6px 0; }
        .i { font-size: 10px; color: #333; }
      </style></head><body><div class="w">${tarjetas}</div></body></html>`, { tipo: 'carta' });
    } catch (e) {
      error('No se pudo imprimir', e);
    } finally {
      setOcupado('');
    }
  };

  const faltan = (lista || []).filter((e) => !e.clave_portal).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2"><Globe className="w-5 h-5 text-blue-700" /><h2 className="font-bold text-gray-900">Períodos publicados en la página</h2></div>
        <p className="text-xs text-gray-500">Publique cada período cuando las notas estén completas. La recuperación y la calificación final salen cuando los 4 están publicados.</p>
        {!publicados ? <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> : (
          <div className="flex flex-wrap gap-2">
            {PERIODOS.map((p) => (
              <button key={p} type="button" onClick={() => alternar(p)} disabled={cambiando !== null}
                className={`rounded-lg border px-4 py-2 text-sm font-bold ${publicados.has(p) ? 'bg-green-600 border-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {cambiando === p ? <Loader2 className="w-4 h-4 animate-spin inline" /> : `P${p}`} · {publicados.has(p) ? 'Publicado' : 'No publicado'}
              </button>
            ))}
          </div>
        )}
        {!sitio && <p className="text-xs text-amber-700">El colegio todavía no ha creado su página web (Colegio → Página Web).</p>}
      </div>

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2"><Key className="w-5 h-5 text-blue-700" /><h2 className="font-bold text-gray-900">Claves de los estudiantes</h2></div>
        <p className="text-xs text-gray-500">Cada estudiante tiene su clave para ver sus notas. Imprímalas y entréguelas a los padres.</p>
        {filtros}
        {!curso ? <p className="text-sm text-gray-500">Escoja el curso.</p>
          : !lista ? <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          : !lista.length ? <p className="text-sm text-gray-500">No hay estudiantes activos.</p>
          : (
            <>
              <div className="flex flex-wrap gap-2">
                {faltan > 0 && <Button size="sm" onClick={() => darClaves()} disabled={!!ocupado}>{ocupado === 'todas' ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Key className="w-4 h-4 mr-1" />} Dar clave a {faltan} sin clave</Button>}
                <Button size="sm" variant="outline" onClick={imprimirClaves} disabled={!!ocupado}>{ocupado === 'imprimir' ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Printer className="w-4 h-4 mr-1" />} Imprimir claves</Button>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-gray-500 border-b"><th className="py-2">Estudiante</th><th>Sección</th><th>Clave</th><th /></tr></thead>
                <tbody>
                  {lista.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2">{nombreBoletin(e)}</td>
                      <td>{e.seccion || '—'}</td>
                      <td className="font-mono font-bold tracking-wider">{e.clave_portal ? claveBonita(e.clave_portal) : <span className="text-gray-400 font-sans font-normal">sin clave</span>}</td>
                      <td className="text-right">
                        {e.clave_portal && <Button size="sm" variant="ghost" onClick={() => darClaves(e.id)} disabled={!!ocupado}>{ocupado === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Clave nueva'}</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
      </div>
    </div>
  );
}
