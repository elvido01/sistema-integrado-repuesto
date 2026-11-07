// Ficha Integral de Datos del estudiante (centros educativos, 06/11/2026).
// Los padres/tutor y el hogar son de la FAMILIA (los hermanos la comparten);
// lo del niño, del estudiante. La mensualidad se COPIA a la ficha y queda
// fija: el nuevo recibe la del hermano que ya está o la tarifa más reciente;
// un acuerdo se escribe a mano. La foto es obligatoria al inscribir.
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Users, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import FotoEstudiante from '@/components/colegio/FotoEstudiante';
import { edadDe, tarifaParaNuevo, ESTADO_ESTUDIANTE } from '@/lib/colegio';

const campo = 'h-9 w-full rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const etiqueta = 'text-[11px] font-bold text-gray-600 uppercase';
const fmt = (v) => `RD$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TANDAS = { matutina: 'Matutina', vespertina: 'Vespertina', extendida: 'Extendida', nocturna: 'Nocturna' };
const ESTADO_PADRES = { casados: 'Casados', union_libre: 'Unión libre', separados: 'Separados', divorciados: 'Divorciados', fallecidos: 'Fallecidos', otro: 'Otro' };

const FAMILIA_VACIA = {
  nombre: '', direccion: '', sector: '', telefono_residencial: '',
  madre_nombre: '', madre_profesion: '', madre_trabajo: '', madre_telefono: '', madre_celular: '', madre_correo: '',
  padre_nombre: '', padre_profesion: '', padre_trabajo: '', padre_telefono: '', padre_celular: '', padre_correo: '',
  tutor_nombre: '', tutor_telefono: '', tutor_direccion: '', estado_padres: '',
};
const EST_VACIO = {
  nombres: '', apellidos: '', fecha_nacimiento: '', lugar_nacimiento: '', celular: '', otro_telefono: '', telefono_trabajo: '',
  foto_path: null, curso_id: '', tanda: '', condicion: 'nuevo', tarifa_mensual: '', tarifa_id: null, tarifa_acuerdo: false, tarifa_nota: '',
  beca_pct: 0, beca_motivo: '', sala_tareas: false, numero_hermanos: '', edades_hermanos: '', posicion_familia: '', notas: '',
};
const limpio = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v]));

function Campo({ label, children, className = '' }) {
  return <label className={`block ${className}`}><span className={etiqueta}>{label}</span><div className="mt-1">{children}</div></label>;
}

export default function EstudianteFormModal({ open, onClose, estudiante, cursos, tarifas, anioActual, cfg, tenantId, onSaved, onError }) {
  const editando = !!estudiante?.id;
  const [est, setEst] = useState(EST_VACIO);
  const [fam, setFam] = useState(FAMILIA_VACIA);
  const [familiaId, setFamiliaId] = useState(null);       // existente
  const [hermanos, setHermanos] = useState([]);
  const [buscarFam, setBuscarFam] = useState('');
  const [resultadosFam, setResultadosFam] = useState([]);
  const [modoFamilia, setModoFamilia] = useState('buscar');   // buscar | nueva | elegida
  const [guardando, setGuardando] = useState(false);
  const [becaModo, setBecaModo] = useState('0');

  const s = (k, v) => setEst((p) => ({ ...p, [k]: v }));
  const f = (k, v) => setFam((p) => ({ ...p, [k]: v }));

  // Cargar al abrir
  useEffect(() => {
    if (!open) return;
    if (editando) {
      setEst({ ...EST_VACIO, ...Object.fromEntries(Object.entries(estudiante).map(([k, v]) => [k, v ?? (typeof EST_VACIO[k] === 'string' ? '' : v)])) });
      setBecaModo(['0', '50', '100'].includes(String(Number(estudiante.beca_pct))) ? String(Number(estudiante.beca_pct)) : 'otro');
      setFamiliaId(estudiante.familia_id);
      setModoFamilia('elegida');
      cargarFamilia(estudiante.familia_id);
    } else {
      setEst(EST_VACIO); setFam(FAMILIA_VACIA); setFamiliaId(null); setHermanos([]);
      setModoFamilia('buscar'); setBuscarFam(''); setResultadosFam([]); setBecaModo('0');
    }
  }, [open, estudiante?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarFamilia = async (id) => {
    const [{ data: fa }, { data: hs }] = await Promise.all([
      supabase.from('edu_familias').select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('edu_estudiantes').select('id, nombres, apellidos, curso_id, tanda, tarifa_mensual, tarifa_id, estado')
        .eq('familia_id', id).eq('tenant_id', tenantId).order('matricula'),
    ]);
    if (fa) setFam({ ...FAMILIA_VACIA, ...Object.fromEntries(Object.entries(fa).map(([k, v]) => [k, v ?? ''])) });
    setHermanos((hs || []).filter((h) => h.id !== estudiante?.id));
    return (hs || []).filter((h) => h.id !== estudiante?.id);
  };

  // Buscar familias existentes (por apellidos o por padres)
  useEffect(() => {
    if (modoFamilia !== 'buscar' || buscarFam.trim().length < 2) { setResultadosFam([]); return undefined; }
    const t = setTimeout(async () => {
      const q = buscarFam.trim().replace(/[%,()]/g, ' ');
      const { data } = await supabase.from('edu_familias')
        .select('id, nombre, madre_nombre, padre_nombre, tutor_nombre')
        .eq('tenant_id', tenantId)
        .or(`nombre.ilike.%${q}%,madre_nombre.ilike.%${q}%,padre_nombre.ilike.%${q}%,tutor_nombre.ilike.%${q}%`)
        .order('nombre').limit(8);
      setResultadosFam(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [buscarFam, modoFamilia, tenantId]);

  const elegirFamilia = async (fa) => {
    setFamiliaId(fa.id);
    setModoFamilia('elegida');
    const hs = await cargarFamilia(fa.id);
    if (!editando) {
      // Hermano en el colegio → su misma tarifa (regla del colegio).
      const sug = tarifaParaNuevo(tarifas, (hs || []).filter((h) => h.estado === 'activo' || h.estado === 'por_confirmar'));
      if (sug) setEst((p) => ({ ...p, apellidos: p.apellidos || fa.nombre, tarifa_mensual: String(sug.monto), tarifa_id: sug.tarifa_id, tarifa_acuerdo: false, tarifa_nota: sug.nota || '' }));
    }
  };

  const nuevaFamilia = () => {
    setFamiliaId(null); setHermanos([]); setModoFamilia('nueva');
    setFam({ ...FAMILIA_VACIA, nombre: buscarFam.trim() });
    if (!editando) {
      const sug = tarifaParaNuevo(tarifas, []);
      if (sug) setEst((p) => ({ ...p, tarifa_mensual: String(sug.monto), tarifa_id: sug.tarifa_id, tarifa_acuerdo: false, tarifa_nota: '' }));
    }
  };

  const curso = useMemo(() => cursos.find((c) => c.id === est.curso_id), [cursos, est.curso_id]);
  useEffect(() => {
    if (curso && !curso.tandas.includes(est.tanda)) s('tanda', curso.tandas[0]);
  }, [curso]); // eslint-disable-line react-hooks/exhaustive-deps

  const tarifasActivas = tarifas.filter((t) => t.activa);
  const valorTarifa = est.tarifa_acuerdo ? 'acuerdo' : (est.tarifa_id || '');
  const elegirTarifa = (v) => {
    if (v === 'acuerdo') return setEst((p) => ({ ...p, tarifa_acuerdo: true, tarifa_id: null, tarifa_nota: p.tarifa_nota || 'Acuerdo con la dirección' }));
    const t = tarifas.find((x) => x.id === v);
    if (t) setEst((p) => ({ ...p, tarifa_acuerdo: false, tarifa_id: t.id, tarifa_mensual: String(t.monto), tarifa_nota: '' }));
  };

  const elegirBeca = (v) => {
    setBecaModo(v);
    if (v !== 'otro') s('beca_pct', Number(v));
  };

  const edad = edadDe(est.fecha_nacimiento);
  const mensualConBeca = Number(est.tarifa_mensual || 0) * (1 - Number(est.beca_pct || 0) / 100);

  const guardar = async () => {
    // Validaciones de la ficha
    if (!est.nombres.trim() || !est.apellidos.trim()) return onError('Faltan datos', 'Escribe nombres y apellidos del estudiante.');
    if (!est.curso_id || !est.tanda) return onError('Faltan datos', 'Escoge curso y tanda.');
    if (!(Number(est.tarifa_mensual) > 0)) return onError('Falta la mensualidad', 'Escoge una tarifa o escribe el monto del acuerdo.');
    if (!editando && !est.foto_path) return onError('Falta la foto', 'La foto del estudiante es obligatoria: tómala con la cámara o súbela.');
    if (modoFamilia === 'buscar') return onError('Falta la familia', 'Busca la familia (si tiene hermanos en el colegio) o crea una nueva.');
    if (modoFamilia === 'nueva' && !fam.nombre.trim()) return onError('Falta la familia', 'Escribe los apellidos de la familia.');
    if (!fam.madre_nombre?.trim() && !fam.padre_nombre?.trim() && !fam.tutor_nombre?.trim()) {
      return onError('Faltan los padres', 'Escribe al menos la madre, el padre o el tutor.');
    }

    setGuardando(true);
    try {
      // 1. Familia
      const datosFam = limpio({ ...fam });
      delete datosFam.id; delete datosFam.tenant_id; delete datosFam.created_at; delete datosFam.updated_at; delete datosFam.cliente_id;
      if (!datosFam.estado_padres) datosFam.estado_padres = null;
      let famId = familiaId;
      if (famId) {
        const { data, error } = await supabase.from('edu_familias').update(datosFam).eq('id', famId).eq('tenant_id', tenantId).select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('No se pudo guardar la familia.');
      } else {
        const { data, error } = await supabase.from('edu_familias').insert({ ...datosFam, tenant_id: tenantId }).select('id').single();
        if (error) throw error;
        famId = data.id;
      }

      // 2. Estudiante
      const datos = limpio({
        familia_id: famId,
        nombres: est.nombres, apellidos: est.apellidos,
        fecha_nacimiento: est.fecha_nacimiento || null, lugar_nacimiento: est.lugar_nacimiento,
        celular: est.celular, otro_telefono: est.otro_telefono, telefono_trabajo: est.telefono_trabajo,
        foto_path: est.foto_path || null,
        curso_id: est.curso_id, tanda: est.tanda, condicion: est.condicion,
        tarifa_mensual: Number(est.tarifa_mensual), tarifa_id: est.tarifa_acuerdo ? null : est.tarifa_id,
        tarifa_acuerdo: !!est.tarifa_acuerdo, tarifa_nota: est.tarifa_nota,
        beca_pct: Number(est.beca_pct) || 0, beca_motivo: Number(est.beca_pct) > 0 ? est.beca_motivo : null,
        sala_tareas: !!est.sala_tareas,
        numero_hermanos: est.numero_hermanos === '' || est.numero_hermanos == null ? null : Number(est.numero_hermanos),
        edades_hermanos: est.edades_hermanos, posicion_familia: est.posicion_familia, notas: est.notas,
      });
      if (editando) {
        const { data, error } = await supabase.from('edu_estudiantes').update(datos).eq('id', estudiante.id).eq('tenant_id', tenantId).select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('No se guardó el estudiante.');
      } else {
        const { error } = await supabase.from('edu_estudiantes')
          .insert({ ...datos, tenant_id: tenantId, anio_ingreso: anioActual?.anio_inicio ?? null, estado: 'activo' });
        if (error) throw error;
      }
      onSaved(editando ? 'Ficha actualizada' : 'Estudiante inscrito');
    } catch (e) {
      onError('No se pudo guardar', e?.message);
    } finally {
      setGuardando(false);
    }
  };

  const nombreCurso = (id) => cursos.find((c) => c.id === id)?.nombre || '—';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !guardando && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? `Ficha de ${estudiante.nombres} ${estudiante.apellidos} · Matrícula ${estudiante.matricula}` : 'Inscribir estudiante'}</DialogTitle>
        </DialogHeader>

        {/* ── Familia ───────────────────────────────────────────── */}
        <section className="rounded-lg border border-gray-200 p-3">
          <h3 className="text-sm font-black text-blue-800 uppercase mb-2 flex items-center gap-2"><Users className="w-4 h-4" /> Familia</h3>
          {modoFamilia === 'buscar' && (
            <div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-2 top-2.5" />
                  <input autoFocus className={`${campo} pl-8`} placeholder="¿Tiene hermanos en el colegio? Busca por apellidos, madre o padre…"
                    value={buscarFam} onChange={(e) => setBuscarFam(e.target.value)} />
                </div>
                <Button type="button" variant="outline" onClick={nuevaFamilia}><UserPlus className="w-4 h-4 mr-1" /> Familia nueva</Button>
              </div>
              {resultadosFam.length > 0 && (
                <div className="mt-2 border rounded-md divide-y">
                  {resultadosFam.map((r) => (
                    <button key={r.id} type="button" onClick={() => elegirFamilia(r)} className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm">
                      <b>{r.nombre}</b>
                      <span className="text-gray-500"> · {[r.madre_nombre, r.padre_nombre, r.tutor_nombre].filter(Boolean).join(' / ') || 'sin padres'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {modoFamilia !== 'buscar' && (
            <>
              {hermanos.length > 0 && (
                <div className="mb-3 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
                  <b>Hermanos en el colegio:</b>{' '}
                  {hermanos.map((h) => `${h.nombres} (${nombreCurso(h.curso_id)}${h.estado !== 'activo' ? `, ${ESTADO_ESTUDIANTE[h.estado] || h.estado}` : ''})`).join(' · ')}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Campo label="Familia (apellidos) *" className="md:col-span-2"><input className={campo} value={fam.nombre} onChange={(e) => f('nombre', e.target.value)} /></Campo>
                <Campo label="Los padres están">
                  <select className={campo} value={fam.estado_padres || ''} onChange={(e) => f('estado_padres', e.target.value)}>
                    <option value="">—</option>
                    {Object.entries(ESTADO_PADRES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                  </select>
                </Campo>
                <Campo label="Teléfono residencial"><input className={campo} value={fam.telefono_residencial} onChange={(e) => f('telefono_residencial', e.target.value)} /></Campo>
                <Campo label="Dirección residencial" className="md:col-span-3"><input className={campo} value={fam.direccion} onChange={(e) => f('direccion', e.target.value)} /></Campo>
                <Campo label="Sector"><input className={campo} value={fam.sector} onChange={(e) => f('sector', e.target.value)} /></Campo>
              </div>
              {['madre', 'padre'].map((k) => (
                <div key={k} className="grid grid-cols-1 md:grid-cols-6 gap-3 mt-3">
                  <Campo label={k === 'madre' ? 'Nombre de la madre' : 'Nombre del padre'} className="md:col-span-2">
                    <input className={campo} value={fam[`${k}_nombre`]} onChange={(e) => f(`${k}_nombre`, e.target.value)} />
                  </Campo>
                  <Campo label="Ocupación"><input className={campo} value={fam[`${k}_profesion`]} onChange={(e) => f(`${k}_profesion`, e.target.value)} /></Campo>
                  <Campo label="Lugar de trabajo"><input className={campo} value={fam[`${k}_trabajo`]} onChange={(e) => f(`${k}_trabajo`, e.target.value)} /></Campo>
                  <Campo label="Celular"><input className={campo} value={fam[`${k}_celular`]} onChange={(e) => f(`${k}_celular`, e.target.value)} /></Campo>
                  <Campo label="Teléfono"><input className={campo} value={fam[`${k}_telefono`]} onChange={(e) => f(`${k}_telefono`, e.target.value)} /></Campo>
                  <Campo label="Correo" className="md:col-span-2"><input type="email" className={campo} value={fam[`${k}_correo`]} onChange={(e) => f(`${k}_correo`, e.target.value)} /></Campo>
                </div>
              ))}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                <Campo label="Tutor (si no es el padre ni la madre)" className="md:col-span-2"><input className={campo} value={fam.tutor_nombre} onChange={(e) => f('tutor_nombre', e.target.value)} /></Campo>
                <Campo label="Teléfono del tutor"><input className={campo} value={fam.tutor_telefono} onChange={(e) => f('tutor_telefono', e.target.value)} /></Campo>
                <Campo label="Dirección del tutor"><input className={campo} value={fam.tutor_direccion} onChange={(e) => f('tutor_direccion', e.target.value)} /></Campo>
              </div>
              {!editando && (
                <button type="button" className="mt-2 text-xs text-blue-700 underline" onClick={() => { setModoFamilia('buscar'); setFamiliaId(null); setHermanos([]); }}>
                  Cambiar de familia
                </button>
              )}
            </>
          )}
        </section>

        {/* ── Estudiante ────────────────────────────────────────── */}
        <section className="rounded-lg border border-gray-200 p-3">
          <h3 className="text-sm font-black text-blue-800 uppercase mb-2">Datos personales</h3>
          <div className="flex flex-col md:flex-row gap-4">
            <FotoEstudiante tenantId={tenantId} path={est.foto_path} onChange={(p) => s('foto_path', p)} onError={onError} />
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
              <Campo label="Nombres *"><input className={campo} value={est.nombres} onChange={(e) => s('nombres', e.target.value)} /></Campo>
              <Campo label="Apellidos *"><input className={campo} value={est.apellidos} onChange={(e) => s('apellidos', e.target.value)} /></Campo>
              <Campo label={`Fecha de nacimiento${edad != null ? ` · ${edad} años` : ''}`}>
                <input type="date" className={campo} value={est.fecha_nacimiento || ''} onChange={(e) => s('fecha_nacimiento', e.target.value)} />
              </Campo>
              <Campo label="Lugar de nacimiento"><input className={campo} value={est.lugar_nacimiento} onChange={(e) => s('lugar_nacimiento', e.target.value)} /></Campo>
              <Campo label="Celular"><input className={campo} value={est.celular} onChange={(e) => s('celular', e.target.value)} /></Campo>
              <Campo label="Tel. trabajo / otro">
                <div className="flex gap-2">
                  <input className={campo} placeholder="Trabajo" value={est.telefono_trabajo} onChange={(e) => s('telefono_trabajo', e.target.value)} />
                  <input className={campo} placeholder="Otro" value={est.otro_telefono} onChange={(e) => s('otro_telefono', e.target.value)} />
                </div>
              </Campo>
              <Campo label="Número de hermanos"><input type="number" min="0" className={campo} value={est.numero_hermanos ?? ''} onChange={(e) => s('numero_hermanos', e.target.value)} /></Campo>
              <Campo label="Edades de los hermanos"><input className={campo} placeholder="Ej. 5, 9, 12" value={est.edades_hermanos} onChange={(e) => s('edades_hermanos', e.target.value)} /></Campo>
              <Campo label="Posición en la familia"><input className={campo} placeholder="Ej. 2do de 3" value={est.posicion_familia} onChange={(e) => s('posicion_familia', e.target.value)} /></Campo>
            </div>
          </div>
        </section>

        {/* ── Inscripción y cobro ───────────────────────────────── */}
        <section className="rounded-lg border border-gray-200 p-3">
          <h3 className="text-sm font-black text-blue-800 uppercase mb-2">Inscripción · {anioActual?.nombre || ''}</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Campo label="Curso *">
              <select className={campo} value={est.curso_id || ''} onChange={(e) => s('curso_id', e.target.value)}>
                <option value="">— Escoge —</option>
                {cursos.filter((c) => c.activo || c.id === est.curso_id).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Tanda *">
              <select className={campo} value={est.tanda || ''} onChange={(e) => s('tanda', e.target.value)} disabled={!curso}>
                {(curso?.tandas || []).map((t) => <option key={t} value={t}>{TANDAS[t]}</option>)}
              </select>
            </Campo>
            <Campo label="Condición">
              <select className={campo} value={est.condicion} onChange={(e) => s('condicion', e.target.value)}>
                <option value="nuevo">Nuevo ingreso</option>
                <option value="continuante">Continuante</option>
              </select>
            </Campo>
            <Campo label="Sala de Tareas">
              <label className="h-9 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!est.sala_tareas} onChange={(e) => s('sala_tareas', e.target.checked)} /> Sí, la toma
              </label>
            </Campo>

            <Campo label="Tarifa (mensualidad) *">
              <select className={campo} value={valorTarifa} onChange={(e) => elegirTarifa(e.target.value)}>
                <option value="" disabled>— Escoge —</option>
                {tarifasActivas.map((t) => <option key={t.id} value={t.id}>{fmt(t.monto)}{t.nota ? ` · ${t.nota}` : ''}</option>)}
                {est.tarifa_id && !tarifasActivas.some((t) => t.id === est.tarifa_id) && (
                  <option value={est.tarifa_id}>{fmt(est.tarifa_mensual)} (tarifa desactivada)</option>
                )}
                <option value="acuerdo">Monto especial (acuerdo)…</option>
              </select>
            </Campo>
            <Campo label="Mensualidad RD$">
              <input type="number" min="0" step="50" className={campo} value={est.tarifa_mensual}
                disabled={!est.tarifa_acuerdo} onChange={(e) => s('tarifa_mensual', e.target.value)} />
            </Campo>
            <Campo label="Beca (solo mensualidades)">
              <div className="flex gap-2">
                <select className={campo} value={becaModo} onChange={(e) => elegirBeca(e.target.value)}>
                  <option value="0">Sin beca</option>
                  <option value="50">50%</option>
                  <option value="100">100% (excepción)</option>
                  <option value="otro">Otro %</option>
                </select>
                {becaModo === 'otro' && (
                  <input type="number" min="0" max="100" className={`${campo} w-20`} value={est.beca_pct} onChange={(e) => s('beca_pct', e.target.value)} />
                )}
              </div>
            </Campo>
            <Campo label="Motivo de la beca">
              <input className={campo} disabled={!(Number(est.beca_pct) > 0)} placeholder="Ej. personal docente" value={est.beca_motivo} onChange={(e) => s('beca_motivo', e.target.value)} />
            </Campo>
          </div>
          <div className="mt-3 text-sm text-gray-700 flex flex-wrap gap-x-6 gap-y-1">
            <span>Paga cada mes: <b>{fmt(mensualConBeca)}</b>{Number(est.beca_pct) > 0 ? ` (beca ${Number(est.beca_pct)}%)` : ''}{est.sala_tareas ? ` + Sala de Tareas ${fmt(conceptoSala(cfg))}` : ''}</span>
            {est.tarifa_nota && <span className="text-emerald-700">{est.tarifa_nota}</span>}
          </div>
          {est.tarifa_acuerdo && (
            <input className={`${campo} mt-2`} placeholder="Nota del acuerdo" value={est.tarifa_nota} onChange={(e) => s('tarifa_nota', e.target.value)} />
          )}
        </section>

        <Campo label="Notas"><textarea className={`${campo} h-16 py-1`} value={est.notas || ''} onChange={(e) => s('notas', e.target.value)} /></Campo>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} {editando ? 'Guardar cambios' : 'Inscribir'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// El monto de la Sala de Tareas viene de los conceptos (lo pasa la página en cfg).
function conceptoSala(cfg) { return Number(cfg?.sala_tareas_monto || 0); }
