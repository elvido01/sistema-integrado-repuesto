// =====================================================================
// Equipo IA — tres agentes, y Elvido aprobando
// ---------------------------------------------------------------------
// Hermes coordina, Jarvis mira MotoFlow, Comercial-Creativo redacta.
// Elvido NO es un agente y por eso NO tiene tarjeta: es quien aprueba.
//
// Todo lo que se ve aquí sale de public.equipo_panel(). No hay un solo
// estado inventado en el frontend: si un agente aparece "trabajando" es
// porque tiene un mensaje en 'processing' en la base. Una pantalla que
// pinta estados propios miente en cuanto el backend se cae.
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PromocionPublicar from '@/components/equipo/PromocionPublicar';
import { Helmet } from 'react-helmet';
import {
  Loader2, RefreshCw, ShieldCheck, Bot, Database, Sparkles, Check, X,
  MessageSquarePlus, AlertTriangle, Clock, ChevronRight, RotateCcw, Ban, Send,
  Cpu, Cloud, Laptop, Undo2, PlugZap, ClipboardList,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { BorradorPromocion } from '@/components/equipo/BorradorPromocion';
import { EspecificacionesArte } from '@/components/equipo/EspecificacionesArte';
import { RecomendacionesDelDia } from '@/components/equipo/RecomendacionesDelDia';
import { PiezasModelo } from '@/components/equipo/PiezasModelo';
import { ReelsModelo } from '@/components/equipo/ReelsModelo';
import { FotosDelDia } from '@/components/equipo/FotosDelDia';
import { AgotadosQueSeVenden } from '@/components/equipo/AgotadosQueSeVenden';
import { AnunciosDelSuplidor } from '@/components/equipo/AnunciosDelSuplidor';
import { CodigosDePromocion } from '@/components/equipo/CodigosDePromocion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ── Cómo se ve cada estado ────────────────────────────────────────────
// Los nombres técnicos no se enseñan. "waiting_dependency" no le dice nada
// a nadie; "Esperando datos" sí.
const ESTADO_AGENTE = {
  disponible:            { txt: 'Disponible',            cls: 'bg-slate-100 text-slate-600' },
  trabajando:            { txt: 'Trabajando',            cls: 'bg-blue-100 text-blue-700' },
  esperando_datos:       { txt: 'Esperando datos',       cls: 'bg-amber-100 text-amber-700' },
  esperando_aprobacion:  { txt: 'Esperando aprobación',  cls: 'bg-violet-100 text-violet-700' },
  error:                 { txt: 'Error',                 cls: 'bg-red-100 text-red-700' },
  desconectado:          { txt: 'Desconectado',          cls: 'bg-slate-200 text-slate-500' },
};

const ESTADO_TRABAJO = {
  pending:            { txt: 'En cola',              cls: 'bg-slate-100 text-slate-600' },
  claimed:            { txt: 'Tomado',               cls: 'bg-blue-100 text-blue-700' },
  processing:         { txt: 'Trabajando',           cls: 'bg-blue-100 text-blue-700' },
  waiting_dependency: { txt: 'Esperando datos',      cls: 'bg-amber-100 text-amber-700' },
  waiting_approval:   { txt: 'Esperando aprobación', cls: 'bg-violet-100 text-violet-700' },
  completed:          { txt: 'Completado',           cls: 'bg-emerald-100 text-emerald-700' },
  failed:             { txt: 'Error',                cls: 'bg-red-100 text-red-700' },
  cancelled:          { txt: 'Cancelado',            cls: 'bg-slate-200 text-slate-500' },
  expired:            { txt: 'Vencido',              cls: 'bg-slate-200 text-slate-500' },
};

const ESTADO_PUBLICACION = {
  published: 'Publicado', failed: 'Falló', awaiting_confirmation: 'Sin confirmar',
  awaiting_approval: 'Espera aprobación', awaiting_upload: 'Espera archivo',
  scheduled: 'Programado', queued: 'En cola', processing: 'Publicando',
  draft: 'Borrador', cancelled: 'Cancelado',
};

const PUBLICACIONES_RECIENTES = 3;

const ICONO = { hermes: Bot, jarvis: Database, comercial_creativo: Sparkles };
const NOMBRE_CORTO = { hermes: 'Hermes', jarvis: 'Jarvis', comercial_creativo: 'Comercial-Creativo', elvido: 'Elvido' };

// ── Los tres motores ──────────────────────────────────────────────────
// Lo que cada uno significa en la práctica: quién paga, dónde corre y qué
// hace falta para que conteste. Elegir motor es elegir esas tres cosas.
const MOTOR = {
  openai: {
    txt: 'OpenAI',
    icono: Cloud,
    resumen: 'El modelo sale de la API de OpenAI y se paga con crédito.',
    requisito: 'Necesita OPENAI_API_KEY. Ya está puesta: es la que usa el chat de hoy.',
  },
  claude: {
    txt: 'Claude por API',
    icono: Cloud,
    resumen: 'El modelo sale de la API de Anthropic, con crédito aparte del de la suscripción.',
    requisito: 'Necesita ANTHROPIC_API_KEY en los secretos de Supabase y en el worker.',
  },
  claude_suscripcion: {
    txt: 'Suscripción de Claude',
    icono: Laptop,
    resumen: 'Contesta con una cuenta de Claude tuya. No gasta crédito de API.',
    // "La máquina que lo atiende" y no "la PC": hoy el Comercial-Creativo
    // corre en el VPS justamente para no depender de un escritorio
    // encendido. Decir "la PC" mandaría a buscar la sesión donde no está.
    requisito: 'La cuenta se elige en la máquina que lo atiende, no aquí: npm run equipo:login',
  },
};

const ARRANQUE = { comercial_creativo: 'npm run equipo:comercial', jarvis: 'npm run equipo:jarvis' };

// "1565 minutos" no le dice nada a nadie; "26 horas" sí. La cifra cruda se
// queda en la base para quien la necesite.
const tiempoParado = (minutos) => {
  const m = Math.max(0, Number(minutos) || 0);
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h`;
  return `${Math.floor(m / 1440)} d`;
};

const hace = (iso) => {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace instantes';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
};

const enlaceVideoVerificado = (video) => {
  try {
    const url = new URL(video.external_url);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const esTikTok = host === 'tiktok.com' || host.endsWith('.tiktok.com');
    const esYouTube = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
    return video.platform === 'tiktok' ? (esTikTok ? url.href : null) : (esYouTube ? url.href : null);
  } catch {
    return null;
  }
};

// Nada de lo que llega del backend se pinta como HTML. Es texto que
// escribió un modelo: tratarlo como marcado sería abrirle la pantalla.
const Texto = ({ children, className = '' }) => (
  <span className={className}>{String(children ?? '')}</span>
);

// ── Quién atiende la cola, y con qué cuenta ───────────────────────────
// Esto NO se elige desde el navegador y no es un descuido: la sesión de
// Claude vive en la máquina que corre el worker. Un desplegable aquí
// dejaría elegir una cuenta y que contestara otra. Lo que la pantalla sí
// puede es decir cuál está puesta y cómo se cambia.
//
// >>> LO QUE ESTA TARJETA DECÍA MAL (2026-08-14) <<<
// Decía "los trabajos esperan en cola hasta que arranques npm run
// equipo:jarvis" a un agente que se atiende SOLO desde una Edge Function.
// Era falso y además desmentido dos renglones más arriba, donde la misma
// tarjeta enseñaba "el último fue openai desde edge-function": nadie había
// arrancado nada y aun así contestó.
//
// El origen del error es que el latido solo se escribe cuando el agente
// trabaja. En un worker de PC eso equivale a "está vivo", porque el proceso
// late cada minuto aunque no haga nada. En la nube NO hay proceso vivo que
// latir: se despierta cuando entra trabajo. Un agente de nube "sin latido"
// está en reposo, no apagado — y mandarte a encender un worker por eso te
// hacía perder el tiempo en lo único que no hacía falta.
//
// Quién lo atiende sale de `ejecuta_en`, que es la MISMA columna que decide
// de verdad el reparto (public.equipo_nube_agentes la usa para saber a
// quién puede tomar la Edge Function). La pantalla no adivina: lee.
const QuienAtiende = ({ w, agente, ejecutaEn, compacto }) => {
  const cmd = ARRANQUE[agente];

  // ── LO ATIENDE LA NUBE ──────────────────────────────────────────────
  // Ni verde ni ámbar a propósito. Verde diría "hay alguien atendiendo
  // AHORA", y aquí no hay nadie esperando: hay una función que arranca
  // cuando entra trabajo. Ámbar diría que tienes algo que hacer, y no lo
  // tienes. Es un tercer estado y se ve como un tercer estado.
  if (ejecutaEn === 'nube') {
    return (
      <div className={`rounded-lg border border-sky-200 bg-sky-50/60 p-2 ${compacto ? 'mt-1' : ''}`}>
        <p className="flex items-start gap-1 text-[11px] font-semibold text-sky-800">
          <Cloud className="mt-px h-3.5 w-3.5 shrink-0" />
          Lo atiende la nube
        </p>
        <p className="mt-0.5 text-[10px] text-sky-700">
          No hay que arrancar nada. Contesta con tu PC apagada.
        </p>
        {w?.visto_en && (
          // "Última señal" y no "última respuesta": esto es exactamente lo
          // que dice la fila del latido, y no más. Que sea vieja no es una
          // avería — es que no le han pedido nada desde entonces.
          <p className="mt-0.5 text-[10px] text-sky-700">
            Última señal {hace(w.visto_en)}
            {w.maquina ? <> · desde <Texto>{w.maquina}</Texto></> : null}
          </p>
        )}
      </div>
    );
  }

  // ── LO ATIENDE UNA MÁQUINA ──────────────────────────────────────────
  // Aquí sí hay un proceso que puede estar caído, y el latido significa
  // lo que parece.
  if (!w || !w.conectado) {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50/60 p-2 ${compacto ? 'mt-1' : ''}`}>
        <p className="flex items-start gap-1 text-[11px] font-semibold text-amber-800">
          <PlugZap className="mt-px h-3.5 w-3.5 shrink-0" />
          {w ? 'Nadie atendiendo ahora mismo' : 'Nunca ha arrancado un worker'}
        </p>
        {w && (
          <p className="mt-0.5 text-[10px] text-amber-700">
            El último fue <Texto>{w.cuenta || w.motor}</Texto>
            {w.maquina ? <> desde <Texto>{w.maquina}</Texto></> : null} · {hace(w.visto_en)}
          </p>
        )}
        {cmd && (
          <p className="mt-1 text-[10px] text-amber-700">
            Los trabajos esperan en cola hasta que arranques <code className="rounded bg-white px-1">{cmd}</code>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 ${compacto ? 'mt-1' : ''}`}>
      <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
        Atendiendo · {hace(w.visto_en)}
      </p>
      {w.cuenta ? (
        <p className="mt-0.5 text-[10px] text-emerald-800">
          Contesta con <b><Texto>{w.cuenta}</Texto></b>
          {w.plan ? <> · <Texto>{w.plan}</Texto></> : null}
        </p>
      ) : (
        <p className="mt-0.5 text-[10px] text-emerald-700">Con clave de API, sin cuenta personal</p>
      )}
      {w.maquina && <p className="text-[10px] text-emerald-700">Desde <Texto>{w.maquina}</Texto></p>}
    </div>
  );
};

const Etiqueta = ({ mapa, valor }) => {
  const e = mapa[valor] || { txt: valor || '—', cls: 'bg-slate-100 text-slate-600' };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${e.cls}`}>{e.txt}</span>;
};

const EquipoIAPage = () => {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [peticion, setPeticion] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [cambios, setCambios] = useState({ id: null, texto: '' });
  const [motor, setMotor] = useState(null);
  const [guardandoMotor, setGuardandoMotor] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [atascos, setAtascos] = useState([]);
  const [destinos, setDestinos] = useState([]);
  const [errorDestinos, setErrorDestinos] = useState(false);
  const [videosMetricool, setVideosMetricool] = useState([]);
  const [errorMetricool, setErrorMetricool] = useState(false);
  const [verOrdenesAnteriores, setVerOrdenesAnteriores] = useState(false);
  const [verVideosAnteriores, setVerVideosAnteriores] = useState(false);
  // La pieza aceptada arriba llena el formulario de publicar de abajo.
  const [prefillPromo, setPrefillPromo] = useState(null);
  // "Verla arriba" desde la bandeja: lleva el encargo al paso 2.
  const [enfocarPromo, setEnfocarPromo] = useState(null);

  const cargar = useCallback(async (silencioso) => {
    if (!silencioso) setCargando(true);
    // Dos llamadas y no una: equipo_panel ya se reescribió entera una vez
    // para agregarle tres columnas. Una tercera copia de noventa líneas de
    // SQL para colgarle un dato es comprar una divergencia segura a cambio
    // de un viaje de red.
    const [panel, ws, at, pub, videos] = await Promise.all([
      supabase.rpc('equipo_panel', { p_limite: 25 }),
      supabase.rpc('equipo_workers_estado'),
      // El reloj. Va aparte por lo mismo que el latido: equipo_panel ya se
      // reescribió entera una vez para colgarle columnas.
      supabase.rpc('equipo_atascos', { p_minutos: 30 }),
      supabase.from('hermes_publication_targets')
        .select('id,job_id,platform,placement,status,external_url,error_message,created_at,updated_at,hermes_publication_jobs(title,created_at,scheduled_for)')
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('social_posts')
        .select('id,platform,post_type,title,external_url,published_at,verified_at')
        .in('platform', ['tiktok', 'youtube'])
        .in('source_provider', ['metricool', 'metricool_analytics'])
        .eq('status', 'publicado')
        .not('external_url', 'is', null)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('verified_at', { ascending: false }).limit(100),
    ]);
    if (panel.error) {
      toast({ variant: 'destructive', title: 'No se pudo cargar el equipo', description: panel.error.message });
    } else {
      setData(panel.data);
    }
    // Que falte el latido no rompe la pantalla: es un dato de más, y hasta
    // que se corra su SQL esta llamada da error de función inexistente.
    setWorkers(ws.error ? [] : (ws.data || []));
    setAtascos(at.error ? [] : (at.data || []));
    setDestinos(pub.error ? [] : (pub.data || []));
    setErrorDestinos(Boolean(pub.error));
    setVideosMetricool(videos.error ? [] : (videos.data || []).filter((video) => enlaceVideoVerificado(video)));
    setErrorMetricool(Boolean(videos.error));
    setCargando(false);
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  // Tiempo real sobre las tres tablas. Es la misma infraestructura que ya
  // usa el widget de Hermes: no hace falta una cola aparte.
  useEffect(() => {
    const canal = supabase
      .channel('equipo-ia')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipo_trabajos' }, () => cargar(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipo_mensajes' }, () => cargar(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipo_aprobaciones' }, () => cargar(true))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [cargar]);

  // El latido no dispara realtime a propósito: sería un refresco por minuto
  // por worker. Se relee cada medio minuto mientras la pantalla esté
  // abierta, que es cuando importa que "Atendiendo · hace 10 s" sea cierto.
  useEffect(() => {
    const t = setInterval(async () => {
      const { data: ws, error } = await supabase.rpc('equipo_workers_estado');
      if (!error) setWorkers(ws || []);
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const agentes = data?.agentes || [];
  const modelos = data?.modelos || [];
  const trabajos = data?.trabajos || [];
  const aprobaciones = data?.aprobaciones || [];
  const pendientes = useMemo(() => aprobaciones.filter((a) => a.estado === 'pending'), [aprobaciones]);
  // >>> UNA PROMOCIÓN SE APRUEBA EN UN SOLO SITIO (28/09/2026) <<<
  // Las del panel ("Qué promocionar hoy") salían dos veces: aquí, con Aprobar
  // / Pedir cambios / Descartar todo, y arriba en el paso 2 con la imagen
  // grande. Dos permisos para lo mismo. El dueño eligió que se queden solo
  // arriba: aquí siguen apareciendo, para no perderlas de vista, pero sin
  // botones de decidir; llevan al paso 2. Las que llegan por el chat de
  // Hermes no las sigue el panel, y esas sí se deciden aquí como siempre.
  const promoDelPanel = useMemo(() => {
    const ids = new Set(trabajos
      .filter((w) => w.tipo === 'promocion' && w.origin_platform === 'panel')
      .map((w) => w.id));
    return (ap) => ids.has(ap.trabajo_id);
  }, [trabajos]);
  const activos = useMemo(
    () => trabajos.filter((t) => !['completed', 'cancelled', 'expired'].includes(t.estado)),
    [trabajos],
  );
  // La bitácora vive cerrada; lo que la abre sola es un trabajo atascado o
  // fallido, que es lo único que de verdad pide mirar ahí.
  const problemas = useMemo(
    () => activos.filter((t) => t.estado === 'failed' || atascos.some((a) => a.id === t.id)).length,
    [activos, atascos],
  );
  const [bitacoraAbierta, setBitacoraAbierta] = useState(false);
  useEffect(() => { if (problemas > 0) setBitacoraAbierta(true); }, [problemas]);

  // Una orden puede tener varios destinos. Contamos las tres órdenes más
  // recientes, no las tres tarjetas; updated_at cambia durante la verificación.
  const destinosOrdenados = useMemo(() => [...destinos].sort((a, b) => {
    const fechaA = a.hermes_publication_jobs?.created_at || a.created_at || '';
    const fechaB = b.hermes_publication_jobs?.created_at || b.created_at || '';
    return fechaB.localeCompare(fechaA) || (a.job_id || a.id).localeCompare(b.job_id || b.id);
  }), [destinos]);
  const ordenesRecientes = useMemo(() => new Set(
    [...new Set(destinosOrdenados.map((d) => d.job_id || d.id))].slice(0, PUBLICACIONES_RECIENTES),
  ), [destinosOrdenados]);
  const destinosVisibles = verOrdenesAnteriores
    ? destinosOrdenados
    : destinosOrdenados.filter((d) => ordenesRecientes.has(d.job_id || d.id));
  // Mantener ambas redes a la vista, aunque una tenga más videos recientes.
  const videosVisibles = verVideosAnteriores ? videosMetricool : videosMetricool.filter((video) => {
    const anteriores = videosMetricool.filter((v) => v.platform === video.platform);
    return anteriores.indexOf(video) < PUBLICACIONES_RECIENTES;
  });

  const pedir = async () => {
    const texto = peticion.trim();
    if (!texto) return;
    // (02/10/2026) Antes abría un trabajo con equipo_pedir que nadie recogía
    // (el reparto de Hermes no existe; solo las promociones van directo al
    // Creativo). Ahora se le pasa al chat flotante, que habla con el Hermes
    // de verdad y contesta ahí mismo.
    const detalle = { texto };
    window.dispatchEvent(new CustomEvent('equipo-ia:pedir-a-hermes', { detail: detalle }));
    if (detalle.resultado === true) {
      setPeticion('');
      toast({ title: 'Se lo pasé a Hermes', description: 'Te contesta en el chat de abajo a la derecha.' });
    } else if (detalle.resultado === false) {
      toast({ variant: 'destructive', title: 'Hermes no está conectado', description: 'Su servidor no está dando señal. El pedido no se envió.' });
    } else {
      toast({ variant: 'destructive', title: 'No encontré el chat de Hermes', description: 'Recarga la página y vuelve a intentarlo.' });
    }
  };

  const decidir = async (id, decision, comentario) => {
    const { error } = await supabase.rpc('equipo_decidir', {
      p_aprobacion_id: id, p_decision: decision, p_comentario: comentario || null,
    });
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo registrar la decisión', description: error.message });
      return;
    }
    toast({
      title: decision === 'approved' ? 'Aprobado' : decision === 'rejected' ? 'Rechazado' : 'Cambios solicitados',
      description: 'Queda registrado con tu usuario y la hora.',
    });
    setCambios({ id: null, texto: '' });
    cargar(true);
  };

  const accionTrabajo = async (id, accion) => {
    const { error } = await supabase.rpc('equipo_trabajo_accion', { p_trabajo_id: id, p_accion: accion });
    if (error) toast({ variant: 'destructive', title: 'No se pudo', description: error.message });
    else cargar(true);
  };

  // ── EL MOTOR DE UN AGENTE ───────────────────────────────────────────
  // Se abre con lo que hay puesto hoy, no con valores en blanco: cambiar de
  // motor casi nunca es empezar de cero, es mover una cosa.
  const abrirMotor = (a) => setMotor({
    clave: a.clave,
    nombre: a.nombre,
    atiende_widget: a.atiende_widget,
    puede_deshacer: a.puede_deshacer,
    proveedor: a.proveedor || 'openai',
    modelo: a.modelo || '',
    temperatura: a.temperatura ?? 0.3,
    max_tokens: a.max_tokens ?? 800,
  });

  const etiquetaModelo = (proveedor, modelo) => {
    if (proveedor === 'claude_suscripcion') return 'lo decide la sesión';
    if (!modelo) return 'por defecto del worker';
    return modelos.find((m) => m.proveedor === proveedor && m.modelo === modelo)?.etiqueta || modelo;
  };

  const guardarMotor = async () => {
    setGuardandoMotor(true);
    const { data: res, error } = await supabase.rpc('equipo_motor', {
      p_clave: motor.clave,
      p_proveedor: motor.proveedor,
      p_modelo: motor.proveedor === 'claude_suscripcion' ? null : (motor.modelo || null),
      p_temperatura: Number(motor.temperatura),
      p_max_tokens: Number(motor.max_tokens),
    });
    setGuardandoMotor(false);
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo cambiar el motor', description: error.message });
      return;
    }
    // Guardar no es conectar. Si hace falta un worker, se dice aquí y no
    // cuando el trabajo lleve media hora parado en la cola.
    const avisos = [];
    if (res?.necesita_worker) avisos.push(`La suscripción no se atiende desde la nube: hace falta ${ARRANQUE[motor.clave] || 'un worker'} en una máquina con sesión de Claude.`);
    if (res?.widget_degradado) avisos.push('El botón flotante sigue con OpenAI: la Edge Function no puede usar la suscripción.');
    if (res?.aviso) avisos.push(res.aviso);
    toast({
      title: `${motor.nombre} pasa a ${MOTOR[motor.proveedor]?.txt || motor.proveedor}`,
      description: avisos.length ? avisos.join(' ') : 'Toma efecto en el próximo mensaje. No hay que reiniciar nada.',
      duration: avisos.length ? 9000 : 4000,
    });
    setMotor(null);
    cargar(true);
  };

  const deshacerMotor = async (clave) => {
    const { error } = await supabase.rpc('equipo_motor_deshacer', { p_clave: clave });
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo deshacer', description: error.message });
      return;
    }
    toast({ title: 'Motor restaurado', description: 'Volvió a como estaba antes del último cambio.' });
    setMotor(null);
    cargar(true);
  };

  const abrirDetalle = async (id) => {
    const { data: res, error } = await supabase.rpc('equipo_trabajo_detalle', { p_trabajo_id: id });
    if (error) { toast({ variant: 'destructive', title: 'No se pudo abrir', description: error.message }); return; }
    setDetalle(res);
  };

  if (cargando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // El permiso lo decide la base. Esta pantalla solo lo enseña.
  if (data && data.permitido === false) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldCheck className="h-10 w-10 text-slate-300" />
        <p className="text-sm font-semibold text-slate-700">Este módulo es del dueño</p>
        <p className="max-w-md text-xs text-slate-500">
          El Equipo IA está limitado a las cuentas autorizadas. Si crees que deberías verlo,
          pídelo desde la cuenta del dueño.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-3 md:p-4">
      <Helmet><title>Equipo IA — MotoFlow</title></Helmet>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Equipo IA</h1>
          <p className="text-xs text-slate-500">
            Hermes coordina · Jarvis consulta MotoFlow · Comercial-Creativo prepara el contenido
          </p>
        </div>
        <Button variant="outline" onClick={() => {
          cargar();
          // El formulario de publicar relee el estado de las redes sin perder lo escrito.
          window.dispatchEvent(new CustomEvent('equipo-ia:actualizar'));
        }}>
          <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
        </Button>
      </div>

      {/* Lo primero que se mira cada mañana: arriba y en fila, las cinco
          de un vistazo. Antes vivía apilado en la columna de la izquierda y
          había que bajar la pantalla para ver el resto. */}
      <RecomendacionesDelDia
        trabajos={data?.trabajos}
        enfocar={enfocarPromo}
        onEncargado={() => cargar(true)}
        onUsar={(p) => {
          // Objeto nuevo cada vez: aceptar la misma pieza dos veces vuelve a
          // llenar el formulario.
          setPrefillPromo({ ...p, _en: Date.now() });
          setTimeout(() => document.getElementById('publicar-promocion')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
        }}
      />

      {/* Piezas sin foto: cinco al día. Sin foto no entran al Paso 1. */}
      <FotosDelDia />

      {/* Lo que se vende y no está: no se promociona y se pide. */}
      <AgotadosQueSeVenden />

      {/* Lo que Pedro Racing anuncia: la demanda que él crea, para pedirla o promocionarla ya. */}
      <AnunciosDelSuplidor onEncargado={() => cargar(true)} />

      {/* Cómo debe verse una promoción: las reglas que el Creativo lee y las
          piezas modelo que mira. Antes vivían separadas (una arriba, otra
          abajo) y había además "Tus referencias de diseño", que nunca se usó
          (0 imágenes al 01/10) y decía lo mismo que las piezas modelo. */}
      <div className="mb-4 grid items-start gap-3 lg:grid-cols-2">
        <EspecificacionesArte />
        <PiezasModelo />
      </div>

      {/* Lo mismo para video: reels que el dueño admira y la receta de cada uno. */}
      <ReelsModelo />

      <PromocionPublicar prefill={prefillPromo} />

      {/* El código de cada promoción y lo que vendió: dice qué red trae gente. */}
      <CodigosDePromocion />

      <section id="videos-metricool" className="mb-4 rounded-xl border bg-white p-4 shadow-sm" aria-label="Videos de TikTok y YouTube">
        <h3 className="text-xs font-bold text-slate-700">TikTok y YouTube publicados mediante Metricool</h3>
        <p className="mb-3 text-xs text-slate-500">Se muestran los {PUBLICACIONES_RECIENTES} videos más recientes de cada red. Su presencia aquí no significa que formaran parte de una orden de Hermes.</p>
        {errorMetricool ? (
          <p className="text-xs text-amber-700">No se pudo consultar el historial de Metricool en MotoFlow.</p>
        ) : videosMetricool.length === 0 ? (
          <p className="text-xs text-slate-500">Todavía no hay videos de TikTok o YouTube verificados en este registro.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {videosVisibles.map((video) => (
              <div key={video.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                <p className="truncate font-semibold text-slate-700"><Texto>{video.title || 'Video sin título'}</Texto></p>
                <p className="text-slate-500">
                  {video.platform === 'tiktok' ? 'TikTok · video vertical' : video.post_type === 'short' ? 'YouTube · Short' : 'YouTube · video'}
                </p>
                <p className="text-slate-400">
                  {video.published_at
                    ? `Publicado ${new Date(video.published_at).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' })}`
                    : `Fecha de publicación no informada · verificado ${new Date(video.verified_at).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' })}`}
                </p>
                <p className="font-semibold text-emerald-700">Publicado y verificado</p>
                <a className="text-blue-700 underline" href={enlaceVideoVerificado(video)} target="_blank" rel="noreferrer">Ver video</a>
              </div>
            ))}
          </div>
        )}
        {!errorMetricool && videosVisibles.length < videosMetricool.length && (
          <button type="button" className="mt-3 text-xs font-semibold text-blue-700 underline"
            onClick={() => setVerVideosAnteriores(true)}>
            Ver videos anteriores
          </button>
        )}
        {!errorMetricool && verVideosAnteriores && videosMetricool.length > 0 && (
          <button type="button" className="mt-3 text-xs font-semibold text-blue-700 underline"
            onClick={() => setVerVideosAnteriores(false)}>
            Ocultar videos anteriores
          </button>
        )}
      </section>

      {/* ── A · LAS TRES TARJETAS ──────────────────────────────────── */}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {agentes.map((a) => {
          const Icon = ICONO[a.clave] || Bot;
          return (
            <div key={a.clave} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start gap-3">
                <div className="rounded-lg bg-slate-100 p-2"><Icon className="h-5 w-5 text-slate-600" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-sm font-bold text-slate-800"><Texto>{a.nombre}</Texto></h2>
                    <Etiqueta mapa={ESTADO_AGENTE} valor={a.estado} />
                  </div>
                  <p className="text-[11px] text-slate-500"><Texto>{a.rol_visible}</Texto></p>
                </div>
              </div>

              {a.clave === 'jarvis' && (
                <div className="mb-2 inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                  <Database className="h-3 w-3" /> Acceso exclusivo a MotoFlow
                </div>
              )}

              <p className="mb-3 text-[11px] leading-snug text-slate-600"><Texto>{a.descripcion}</Texto></p>

              <dl className="space-y-1 border-t pt-2 text-[11px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Tarea actual</dt>
                  <dd className="truncate text-right text-slate-700">
                    <Texto>{a.tarea_actual || '—'}</Texto>
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Última actividad</dt>
                  <dd className="text-slate-700">{hace(a.ultima_actividad)}</dd>
                </div>
                {a.clave === 'comercial_creativo' && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Borradores pendientes</dt>
                    <dd className={`font-bold ${Number(a.borradores_pendientes) > 0 ? 'text-violet-700' : 'text-slate-700'}`}>
                      {a.borradores_pendientes || 0}
                    </dd>
                  </div>
                )}
              </dl>

              {/* ── EL MOTOR ────────────────────────────────────────
                  Solo aparece si la base ya tiene las columnas. Antes de
                  correr la migración la tarjeta se ve como siempre en vez
                  de enseñar un motor vacío. */}
              {a.proveedor && (
                <div className="mt-3 rounded-lg border bg-slate-50/70 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Motor</p>
                      <p className="truncate text-[11px] font-semibold text-slate-700">
                        <Texto>{MOTOR[a.proveedor]?.txt || a.proveedor}</Texto>
                        <span className="font-normal text-slate-500"> · {etiquetaModelo(a.proveedor, a.modelo)}</span>
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-[11px]"
                      onClick={() => abrirMotor(a)}>
                      <Cpu className="mr-1 h-3 w-3" /> Cambiar
                    </Button>
                  </div>

                  {/* Hermes no se atiende desde aquí: su proceso es el suyo. */}
                  {a.clave !== 'hermes' && (
                    <QuienAtiende
                      w={workers.find((w) => w.agente === a.clave)}
                      agente={a.clave}
                      ejecutaEn={a.ejecuta_en}
                      compacto
                    />
                  )}

                  {a.atiende_widget && a.proveedor_widget !== a.proveedor && (
                    <p className="mt-1 text-[10px] text-slate-500">
                      El botón flotante sigue con {MOTOR[a.proveedor_widget]?.txt || a.proveedor_widget}.
                    </p>
                  )}

                  {a.motor_email && (
                    <p className="mt-1 truncate text-[10px] text-slate-400">
                      Cambiado por <Texto>{a.motor_email}</Texto> {hace(a.motor_en)}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── D · APROBACIONES: solo si hay algo ──────────────────────
          Las promociones del panel se aprueban arriba, en el paso 2. Esta
          caja queda para lo que Hermes prepare por otro camino. */}
      {pendientes.length > 0 && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Esperando tu aprobación</h2>
            {pendientes.length > 0 && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                {pendientes.length}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {pendientes.map((ap) => (promoDelPanel(ap) ? (
              <div key={ap.id} className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <p className="text-xs font-bold text-slate-800"><Texto>{ap.trabajo_titulo || ap.accion}</Texto></p>
                <p className="mt-1 text-[11px] text-slate-600">
                  Las promociones se aprueban arriba, en el <b>paso 2</b>: ahí ves la imagen grande y, al
                  aprobarla, el formulario de publicar se llena solo.
                </p>
                <Button size="sm" variant="outline" className="mt-2"
                  onClick={() => setEnfocarPromo({ trabajoId: ap.trabajo_id, en: Date.now() })}>
                  Verla arriba
                </Button>
              </div>
            ) : (
              <div key={ap.id} className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800"><Texto>{ap.accion}</Texto></p>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                    ap.riesgo === 'alto' ? 'bg-red-100 text-red-700'
                      : ap.riesgo === 'bajo' ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'}`}>
                    riesgo {ap.riesgo}
                  </span>
                </div>
                <p className="mb-1 text-[11px] text-slate-600">
                  Lo preparó <b>{NOMBRE_CORTO[ap.preparado_por] || ap.preparado_por}</b>
                  {ap.revision_num > 1 ? ` · revisión ${ap.revision_num}` : ''}
                </p>
                {ap.motivo && <p className="mb-1 text-[11px] text-slate-600"><Texto>{ap.motivo}</Texto></p>}
                {ap.impacto && (
                  <p className="mb-2 text-[11px] text-slate-500">Impacto: <Texto>{ap.impacto}</Texto></p>
                )}

                {ap.contenido && Object.keys(ap.contenido).length > 0 && (
                  <BorradorPromocion contenido={ap.contenido} aprobacionId={ap.id}
                    onGuardado={() => cargar(true)} />
                )}

                {cambios.id === ap.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={cambios.texto}
                      onChange={(e) => setCambios({ id: ap.id, texto: e.target.value })}
                      placeholder="Qué hay que cambiar"
                      rows={2}
                      className="text-xs"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1"
                        onClick={() => decidir(ap.id, 'changes_requested', cambios.texto)}>
                        Enviar cambios
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCambios({ id: null, texto: '' })}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => decidir(ap.id, 'approved')}>
                      <Check className="mr-1 h-3 w-3" /> Aprobar
                    </Button>
                    {/* El orden importa: "pedir cambios" es lo que se
                        quiere nueve de cada diez veces, y descartar cierra
                        el trabajo entero. Poner el rojo en medio invitaba a
                        usarlo para decir "esto no me gusta". */}
                    <Button size="sm" variant="outline" className="flex-1"
                      onClick={() => setCambios({ id: ap.id, texto: '' })}>
                      Pedir cambios
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 border-red-200 text-red-700"
                      title="Cierra el trabajo entero. Si solo quieres otra versión, usa Pedir cambios."
                      onClick={() => decidir(ap.id, 'rejected')}>
                      <X className="mr-1 h-3 w-3" /> Descartar todo
                    </Button>
                  </div>
                )}
              </div>
            )))}
          </div>
        </div>
      )}

      {/* ── C/E · BITÁCORA DEL EQUIPO ─────────────────────────────────
          (01/10) Trabajos activos, Historial, "Pedirle algo" y las órdenes
          de publicación repetían lo de arriba: los 9 trabajos de 30 días
          fueron promociones del panel, que ya se siguen en la tarjeta del
          encargo y en el Paso 4. Aquí quedan para lo único que solo se hace
          aquí: ver por qué falló, reintentar o cancelar. Se abre sola si
          algo está atascado o falló. */}
      <details className="mb-4 rounded-xl border bg-white shadow-sm" open={bitacoraAbierta}
        onToggle={(e) => setBitacoraAbierta(e.currentTarget.open)}>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm font-bold text-slate-800">
          <ClipboardList className="h-4 w-4 text-slate-500" />
          Bitácora del equipo
          <span className="text-[11px] font-normal text-slate-400">
            {activos.length} en curso · {trabajos.length} en el historial
          </span>
          {problemas > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              {problemas} con problema
            </span>
          )}
        </summary>
        <div className="grid gap-4 border-t p-4 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            {activos.length > 0 && (
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-800">Trabajos activos</h2>
                  <span className="text-[11px] text-slate-400">{activos.length} en curso</span>
                </div>

                <div className="space-y-2">
                  {activos.map((t) => {
                    const atasco = atascos.find((a) => a.id === t.id);
                    return (
                    <div key={t.id} className={`rounded-lg border p-3 hover:border-blue-200 ${
                      atasco ? 'border-amber-300 bg-amber-50/40' : ''}`}>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Etiqueta mapa={ESTADO_TRABAJO} valor={t.estado} />
                        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
                          <Texto>{t.titulo}</Texto>
                        </p>
                        <span className="text-[10px] text-slate-400"><Clock className="mr-1 inline h-3 w-3" />{hace(t.creado_en)}</span>
                      </div>

                      {/* ── EL RELOJ ────────────────────────────────────────
                          Sin esto, un trabajo parado 25 horas se veía igual
                          que uno parado 25 segundos: los dos ponían "en
                          curso". Pasó el 14/08 y se descubrió al día
                          siguiente mirando una captura de pantalla. */}
                      {atasco && (
                        <p className="mb-2 flex items-start gap-1 rounded bg-amber-100/70 p-2 text-[10px] font-semibold text-amber-900">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          Atascado: {tiempoParado(atasco.minutos)} sin moverse
                          {atasco.lo_tiene ? <> · lo tiene <b>{NOMBRE_CORTO[atasco.lo_tiene] || atasco.lo_tiene}</b></> : null}
                        </p>
                      )}

                      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                        {t.esperando_a && <span>Esperando a <b>{NOMBRE_CORTO[t.esperando_a] || t.esperando_a}</b></span>}
                        <span>{t.mensajes} mensajes internos</span>
                        {Number(t.intentos) > 1 && <span className="text-amber-600">{t.intentos} intentos</span>}
                        {Number(atasco?.rondas) > 0 && (
                          <span className="text-violet-700">
                            correcciones: {atasco.rondas} de {atasco.max_rondas}
                          </span>
                        )}
                      </div>

                      {t.error && (
                        <p className="mb-2 flex items-start gap-1 rounded bg-red-50 p-2 text-[10px] text-red-700">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><Texto>{t.error}</Texto>
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => abrirDetalle(t.id)}>
                          Ver historial <ChevronRight className="ml-1 h-3 w-3" />
                        </Button>
                        {t.estado === 'failed' && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px]"
                            onClick={() => accionTrabajo(t.id, 'reintentar')}>
                            <RotateCcw className="mr-1 h-3 w-3" /> Reintentar
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-[11px] text-slate-500"
                          onClick={() => accionTrabajo(t.id, 'cancelar')}>
                          <Ban className="mr-1 h-3 w-3" /> Cancelar
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-bold text-slate-800">Historial</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[11px]">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="pb-2 font-medium">Trabajo</th>
                      <th className="pb-2 font-medium">Estado</th>
                      <th className="pb-2 font-medium">Pedido</th>
                      <th className="pb-2 font-medium">Terminado</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {trabajos.length === 0 && (
                      <tr><td colSpan={5} className="py-4 text-center text-slate-400">Sin historial todavía.</td></tr>
                    )}
                    {trabajos.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="max-w-[220px] truncate py-2 text-slate-700"><Texto>{t.titulo}</Texto></td>
                        <td className="py-2"><Etiqueta mapa={ESTADO_TRABAJO} valor={t.estado} /></td>
                        <td className="py-2 text-slate-500">{hace(t.creado_en)}</td>
                        <td className="py-2 text-slate-500">{t.terminado_en ? hace(t.terminado_en) : '—'}</td>
                        <td className="py-2 text-right">
                          <button type="button" onClick={() => abrirDetalle(t.id)}
                            className="text-blue-600 hover:underline">ver</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <MessageSquarePlus className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-800">Pedirle algo al equipo</h2>
              </div>
              <p className="mb-2 text-[11px] text-slate-500">
                Le hablas a Hermes. Él decide si necesita a Jarvis, al Comercial-Creativo, o a ninguno.
              </p>
              <Textarea
                value={peticion}
                onChange={(e) => setPeticion(e.target.value)}
                placeholder="Ej.: prepara la promoción de hoy con dos productos"
                rows={3}
                className="mb-2 text-sm"
                aria-label="Petición para Hermes"
              />
              <Button onClick={pedir} disabled={enviando || !peticion.trim()} className="w-full">
                {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar a Hermes
              </Button>
              <p className="mt-2 text-[10px] text-slate-400">
                Se abre el chat flotante con Hermes y te contesta ahí mismo.
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h3 className="mb-1 text-xs font-bold text-slate-700">Órdenes de Equipo IA</h3>
              <p className="mb-2 text-xs text-slate-500">Se muestran las {PUBLICACIONES_RECIENTES} órdenes más recientes con todos sus destinos.</p>
              {errorDestinos ? (
                <p className="text-xs text-amber-700">No se pudo consultar el estado de las publicaciones. Actualiza la página o revisa el acceso.</p>
              ) : destinos.length === 0 ? (
                <p className="text-xs text-slate-500">Todavía no hay destinos registrados en este módulo.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {destinosVisibles.map((d) => (
                    <div key={d.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                      <p className="truncate font-semibold text-slate-700"><Texto>{d.hermes_publication_jobs?.title || 'Publicación'}</Texto></p>
                      <p className="text-slate-500 capitalize"><Texto>{d.platform}</Texto> · <Texto>{d.placement}</Texto></p>
                      <p className="text-slate-400">Actualizado {hace(d.updated_at)}</p>
                      <p className={`font-semibold ${d.status === 'published' ? 'text-emerald-700' : d.status === 'failed' ? 'text-red-700' : 'text-amber-700'}`}>
                        {ESTADO_PUBLICACION[d.status] || d.status}
                      </p>
                      {d.status === 'published' && d.external_url && (
                        <a className="text-blue-700 underline" href={d.external_url} target="_blank" rel="noreferrer">Ver publicación</a>
                      )}
                      {d.status === 'failed' && d.error_message && <p className="mt-1 text-red-700"><Texto>{d.error_message}</Texto></p>}
                    </div>
                  ))}
                </div>
              )}
              {!errorDestinos && destinosVisibles.length < destinos.length && (
                <button type="button" className="mt-3 text-xs font-semibold text-blue-700 underline"
                  onClick={() => setVerOrdenesAnteriores(true)}>
                  Ver órdenes anteriores
                </button>
              )}
              {!errorDestinos && verOrdenesAnteriores && destinos.length > 0 && (
                <button type="button" className="mt-3 text-xs font-semibold text-blue-700 underline"
                  onClick={() => setVerOrdenesAnteriores(false)}>
                  Ocultar órdenes anteriores
                </button>
              )}
            </div>
          </div>
        </div>
      </details>

      {/* ── CAMBIARLE EL MOTOR A UN AGENTE ────────────────────────── */}
      <Dialog open={!!motor} onOpenChange={(v) => !v && setMotor(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Motor de <Texto>{motor?.nombre}</Texto>
            </DialogTitle>
          </DialogHeader>

          {motor && (
            <div className="space-y-4">
              {/* Los tres, con lo que cada uno cuesta y lo que exige. */}
              <div className="space-y-2">
                {Object.entries(MOTOR).map(([clave, m]) => {
                  const Icon = m.icono;
                  const puesto = motor.proveedor === clave;
                  return (
                    <button
                      key={clave}
                      type="button"
                      onClick={() => setMotor((s) => ({ ...s, proveedor: clave, modelo: '' }))}
                      className={`flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition ${
                        puesto ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${puesto ? 'text-blue-600' : 'text-slate-400'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800">{m.txt}</p>
                        <p className="text-[11px] leading-snug text-slate-600">{m.resumen}</p>
                        <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{m.requisito}</p>
                      </div>
                      {puesto && <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
                    </button>
                  );
                })}
              </div>

              {/* Lo que el diálogo daba a entender mal: que solo la
                  suscripción necesita worker. */}
              <p className="rounded-lg bg-slate-50 p-2 text-[10px] leading-snug text-slate-500">
                Con cualquiera de los tres, la cola la atiende el worker de tu PC. Lo que cambia
                es de dónde sale el modelo y quién paga.
              </p>

              {/* Con la suscripción no hay modelo que elegir: lo decide la
                  sesión de Claude Code. Enseñar un desplegable muerto sería
                  hacer creer que ahí se decide algo. */}
              {motor.proveedor === 'claude_suscripcion' ? (
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[11px] text-slate-600">
                    Con la suscripción, el modelo lo decide tu sesión de Claude Code.
                  </p>
                  {/* La pregunta que trae a todo el mundo aquí: ¿CUÁL de mis
                      cuentas contesta? No se elige en el navegador, así que
                      al menos se dice cuál es y con qué se cambia. */}
                  <p className="mt-1 text-[11px] font-semibold text-slate-700">
                    ¿Con cuál de tus cuentas?
                  </p>
                  <p className="text-[11px] text-slate-600">
                    Con la que esté iniciada en la PC que corre el worker — no se elige desde aquí.
                    El agente tiene su propia sesión, aparte de la tuya de VS Code:
                  </p>
                  <code className="mt-1 block rounded bg-white px-2 py-1 text-[11px]">npm run equipo:login</code>
                  {motor.clave !== 'hermes' && (
                    <div className="mt-2">
                      <QuienAtiende w={workers.find((w) => w.agente === motor.clave)} agente={motor.clave} />
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600" htmlFor="motor-modelo">
                    Modelo
                  </label>
                  <select
                    id="motor-modelo"
                    value={motor.modelo}
                    onChange={(e) => setMotor((s) => ({ ...s, modelo: e.target.value }))}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                  >
                    <option value="">Por defecto del worker</option>
                    {modelos.filter((m) => m.proveedor === motor.proveedor).map((m) => (
                      <option key={m.modelo} value={m.modelo}>{m.etiqueta}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] leading-snug text-slate-500">
                    <Texto>
                      {modelos.find((m) => m.proveedor === motor.proveedor && m.modelo === motor.modelo)?.nota
                        || 'Sin modelo fijo: cada worker usa el suyo por defecto.'}
                    </Texto>
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600" htmlFor="motor-temp">
                    Soltura al escribir
                  </label>
                  <input
                    id="motor-temp" type="range" min="0" max="1" step="0.05"
                    value={motor.temperatura}
                    onChange={(e) => setMotor((s) => ({ ...s, temperatura: e.target.value }))}
                    className="w-full"
                  />
                  <p className="text-[10px] text-slate-500">
                    {Number(motor.temperatura).toFixed(2)} — {Number(motor.temperatura) <= 0.2
                      ? 'literal, para consultar datos'
                      : Number(motor.temperatura) >= 0.7 ? 'suelto, puede irse de tono' : 'equilibrado'}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600" htmlFor="motor-tokens">
                    Largo máximo
                  </label>
                  <input
                    id="motor-tokens" type="number" min="100" max="8000" step="100"
                    value={motor.max_tokens}
                    onChange={(e) => setMotor((s) => ({ ...s, max_tokens: e.target.value }))}
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                  />
                  <p className="text-[10px] text-slate-500">tokens por respuesta</p>
                </div>
              </div>

              {motor.atiende_widget && motor.proveedor === 'claude_suscripcion' && (
                <p className="flex items-start gap-1 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Jarvis también atiende el botón flotante, y ese corre en el servidor de Supabase:
                  no hay cuenta con la que autenticar tu suscripción. Ese botón se queda con OpenAI
                  para no dejar sin respuesta a la gente del mostrador.
                </p>
              )}

              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button onClick={guardarMotor} disabled={guardandoMotor} className="flex-1">
                  {guardandoMotor ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Guardar
                </Button>
                {motor.puede_deshacer && (
                  <Button variant="outline" onClick={() => deshacerMotor(motor.clave)}>
                    <Undo2 className="mr-1 h-3.5 w-3.5" /> Deshacer el último
                  </Button>
                )}
                <Button variant="outline" onClick={() => setMotor(null)}>Cancelar</Button>
              </div>

              <p className="text-[10px] text-slate-400">
                Toma efecto en el próximo mensaje: el worker relee esto cada vez. Queda registrado
                con tu correo y la hora.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── EL HILO DE UN TRABAJO ─────────────────────────────────── */}
      <Dialog open={!!detalle} onOpenChange={(v) => !v && setDetalle(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              <Texto>{detalle?.trabajo?.titulo || 'Trabajo'}</Texto>
            </DialogTitle>
          </DialogHeader>

          {detalle?.trabajo && (
            <p className="mb-3 rounded bg-slate-50 p-2 text-[11px] text-slate-600">
              <Texto>{detalle.trabajo.peticion}</Texto>
            </p>
          )}

          <div className="space-y-2">
            {(detalle?.mensajes || []).map((m) => (
              <div key={m.id} className="rounded-lg border p-2 text-[11px]">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-700">
                    {NOMBRE_CORTO[m.from_agent] || m.from_agent} → {NOMBRE_CORTO[m.to_agent] || m.to_agent}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{m.message_type}</span>
                  <Etiqueta mapa={ESTADO_TRABAJO} valor={m.status} />
                  <span className="ml-auto text-[10px] text-slate-400">{hace(m.created_at)}</span>
                </div>
                <p className="text-slate-600"><Texto>{m.summary}</Texto></p>
                {m.error && <p className="mt-1 rounded bg-red-50 p-1 text-red-700"><Texto>{m.error}</Texto></p>}
                {m.resultado && (
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 p-1 text-[10px]">
                    {JSON.stringify(m.resultado, null, 1)}
                  </pre>
                )}
              </div>
            ))}
          </div>

          {(detalle?.aprobaciones || []).length > 0 && (
            <div className="mt-3 border-t pt-3">
              <h3 className="mb-2 text-xs font-bold text-slate-700">Decisiones</h3>
              {detalle.aprobaciones.map((a) => (
                <p key={a.id} className="text-[11px] text-slate-600">
                  <b>{a.estado}</b> · <Texto>{a.accion}</Texto>
                  {a.decidido_email ? ` · ${a.decidido_email}` : ''}
                  {a.decidido_en ? ` · ${new Date(a.decidido_en).toLocaleString('es-DO')}` : ''}
                </p>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <p className="mt-4 text-center text-[10px] text-slate-400">
        La publicación automática está deshabilitada. Nada sale a redes sin tu aprobación.
      </p>
    </div>
  );
};

export default EquipoIAPage;
