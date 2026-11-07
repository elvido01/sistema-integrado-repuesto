// =====================================================================
// Página Web del Colegio — configuración (07/11/2026, plan EDUCA TOTAL)
// ---------------------------------------------------------------------
// La dirección llena lo que sale en la página pública: presentación,
// portada, requisitos de inscripción, contacto y color. La dirección de la
// página es motoflow.com.do/sitio/<slug>; el dominio propio (si lo tiene)
// solo lo pone el super admin, después de conectarlo en Cloudflare.
// Espacio: 10 GB por colegio; al cerrar el año se borran las tareas viejas.
// SQL: sql/centros_educativos_pagina_web.sql
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Globe, Loader2, Save, ExternalLink, Copy, Image as ImageIcon, Trash2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  BUCKET_TAREAS, TIPOS_ARCHIVO, MAX_ARCHIVO, extension, formatoBytes, slugDe, limpiarDominio,
} from '@/lib/colegioSitio';

const campo = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const etiqueta = 'block text-xs font-bold text-gray-600 uppercase mb-1';
const CAMPOS = ['slug', 'dominio', 'publicada', 'lema', 'presentacion', 'inscripciones_abiertas', 'requisitos', 'inscripcion_nota',
  'direccion', 'telefono', 'whatsapp', 'correo', 'horario', 'facebook', 'instagram', 'color'];

function Tarjeta({ titulo, children, ayuda }) {
  return (
    <section className="bg-white rounded-xl border p-5 space-y-4">
      <div>
        <h2 className="font-bold text-gray-900">{titulo}</h2>
        {ayuda && <p className="text-xs text-gray-500 mt-0.5">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

export default function SitioColegioPage() {
  const { tenantId, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [sitio, setSitio] = useState(null);
  const [form, setForm] = useState({});
  const [empresa, setEmpresa] = useState(null);
  const [espacio, setEspacio] = useState(null);
  const [anioId, setAnioId] = useState(null);
  const [slugNuevo, setSlugNuevo] = useState('');
  const [ocupado, setOcupado] = useState('');

  const error = useCallback((t, e) => toast({ title: t, description: e ? String(e.message || e) : undefined, variant: 'destructive' }), [toast]);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    try {
      const [si, em, es, an] = await Promise.all([
        supabase.from('edu_sitio').select('*').eq('tenant_id', tenantId).maybeSingle(),
        supabase.from('config_empresa').select('nombre, slogan, direccion1, direccion2, telefono, email')
          .eq('tenant_id', tenantId).order('updated_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
        supabase.rpc('edu_sitio_espacio'),
        supabase.from('edu_anios').select('id').eq('tenant_id', tenantId).eq('actual', true).maybeSingle(),
      ]);
      if (si.error) throw si.error;
      setSitio(si.data || null);
      setForm(si.data || {});
      setEmpresa(em.data || null);
      setEspacio(es.data || null);
      setAnioId(an.data?.id || null);
      if (!si.data) setSlugNuevo(slugDe(em.data?.nombre || ''));
    } catch (e) {
      error('No se pudo cargar la página web', e);
    } finally {
      setCargando(false);
    }
  }, [tenantId, error]);
  useEffect(() => { cargar(); }, [cargar]);

  const poner = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const urlPagina = sitio ? `${window.location.origin}/sitio/${sitio.slug}` : '';

  const crear = async () => {
    const slug = slugDe(slugNuevo);
    if (slug.length < 3) { error('La dirección de la página necesita al menos 3 letras'); return; }
    setOcupado('crear');
    try {
      const e = empresa || {};
      const { data, error: err } = await supabase.from('edu_sitio').insert({
        tenant_id: tenantId, slug, lema: e.slogan || null,
        direccion: [e.direccion1, e.direccion2].filter(Boolean).join(', ') || null,
        telefono: e.telefono || null, whatsapp: e.telefono || null, correo: e.email || null,
        requisitos: 'Acta de nacimiento (original y copia)\nDos fotos 2x2\nCopia de la cédula del padre, madre o tutor\nRécord de notas del año anterior\nCertificado médico y tarjeta de vacunas',
      }).select().single();
      if (err) throw err.code === '23505' ? new Error('Esa dirección ya la usa otro colegio. Pruebe otra.') : err;
      setSitio(data); setForm(data);
      toast({ title: 'Página creada', description: 'Llene los datos y guarde.' });
    } catch (e) {
      error('No se pudo crear la página', e);
    } finally {
      setOcupado('');
    }
  };

  const guardar = async () => {
    const cambios = {};
    CAMPOS.forEach((k) => {
      let v = form[k];
      if (typeof v === 'string') v = v.trim() || null;
      if (k === 'slug') v = slugDe(v || '');
      if (k === 'dominio') v = limpiarDominio(v || '') || null;
      if (v !== (sitio[k] ?? null)) cambios[k] = v;
    });
    if (!isSuperAdmin) delete cambios.dominio;
    if (!Object.keys(cambios).length) { toast({ title: 'No hay cambios' }); return; }
    if ('slug' in cambios && (cambios.slug || '').length < 3) { error('La dirección de la página necesita al menos 3 letras'); return; }
    setOcupado('guardar');
    try {
      const { data, error: err } = await supabase.from('edu_sitio').update(cambios).eq('tenant_id', tenantId).select().single();
      if (err) throw err.code === '23505' ? new Error('Esa dirección o dominio ya lo usa otro colegio.') : err;
      setSitio(data); setForm(data);
      toast({ title: 'Página guardada', description: 'Los cambios ya salen en la página.' });
    } catch (e) {
      error('No se pudo guardar', e);
    } finally {
      setOcupado('');
    }
  };

  const subirPortada = async (file) => {
    if (!file) return;
    const ext = extension(file.name);
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) { error('La portada debe ser una foto JPG, PNG o WEBP'); return; }
    if (file.size > MAX_ARCHIVO) { error('La foto pesa más de 10 MB'); return; }
    setOcupado('portada');
    const path = `${tenantId}/sitio/portada-${Date.now()}.${ext}`;
    try {
      const { error: e1 } = await supabase.storage.from(BUCKET_TAREAS).upload(path, file, { contentType: TIPOS_ARCHIVO[ext], upsert: false });
      if (e1) throw e1;
      const { data, error: e2 } = await supabase.from('edu_sitio').update({ portada_path: path }).eq('tenant_id', tenantId).select().single();
      if (e2) { await supabase.storage.from(BUCKET_TAREAS).remove([path]); throw e2; }
      if (sitio.portada_path) await supabase.storage.from(BUCKET_TAREAS).remove([sitio.portada_path]);
      setSitio(data); setForm((f) => ({ ...f, portada_path: path }));
      toast({ title: 'Portada actualizada' });
      supabase.rpc('edu_sitio_espacio').then(({ data: es }) => es && setEspacio(es));
    } catch (e) {
      error('No se pudo subir la portada', e);
    } finally {
      setOcupado('');
    }
  };

  const quitarPortada = async () => {
    if (!sitio?.portada_path) return;
    setOcupado('portada');
    try {
      const { data, error: e } = await supabase.from('edu_sitio').update({ portada_path: null }).eq('tenant_id', tenantId).select().single();
      if (e) throw e;
      await supabase.storage.from(BUCKET_TAREAS).remove([sitio.portada_path]);
      setSitio(data); setForm((f) => ({ ...f, portada_path: null }));
    } catch (e) {
      error('No se pudo quitar la portada', e);
    } finally {
      setOcupado('');
    }
  };

  // Al cerrar el año: las tareas de años anteriores (y sus archivos) se borran.
  const borrarViejas = async () => {
    if (!anioId) { error('No hay año escolar actual'); return; }
    setOcupado('limpiar');
    try {
      const { data: viejas, error: e1 } = await supabase.from('edu_tareas').select('id, archivo_path')
        .eq('tenant_id', tenantId).neq('anio_id', anioId);
      if (e1) throw e1;
      if (!viejas?.length) { toast({ title: 'No hay tareas de años anteriores' }); return; }
      if (!window.confirm(`Se borrarán ${viejas.length} tareas de años anteriores con sus archivos. ¿Seguro?`)) return;
      const archivos = viejas.map((t) => t.archivo_path).filter(Boolean);
      for (let i = 0; i < archivos.length; i += 100) {
        const { error: e2 } = await supabase.storage.from(BUCKET_TAREAS).remove(archivos.slice(i, i + 100));
        if (e2) throw e2;
      }
      const ids = viejas.map((t) => t.id);
      let borradas = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error: e3 } = await supabase.from('edu_tareas').delete().in('id', ids.slice(i, i + 200)).select('id');
        if (e3) throw e3;
        borradas += data?.length || 0;
      }
      toast({ title: `${borradas} tareas borradas`, description: 'Se liberó el espacio.' });
      const { data: es } = await supabase.rpc('edu_sitio_espacio');
      if (es) setEspacio(es);
    } catch (e) {
      error('No se pudieron borrar las tareas viejas', e);
    } finally {
      setOcupado('');
    }
  };

  const copiar = (t) => { navigator.clipboard?.writeText(t).then(() => toast({ title: 'Enlace copiado' }), () => {}); };
  const portadaUrl = form.portada_path ? supabase.storage.from(BUCKET_TAREAS).getPublicUrl(form.portada_path).data.publicUrl : null;
  const pct = espacio ? Math.min(100, (Number(espacio.usado) / Number(espacio.tope)) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6">
      <Helmet><title>Página Web del Colegio</title></Helmet>
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Globe className="w-7 h-7 text-blue-700" />
            <div>
              <h1 className="text-xl font-black text-gray-900">Página Web del Colegio</h1>
              <p className="text-xs text-gray-500">Presentación, requisitos de inscripción, tareas y contacto</p>
            </div>
          </div>
          <div className="flex gap-2">
            {sitio && <Button size="sm" variant="outline" onClick={() => window.open(`/sitio/${sitio.slug}`, '_blank', 'noopener')}><ExternalLink className="w-4 h-4 mr-1" /> Ver página</Button>}
            <Button size="sm" variant="outline" onClick={cargar} disabled={cargando}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </div>

        {espacio && !espacio.plan_ok && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
            La página pública es del plan <b>Educa Total</b>. Mientras tanto solo la ve el personal del colegio (vista previa) y no se pueden subir archivos.
          </div>
        )}

        {cargando ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div>
          : !sitio ? (
            <Tarjeta titulo="Cree la página de su colegio" ayuda="Escoja la dirección. Después puede cambiarla.">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-500">{window.location.origin}/sitio/</span>
                <input className={`${campo} max-w-xs`} value={slugNuevo} onChange={(e) => setSlugNuevo(e.target.value)} placeholder="nombre-del-colegio" />
              </div>
              <Button onClick={crear} disabled={ocupado === 'crear'}>{ocupado === 'crear' ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Globe className="w-4 h-4 mr-1" />} Crear página</Button>
            </Tarjeta>
          ) : (
            <>
              <Tarjeta titulo="Dirección de la página">
                <div>
                  <label className={etiqueta}>Dirección en MotoFlow</label>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-gray-500">{window.location.origin}/sitio/</span>
                    <input className={`${campo} max-w-xs`} value={form.slug || ''} onChange={poner('slug')} />
                    <Button size="sm" variant="ghost" onClick={() => copiar(urlPagina)}><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>
                <div>
                  <label className={etiqueta}>Dominio propio</label>
                  {isSuperAdmin ? (
                    <>
                      <input className={`${campo} max-w-sm`} value={form.dominio || ''} onChange={poner('dominio')} placeholder="nuestrasenora.com" />
                      <p className="text-xs text-gray-500 mt-1">Antes de guardarlo, agréguelo como dominio personalizado del proyecto <b>motoflow</b> en Cloudflare Pages (con y sin www).</p>
                    </>
                  ) : sitio.dominio ? (
                    <a href={`https://${sitio.dominio}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700 hover:underline">{sitio.dominio}</a>
                  ) : (
                    <p className="text-sm text-gray-600">¿Tiene su propio dominio (ej. <i>nuestrocolegio.com</i>)? Escríbanos y lo conectamos sin costo. El sistema queda en <i>su-dominio/entrar</i>.</p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={!!form.publicada} onChange={poner('publicada')} /> Página encendida (si la apaga, solo la ve el personal)
                </label>
              </Tarjeta>

              <Tarjeta titulo="Presentación" ayuda="Lo primero que se ve: la foto de portada, el lema y quiénes son.">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="w-56 h-32 rounded-lg border bg-gray-100 overflow-hidden flex items-center justify-center">
                    {portadaUrl ? <img src={portadaUrl} alt="Portada" className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-gray-300" />}
                  </div>
                  <div className="space-y-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 text-sm font-semibold hover:bg-gray-50">
                      {ocupado === 'portada' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />} {portadaUrl ? 'Cambiar foto' : 'Subir foto de portada'}
                      <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" disabled={!!ocupado}
                        onChange={(e) => { subirPortada(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    {portadaUrl && <Button size="sm" variant="ghost" onClick={quitarPortada} disabled={!!ocupado}><Trash2 className="w-4 h-4 mr-1" /> Quitar</Button>}
                    <p className="text-xs text-gray-500">Una foto del colegio, horizontal.</p>
                  </div>
                </div>
                <div>
                  <label className={etiqueta}>Lema</label>
                  <input className={campo} value={form.lema || ''} onChange={poner('lema')} placeholder="Educando con amor y excelencia" />
                </div>
                <div>
                  <label className={etiqueta}>Sobre nosotros</label>
                  <textarea className={campo} rows={5} value={form.presentacion || ''} onChange={poner('presentacion')}
                    placeholder="Historia del colegio, niveles que ofrece, tandas, inglés, actividades…" />
                </div>
                <div className="flex items-center gap-3">
                  <label className={`${etiqueta} mb-0`}>Color de la página</label>
                  <input type="color" value={form.color || '#1d4ed8'} onChange={poner('color')} className="h-9 w-14 rounded border cursor-pointer" />
                </div>
              </Tarjeta>

              <Tarjeta titulo="Inscripción">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={!!form.inscripciones_abiertas} onChange={poner('inscripciones_abiertas')} /> Inscripciones abiertas
                </label>
                <div>
                  <label className={etiqueta}>Requisitos (uno por línea)</label>
                  <textarea className={campo} rows={7} value={form.requisitos || ''} onChange={poner('requisitos')} />
                </div>
                <div>
                  <label className={etiqueta}>Nota (fechas, horario de inscripción, costos)</label>
                  <textarea className={campo} rows={3} value={form.inscripcion_nota || ''} onChange={poner('inscripcion_nota')}
                    placeholder="Inscripciones de lunes a viernes, de 8:00 a 12:00 en la dirección." />
                </div>
              </Tarjeta>

              <Tarjeta titulo="Contacto">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><label className={etiqueta}>Dirección</label><input className={campo} value={form.direccion || ''} onChange={poner('direccion')} /></div>
                  <div><label className={etiqueta}>Teléfono</label><input className={campo} value={form.telefono || ''} onChange={poner('telefono')} /></div>
                  <div><label className={etiqueta}>WhatsApp</label><input className={campo} value={form.whatsapp || ''} onChange={poner('whatsapp')} placeholder="809-000-0000" /></div>
                  <div><label className={etiqueta}>Correo</label><input className={campo} value={form.correo || ''} onChange={poner('correo')} /></div>
                  <div><label className={etiqueta}>Horario</label><input className={campo} value={form.horario || ''} onChange={poner('horario')} placeholder="Lunes a viernes, 7:30 a 12:30" /></div>
                  <div><label className={etiqueta}>Facebook</label><input className={campo} value={form.facebook || ''} onChange={poner('facebook')} placeholder="facebook.com/sucolegio" /></div>
                  <div><label className={etiqueta}>Instagram</label><input className={campo} value={form.instagram || ''} onChange={poner('instagram')} placeholder="@sucolegio" /></div>
                </div>
              </Tarjeta>

              <div className="flex justify-end sticky bottom-0 py-3 bg-gray-50">
                <Button onClick={guardar} disabled={!!ocupado}>{ocupado === 'guardar' ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />} Guardar cambios</Button>
              </div>

              <Tarjeta titulo="Espacio para tareas" ayuda="10 GB por colegio. Archivos de hasta 10 MB; los videos van como enlace de YouTube.">
                {espacio && (
                  <div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${pct > 85 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} /></div>
                    <p className="text-xs text-gray-600 mt-1">{formatoBytes(espacio.usado)} de {formatoBytes(espacio.tope)} usados</p>
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={borrarViejas} disabled={!!ocupado}>
                  {ocupado === 'limpiar' ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />} Borrar tareas de años anteriores
                </Button>
              </Tarjeta>
            </>
          )}
      </div>
    </div>
  );
}
