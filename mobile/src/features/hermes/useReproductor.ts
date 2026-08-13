// =====================================================================
// Escuchar una respuesta hablada
// ---------------------------------------------------------------------
// >>> UNO A LA VEZ <<<
// Un reproductor por burbuja haría que dos respuestas seguidas sonaran
// encima. Aquí hay UNO: empezar otro para el anterior.
//
// >>> LA URL SE FIRMA AL REPRODUCIR <<<
// No al pintar la lista. Una URL firmada guardada en el estado de una
// lista es una credencial dando vueltas por toda la pantalla — y encima
// caduca, así que a los cinco minutos la mitad de los botones no funcionan.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as api from './api';
import type { MedioServidor } from './useHermesChat';

export const useReproductor = () => {
  const [sonando, setSonando] = useState<string | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const montadoRef = useRef(true);

  const parar = useCallback(() => {
    if (playerRef.current) {
      try { playerRef.current.pause(); playerRef.current.remove(); } catch { /* ya muerto */ }
      playerRef.current = null;
    }
    if (montadoRef.current) setSonando(null);
  }, []);

  // Salir de la pantalla calla el audio. Que siga sonando una respuesta
  // mientras alguien factura en otra pantalla no es una función.
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; parar(); };
  }, [parar]);

  const alternar = useCallback(async (medio: MedioServidor) => {
    if (sonando === medio.media_id) { parar(); return; }
    parar();
    setCargando(medio.media_id);
    try {
      const url = await api.urlFirmada(medio.bucket, medio.storage_path, 300);
      if (!montadoRef.current) return;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const p = createAudioPlayer({ uri: url });
      playerRef.current = p;
      p.addListener('playbackStatusUpdate', (st) => {
        if (st.didJustFinish) parar();
      });
      p.play();
      setSonando(medio.media_id);
    } catch {
      // Sin ruido: el texto de la respuesta sigue ahí arriba, que es lo
      // que importa. El audio es otra forma de oír lo mismo.
      if (montadoRef.current) setSonando(null);
    } finally {
      if (montadoRef.current) setCargando(null);
    }
  }, [sonando, parar]);

  return { sonando, cargando, alternar, parar };
};

export default useReproductor;
