// =====================================================================
// Tareas del Colegio (07/11/2026, plan EDUCA TOTAL)
// ---------------------------------------------------------------------
// El maestro publica una tarea para un curso (y sección, o todas) con un
// archivo (PDF, Word, Excel, PowerPoint o imagen, hasta 10 MB) y/o un
// enlace (los videos van como enlace de YouTube). Sale enseguida en la
// página web del colegio, donde los estudiantes la descargan.
// Solo año escolar actual. SQL: sql/centros_educativos_pagina_web.sql
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { ClipboardList, Loader2, Upload, Trash2, ExternalLink, Paperclip, RefreshCw, CalendarDays, Globe } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  BUCKET_TAREAS, TIPOS_ARCHIVO, ACEPTA_ARCHIVOS, extension, problemaArchivo, nombreSeguro, formatoBytes,
} from '@/lib/colegioSitio';

const campo = 'w-full h-9 rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const etiqueta = 'block text-xs font-bold text-gray-600 uppercase mb-1';
const VACIA = { seccion: '', asignatura_id: '', titulo: '', instrucciones: '', fecha_entrega: '', enlace: '' };
const fechaCorta = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short' }) : '');

export default function TareasColegioPage() {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [anio, setAnio] = useState(null);
  const [cursos, setCursos] = useState([]);
  const [asignaturas, setAsignaturas] = useState([]);
  const [slug, setSlug] = useState(null);
  const [cursoId, setCursoId] = useState('');
  const [secciones, setSecciones] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [cargandoTareas, setCargandoTareas] = useState(false);
  const [nueva, setNueva] = useState(VACIA);
  const [archivo, setArchivo] = useState(null);
  const [publicando, setPublicando] = useState(false);
  const [borrando, setBorrando] = useState(null);

  const error = useCallback((t, e) => toast({ title: t, description: e ? String(e.message || e) : undefined, variant: 'destructive' }), [toast]);

  const cargarBase = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    try {
      const [an, cu, asg, si] = await Promise.all([
        supabase.from('edu_anios').select('id, nombre').eq('tenant_id', tenantId).eq('actual', true).maybeSingle(),
        supabase.from('edu_cursos').select('id, nombre, nivel, orden').eq('tenant_id', tenantId).eq('activo', true).order('orden').order('nombre'),
        supabase.from('edu_asignaturas').select('id, nombre, nivel, orden').eq('tenant_id', tenantId).eq('activa', true).order('orden').order('nombre'),
        supabase.from('edu_sitio').select('slug').eq('tenant_id', tenantId).maybeSingle(),
      ]);
      if (an.error) throw an.error;
      if (cu.error) throw cu.error;
      setAnio(an.data);
      setCursos(cu.data || []);
      setAsignaturas(asg.data || []);
      setSlug(si.data?.slug || null);
    } catch (e) {
      error('No se pudo cargar', e);
    } finally {
      setCargando(false);
    }
  }, [tenantId, error]);
  useEffect(() => { cargarBase(); }, [cargarBase]);

  const cargarTareas = useCallback(async () => {
    if (!tenantId || !cursoId || !anio) { setTareas([]); return; }
    setCargandoTareas(true);
    const { data, error: e } = await supabase.from('edu_tareas')
      .select('id, titulo, instrucciones, seccion, fecha_entrega, enlace, archivo_path, archivo_nombre, archivo_bytes, maestro_nombre, created_at, asignatura_id')
      .eq('tenant_id', tenantId).eq('anio_id', anio.id).eq('curso_id', cursoId).order('created_at', { ascending: false });
    if (e) error('No se pudieron cargar las tareas', e);
    setTareas(data || []);
    setCargandoTareas(false);
  }, [tenantId, cursoId, anio, error]);
  useEffect(() => { cargarTareas(); }, [cargarTareas]);

  // Secciones del curso (las de sus estudiantes activos).
  useEffect(() => {
    if (!tenantId || !cursoId) { setSecciones([]); return undefined; }
    let vivo = true;
    supabase.from('edu_estudiantes').select('seccion').eq('tenant_id', tenantId).eq('curso_id', cursoId).eq('estado', 'activo')
      .then(({ data }) => {
        if (!vivo) return;
        setSecciones([...new Set((data || []).map((e) => String(e.seccion || '').trim().toUpperCase()).filter(Boolean))].sort());
      });
    return () => { vivo = false; };
  }, [tenantId, cursoId]);

  const curso = cursos.find((c) => c.id === cursoId);
  const asignaturasDelCurso = useMemo(() => asignaturas.filter((a) => a.nivel === curso?.nivel), [asignaturas, curso]);
  const nombreAsignatura = (id) => asignaturas.find((a) => a.id === id)?.nombre;
  const poner = (k) => (e) => setNueva((n) => ({ ...n, [k]: e.target.value }));

  const escogerArchivo = (file) => {
    if (!file) { setArchivo(null); return; }
    const p = problemaArchivo(file);
    if (p) { error(p); setArchivo(null); return; }
    setArchivo(file);
  };

  const publicar = async (ev) => {
    ev.preventDefault();
    if (!cursoId) { error('Escoja el curso'); return; }
    if (!nueva.titulo.trim()) { error('Escriba el título de la tarea'); return; }
    const enlace = nueva.enlace.trim();
    if (enlace && !/^https?:\/\//i.test(enlace)) { error('El enlace debe empezar con https://'); return; }
    if (!archivo && !enlace && !nueva.instrucciones.trim()) { error('Ponga las instrucciones, un archivo o un enlace'); return; }
    setPublicando(true);
    let path = null;
    try {
      if (archivo) {
        const ext = extension(archivo.name);
        const id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        path = `${tenantId}/${anio.id}/${id}-${nombreSeguro(archivo.name)}`;
        const { error: e1 } = await supabase.storage.from(BUCKET_TAREAS).upload(path, archivo, { contentType: TIPOS_ARCHIVO[ext], upsert: false });
        if (e1) {
          path = null;
          throw /row-level security|policy/i.test(e1.message || '')
            ? new Error('No se pudo subir: el plan no incluye la página web o se llenó el espacio de 10 GB.') : e1;
        }
      }
      const { error: e2 } = await supabase.from('edu_tareas').insert({
        tenant_id: tenantId, anio_id: anio.id, curso_id: cursoId,
        seccion: nueva.seccion.trim().toUpperCase(), asignatura_id: nueva.asignatura_id || null,
        titulo: nueva.titulo.trim(), instrucciones: nueva.instrucciones.trim() || null,
        fecha_entrega: nueva.fecha_entrega || null, enlace: enlace || null,
        archivo_path: path, archivo_nombre: archivo?.name || null, archivo_bytes: archivo?.size || 0,
      }).select('id').single();
      if (e2) throw e2;
      toast({ title: 'Tarea publicada', description: 'Ya sale en la página del colegio.' });
      setNueva((n) => ({ ...VACIA, seccion: n.seccion, asignatura_id: n.asignatura_id }));
      setArchivo(null);
      cargarTareas();
    } catch (e) {
      if (path) await supabase.storage.from(BUCKET_TAREAS).remove([path]);
      error('No se pudo publicar la tarea', e);
    } finally {
      setPublicando(false);
    }
  };

  const borrar = async (t) => {
    if (!window.confirm(`¿Borrar la tarea "${t.titulo}"? Ya no saldrá en la página.`)) return;
    setBorrando(t.id);
    try {
      const { data, error: e } = await supabase.from('edu_tareas').delete().eq('id', t.id).select('id');
      if (e) throw e;
      if (!data?.length) throw new Error('No se borró (¿sin permiso?)');
      if (t.archivo_path) await supabase.storage.from(BUCKET_TAREAS).remove([t.archivo_path]);
      setTareas((ts) => ts.filter((x) => x.id !== t.id));
    } catch (e) {
      error('No se pudo borrar', e);
    } finally {
      setBorrando(null);
    }
  };

  const urlArchivo = (p) => supabase.storage.from(BUCKET_TAREAS).getPublicUrl(p).data.publicUrl;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6">
      <Helmet><title>Tareas</title></Helmet>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-7 h-7 text-blue-700" />
            <div>
              <h1 className="text-xl font-black text-gray-900">Tareas</h1>
              <p className="text-xs text-gray-500">Año escolar {anio?.nombre || '—'} · salen en la página web del colegio</p>
            </div>
          </div>
          <div className="flex gap-2">
            {slug && <Button size="sm" variant="outline" onClick={() => window.open(`/sitio/${slug}#tareas`, '_blank', 'noopener')}><Globe className="w-4 h-4 mr-1" /> Ver en la página</Button>}
            <Button size="sm" variant="outline" onClick={() => { cargarBase(); cargarTareas(); }} disabled={cargando}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </div>

        {!cargando && !slug && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
            El colegio todavía no ha creado su página web (menú Colegio → Página Web). Las tareas se guardan igual y saldrán cuando la cree.
          </div>
        )}

        {cargando ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div>
          : !anio ? <p className="text-sm text-gray-600">No hay año escolar actual. Créelo en Configuración del Colegio.</p>
          : (
            <div className="grid gap-4 lg:grid-cols-5">
              <form onSubmit={publicar} className="lg:col-span-2 bg-white rounded-xl border p-5 space-y-3 self-start">
                <h2 className="font-bold text-gray-900">Nueva tarea</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className={etiqueta}>Curso</label>
                    <select className={campo} value={cursoId} onChange={(e) => { setCursoId(e.target.value); setNueva((n) => ({ ...n, seccion: '', asignatura_id: '' })); }}>
                      <option value="">— Escoja —</option>
                      {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className={etiqueta}>Sección</label>
                    <select className={campo} value={nueva.seccion} onChange={poner('seccion')} disabled={!cursoId}>
                      <option value="">Todas</option>
                      {secciones.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {asignaturasDelCurso.length > 0 && (
                  <div>
                    <label className={etiqueta}>Asignatura</label>
                    <select className={campo} value={nueva.asignatura_id} onChange={poner('asignatura_id')}>
                      <option value="">— Sin asignatura —</option>
                      {asignaturasDelCurso.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className={etiqueta}>Título</label>
                  <input className={campo} value={nueva.titulo} onChange={poner('titulo')} placeholder="Práctica de fracciones" maxLength={150} />
                </div>
                <div>
                  <label className={etiqueta}>Instrucciones</label>
                  <textarea className={`${campo} h-24 py-2`} value={nueva.instrucciones} onChange={poner('instrucciones')} placeholder="Resolver los ejercicios 1 al 10 de la página 45." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={etiqueta}>Fecha de entrega</label>
                    <input type="date" className={campo} value={nueva.fecha_entrega} onChange={poner('fecha_entrega')} />
                  </div>
                  <div>
                    <label className={etiqueta}>Enlace (YouTube…)</label>
                    <input className={campo} value={nueva.enlace} onChange={poner('enlace')} placeholder="https://" />
                  </div>
                </div>
                <div>
                  <label className={etiqueta}>Archivo (hasta 10 MB)</label>
                  <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-gray-300 px-3 py-3 text-sm hover:bg-gray-50">
                    <Paperclip className="w-4 h-4 text-gray-500" />
                    <span className="truncate">{archivo ? `${archivo.name} (${formatoBytes(archivo.size)})` : 'PDF, Word, Excel, PowerPoint o imagen'}</span>
                    <input type="file" accept={ACEPTA_ARCHIVOS} className="hidden" onChange={(e) => { escogerArchivo(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  {archivo && <button type="button" className="text-xs text-red-600 mt-1 hover:underline" onClick={() => setArchivo(null)}>Quitar archivo</button>}
                </div>
                <Button type="submit" className="w-full" disabled={publicando || !cursoId}>
                  {publicando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />} Publicar tarea
                </Button>
              </form>

              <div className="lg:col-span-3 space-y-3">
                {!cursoId ? (
                  <div className="rounded-xl border-2 border-dashed py-16 text-center text-gray-400 text-sm">Escoja un curso para ver sus tareas</div>
                ) : cargandoTareas ? (
                  <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
                ) : !tareas.length ? (
                  <div className="rounded-xl border-2 border-dashed py-16 text-center text-gray-400 text-sm">{curso?.nombre}: todavía no hay tareas</div>
                ) : tareas.map((t) => (
                  <div key={t.id} className="bg-white rounded-xl border p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2 text-xs mb-1">
                          {t.asignatura_id && <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 font-semibold">{nombreAsignatura(t.asignatura_id)}</span>}
                          <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 font-semibold">{t.seccion ? `Sección ${t.seccion}` : 'Todas las secciones'}</span>
                          {t.fecha_entrega && <span className="flex items-center gap-1 text-gray-600"><CalendarDays className="w-3.5 h-3.5" /> {fechaCorta(t.fecha_entrega)}</span>}
                        </div>
                        <p className="font-bold text-gray-900">{t.titulo}</p>
                        {t.instrucciones && <p className="text-sm text-gray-600 whitespace-pre-line mt-1">{t.instrucciones}</p>}
                        <div className="flex flex-wrap gap-3 mt-2 text-xs">
                          {t.archivo_path && <a href={urlArchivo(t.archivo_path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-700 hover:underline"><Paperclip className="w-3.5 h-3.5" /> {t.archivo_nombre} ({formatoBytes(t.archivo_bytes)})</a>}
                          {t.enlace && <a href={t.enlace} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-700 hover:underline"><ExternalLink className="w-3.5 h-3.5" /> Enlace</a>}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-2">{t.maestro_nombre || '—'} · {new Date(t.created_at).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      </div>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => borrar(t)} disabled={borrando === t.id}>
                        {borrando === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
