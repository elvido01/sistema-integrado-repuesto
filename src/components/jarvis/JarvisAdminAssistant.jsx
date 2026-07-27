import React, { useMemo, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition || null;

const getCastilianJarvisVoice = () => {
  if (!('speechSynthesis' in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  const byPriority = [
    (voice) => voice.lang?.toLowerCase() === 'es-es' && /pablo|jorge|diego|male|hombre/i.test(voice.name),
    (voice) => voice.lang?.toLowerCase() === 'es-es',
    (voice) => voice.lang?.toLowerCase().startsWith('es-') && /pablo|jorge|diego|male|hombre/i.test(voice.name),
    (voice) => voice.lang?.toLowerCase().startsWith('es-'),
  ];

  for (const matcher of byPriority) {
    const voice = voices.find(matcher);
    if (voice) return voice;
  }

  return null;
};

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

  const allowed = useMemo(() => {
    return profile?.role === 'admin' || isSuperAdmin;
  }, [profile?.role, isSuperAdmin]);

  if (!allowed) return null;

  const activeCore = listening || loading || speaking;

  const speak = (text) => {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    window.clearTimeout(clearBubbleTimerRef.current);
    const utterance = new SpeechSynthesisUtterance(text);
    const castilianVoice = getCastilianJarvisVoice();
    utterance.lang = castilianVoice?.lang || 'es-ES';
    utterance.voice = castilianVoice;
    utterance.rate = 0.94;
    utterance.pitch = 0.82;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => {
      setSpeaking(false);
      setLastMessage('');
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setLastMessage('');
    };
    window.speechSynthesis.speak(utterance);
    clearBubbleTimerRef.current = window.setTimeout(() => setLastMessage(''), Math.max(5000, text.length * 85));
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    window.clearTimeout(clearBubbleTimerRef.current);
    setSpeaking(false);
    setLastMessage('');
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
        body: { message, session_id: sessionId },
      });

      if (fnError) throw fnError;
      if (!data?.ok) throw new Error(data?.mensaje || data?.error || 'MotoFlow IA CEO no respondio.');

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
            <span className="relative z-10 text-sm font-black uppercase tracking-[0.24em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.45)]">
              JARVIS
            </span>
          ) : (
            <Mic className="relative z-10 h-5 w-5 text-red-50" />
          )}

          {listening && <MicOff className="absolute bottom-5 right-5 z-10 h-4 w-4 text-emerald-50" />}
        </button>
      </div>
    </>
  );
}
