// =====================================================================
// Estudiantes (centros educativos, 06/11/2026)
// ---------------------------------------------------------------------
// Lista de estudiantes con su familia: los hermanos se ven juntos (mismo
// color de familia y la columna "Hermanos"). Inscribir abre la Ficha
// Integral; Importar sube la plantilla de Excel. Nadie borra: se RETIRA
// (y se puede reactivar si hay cupo). Arriba, el cupo del plan: al faltar
// 10 avisa; en el tope la base no deja inscribir más.
// SQL: sql/centros_educativos_estudiantes.sql
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { GraduationCap, Plus, Upload, RefreshCw, Search, Loader2, AlertTriangle, UserMinus, UserCheck, Camera, Printer } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import EstudianteFormModal from '@/components/colegio/EstudianteFormModal';
import ImportarEstudiantesModal from '@/components/colegio/ImportarEstudiantesModal';
import { edadDe, ESTADO_ESTUDIANTE } from '@/lib/colegio';
import { imprimirFichaEstudiante } from '@/lib/colegioReportes';

const fmt = (v) => `RD$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const campo = 'h-9 rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const TANDAS = { matutina: 'Matutina', vespertina: 'Vespertina', extendida: 'Extendida', nocturna: 'Nocturna' };
const COLORES = ['bg-sky-100 text-sky-800', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-800', 'bg-emerald-100 text-emerald-800', 'bg-rose-100 text-rose-800', 'bg-lime-100 text-lime-800'];
const quitarTildes = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function EstudiantesPage() {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [estudiantes, setEstudiantes] = useState([]);
  const [familias, setFamilias] = useState(new Map());
  const [cursos, setCursos] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [anioActual, setAnioActual] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [cupo, setCupo] = useState(null);
  const [buscar, setBuscar] = useState('');
  const [fCurso, setFCurso] = useState('');
  const [fTanda, setFTanda] = useState('');
  const [fEstado, setFEstado] = useState('activo');
  const [ficha, setFicha] = useState(null);         // null | {} (nuevo) | estudiante
  const [importar, setImportar] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(null);
  // Ficha de inscripción en hoja carta, para el archivo físico del colegio.
  const imprimirFicha = async (e) => {
    setImprimiendo(e.id);
    try { await imprimirFichaEstudiante(e.id, tenantId); }
    catch (err) { toast({ title: 'No se pudo imprimir la ficha', description: err?.message || String(err), variant: 'destructive' }); }
    finally { setImprimiendo(null); }
  };
  const [retirando, setRetirando] = useState(null);

  const error = useCallback((t, d) => toast({ title: t, description: d ? String(d) : undefined, variant: 'destructive' }), [toast]);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    try {
      const [e, fa, cu, ta, an, co, cf, cp] = await Promise.all([
        supabase.from('edu_estudiantes').select('*').eq('tenant_id', tenantId).order('apellidos').order('nombres'),
        supabase.from('edu_familias').select('id, nombre, madre_nombre, padre_nombre, tutor_nombre, madre_celular, padre_celular, tutor_telefono').eq('tenant_id', tenantId),
        supabase.from('edu_cursos').select('*').eq('tenant_id', tenantId).order('orden'),
        supabase.from('edu_tarifas').select('*').eq('tenant_id', tenantId).order('monto', { ascending: false }),
        supabase.from('edu_anios').select('*').eq('tenant_id', tenantId).eq('actual', true).maybeSingle(),
        supabase.from('edu_conceptos').select('tipo, monto').eq('tenant_id', tenantId).eq('tipo', 'sala_tareas').maybeSingle(),
        supabase.from('edu_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
        supabase.rpc('edu_cupo_estudiantes'),
      ]);
      for (const r of [e, fa, cu, ta, an, co, cf]) if (r.error) throw r.error;
      setEstudiantes(e.data || []);
      setFamilias(new Map((fa.data || []).map((x) => [x.id, x])));
      setCursos(cu.data || []);
      setTarifas(ta.data || []);
      setAnioActual(an.data || null);
      setCfg({ ...(cf.data || {}), sala_tareas_monto: co.data?.monto || 0 });
      setCupo(cp.error ? null : cp.data);
    } catch (err) {
      error('No se pudieron cargar los estudiantes', err?.message);
    } finally {
      setCargando(false);
    }
  }, [tenantId, error]);

  useEffect(() => { cargar(); }, [cargar]);

  const cursoNombre = useMemo(() => new Map(cursos.map((c) => [c.id, c.nombre])), [cursos]);

  // Hermanos: estudiantes de la misma familia.
  const porFamilia = useMemo(() => {
    const m = new Map();
    for (const e of estudiantes) { if (!m.has(e.familia_id)) m.set(e.familia_id, []); m.get(e.familia_id).push(e); }
    return m;
  }, [estudiantes]);
  const colorFamilia = useMemo(() => {
    const m = new Map(); let i = 0;
    for (const [id, lista] of porFamilia) if (lista.length > 1) m.set(id, COLORES[i++ % COLORES.length]);
    return m;
  }, [porFamilia]);

  const lista = useMemo(() => {
    const q = quitarTildes(buscar.trim());
    return estudiantes.filter((e) => {
      if (fEstado && e.estado !== fEstado) return false;
      if (fCurso && e.curso_id !== fCurso) return false;
      if (fTanda && e.tanda !== fTanda) return false;
      if (!q) return true;
      const fa = familias.get(e.familia_id);
      return quitarTildes(`${e.nombres} ${e.apellidos} ${e.matricula} ${fa?.nombre || ''} ${fa?.madre_nombre || ''} ${fa?.padre_nombre || ''} ${fa?.tutor_nombre || ''}`).includes(q);
    });
  }, [estudiantes, familias, buscar, fCurso, fTanda, fEstado]);

  // Por confirmar (cambio de año): sigue solo pagando la reservación en la Caja.
  // Aquí solo se marca el que se fue (edu_no_continua quita los cargos del año).
  const noSigue = async (e) => {
    const motivo = window.prompt(`¿Por qué no sigue ${e.nombres} ${e.apellidos}?`, '');
    if (motivo === null) return undefined;
    setRetirando(e.id);
    const { error: err } = await supabase.rpc('edu_no_continua', { p_estudiante: e.id, p_motivo: motivo });
    setRetirando(null);
    if (err) return error('No se pudo retirar', err.message);
    toast({ title: `${e.nombres} quedó retirado` });
    return cargar();
  };

  const cambiarEstado = async (e, estado) => {
    let motivo = null;
    if (estado === 'retirado') {
      motivo = window.prompt(`Motivo del retiro de ${e.nombres} ${e.apellidos}:`, '');
      if (motivo === null) return;
    }
    const cambios = estado === 'retirado'
      ? { estado, motivo_retiro: motivo || null, fecha_retiro: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }) }
      : { estado, motivo_retiro: null, fecha_retiro: null };
    const { data, error: err } = await supabase.from('edu_estudiantes').update(cambios).eq('id', e.id).eq('tenant_id', tenantId).select('id');
    if (err || !data?.length) return error('No se pudo cambiar el estado', err?.message || 'Sin permiso');
    toast({ title: estado === 'retirado' ? 'Estudiante retirado' : 'Estudiante reactivado' });
    cargar();
  };

  const avisoCupo = cupo?.limite != null && cupo.quedan <= 10;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6">
      <Helmet><title>Estudiantes</title></Helmet>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-blue-700" />
            <div>
              <h1 className="text-lg font-black text-gray-800 uppercase tracking-wide">Estudiantes</h1>
              <p className="text-xs text-gray-500">
                Año escolar {anioActual?.nombre || '—'} · {cupo ? `${cupo.activos} activos${cupo.limite != null ? ` de ${cupo.limite} del plan` : ''}` : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={cargar} disabled={cargando}><RefreshCw className={`w-4 h-4 mr-1 ${cargando ? 'animate-spin' : ''}`} /> Actualizar</Button>
            <Button variant="outline" size="sm" onClick={() => setImportar(true)}><Upload className="w-4 h-4 mr-1" /> Importar Excel</Button>
            <Button size="sm" onClick={() => setFicha({})} disabled={cupo?.limite != null && cupo.quedan <= 0}><Plus className="w-4 h-4 mr-1" /> Inscribir estudiante</Button>
          </div>
        </div>

        {avisoCupo && (
          <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${cupo.quedan <= 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <AlertTriangle className="w-4 h-4" />
            {cupo.quedan <= 0
              ? `Llegaste al tope de ${cupo.limite} estudiantes de tu plan. Para inscribir más, sube de plan.`
              : `Te quedan ${cupo.quedan} cupos de ${cupo.limite} en tu plan.`}
          </div>
        )}

        <div className="flex flex-wrap gap-2 bg-white border border-gray-200 rounded-lg p-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-2 top-2.5" />
            <input className={`${campo} w-full pl-8`} placeholder="Buscar por nombre, matrícula, familia, madre o padre…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          </div>
          <select className={campo} value={fCurso} onChange={(e) => setFCurso(e.target.value)}>
            <option value="">Todos los cursos</option>
            {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className={campo} value={fTanda} onChange={(e) => setFTanda(e.target.value)}>
            <option value="">Todas las tandas</option>
            {Object.entries(TANDAS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          <select className={campo} value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            <option value="activo">Activos</option>
            <option value="por_confirmar">Por confirmar que siguen</option>
            <option value="retirado">Retirados</option>
            <option value="graduado">Graduados</option>
            <option value="">Todos</option>
          </select>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          {cargando && !estudiantes.length ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div>
          ) : (
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b bg-gray-50">
                  <th className="py-2 px-3">Mat.</th><th>Estudiante</th><th>Curso · Tanda</th><th>Familia</th><th>Hermanos</th>
                  <th className="text-right">Mensualidad</th><th className="text-center">Extras</th><th />
                </tr>
              </thead>
              <tbody>
                {lista.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-gray-400">
                    {estudiantes.length ? 'Ningún estudiante con esos filtros.' : 'Todavía no hay estudiantes. Inscribe el primero o importa la plantilla de Excel.'}
                  </td></tr>
                )}
                {lista.map((e) => {
                  const fa = familias.get(e.familia_id);
                  const hermanos = (porFamilia.get(e.familia_id) || []).filter((h) => h.id !== e.id);
                  const color = colorFamilia.get(e.familia_id);
                  const edad = edadDe(e.fecha_nacimiento);
                  return (
                    <tr key={e.id} className={`border-b last:border-0 hover:bg-blue-50/40 cursor-pointer ${e.estado !== 'activo' ? 'text-gray-400' : ''}`} onClick={() => setFicha(e)}>
                      <td className="py-2 px-3 font-mono text-xs">{e.matricula}</td>
                      <td>
                        <div className="font-semibold flex items-center gap-1">
                          {e.nombres} {e.apellidos}
                          {!e.foto_path && <Camera className="w-3.5 h-3.5 text-amber-500" title="Falta la foto" />}
                        </div>
                        <div className="text-xs text-gray-500">{e.condicion === 'nuevo' ? 'Nuevo ingreso' : 'Continuante'}{edad != null ? ` · ${edad} años` : ''}{e.estado !== 'activo' ? ` · ${ESTADO_ESTUDIANTE[e.estado] || e.estado}` : ''}</div>
                      </td>
                      <td>{cursoNombre.get(e.curso_id) || '—'}<div className="text-xs text-gray-500">{TANDAS[e.tanda] || ''}</div></td>
                      <td>
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${color || 'bg-gray-100 text-gray-700'}`}>{fa?.nombre || '—'}</span>
                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{[fa?.madre_nombre, fa?.padre_nombre, fa?.tutor_nombre].filter(Boolean).join(' / ')}</div>
                      </td>
                      <td className="text-xs">{hermanos.length ? hermanos.map((h) => h.nombres.split(' ')[0]).join(', ') : '—'}</td>
                      <td className="text-right font-mono">
                        {fmt(e.tarifa_mensual * (1 - Number(e.beca_pct || 0) / 100))}
                        {Number(e.beca_pct) > 0 && <div className="text-[10px] text-emerald-700">beca {Number(e.beca_pct)}% de {fmt(e.tarifa_mensual)}</div>}
                        {e.tarifa_acuerdo && <div className="text-[10px] text-violet-700">acuerdo</div>}
                      </td>
                      <td className="text-center text-xs">{e.sala_tareas ? 'Sala de Tareas' : ''}</td>
                      <td className="text-right pr-3" onClick={(ev) => ev.stopPropagation()}>
                        <Button size="sm" variant="ghost" title="Imprimir ficha de inscripción" disabled={imprimiendo === e.id} onClick={() => imprimirFicha(e)}>
                          {imprimiendo === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                        </Button>
                        {e.estado === 'por_confirmar' ? (
                          <Button size="sm" variant="ghost" disabled={retirando === e.id} title="No sigue (queda retirado). Para que siga, paga la reservación en la Caja." onClick={() => noSigue(e)}><UserMinus className="w-4 h-4" /></Button>
                        ) : e.estado === 'activo' ? (
                          <Button size="sm" variant="ghost" title="Retirar (no se borra)" onClick={() => cambiarEstado(e, 'retirado')}><UserMinus className="w-4 h-4" /></Button>
                        ) : (
                          <Button size="sm" variant="ghost" title="Reactivar" onClick={() => cambiarEstado(e, 'activo')}><UserCheck className="w-4 h-4" /></Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-gray-400">{lista.length} de {estudiantes.length} estudiantes. Los de la misma familia llevan el mismo color.</p>
      </div>

      {ficha && (
        <EstudianteFormModal
          open={!!ficha} onClose={() => setFicha(null)} estudiante={ficha.id ? ficha : null}
          cursos={cursos} tarifas={tarifas} anioActual={anioActual} cfg={cfg} tenantId={tenantId}
          onError={error} onSaved={(msg) => { setFicha(null); toast({ title: msg }); cargar(); }}
        />
      )}
      <ImportarEstudiantesModal
        open={importar} onClose={() => setImportar(false)} cursos={cursos} tarifas={tarifas} anioActual={anioActual}
        tenantId={tenantId} cupo={cupo} onError={error}
        onDone={(n, fallos) => {
          setImportar(false);
          toast({ title: `Se importaron ${n} estudiantes`, description: fallos.length ? `${fallos.length} no se pudieron guardar (fila ${fallos[0].fila}: ${fallos[0].motivo})` : 'Ahora toma la foto de cada uno desde su ficha.' });
          cargar();
        }}
      />
    </div>
  );
}
