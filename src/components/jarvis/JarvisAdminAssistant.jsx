import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Settings2, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { hablar, callar, listarVoces, vozElegida, elegirVoz, alListarVoces, ajustes, guardarAjustes } from '@/lib/vozJarvis';
import { leerContexto, leerModulos } from '@/lib/pantallaContexto';
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
  const [sessionId, setSessionId] = useState(null);
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

  const nombreAgente = agente?.nombre || 'Asistente';

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
  useEffect(() => {
    if (!agente) return;
    let vivo = true;
    supabase.from('hermes_chat').select('id, rol, texto')
      .order('id', { ascending: false }).limit(30)
      .then(({ data, error: e }) => {
        if (!vivo) return;
        // Se estuvo mirando un panel vacío sin saber que la consulta fallaba:
        // el error se descartaba y "sin permiso" se veía igual que "sin
        // mensajes". No son lo mismo y hay que poder distinguirlos.
        if (e) { setError(`No puedo leer la conversación: ${e.message}`); return; }
        if (!data?.length) return;
        const filas = [...data].reverse();
        for (const f of filas) idsVistosRef.current.add(idBurbuja(f));
        ultimoIdRef.current = filas[filas.length - 1].id;
        setMensajes(filas.map((f) => ({
          id: idBurbuja(f),
          role: f.rol === 'hermes' ? 'assistant' : 'user',
          content: f.texto,
        })));
      });
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
      .select('id, rol, texto')
      .gt('id', ultimoIdRef.current)
      .order('id').limit(30)
      .then(({ data, error: e }) => {
        if (!vivo) return;
        if (e) { setError(`No puedo leer la conversación: ${e.message}`); return; }
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
    setMensajes((m) => [...m, { id: idProvisional, role: 'user', content: texto }]);
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
    if (canal === 'hermes' && hermesVivo) return enviarAHermes(texto, { conVoz });
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
  const idBurbuja = (f) => `${f.rol === 'hermes' ? 'h' : 'u'}-${f.id}`;

  const incorporar = (filas) => {
    if (!filas?.length) return;
    const nuevas = [];
    for (const f of filas) {
      const id = idBurbuja(f);
      if (idsVistosRef.current.has(id)) continue;
      idsVistosRef.current.add(id);
      if (f.id > ultimoIdRef.current) ultimoIdRef.current = f.id;
      nuevas.push({ id, role: f.rol === 'hermes' ? 'assistant' : 'user', content: f.texto });
    }
    if (!nuevas.length) return;
    setMensajes((m) => [...m, ...nuevas]);

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
    hablar(agente?.saludo || 'Sistemas en línea. A sus órdenes.', {
      alEmpezar: () => setSpeaking(true),
      alTerminar: () => setSpeaking(false),
    });
  };

  // Lo dice en voz alta y, al terminar de hablar, se queda escuchando.
  // El micrófono se abre DESPUÉS de callarse, nunca antes: si se abriera
  // mientras habla, se oiría a sí mismo y tomaría su propia frase por
  // respuesta.
  const pedirAutorizacionHablando = (p) => {
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
        setMensajes((m) => [...m, { id: `r-${Date.now()}`, role: 'assistant', content: 'Descartado. No se hizo nada.' }]);
      } else {
        const { data, error: e } = await supabase.rpc('agente_confirmar_accion', {
          p_accion_id: propuesta.accion_id,
          p_password: clave || null,
        });
        if (e) throw e;
        if (data?.ok === false) throw new Error(data.motivo || 'No se pudo autorizar');
        const r = data?.resultado || {};
        setMensajes((m) => [...m, {
          id: `r-${Date.now()}`, role: 'assistant',
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
    setLastMessage(message);
    setMensajes((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: message }]);
    stopSpeaking();

    try {
      const { data, error: fnError } = await supabase.functions.invoke('motoflow-ai-chat', {
        // Se manda dónde está parado el usuario: así puede preguntar
        // "¿qué es esto?" sin explicar de qué habla.
        body: {
          message,
          session_id: sessionId,
          pantalla: { ...leerContexto(), modulos: leerModulos() },
        },
      });

      if (fnError) throw fnError;
      if (!data?.ok) throw new Error(data?.mensaje || data?.error || `${nombreAgente} no respondió.`);

      // Si lo interrumpieron mientras esto viajaba, se descarta callado.
      if (turno !== turnoRef.current) return;

      if (data.session_id) setSessionId(data.session_id);
      setAgenteQueContesto(data.agente_usado ?? null);

      // Navegar es lo único que el servidor no puede hacer solo. Si pidió
      // abrir un módulo, se abre aquí. El <Protected> de cada pantalla sigue
      // decidiendo: puede pedir abrirla, no saltarse el permiso.
      for (const h of data.herramientas || []) {
        if (h?.herramienta === 'abrir_modulo' && h?.argumentos?.modulo) {
          try { openPanel(h.argumentos.modulo); } catch { /* módulo inexistente */ }
        }
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
        pedirAutorizacionHablando(p);
      }
      setLastMessage(data.answer || '');
      setMensajes((m) => [...m, {
        id: `tmp-r-${Date.now()}`, role: 'assistant',
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

  const startListening = () => {
    window.clearTimeout(clearBubbleTimerRef.current);
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
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      // La espera termina con la escucha: el próximo micrófono ya es normal.
      esperandoAutorizacionRef.current = false;
    };
    recognition.onerror = (event) => {
      setListening(false);
      // Cuando el micrófono se abrió solo para esperar la autorización, el
      // silencio es una respuesta válida: la persona está leyendo la tarjeta.
      // Gritarle "no pude escuchar" encima de lo que está leyendo estorba.
      if (esperandoAutorizacionRef.current && event?.error === 'no-speech') return;
      const reason = event?.error ? ` (${event.error})` : '';
      setError(`No pude escuchar bien${reason}.`);
    };
    recognition.onresult = (event) => {
      if (miTurno !== micTurnoRef.current) return;   // reconocedor viejo
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();
      if (!transcript) return;

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

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    // Apagar el micrófono a propósito cierra la conversación hablada. Sin
    // esto, el círculo se volvería a encender solo en la siguiente respuesta
    // y no habría forma de terminar.
    modoVozRef.current = false;
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

      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        {/* Selector de voz. Existe porque las voces dependen de lo que tenga
            instalado ESTE Windows: no hay forma de saberlo desde el código,
            y la diferencia entre una neuronal y una vieja es abismal. */}
        {verVoces && (
          <div className="w-[290px] rounded-lg border border-cyan-300/25 bg-slate-950/95 p-3 text-xs text-cyan-50 shadow-xl">
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
          <div className="flex h-[26rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-cyan-300/25 bg-slate-950/95 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-cyan-300/15 px-3 py-2">
              <span className="text-sm font-black uppercase tracking-widest text-cyan-300">{nombreAgente}</span>
              <span className="truncate text-[11px] text-cyan-200/50">{agente?.puesto}</span>
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
                  Hermes conectado · con su memoria de Telegram
                </span>
              )}
              {canal === 'hermes' && hermesVivo === false && (
                <>
                  <span className="flex items-center gap-1 text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Hermes no está conectado
                  </span>
                  <button type="button" onClick={() => setCanal('local')}
                    className="ml-auto rounded border border-cyan-300/30 px-1.5 py-0.5 text-cyan-200/80 hover:text-cyan-100">
                    Usar asistente rápido
                  </button>
                </>
              )}
              {canal === 'local' && (
                <>
                  <span className="text-cyan-200/60">Asistente rápido (no es Hermes)</span>
                  <button type="button" onClick={() => setCanal('hermes')}
                    className="ml-auto rounded border border-emerald-300/30 px-1.5 py-0.5 text-emerald-200/80 hover:text-emerald-100">
                    Volver a Hermes
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
              {mensajes.length === 0 && (
                <p className="mt-6 text-center text-xs leading-relaxed text-cyan-200/40">
                  Pregúntale por una pieza, cómo va el día,<br />o qué ve en esta pantalla.
                </p>
              )}
              {mensajes.map((m) => (
                <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
                  <span className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-left text-xs ${
                    m.role === 'user'
                      ? 'bg-cyan-500/20 text-cyan-50'
                      : 'bg-slate-800/80 text-slate-100'
                  }`}>{m.content}</span>
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

        {!chatAbierto && (error || lastMessage) && (
          <div className={`max-w-[280px] rounded-md border px-3 py-2 text-xs shadow-xl ${
            error
              ? 'border-red-500/40 bg-red-950/90 text-red-50'
              : 'border-cyan-300/20 bg-slate-950/90 text-cyan-50'
          }`}>
            {error || lastMessage}
          </div>
        )}

        <button
          type="button"
          onClick={toggleVoice}
          disabled={loading}
          className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-full bg-black text-white outline-none transition-all duration-300 ${
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

        <div className="flex items-center gap-1.5">
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
