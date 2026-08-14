// =====================================================================
// Lo que el móvil le pide al backend
// ---------------------------------------------------------------------
// >>> EL TELÉFONO NO HABLA CON POSTGRESQL <<<
// Habla con PostgREST usando la sesión del usuario y la anon key, que es
// pública por diseño. Toda escritura pasa por RPC SECURITY DEFINER y toda
// lectura por RLS. En la aplicación no hay ni una credencial de servicio,
// ni la clave de la base, ni nada de Hermes.
//
// Lo que sube al bucket lo sube con SU sesión: las políticas de storage lo
// encierran en la carpeta de su empresa.
// =====================================================================

import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../supabase/client';
import { sha256Hex, bytesDesdeBase64 } from '../../lib/hash';
import {
  extensionDe, rutaMedio, type ClaseMedio, type MedioLocal,
} from './contrato';

const BUCKET_AUDIO = 'hermes-voz';
const BUCKET_MEDIOS = 'hermes-medios';

// ---------------------------------------------------------------------
// Los errores dicen QUÉ etapa falló
// ---------------------------------------------------------------------
// Antes todo terminaba en "No se pudo enviar", que es lo mismo que dice
// una caída de red. Con ese texto, un fallo de código y un túnel sin
// señal se ven idénticos, y el de código se queda meses sin encontrar:
// pasó exactamente eso con las fotos.
export type Etapa = 'preparar' | 'subir' | 'registrar' | 'mensaje';

const TEXTO: Record<Etapa, string> = {
  preparar: 'No se pudo preparar el archivo',
  subir: 'No se pudo subir el archivo',
  registrar: 'No se pudo registrar el archivo',
  mensaje: 'No se pudo crear el mensaje',
};

export class ErrorEtapa extends Error {
  etapa: Etapa;

  detalle: string;

  constructor(etapa: Etapa, detalle: string) {
    // El texto de arriba es para la persona; el detalle es para quien
    // vaya a arreglarlo. Los dos viajan, separados por un guion, porque
    // un error sin detalle obliga a reproducir el fallo para saber algo.
    super(detalle ? `${TEXTO[etapa]} — ${detalle}` : TEXTO[etapa]);
    this.name = 'ErrorEtapa';
    this.etapa = etapa;
    this.detalle = detalle;
  }
}

const razon = (e: unknown) => (e instanceof Error ? e.message : String(e));

// El sha256 se calcula en el teléfono para tres cosas: idempotencia
// (subir dos veces el mismo archivo no crea dos registros), integridad
// (Hermes compara el hash tras descargar) y la ruta en el bucket.
//
// >>> NO USAR crypto.subtle AQUÍ <<<
// Es del navegador. React Native no lo trae y esta app no lleva polyfill.
// La primera versión lo usaba y rompió el envío de fotos y de notas de
// voz desde el móvil, silenciosamente, durante todo su tiempo de vida.
// El reemplazo está en src/lib/hash.ts, con pruebas.
const leerBytes = async (uri: string): Promise<Uint8Array> => {
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    return bytesDesdeBase64(b64);
  } catch (e) {
    throw new ErrorEtapa('preparar', razon(e));
  }
};

export const sha256DeArchivo = async (uri: string): Promise<string> =>
  sha256Hex(await leerBytes(uri));

const bucketDe = (kind: ClaseMedio) =>
  (kind === 'voice' || kind === 'audio') ? BUCKET_AUDIO : BUCKET_MEDIOS;

// Sube el archivo y lo registra. Devuelve el media_id.
//
// El orden importa: primero el archivo, después el registro. Al revés
// quedarían filas apuntando a archivos que quizá nunca lleguen.
export const subirMedio = async (
  tenantId: string, medio: MedioLocal,
): Promise<{ mediaId: string; sha256: string; duplicado: boolean }> => {
  // Se lee UNA vez. La versión anterior leía el archivo entero para
  // hashearlo y otra vez para subirlo: en una foto de 3 MB eso es el
  // doble de trabajo y de memoria en un teléfono modesto.
  const bytes = await leerBytes(medio.uri);
  if (bytes.length === 0) {
    throw new ErrorEtapa('preparar', 'el archivo llegó vacío');
  }

  const sha = medio.sha256 || sha256Hex(bytes);
  const ext = extensionDe(medio.mimeType);
  const ruta = rutaMedio(tenantId, sha, ext);
  const bucket = bucketDe(medio.kind);

  // Bytes y no FormData: en React Native, FormData con file:// da
  // problemas de tamaño y el SDK acaba subiendo 0 bytes en algunos
  // Android. Mandar los bytes es más largo pero llega entero.
  const { error: eSubir } = await supabase.storage
    .from(bucket)
    .upload(ruta, bytes, { contentType: medio.mimeType, upsert: true });
  if (eSubir) throw new ErrorEtapa('subir', eSubir.message);

  if (medio.kind === 'voice' || medio.kind === 'audio') {
    const { data, error } = await supabase.rpc('hermes_voz_registrar', {
      p_storage_path: ruta,
      p_mime_type: medio.mimeType,
      p_size_bytes: bytes.length,
      p_duration_ms: Math.round(medio.durationMs || 0),
      p_sha256: sha,
      p_codec: null,
      p_metricas: {},
    });
    if (error) throw new ErrorEtapa('registrar', error.message);
    return { mediaId: data.media_id, sha256: sha, duplicado: !!data.duplicado };
  }

  const { data, error } = await supabase.rpc('hermes_medio_registrar', {
    p_storage_path: ruta,
    p_media_kind: medio.kind,
    p_mime_type: medio.mimeType,
    p_size_bytes: bytes.length,
    p_sha256: sha,
    p_original_name: medio.nombre || null,
    p_width: medio.width || null,
    p_height: medio.height || null,
    p_metricas: {},
  });
  if (error) throw new ErrorEtapa('registrar', error.message);
  return { mediaId: data.media_id, sha256: sha, duplicado: !!data.duplicado };
};

export const enviarMensaje = async (opts: {
  clientMessageId: string;
  texto?: string;
  mediaIds: string[];
  deviceId: string;
  appVersion: string;
  plataforma: string;
  pantalla?: Record<string, unknown> | null;
}) => {
  // Idempotente por client_message_id: si la respuesta se perdió en el
  // camino pero el mensaje SÍ se creó, el reintento devuelve el mismo id
  // con `duplicado: true` en vez de crear otro. Por eso un fallo de red
  // aquí se resuelve solo reintentando, sin duplicar nada.
  const { data, error } = await supabase.rpc('hermes_movil_escribir', {
    p_client_message_id: opts.clientMessageId,
    p_texto: opts.texto || null,
    p_media_ids: opts.mediaIds.length ? opts.mediaIds : null,
    p_pantalla: opts.pantalla || null,
    p_device_id: opts.deviceId,
    p_app_version: opts.appVersion,
    p_client_platform: opts.plataforma,
  });
  if (error) throw new ErrorEtapa('mensaje', error.message);
  return data as {
    id: number; duplicado: boolean; message_type: string;
    conversation_key: string; context_epoch: number;
  };
};

export const traerHistorial = async (desdeId?: number | null, limite = 40) => {
  const { data, error } = await supabase.rpc('hermes_movil_historial', {
    p_desde_id: desdeId ?? null,
    p_limite: limite,
  });
  if (error) throw new Error(error.message);
  return data;
};

// La URL firmada se pide al abrir el archivo, NO al pintar la lista. Una
// URL firmada guardada en el estado de una lista es una credencial dando
// vueltas por toda la pantalla, y encima caduca sola.
export const urlFirmada = async (
  bucket: string, storagePath: string, segundos = 300,
): Promise<string> => {
  const { data, error } = await supabase.storage
    .from(bucket).createSignedUrl(storagePath, segundos);
  if (error || !data?.signedUrl) throw new Error('No se pudo abrir el archivo.');
  return data.signedUrl;
};

// "Nueva conversación" NO crea otra conversation_key: avanza la época.
// El historial anterior se conserva y deja de mezclarse.
export const nuevaConversacion = async () => {
  const { data, error } = await supabase.rpc('hermes_nuevo_contexto', {
    p_conversation_key: null,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const registrarDispositivo = async (opts: {
  deviceId: string; pushToken?: string | null; plataforma: string;
  appVersion: string; modelo?: string;
}) => {
  const { error } = await supabase.rpc('hermes_dispositivo_registrar', {
    p_device_id: opts.deviceId,
    p_push_token: opts.pushToken || null,
    p_plataforma: opts.plataforma,
    p_app_version: opts.appVersion,
    p_modelo: opts.modelo || null,
  });
  if (error) throw new Error(error.message);
};

export const revocarDispositivo = async (deviceId: string) => {
  await supabase.rpc('hermes_dispositivo_revocar', { p_device_id: deviceId });
};

export const decidirAprobacion = async (
  aprobacionId: string, decision: 'approved' | 'rejected' | 'changes_requested',
  comentario?: string,
) => {
  const { error } = await supabase.rpc('equipo_decidir', {
    p_aprobacion_id: aprobacionId,
    p_decision: decision,
    p_comentario: comentario || null,
  });
  if (error) throw new Error(error.message);
};
