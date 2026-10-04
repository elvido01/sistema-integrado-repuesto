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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { indicadoresRedes } from '@/lib/estadoRedesSociales';
import ConectarRedes from './ConectarRedes';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Search, Upload, CheckCircle2, AlertTriangle, Clock, RotateCcw, Ban, Film } from 'lucide-react';
import { videoDesdeImagen, formatoDeVideo } from '@/lib/videoDesdeImagen';

const REDES = [
  { platform: 'facebook', placement: 'feed', nombre: 'Facebook · feed', media: 'imagen_feed' },
  { platform: 'facebook', placement: 'story', nombre: 'Facebook · historia', media: 'imagen_historia' },
  { platform: 'instagram', placement: 'feed', nombre: 'Instagram · feed', media: 'imagen_feed' },
  { platform: 'instagram', placement: 'story', nombre: 'Instagram · historia', media: 'imagen_historia' },
  // (04/10/2026) El reel del Creativo también a Instagram: sale en Reels y en
  // el feed del perfil (share_to_feed). Mismo permiso de Meta que el feed.
  { platform: 'instagram', placement: 'reel', nombre: 'Instagram · reel', media: 'video' },
  { platform: 'tiktok', placement: 'reel', nombre: 'TikTok · video', media: 'video' },
  { platform: 'youtube', placement: 'short', nombre: 'YouTube · Short', media: 'video' },
  // A MANO: WhatsApp no tiene API para los Estados. No va al publicador: la
  // imagen baja sola a la carpeta de la PC (scripts/estados-whatsapp-pc.mjs),
  // el dueño la sube a su Estado y marca "Ya lo publiqué" en el historial.
  { platform: 'whatsapp', placement: 'estado', nombre: 'WhatsApp · estado (a mano)', media: 'imagen_historia', manual: true },
];
const ES_MANUAL = new Set(REDES.filter((r) => r.manual).map((r) => `${r.platform}:${r.placement}`));

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
  PRIVADO: 'bg-amber-100 text-amber-800 border-amber-300',
  'EN TU TIKTOK': 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300',
};

// Un color por estado de la cuenta (ver src/lib/estadoRedesSociales.js).
const COLOR_RED = {
  lista: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  pendiente: 'border-amber-300 bg-amber-50 text-amber-800',
  sin_conectar: 'border-zinc-300 bg-zinc-100 text-zinc-600',
  reconectar: 'border-red-300 bg-red-50 text-red-700',
};

const rd = (n) => `RD$${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Los números de un destino publicado, tal como los trae Metricool. Cada red
// da campos distintos (Facebook impresiones, Instagram vistas): se enseña lo
// que haya y nada más, sin rellenar con ceros lo que la red no mide.
const METRICAS = [
  ['vistas', 'vistas'], ['alcance', 'alcance'], ['impresiones', 'impresiones'],
  ['me_gusta', 'me gusta'], ['comentarios', 'coment.'], ['compartidos', 'compart.'],
  ['guardados', 'guard.'], ['clics', 'clics'],
];
const num = (n) => Number(n || 0).toLocaleString('es-DO');

// ¿Se movió el producto más de lo que se mueve solo? Vendidas desde que salió
// la promoción (7 días como mucho) contra el promedio de los 30 días previos
// en ese mismo tiempo. No dice quién vino por la promoción: eso no se sabe
// sin preguntarle al cajero, y no se le pregunta.
// Los comentarios de la promoción en Facebook e Instagram, con respuesta en
// público. Plegado por defecto: lo que importa a primera vista es cuántos
// esperan respuesta. Los que esperan salen primero y abiertos a responder.
function ComentariosDeLaPromocion({ bundleId, datos, onRespondido }) {
  const lista = datos?.comentarios || [];
  const pendientes = lista.filter((c) => !c.respondido);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState({});
  const [enviando, setEnviando] = useState(null);
  const [aviso, setAviso] = useState({});

  if (!lista.length && !(datos?.errores || []).length) return null;

  const responder = async (c) => {
    setEnviando(c.id);
    setAviso((a) => ({ ...a, [c.id]: null }));
    try {
      const { data, error } = await supabase.functions.invoke('promo-comentarios', {
        body: { accion: 'responder', bundle_id: bundleId, platform: c.platform, comment_id: c.id, texto: texto[c.id] || '' },
      });
      // Con status 422 supabase-js deja el cuerpo en error.context.
      const r = data || (await error?.context?.json?.().catch(() => null)) || {};
      if (r.ok) {
        setTexto((t) => ({ ...t, [c.id]: '' }));
        onRespondido?.();
      } else {
        setAviso((a) => ({ ...a, [c.id]: r }));
      }
    } finally {
      setEnviando(null);
    }
  };

  const ordenados = [...pendientes, ...lista.filter((c) => c.respondido)];
  return (
    <div className="mt-1 text-[11px]">
      <button type="button" onClick={() => setAbierto((v) => !v)}
        className={`font-semibold ${pendientes.length ? 'text-amber-700' : 'text-slate-600'}`}>
        💬 {lista.length} {lista.length === 1 ? 'comentario' : 'comentarios'}
        {pendientes.length > 0 && ` · ${pendientes.length} sin responder`} {abierto ? '▾' : '▸'}
      </button>
      {abierto && (
        <div className="mt-1 space-y-1.5">
          {(datos.errores || []).map((e) => <div key={e} className="text-red-600">No se pudo leer {e}</div>)}
          {ordenados.map((c) => (
            <div key={c.id} className={`rounded border px-2 py-1 ${c.respondido ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <b className="text-slate-700">{c.autor || 'Alguien'}</b>
                  <span className="text-slate-400"> · {c.platform} · {c.fecha ? new Date(c.fecha).toLocaleString('es-DO') : ''}</span>
                </span>
                {c.respondido && <span className="font-semibold text-emerald-700">respondido</span>}
              </div>
              <div className="text-slate-800">{c.texto}</div>
              {c.respuestas?.filter((x) => x.propia).map((x, i) => (
                <div key={i} className="ml-3 text-slate-500">↳ {x.texto}</div>
              ))}
              {!c.respondido && (
                <div className="mt-1 space-y-1">
                  <div className="flex gap-1">
                    <input className="flex-1 rounded border px-1.5 py-1 text-[11px]" placeholder="Escribe la respuesta pública…"
                      value={texto[c.id] || ''} onChange={(e) => setTexto((t) => ({ ...t, [c.id]: e.target.value }))} />
                    <Button size="sm" className="h-7 bg-emerald-600 px-2 text-[11px] text-white hover:bg-emerald-700"
                      disabled={enviando === c.id || !(texto[c.id] || '').trim()} onClick={() => responder(c)}>
                      {enviando === c.id ? 'Enviando…' : 'Responder'}
                    </Button>
                  </div>
                  {datos.sugerida && !(texto[c.id] || '').trim() && (
                    <button type="button" className="text-violet-700 underline"
                      onClick={() => setTexto((t) => ({ ...t, [c.id]: datos.sugerida }))}>
                      Usar: “{datos.sugerida}”
                    </button>
                  )}
                  {aviso[c.id] && (
                    <div className="text-red-700">
                      {aviso[c.id].motivo === 'permiso'
                        ? <>Facebook todavía no deja responder desde MotoFlow (falta el permiso pages_manage_engagement en el token). {c.enlace && <a className="underline" href={c.enlace} target="_blank" rel="noreferrer">Responder en Facebook</a>}</>
                        : aviso[c.id].error || 'No se pudo responder.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Cuánta gente escribió por la promoción en sus primeros 7 días: comentó en
// la publicación o nombró la pieza por cualquier canal (sql/chats_de_cada_promocion.sql).
// Es el paso entre "la vieron" (métricas) y "se vendió" (ventas).
const NOMBRE_CANAL = { whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' };
function ChatsDeLaPromocion({ c }) {
  const n = Number(c.chats || 0);
  const canales = Object.entries(c.por_canal || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${NOMBRE_CANAL[k] || k} ${v}`)
    .join(' · ');
  return (
    <div className={`mt-0.5 text-[11px] ${n > 0 ? 'text-sky-700' : 'text-slate-500'}`}>
      🙋 <b>{num(n)}</b> {n === 1 ? 'persona preguntó' : 'personas preguntaron'} por ella
      {canales && <span> ({canales})</span>}
    </div>
  );
}

function VentasDeLaPromocion({ v }) {
  const vendidas = Number(v.vendidas || 0);
  const normal = Number(v.normal || 0);
  const dias = Number(v.dias || 0);
  const tiempo = dias < 1 ? 'en sus primeras horas' : `en ${dias.toLocaleString('es-DO')} días`;
  return (
    <div className={`mt-0.5 text-[11px] ${vendidas > normal ? 'text-emerald-700' : 'text-slate-600'}`}>
      🛒 <b>{num(vendidas)}</b> vendidas {tiempo}
      {Number(v.monto) > 0 && ` (${rd(v.monto)})`}
      <span className="text-slate-500"> · lo normal en ese tiempo: {normal.toLocaleString('es-DO')}</span>
      {vendidas > normal && <b> · se vendió más de lo normal</b>}
    </div>
  );
}

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
  // Lo que se vendió del producto desde que salió cada promoción, por bundle.
  const [ventasDe, setVentasDe] = useState({});
  // Cuántas conversaciones preguntaron por cada promoción, por canal.
  const [chatsDe, setChatsDe] = useState({});
  // Los comentarios de Facebook/Instagram de cada promoción, leídos de la red.
  const [comentariosDe, setComentariosDe] = useState({});
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
  // Programar desde el historial una promoción ya aprobada: { id, cuando }.
  const [programandoHist, setProgramandoHist] = useState(null);

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

  // Una cuenta por red (la conexión vigente manda sobre el registro manual
  // antiguo) y lo que se puede decir de ella. La MISMA cuenta decide el
  // indicador de arriba y si el destino queda bloqueado abajo.
  // Ver src/lib/estadoRedesSociales.js.
  const indicadores = useMemo(() => indicadoresRedes(redesEstado), [redesEstado]);
  const indicadorDe = useMemo(
    () => Object.fromEntries(indicadores.map((i) => [i.platform, i])),
    [indicadores],
  );

  // El "ver" de cada destino publicado.
  //  · Historia de Facebook: facebook.com/<id de la historia> no abre nada
  //    ("Este contenido no está disponible"); se ven desde las historias de la
  //    página. Las viejas guardaron el enlace malo y la base no deja
  //    reescribirlo (publicación confirmada): se corrige aquí, al mostrarlo.
  //  · TikTok publicado desde la bandeja no deja enlace propio: el perfil.
  const enlaceVer = (d) => {
    if (d.platform === 'facebook' && d.placement === 'story' && d.estado === 'PUBLICADO') {
      const pagina = indicadorDe.facebook?.cuenta?.external_account_id;
      if (pagina) return `https://www.facebook.com/stories/${pagina}`;
    }
    if (d.external_url) return d.external_url;
    if (d.platform === 'tiktok' && d.estado === 'PUBLICADO') return indicadorDe.tiktok?.cuenta?.perfil_url || null;
    return null;
  };

  // Sin tokens: esta pantalla solo necesita saber el estado.
  const cargar = useCallback(async () => {
    const [{ data: cuentas }, { data: panel }] = await Promise.all([
      supabase.from('social_accounts')
        .select('id, platform, account_name, external_account_id, status, connected_at, publicacion_habilitada, verificado_at, verificacion_detalle, perfil_url:meta->>perfil_url'),
      supabase.rpc('promo_panel', { p_limite: verAnteriores ? 25 : 3 }),
    ]);
    setRedesEstado(cuentas || []);
    const lista = Array.isArray(panel) ? panel : [];
    setPromos(lista);
    setCargando(false);
    // Aparte y sin bloquear: si falla, el historial se ve igual, sin ventas.
    const ids = lista.map((p) => p.bundle_id).filter(Boolean);
    if (ids.length) {
      const [{ data: ventas }, { data: chats }] = await Promise.all([
        supabase.rpc('promo_ventas_de_promociones', { p_bundle_ids: ids }),
        supabase.rpc('promo_chats_de_promociones', { p_bundle_ids: ids }),
      ]);
      setVentasDe(Object.fromEntries((Array.isArray(ventas) ? ventas : []).map((v) => [v.bundle_id, v])));
      setChatsDe(Object.fromEntries((Array.isArray(chats) ? chats : []).map((c) => [c.bundle_id, c])));
      // Lo más lento (va a Facebook/Instagram) va de último y tampoco bloquea.
      const { data: com } = await supabase.functions.invoke('promo-comentarios', { body: { accion: 'listar', bundle_ids: ids } });
      if (com?.ok) setComentariosDe(com.promos || {});
    }
  }, [verAnteriores]);

  useEffect(() => { cargar(); }, [cargar]);

  // >>> AL VOLVER DE AUTORIZAR, Y CON "ACTUALIZAR" <<<
  // La autorización se hace en otra ventana (ConectarRedes) para no perder la
  // promoción a medio llenar. Al volver a esta pestaña se relee el estado; y
  // el botón Actualizar de la página avisa con un evento. Solo se recargan
  // las cuentas y el historial: el formulario no se toca.
  const ultimaLectura = useRef(0);
  useEffect(() => {
    const releer = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - ultimaLectura.current < 3000) return;
      ultimaLectura.current = Date.now();
      cargar();
    };
    window.addEventListener('focus', releer);
    document.addEventListener('visibilitychange', releer);
    window.addEventListener('equipo-ia:actualizar', cargar);
    return () => {
      window.removeEventListener('focus', releer);
      document.removeEventListener('visibilitychange', releer);
      window.removeEventListener('equipo-ia:actualizar', cargar);
    };
  }, [cargar]);

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

  // Los que publica el servidor. El Estado de WhatsApp va aparte (a mano).
  const destinos = useMemo(
    () => REDES.filter((r) => !r.manual && elegidos.includes(`${r.platform}:${r.placement}`))
      .map((r) => ({ platform: r.platform, placement: r.placement })),
    [elegidos],
  );
  const conEstadoWhatsapp = elegidos.some((c) => ES_MANUAL.has(c));

  const plataformasElegidas = useMemo(() => [...new Set(destinos.map((d) => d.platform))], [destinos]);

  const problemas = useMemo(() => {
    const p = [];
    // El estante primero: es lo único que ninguna máquina puede comprobar.
    if (!producto) p.push('Falta elegir la pieza.');
    else if (!existenciaOk) p.push('Falta marcar "Fui al estante y la pieza está".');
    if (!titulo.trim()) p.push('Falta el título.');
    if (!destinos.length) p.push('Elige al menos una red además del Estado de WhatsApp.');
    plataformasElegidas.forEach((plat) => {
      if (!textos[plat]?.trim()) p.push(`Falta el texto de ${plat}.`);
      else if (!precioEnTexto(textos[plat], precio)) p.push(`El texto de ${plat} no dice el precio.`);
    });
    if (destinos.some((d) => d.placement === 'feed') && !media.imagen_feed) p.push('Falta la imagen del feed.');
    if (destinos.some((d) => d.placement === 'story') && !media.imagen_historia) p.push('Falta la imagen de la historia.');
    if (destinos.some((d) => ['reel', 'short'].includes(d.placement)) && !media.video) p.push('Falta el video vertical.');
    if (conEstadoWhatsapp && !media.imagen_historia && !media.video) p.push('Para el Estado de WhatsApp falta la imagen de la historia o el video.');
    return p;
  }, [producto, existenciaOk, titulo, destinos, conEstadoWhatsapp, plataformasElegidas, textos, precio, media]);

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
      // El Estado de WhatsApp: se apunta para que la PC baje la imagen a la
      // carpeta. Repetirlo no duplica (la base lo ignora).
      if (conEstadoWhatsapp) {
        const { error } = await supabase.rpc('promo_whatsapp_pedir', {
          p_bundle_id: id, p_titulo: titulo.trim(),
          p_imagen: media.imagen_historia || null, p_video: media.video || null,
        });
        if (error) throw error;
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

  // >>> LAS APROBADAS QUE SE QUEDARON SIN FECHA <<<
  // Con los cuatro botones de antes, "Aprobar" no publicaba: faltaba
  // "Programar". El 28/09 el amortiguador se aprobó dos veces y se quedó en
  // borrador para siempre, porque aprobado sin fecha nunca sale. Desde el
  // historial se les da la salida que les faltó, con las mismas funciones.
  const sacar = async (bundleId, cuandoLocal = null) => {
    if (trabajando) return;
    setTrabajando(true);
    try {
      const { data, error } = cuandoLocal
        ? await supabase.rpc('promo_programar', {
          p_bundle_id: bundleId, p_cuando: new Date(`${cuandoLocal}:00-04:00`).toISOString(),
        })
        : await supabase.rpc('promo_publicar_ahora', { p_bundle_id: bundleId });
      if (error) throw error;
      const bloqueados = Number(data?.sin_autorizar || 0);
      toast({
        title: cuandoLocal
          ? `Programada para el ${new Date(data?.cuando).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}`
          : 'Sale en un minuto',
        description: bloqueados ? `${bloqueados} destino(s) sin autorizar no salen.` : undefined,
      });
      setProgramandoHist(null);
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
          {indicadores.map((i) => (
            <span key={i.platform}
              title={i.detalle || 'sin comprobar'}
              className={`rounded border px-2 py-0.5 text-[10px] font-bold ${COLOR_RED[i.clave]}`}>
              {i.platform}: {i.etiqueta}
            </span>
          ))}
        </div>
      </div>

      {/* El porqué de lo que no está listo, a la vista y no solo al pasar el
          mouse: "conectado" y "puede publicar" no son lo mismo. */}
      {indicadores.some((i) => !i.puede && i.detalle) && (
        <ul className="mb-3 space-y-0.5 text-[11px] text-slate-600">
          {indicadores.filter((i) => !i.puede && i.detalle).map((i) => (
            <li key={i.platform}><b className="capitalize">{i.platform}</b> · {i.etiqueta}: {i.detalle}</li>
          ))}
        </ul>
      )}

      {!cargando && !indicadores.some((i) => i.puede) && (
        <div className="mb-3 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Ahora mismo <b>ninguna red puede publicar</b>. Se puede dejar la promoción preparada y aprobada, pero sus
            destinos van a quedar <b>sin autorizar</b> hasta reconectar las cuentas. Para volver a comprobarlo:
            <code className="mx-1 rounded bg-amber-100 px-1">node scripts/social-estado.mjs</code>
          </span>
        </div>
      )}

      <ConectarRedes />

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
            // La misma cuenta que pinta el indicador. Sin ninguna fila de esa
            // red no se marca aquí (igual que antes): la base lo decide al crear.
            const bloqueada = indicadorDe[r.platform] ? !indicadorDe[r.platform].puede : false;
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
        MotoFlow mide cada 30 minutos; Facebook tarda unas horas en dar sus números. Las historias de Facebook y TikTok no traen números.
        "Vendidas" cuenta todas las ventas del producto (tienda incluida) en los 7 días después de publicar, contra lo que vende normalmente en ese tiempo.
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
              {chatsDe[p.bundle_id] && <ChatsDeLaPromocion c={chatsDe[p.bundle_id]} />}
              {ventasDe[p.bundle_id] && <VentasDeLaPromocion v={ventasDe[p.bundle_id]} />}
              {comentariosDe[p.bundle_id] && (
                <ComentariosDeLaPromocion bundleId={p.bundle_id} datos={comentariosDe[p.bundle_id]} onRespondido={cargar} />
              )}
              {p.estado === 'APROBADO' && !p.programada && (
                <div className="mt-1 flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                  <span className="flex-1">Aprobada pero sin fecha: así no sale nunca.</span>
                  <Button size="sm" disabled={trabajando} onClick={() => sacar(p.bundle_id)}
                    className="h-7 bg-emerald-600 px-2 text-[11px] text-white hover:bg-emerald-700">
                    Publicar ahora
                  </Button>
                  {programandoHist?.id === p.bundle_id ? (
                    <>
                      <input type="datetime-local" className="rounded border px-1 py-0.5 text-[11px]"
                        value={programandoHist.cuando}
                        onChange={(e) => setProgramandoHist({ id: p.bundle_id, cuando: e.target.value })} />
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]"
                        disabled={trabajando || !programandoHist.cuando}
                        onClick={() => sacar(p.bundle_id, programandoHist.cuando)}>
                        Programar
                      </Button>
                    </>
                  ) : (
                    <button type="button" className="font-semibold underline"
                      onClick={() => setProgramandoHist({ id: p.bundle_id, cuando: '' })}>
                      Programar…
                    </button>
                  )}
                </div>
              )}
              <div className="mt-1 grid gap-1 md:grid-cols-2">
                {p.whatsapp_estado && (
                  <div className="rounded bg-slate-50 px-2 py-1 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">whatsapp · estado</span>
                      <span className="flex items-center gap-2">
                        {p.whatsapp_estado.estado === 'PENDIENTE' && (
                          <button type="button" disabled={trabajando} className="font-semibold text-emerald-700 underline"
                            onClick={() => paso('promo_whatsapp_publicado', { p_bundle_id: p.bundle_id }, 'Estado de WhatsApp marcado como publicado')}>
                            ya lo publiqué
                          </button>
                        )}
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${COLOR_ESTADO[p.whatsapp_estado.estado === 'PUBLICADO' ? 'PUBLICADO' : 'EN TU TIKTOK'] || ''}`}>
                          {p.whatsapp_estado.estado === 'PUBLICADO' ? 'PUBLICADO' : 'A MANO'}
                        </span>
                      </span>
                    </div>
                    {p.whatsapp_estado.estado === 'PENDIENTE' && (
                      <div className="mt-0.5 text-[10px] text-fuchsia-800">
                        {p.whatsapp_estado.archivo
                          ? <>En tu PC: <b>C:\RepuestosMorla\Publicaciones\Pendientes\{p.whatsapp_estado.archivo}</b>. Súbela a tu Estado y pulsa "ya lo publiqué".</>
                          : 'La imagen todavía no bajó a la carpeta de la PC (se descarga en menos de un minuto si el programa está abierto).'}
                      </div>
                    )}
                  </div>
                )}
                {(p.destinos || []).map((d) => (
                  <div key={d.id} className="rounded bg-slate-50 px-2 py-1 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">{d.platform} · {d.placement}</span>
                      <span className="flex items-center gap-2">
                        {/* Privado: el enlace útil es el de YouTube Studio, donde
                            se pone público; ver el Short no sirve para nada. */}
                        {d.estado === 'PRIVADO' && d.external_post_id ? (
                          <a href={`https://studio.youtube.com/video/${encodeURIComponent(d.external_post_id)}/edit`}
                            target="_blank" rel="noreferrer" className="font-semibold text-amber-700 underline">
                            ponerlo público
                          </a>
                        ) : enlaceVer(d) && (
                          <a href={enlaceVer(d)} target="_blank" rel="noreferrer" className="text-blue-600 underline">ver</a>
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
                    {/* Hasta la auditoría de Google, YouTube sube en privado:
                        el dueño lo abre a mano y el publicador lo nota solo. */}
                    {d.estado === 'PRIVADO' && d.external_post_id && (
                      <div className="mt-0.5 text-[10px] text-amber-800">
                        Subido en privado: nadie lo ve todavía.{' '}
                        <a href={`https://studio.youtube.com/video/${encodeURIComponent(d.external_post_id)}/edit`}
                          target="_blank" rel="noreferrer" className="font-semibold underline">
                          Abrir en YouTube Studio y ponerlo público
                        </a>
                        . MotoFlow lo nota solo en unos 5 minutos.
                      </div>
                    )}
                    {/* TikTok no publica solo: el video llega como borrador a
                        la bandeja de la app y el dueño lo publica desde ahí. */}
                    {d.estado === 'EN TU TIKTOK' && (
                      <div className="mt-0.5 text-[10px] text-fuchsia-800">
                        Está como borrador en tu TikTok. Abre la app en el teléfono, toca la notificación
                        (o la bandeja de entrada), ponle música si quieres y publícalo.
                      </div>
                    )}
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
