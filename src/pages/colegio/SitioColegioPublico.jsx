// =====================================================================
// Página web pública del colegio (07/11/2026, plan EDUCA TOTAL)
// ---------------------------------------------------------------------
// Sin login. Se abre por el dominio propio del colegio (raíz "/") o por
// motoflow.com.do/sitio/<slug>. Presentación, requisitos de inscripción,
// tareas por curso/sección (descarga directa) y contacto.
// Los datos salen de edu_sitio_publico / edu_sitio_tareas; si el plan no
// es Educa Total solo la ve el personal del colegio (vista previa).
// =====================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
  GraduationCap, ClipboardList, Download, ExternalLink, MapPin, Phone, Mail, Clock,
  MessageCircle, CheckCircle2, LogIn, Loader2, CalendarDays, User, AlertTriangle, KeyRound, LogOut,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import {
  BUCKET_TAREAS, formatoBytes, listaRequisitos, enlaceWhatsapp, enlaceRed,
} from '@/lib/colegioSitio';
import { COMPETENCIAS, PERIODOS, finalCompetencia, finalArea } from '@/lib/colegio';

const urlArchivo = (path) => (path ? supabase.storage.from(BUCKET_TAREAS).getPublicUrl(path).data.publicUrl : null);
const fechaCorta = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const NIVELES = { inicial: 'Nivel Inicial', primaria: 'Primaria', secundaria: 'Secundaria' };

function leerGuardado(clave) {
  try { return window.localStorage.getItem(clave) || ''; } catch { return ''; }
}
function guardar(clave, valor) {
  try { window.localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: no pasa nada */ }
}

export default function SitioColegioPublico({ dominio = null, slug = null, datosIniciales = null }) {
  const [sitio, setSitio] = useState(datosIniciales);
  const [cargando, setCargando] = useState(!datosIniciales);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (datosIniciales) return undefined;
    let vivo = true;
    supabase.rpc('edu_sitio_publico', { p_dominio: dominio, p_slug: slug })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) setFallo(true);
        setSitio(data || null);
        setCargando(false);
      });
    return () => { vivo = false; };
  }, [dominio, slug, datosIniciales]);

  // En el dominio propio el sistema vive en /entrar; en /sitio/<slug>, en la raíz.
  const enlaceEntrar = slug ? '/' : '/entrar';

  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }
  if (!sitio || !sitio.disponible) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <GraduationCap className="w-12 h-12 text-gray-300 mb-3" />
        <h1 className="text-xl font-bold text-gray-800">{fallo ? 'No se pudo cargar la página' : 'Esta página no está disponible'}</h1>
        <p className="text-sm text-gray-500 mt-1">{fallo ? 'Revise su conexión e intente de nuevo.' : 'El colegio todavía no ha publicado su página.'}</p>
        <a href={enlaceEntrar} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"><LogIn className="w-4 h-4" /> Entrar al sistema</a>
      </div>
    );
  }
  return <Sitio s={sitio} dominio={dominio} slug={slug} enlaceEntrar={enlaceEntrar} />;
}

function Sitio({ s, dominio, slug, enlaceEntrar }) {
  const color = s.color || '#1d4ed8';
  const portada = urlArchivo(s.portada_path);
  const requisitos = listaRequisitos(s.requisitos);
  const wa = enlaceWhatsapp(s.whatsapp || s.telefono);
  const fb = enlaceRed(s.facebook, 'facebook');
  const ig = enlaceRed(s.instagram, 'instagram');
  const nav = [['inicio', 'Inicio'], ['inscripcion', 'Inscripción'], ['tareas', 'Tareas'], ['notas', 'Notas'], ['contacto', 'Contacto']];

  return (
    <div className="min-h-screen bg-white text-gray-800" style={{ '--c': color }}>
      <Helmet>
        <title>{s.nombre || 'Colegio'}</title>
        {s.lema && <meta name="description" content={s.lema} />}
        {s.logo_url && <link rel="icon" href={s.logo_url} />}
      </Helmet>

      {s.vista_previa && (
        <div className="bg-amber-100 text-amber-900 text-xs sm:text-sm px-4 py-2 flex items-center gap-2 justify-center text-center">
          <AlertTriangle className="w-4 h-4 shrink-0" /> <span><b>Vista previa.</b> {s.motivo_previa}</span>
        </div>
      )}

      {/* Encabezado */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <a href="#inicio" className="flex items-center gap-3 min-w-0">
            {s.logo_url
              ? <img src={s.logo_url} alt="" className="h-10 w-10 object-contain shrink-0" />
              : <GraduationCap className="h-9 w-9 shrink-0" style={{ color }} />}
            <span className="font-extrabold text-sm sm:text-base leading-tight truncate">{s.nombre}</span>
          </a>
          <nav className="ml-auto hidden md:flex items-center gap-1">
            {nav.map(([id, t]) => <a key={id} href={`#${id}`} className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">{t}</a>)}
          </nav>
          <a href={enlaceEntrar} className="ml-auto md:ml-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 shrink-0">
            <LogIn className="w-3.5 h-3.5" /> Personal
          </a>
        </div>
        <nav className="md:hidden flex justify-around border-t text-xs font-semibold text-gray-600">
          {nav.map(([id, t]) => <a key={id} href={`#${id}`} className="py-2 px-2">{t}</a>)}
        </nav>
      </header>

      {/* Portada */}
      <section id="inicio" className="relative scroll-mt-28">
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }} />
        {portada && <img src={portada} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        {portada && <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(0,0,0,.25), ${color}e6)` }} />}
        <div className="relative max-w-6xl mx-auto px-4 py-20 sm:py-28 text-white">
          <h1 className="text-3xl sm:text-5xl font-black max-w-3xl leading-tight text-white">{s.nombre}</h1>
          {s.lema && <p className="mt-4 text-lg sm:text-xl text-white/90 max-w-2xl">{s.lema}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#inscripcion" className="rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow" style={{ color }}>Requisitos de inscripción</a>
            <a href="#tareas" className="rounded-full border border-white/70 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10">Ver tareas</a>
          </div>
        </div>
      </section>

      {s.presentacion && (
        <section className="max-w-3xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl font-extrabold">Sobre nosotros</h2>
          <p className="mt-4 text-gray-600 leading-relaxed whitespace-pre-line">{s.presentacion}</p>
        </section>
      )}

      {/* Inscripción */}
      <section id="inscripcion" className="bg-gray-50 border-y scroll-mt-28">
        <div className="max-w-6xl mx-auto px-4 py-14 grid gap-8 md:grid-cols-5">
          <div className="md:col-span-2">
            <h2 className="text-2xl font-extrabold">Inscripción</h2>
            <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold ${s.inscripciones_abiertas ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
              {s.inscripciones_abiertas ? 'Inscripciones abiertas' : 'Inscripciones cerradas por ahora'}
            </span>
            {s.inscripcion_nota && <p className="mt-4 text-gray-600 whitespace-pre-line">{s.inscripcion_nota}</p>}
            {wa && (
              <a href={`${wa}?text=${encodeURIComponent('Hola, quiero información sobre la inscripción.')}`} target="_blank" rel="noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-green-600 hover:bg-green-700 px-5 py-2.5 text-sm font-bold text-white">
                <MessageCircle className="w-4 h-4" /> Preguntar por WhatsApp
              </a>
            )}
          </div>
          <div className="md:col-span-3 rounded-2xl bg-white border p-6">
            <h3 className="font-bold text-gray-900 mb-4">Documentos y requisitos</h3>
            {requisitos.length ? (
              <ul className="space-y-3">
                {requisitos.map((r, i) => (
                  <li key={i} className="flex gap-3"><CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color }} /><span>{r}</span></li>
                ))}
              </ul>
            ) : <p className="text-sm text-gray-500">Comuníquese con el colegio para conocer los requisitos.</p>}
          </div>
        </div>
      </section>

      <Tareas s={s} dominio={dominio} slug={slug} color={color} />

      <NotasEstudiante dominio={dominio} slug={slug} color={color} />

      {/* Contacto */}
      <section id="contacto" className="bg-gray-900 text-gray-200 scroll-mt-28">
        <div className="max-w-6xl mx-auto px-4 py-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <h2 className="text-xl font-extrabold text-white">Contacto</h2>
            {s.lema && <p className="mt-2 text-sm text-gray-400">{s.lema}</p>}
          </div>
          {s.direccion && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.nombre}, ${s.direccion}`)}`} target="_blank" rel="noreferrer" className="flex gap-3 text-gray-200 hover:text-white">
              <MapPin className="w-5 h-5 shrink-0 text-gray-400" /><span className="text-sm">{s.direccion}</span>
            </a>
          )}
          <div className="space-y-3 text-sm">
            {s.telefono && <a href={`tel:${s.telefono.replace(/[^\d+]/g, '')}`} className="flex gap-3 text-gray-200 hover:text-white"><Phone className="w-5 h-5 text-gray-400" />{s.telefono}</a>}
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="flex gap-3 text-gray-200 hover:text-white"><MessageCircle className="w-5 h-5 text-gray-400" />WhatsApp</a>}
            {s.correo && <a href={`mailto:${s.correo}`} className="flex gap-3 text-gray-200 hover:text-white break-all"><Mail className="w-5 h-5 text-gray-400 shrink-0" />{s.correo}</a>}
          </div>
          <div className="space-y-3 text-sm">
            {s.horario && <p className="flex gap-3 whitespace-pre-line"><Clock className="w-5 h-5 text-gray-400 shrink-0" />{s.horario}</p>}
            {fb && <a href={fb} target="_blank" rel="noreferrer" className="flex gap-3 text-gray-200 hover:text-white"><ExternalLink className="w-5 h-5 text-gray-400" />Facebook</a>}
            {ig && <a href={ig} target="_blank" rel="noreferrer" className="flex gap-3 text-gray-200 hover:text-white"><ExternalLink className="w-5 h-5 text-gray-400" />Instagram</a>}
          </div>
        </div>
        <div className="border-t border-gray-800 py-4 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} {s.nombre} · Hecho con MotoFlow
        </div>
      </section>
    </div>
  );
}

function Tareas({ s, dominio, slug, color }) {
  const clave = `sitio-tareas-${s.slug}`;
  const cursos = s.cursos || [];
  const [cursoId, setCursoId] = useState(() => {
    const g = leerGuardado(`${clave}-curso`);
    return cursos.some((c) => c.id === g) ? g : '';
  });
  const [seccion, setSeccion] = useState(() => leerGuardado(`${clave}-seccion`));
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const curso = cursos.find((c) => c.id === cursoId);
  const secciones = curso?.secciones || [];

  const grupos = useMemo(() => {
    const m = new Map();
    cursos.forEach((c) => { const k = NIVELES[c.nivel] || c.nivel || 'Cursos'; if (!m.has(k)) m.set(k, []); m.get(k).push(c); });
    return [...m.entries()];
  }, [cursos]);

  useEffect(() => { guardar(`${clave}-curso`, cursoId); }, [clave, cursoId]);
  useEffect(() => { guardar(`${clave}-seccion`, seccion); }, [clave, seccion]);
  useEffect(() => { if (seccion && !secciones.includes(seccion)) setSeccion(''); }, [secciones, seccion]);

  useEffect(() => {
    if (!cursoId) { setTareas([]); return undefined; }
    let vivo = true;
    setCargando(true);
    supabase.rpc('edu_sitio_tareas', { p_dominio: dominio, p_slug: slug, p_curso: cursoId, p_seccion: seccion || '' })
      .then(({ data }) => { if (!vivo) return; setTareas(Array.isArray(data) ? data : []); setCargando(false); });
    return () => { vivo = false; };
  }, [dominio, slug, cursoId, seccion]);

  return (
    <section id="tareas" className="max-w-6xl mx-auto px-4 py-14 scroll-mt-28">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">Tareas</h2>
          <p className="text-sm text-gray-500 mt-1">Escoja su curso para ver y descargar las tareas que dejaron los maestros.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={cursoId} onChange={(e) => setCursoId(e.target.value)}
            className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold min-w-[200px] focus:outline-none focus:ring-2" style={{ '--tw-ring-color': color }}>
            <option value="">— Escoja el curso —</option>
            {grupos.map(([nivel, cs]) => (
              <optgroup key={nivel} label={nivel}>
                {cs.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </optgroup>
            ))}
          </select>
          {secciones.length > 0 && (
            <div className="flex rounded-xl border border-gray-300 overflow-hidden h-11">
              {['', ...secciones].map((x) => (
                <button key={x || 'todas'} type="button" onClick={() => setSeccion(x)}
                  className="px-3 text-sm font-semibold" style={seccion === x ? { background: color, color: '#fff' } : undefined}>
                  {x || 'Todas'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        {!cursoId ? (
          <div className="rounded-2xl border-2 border-dashed py-14 text-center text-gray-400">
            <ClipboardList className="w-10 h-10 mx-auto mb-2" />Escoja un curso arriba
          </div>
        ) : cargando ? (
          <div className="py-14 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-gray-400" /></div>
        ) : !tareas.length ? (
          <div className="rounded-2xl border-2 border-dashed py-14 text-center text-gray-400">
            <ClipboardList className="w-10 h-10 mx-auto mb-2" />No hay tareas publicadas para {curso?.nombre}{seccion ? ` ${seccion}` : ''}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {tareas.map((t) => <TarjetaTarea key={t.id} t={t} color={color} />)}
          </div>
        )}
      </div>
    </section>
  );
}

function TarjetaTarea({ t, color }) {
  const url = urlArchivo(t.archivo_path);
  const descarga = url ? `${url}?download=${encodeURIComponent(t.archivo_nombre || 'tarea')}` : null;
  return (
    <article className="rounded-2xl border bg-white p-5 flex flex-col">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {t.asignatura && <span className="rounded-full px-2.5 py-0.5 font-bold text-white" style={{ background: color }}>{t.asignatura}</span>}
        {t.seccion && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 font-semibold text-gray-600">Sección {t.seccion}</span>}
        <span className="text-gray-400 ml-auto">{new Date(t.created_at).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}</span>
      </div>
      <h3 className="mt-3 font-bold text-gray-900 text-lg leading-snug">{t.titulo}</h3>
      {t.instrucciones && <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{t.instrucciones}</p>}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        {t.fecha_entrega && <span className="flex items-center gap-1 font-semibold text-gray-700"><CalendarDays className="w-3.5 h-3.5" /> Entregar: {fechaCorta(t.fecha_entrega)}</span>}
        {t.maestro && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {t.maestro}</span>}
      </div>
      {(descarga || t.enlace) && (
        <div className="mt-4 pt-4 border-t flex flex-wrap gap-2">
          {descarga && (
            <a href={descarga} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: color }}>
              <Download className="w-4 h-4" /> Descargar <span className="font-normal opacity-80">({formatoBytes(t.archivo_bytes)})</span>
            </a>
          )}
          {t.enlace && (
            <a href={t.enlace} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
<ExternalLink className="w-4 h-4" /> {/youtu/i.test(t.enlace) ? 'Ver video' : 'Abrir enlace'}
            </a>
          )}
        </div>
      )}
    </article>
  );
}

// Notas del estudiante con su clave: solo los períodos publicados del año.
// La clave no se guarda en el navegador (computadoras compartidas).
function NotasEstudiante({ dominio, slug, color }) {
  const [clave, setClave] = useState('');
  const [datos, setDatos] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState('');

  const ver = async (ev) => {
    ev.preventDefault();
    const limpia = clave.replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (limpia.length !== 8) { setAviso('La clave tiene 8 letras y números (ej. ABCD-2345).'); return; }
    setBuscando(true); setAviso('');
    const { data, error } = await supabase.rpc('edu_sitio_notas', { p_dominio: dominio, p_slug: slug, p_clave: limpia });
    setBuscando(false);
    if (error) { setAviso('No se pudo consultar. Intente de nuevo.'); return; }
    if (!data?.encontrado) { setAviso('Esa clave no existe. Revise la tarjeta que le entregó el colegio.'); return; }
    setDatos(data);
  };
  const salir = () => { setDatos(null); setClave(''); setAviso(''); };

  const pub = new Set(datos?.periodos_publicados || []);
  const completos = pub.size === PERIODOS.length;
  const celda = (v) => (v === null || v === undefined ? '—' : Math.round(Number(v)));
  const tono = (v) => (v === null || v === undefined ? 'text-gray-300' : Number(v) < 65 ? 'text-red-600 font-bold' : 'text-gray-900 font-semibold');

  return (
    <section id="notas" className="bg-gray-50 border-y scroll-mt-28">
      <div className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-extrabold">Notas</h2>
        {!datos ? (
          <>
            <p className="text-sm text-gray-500 mt-1">Padres y estudiantes: escriba la clave personal que le entregó el colegio.</p>
            <form onSubmit={ver} className="mt-6 flex flex-col sm:flex-row gap-2 max-w-md">
              <div className="relative flex-1">
                <KeyRound className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={clave} onChange={(e) => setClave(e.target.value.toUpperCase())} placeholder="ABCD-2345" maxLength={12}
                  autoComplete="off" autoCapitalize="characters" spellCheck={false}
                  className="w-full h-12 rounded-xl border border-gray-300 bg-white pl-9 pr-3 font-mono text-lg tracking-widest uppercase focus:outline-none focus:ring-2" />
              </div>
              <button type="submit" disabled={buscando} className="h-12 rounded-xl px-6 text-sm font-bold text-white inline-flex items-center justify-center gap-2" style={{ background: color }}>
                {buscando && <Loader2 className="w-4 h-4 animate-spin" />} Ver notas
              </button>
            </form>
            {aviso && <p className="mt-3 text-sm text-red-600">{aviso}</p>}
          </>
        ) : (
          <div className="mt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-gray-900">{datos.estudiante}</p>
                <p className="text-sm text-gray-500">{datos.curso}{datos.seccion ? ` · Sección ${datos.seccion}` : ''} · Año escolar {datos.anio}</p>
              </div>
              <button type="button" onClick={salir} className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100">
                <LogOut className="w-3.5 h-3.5" /> Salir
              </button>
            </div>
            {!pub.size ? (
              <div className="mt-6 rounded-2xl border-2 border-dashed py-12 text-center text-gray-400">Todavía no se han publicado notas este año.</div>
            ) : !datos.asignaturas.length ? (
              <div className="mt-6 rounded-2xl border-2 border-dashed py-12 text-center text-gray-400">Este curso no lleva notas numéricas.</div>
            ) : (
              <>
                <p className="mt-3 text-xs text-gray-500">
                  Publicado: {[...pub].map((p) => `P${p}`).join(', ')}. {completos ? 'Año completo.' : 'La calificación final sale cuando se publiquen los 4 períodos.'}
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {datos.asignaturas.map((a) => {
                    const final = completos ? finalArea(a.notas) : null;
                    return (
                      <div key={a.nombre} className="rounded-2xl border bg-white p-4">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-bold text-gray-900">{a.nombre}</h3>
                          {completos && (
                            <span className={`rounded-full px-3 py-1 text-xs font-bold ${final === null ? 'bg-gray-100 text-gray-500' : final < 65 ? 'bg-red-100 text-red-700' : 'text-white'}`}
                              style={final !== null && final >= 65 ? { background: color } : undefined}>
                              Final: {final ?? '—'}
                            </span>
                          )}
                        </div>
                        <table className="mt-3 w-full text-sm">
                          <thead>
                            <tr className="text-[11px] uppercase text-gray-400">
                              <th className="text-left font-semibold py-1">Competencia</th>
                              {PERIODOS.map((p) => <th key={p} className="font-semibold w-10 text-center">P{p}</th>)}
                              {completos && <th className="font-semibold w-10 text-center">C</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {COMPETENCIAS.map((c) => {
                              const fc = completos ? finalCompetencia(a.notas, c.n) : null;
                              return (
                                <tr key={c.n} className="border-t">
                                  <td className="py-1.5 pr-2 text-gray-600 text-xs">{c.corto}</td>
                                  {PERIODOS.map((p) => {
                                    const v = pub.has(p) ? a.notas?.[`${c.n}-${p}`] : null;
                                    return <td key={p} className={`text-center ${tono(v)}`}>{pub.has(p) ? celda(v) : ''}</td>;
                                  })}
                                  {completos && <td className={`text-center ${tono(fc)}`}>{celda(fc)}</td>}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {completos && a.recuperacion !== null && a.recuperacion !== undefined && (
                          <p className="mt-2 text-xs text-gray-600">Recuperación final: <b className={tono(a.recuperacion)}>{celda(a.recuperacion)}</b></p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
