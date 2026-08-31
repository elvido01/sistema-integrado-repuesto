import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Settings2, MessageSquare, Maximize2, Minimize2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { BarraVozHermes, ReproductorVoz, pararTodoAudio } from '@/components/jarvis/VozHermes';
import { ImagenHermes, ImagenPorUrl, urlDeImagenEnTexto } from '@/components/jarvis/ImagenHermes';
import * as vozEspejo from '@/lib/vozEspejo';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { hablar, callar, listarVoces, vozElegida, elegirVoz, alListarVoces, ajustes, guardarAjustes } from '@/lib/vozJarvis';
import { leerContexto, leerModulos, contextoParaAgente } from '@/lib/pantallaContexto';
import { transcribir, elegirTexto } from '@/lib/oidoJarvis';
import { glosarioDeAhora, terminosDeAhora } from '@/lib/jarvisContexto';
import { corregirConGlosario } from '@/lib/glosarioVoz';
import { ordenarPantalla, normalizarOrdenVenta } from '@/lib/puenteAgente';
import { usePanels } from '@/contexts/panelCore';

const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition || null;

// Cuánto dura una conversación con Jarvis antes de empezar limpia. Una
// jornada de tienda; lo de ayer no tiene por qué opinar sobre lo de hoy.
const HORAS_SESION = 12;

// ── Cuando el que falla es el MOTOR del agente, no MotoFlow ──────────
// (2026-08-16) Se le pidió una cotización a Hermes y contestó "The model
// provider is rate-limiting requests. Please wait a moment and try again."
// Es verdad y está bien que se vea tal cual, pero está en inglés, no dice de
// quién es la culpa, y sobre todo no dice qué hacer — mientras el otro agente
// está a un clic, funcionando.
//
// Se detecta por lo que dice el proveedor, no por un código: estos mensajes
// llegan como texto dentro de la respuesta y no hay campo que los marque.
// Por eso la lista es de frases y no de números.
export function sinMotor(texto) {
  const t = String(texto || '').toLowerCase();
  if (t.length > 400) return false;   // una respuesta larga no es un error
  return /rate-limit|rate limit|quota|credit balance|insufficient_quota|overloaded|too many requests|429|no tiene cr[eé]dito/.test(t);
}

// ¿Lo que se dijo es un sí, un no, o ninguna de las dos?
//
// La versión anterior buscaba "no" suelto y cancelaba la propuesta con
// cualquier frase que lo contuviera — "no, espérate" la descartaba antes de
// que la persona alcanzara a decidir. En español el "no" aparece por todas
// partes, así que no sirve como señal.
//
// Ahora la respuesta tiene que ser CORTA y ser básicamente la palabra sola.
// Una frase larga es una pregunta, no una decisión: la propuesta se queda en
// pantalla y la persona resuelve con el botón. Ante la duda, no se toca.
// ¿Lo que se oyó es el propio agente devuelto por el altavoz?
//
// Se compara por palabras compartidas y no por texto exacto, porque el
// reconocimiento deforma lo que oye: "por un farol" volvió como "por un
// ofarot". Con la mitad de las palabras en común ya es eco.
function esEcoDeLoQueDijo(oido, dicho) {
  if (!dicho) return false;
  const norm = (s) => String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);

  const a = norm(oido);
  if (a.length === 0) return false;
  const b = new Set(norm(dicho));
  if (b.size === 0) return false;

  const comunes = a.filter((w) => b.has(w)).length;
  return comunes / a.length >= 0.5;
}

export function veredictoDeVoz(texto) {
  const t = String(texto).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // Más de cinco palabras ya no es un "sí": es una instrucción nueva.
  if (t.split(' ').length > 5) return null;

  // El NO se mira primero: "no autorizo" empieza por una palabra de rechazo y
  // no puede caer nunca del otro lado por un descuido del orden.
  //
  // Solo lo inequívoco. "espera" y "para" quedan FUERA a propósito: quien
  // dice "espera" quiere pensarlo, no descartar. Ante la duda no se toca la
  // propuesta y decide con el botón.
  if (/^(no|no gracias|no autorizo|no lo hagas|dejalo|olvidalo|borralo)$/.test(t)) return 'no';
  if (/^(no\s+)?(lo\s+|la\s+)?(cancel|descart|anul|rechaz)\w*(\s+(lo|la|eso|esa|esta|este))?$/.test(t)) return 'no';

  if (/^(si|ok|oka|okay|okey|dale|hazlo|grabalo|adelante|correcto|procede|listo)$/.test(t)) return 'si';
  // Por RAÍZ y no por lista cerrada. (2026-08-16) La lista tenía "autorizo" y
  // "autorizado" pero no "autorízalo", que es como lo dice la gente: se fue al
  // modelo, que contestó proponiendo una cotización de otro cliente. Una
  // palabra de más en la conjugación no puede costar eso.
  // Cubre autorizo/autorizalo/autorizala/autorizarlo, apruebalo, confirmalo.
  // El pronombre puede ir DELANTE o DETRÁS: el dictado por voz parte
  // "autorízalo" en dos palabras — "autoriza lo" — y así llegó escrito.
  if (/^(si,?\s+)?(lo\s+|la\s+)?(autoriz|aprueb|aprob|confirm)\w*(\s+(lo|la|eso|esa|esta|este))?$/.test(t)) return 'si';

  return null;
}

const formatVoiceError = async (err) => {
  const rawMessage = err?.message || String(err || '');

  if (err?.context && typeof err.context.json === 'function') {
    try {
      const details = await err.context.clone().json();
      return details?.mensaje || details?.error || rawMessage;
    } catch {
      // Some Supabase function errors do not expose a readable JSON body.
    }
  }

  if (/Failed to send a request to the Edge Function/i.test(rawMessage)) {
    return 'No pude conectar con MotoFlow IA CEO.';
  }

  return rawMessage || 'No pude consultar el sistema.';
};

export default function JarvisAdminAssistant() {
  const { profile, isSuperAdmin } = useAuth();
  const { openPanel } = usePanels();
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // Modo voz a pantalla completa: la esfera y tres botones, nada más. El
  // círculo flotante sigue existiendo para el uso rápido; esto es para
  // cuando alguien se sienta a conversar y no quiere ver el sistema detrás.
  const [modoLive, setModoLive] = useState(false);
  // Si ya saludó en ESTA conversación. Se reinicia al cambiar de agente,
  // porque hablar con Hermes y hablar con Jarvis son dos conversaciones.
  const yaSaludoRef = useRef(false);
  // El botón del altavoz. Silencia la voz pero NO la conversación: se sigue
  // escuchando y respondiendo, solo que leyendo en vez de oyendo.
  const [mudo, setMudo] = useState(false);
  const [loading, setLoading] = useState(false);
  // En qué paso va. El adaptador ya lo escribe en hermes_chat.estado_detalle
  // en cada envío no final; hasta ahora la pantalla no lo miraba y una
  // promoción de tres minutos parecía un cuelgue.
  const [paso, setPaso] = useState('');
  // El borrador que el equipo dejó esperando firma. Se decide aquí mismo: si
  // Hermes te lo trae al chat y para aprobarlo hay que irse a otra pantalla,
  // no te lo ha entregado del todo.
  const [borrador, setBorrador] = useState(null);
  // La ventana chica basta para preguntar un precio, pero no para leer un
  // borrador con tres copys y una pieza montada. Se agranda y se queda así.
  const [chatGrande, setChatGrande] = useState(false);
  // Y si aun asi el boton se pierde de vista —una pantalla rara, un zoom del
  // navegador—, Escape la devuelve a su tamaño. Siempre tiene que haber una
  // salida que no dependa de acertarle a un icono.
  useEffect(() => {
    if (!chatGrande) return undefined;
    const alTeclear = (e) => { if (e.key === 'Escape') setChatGrande(false); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [chatGrande]);
  const [firmando, setFirmando] = useState(false);
  // "Cambios" sin decir QUE cambiar es un boton mudo: el creativo remonta de
  // memoria y vuelve a entregar lo mismo. Se pide el texto antes de mandarlo.
  const [pidiendoCambios, setPidiendoCambios] = useState(false);
  const [notaCambios, setNotaCambios] = useState('');
  const [lastMessage, setLastMessage] = useState('');
  const [error, setError] = useState('');
  // La sesión se recuerda entre recargas. Sin esto, cada F5 empezaba una
  // conversación nueva: el historial seguía en la base pero sin su
  // identificador no había forma de volver a encontrarlo, y además Jarvis
  // perdía el hilo de lo que se venía hablando.
  //
  // >>> PERO NO PARA SIEMPRE <<<
  // (2026-08-17) `jarvis_sesion` no caducaba nunca. La del dueño llevaba
  // OCHO DÍAS y 130 mensajes, y una conversación de ocho días no es una
  // conversación: es un archivo. Aunque el historial se lea bien —que hasta
  // hoy tampoco—, arrastrar el cliente y la pieza de anteayer hasta la frase
  // de ahora es justo lo que hacía que "autoriza lo" autorizara lo de otro.
  //
  // Doce horas: se cierra la tienda y al día siguiente se empieza limpio.
  // Lo de antes no se borra, sigue entero en la base; solo deja de pesar.
  const [sessionId, setSessionId] = useState(() => {
    try {
      const id = localStorage.getItem('jarvis_sesion');
      if (!id) return null;
      const desde = Number(localStorage.getItem('jarvis_sesion_ts') || 0);
      if (!desde || Date.now() - desde > HORAS_SESION * 3600_000) {
        localStorage.removeItem('jarvis_sesion');
        localStorage.removeItem('jarvis_sesion_ts');
        return null;
      }
      return id;
    } catch { return null; }
  });
  const sesionRef = useRef(null);
  sesionRef.current = sessionId;
  const recognitionRef = useRef(null);
  const clearBubbleTimerRef = useRef(null);
  const [voces, setVoces] = useState([]);
  const [vozSel, setVozSel] = useState(vozElegida() || '');
  const [verVoces, setVerVoces] = useState(false);
  const [aj, setAj] = useState(ajustes());
  // El agente lo define CADA empresa. Hermes es el de Repuestos Morla, no el
  // del sistema: Caminero y MotoPréstamos tendrán el suyo. Mientras no lo
  // definan, no hay botón — mejor sin asistente que con uno genérico que no
  // conoce el negocio.
  const [agente, setAgente] = useState(null);
  const [cargandoAgente, setCargandoAgente] = useState(true);

  useEffect(() => {
    let vivo = true;
    supabase.rpc('get_agente_ia')
      .then(({ data }) => { if (vivo) { setAgente(data || null); setCargandoAgente(false); } })
      .catch(() => { if (vivo) setCargandoAgente(false); });
    return () => { vivo = false; };
  }, [profile?.tenant_id]);

  // El de la empresa (Hermes en Morla) y el del sistema (Jarvis) son dos
  // agentes distintos, y el nombre en pantalla tiene que seguir al canal.
  // Poniendo siempre el de la empresa, el respaldo se hacía pasar por él.
  const [agenteSistema, setAgenteSistema] = useState(null);
  useEffect(() => {
    let vivo = true;
    supabase.rpc('get_agente_sistema')
      .then(({ data }) => { if (vivo) setAgenteSistema(data || null); })
      .catch(() => { /* sin Jarvis definido: se queda el nombre por defecto */ });
    return () => { vivo = false; };
  }, []);

  // ── La conversación ───────────────────────────────────────────────────
  // El círculo solo hablaba: contestaba y la burbuja se borraba. Sin hilo
  // visible no es un canal de comunicación, es un altavoz. La conversación
  // ya se guardaba en ai_chat_messages; solo faltaba mostrarla.
  const [chatAbierto, setChatAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const finRef = useRef(null);
  // Hasta hoy Hermes solo hablaba cuando le hablaban, así que un mensaje
  // suyo siempre llegaba con la pantalla abierta y mirándola. Los
  // centinelas cambian eso: avisan solos, a cualquier hora, y sin este
  // contador el aviso caería dentro de una ventana cerrada que nadie abre.
  const [noLeidos, setNoLeidos] = useState(0);
  // El sondeo se arma una sola vez y se queda con el `chatAbierto` de ese
  // render — para siempre false. La referencia sí la ven todos los
  // closures. Es el mismo motivo por el que `loading` no sirve de candado
  // en el dictado, unas líneas más abajo.
  const chatAbiertoRef = useRef(false);
  // Quién contestó SEGÚN EL BACKEND. Si viene null, respondió el asesor
  // genérico porque la tabla agentes_ia está vacía — y eso hay que verlo,
  // no adivinarlo.
  const [agenteQueContesto, setAgenteQueContesto] = useState(undefined);

  // ── El canal ──────────────────────────────────────────────────────────
  // 'hermes' es el Hermes DE VERDAD, el que corre fuera de MotoFlow con su
  // propia memoria — desde el 11/08/2026 en un servidor de Hostinger, antes
  // en la PC de la tienda. 'local' es el asistente del servidor: contesta al
  // instante pero es otro programa, sin esa memoria.
  const [canal, setCanal] = useState('hermes');
  const [hermesVivo, setHermesVivo] = useState(null);   // null = averiguando

  // Quién es el que está al otro lado AHORA. Todo lo que se ve en pantalla
  // —el nombre, el saludo, el marcador de agua— sale de aquí.
  const agenteActivo = canal === 'hermes' ? agente : (agenteSistema || agente);
  const nombreAgente = agenteActivo?.nombre || 'Asistente';
  // Los rótulos decían "Hermes" escrito a mano. Con un agente por empresa eso
  // solo es cierto en Repuestos Morla: el de Caminero se llamará de otra
  // forma y leería el nombre ajeno en su propia pantalla.
  const nombreEmpresa = agente?.nombre || 'el agente de la empresa';
  const nombreSistema = agenteSistema?.nombre || 'Jarvis';

  // Cada canal muestra SU conversación. Mezclarlas fue un error: se leía
  // "JARVIS" arriba y debajo las respuestas de Hermes, que son otra memoria y
  // otro interlocutor. Cambiar de canal es cambiar con quién hablas, no
  // seguir la misma charla con otra voz.
  const mensajesDelCanal = useMemo(
    () => mensajes.filter((m) => (m.canalDe || 'hermes') === canal),
    [mensajes, canal],
  );

  useEffect(() => {
    if (!agente) return;
    let vivo = true;
    const mirar = () => supabase.rpc('hermes_estado_canal')
      .then(({ data }) => { if (vivo) setHermesVivo(!!data?.conectado); })
      .catch(() => { if (vivo) setHermesVivo(false); });
    mirar();
    const t = setInterval(mirar, 30000);
    return () => { vivo = false; clearInterval(t); };
  }, [agente]);

  // El micrófono NO sobrevive al widget. `interrumpir` y `stopListening`
  // ya lo sueltan, pero cerrar la pestaña con el dictado abierto no pasa
  // por ninguno de los dos.
  //
  // Va AQUÍ y no junto a cerrarDictado, que es donde lo puse primero: más
  // abajo hay un `return null` cuando el usuario no tiene permiso, y un
  // hook después de un return temprano cambia de número entre renders.
  // React lanza el error #310 y se lleva la pantalla entera por delante.
  useEffect(() => () => { vozEspejo.cancelar(); }, []);

  // La conversación que YA existe. Sin esto, recargar la página la borraba de
  // la vista aunque siguiera entera en la base — y con Hermes tardando lo que
  // tarda, uno recarga.
  // Son DOS almacenes, uno por cada interlocutor: lo de Hermes vive en
  // hermes_chat y lo de Jarvis en ai_chat_messages. Cargar solo el primero
  // hacía que la conversación con Jarvis pareciera perdida al recargar —
  // estaba entera en la base (1,760 mensajes), pero nadie la iba a buscar.
  useEffect(() => {
    if (!agente) return;
    let vivo = true;

    (async () => {
      const [conHermes, conJarvis] = await Promise.all([
        supabase.from('hermes_chat').select(columnasChat(true))
          .order('id', { ascending: false }).limit(30),
        sesionRef.current
          ? supabase.from('ai_chat_messages').select('id, role, content, created_at')
              .eq('session_id', sesionRef.current)
              .order('created_at', { ascending: false }).limit(30)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!vivo) return;

      // El error se descartaba y "sin permiso" se veía igual que "sin
      // mensajes". No son lo mismo y hay que poder distinguirlos.
      const e = conHermes.error || conJarvis.error;
      if (e) {
        if (/imagen_id/.test(e.message || '')) { sinImagenRef.current = true; return; }
        if (/acciones/.test(e.message || '')) { sinAccionesRef.current = true; return; }
        setError(`No puedo leer la conversación: ${e.message}`);
        return;
      }

      const burbujas = [];
      for (const f of conHermes.data || []) {
        burbujas.push({
          id: idBurbuja(f),
          role: f.rol === 'hermes' ? 'assistant' : 'user',
          content: f.texto,
          de: f.rol === 'hermes' ? 'hermes' : undefined,
          canalDe: 'hermes',
          imagenId: f.imagen_id || undefined,
          en: f.creado_en,
        });
        if (f.id > ultimoIdRef.current) ultimoIdRef.current = f.id;
      }
      for (const m of conJarvis.data || []) {
        burbujas.push({
          id: `a-${m.id}`,
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
          de: m.role === 'user' ? undefined : 'local',
          canalDe: 'local',
          en: m.created_at,
        });
      }
      if (!burbujas.length) return;

      burbujas.sort((a, b) => new Date(a.en) - new Date(b.en));
      const ultimas = burbujas.slice(-60);
      for (const b of ultimas) idsVistosRef.current.add(b.id);
      setMensajes(ultimas);
    })();

    return () => { vivo = false; };
  }, [agente]);

  // DOS caminos para lo mismo, a propósito.
  //
  // Realtime es el rápido, pero se probó insertando una respuesta a mano con
  // la pantalla abierta y no llegó nada. Mientras no se sepa por qué, no se
  // puede colgar de él lo único que hace visible una respuesta: la persona se
  // queda mirando "pensando..." con la contestación ya grabada en la base.
  //
  // El sondeo cada 4 segundos es feo y funciona. Cuando llegan por los dos,
  // el segundo se descarta por id.
  useEffect(() => {
    if (!agente) return;
    let vivo = true;

    const traer = () => supabase.from('hermes_chat')
      .select(columnasChat(false))
      .gt('id', ultimoIdRef.current)
      .order('id').limit(30)
      .then(({ data, error: e }) => {
        if (!vivo) return;
        if (e) {
          if (/imagen_id/.test(e.message || '')) { sinImagenRef.current = true; return; }
          if (/message_type|media_id/.test(e.message || '')) { sinVozRef.current = true; return; }
          if (/acciones/.test(e.message || '')) { sinAccionesRef.current = true; return; }
          setError(`No puedo leer la conversación: ${e.message}`);
          return;
        }
        incorporar(data);
      });

    const sub = supabase
      .channel('hermes-chat-motoflow')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hermes_chat', filter: 'rol=eq.hermes' },
        ({ new: fila }) => incorporar([fila]))
      .subscribe();

    const t = setInterval(traer, 4000);
    return () => { vivo = false; clearInterval(t); supabase.removeChannel(sub); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agente]);

  // ── LA TARJETA DE HERMES ────────────────────────────────────────
  // (2026-08-29) Las propuestas de Jarvis vienen DENTRO de su respuesta y se
  // pintan al momento. Las de Hermes no pueden: él contesta por hermes_chat
  // desde el VPS y la fila de agente_acciones se queda ahí sin que nadie la
  // mire. Sin esto, Hermes propone y en pantalla no pasa nada — que desde
  // fuera se ve igual que si no hubiera hecho nada.
  //
  // Solo levanta la tarjeta si no hay otra puesta: dos a la vez no se pueden
  // atender y la segunda taparía a la primera.
  const idPropuestaVistaRef = useRef(null);
  useEffect(() => {
    if (!agente) return;
    let vivo = true;

    const mirar = () => supabase.rpc('agente_accion_pendiente').then(({ data, error: e }) => {
      if (!vivo || e || !data) return;
      if (propuestaRef.current) return;
      if (idPropuestaVistaRef.current === data.accion_id) return;   // ya se descartó
      idPropuestaVistaRef.current = data.accion_id;
      setPropuesta(data);
      setClave('');
      // Una autorización no puede quedar escondida detrás de un círculo.
      setChatAbierto(true);
    }, () => {});

    mirar();
    const mirarBorrador = () => supabase.rpc('equipo_panel', { p_limite: 5 })
      .then(({ data, error: e }) => {
        if (!vivo || e) return;
        const p = (data?.aprobaciones || []).find((a) => a.estado === 'pending');
        setBorrador(p || null);
      });
    mirarBorrador();

    const t = setInterval(() => { mirar(); mirarBorrador(); }, 5000);
    return () => { vivo = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agente]);

  // ── EN QUÉ PASO VA ───────────────────────────────────────────────────
  // Mientras Hermes trabaja, se le pregunta a su propio mensaje. No es un
  // canal nuevo: el adaptador ya venía escribiendo cada paso en
  // `estado_detalle`, y `lease_until` dice si sigue vivo. Con eso, esperar
  // deja de ser mirar una pantalla muda.
  useEffect(() => {
    if (!loading) { setPaso(''); return undefined; }
    let vivo = true;

    const preguntar = () => {
      const id = idPendienteRef.current;
      if (!id) return;
      supabase.from('hermes_chat')
        .select('estado, estado_detalle, lease_until')
        .eq('id', id).maybeSingle()
        .then(({ data, error: e }) => {
          if (!vivo || e || !data) return;
          pendienteRef.current = data;
          // El detalle solo se enseña mientras esté trabajando. Dejar el
          // último paso colgado después de contestar haría creer que sigue.
          if (data.estado === 'pendiente') setPaso('en cola, terminando lo anterior');
          else setPaso(data.estado === 'procesando' ? (data.estado_detalle || '') : '');
        });
    };

    preguntar();
    const t = setInterval(preguntar, 4000);
    return () => { vivo = false; clearInterval(t); };
  }, [loading]);

  // Qué columnas pedirle a hermes_chat. Degrada sola: si la base todavía
  // no tiene `acciones` (v3) o `media_id` (v5), se reintenta sin ellas en
  // vez de dejar la conversación en blanco con un error de SQL.
  const columnasChat = (conFecha) => {
    const cols = ['id', 'rol', 'texto'];
    if (conFecha) cols.push('creado_en');
    if (!sinAccionesRef.current) cols.push('acciones');
    if (!sinVozRef.current) cols.push('message_type', 'media_id');
    if (!sinImagenRef.current) cols.push('imagen_id');
    return cols.join(', ');
  };

  // Firmar el borrador del equipo, sin salir del chat.
  const firmarBorrador = async (decision, comentario = null) => {
    if (!borrador || firmando) return;
    setFirmando(true);
    const { data, error: e } = await supabase.rpc('equipo_decidir', {
      p_aprobacion_id: borrador.id, p_decision: decision, p_comentario: comentario,
    });
    setFirmando(false);
    if (e) { setError(`No se pudo registrar la decisión: ${e.message}`); return; }
    // Se quita al momento: esperar al sondeo deja el botón vivo cinco
    // segundos y se aprueba dos veces sin querer.
    setBorrador(null);
    setPidiendoCambios(false);
    setNotaCambios('');
    setMensajes((m) => [...m, {
      id: `firma-${Date.now()}`, role: 'assistant', de: 'hermes', canalDe: 'hermes',
      content: decision === 'approved'
        ? '✅ Aprobado. El Comercial-Creativo puede seguir con la publicación.'
        : decision === 'rejected'
          ? '❌ Rechazado. Ese trabajo se cierra: para retomarlo hay que pedirlo de nuevo.'
          : `✏️ Se lo devolví al Comercial-Creativo con tus indicaciones${
              data?.ronda ? ` (ronda ${data.ronda})` : ''}. Te traigo la pieza corregida aquí mismo.`,
    }]);
  };

  const enviarAHermes = async (texto, { conVoz }) => {
    // `loading` NO sirve de candado aquí. recognition.onresult se construye
    // una sola vez, al abrir el micrófono, y se queda con el `enviar` de ese
    // render: su `loading` vale false para siempre, por muy ocupado que esté
    // el agente. Los dictados entraban partidos en trozos por eso.
    //
    // La referencia sí la ven todos los closures, y se suelta cuando LLEGA la
    // respuesta, no cuando sale la pregunta. Soltarla al terminar el RPC
    // dejaba la puerta abierta a los dos décimas de segundo: los trozos
    // llegaban separados por segundos y pasaban todos.
    if (loading || esperandoRef.current) return;
    esperandoRef.current = true;

    // Nadie espera para siempre. Si Hermes no contesta, hay que decirlo y
    // devolver el control — con la referencia trabada y sin esto, la ventana
    // quedaría muerta hasta recargar la página.
    //
    // Dos minutos, no 45 segundos. Los 45 se pusieron cuando Hermes solo
    // redactaba texto; desde que consulta el catálogo de verdad tarda más, y
    // el aviso saltaba encima de respuestas que venían bien y en camino.
    // Avisar de una caída que no ocurrió enseña a desconfiar del aviso.
    // Y ni siquiera dos minutos a secas. Preparar una promoción con imagen
    // pasa de tres, y el aviso saltaba encima de un turno que estaba vivo y
    // avanzando. Ahora, antes de darlo por muerto, se mira su `lease_until`:
    // mientras Hermes siga renovando el turno, se le espera. Solo se avisa
    // cuando de verdad dejó de dar señales.
    const vigilar = () => {
      const p = pendienteRef.current;
      // `pendiente` es que todavía no le ha tocado: hace cola detrás de otra
      // pregunta de la misma conversación. Eso no es un fallo, y decir que no
      // ha contestado cuando ni siquiera ha empezado es lo mismo que mentir.
      const trabajando = p && (
        p.estado === 'pendiente'
        || (p.estado === 'procesando' && p.lease_until
            && new Date(p.lease_until).getTime() > Date.now() - 60000));
      if (trabajando) {
        esperaHermesRef.current = window.setTimeout(vigilar, 30000);
        return;
      }
      esperandoRef.current = false;
      setLoading(false);
      setError('Hermes no ha contestado. Puede estar ocupado, o conectado pero sin atender la cola.');
    };
    window.clearTimeout(esperaHermesRef.current);
    esperaHermesRef.current = window.setTimeout(vigilar, 120000);

    modoVozRef.current = conVoz;
    // Se pinta al instante con un id provisional y se le pone el de la fila en
    // cuanto la base lo devuelve: si no, el sondeo la traería de vuelta y la
    // pregunta aparecería dos veces.
    const idProvisional = `u-tmp-${Date.now()}`;
    setMensajes((m) => [...m, { id: idProvisional, role: 'user', content: texto, canalDe: 'hermes' }]);
    setLoading(true);
    setError('');
    // Se avisa UNA vez por espera. Repetirlo en cada vuelta es lo que sonaba
    // a disco rayado.
    // Antes decía "un momento, le pregunto a Hermes" y sonaba a que había un
    // intermediario preguntándole a otro. No lo hay: esto ES Hermes, la frase
    // solo tapa el silencio mientras contesta desde su PC.
    if (conVoz) speak('Un momento, estoy revisando.', { escucharDespues: false });
    try {
      const { data, error: e } = await supabase.rpc('hermes_escribir', {
        p_texto: texto,
        // Con la aclaración de qué es esto y de dónde salen los datos de
        // verdad. Sin ella, "datos: null" se leía como "no hay datos".
        p_pantalla: contextoParaAgente(leerModulos()),
      });
      if (e) throw e;
      if (data?.id) {
        idPendienteRef.current = data.id;
        pendienteRef.current = null;
        idsVistosRef.current.add(`u-${data.id}`);
        if (data.id > ultimoIdRef.current) ultimoIdRef.current = data.id;
        setMensajes((m) => m.map((x) => (x.id === idProvisional ? { ...x, id: `u-${data.id}` } : x)));
      }
      // No se apaga el "pensando": se apaga cuando LLEGA su respuesta por
      // Realtime. Hermes puede tardar, y fingir que terminó sería mentir.
    } catch (err) {
      dejarDeEsperar();
      setError(err.message || 'No se pudo enviar el mensaje a Hermes.');
    }
  };

  // ── La nota de voz ya se subió y ya está en la cola ──────────────────
  // BarraVozHermes hace la subida y el hermes_escribir_voz; aquí solo se
  // ajusta la conversación que se ve. Se registra el id ANTES de pintar
  // nada: el sondeo corre cada cuatro segundos y sin esto la misma nota
  // aparecería dos veces.
  const alEnviarVoz = ({ id, mediaId, duracionMs, duplicado }) => {
    if (!id) return;
    setError('');
    idPendienteRef.current = id;
    pendienteRef.current = null;
    if (!duplicado) {
      idsVistosRef.current.add(`u-${id}`);
      if (id > ultimoIdRef.current) ultimoIdRef.current = id;
      setMensajes((m) => [...m, {
        id: `u-${id}`, role: 'user', canalDe: 'hermes',
        content: `🎤 Nota de voz (${Math.round((duracionMs || 0) / 1000)} s)`,
        mediaId, tipoMensaje: 'voice',
      }]);
    }
    // Se espera igual que con el texto: el "pensando" se apaga cuando LLEGA
    // la respuesta, no cuando termina la subida. Hermes todavía tiene que
    // transcribir, pensar y hablar.
    esperandoRef.current = true;
    setLoading(true);
  };

  // El usuario cortó una respuesta hablada. Queda anotado en el audio, no
  // se borra nada: la respuesta se dio, simplemente no se oyó entera.
  const marcarInterrumpido = (mediaId) => {
    supabase.rpc('hermes_voz_interrumpir', { p_media_id: mediaId })
      .then(() => {})
      .catch(() => { /* que no se pueda anotar no debe romper la reproducción */ });
  };

  const enviar = (texto, opciones = {}) => {
    const conVoz = opciones.conVoz !== false;

    // ── ESCRITO VALE IGUAL QUE HABLADO ──────────────────────────
    // (2026-08-16) Con la tarjeta de autorización en pantalla, decir
    // «autorizo» funcionaba y ESCRIBIRLO no: el texto se iba al modelo, que
    // contestaba "no puedo autorizar la cotización directamente, ve a
    // Cotizaciones" — mandando a otro módulo teniendo el botón al lado.
    //
    // La misma palabra no puede valer por el micrófono y no por el teclado.
    // Se usa el mismo lector de siempre, así que lo que se acepta y lo que
    // no es idéntico en los dos caminos: solo lo inequívoco, y una frase
    // larga sigue siendo una instrucción nueva, no una decisión.
    //
    // Que "sí" cuente no es un atajo: la tarjeta está delante con el resumen
    // y los montos, y quien la mira ya decidió. Lo que mueve dinero sigue
    // pidiendo contraseña dentro de agente_confirmar_accion.
    if (propuesta && !autorizando) {
      const veredicto = veredictoDeVoz(texto);
      if (veredicto) {
        resolverPropuesta(veredicto === 'si');
        return;
      }
    }
    if (canal === 'hermes') {
      // `null` es "todavia no se", no "no". Tratarlo como negativo hacia
      // que un mensaje mandado en el primer segundo tras abrir el widget
      // dijera "Hermes no esta conectado" con Hermes conectado — y el
      // aviso se quedaba en pantalla aunque el latido llegara despues.
      if (hermesVivo !== false) return enviarAHermes(texto, { conVoz });
      // Antes se pasaba SOLO al asistente rápido. Y como este contesta con la
      // persona de Hermes, quien preguntaba creía estar hablando con él: el
      // aviso ámbar decía "no está conectado" y abajo alguien contestaba
      // igual. Cambiar de interlocutor sin decirlo no es una comodidad.
      setError(`${nombreEmpresa} no está conectado: su servidor no está dando señal. Si quieres que conteste ${nombreSistema}, púlsalo arriba.`);
      return undefined;
    }
    return askAiCeo(texto, { conVoz, voz: opciones.voz });
  };
  // Se sube cada vez que el usuario interrumpe. La respuesta que venga en
  // camino con un número viejo se descarta: sin esto, cancelas y a los tres
  // segundos el agente se pone a hablar igual.
  const turnoRef = useRef(0);
  // Lo que el agente preparó y espera autorización. NADA de esto pasó aún.
  const [propuesta, setPropuesta] = useState(null);
  const [clave, setClave] = useState('');
  const [autorizando, setAutorizando] = useState(false);
  // El manejador de voz se construye una vez y se quedaría con el valor
  // viejo: leerlo de una referencia es lo que hace que "autorizo" funcione
  // sobre la propuesta que está en pantalla AHORA.
  const propuestaRef = useRef(null);
  useEffect(() => { propuestaRef.current = propuesta; }, [propuesta]);

  // Cambiar de agente empieza otra conversación: el siguiente saluda.
  useEffect(() => { yaSaludoRef.current = false; }, [canal]);
  // true mientras el micrófono lo abrió el sistema y no la persona. En ese
  // caso el silencio no es un error: simplemente no había nada que decir.
  const esperandoAutorizacionRef = useRef(false);
  // La conversación viene por voz. Mientras sea así, al terminar de hablar
  // vuelve a escuchar solo — hablar y que se apague no es conversar, es
  // dictar. Se apaga en cuanto se escribe algo.
  const modoVozRef = useRef(false);
  // Cada frase hablada lleva número. Si al terminar ya no es la actual, es
  // que la cancelaron para decir otra cosa: NO se abre el micrófono, porque
  // la voz nueva sigue sonando y se oiría a sí mismo.
  const hablaRef = useRef(0);
  // Cuántas veces seguidas se abrió el micrófono SOLO. En un mostrador con
  // ruido, cada apertura puede captar algo y disparar otro envío; sin tope,
  // la conversación se alimenta sola. Se reinicia cuando la persona habla o
  // escribe a propósito.
  const seguidasRef = useRef(0);
  // Lo último que dijo, para reconocerlo si el micrófono lo capta de vuelta.
  const ultimoDichoRef = useRef('');
  // Hay una pregunta en el aire esperando respuesta de Hermes. Es referencia
  // y no estado a propósito: ver enviarAHermes.
  const esperandoRef = useRef(false);
  const esperaHermesRef = useRef(null);
  // Número del reconocedor activo. Solo el último tiene derecho a hablar.
  const micTurnoRef = useRef(0);
  // ── Dónde vive el círculo ─────────────────────────────────────────────
  // Abajo a la derecha tapaba F10 - GRABAR en Facturación y no dejaba
  // grabar la venta. En vez de buscarle una esquina que no estorbe en
  // ninguna de las 76 pantallas, se arrastra y se queda donde lo dejen.
  const [pos, setPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jarvis_pos') || 'null'); } catch { return null; }
  });
  const arrastreRef = useRef(null);

  const alBajarRaton = (e) => {
    // Solo con el botón principal y desde la barrita: si el círculo entero
    // arrastrara, no se podría pulsar para hablar.
    if (e.button !== 0) return;
    const caja = e.currentTarget.parentElement.getBoundingClientRect();
    arrastreRef.current = { dx: e.clientX - caja.left, dy: e.clientY - caja.top };

    const mover = (ev) => {
      const a = arrastreRef.current;
      if (!a) return;
      // Se recorta contra la ventana: soltarlo fuera lo dejaría inalcanzable
      // y habría que borrar el almacenamiento del navegador para recuperarlo.
      setPos({
        x: Math.max(4, Math.min(window.innerWidth - 80, ev.clientX - a.dx)),
        y: Math.max(4, Math.min(window.innerHeight - 80, ev.clientY - a.dy)),
      });
    };
    const soltar = () => {
      arrastreRef.current = null;
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
      setPos((p) => {
        try { localStorage.setItem('jarvis_pos', JSON.stringify(p)); } catch { /* sin espacio: se queda esta sesión */ }
        return p;
      });
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  };

  // Lo que se lleva dictado y el reloj del silencio. Con el reconocedor en
  // continuo, el navegador ya no decide cuándo terminaste: se decide aquí.
  //
  // Van AQUÍ y no junto a startListening: más abajo hay un `return null` para
  // quien no ve el agente, y un useRef debajo de un return temprano se salta
  // en esos renders. React cuenta los hooks y revienta la aplicación entera
  // con el error #310 — pantalla en blanco, no un fallo del asistente.
  const dictadoRef = useRef('');
  const silencioRef = useRef(null);

  // Un solo sitio donde se deja de esperar: llegó la respuesta, falló el
  // envío, se cortó a mano o se agotó el tiempo. Tener el candado y el reloj
  // separados es como se queda uno de los dos puesto.
  const dejarDeEsperar = () => {
    window.clearTimeout(esperaHermesRef.current);
    esperandoRef.current = false;
    setLoading(false);
  };

  // Hasta dónde se leyó, y qué burbujas ya están puestas. El id de la fila es
  // lo que permite que Realtime y el sondeo traigan lo mismo sin duplicarlo.
  const ultimoIdRef = useRef(0);
  const idsVistosRef = useRef(new Set());
  // La columna `acciones` la agrega hermes_ordenes_pantalla.sql. Mientras no
  // se corra, pedirla revienta la consulta CADA CUATRO SEGUNDOS y el error se
  // queda flotando encima de la pantalla. Un despliegue del navegador no puede
  // depender de que alguien haya corrido un SQL: se detecta una vez y se sigue
  // sin ella, que solo significa que Hermes todavía no puede llenar la
  // factura.
  const sinAccionesRef = useRef(false);
  // Lo mismo para las columnas de voz (v5). Mientras hermes_voz_v5.sql no
  // esté corrido, el chat funciona exactamente como ayer: sin nota de voz
  // y sin reproductor, pero sin un error rojo cada cuatro segundos.
  const sinVozRef = useRef(false);
  // Y lo mismo para la imagen. Es una columna nueva en hermes_chat: si el
  // navegador tiene el dist viejo contra una base ya migrada, o al revés, el
  // chat sigue funcionando sin foto en vez de quedarse en blanco.
  const sinImagenRef = useRef(false);
  // El mensaje que está contestando ahora mismo, para poder preguntar por él.
  const idPendienteRef = useRef(null);
  // Lo último que se supo de ese turno. Lo mira el reloj de la espera para
  // no dar por muerto a alguien que está trabajando.
  const pendienteRef = useRef(null);
  // Una orden de pantalla se ejecuta UNA vez. Entre Realtime y el sondeo, la
  // misma fila llega dos veces, y ejecutarla dos veces duplicaría las líneas
  // de la factura sin que nadie entendiera por qué.
  const idsEjecutadosRef = useRef(new Set());
  const idBurbuja = (f) => `${f.rol === 'hermes' ? 'h' : 'u'}-${f.id}`;

  const incorporar = (filas) => {
    if (!filas?.length) return;
    const nuevas = [];
    for (const f of filas) {
      const id = idBurbuja(f);
      if (idsVistosRef.current.has(id)) continue;
      idsVistosRef.current.add(id);
      if (f.id > ultimoIdRef.current) ultimoIdRef.current = f.id;
      nuevas.push({
        id, role: f.rol === 'hermes' ? 'assistant' : 'user', content: f.texto,
        // Todo lo que sale de hermes_chat lo escribió Hermes desde su PC.
        de: f.rol === 'hermes' ? 'hermes' : undefined,
        canalDe: 'hermes',
        // v5: la respuesta puede traer voz. `media_id` en una fila de
        // 'usuario' es la nota que se mando; en una de 'hermes', el TTS.
        mediaId: f.media_id || undefined,
        // La foto que preparó él (un borrador de promoción, por ejemplo).
        imagenId: f.imagen_id || undefined,
        tipoMensaje: f.message_type || 'text',
      });
    }
    if (!nuevas.length) return;
    setMensajes((m) => [...m, ...nuevas]);

    // Hermes no puede tocar este navegador desde su PC: sus órdenes de
    // pantalla viajan pegadas a la respuesta, en la misma fila. Aquí se
    // desempaquetan y entran por el mismo puente que las de Jarvis.
    for (const f of filas) {
      if (f.rol !== 'hermes' || !f.acciones) continue;
      if (idsEjecutadosRef.current.has(f.id)) continue;   // el sondeo repite filas
      idsEjecutadosRef.current.add(f.id);
      // Una acción o VARIAS. Hermes tiene que poder mandar preparar la venta y
      // cobrarla en el mismo mensaje, igual que hace Jarvis: si tuviera que
      // partirlo en dos vueltas, entre una y otra se cuela un turno de
      // conversación — y ese turno es justo donde el agente se pierde y acaba
      // facturando la cotización de otro cliente.
      //
      // Se acepta el objeto suelto además del arreglo para no romper lo que
      // Hermes ya sabe mandar hoy.
      const acciones = Array.isArray(f.acciones) ? f.acciones : [f.acciones];
      let abrir = false;
      for (const a of acciones) {
        if (a?.tipo !== 'preparar_venta' && a?.tipo !== 'cobrar_venta') continue;
        ordenarPantalla('ventas', normalizarOrdenVenta(a));
        abrir = true;
      }
      // Se abre UNA vez, después de encolarlas: el puente las guarda en fila y
      // la pantalla las atiende en orden al montarse.
      if (abrir) { try { openPanel('ventas'); } catch { /* módulo inexistente */ } }
    }

    const suya = [...nuevas].reverse().find((n) => n.role === 'assistant');
    if (suya) {
      // Con la ventana cerrada, el globito rojo es lo único que hay: sin
      // él un aviso de los centinelas se queda escrito en la base sin que
      // nadie se entere, que es exactamente lo que se vino a evitar.
      if (!chatAbiertoRef.current) {
        setNoLeidos((n) => n + nuevas.filter((x) => x.role === 'assistant').length);
      }
      dejarDeEsperar();
      // Si se agotó la espera y la respuesta llegó DESPUÉS, el aviso rojo
      // seguía puesto encima de una respuesta correcta: decía que no había
      // contestado mientras se leía lo que contestó. Llegó, luego ya no hay
      // nada que avisar.
      setError('');
      setAgenteQueContesto(agente?.nombre || 'Hermes');
      if (modoVozRef.current) speak(suya.content);
    }
  };

  // Empezar de cero. NO borra nada: la conversación anterior queda entera en
  // ai_chat_messages. Lo único que se suelta es el hilo, que es justo lo que
  // estorba cuando ya no se está hablando de lo mismo.
  const nuevaConversacion = () => {
    stopSpeaking();
    // Se van SOLO las burbujas de Jarvis. Las de Hermes son otra memoria y
    // otro interlocutor: empezar de nuevo con uno no borra al otro de la
    // pantalla.
    setMensajes((m) => m.filter((x) => (x.canalDe || 'hermes') !== 'local'));
    setSessionId(null);
    setError('');
    setLastMessage('');
    try {
      localStorage.removeItem('jarvis_sesion');
      localStorage.removeItem('jarvis_sesion_ts');
    } catch { /* sin almacenamiento: se acaba con la pestaña igual */ }
  };

  // (2026-08-17) Aquí había un SEGUNDO cargador de la conversación, más viejo
  // que el de arriba y peor: traía la sesión ENTERA sin límite —130 mensajes—,
  // no marcaba `canalDe`, así que los mensajes de Jarvis se pintaban en el
  // canal de Hermes, y al pisar `setMensajes` de golpe borraba las burbujas
  // que el cargador bueno acababa de armar. Los dos corrían al montar y ganaba
  // el que contestara último. El de la línea 245 ya hace esto bien: con tope,
  // con canal y sin repetir ids.

  useEffect(() => {
    if (chatAbierto) finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, loading, chatAbierto]);

  // Abrir el chat ES haberlo leído. No hace falta un botón de "marcar como
  // leído": pedir un gesto extra para apagar un aviso es cómo se llega a
  // 297 avisos pendientes que nadie toca.
  useEffect(() => {
    chatAbiertoRef.current = chatAbierto;
    if (chatAbierto) setNoLeidos(0);
  }, [chatAbierto]);

  // Chrome carga las voces tarde: sin esperar el aviso, el primer mensaje
  // sale con la voz por defecto y solo del segundo en adelante suena bien.
  useEffect(() => alListarVoces(() => setVoces(listarVoces())), []);

  const allowed = useMemo(() => {
    return profile?.role === 'admin' || isSuperAdmin;
  }, [profile?.role, isSuperAdmin]);

  // Sin agente definido para esta empresa, no se muestra nada.
  if (!allowed || cargandoAgente || !agente) return null;

  const activeCore = listening || loading || speaking;

  const speak = (text, { escucharDespues = true } = {}) => {
    if (!text) return;
    window.clearTimeout(clearBubbleTimerRef.current);
    const mio = ++hablaRef.current;
    ultimoDichoRef.current = text;

    // Silenciado: se enseña lo que diría y se sigue escuchando. Callar al
    // agente no es apagarlo — en un local con ruido, o con un cliente
    // delante, uno quiere leer la respuesta sin que suene.
    if (mudo) {
      setLastMessage(text);
      clearBubbleTimerRef.current = window.setTimeout(() => setLastMessage(''), Math.max(5000, text.length * 85));
      if (escucharDespues && modoVozRef.current) startListening();
      return;
    }

    hablar(text, {
      alEmpezar: () => setSpeaking(true),
      alTerminar: () => {
        // Si ya no es la frase actual, la cancelaron para decir otra: dejar
        // que esta abra el micrófono lo abriría encima de la nueva voz.
        if (mio !== hablaRef.current) return;
        setSpeaking(false);
        setLastMessage('');

        // Si la conversación va por voz, sigue escuchando. Terminar de leer
        // cuatro opciones y apagarse obliga a pulsar el círculo para decir
        // "el primero", justo cuando uno tiene las manos ocupadas.
        if (!escucharDespues || !modoVozRef.current) return;
        // Tres vueltas seguidas sin que nadie pulse nada ya no es una
        // conversación: es el ruido del local realimentándose.
        if (seguidasRef.current >= 3) { modoVozRef.current = false; return; }
        window.setTimeout(() => {
          if (mio !== hablaRef.current || !modoVozRef.current) return;
          seguidasRef.current += 1;
          esperandoAutorizacionRef.current = true;   // silencio = fin, no error
          startListening();
        }, 700);   // el altavoz tarda en callarse del todo
      },
    });
    clearBubbleTimerRef.current = window.setTimeout(() => setLastMessage(''), Math.max(5000, text.length * 85));
  };

  const stopSpeaking = () => {
    callar();
    window.clearTimeout(clearBubbleTimerRef.current);
    setSpeaking(false);
    setLastMessage('');
  };

  // Cortar TODO: la voz que está sonando y la respuesta que viene en camino.
  // Subir el turno hace que la respuesta en vuelo se descarte al llegar.
  const interrumpir = () => {
    turnoRef.current++;
    // Cortar de verdad apaga también la escucha automática: si no, el
    // micrófono se reabriría solo justo después de haberlo mandado a callar.
    modoVozRef.current = false;
    callar();
    // `callar()` solo silencia la voz sintetizada del navegador. El audio
    // TTS que mandó Hermes es un <audio> aparte y seguiría sonando: quien
    // pulsa Detener espera silencio, no medio silencio.
    pararTodoAudio();
    try { recognitionRef.current?.abort?.(); } catch { /* no estaba oyendo */ }
    window.clearTimeout(clearBubbleTimerRef.current);
    // Cortar de verdad tira lo dictado a medias: si no, el reloj del silencio
    // lo mandaría dos segundos después de haberlo mandado callar.
    window.clearTimeout(silencioRef.current);
    dictadoRef.current = '';
    setSpeaking(false);
    setListening(false);
    // Detener suelta también la espera de Hermes: si no, el candado se queda
    // trabado y la ventana no vuelve a aceptar nada.
    micTurnoRef.current++;
    vozEspejo.cancelar();
    dejarDeEsperar();
    setLastMessage('');
  };

  // Cambiar de canal es cambiar de interlocutor, no de voz: se corta lo que
  // estuviera pasando —la voz sonando, el micrófono abierto, la espera de la
  // respuesta anterior—. Sin esto, el "pensando" de Hermes se queda girando
  // encima de la conversación de Jarvis, que no ha preguntado nada.
  //
  // Lo que NO se cancela es el mensaje que ya salió: sigue en la cola y
  // Hermes lo va a contestar. Su respuesta aparece en su canal cuando vuelvas.
  const cambiarCanal = (nuevo) => {
    if (nuevo === canal) return;
    interrumpir();
    setError('');
    setAgenteQueContesto(undefined);
    setCanal(nuevo);
  };

  // El selector, en los dos sentidos y siempre a la vista.
  //
  // Antes solo existía el paso a Jarvis, y SOLO si Hermes estaba caído: con
  // Hermes conectado no había forma de elegir al otro aunque llevara dos
  // minutos pensando. Y en modo voz no había ninguno, que es donde más falta
  // hace — ahí no hay barra de chat a la que volver.
  const selectorCanal = () => (
    <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-cyan-300/20 bg-slate-900/70 p-0.5">
      <button
        type="button"
        onClick={() => cambiarCanal('hermes')}
        title={hermesVivo === false
          ? `${nombreEmpresa} no está dando señal`
          : `${nombreEmpresa} · con su memoria de las otras conversaciones`}
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
          canal === 'hermes' ? 'bg-emerald-400/20 text-emerald-200' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {/* El punto dice si su servidor responde, se esté hablando con él o
            no. Estando en Jarvis también importa: es como se ve que ya volvió. */}
        <span className={`h-1.5 w-1.5 rounded-full ${
          hermesVivo === false ? 'bg-amber-400' : hermesVivo ? 'bg-emerald-400' : 'bg-slate-500'
        }`} />
        {nombreEmpresa}
      </button>
      <button
        type="button"
        onClick={() => cambiarCanal('local')}
        title={`${nombreSistema} · el asistente de MotoFlow, contesta al instante`}
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
          canal === 'local' ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {nombreSistema}
      </button>
    </div>
  );

  // La esfera, en un solo sitio. Vive en dos tamaños muy distintos —el botón
  // del widget y la pantalla completa— y por eso el desenfoque va como
  // parámetro: los 26px que la hacen parecer una esfera a 260 convierten un
  // botón de 56 en una mancha gris. Va en proporción, más o menos tamaño/10.
  //
  // Son capas girando a distintas velocidades detrás de un desenfoque. Eso es
  // lo que hace que la superficie parezca moverse sola sin que nada tenga
  // borde: un círculo liso se ve muerto.
  const capasEsfera = (blurPx) => (
    <>
      <div className="absolute inset-0 overflow-hidden rounded-full" style={{ filter: `blur(${blurPx}px)` }}>
        <div className="absolute inset-0 rounded-full bg-slate-200/90" />
        <div
          className="absolute left-[8%] top-[4%] h-[70%] w-[70%] rounded-full"
          style={{ background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 68%)', animation: 'orbe-gira 11s linear infinite', transformOrigin: '60% 65%' }}
        />
        <div
          className="absolute right-[4%] top-[14%] h-[66%] w-[66%] rounded-full"
          style={{ background: 'radial-gradient(circle, #7dd3fc 0%, rgba(125,211,252,0) 66%)', animation: 'orbe-gira-lento 8s linear infinite', transformOrigin: '35% 55%' }}
        />
        <div
          className="absolute bottom-[2%] left-[16%] h-[62%] w-[62%] rounded-full"
          style={{ background: 'radial-gradient(circle, #c4b5fd 0%, rgba(196,181,253,0) 64%)', animation: 'orbe-gira 15s linear infinite', transformOrigin: '50% 30%' }}
        />
      </div>
      {/* El brillo de arriba: sin esto parece un disco, no una esfera. */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ background: 'radial-gradient(circle at 34% 26%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 42%)' }}
      />
    </>
  );

  const probar = () => {
    callar();
    hablar(agenteActivo?.saludo || 'Sistemas en línea. A sus órdenes.', {
      alEmpezar: () => setSpeaking(true),
      alTerminar: () => setSpeaking(false),
    });
  };

  // Lo dice en voz alta y, al terminar de hablar, se queda escuchando.
  // El micrófono se abre DESPUÉS de callarse, nunca antes: si se abriera
  // mientras habla, se oiría a sí mismo y tomaría su propia frase por
  // respuesta.
  // `escuchar` es si además hay que abrir el micrófono esperando un "autorizo".
  // Solo cuando la conversación venía por voz: si la persona escribió, va a
  // pulsar el botón, y abrir el micrófono solo consigue un error rojo —
  // "not-allowed" si está bloqueado— justo encima de la tarjeta, que hace
  // parecer que la autorización falló cuando está ahí esperando.
  //
  // Hablar la petición se mantiene aunque se haya escrito: es el único momento
  // en que el sistema va a modificar algo, y merece oírse aunque la persona
  // esté mirando otra pantalla.
  const pedirAutorizacionHablando = (p, { escuchar = true } = {}) => {
    const frase = p.requiere_password
      ? `${p.resumen}. Esto mueve dinero: hay que autorizarlo en pantalla con la contraseña.`
      : `${p.resumen}. ¿Lo autorizo?`;

    hablar(frase, {
      alEmpezar: () => setSpeaking(true),
      alTerminar: () => {
        setSpeaking(false);
        // Lo que mueve dinero no se escucha: por voz se rechaza igual, así
        // que abrir el micrófono solo invitaría a un intento fallido.
        if (p.requiere_password) return;
        if (!escuchar) return;
        // Un respiro para que no capture la cola de su propia voz.
        window.setTimeout(() => {
          if (propuestaRef.current?.accion_id !== p.accion_id) return;
          esperandoAutorizacionRef.current = true;
          startListening();
        }, 350);
      },
    });
  };

  const resolverPropuesta = async (autorizar) => {
    if (!propuesta || autorizando) return;
    setAutorizando(true);
    try {
      if (!autorizar) {
        await supabase.rpc('agente_rechazar_accion', { p_accion_id: propuesta.accion_id });
        setMensajes((m) => [...m, { id: `r-${Date.now()}`, role: 'assistant', content: 'Descartado. No se hizo nada.', canalDe: canal }]);
      } else {
        const { data, error: e } = await supabase.rpc('agente_confirmar_accion', {
          p_accion_id: propuesta.accion_id,
          p_password: clave || null,
        });
        if (e) throw e;
        if (data?.ok === false) throw new Error(data.motivo || 'No se pudo autorizar');
        const r = data?.resultado || {};
        setMensajes((m) => [...m, {
          id: `r-${Date.now()}`, role: 'assistant', canalDe: canal,
          // Se dice el NÚMERO y se ofrece lo siguiente. Antes era un "Listo."
          // seco y había que adivinar qué venía después; y como el agente
          // tampoco lo sabía, mandaba a abrir el módulo de Cotizaciones para
          // "revisar y autorizar" algo que ya estaba autorizado.
          // (2026-08-29) "Hecho." a secas era el final de todas las acciones
          // que no fueran cotización — y era justo la pregunta del dueño:
          // "¿cómo sé dónde mandó Hermes la promoción?". Si el ejecutor sabe
          // dónde quedó, se dice. Nadie tiene que ir a buscarlo.
          content: r.numero
            ? `La cotización ${r.numero} fue realizada${r.total ? ` por RD$ ${Number(r.total).toLocaleString('es-DO')}` : ''}.`
              + `\n¿Desea algo más? Si quiere, la envío a facturar de una vez.`
            : r.donde_verlo
              ? `Encargado.\n${r.donde_verlo}`
              : 'Hecho.',
        }]);
      }
      setPropuesta(null);
      setClave('');
    } catch (err) {
      setError(err.message || 'No se pudo completar');
    } finally {
      setAutorizando(false);
    }
  };

  const cambiarVoz = (nombre) => {
    setVozSel(nombre);
    elegirVoz(nombre);
    probar();
  };

  // Se guarda y se prueba en el mismo gesto: ajustar tono a ciegas, soltar y
  // volver a pulsar para oírlo es insoportable.
  const cambiarAjuste = (patch) => {
    const nuevo = { ...aj, ...patch };
    setAj(nuevo);
    guardarAjustes(patch);
    probar();
  };

  // conVoz=false cuando se escribe: si escribiste, no tiene por qué ponerse
  // a hablar delante de un cliente. Y cuando toque ElevenLabs, cada frase
  // hablada se paga — callarse en el canal escrito es gratis y correcto.
  const askAiCeo = async (text, opciones = {}) => {
    const { conVoz = true } = opciones;
    const message = String(text || '').trim();
    if (!message || loading) return;

    // Escribir corta el modo voz; hablarle lo enciende. Así el canal escrito
    // no deja el micrófono abierto en el mostrador.
    modoVozRef.current = conVoz;

    // Avisa que está trabajando. Buscar la pieza y preparar la propuesta
    // tarda varios segundos; sin esto uno se queda mirando el círculo sin
    // saber si oyó. No abre el micrófono al terminar: está por hablar de
    // nuevo con la respuesta.
    if (conVoz) speak('Un momento, por favor.', { escucharDespues: false });

    const turno = ++turnoRef.current;
    setLoading(true);
    setError('');
    // El globo flotante es el eco visual de lo que se dice en voz alta:
    // acompaña a la voz para quien no la oye bien. Escribiendo no pinta nada
    // —la respuesta ya está en el hilo— y encima se queda flotando sobre la
    // pantalla, tapando botones de módulos que no tienen nada que ver.
    if (conVoz) setLastMessage(message);
    setMensajes((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: message, canalDe: 'local' }]);
    stopSpeaking();

    try {
      const { data, error: fnError } = await supabase.functions.invoke('motoflow-ai-chat', {
        // Se manda dónde está parado el usuario: así puede preguntar
        // "¿qué es esto?" sin explicar de qué habla.
        body: {
          message,
          session_id: sessionId,
          pantalla: { ...leerContexto(), modulos: leerModulos() },
          // De dónde salió la frase y qué costó oírla. Solo viaja cuando la
          // nota de voz pasó por el servidor; escribiendo no va nada, y el
          // chat escrito manda exactamente el mismo cuerpo de siempre.
          voz: opciones.voz || undefined,
          // Esta ruta es SIEMPRE la del asistente del sistema. Quien quiera
          // hablar con el agente de la empresa pasa por enviarAHermes.
          agente: 'sistema',
        },
      });

      if (fnError) throw fnError;
      if (!data?.ok) throw new Error(data?.mensaje || data?.error || `${nombreAgente} no respondió.`);

      // Si lo interrumpieron mientras esto viajaba, se descarta callado.
      if (turno !== turnoRef.current) return;

      if (data.session_id) {
        setSessionId(data.session_id);
        try {
          localStorage.setItem('jarvis_sesion', data.session_id);
          // La marca se refresca en CADA mensaje, no solo al crear: las doce
          // horas se cuentan desde que se dejó de hablar, no desde que se
          // empezó. Si no, una charla larga se cortaba sola a media tarea.
          localStorage.setItem('jarvis_sesion_ts', String(Date.now()));
        } catch { /* sin espacio: dura esta pestaña */ }
      }
      setAgenteQueContesto(data.agente_usado ?? null);

      // Navegar es lo único que el servidor no puede hacer solo. Si pidió
      // abrir un módulo, se abre aquí. El <Protected> de cada pantalla sigue
      // decidiendo: puede pedir abrirla, no saltarse el permiso.
      for (const h of data.herramientas || []) {
        if (h?.herramienta === 'abrir_modulo' && h?.argumentos?.modulo) {
          try { openPanel(h.argumentos.modulo); } catch { /* módulo inexistente */ }
        }
      }

      // Dejar una pantalla preparada. Se abre PRIMERO y la orden queda en el
      // buzón del puente: la pantalla tarda en montarse, y una orden lanzada
      // antes de que exista el oyente se perdería sin dejar rastro — factura
      // vacía y ningún error que lo explique.
      for (const o of data.ordenes || []) {
        if (o?.panel !== 'ventas') continue;
        ordenarPantalla('ventas', normalizarOrdenVenta(o.orden));
        try { openPanel('ventas'); } catch { /* no debería, el enum lo valida */ }
      }

      // Si preparó algo que escribe, se abre el chat aunque estuviera
      // cerrado: una autorización no puede quedar escondida detrás de un
      // círculo, y menos si el agente ya dijo de viva voz que la preparó.
      const p = (data.propuestas || [])[0];
      if (p) {
        setPropuesta(p);
        setClave('');
        setChatAbierto(true);
        // La autorización SIEMPRE se pide hablando, aunque la conversación
        // viniera por escrito: es el único momento en que el sistema va a
        // modificar algo, y merece que la persona lo oiga aunque esté
        // mirando otra cosa.
        pedirAutorizacionHablando(p, { escuchar: conVoz });
      }
      if (conVoz) setLastMessage(data.answer || '');
      setMensajes((m) => [...m, {
        id: `tmp-r-${Date.now()}`, role: 'assistant', de: 'local', canalDe: 'local',
        content: data.answer || '', herramientas: data.herramientas || [],
      }]);
      // Con propuesta NO se habla la respuesta: ya lo dijo pedirAutorizacion.
      // Hablar dos veces cancelaba la primera frase, y ese cancelado abría el
      // micrófono mientras la segunda seguía sonando — el agente se oía a sí
      // mismo, se transcribía y se contestaba solo en bucle.
      if (conVoz && !p) speak(data.answer || '');
    } catch (err) {
      if (turno !== turnoRef.current) return;
      setError(await formatVoiceError(err));
    } finally {
      if (turno === turnoRef.current) setLoading(false);
    }
  };

  // La frase quedó completa. Un solo camino de salida para las tres formas de
  // llegar aquí: dos segundos de silencio, el navegador cerrando por su
  // cuenta, o el micrófono apagado a mano.
  const cerrarDictado = () => {
    window.clearTimeout(silencioRef.current);
    const transcript = (dictadoRef.current || '').trim();
    dictadoRef.current = '';
    if (!transcript) return;

    try { recognitionRef.current?.stop?.(); } catch { /* ya paró */ }

    // ECO. Aunque se espere a que se calle, el micrófono a veces capta la
    // cola de su propia voz — y como suena parecido, se lo mandaría de
    // vuelta como pregunta y se contestaría solo en bucle. Si lo que se
    // oyó se parece demasiado a lo que acaba de decir, se descarta.
    if (esEcoDeLoQueDijo(transcript, ultimoDichoRef.current)) {
      console.warn('[voz] descartado por eco:', transcript);
      return;
    }

    // Con una autorización pendiente, la voz decide sobre ELLA. Si no, un
    // "sí" se le mandaría al modelo como pregunta y la propuesta quedaría
    // colgada esperando.
    if (propuestaRef.current) {
      const v = veredictoDeVoz(transcript);
      if (v === 'si') {
        // Lo que mueve dinero NO se autoriza de viva voz: decir "autorizo"
        // no identifica a nadie, y cualquiera junto al mostrador lo dice.
        if (propuestaRef.current.requiere_password) {
          setError('Esta acción mueve dinero: hay que autorizarla en pantalla con la contraseña.');
          return;
        }
        resolverPropuesta(true);
        return;
      }
      if (v === 'no') { resolverPropuesta(false); return; }
      // Ni sí ni no: es una pregunta. La propuesta se queda en pantalla.
    }

    // >>> EL ORIGINAL VIAJA CON LA TRANSCRIPCION <<<
    // Hasta ahora el modo voz mandaba solo el texto del navegador y el
    // audio se perdia: si entendia mal, no habia a que volver. Ahora se
    // manda UN mensaje con las dos cosas.
    //
    // El texto sigue yendo a proposito: el adaptador de Hermes todavia lee
    // v4 y solo entiende texto. Quitarlo ahora dejaria el modo voz sin
    // contestar hasta que alguien termine el otro lado — un paso atras.
    //
    // Si el audio falla por lo que sea, se manda el texto y ya: guardar el
    // original es una mejora, no un requisito para poder hablar.
    if (canal === 'hermes' && vozEspejo.espejoActivo()) {
      vozEspejo.cerrar().then((grabado) => {
        if (!grabado) { enviar(transcript); return; }
        const idProvisional = `u-tmp-${Date.now()}`;
        setMensajes((m) => [...m, { id: idProvisional, role: 'user', content: transcript, canalDe: 'hermes' }]);
        setLoading(true);
        esperandoRef.current = true;
        speak('Un momento, estoy revisando.', { escucharDespues: false });
        vozEspejo.mandarConAudio(profile?.tenant_id, grabado, transcript,
                                 contextoParaAgente(leerModulos()))
          .then((id) => {
            if (!id) {
              // El audio no se pudo adjuntar: se quita la burbuja optimista
              // y se manda por el camino de siempre. Nunca se pierde.
              setMensajes((m) => m.filter((x) => x.id !== idProvisional));
              dejarDeEsperar();
              enviar(transcript);
              return;
            }
            idsVistosRef.current.add(`u-${id}`);
            if (id > ultimoIdRef.current) ultimoIdRef.current = id;
            setMensajes((m) => m.map((x) => (x.id === idProvisional ? { ...x, id: `u-${id}` } : x)));
          });
      });
      return;
    }

    // >>> JARVIS OYE EN EL SERVIDOR <<<
    // El dictado de Chrome ya está hecho y es la red de abajo. Aquí se
    // intenta la buena: el audio va al servidor con el glosario de lo que
    // hay en pantalla, y vuelve el texto de un modelo que sí sabe que
    // existen "Pruss 200", "millero" y "CT-000097".
    //
    // Si eso falla, tarda o no hay clave del proveedor, `transcribir`
    // devuelve null y se manda lo de Chrome. El usuario no se entera y el
    // modo voz nunca se queda mudo: oír mejor es una mejora, poder hablar
    // es el requisito.
    if (vozEspejo.espejoActivo()) {
      vozEspejo.cerrar().then(async (grabado) => {
        if (!grabado) { enviar(transcript); return; }
        const terminos = terminosDeAhora(mensajes);
        const oido = await transcribir(grabado, glosarioDeAhora(mensajes));
        const elegido = elegirTexto(oido?.texto, transcript);
        // El glosario se le pide al transcriptor ANTES de oír y eso es una
        // sugerencia, no una regla: con "Sander" en la lista escribió
        // "Sandel" igual. Aquí se corrige después, que es donde sí se puede.
        const texto = corregirConGlosario(elegido.texto, terminos);
        if (oido && elegido.de === 'servidor' && oido.texto !== transcript) {
          console.info('[oido] navegador:', transcript, '· servidor:', oido.texto);
        }
        if (texto !== elegido.texto) {
          console.info('[oido] corregido con el glosario:', elegido.texto, '→', texto);
        }
        // enviar() vuelve a leer el veredicto con el texto bueno: si Chrome
        // oyó algo indeciso y el servidor entendió «autorízalo», la
        // autorización se resuelve igual.
        enviar(texto, {
          voz: {
            fuente: 'voz',
            de: elegido.de,
            modelo: oido?.modelo || null,
            ms: oido?.ms || null,
            segundos: oido?.segundos ?? Math.round((grabado.duracionMs || 0) / 1000),
            dictado_navegador: transcript,
            // Lo que salió del oído antes de corregir. Sin esto, en la caja
            // negra no hay forma de saber si una palabra rara la puso el
            // transcriptor o la puso esta corrección.
            antes_de_corregir: texto !== elegido.texto ? elegido.texto : undefined,
          },
        });
      }).catch(() => enviar(transcript));
      return;
    }

    enviar(transcript);
  };

  const startListening = () => {
    window.clearTimeout(clearBubbleTimerRef.current);
    window.clearTimeout(silencioRef.current);
    dictadoRef.current = '';
    setError('');
    setLastMessage('');

    // Reemplazar recognitionRef NO apaga el reconocedor anterior: sigue vivo
    // con el micrófono abierto. Y como el modo voz lo reabre solo al terminar
    // de hablar, se acumulaban. La primera pregunta real que se le hizo a
    // Hermes le llegó SEIS veces, una por cada reconocedor que seguía oyendo
    // (y una cortada a media palabra, del que cerró antes).
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
      } catch { /* ya estaba muerto: da igual */ }
      recognitionRef.current = null;
    }

    if (!SpeechRecognitionApi) {
      setError('Este navegador no soporta dictado por voz.');
      return;
    }

    // Segundo cierre, por si abort() no llega a tiempo o el navegador entrega
    // un resultado ya en camino: cada reconocedor lleva número y solo el
    // último manda. Sin esto, uno que sobreviva sigue hablando por su cuenta.
    const miTurno = ++micTurnoRef.current;

    const recognition = new SpeechRecognitionApi();
    recognition.lang = 'es-ES';
    // Chrome, en modo suelto, corta en la PRIMERA pausa: uno dice "quiero
    // saber el precio de una pieza..." y mientras piensa el nombre, ya se lo
    // mandó a medias. En continuo no corta él, y aquí se decide que la frase
    // terminó cuando pasan dos segundos sin oír nada nuevo.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      // La espera termina con la escucha: el próximo micrófono ya es normal.
      esperandoAutorizacionRef.current = false;
      // Si el navegador cierra por su cuenta con algo dictado a medias, se
      // manda igual: perderlo sería peor que mandarlo corto.
      if (miTurno === micTurnoRef.current) cerrarDictado();
    };
    recognition.onerror = (event) => {
      setListening(false);
      // Cuando el micrófono se abrió solo para esperar la autorización, el
      // silencio es una respuesta válida: la persona está leyendo la tarjeta.
      // Gritarle "no pude escuchar" encima de lo que está leyendo estorba.
      if (esperandoAutorizacionRef.current && event?.error === 'no-speech') return;

      // "not-allowed" es el micrófono bloqueado en el navegador, y decirlo así
      // no ayuda a nadie. Importa sobre todo con una autorización en pantalla:
      // el agente pregunta hablando, abre el micrófono, no puede oír, y desde
      // fuera parece que no esperó la respuesta.
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        setError(propuestaRef.current
          ? 'El micrófono está bloqueado en el navegador. Autoriza con los botones de la tarjeta, o permítelo en el candado de la barra de direcciones.'
          : 'El micrófono está bloqueado. Púlsalo en el candado de la barra de direcciones y recarga.');
        return;
      }

      const reason = event?.error ? ` (${event.error})` : '';
      setError(`No pude escuchar bien${reason}.`);
    };
    recognition.onresult = (event) => {
      if (miTurno !== micTurnoRef.current) return;   // reconocedor viejo

      // Se rearma la frase entera cada vez: Chrome reentrega los tramos ya
      // cerrados junto al que está en curso, y quedarse solo con el último
      // perdería el principio.
      let texto = '';
      for (const r of event.results) texto += (r[0]?.transcript || '') + ' ';
      texto = texto.trim();
      if (!texto) return;

      dictadoRef.current = texto;
      setLastMessage(texto);          // se ve lo que va entendiendo

      // Cada palabra nueva reinicia la cuenta. Dos segundos callado es haber
      // terminado; una pausa para pensar el nombre de la pieza, no.
      window.clearTimeout(silencioRef.current);
      silencioRef.current = window.setTimeout(cerrarDictado, 2000);
    };

    recognitionRef.current = recognition;
    recognition.start();
    // El original, en paralelo. Si no se puede grabar —permiso, micrófono
    // ocupado, http sin cifrar— el dictado sigue igual: esto guarda el
    // audio, no habilita hablar.
    // El grabador arranca para los DOS. Antes solo para Hermes, porque el
    // audio se guardaba para que él lo oyera luego. Ahora Jarvis también lo
    // necesita: es lo que manda al servidor para que lo transcriba de
    // verdad, en vez de fiarse de lo que oyó Chrome.
    vozEspejo.iniciar();
  };

  const stopListening = () => {
    // cerrarDictado() de abajo se queda con el audio si hay algo dictado;
    // si no lo hay, esta cancelacion es la que apaga el microfono.
    // Apagar el micrófono a propósito cierra la conversación hablada. Sin
    // esto, el círculo se volvería a encender solo en la siguiente respuesta
    // y no habría forma de terminar.
    modoVozRef.current = false;
    // Apagar a mano manda lo que ya dijo: en continuo, esperar los dos
    // segundos de silencio después de pulsar sería tirar la frase.
    cerrarDictado();
    recognitionRef.current?.stop();
    setListening(false);
  };

  // Pulsar o escribir es intención humana: reinicia el contador de vueltas
  // automáticas. La conversación sigue mientras haya alguien empujándola.
  const reiniciarSeguidas = () => { seguidasRef.current = 0; };

  const toggleVoice = () => {
    reiniciarSeguidas();
    // MIENTRAS HABLA: se le corta la palabra y se empieza a escuchar en el
    // mismo gesto. Interrumpir a alguien es para decirle algo — obligar a un
    // clic para callarlo y otro para hablarle no es interrumpir, es esperar.
    if (speaking) {
      callar();
      window.clearTimeout(clearBubbleTimerRef.current);
      setSpeaking(false);
      startListening();
      return;
    }

    // Pensando sí solo corta: no hay nada que interrumpir todavía.
    if (loading) {
      interrumpir();
      return;
    }

    if (listening) {
      stopListening();
      return;
    }

    if (loading) return;

    // ── EL SALUDO, AL TOCAR LA ESFERA ───────────────────────────
    // (2026-08-16) "quiero que al darle click a la esfera de Jarvis este
    // conteste". Hasta aquí la esfera abría el micrófono en silencio: había
    // que tocarla, esperar a que creciera y adivinar que ya estaba oyendo.
    //
    // Solo la PRIMERA vez de cada conversación. Repetirlo cada vez que se
    // vuelve a la esfera sería un loro.
    //
    // El texto sale de la ficha del agente (agente_sistema.saludo), que se
    // edita sin desplegar; lo de aquí es el respaldo si está vacía. Y como
    // speak() abre el micrófono al terminar de hablar, la persona puede
    // contestarle al saludo sin tocar nada más.
    modoVozRef.current = true;
    if (!yaSaludoRef.current) {
      yaSaludoRef.current = true;
      speak(agenteActivo?.saludo || '¿En qué le puedo servir, señor?');
      return;
    }

    startListening();
  };

  return (
    <>
      <style>{`
        /* jarvis-spin y jarvis-pulse se fueron con el micrófono: eran los
           anillos y el latido de su núcleo rojo, y ya no los usa nadie. */

        /* La esfera. Tres manchas de color girando a distinta
           velocidad detrás de un desenfoque grande: por eso la superficie
           parece moverse sola sin que nada tenga borde. Un círculo liso se
           ve muerto; esto respira. */
        @keyframes orbe-respira {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.045); }
        }
        @keyframes orbe-gira        { to { transform: rotate(360deg); } }
        @keyframes orbe-gira-lento  { to { transform: rotate(-360deg); } }
        /* Escuchando: late al ritmo de quien habla, más marcado. */
        @keyframes orbe-escucha {
          0%, 100% { transform: scale(1);     }
          25%      { transform: scale(1.07);  }
          50%      { transform: scale(1.02);  }
          75%      { transform: scale(1.09);  }
        }
        @keyframes orbe-entra {
          from { opacity: 0; transform: scale(0.9); }
          to   { opacity: 1; transform: scale(1);   }
        }

        @keyframes jarvis-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>

      <div
        className="pointer-events-none fixed z-50 flex flex-col items-end gap-2"
        style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : { right: 20, bottom: 20 }}
      >
        {/* Selector de voz. Existe porque las voces dependen de lo que tenga
            instalado ESTE Windows: no hay forma de saberlo desde el código,
            y la diferencia entre una neuronal y una vieja es abismal. */}
        {verVoces && (
          <div className="pointer-events-auto w-[290px] rounded-lg border border-cyan-300/25 bg-slate-950/95 p-3 text-xs text-cyan-50 shadow-xl">
            <div className="mb-2 font-bold uppercase tracking-wider text-cyan-300">Voz de {nombreAgente}</div>
            {voces.length === 0 ? (
              <p className="text-cyan-200/70">No hay voces en español instaladas en este equipo.</p>
            ) : (
              <>
                <select
                  value={vozSel}
                  onChange={(e) => cambiarVoz(e.target.value)}
                  className="w-full rounded border border-cyan-300/30 bg-slate-900 px-2 py-1.5 text-cyan-50"
                >
                  <option value="">Automática (la mejor que encuentre)</option>
                  {voces.map((v) => (
                    <option key={v.nombre} value={v.nombre}>
                      {v.neuronal ? '★ ' : ''}{v.nombre} · {v.lang}
                    </option>
                  ))}
                </select>
                <p className="mt-2 leading-snug text-cyan-200/60">
                  Las marcadas con ★ son neuronales y suenan a persona. Para el
                  doblaje latino busca una de <b>México</b> (es-MX).
                </p>

                <div className="mt-3 space-y-2 border-t border-cyan-300/15 pt-2">
                  <label className="block">
                    <span className="text-cyan-200/70">Tono · {aj.tono.toFixed(2)}</span>
                    <input type="range" min="0.6" max="1.4" step="0.05" value={aj.tono}
                      onChange={(e) => cambiarAjuste({ tono: Number(e.target.value) })}
                      className="w-full accent-cyan-400" />
                  </label>
                  <label className="block">
                    <span className="text-cyan-200/70">Ritmo · {aj.ritmo.toFixed(2)}</span>
                    <input type="range" min="0.6" max="1.3" step="0.02" value={aj.ritmo}
                      onChange={(e) => cambiarAjuste({ ritmo: Number(e.target.value) })}
                      className="w-full accent-cyan-400" />
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={aj.pitidos}
                      onChange={(e) => cambiarAjuste({ pitidos: e.target.checked })}
                      className="accent-cyan-400" />
                    <span className="text-cyan-200/70">Pitidos de interfaz</span>
                  </label>
                </div>
                {!voces.some((v) => v.neuronal) && (
                  <p className="mt-2 leading-snug text-amber-300/90">
                    No tienes ninguna voz neuronal. Se instalan en Windows:
                    Configuración → Hora e idioma → Voz → Agregar voces.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {chatAbierto && (
          // Agrandada NO cuelga de la esfera. La columna se apila hacia
          // arriba desde donde esté el orbe, asi que una ventana alta se salia
          // por el techo de la pantalla y se llevaba consigo la cabecera: el
          // boton de reducir quedaba fuera del viewport, imposible de pulsar.
          // Fijada al viewport siempre tiene sus cuatro bordes dentro.
          <div className={`pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-cyan-300/25 bg-slate-950/95 shadow-2xl ${chatGrande ? "fixed right-4 top-4 bottom-24 z-[60] w-[46rem] max-w-[calc(100vw-2rem)]" : "h-[26rem] w-[22rem] max-w-[calc(100vw-2.5rem)]"}`}>
            <div className="flex items-center gap-2 border-b border-cyan-300/15 px-3 py-2">
              <span className="text-sm font-black uppercase tracking-widest text-cyan-300">{nombreAgente}</span>
              {/* El puesto tiene que seguir al canal, igual que el nombre. Con
                  el de la empresa fijo se leía "JARVIS · asistente de Repuestos
                  Morla", que es justo lo contrario de lo que se quiso separar. */}
              <span className="truncate text-[11px] text-cyan-200/50">{agenteActivo?.puesto}</span>
              {/* Quién contestó SEGÚN EL SERVIDOR. En ámbar significa que
                  respondió el asesor viejo porque falta correr el SQL. */}
              {agenteQueContesto === null && (
                <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
                  title="Respondió el asesor genérico: falta correr agentes_ia_por_empresa.sql">
                  sin agente
                </span>
              )}
              {agenteQueContesto && (
                <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"
                  title="Confirmado por el servidor: se cargó la personalidad de este agente">
                  ✓ {agenteQueContesto}
                </span>
              )}
              {/* Soltar el hilo sin borrar nada. Hace falta un botón porque
                  las doce horas resuelven el "me fui y volví mañana", pero no
                  el "acabo de terminar con este cliente y entra el siguiente",
                  que en un mostrador pasa cada rato. */}
              {canal === 'local' && (
                <button type="button" onClick={nuevaConversacion} disabled={loading}
                  title="Empezar una conversación nueva. Lo anterior no se borra; deja de arrastrarse."
                  aria-label="Empezar una conversación nueva"
                  className="ml-auto shrink-0 rounded border border-cyan-300/25 px-1.5 py-0.5 text-[10px] font-bold text-cyan-200/70 hover:bg-cyan-500/15 hover:text-cyan-100 disabled:opacity-40">
                  Nueva
                </button>
              )}
              {/* Agrandar la conversación. No es lo mismo que el modo voz: eso
                  cierra el chat y pone la esfera; esto deja lo mismo, más
                  grande, para poder LEER. */}
              {/* Los dos controles van juntos a la derecha. Con ml-auto en
                  ambos, el de agrandar se quedaba varado en mitad de la
                  cabecera y el ✕ en la esquina: parecian de cosas distintas.
                  Y ya grande lleva su nombre escrito, porque un icono de
                  flechitas no dice "esto lo devuelve a chico". */}
              <div className={`${canal === 'local' ? '' : 'ml-auto '}flex shrink-0 items-center gap-1.5`}>
                <button type="button" onClick={() => setChatGrande((v) => !v)}
                  title={chatGrande ? 'Volver al tamaño normal' : 'Agrandar la conversación'}
                  aria-label={chatGrande ? 'Volver al tamaño normal' : 'Agrandar la conversación'}
                  className="flex items-center gap-1 rounded border border-cyan-300/25 px-1.5 py-1 text-cyan-200/70 hover:bg-cyan-500/15 hover:text-cyan-100">
                  {chatGrande ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  {chatGrande && <span className="text-[10px] font-bold uppercase tracking-wide">Reducir</span>}
                </button>
                <button type="button" onClick={() => setChatAbierto(false)}
                  title="Cerrar la conversación"
                  className="text-cyan-200/60 hover:text-cyan-100">✕</button>
              </div>
            </div>

            {/* Con quién se está hablando de verdad. Hermes es un programa
                aparte, fuera de MotoFlow: si su servidor está caído no hay
                Hermes, y hay que decirlo en vez de dejar a alguien esperando.
                "Su memoria" es lo que lo distingue del asistente del
                servidor — es el mismo agente de siempre, con lo que recuerda
                de conversaciones anteriores. Decía "memoria de Telegram" y
                se leía como si los dos canales fueran el mismo. No lo son. */}
            <div className="flex items-center gap-2 border-b border-cyan-300/10 px-3 py-1.5 text-[11px]">
              {selectorCanal()}
              {canal === 'hermes' ? (
                hermesVivo === false ? (
                  <span className="truncate text-amber-300">sin señal de su servidor</span>
                ) : hermesVivo ? (
                  <span className="truncate text-emerald-300/80">con su memoria</span>
                ) : (
                  <span className="truncate text-slate-400">comprobando…</span>
                )
              ) : (
                <span className="truncate text-cyan-200/60">
                  asistente de MotoFlow, no es {nombreEmpresa}
                </span>
              )}
            </div>

            {/* Que se vea qué está mirando. Si el agente contesta algo raro,
                lo primero que uno quiere saber es de qué pantalla habla. */}
            {leerContexto()?.titulo && (
              <div className="border-b border-cyan-300/10 px-3 py-1.5 text-[11px] text-cyan-200/50">
                viendo: <b className="text-cyan-200/80">{leerContexto().titulo}</b>
                {leerContexto().datos ? ' · con datos' : ''}
              </div>
            )}

            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
              {mensajesDelCanal.length === 0 && (
                <p className="mt-6 text-center text-xs leading-relaxed text-cyan-200/40">
                  Pregúntale por una pieza, cómo va el día,<br />o qué ve en esta pantalla.
                </p>
              )}
              {mensajesDelCanal.map((m) => (
                <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
                  <span className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-left text-xs ${
                    m.role === 'user'
                      ? 'bg-cyan-500/20 text-cyan-50'
                      : 'bg-slate-800/80 text-slate-100'
                  }`}>{m.content}</span>
                  {/* CUANDO EL QUE FALLA ES EL MOTOR DEL AGENTE, NO MOTOFLOW.
                      (2026-08-16) Hermes contestó "The model provider is
                      rate-limiting requests" — en inglés, y sin decir qué
                      hacer. El texto original se queda: es la verdad y no se
                      esconde. Debajo va lo que falta, que es la salida. */}
                  {m.role === 'assistant' && sinMotor(m.content) && (
                    <p className="mt-1 rounded bg-amber-500/15 px-2 py-1 text-[11px] text-amber-200">
                      Eso no es MotoFlow: es el motor de {nombreEmpresa} el que no
                      está respondiendo. Cambia a <b>{nombreSistema}</b> en el
                      interruptor de arriba y sigue trabajando.
                    </p>
                  )}
                  {/* QUIÉN contestó, en cada burbuja. Los dos hablan con la
                      misma persona y el mismo nombre arriba: sin esto, mirando
                      una conversación vieja no hay forma de saber a cuál de los
                      dos se le preguntó. */}
                  {m.role === 'assistant' && m.de && (
                    <p className={`mt-0.5 text-[10px] ${m.de === 'hermes' ? 'text-emerald-300/70' : 'text-amber-300/60'}`}>
                      {m.de === 'hermes' ? nombreEmpresa : `${nombreSistema} — no es ${nombreEmpresa}`}
                    </p>
                  )}
                  {/* EL TEXTO SIEMPRE ESTÁ. El audio es otra forma de oír lo
                      mismo, nunca la única: si el TTS falló, arriba sigue
                      estando la respuesta escrita. */}
                  {m.mediaId && (
                    <div className={m.role === 'user' ? 'flex justify-end' : ''}>
                      <ReproductorVoz mediaId={m.mediaId} onInterrumpido={marcarInterrumpido} />
                    </div>
                  )}
                  {/* Y lo mismo con la foto: el texto de arriba dice qué es.
                      Una promoción que no se puede leer sin abrir la imagen
                      no sirve en un teléfono a media luz. */}
                  {m.imagenId && (
                    <div className={m.role === 'user' ? 'flex justify-end' : ''}>
                      <ImagenHermes imagenId={m.imagenId} />
                    </div>
                  )}
                  {/* Un borrador del equipo trae su foto como URL dentro del
                      texto. Se pinta: un enlace de cien caracteres no se
                      mira desde un teléfono. */}
                  {!m.imagenId && m.role === 'assistant' && urlDeImagenEnTexto(m.content) && (
                    <ImagenPorUrl url={urlDeImagenEnTexto(m.content)} />
                  )}
                  {/* Qué consultó para contestar eso. Distingue una respuesta
                      con datos de una de memoria. */}
                  {m.role === 'assistant' && m.herramientas?.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-cyan-200/40">
                      consultó {[...new Set(m.herramientas.map((h) => h?.herramienta || h))]
                        .join(', ').replace(/_/g, ' ')}
                    </p>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2">
                  {/* El paso de verdad cuando lo hay. "pensando…" durante tres
                      minutos no distingue trabajar de estar colgado. */}
                  <p className="text-xs text-cyan-200/50">
                    {paso ? `⚙️ ${paso}…` : 'pensando…'}
                  </p>
                  <button type="button" onClick={interrumpir}
                    className="rounded border border-red-400/40 px-1.5 py-0.5 text-[10px] font-bold text-red-300 hover:bg-red-500/15">
                    Detener
                  </button>
                </div>
              )}
              <div ref={finRef} />
            </div>

            {/* LA FIRMA DEL BORRADOR. Hermes te lo trae; si para firmarlo hay
                que irse a Equipo IA, no te lo ha entregado del todo. */}
            {borrador && (
              <div className="border-t border-violet-400/30 bg-violet-500/10 p-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="rounded bg-violet-400/25 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-200">
                    Esperando tu firma
                  </span>
                  <span className="text-[10px] text-violet-200/70">riesgo {borrador.riesgo}</span>
                </div>
                <p className="text-xs font-bold text-violet-50">{borrador.accion}</p>
                {borrador.impacto && (
                  <p className="mt-0.5 text-[10px] text-violet-200/70">{borrador.impacto}</p>
                )}
                {/* Tres botones y solo uno decía algo claro. Se pulsaba
                    Rechazar para decir "esto no me gusta" —y Rechazar cierra
                    el trabajo entero, con su concepto ya aprobado y sus
                    piezas—. Ahora el del medio pide el texto y devuelve la
                    pieza al creativo, y el rojo avisa de lo que hace. */}
                {pidiendoCambios ? (
                  <div className="mt-2">
                    <textarea
                      value={notaCambios}
                      onChange={(e) => setNotaCambios(e.target.value)}
                      rows={3}
                      autoFocus
                      placeholder="Qué hay que cambiar. Ej.: el título muy pegado al frasco, y el precio más grande."
                      className="w-full rounded border border-violet-400/40 bg-slate-950/70 p-2 text-[11px] text-violet-50 placeholder:text-violet-300/40"
                    />
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <button type="button" disabled={firmando || !notaCambios.trim()}
                        onClick={() => firmarBorrador('changes_requested', notaCambios.trim())}
                        className="rounded bg-violet-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
                        {firmando ? 'Enviando…' : 'Devolver al creativo'}
                      </button>
                      <button type="button" disabled={firmando}
                        onClick={() => { setPidiendoCambios(false); setNotaCambios(''); }}
                        className="rounded border border-violet-400/30 px-3 py-1 text-xs font-bold text-violet-200/70 disabled:opacity-50">
                        Volver
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={firmando}
                      onClick={() => firmarBorrador('approved')}
                      className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
                      {firmando ? 'Grabando…' : 'Aprobar'}
                    </button>
                    <button type="button" disabled={firmando}
                      onClick={() => setPidiendoCambios(true)}
                      className="rounded border border-violet-400/40 px-3 py-1 text-xs font-bold text-violet-200 disabled:opacity-50">
                      Pedir cambios
                    </button>
                    <button type="button" disabled={firmando}
                      onClick={() => firmarBorrador('rejected')}
                      title="Cierra el trabajo entero. Si solo quieres otra versión, usa Pedir cambios."
                      className="rounded border border-red-400/40 px-3 py-1 text-xs font-bold text-red-300 disabled:opacity-50">
                      Descartar todo
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* AUTORIZACIÓN. Los datos se muestran EN PANTALLA porque un
                monto hablado se oye mal: "catorce mil" y "cuarenta mil" se
                parecen demasiado para aprobarlos de oído. */}
            {propuesta && (
              <div className="border-t border-amber-400/30 bg-amber-500/10 p-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="rounded bg-amber-400/25 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-200">
                    Requiere su autorización
                  </span>
                </div>
                <p className="text-xs text-amber-50">{propuesta.resumen}</p>

                {propuesta.payload?.lineas?.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {propuesta.payload.lineas.map((l, i) => (
                      <li key={i} className="text-[11px] text-amber-100/80">
                        · {l.cantidad} × {l.codigo}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1.5 text-[10px] text-amber-200/70">
                  Los precios los pone el catálogo al grabar, no el agente.
                </p>

                {propuesta.requiere_password && (
                  <input
                    type="password" value={clave} onChange={(e) => setClave(e.target.value)}
                    placeholder="Contraseña administrativa"
                    className="mt-2 w-full rounded border border-amber-400/40 bg-slate-900 px-2 py-1 text-xs text-amber-50"
                  />
                )}

                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={autorizando}
                    onClick={() => resolverPropuesta(true)}
                    className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
                    {autorizando ? 'Grabando…' : 'Autorizar'}
                  </button>
                  <button type="button" disabled={autorizando}
                    onClick={() => resolverPropuesta(false)}
                    className="rounded border border-red-400/40 px-3 py-1 text-xs font-bold text-red-300">
                    Descartar
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-amber-200/50">
                  O dilo en voz alta: «autorizo» / «cancela». Vence en 10 minutos.
                </p>
              </div>
            )}

            {/* El error se pintaba SOLO con el círculo cerrado. Abierto —que es
                como se usa— un fallo no se veía: la pregunta quedaba ahí y
                parecía que el agente la ignoraba. Se perdió media hora
                buscando en el servidor un mensaje que el navegador ya tenía. */}
            {error && (
              <div className="mx-2 mb-1 rounded-md border border-red-500/40 bg-red-950/80 px-2.5 py-1.5 text-[11px] text-red-100">
                {error}
              </div>
            )}

            {/* Solo con Hermes: el asistente rápido corre en una Edge Function
                y no tiene STT. Enseñar el micrófono ahí sería ofrecer algo que
                no existe. */}
            {canal === 'hermes' && (
              <BarraVozHermes
                tenantId={profile?.tenant_id}
                deshabilitado={loading}
                contexto={contextoParaAgente(leerModulos())}
                onError={setError}
                onEnviar={alEnviarVoz}
              />
            )}

            <form
              className="flex gap-1.5 border-t border-cyan-300/15 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = texto.trim();
                if (!t) return;
                setTexto('');
                reiniciarSeguidas();
                enviar(t, { conVoz: false });
              }}
            >
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={`Escríbele a ${nombreAgente}…`}
                className="min-w-0 flex-1 rounded-md border border-cyan-300/25 bg-slate-900 px-2.5 py-1.5 text-xs text-cyan-50 placeholder:text-cyan-200/30 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <button type="submit" disabled={loading || !texto.trim()}
                className="rounded-md bg-cyan-600 px-3 text-xs font-bold text-white disabled:opacity-40">
                Enviar
              </button>
            </form>


          </div>
        )}

        {/* ── Modo voz a pantalla completa ────────────────────────────────
            Sin hilo, sin panel, sin sistema detrás: la esfera, en qué anda, y
            tres botones. Lo que se dice se lee grande debajo, porque en un
            local con ruido la voz se pierde y el precio hay que verlo. */}
        {modoLive && (
          <div
            className="pointer-events-auto fixed inset-0 z-[120] flex flex-col items-center justify-center gap-8 bg-slate-950/97 px-6 backdrop-blur-2xl"
            style={{ animation: 'orbe-entra 260ms ease-out' }}
          >
            {/* En pantalla completa el nombre no basta: hay que poder cambiar
                de agente sin salir del modo voz. Es justo donde más falta hace
                —si el de la empresa tarda, aquí no hay barra de chat a la que
                volver— y donde antes no había ningún selector. */}
            <div className="absolute top-5 left-0 right-0 flex flex-col items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/40">
                {nombreAgente}
              </span>
              {selectorCanal()}
            </div>

            {/* La esfera. El tamaño y el ritmo dicen el estado sin una sola
                palabra: quieta y lenta esperando, latiendo al escuchar,
                brillando al hablar. */}
            <div
              className="relative flex items-center justify-center"
              style={{
                width: 'min(58vw, 260px)',
                height: 'min(58vw, 260px)',
                animation: listening
                  ? 'orbe-escucha 2.4s ease-in-out infinite'
                  : 'orbe-respira 4.5s ease-in-out infinite',
              }}
            >
              {/* El halo. Lo que hace que se vea encendida y no pegada. */}
              <div
                className="absolute inset-[-18%] rounded-full opacity-70"
                style={{
                  background: speaking
                    ? 'radial-gradient(circle, rgba(125,211,252,0.42) 0%, rgba(56,189,248,0.14) 45%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(148,163,184,0.28) 0%, rgba(56,189,248,0.10) 45%, transparent 70%)',
                  filter: 'blur(18px)',
                  transition: 'background 500ms ease',
                }}
              />

              {capasEsfera(26)}
            </div>

            <p className="text-sm text-cyan-100/70">
              {speaking ? 'Hablando…' : listening ? 'Te escucho…' : loading ? 'Consultando…' : 'Toca el micrófono para hablar'}
            </p>

            {(lastMessage || error) && (
              <p className={`max-w-lg text-center text-base leading-relaxed ${error ? 'text-red-300' : 'text-slate-100'}`}>
                {error || lastMessage}
              </p>
            )}

            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={toggleVoice}
                title={listening ? 'Dejar de escuchar' : 'Hablar'}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
                  listening ? 'bg-emerald-400 text-slate-900' : 'bg-white/12 text-white hover:bg-white/20'
                }`}
              >
                {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>

              <button
                type="button"
                onClick={() => { interrumpir(); setModoLive(false); }}
                title="Salir del modo voz"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/12 text-white transition-colors hover:bg-white/20"
              >
                <span className="text-xl leading-none">✕</span>
              </button>

              <button
                type="button"
                onClick={() => { if (!mudo) callar(); setMudo((v) => !v); }}
                title={mudo ? 'Volver a escucharlo' : 'Silenciar la voz (sigue contestando por escrito)'}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
                  mudo ? 'bg-amber-400/90 text-slate-900' : 'bg-white/12 text-white hover:bg-white/20'
                }`}
              >
                <span className="text-lg leading-none">{mudo ? '🔇' : '🔊'}</span>
              </button>
            </div>
          </div>
        )}

        {/* pointer-events-none: la burbuja quedaba encima de F10 - GRABAR y no
            dejaba facturar. Un asistente que estorba el trabajo es peor que no
            tenerlo, y el aviso se puede leer igual aunque los clics lo
            atraviesen. */}
        {!chatAbierto && (error || lastMessage) && (
          <div className={`pointer-events-none max-w-[280px] rounded-md border px-3 py-2 text-xs shadow-xl ${
            error
              ? 'border-red-500/40 bg-red-950/90 text-red-50'
              : 'border-cyan-300/20 bg-slate-950/90 text-cyan-50'
          }`}>
            {error || lastMessage}
          </div>
        )}

        {/* El asa para moverlo. Aparte del círculo a propósito: si arrastrara
            el círculo entero, no se podría pulsar para hablarle. */}
        <div
          onMouseDown={alBajarRaton}
          onDoubleClick={() => { setPos(null); try { localStorage.removeItem('jarvis_pos'); } catch { /* da igual */ } }}
          title="Arrástrame para moverme · doble clic para volver a la esquina"
          className="pointer-events-auto h-4 w-12 cursor-move rounded-full border border-cyan-300/25 bg-slate-900/80 opacity-40 transition-opacity hover:opacity-100"
        />

        {/* La esfera ocupa el sitio del micrófono y hace lo mismo que hacía él:
            pulsar enciende y apaga la voz, y crece al estar activa. Los anillos
            rojos giratorios se van con el micrófono — eran su lenguaje, no el
            de la esfera.

            Lo que SÍ se conserva es cómo se lee "apagado": el aro y el
            resplandor siguen siendo rojos en reposo y verdes al encender, y en
            reposo la esfera va desaturada. Sin eso habría que pulsarla para
            saber si te está oyendo, que en un mostrador no vale. */}
        <button
          type="button"
          onClick={toggleVoice}
          disabled={loading}
          className={`pointer-events-auto relative flex aspect-square items-center justify-center overflow-hidden rounded-full bg-slate-900 outline-none transition-all duration-300 ${
            activeCore
              ? 'h-32 w-32 border border-emerald-300/40 shadow-[0_0_42px_rgba(16,185,129,0.45)]'
              : 'h-14 w-14 border border-red-400/35 shadow-[0_0_24px_rgba(239,68,68,0.32)] saturate-[0.35] opacity-90'
          }`}
          // Sin hover:scale-105: la esfera ya respira con una animación de
          // transform, y las dos peleándose por la misma propiedad daba un
          // tirón al pasar el ratón por encima.
          style={{
            animation: listening
              ? 'orbe-escucha 2.4s ease-in-out infinite'
              : 'orbe-respira 4.5s ease-in-out infinite',
          }}
          title={activeCore ? `Apagar la voz de ${nombreAgente}` : `Hablarle a ${nombreAgente}`}
        >
          {capasEsfera(activeCore ? 12 : 6)}

          {activeCore && (
            // Texto oscuro: la esfera es clara y el blanco de antes —que se
            // leía sobre el núcleo rojo— aquí desaparecería.
            <span className="relative z-10 px-1 text-center text-sm font-black uppercase tracking-[0.2em] text-slate-900/85 drop-shadow-[0_1px_6px_rgba(255,255,255,0.9)]">
              {nombreAgente}
            </span>
          )}

          {listening && (
            <MicOff className="absolute bottom-[12%] right-[12%] z-10 h-[14%] w-[14%] min-h-3 min-w-3 text-slate-700/80" />
          )}
        </button>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setChatAbierto((v) => !v)}
            title={noLeidos > 0
              ? `${nombreAgente} tiene ${noLeidos} aviso(s) sin leer`
              : `Escribirle a ${nombreAgente}`}
            className={`relative rounded-full border bg-slate-950/80 p-1.5 hover:text-cyan-100 ${
              noLeidos > 0
                ? 'border-red-400/60 text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.45)]'
                : 'border-cyan-300/25 text-cyan-200/70'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {noLeidos > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                {noLeidos > 9 ? '9+' : noLeidos}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setModoLive(true);
              setChatAbierto(false);
              // El saludo NO va aquí: va en toggleVoice, que es lo que llama
              // la esfera. Puesto en los dos sitios saludaría dos veces.
              if (!listening && !speaking && !loading) toggleVoice();
            }}
            title="A pantalla completa"
            className="rounded-full border border-cyan-300/25 bg-slate-950/80 p-1.5 text-cyan-200/70 hover:text-cyan-100"
          >
            {/* Era una esferita igual que la grande. Ahora que el botón
                principal ES la esfera, dos esferas juntas no dicen cuál hace
                qué: este solo agranda lo que ya hay. */}
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setVerVoces((v) => !v)}
            title="Elegir la voz"
            className="rounded-full border border-cyan-300/25 bg-slate-950/80 p-1.5 text-cyan-200/70 hover:text-cyan-100"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
