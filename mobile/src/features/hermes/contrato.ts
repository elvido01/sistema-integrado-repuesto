// =====================================================================
// Canal móvil de Hermes — lo que se decide sin teléfono
// ---------------------------------------------------------------------
// Funciones puras a propósito. En un móvil no hay forma de probar la
// cámara, el micrófono ni la red sin un dispositivo, así que todo lo que
// PUEDE probarse vive aquí y no dentro de un componente.
//
// >>> LA REGLA QUE MANDA SOBRE TODO ESTO <<<
// El teléfono nunca es la autoridad. Valida para no gastar una subida que
// va a ser rechazada, pero quien decide es la base: hermes_medio_registrar
// vuelve a comprobar tamaño, tipo y dueño contra el archivo REAL.
// =====================================================================

export type TipoMensaje =
  | 'text' | 'image' | 'voice' | 'audio' | 'document' | 'mixed'
  | 'system_status' | 'approval';

export type EstadoEnvio =
  | 'pendiente'      // en la cola local, sin salir
  | 'subiendo'       // sus archivos van en camino
  | 'enviado'        // la base lo aceptó
  | 'procesando'     // Hermes lo tomó
  | 'completado'
  | 'error';

export type ClaseMedio = 'image' | 'voice' | 'audio' | 'document';

export interface MedioLocal {
  uri: string;
  kind: ClaseMedio;
  mimeType: string;
  sizeBytes: number;
  nombre?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  mediaId?: string;      // lo devuelve la base al registrarlo
  sha256?: string;
}

export interface MensajeSaliente {
  clientMessageId: string;
  texto?: string;
  medios: MedioLocal[];
  estado: EstadoEnvio;
  intentos: number;
  creadoEn: number;
  error?: string;
  servidorId?: number;
}

// ── LÍMITES ──────────────────────────────────────────────────────────
// Los mismos que hermes.voz_limites() y hermes.medios_limites(). Copiados
// a propósito y no consultados al arrancar: si la red está caída, el
// teléfono tiene que poder decir "esto pesa demasiado" sin preguntar.
// Si algún día divergen, manda la base y el usuario ve su mensaje.
export const LIMITES = {
  voz:       { maxBytes: 8 * 1024 * 1024,  maxDuracionMs: 120000 },
  imagen:    { maxBytes: 12 * 1024 * 1024, maxLado: 4096 },
  documento: { maxBytes: 25 * 1024 * 1024 },
  maxPorMensaje: 6,
  maxTexto: 4000,
} as const;

export const MIMES_IMAGEN = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
];

export const MIMES_DOCUMENTO = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword', 'text/plain', 'text/csv',
];

export const MIMES_AUDIO = [
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg',
  'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/mp3',
];

// >>> LO QUE NO ENTRA, Y POR QUÉ ES UNA LISTA BLANCA <<<
// Una lista negra hay que mantenerla cada vez que alguien inventa una
// extensión. Una lista blanca solo hay que ampliarla cuando el negocio lo
// pida. Un .apk en el chat del dueño no tiene ningún uso legítimo.
export const mimePermitido = (kind: ClaseMedio, mime: string): boolean => {
  const m = (mime || '').split(';')[0].trim().toLowerCase();
  if (kind === 'image') return MIMES_IMAGEN.includes(m);
  if (kind === 'document') return MIMES_DOCUMENTO.includes(m);
  return MIMES_AUDIO.includes(m);
};

// ── VALIDACIÓN ANTES DE GASTAR DATOS ─────────────────────────────────
export const validarMedio = (m: MedioLocal): string | null => {
  if (!m.sizeBytes || m.sizeBytes <= 0) return 'Ese archivo llegó vacío.';
  if (!mimePermitido(m.kind, m.mimeType)) {
    return m.kind === 'document'
      ? 'Ese tipo de archivo no se admite. Puedes enviar PDF, Excel, Word, texto o imágenes.'
      : 'Ese formato no se admite.';
  }
  const tope = m.kind === 'image' ? LIMITES.imagen.maxBytes
    : m.kind === 'document' ? LIMITES.documento.maxBytes
    : LIMITES.voz.maxBytes;
  if (m.sizeBytes > tope) {
    return `Pesa ${(m.sizeBytes / 1048576).toFixed(1)} MB y el máximo son ${(tope / 1048576).toFixed(0)} MB.`;
  }
  if (m.kind === 'voice') {
    if (m.durationMs && m.durationMs > LIMITES.voz.maxDuracionMs) {
      return `La nota dura ${Math.round(m.durationMs / 1000)} s y el máximo son ${LIMITES.voz.maxDuracionMs / 1000} s.`;
    }
    if (m.durationMs !== undefined && m.durationMs < 500) {
      return 'Muy corta. Mantén pulsado y habla.';
    }
  }
  return null;
};

export const validarMensaje = (texto: string, medios: MedioLocal[]): string | null => {
  const t = (texto || '').trim();
  if (!t && medios.length === 0) return 'Escribe algo o adjunta un archivo.';
  if (t.length > LIMITES.maxTexto) {
    return `El mensaje es muy largo (${t.length} de ${LIMITES.maxTexto} caracteres).`;
  }
  if (medios.length > LIMITES.maxPorMensaje) {
    return `Máximo ${LIMITES.maxPorMensaje} archivos por mensaje.`;
  }
  for (const m of medios) {
    const p = validarMedio(m);
    if (p) return p;
  }
  return null;
};

// ── EL TIPO QUE TENDRÁ EL MENSAJE ────────────────────────────────────
// Se calcula igual que en la base (hermes_movil_escribir) para que la
// burbuja optimista no cambie de forma cuando llegue la confirmación.
export const tipoDeMensaje = (texto: string, medios: MedioLocal[]): TipoMensaje => {
  const t = (texto || '').trim();
  if (medios.length === 0) return 'text';
  if (t) return 'mixed';
  const kinds = Array.from(new Set(medios.map((m) => m.kind)));
  if (kinds.length > 1) return 'mixed';
  const k = kinds[0];
  return k === 'voice' ? 'voice' : k === 'image' ? 'image'
    : k === 'document' ? 'document' : 'mixed';
};

// ── IDEMPOTENCIA ─────────────────────────────────────────────────────
// El identificador lo genera el TELÉFONO antes de mandar nada, y lo repite
// en cada reintento. Es lo que hace que una red mala no meta el mismo
// mensaje tres veces: la base tiene un índice único sobre él.
//
// Sin crypto.randomUUID en todos los runtime de RN, así que se arma a
// mano. No es un uuid criptográfico y no hace falta que lo sea: solo
// tiene que ser único dentro de un tenant.
export const nuevoClientMessageId = (): string => {
  const hex = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, '0');
  return `m-${Date.now().toString(36)}-${hex(8)}-${hex(4)}`;
};

// ── EL NOMBRE QUE SE ENSEÑA ──────────────────────────────────────────
// Se sanea también en la base (es la que manda), pero aquí evita pintar
// algo raro mientras el mensaje todavía está en la cola local.
export const nombreSeguro = (nombre?: string): string => {
  const base = (nombre || 'archivo').replace(/[^a-zA-Z0-9 ._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 80);
  return base || 'archivo';
};

export const extensionDe = (mime: string): string => {
  const m = (mime || '').split(';')[0].trim().toLowerCase();
  const tabla: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/heif': 'heif',
    'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/webm': 'webm',
    'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac',
  };
  return tabla[m] || 'bin';
};

// La primera carpeta TIENE que ser el tenant: es lo que miran las
// políticas del bucket. Si esto cambia, se abre el acceso cruzado.
export const rutaMedio = (tenantId: string, sha: string, ext: string): string =>
  `${tenantId}/${new Date().toISOString().slice(0, 7)}/${sha.slice(0, 32)}.${ext}`;

// ── ESTADOS QUE VE LA PERSONA ────────────────────────────────────────
// Vienen del backend, no de un temporizador. Si un estado no llega, no se
// inventa: se queda en el anterior.
export const ESTADOS: Record<string, string> = {
  pendiente_local:  'Sin enviar',
  subiendo:         'Subiendo archivos…',
  enviado:          'Enviado',
  recibido:         'Hermes recibió la solicitud',
  procesando:       'Hermes está coordinando',
  jarvis:           'Jarvis está verificando MotoFlow',
  comercial:        'Comercial-Creativo prepara la propuesta',
  analizando_imagen:'Analizando la imagen',
  transcribiendo:   'Transcribiendo el audio',
  preparando:       'Preparando la respuesta',
  preparando_voz:   'Preparando la respuesta de voz',
  esperando_aprob:  'Esperando tu aprobación',
  respondido:       'Completado',
  error:            'Error',
};

// El estado de la CABECERA, que es distinto: dice si hay alguien al otro
// lado, no en qué anda un mensaje.
export const estadoCabecera = (
  conectado: boolean, hayRed: boolean, procesando: boolean, esperandoAprobacion: boolean,
): string => {
  if (!hayRed) return 'Sin conexión';
  if (esperandoAprobacion) return 'Esperando aprobación';
  if (procesando) return 'Procesando';
  if (!conectado) return 'Conectando';
  return 'Disponible';
};

// ── QUIÉN HABLA ──────────────────────────────────────────────────────
// El punto del módulo: que NO parezca que uno habla solo. Cada burbuja
// sabe de quién es y se pinta distinta.
export type Autor = 'usuario' | 'hermes' | 'jarvis' | 'comercial_creativo' | 'sistema';

export const AUTORES: Record<Autor, { nombre: string; rol: string }> = {
  usuario:            { nombre: 'Tú',                 rol: '' },
  hermes:             { nombre: 'Hermes',             rol: 'Orquestador comercial' },
  jarvis:             { nombre: 'Jarvis',             rol: 'Especialista MotoFlow' },
  comercial_creativo: { nombre: 'Comercial-Creativo', rol: 'Promoción y contenido' },
  sistema:            { nombre: 'MotoFlow',           rol: '' },
};

// Exactamente tres agentes. Elvido no es uno de ellos: es quien aprueba.
export const AGENTES: Autor[] = ['hermes', 'jarvis', 'comercial_creativo'];

export const formatearDuracion = (ms?: number): string => {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const formatearTamano = (b?: number): string => {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
};
