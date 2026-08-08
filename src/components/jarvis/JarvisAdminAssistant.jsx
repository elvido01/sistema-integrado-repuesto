import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Settings2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { hablar, callar, listarVoces, vozElegida, elegirVoz, alListarVoces, ajustes, guardarAjustes } from '@/lib/vozJarvis';
import { leerContexto } from '@/lib/pantallaContexto';

const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition || null;

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

  // Chrome carga las voces tarde: sin esperar el aviso, el primer mensaje
  // sale con la voz por defecto y solo del segundo en adelante suena bien.
  useEffect(() => alListarVoces(() => setVoces(listarVoces())), []);

  const allowed = useMemo(() => {
    return profile?.role === 'admin' || isSuperAdmin;
  }, [profile?.role, isSuperAdmin]);

  // Sin agente definido para esta empresa, no se muestra nada.
  if (!allowed || cargandoAgente || !agente) return null;

  const activeCore = listening || loading || speaking;

  const speak = (text) => {
    if (!text) return;
    window.clearTimeout(clearBubbleTimerRef.current);
    hablar(text, {
      alEmpezar: () => setSpeaking(true),
      alTerminar: () => { setSpeaking(false); setLastMessage(''); },
    });
    clearBubbleTimerRef.current = window.setTimeout(() => setLastMessage(''), Math.max(5000, text.length * 85));
  };

  const stopSpeaking = () => {
    callar();
    window.clearTimeout(clearBubbleTimerRef.current);
    setSpeaking(false);
    setLastMessage('');
  };

  const probar = () => {
    callar();
    hablar(agente?.saludo || 'Sistemas en línea. A sus órdenes.', {
      alEmpezar: () => setSpeaking(true),
      alTerminar: () => setSpeaking(false),
    });
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

  const askAiCeo = async (text) => {
    const message = String(text || '').trim();
    if (!message || loading) return;

    setLoading(true);
    setError('');
    setLastMessage(message);
    stopSpeaking();

    try {
      const { data, error: fnError } = await supabase.functions.invoke('motoflow-ai-chat', {
        // Se manda dónde está parado el usuario: así puede preguntar
        // "¿qué es esto?" sin explicar de qué habla.
        body: { message, session_id: sessionId, pantalla: leerContexto() },
      });

      if (fnError) throw fnError;
      if (!data?.ok) throw new Error(data?.mensaje || data?.error || `${nombreAgente} no respondió.`);

      if (data.session_id) setSessionId(data.session_id);
      setLastMessage(data.answer || '');
      speak(data.answer || '');
    } catch (err) {
      setError(await formatVoiceError(err));
    } finally {
      setLoading(false);
    }
  };

  const startListening = () => {
    window.clearTimeout(clearBubbleTimerRef.current);
    setError('');
    setLastMessage('');

    if (!SpeechRecognitionApi) {
      setError('Este navegador no soporta dictado por voz.');
      return;
    }

    const recognition = new SpeechRecognitionApi();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setListening(false);
      const reason = event?.error ? ` (${event.error})` : '';
      setError(`No pude escuchar bien${reason}.`);
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) askAiCeo(transcript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const toggleVoice = () => {
    if (listening) {
      stopListening();
      return;
    }

    if (speaking) {
      stopSpeaking();
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

        {(error || lastMessage) && (
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

        <button
          type="button"
          onClick={() => setVerVoces((v) => !v)}
          title="Elegir la voz"
          className="rounded-full border border-cyan-300/25 bg-slate-950/80 p-1.5 text-cyan-200/70 hover:text-cyan-100"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  );
}
