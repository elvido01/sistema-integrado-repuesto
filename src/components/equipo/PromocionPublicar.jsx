// ════════════════════════════════════════════════════════════════════════
//  PROMOCIÓN — de la pieza a los seis destinos, con una sola hora
// ════════════════════════════════════════════════════════════════════════
//  Es el PASO 3 del camino del dueño (28/09/2026), que es lineal:
//
//    1 elijo el producto → 2 apruebo o corrijo la imagen
//    → 3 publico ahora o programo → 4 historial con sus números
//
//  Antes este formulario tenía cuatro botones (Crear borrador, Confirmar
//  existencia, Aprobar, Programar): cuatro permisos para una sola decisión.
//  Quedan dos, "Publicar ahora" y "Programar", y cada uno da solo los pasos
//  de antes, en el mismo orden y con las mismas reglas de la base.
//
//  Dos cosas que no se negocian, y que por eso están dentro y no en un
//  documento que nadie lee:
//
//   · La existencia se confirma mirando el estante. La cifra del sistema se
//     enseña como referencia y nada más: promocionar algo que no hay es peor
//     que no promocionar. Sin marcar "fui al estante", los dos botones están
//     apagados (y la base, además, no deja aprobar sin eso).
//
//   · El precio va en el TEXTO de cada red, no encima del arte. El aviso
//     aparece mientras se escribe, y la base lo vuelve a comprobar al crear.
//
//  La hora se escribe en hora de Santo Domingo y se manda con su huso pegado
//  (-04:00, que aquí no hay horario de verano), no en la hora del navegador:
//  si alguien programa desde una laptop con el reloj en otro país, la
//  promoción saldría a deshora.
// ════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Search, Upload, CheckCircle2, AlertTriangle, Clock, RotateCcw, Ban, Film } from 'lucide-react';
import { videoDesdeImagen, formatoDeVideo } from '@/lib/videoDesdeImagen';

const REDES = [
  { platform: 'facebook', placement: 'feed', nombre: 'Facebook · feed', media: 'imagen_feed' },
  { platform: 'facebook', placement: 'story', nombre: 'Facebook · historia', media: 'imagen_historia' },
  { platform: 'instagram', placement: 'feed', nombre: 'Instagram · feed', media: 'imagen_feed' },
  { platform: 'instagram', placement: 'story', nombre: 'Instagram · historia', media: 'imagen_historia' },
  { platform: 'tiktok', placement: 'reel', nombre: 'TikTok · video', media: 'video' },
  { platform: 'youtube', placement: 'short', nombre: 'YouTube · Short', media: 'video' },
];

const COLOR_ESTADO = {
  PUBLICADO: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  PARCIAL: 'bg-amber-100 text-amber-800 border-amber-300',
  PUBLICANDO: 'bg-blue-100 text-blue-800 border-blue-300',
  PROGRAMADO: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  APROBADO: 'bg-slate-100 text-slate-700 border-slate-300',
  BORRADOR: 'bg-slate-100 text-slate-600 border-slate-300',
  FALLO: 'bg-red-100 text-red-800 border-red-300',
  'SIN CONFIRMAR': 'bg-amber-100 text-amber-800 border-amber-300',
  'SIN AUTORIZAR': 'bg-zinc-200 text-zinc-700 border-zinc-400',
};

const rd = (n) => `RD$ ${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Los números de un destino publicado, tal como los trae Metricool. Cada red
// da campos distintos (Facebook impresiones, Instagram vistas): se enseña lo
// que haya y nada más, sin rellenar con ceros lo que la red no mide.
const METRICAS = [
  ['vistas', 'vistas'], ['alcance', 'alcance'], ['impresiones', 'impresiones'],
  ['me_gusta', 'me gusta'], ['comentarios', 'coment.'], ['compartidos', 'compart.'],
  ['guardados', 'guard.'], ['clics', 'clics'],
];
const num = (n) => Number(n || 0).toLocaleString('es-DO');

/** El precio, tal como hay que poder encontrarlo dentro del texto. */
const precioEnTexto = (texto, precio) => {
  if (!precio) return true;
  const entero = String(Math.trunc(Number(precio)));
  return String(texto || '').replace(/,/g, '').includes(entero);
};

export default function PromocionPublicar({ prefill = null }) {
  const { toast } = useToast();

  const [redesEstado, setRedesEstado] = useState([]);
  const [promos, setPromos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [verAnteriores, setVerAnteriores] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [producto, setProducto] = useState(null);
  const [precio, setPrecio] = useState('');
  const [existenciaOk, setExistenciaOk] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [textos, setTextos] = useState({ facebook: '', instagram: '', tiktok: '', youtube: '' });
  const [media, setMedia] = useState({ imagen_feed: '', imagen_historia: '', video: '' });
  const [subiendo, setSubiendo] = useState('');
  const [elegidos, setElegidos] = useState(() => REDES.map((r) => `${r.platform}:${r.placement}`));
  const [cuando, setCuando] = useState('');
  const [bundle, setBundle] = useState(null);
  const [creandoVideo, setCreandoVideo] = useState(false);

  // >>> EL VIDEO VERTICAL, CON LA IMAGEN DE LA HISTORIA <<<
  // TikTok y YouTube Shorts piden video y el creativo entrega imágenes. El
  // dueño pidió usar la misma imagen vertical: se graba un video de 8 s con
  // ella (con un acercamiento lento) y se sube igual que lo demás.
  const crearVideo = useCallback(async (urlHistoria) => {
    if (!urlHistoria) return;
    setCreandoVideo(true);
    try {
      const { blob, mime, ext } = await videoDesdeImagen(urlHistoria);
      const ruta = `promos/${Date.now()}-${Math.random().toString(36).slice(2)}-vertical.${ext}`;
      const { error } = await supabase.storage.from('ai-marketing').upload(ruta, blob, { contentType: mime });
      if (error) throw error;
      const { data } = supabase.storage.from('ai-marketing').getPublicUrl(ruta);
      setMedia((m) => ({ ...m, video: data.publicUrl }));
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo crear el video', description: e.message, duration: 10000 });
    } finally {
      setCreandoVideo(false);
    }
  }, [toast]);

  // >>> LO QUE LLEGA DE LA PIEZA ACEPTADA <<<
  // Cuando el dueño acepta el arte del Comercial-Creativo arriba, el formulario
  // se llena con la pieza, su precio, el título, las dos imágenes y el texto
  // de Facebook e Instagram. Lo que falte —el video, los textos de TikTok y
  // YouTube— lo pone él.
  //
  // Lo que NUNCA se llena solo: "fui al estante y la pieza está". La cifra del
  // sistema no prueba nada, y aceptar una imagen tampoco.
  useEffect(() => {
    if (!prefill) return;
    if (prefill.producto) {
      setProducto(prefill.producto);
      setPrecio(String(prefill.producto.precio ?? ''));
      setBusqueda(prefill.producto.codigo || '');
      setResultados([]);
    }
    setExistenciaOk(false);
    if (prefill.titulo) setTitulo(prefill.titulo);
    if (prefill.media) setMedia((m) => ({ ...m, ...prefill.media }));
    if (prefill.textos) {
      setTextos((t) => {
        const nuevos = { ...t };
        Object.entries(prefill.textos).forEach(([red, txt]) => { if (txt) nuevos[red] = txt; });
        // TikTok y YouTube: el creativo solo escribe para Facebook e
        // Instagram. Se les pone el de Instagram, que es el que más se les
        // parece; el dueño lo cambia si quiere. Solo si están vacíos.
        const base = nuevos.instagram || nuevos.facebook || '';
        ['tiktok', 'youtube'].forEach((red) => { if (!nuevos[red] && base) nuevos[red] = base; });
        return nuevos;
      });
    }
    // Es una promoción nueva: la anterior, si había, no se toca.
    setBundle(null);
    setCuando('');
    // Con la historia en la mano, el video vertical sale solo.
    if (prefill.media?.imagen_historia && !prefill.media?.video && formatoDeVideo()) {
      setMedia((m) => ({ ...m, video: '' }));
      crearVideo(prefill.media.imagen_historia);
    }
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  const habilitada = useMemo(() => {
    const m = {};
    redesEstado.forEach((r) => { m[r.platform] = r.publicacion_habilitada; });
    return m;
  }, [redesEstado]);

  const cargar = useCallback(async () => {
    const [{ data: cuentas }, { data: panel }] = await Promise.all([
      supabase.from('social_accounts').select('platform, account_name, publicacion_habilitada, verificado_at, verificacion_detalle'),
      supabase.rpc('promo_panel', { p_limite: verAnteriores ? 25 : 3 }),
    ]);
    setRedesEstado(cuentas || []);
    setPromos(Array.isArray(panel) ? panel : []);
    setCargando(false);
  }, [verAnteriores]);

  useEffect(() => { cargar(); }, [cargar]);

  const buscar = async () => {
    if (!busqueda.trim()) return;
    const { data } = await supabase.rpc('get_productos_paginados', {
      p_limit: 8, p_offset: 0, p_search_term: busqueda.trim(),
      p_marca_filter: null, p_modelo_filter: null, p_include_zero_stock: true, p_tipo_filter: null,
    });
    setResultados(data || []);
  };

  const elegirProducto = (p) => {
    setProducto(p);
    setResultados([]);
    setPrecio(String(p.precio ?? ''));
    setExistenciaOk(false);
    if (!titulo) setTitulo(p.descripcion || '');
  };

  const subir = async (campo, file) => {
    if (!file) return;
    setSubiendo(campo);
    try {
      const ext = file.name.split('.').pop();
      const ruta = `promos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('ai-marketing').upload(ruta, file);
      if (error) throw error;
      // Meta descarga la imagen ELLA MISMA: la URL tiene que ser pública y
      // alcanzable desde fuera, no una firmada que caduca.
      const { data } = supabase.storage.from('ai-marketing').getPublicUrl(ruta);
      setMedia((m) => ({ ...m, [campo]: data.publicUrl }));
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo subir', description: e.message });
    } finally {
      setSubiendo('');
    }
  };

  const destinos = useMemo(
    () => REDES.filter((r) => elegidos.includes(`${r.platform}:${r.placement}`))
      .map((r) => ({ platform: r.platform, placement: r.placement })),
    [elegidos],
  );

  const plataformasElegidas = useMemo(() => [...new Set(destinos.map((d) => d.platform))], [destinos]);

  const problemas = useMemo(() => {
    const p = [];
    // El estante primero: es lo único que ninguna máquina puede comprobar.
    if (!producto) p.push('Falta elegir la pieza.');
    else if (!existenciaOk) p.push('Falta marcar "Fui al estante y la pieza está".');
    if (!titulo.trim()) p.push('Falta el título.');
    if (!destinos.length) p.push('No hay ni un destino elegido.');
    plataformasElegidas.forEach((plat) => {
      if (!textos[plat]?.trim()) p.push(`Falta el texto de ${plat}.`);
      else if (!precioEnTexto(textos[plat], precio)) p.push(`El texto de ${plat} no dice el precio.`);
    });
    if (destinos.some((d) => d.placement === 'feed') && !media.imagen_feed) p.push('Falta la imagen del feed.');
    if (destinos.some((d) => d.placement === 'story') && !media.imagen_historia) p.push('Falta la imagen de la historia.');
    if (destinos.some((d) => ['reel', 'short'].includes(d.placement)) && !media.video) p.push('Falta el video vertical.');
    return p;
  }, [producto, existenciaOk, titulo, destinos, plataformasElegidas, textos, precio, media]);

  const limpiar = () => {
    setBundle(null); setProducto(null); setTitulo(''); setBusqueda('');
    setTextos({ facebook: '', instagram: '', tiktok: '', youtube: '' });
    setMedia({ imagen_feed: '', imagen_historia: '', video: '' });
    setExistenciaOk(false); setCuando('');
  };

  // >>> UN CLIC, LOS PASOS DE SIEMPRE <<<
  // Crear → confirmar existencia → aprobar → publicar ahora | programar.
  // Son las mismas funciones de la base que antes tenían un botón cada una;
  // sus reglas no se tocan. Si algo falla a mitad, lo ya creado se conserva
  // (`bundle`) y el siguiente clic sigue desde ahí: confirmar y aprobar se
  // pueden repetir sin efecto, y crear no se repite.
  //
  // "Publicar ahora" no manda la hora desde aquí: la pone el servidor
  // (promo_publicar_ahora, un minuto de SU reloj). Con el de la PC atrasado,
  // "dentro de un minuto" llegaría como pasado y la base lo rechazaría.
  const lanzar = async (modo) => {
    if (trabajando || problemas.length > 0) return;
    if (modo === 'programar' && !cuando) return;
    setTrabajando(true);
    try {
      let id = bundle;
      if (!id) {
        const { data, error } = await supabase.rpc('promo_crear', {
          p_titulo: titulo.trim(),
          p_producto_id: producto?.id || null,
          p_precio: Number(precio) || null,
          p_textos: textos,
          p_media: media,
          p_destinos: destinos,
          p_idempotency_key: null,
          p_design_id: null,
        });
        if (error) throw error;
        id = data.bundle_id;
        setBundle(id);
      }
      const pasos = [
        ['promo_confirmar_existencia', { p_bundle_id: id }],
        ['promo_aprobar', { p_bundle_id: id }],
        modo === 'ahora'
          ? ['promo_publicar_ahora', { p_bundle_id: id }]
          // Hora de Santo Domingo, con su huso pegado. Aquí no hay horario de verano.
          : ['promo_programar', { p_bundle_id: id, p_cuando: new Date(`${cuando}:00-04:00`).toISOString() }],
      ];
      let res = null;
      for (const [rpc, args] of pasos) {
        const { data, error } = await supabase.rpc(rpc, args);
        if (error) throw error;
        res = data;
      }
      const bloqueados = Number(res?.sin_autorizar || 0);
      toast({
        title: modo === 'ahora'
          ? 'Sale en un minuto'
          : `Programada para el ${new Date(res?.cuando).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}`,
        description: bloqueados
          ? `${bloqueados} destino(s) sin autorizar no salen. Lo demás, míralo abajo en el historial.`
          : 'Míralo abajo, en el historial.',
      });
      limpiar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo', description: e.message, duration: 10000 });
    } finally {
      setTrabajando(false);
      cargar();
    }
  };

  const paso = async (rpc, args, ok) => {
    setTrabajando(true);
    try {
      const { data, error } = await supabase.rpc(rpc, args);
      if (error) throw error;
      toast({ title: ok, description: typeof data === 'object' ? JSON.stringify(data) : undefined });
      cargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo', description: e.message, duration: 10000 });
    } finally { setTrabajando(false); }
  };


  return (
    <section id="publicar-promocion" className="mb-4 rounded-xl border bg-white p-4 shadow-sm" aria-label="Publicar una promoción">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Paso 3 · Publica ahora o prográmala</h2>
          <p className="text-xs text-slate-500">
            Con la imagen aprobada arriba esto ya viene lleno: revisa, marca el estante y elige cuándo sale.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {redesEstado.map((r) => (
            <span key={r.platform}
              title={r.verificacion_detalle || 'sin comprobar'}
              className={`rounded border px-2 py-0.5 text-[10px] font-bold ${r.publicacion_habilitada
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-red-300 bg-red-50 text-red-700'}`}>
              {r.platform}: {r.publicacion_habilitada ? 'puede publicar' : 'sin autorizar'}
            </span>
          ))}
        </div>
      </div>

      {!cargando && !redesEstado.some((r) => r.publicacion_habilitada) && (
        <div className="mb-3 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Ahora mismo <b>ninguna red puede publicar</b>. Se puede dejar la promoción preparada y aprobada, pero sus
            destinos van a quedar <b>sin autorizar</b> hasta reconectar las cuentas. Para volver a comprobarlo:
            <code className="mx-1 rounded bg-amber-100 px-1">node scripts/social-estado.mjs</code>
          </span>
        </div>
      )}

      {/* ── La pieza ── */}
      <div className="mb-3 rounded border border-slate-200 p-3">
        <div className="mb-2 text-xs font-bold text-slate-700">La pieza</div>
        <div className="flex flex-wrap gap-2">
          <input className="min-w-[220px] flex-1 rounded border px-2 py-1 text-xs" placeholder="Código o descripción"
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }} />
          <Button variant="outline" size="sm" onClick={buscar}><Search className="mr-1 h-3 w-3" /> Buscar</Button>
        </div>
        {resultados.length > 0 && (
          <div className="mt-2 max-h-40 overflow-y-auto rounded border">
            {resultados.map((p) => (
              <button key={p.id} type="button" onClick={() => elegirProducto(p)}
                className="block w-full border-b px-2 py-1 text-left text-xs hover:bg-blue-50">
                <b>{p.codigo}</b> — {p.descripcion} · {rd(p.precio)} · el sistema dice {p.existencia ?? 0}
              </button>
            ))}
          </div>
        )}
        {producto && (
          <div className="mt-2 rounded bg-slate-50 p-2 text-xs">
            <div className="font-bold text-slate-800">{producto.codigo} — {producto.descripcion}</div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1">
                Precio a promocionar:
                <input className="w-28 rounded border px-2 py-0.5 text-xs" value={precio}
                  onChange={(e) => setPrecio(e.target.value)} />
              </label>
              <span className="text-slate-500">el sistema dice que hay <b>{producto.existencia ?? 0}</b></span>
            </div>
            <label className="mt-2 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2">
              <input type="checkbox" className="mt-0.5" checked={existenciaOk}
                onChange={(e) => setExistenciaOk(e.target.checked)} />
              <span className="text-amber-900">
                <b>Fui al estante y la pieza está.</b> La cifra de arriba es del sistema y no prueba nada:
                puede estar vendida, prestada o mal contada.
              </span>
            </label>
          </div>
        )}
      </div>

      {/* ── Arte y textos ── */}
      <div className="mb-3 rounded border border-slate-200 p-3">
        <div className="mb-2 text-xs font-bold text-slate-700">Arte y texto</div>
        <input className="mb-2 w-full rounded border px-2 py-1 text-xs" placeholder="Título interno de la promoción"
          value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <div className="mb-2 grid gap-2 md:grid-cols-3">
          {[['imagen_feed', 'Imagen del feed'], ['imagen_historia', 'Imagen de la historia'], ['video', 'Video vertical']].map(([campo, etiqueta]) => (
            <label key={campo} className="cursor-pointer rounded border border-dashed p-2 text-center text-[11px] hover:bg-slate-50">
              <input type="file" className="hidden" accept={campo === 'video' ? 'video/*' : 'image/*'}
                onChange={(e) => subir(campo, e.target.files?.[0])} />
              {subiendo === campo || (campo === 'video' && creandoVideo)
                ? (
                  <span className="text-violet-700">
                    <Loader2 className="mx-auto mb-1 h-4 w-4 animate-spin" />
                    {campo === 'video' && creandoVideo ? 'Creando el video (8 s)…' : 'Subiendo…'}
                  </span>
                )
                : media[campo]
                  ? <span className="font-bold text-emerald-700"><CheckCircle2 className="mx-auto mb-1 h-4 w-4" />{etiqueta} ✓</span>
                  : <span className="text-slate-500"><Upload className="mx-auto mb-1 h-4 w-4" />{etiqueta}</span>}
            </label>
          ))}
        </div>
        {/* El video también se puede hacer a mano con la historia, o volver a
            hacer, sin tener que subir nada. */}
        {media.imagen_historia && !creandoVideo && formatoDeVideo() && (
          <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px]">
            <button type="button" onClick={() => crearVideo(media.imagen_historia)}
              className="flex items-center gap-1 rounded border border-violet-300 bg-violet-50 px-2 py-1 font-semibold text-violet-700 hover:bg-violet-100">
              <Film className="h-3.5 w-3.5" />
              {media.video ? 'Rehacer el video con la imagen de la historia' : 'Crear el video con la imagen de la historia'}
            </button>
            {media.video && (
              <a href={media.video} target="_blank" rel="noreferrer" className="text-blue-600 underline">ver el video</a>
            )}
            <span className="text-slate-400">Para TikTok y YouTube Short, mientras no haya video de verdad.</span>
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          {['facebook', 'instagram', 'tiktok', 'youtube'].map((plat) => (
            <div key={plat}>
              <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-600">
                <span>Texto de {plat}</span>
                {textos[plat] && !precioEnTexto(textos[plat], precio) && (
                  <span className="text-red-600">no dice el precio</span>
                )}
                {/* El creativo escribe para Facebook e Instagram, no para
                    TikTok ni YouTube: con un clic se trae el de Instagram. */}
                {!textos[plat] && ['tiktok', 'youtube'].includes(plat) && (textos.instagram || textos.facebook) && (
                  <button type="button"
                    onClick={() => setTextos((t) => ({ ...t, [plat]: t.instagram || t.facebook }))}
                    className="font-semibold text-violet-600 hover:underline">
                    usar el de {textos.instagram ? 'Instagram' : 'Facebook'}
                  </button>
                )}
              </div>
              <textarea rows={3} className="w-full rounded border px-2 py-1 text-xs"
                value={textos[plat]} onChange={(e) => setTextos((t) => ({ ...t, [plat]: e.target.value }))}
                placeholder={precio ? `…incluí el precio: ${rd(precio)}` : 'Texto para esta red'} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Destinos y hora ── */}
      <div className="mb-3 rounded border border-slate-200 p-3">
        <div className="mb-2 text-xs font-bold text-slate-700">Destinos y hora</div>
        <div className="mb-2 flex flex-wrap gap-2">
          {REDES.map((r) => {
            const clave = `${r.platform}:${r.placement}`;
            const bloqueada = habilitada[r.platform] === false;
            return (
              <label key={clave}
                className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${bloqueada ? 'border-zinc-300 bg-zinc-100 text-zinc-500' : 'border-slate-300'}`}>
                <input type="checkbox" checked={elegidos.includes(clave)}
                  onChange={(e) => setElegidos((xs) => (e.target.checked ? [...xs, clave] : xs.filter((x) => x !== clave)))} />
                {r.nombre}
                {bloqueada && <Ban className="h-3 w-3" title="Esta red no puede publicar todavía" />}
              </label>
            );
          })}
        </div>
        <label className="flex flex-wrap items-center gap-2 text-xs">
          <Clock className="h-4 w-4 text-slate-500" />
          Hora (Santo Domingo):
          <input type="datetime-local" className="rounded border px-2 py-1 text-xs"
            value={cuando} onChange={(e) => setCuando(e.target.value)} />
        </label>
      </div>

      {problemas.length > 0 && (
        <ul className="mb-2 list-disc rounded border border-amber-300 bg-amber-50 px-6 py-2 text-[11px] text-amber-900">
          {problemas.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      {/* Dos botones, una decisión: cuándo sale. Programar pide la hora de
          arriba; publicar ahora no la mira. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={trabajando || problemas.length > 0} onClick={() => lanzar('ahora')}
          className="bg-emerald-600 text-white hover:bg-emerald-700">
          {trabajando ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
          Publicar ahora
        </Button>
        <Button size="sm" variant="outline" disabled={trabajando || problemas.length > 0 || !cuando}
          title={!cuando ? 'Pon la hora en "Destinos y hora"' : undefined}
          onClick={() => lanzar('programar')}>
          <Clock className="mr-1 h-3.5 w-3.5" />
          {cuando ? 'Programar' : 'Programar (pon la hora)'}
        </Button>
        {bundle && (
          <span className="text-[11px] text-slate-500">
            Ya se creó y un paso falló: al pulsar otra vez sigue desde ahí.
            {' '}Si cambiaste algo arriba,{' '}
            <button type="button" className="underline" onClick={limpiar}>empieza otra</button>.
          </span>
        )}
      </div>

      {/* ── Paso 4: el historial, con lo que pasó de verdad ── */}
      <h3 className="mb-1 text-xs font-bold text-slate-700">Paso 4 · Historial y resultados</h3>
      <p className="mb-2 text-[10px] text-slate-500">
        Los números los trae Metricool cuando pasa por las cuentas; no son al instante. Las historias no traen números.
      </p>
      {promos.length === 0 && <p className="text-xs text-slate-500">Todavía no hay ninguna.</p>}
      <div className="space-y-2">
        {promos.map((p) => {
          // El total de la promoción: lo que se sabe, sumado. Las redes que
          // no dan un campo no suman cero, simplemente no cuentan.
          const medidos = (p.destinos || []).filter((d) => d.metricas);
          const alcance = medidos.reduce((s, d) => s + Number(d.metricas.alcance || 0), 0);
          const vistas = medidos.reduce((s, d) => s + Number(d.metricas.vistas || 0), 0);
          return (
            <div key={p.bundle_id} className="rounded border border-slate-200 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-800">{p.titulo}</div>
                <span className="flex items-center gap-2">
                  {medidos.length > 0 && (
                    <span className="text-[10px] font-semibold text-violet-700">
                      {alcance > 0 && `alcance ${num(alcance)}`}
                      {alcance > 0 && vistas > 0 && ' · '}
                      {vistas > 0 && `${num(vistas)} vistas`}
                    </span>
                  )}
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${COLOR_ESTADO[p.estado] || ''}`}>{p.estado}</span>
                </span>
              </div>
              <div className="text-[10px] text-slate-500">
                {p.precio ? `${rd(p.precio)} · ` : ''}
                {p.programada ? `programada ${new Date(p.programada).toLocaleString('es-DO')}` : 'sin programar'}
                {p.existencia_confirmada ? ' · existencia confirmada' : ' · SIN confirmar existencia'}
              </div>
              <div className="mt-1 grid gap-1 md:grid-cols-2">
                {(p.destinos || []).map((d) => (
                  <div key={d.id} className="rounded bg-slate-50 px-2 py-1 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">{d.platform} · {d.placement}</span>
                      <span className="flex items-center gap-2">
                        {d.external_url && (
                          <a href={d.external_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">ver</a>
                        )}
                        {d.estado === 'FALLO' && (
                          <button type="button" className="text-amber-700 underline"
                            onClick={() => paso('promo_reintentar', { p_bundle_id: p.bundle_id, p_target_id: d.id }, 'Reintentando')}>
                            <RotateCcw className="inline h-3 w-3" /> reintentar
                          </button>
                        )}
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${COLOR_ESTADO[d.estado] || ''}`}
                          title={d.bloqueo_motivo || d.error || ''}>
                          {d.estado}
                        </span>
                      </span>
                    </div>
                    {d.estado === 'PUBLICADO' && (
                      d.metricas ? (
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-slate-600"
                          title={`Medido el ${new Date(d.metricas.medido_en).toLocaleString('es-DO')}`}>
                          {METRICAS.filter(([k]) => d.metricas[k] !== null && d.metricas[k] !== undefined)
                            .map(([k, etiqueta]) => (
                              <span key={k}><b className="text-slate-800">{num(d.metricas[k])}</b> {etiqueta}</span>
                            ))}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {d.placement === 'story' ? 'Las historias no traen números.' : 'Todavía sin medir.'}
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {promos.length >= 3 && (
        <button type="button" className="mt-2 text-[11px] text-blue-700 underline" onClick={() => setVerAnteriores((v) => !v)}>
          {verAnteriores ? 'ver solo las 3 últimas' : 'ver anteriores'}
        </button>
      )}
    </section>
  );
}
