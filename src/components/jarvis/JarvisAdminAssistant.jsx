import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Settings2, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { hablar, callar, listarVoces, vozElegida, elegirVoz, alListarVoces, ajustes, guardarAjustes } from '@/lib/vozJarvis';
import { leerContexto, leerModulos } from '@/lib/pantallaContexto';
import { ordenarPantalla, normalizarOrdenVenta } from '@/lib/puenteAgente';
import { usePanels } from '@/contexts/panelCore';

const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition || null;

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

function veredictoDeVoz(texto) {
  const t = String(texto).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // Más de cinco palabras ya no es un "sí": es una instrucción nueva.
  if (t.split(' ').length > 5) return null;

  if (/^(si|si autorizo|autorizo|autorizado|aprobado|apruebo|confirmo|hazlo|grabalo|adelante|correcto|dale)$/.test(t)) return 'si';
  // Solo lo inequívoco. "espera" y "para" quedan FUERA a propósito: quien
  // dice "espera" quiere pensarlo, no descartar. Ante la duda no se toca la
  // propuesta y decide con el botón.
  if (/^(no|no autorizo|no lo hagas|cancela|cancelar|cancelalo|descarta|descartalo|dejalo|olvidalo|borralo)$/.test(t)) return 'no';
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
  const [loading, setLoading] = useState(false);
  const [lastMessage, setLastMessage] = useState('');
  const [error, setError] = useState('');
  // La sesión se recuerda entre recargas. Sin esto, cada F5 empezaba una
  // conversación nueva: el historial seguía en la base pero sin su
  // identificador no había forma de volver a encontrarlo, y además Jarvis
  // perdía el hilo de lo que se venía hablando.
  const [sessionId, setSessionId] = useState(() => {
    try { return localStorage.getItem('jarvis_sesion') || null; } catch { return null; }
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
  // Quién contestó SEGÚN EL BACKEND. Si viene null, respondió el asesor
  // genérico porque la tabla agentes_ia está vacía — y eso hay que verlo,
  // no adivinarlo.
  const [agenteQueContesto, setAgenteQueContesto] = useState(undefined);

  // ── El canal ──────────────────────────────────────────────────────────
  // 'hermes' es el Hermes DE VERDAD, el que vive en la PC de la tienda con
  // su memoria de Telegram. 'local' es el asistente del servidor: contesta
  // al instante pero es otro programa, sin esa memoria.
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
        supabase.from('hermes_chat').select(sinAccionesRef.current ? 'id, rol, texto, creado_en' : 'id, rol, texto, creado_en, acciones')
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
      .select(sinAccionesRef.current ? 'id, rol, texto' : 'id, rol, texto, acciones')
      .gt('id', ultimoIdRef.current)
      .order('id').limit(30)
      .then(({ data, error: e }) => {
        if (!vivo) return;
        if (e) {
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
    window.clearTimeout(esperaHermesRef.current);
    esperaHermesRef.current = window.setTimeout(() => {
      esperandoRef.current = false;
      setLoading(false);
      setError('Hermes no ha contestado. Puede estar ocupado o con su PC apagada.');
    }, 45000);

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
        p_pantalla: { ...leerContexto(), modulos: leerModulos() },
      });
      if (e) throw e;
      if (data?.id) {
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

  const enviar = (texto, opciones = {}) => {
    const conVoz = opciones.conVoz !== false;
    if (canal === 'hermes') {
      if (hermesVivo) return enviarAHermes(texto, { conVoz });
      // Antes se pasaba SOLO al asistente rápido. Y como este contesta con la
      // persona de Hermes, quien preguntaba creía estar hablando con él: el
      // aviso ámbar decía "no está conectado" y abajo alguien contestaba
      // igual. Cambiar de interlocutor sin decirlo no es una comodidad.
      setError(`${nombreEmpresa} no está conectado: su PC está apagada. Si quieres que conteste ${nombreSistema}, púlsalo arriba.`);
      return undefined;
    }
    return askAiCeo(texto, { conVoz });
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
      if (f.acciones?.tipo === 'preparar_venta') {
        ordenarPantalla('ventas', normalizarOrdenVenta(f.acciones));
        try { openPanel('ventas'); } catch { /* módulo inexistente */ }
      }
    }

    const suya = [...nuevas].reverse().find((n) => n.role === 'assistant');
    if (suya) {
      dejarDeEsperar();
      setAgenteQueContesto(agente?.nombre || 'Hermes');
      if (modoVozRef.current) speak(suya.content);
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    supabase.from('ai_chat_messages')
      .select('id, role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setMensajes(data || []));
  }, [sessionId]);

  useEffect(() => {
    if (chatAbierto) finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, loading, chatAbierto]);

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
    dejarDeEsperar();
    setLastMessage('');
  };

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
          content: `Listo. ${r.numero ? `Cotización ${r.numero}` : 'Hecho'}${r.total ? ` · RD$ ${Number(r.total).toLocaleString('es-DO')}` : ''}`,
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
  const askAiCeo = async (text, { conVoz = true } = {}) => {
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
        try { localStorage.setItem('jarvis_sesion', data.session_id); } catch { /* sin espacio: dura esta pestaña */ }
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
  };

  const stopListening = () => {
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

    if (!loading) startListening();
  };

  return (
    <>
      <style>{`
        @keyframes jarvis-spin {
          to { transform: rotate(360deg); }
        }

        @keyframes jarvis-pulse {
          0%, 100% { opacity: 0.68; transform: scale(0.96); }
          50% { opacity: 1; transform: scale(1.06); }
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
          <div className="pointer-events-auto flex h-[26rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-cyan-300/25 bg-slate-950/95 shadow-2xl">
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
              <button type="button" onClick={() => setChatAbierto(false)}
                className="ml-auto text-cyan-200/60 hover:text-cyan-100">✕</button>
            </div>

            {/* Con quién se está hablando de verdad. Hermes vive en la PC de
                la tienda: si esa máquina está apagada no hay Hermes, y hay
                que decirlo en vez de dejar a alguien esperando. */}
            <div className="flex items-center gap-2 border-b border-cyan-300/10 px-3 py-1.5 text-[11px]">
              {canal === 'hermes' && hermesVivo && (
                <span className="flex items-center gap-1 text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {nombreEmpresa} conectado · con su memoria de Telegram
                </span>
              )}
              {canal === 'hermes' && hermesVivo === false && (
                <>
                  <span className="flex items-center gap-1 text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {nombreEmpresa} no está conectado
                  </span>
                  <button type="button" onClick={() => setCanal('local')}
                    className="ml-auto rounded border border-cyan-300/30 px-1.5 py-0.5 text-cyan-200/80 hover:text-cyan-100">
                    Hablar con {nombreSistema}
                  </button>
                </>
              )}
              {canal === 'local' && (
                <>
                  <span className="text-cyan-200/60">
                    {nombreSistema} · asistente de MotoFlow, no es {nombreEmpresa}
                  </span>
                  <button type="button" onClick={() => setCanal('hermes')}
                    className="ml-auto rounded border border-emerald-300/30 px-1.5 py-0.5 text-emerald-200/80 hover:text-emerald-100">
                    Volver a {nombreEmpresa}
                  </button>
                </>
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
                  {/* QUIÉN contestó, en cada burbuja. Los dos hablan con la
                      misma persona y el mismo nombre arriba: sin esto, mirando
                      una conversación vieja no hay forma de saber a cuál de los
                      dos se le preguntó. */}
                  {m.role === 'assistant' && m.de && (
                    <p className={`mt-0.5 text-[10px] ${m.de === 'hermes' ? 'text-emerald-300/70' : 'text-amber-300/60'}`}>
                      {m.de === 'hermes' ? nombreEmpresa : `${nombreSistema} — no es ${nombreEmpresa}`}
                    </p>
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
                  <p className="text-xs text-cyan-200/50">pensando…</p>
                  <button type="button" onClick={interrumpir}
                    className="rounded border border-red-400/40 px-1.5 py-0.5 text-[10px] font-bold text-red-300 hover:bg-red-500/15">
                    Detener
                  </button>
                </div>
              )}
              <div ref={finRef} />
            </div>

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

        <button
          type="button"
          onClick={toggleVoice}
          disabled={loading}
          className={`pointer-events-auto relative flex aspect-square items-center justify-center overflow-hidden rounded-full bg-black text-white outline-none transition-all duration-300 ${
            activeCore
              ? 'h-32 w-32 border border-emerald-300/40 shadow-[0_0_42px_rgba(16,185,129,0.45)]'
              : 'h-14 w-14 border border-red-400/35 shadow-[0_0_24px_rgba(239,68,68,0.32)] hover:scale-105'
          }`}
          title={activeCore ? 'Apagar voz' : 'Encender voz'}
        >
          <span className={`absolute rounded-full border ${activeCore ? 'h-[88%] w-[88%] border-emerald-200/25' : 'h-[84%] w-[84%] border-red-300/20'}`} style={{ animation: 'jarvis-spin 15s linear infinite' }} />
          <span className={`absolute rounded-full border ${activeCore ? 'h-[70%] w-[70%] border-emerald-400/25' : 'h-[62%] w-[62%] border-red-400/20'}`} style={{ animation: 'jarvis-spin 9s linear infinite reverse' }} />
          <span className={`absolute rounded-full ${activeCore ? 'h-[42%] w-[42%] bg-emerald-500/90 shadow-[0_0_44px_rgba(16,185,129,0.95)]' : 'h-[42%] w-[42%] bg-red-700/85 shadow-[0_0_28px_rgba(239,68,68,0.72)]'}`} style={{ animation: activeCore ? 'jarvis-pulse 1.1s ease-in-out infinite' : 'jarvis-pulse 2.6s ease-in-out infinite' }} />
          <span className={`absolute rounded-full ${activeCore ? 'h-[29%] w-[29%] bg-emerald-300/70' : 'h-[25%] w-[25%] bg-red-500/55'}`} />

          {activeCore ? (
            <span className="relative z-10 px-1 text-center text-sm font-black uppercase tracking-[0.2em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.45)]">
              {nombreAgente}
            </span>
          ) : (
            <Mic className="relative z-10 h-5 w-5 text-red-50" />
          )}

          {listening && <MicOff className="absolute bottom-5 right-5 z-10 h-4 w-4 text-emerald-50" />}
        </button>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setChatAbierto((v) => !v)}
            title={`Escribirle a ${nombreAgente}`}
            className="rounded-full border border-cyan-300/25 bg-slate-950/80 p-1.5 text-cyan-200/70 hover:text-cyan-100"
          >
            <MessageSquare className="h-3.5 w-3.5" />
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
