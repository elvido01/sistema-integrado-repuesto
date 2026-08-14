// =====================================================================
// El motor de la conversación
// ---------------------------------------------------------------------
// Junta tres cosas que en un móvil no se pueden separar:
//   · el historial del servidor (la fuente de verdad)
//   · la cola local (lo que todavía no salió)
//   · el tiempo real (lo que llega solo)
//
// >>> POR QUÉ LA COLA VA PRIMERO EN PANTALLA <<<
// Un mensaje escrito aparece al instante como "sin enviar" y se sustituye
// por el del servidor cuando este confirma. Si esperásemos la
// confirmación, en una red de tienda el chat parecería congelado.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from '../../supabase/client';
import { useAuthStore } from '../../store/useAuthStore';
import * as api from './api';
import {
  CLAVE_COLA, conciliar, encolar, esperaMs, marcar, marcarMedio,
  puedeEnviarse, quitar, siguiente,
} from './cola';
import type { MedioLocal, MensajeSaliente } from './contrato';
import { validarMensaje } from './contrato';

export interface MedioServidor {
  media_id: string; kind: string; mime_type: string; bucket: string;
  storage_path: string; duration_ms?: number; width?: number; height?: number;
  size_bytes?: number; nombre?: string; transcript?: string;
  transcription_status?: string; tts_status?: string;
}

export interface MensajeChat {
  id: string;                 // 's-123' del servidor, o el clientMessageId
  servidorId?: number;
  rol: 'usuario' | 'hermes';
  texto: string;
  tipo: string;
  medios: MedioServidor[];
  creadoEn?: string;
  estado?: string;
  pendiente?: boolean;
  error?: string;
  intentos?: number;
  clientMessageId?: string;
}

const APP_VERSION = String(Constants.expoConfig?.version || '0.0.0');
const CLAVE_DEVICE = 'hermes.device_id';

const idDispositivo = async (): Promise<string> => {
  let id = await AsyncStorage.getItem(CLAVE_DEVICE);
  if (!id) {
    id = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(CLAVE_DEVICE, id);
  }
  return id;
};

export const useHermesChat = () => {
  const tenantId = useAuthStore((s) => s.tenantId);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [cola, setCola] = useState<MensajeSaliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [conectado, setConectado] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [epoca, setEpoca] = useState(1);

  const ultimoIdRef = useRef<number>(0);
  const deviceIdRef = useRef<string>('');
  const colaRef = useRef<MensajeSaliente[]>([]);
  const enviandoRef = useRef(false);
  const montadoRef = useRef(true);

  useEffect(() => { colaRef.current = cola; }, [cola]);

  const guardarCola = useCallback(async (c: MensajeSaliente[]) => {
    try { await AsyncStorage.setItem(CLAVE_COLA, JSON.stringify(c)); } catch { /* sin sitio */ }
  }, []);

  const ponerCola = useCallback((f: (c: MensajeSaliente[]) => MensajeSaliente[]) => {
    setCola((prev) => { const n = f(prev); guardarCola(n); return n; });
  }, [guardarCola]);

  // ── Historial ──────────────────────────────────────────────────────
  const cargar = useCallback(async (incremental = false) => {
    try {
      const data = await api.traerHistorial(incremental ? ultimoIdRef.current : null, 40);
      if (!montadoRef.current) return;
      setEpoca(data.context_epoch || 1);

      const filas = (data.mensajes || []) as any[];
      const nuevos: MensajeChat[] = filas.map((f) => ({
        id: `s-${f.id}`,
        servidorId: f.id,
        rol: f.rol,
        texto: f.texto,
        tipo: f.message_type || 'text',
        medios: (f.medios || []) as MedioServidor[],
        creadoEn: f.creado_en,
        estado: f.estado,
        clientMessageId: f.client_message_id || undefined,
      }));

      for (const n of nuevos) {
        if (n.servidorId && n.servidorId > ultimoIdRef.current) ultimoIdRef.current = n.servidorId;
      }

      setMensajes((prev) => {
        const porId = new Map(prev.map((m) => [m.id, m]));
        for (const n of nuevos) porId.set(n.id, n);
        return Array.from(porId.values())
          .sort((a, b) => (a.servidorId || 0) - (b.servidorId || 0));
      });

      // Lo que el servidor ya tiene sale de la cola: es exactamente el
      // caso de "se insertó y la red se cayó antes de contestarme".
      ponerCola((c) => conciliar(c, filas.map((f) => f.client_message_id)));

      setConectado(!!data.hermes_conectado);
      const enCurso = filas.some((f) => f.rol === 'usuario'
        && (f.estado === 'pendiente' || f.estado === 'procesando'));
      setProcesando(enCurso);
    } catch (e: any) {
      if (montadoRef.current) setError(e.message || 'No se pudo cargar la conversación.');
    } finally {
      if (montadoRef.current) setCargando(false);
    }
  }, [ponerCola]);

  // ── Arranque ───────────────────────────────────────────────────────
  useEffect(() => {
    montadoRef.current = true;
    (async () => {
      deviceIdRef.current = await idDispositivo();
      try {
        const guardada = await AsyncStorage.getItem(CLAVE_COLA);
        if (guardada) {
          const c = JSON.parse(guardada) as MensajeSaliente[];
          setCola(c); colaRef.current = c;
        }
      } catch { /* cola corrupta: se empieza limpia */ }
      await cargar(false);
    })();
    return () => { montadoRef.current = false; };
  }, [cargar]);

  // ── Tiempo real ────────────────────────────────────────────────────
  // Una sola suscripción, atada al tenant. Al cambiar de empresa o cerrar
  // sesión se cierra: dejarla abierta traería mensajes de otra empresa.
  useEffect(() => {
    if (!tenantId) return undefined;
    const canal = supabase
      .channel(`hermes-movil-${tenantId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hermes_chat' },
        () => { cargar(true); })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hermes_chat' },
        () => { cargar(true); })
      .subscribe();

    // Volver del segundo plano puede haber perdido eventos: al volver se
    // recupera por id, que es lo que hace que no falte nada.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') cargar(true);
    });

    // Respaldo por sondeo. El tiempo real de Supabase sobre una red móvil
    // se cae sin avisar; un sondeo lento cuesta poco y evita el chat
    // congelado que no se explica.
    const t = setInterval(() => cargar(true), 12000);

    return () => {
      supabase.removeChannel(canal);
      sub.remove();
      clearInterval(t);
    };
  }, [tenantId, cargar]);

  // ── El bombeo de la cola ───────────────────────────────────────────
  const bombear = useCallback(async () => {
    if (enviandoRef.current || !tenantId) return;
    const m = siguiente(colaRef.current);
    if (!m) return;

    enviandoRef.current = true;
    ponerCola((c) => marcar(c, m.clientMessageId, {
      estado: 'subiendo', intentos: m.intentos + 1, error: undefined,
    }));

    try {
      // ── 1. LOS ARCHIVOS, UNO A UNO ────────────────────────────────
      // El media_id se guarda en la cola para que un reintento NO vuelva
      // a subir lo que ya subió. Y cada archivo lleva su propio estado:
      // si de tres fotos falla la segunda, las otras dos no se repiten.
      const ids: string[] = [];
      for (const medio of m.medios) {
        if (medio.mediaId && medio.estado === 'adjuntado') {
          ids.push(medio.mediaId);
          continue;
        }

        ponerCola((c) => marcarMedio(c, m.clientMessageId, medio.uri,
          { estado: 'subiendo', error: undefined }));

        try {
          const r = await api.subirMedio(tenantId, medio);
          medio.mediaId = r.mediaId;
          medio.sha256 = r.sha256;
          medio.estado = 'adjuntado';
          medio.error = undefined;
          ids.push(r.mediaId);
          ponerCola((c) => marcarMedio(c, m.clientMessageId, medio.uri, {
            mediaId: r.mediaId, sha256: r.sha256, estado: 'adjuntado', error: undefined,
          }));
        } catch (e: any) {
          // El fallo se anota EN el archivo y se vuelve a lanzar. Lo
          // primero da un mensaje útil ("no se pudo subir la segunda
          // foto"); lo segundo impide que el mensaje salga sin ella.
          medio.estado = 'error';
          medio.error = e?.message || 'No se pudo subir el archivo';
          ponerCola((c) => marcarMedio(c, m.clientMessageId, medio.uri,
            { estado: 'error', error: medio.error }));
          throw e;
        }
      }

      // ── 2. LA REGLA, COMPROBADA ANTES DE ENVIAR ───────────────────
      // El bucle de arriba ya lanza si algo falla, así que esto no
      // debería saltar nunca. Está porque un mensaje de foto sin foto es
      // invisible: llega, se contesta, y nadie ve que faltaba algo. Si
      // algún día alguien toca el bucle, que falle aquí y no en silencio.
      const listo = { ...m, medios: m.medios };
      if (!puedeEnviarse(listo)) {
        throw new Error('No se pudo adjuntar todos los archivos');
      }

      // ── 3. EL MENSAJE QUE LOS AGRUPA ──────────────────────────────
      ponerCola((c) => marcar(c, m.clientMessageId, { estado: 'enviando' }));

      const res = await api.enviarMensaje({
        clientMessageId: m.clientMessageId,
        texto: m.texto,
        mediaIds: ids,
        deviceId: deviceIdRef.current,
        appVersion: APP_VERSION,
        plataforma: Platform.OS,
      });

      ponerCola((c) => quitar(c, m.clientMessageId));
      if (res.id > ultimoIdRef.current) ultimoIdRef.current = res.id - 1;
      await cargar(true);
    } catch (e: any) {
      // Se guarda el mensaje REAL. La versión anterior lo perdía y la
      // pantalla pintaba "No se pudo enviar" para todo: un fallo de
      // código y un túnel sin señal se veían igual, y el de código
      // sobrevivió meses por eso.
      ponerCola((c) => marcar(c, m.clientMessageId, {
        estado: 'error', error: e?.message || 'No se pudo enviar',
      }));
    } finally {
      enviandoRef.current = false;
    }
  }, [tenantId, ponerCola, cargar]);

  // Vuelve a intentarlo con espera creciente. Con la red intermitente de
  // un local, tres intentos seguidos en un segundo fallan tres veces.
  useEffect(() => {
    const pend = cola.find((m) => m.estado === 'pendiente' || m.estado === 'error');
    if (!pend) return undefined;
    const t = setTimeout(bombear, pend.intentos === 0 ? 0 : esperaMs(pend.intentos));
    return () => clearTimeout(t);
  }, [cola, bombear]);

  // ── Acciones ───────────────────────────────────────────────────────
  const enviar = useCallback((texto: string, medios: MedioLocal[] = []) => {
    const problema = validarMensaje(texto, medios);
    if (problema) { setError(problema); return false; }
    setError('');
    ponerCola((c) => encolar(c, texto, medios).cola);
    return true;
  }, [ponerCola]);

  const reintentarMensaje = useCallback((clientMessageId: string) => {
    ponerCola((c) => marcar(c, clientMessageId,
      { estado: 'pendiente', intentos: 0, error: undefined }));
  }, [ponerCola]);

  const descartarMensaje = useCallback((clientMessageId: string) => {
    ponerCola((c) => quitar(c, clientMessageId));
  }, [ponerCola]);

  const empezarDeCero = useCallback(async () => {
    try {
      await api.nuevaConversacion();
      setMensajes([]);
      ultimoIdRef.current = 0;
      await cargar(false);
    } catch (e: any) {
      setError(e.message || 'No se pudo empezar una conversación nueva.');
    }
  }, [cargar]);

  // Lo que ve la pantalla: el historial y, al final, lo que no ha salido.
  const visibles: MensajeChat[] = [
    ...mensajes,
    ...cola.map((m) => ({
      id: m.clientMessageId,
      clientMessageId: m.clientMessageId,
      rol: 'usuario' as const,
      texto: m.texto || '',
      tipo: 'text',
      medios: [],
      pendiente: true,
      estado: m.estado,
      error: m.error,
      intentos: m.intentos,
    })),
  ];

  return {
    mensajes: visibles, cargando, error, setError, conectado, procesando, epoca,
    enviar, reintentarMensaje, descartarMensaje, empezarDeCero, recargar: cargar,
    hayPendientes: cola.length > 0,
    deviceId: deviceIdRef.current,
  };
};

export default useHermesChat;
