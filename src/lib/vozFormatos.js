// =====================================================================
// Voz — lo que se puede decidir sin micrófono
// ---------------------------------------------------------------------
// Todo lo de aquí es función pura a propósito: jsdom no tiene
// MediaRecorder ni AudioContext, así que si estas decisiones vivieran
// dentro del hook no habría forma de probarlas sin un navegador de verdad.
//
// Lo que queda en el hook es lo que SOLO puede hacer un navegador: abrir
// el micrófono, medir el nivel y grabar.
// =====================================================================

// Orden de preferencia, y el motivo de cada puesto:
//
//   webm/opus  Chrome, Edge y Firefox. Opus a 16 kHz mono deja dos
//              minutos en ~1,5 MB y es lo que mejor traga un STT.
//   ogg/opus   Firefox viejo. Mismo códec, otra caja.
//   mp4        Safari, que no sabe de WebM. Pesa más, pero es eso o nada.
//   mpeg/wav   El último recurso. WAV sin comprimir se come el límite de
//              tamaño en menos de un minuto, así que va al final.
export const FORMATOS = [
  { mime: 'audio/webm;codecs=opus', tipo: 'audio/webm', codec: 'opus', ext: 'webm' },
  { mime: 'audio/webm',             tipo: 'audio/webm', codec: null,   ext: 'webm' },
  { mime: 'audio/ogg;codecs=opus',  tipo: 'audio/ogg',  codec: 'opus', ext: 'ogg'  },
  { mime: 'audio/mp4',              tipo: 'audio/mp4',  codec: 'aac',  ext: 'm4a'  },
  { mime: 'audio/mpeg',             tipo: 'audio/mpeg', codec: 'mp3',  ext: 'mp3'  },
  { mime: 'audio/wav',              tipo: 'audio/wav',  codec: 'pcm',  ext: 'wav'  },
];

export const LIMITES = {
  maxBytes: 8 * 1024 * 1024,
  maxDuracionMs: 120000,
  silencioMs: 3000,
  // Por debajo de esto se considera silencio. Sale de probar con el ruido
  // de una tienda: el ventilador y la calle quedan debajo, una voz normal
  // queda muy por encima.
  umbralSilencio: 0.045,
};

// Elige el mejor formato que el navegador diga soportar.
//
// Se le pasa el comprobador en vez de leer MediaRecorder directamente:
// así la prueba puede simular Safari sin tener Safari.
export const elegirFormato = (soporta) => {
  const test = typeof soporta === 'function'
    ? soporta
    : (m) => (typeof MediaRecorder !== 'undefined'
        && typeof MediaRecorder.isTypeSupported === 'function'
        && MediaRecorder.isTypeSupported(m));

  for (const f of FORMATOS) {
    try { if (test(f.mime)) return f; } catch { /* algunos navegadores tiran aquí */ }
  }
  // Ninguno declarado. No es necesariamente "no se puede": hay navegadores
  // que graban igual con el formato que ellos elijan. Se devuelve null y
  // quien llama decide si arriesga.
  return null;
};

// Los estados que ve la persona. El texto es lo que se enseña; no hay
// traducción en el componente, para que no haya dos redacciones distintas
// del mismo momento.
export const ESTADOS_VOZ = {
  inactivo:      { txt: '',                                    grabando: false },
  permiso:       { txt: 'Pidiendo permiso al micrófono…',      grabando: false },
  escuchando:    { txt: 'Escuchando',                          grabando: true  },
  grabando:      { txt: 'Grabando',                            grabando: true  },
  silencio:      { txt: 'Detectando silencio…',                grabando: true  },
  preparando:    { txt: 'Preparando el audio…',                grabando: false },
  subiendo:      { txt: 'Subiendo el audio…',                  grabando: false },
  subido:        { txt: 'Audio recibido',                      grabando: false },
  transcribiendo:{ txt: 'Hermes está transcribiendo…',         grabando: false },
  procesando:    { txt: 'Hermes está procesando…',             grabando: false },
  sintetizando:  { txt: 'Hermes prepara la respuesta de voz…', grabando: false },
  reproduciendo: { txt: 'Reproduciendo la respuesta',          grabando: false },
  esperando:     { txt: 'Esperando que hables',                grabando: false },
  aprobacion:    { txt: 'Esperando tu aprobación',             grabando: false },
  error_micro:   { txt: 'Error de micrófono',                  grabando: false },
  error_carga:   { txt: 'No se pudo subir el audio',           grabando: false },
  error_stt:     { txt: 'No se pudo transcribir',              grabando: false },
  error_tts:     { txt: 'La respuesta llegó sin voz',          grabando: false },
};

// El mensaje que se le enseña a la persona cuando el micrófono falla.
//
// Los nombres del navegador ("NotAllowedError") no le dicen nada a nadie,
// y lo que importa no es el nombre del error sino qué se puede hacer.
export const explicarErrorMicrofono = (err) => {
  const n = err?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    return 'El micrófono está bloqueado. Púlsalo en el candado de la barra de direcciones y vuelve a intentarlo.';
  }
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError') {
    return 'No encuentro ningún micrófono conectado a esta computadora.';
  }
  if (n === 'NotReadableError' || n === 'TrackStartError') {
    return 'El micrófono está ocupado por otro programa. Ciérralo y vuelve a intentarlo.';
  }
  if (n === 'OverconstrainedError') {
    return 'El micrófono no admite la calidad pedida. Prueba con otro dispositivo.';
  }
  return 'No se pudo abrir el micrófono.';
};

// Antes de subir nada. Los mismos límites que comprueba la base — aquí
// solo para no gastar una subida que va a ser rechazada.
export const validarGrabacion = ({ size, duracionMs }) => {
  if (!size) return 'La grabación salió vacía. ¿Habló el micrófono?';
  if (size > LIMITES.maxBytes) {
    return `El audio pesa ${(size / 1048576).toFixed(1)} MB y el máximo son ${(LIMITES.maxBytes / 1048576).toFixed(0)} MB.`;
  }
  if (duracionMs && duracionMs > LIMITES.maxDuracionMs) {
    return `La grabación dura ${Math.round(duracionMs / 1000)} s y el máximo son ${LIMITES.maxDuracionMs / 1000} s.`;
  }
  // Menos de medio segundo casi siempre es un clic sin querer.
  if (duracionMs && duracionMs < 500) return 'Muy corto. Mantén pulsado y habla.';
  return null;
};

// La ruta la arma el cliente pero la valida la base: la primera carpeta
// TIENE que ser el tenant, que es lo que miran las políticas del bucket.
export const rutaAudio = (tenantId, nombre, ext) =>
  `${tenantId}/${new Date().toISOString().slice(0, 7)}/${nombre}.${ext}`;

export const formatearDuracion = (ms) => {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
