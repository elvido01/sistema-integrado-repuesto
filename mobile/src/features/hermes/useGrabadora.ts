// =====================================================================
// Grabar una nota de voz
// ---------------------------------------------------------------------
// >>> EL MÓVIL NO TRANSCRIBE <<<
// Graba y sube el archivo. Quien transcribe es el STT de Hermes, que es
// el único que oye el audio de verdad. Un dictado hecho en el teléfono
// mandaría texto y Hermes creería que alguien lo escribió.
//
// >>> SOLTAR EL MICRÓFONO <<<
// Un micrófono que sigue abierto cuando ya nadie graba es lo que hace que
// la gente desinstale una aplicación. Todo lo que se abre aquí se cierra
// en `limpiar()`, y `limpiar()` se llama al terminar, al cancelar, al
// fallar y al desmontar la pantalla.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import {
  AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { LIMITES, type MedioLocal } from './contrato';

export const useGrabadora = () => {
  // El preset de alta calidad da m4a/aac en iOS y Android, que es lo que
  // los dos traen de fábrica. Opus sería más pequeño pero obliga a
  // compilar un módulo nativo: no compensa para dos minutos de audio.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [grabando, setGrabando] = useState(false);
  const [duracionMs, setDuracionMs] = useState(0);

  const inicioRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canceladoRef = useRef(false);

  const limpiar = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (topeRef.current) { clearTimeout(topeRef.current); topeRef.current = null; }
    setGrabando(false);
  }, []);

  useEffect(() => () => {
    limpiar();
    // Si la pantalla muere mientras graba, se corta: el micrófono no
    // sobrevive a la vista que lo abrió.
    try { recorder.stop(); } catch { /* ya estaba parado */ }
  }, [limpiar, recorder]);

  const empezar = useCallback(async () => {
    const permiso = await AudioModule.requestRecordingPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert(
        'Micrófono bloqueado',
        'Permite el acceso al micrófono desde los ajustes del teléfono para mandar notas de voz.',
        [{ text: 'Cancelar', style: 'cancel' },
         { text: 'Abrir ajustes', onPress: () => Linking.openSettings() }],
      );
      return false;
    }

    try {
      // playsInSilentMode para que en iPhone con el interruptor en
      // silencio se pueda seguir escuchando la respuesta después.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      canceladoRef.current = false;
      await recorder.prepareToRecordAsync();
      recorder.record();
      inicioRef.current = Date.now();
      setDuracionMs(0);
      setGrabando(true);

      tickRef.current = setInterval(() => {
        setDuracionMs(Date.now() - inicioRef.current);
      }, 200);

      // El tope duro. Aunque nadie pare, a los dos minutos se corta: es el
      // límite que valida la base, y llegar hasta allá para que lo rechace
      // es tirar la grabación entera.
      topeRef.current = setTimeout(() => { detenerRef.current?.(); }, LIMITES.voz.maxDuracionMs);
      return true;
    } catch (e: any) {
      limpiar();
      Alert.alert('No se pudo grabar', e?.message || 'El micrófono no respondió.');
      return false;
    }
  }, [recorder, limpiar]);

  const detener = useCallback(async (): Promise<MedioLocal | null> => {
    if (!grabando) return null;
    const dur = Date.now() - inicioRef.current;
    limpiar();
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!uri || canceladoRef.current) return null;

      if (dur < 500) {
        Alert.alert('Muy corta', 'Mantén pulsado y habla.');
        return null;
      }

      const info = await FileSystem.getInfoAsync(uri);
      const size = info.exists ? (info.size || 0) : 0;
      if (!size) {
        Alert.alert('Grabación vacía', 'No se grabó nada. ¿El micrófono está silenciado?');
        return null;
      }

      return {
        uri,
        kind: 'voice',
        // El preset da m4a en las dos plataformas. Se declara el MIME real
        // porque la base compara lo declarado con lo subido.
        mimeType: Platform.OS === 'ios' ? 'audio/mp4' : 'audio/mp4',
        sizeBytes: size,
        durationMs: dur,
        nombre: 'nota-de-voz.m4a',
      };
    } catch (e: any) {
      Alert.alert('No se pudo terminar', e?.message || 'La grabación se perdió.');
      return null;
    }
  }, [grabando, recorder, limpiar]);

  const detenerRef = useRef<typeof detener | null>(null);
  useEffect(() => { detenerRef.current = detener; }, [detener]);

  const cancelar = useCallback(() => {
    if (!grabando) return;
    canceladoRef.current = true;
    limpiar();
    try { recorder.stop(); } catch { /* ya parado */ }
    setDuracionMs(0);
  }, [grabando, recorder, limpiar]);

  return { grabando, duracionMs, empezar, detener, cancelar };
};

export default useGrabadora;
