// =====================================================================
// La cola de salida — sobrevivir a una red de tienda
// ---------------------------------------------------------------------
// En un mostrador la señal se va. Un chat que pierde lo que escribiste
// porque justo no había datos no se usa dos veces.
//
// >>> LO QUE ESTA COLA GARANTIZA <<<
//   · lo escrito no se pierde aunque se cierre la aplicación
//   · reintentar NO duplica: el client_message_id se genera una vez y se
//     repite en cada intento; la base tiene un índice único sobre él
//   · un mensaje ya confirmado no se reenvía nunca
//   · el orden se conserva: se manda de uno en uno, el más viejo primero
//
// >>> LO QUE NO GARANTIZA <<<
// Que llegue. Hasta que el servidor confirma, el mensaje está "sin
// enviar" y se ve así. Fingir lo contrario sería peor que el problema.
//
// Las funciones de estado son PURAS y viven aparte del almacenamiento
// justo para poder probarlas: AsyncStorage no existe en un test de Node.
// =====================================================================

import type { MensajeSaliente, MedioLocal } from './contrato';
import { nuevoClientMessageId } from './contrato';

export const CLAVE_COLA = 'hermes.cola.v1';

// Tres intentos automáticos y para. Reintentar sin fin con una red mala
// gasta batería y datos, y esconde el problema en vez de enseñarlo: a la
// cuarta el usuario ve "no se pudo" y un botón para reintentar a mano.
export const MAX_INTENTOS = 3;

// ── OPERACIONES PURAS SOBRE LA COLA ──────────────────────────────────

export const encolar = (
  cola: MensajeSaliente[], texto: string, medios: MedioLocal[],
): { cola: MensajeSaliente[]; mensaje: MensajeSaliente } => {
  const mensaje: MensajeSaliente = {
    clientMessageId: nuevoClientMessageId(),
    texto: texto.trim() || undefined,
    medios,
    estado: 'pendiente',
    intentos: 0,
    creadoEn: Date.now(),
  };
  return { cola: [...cola, mensaje], mensaje };
};

export const marcar = (
  cola: MensajeSaliente[], clientMessageId: string, cambios: Partial<MensajeSaliente>,
): MensajeSaliente[] =>
  cola.map((m) => (m.clientMessageId === clientMessageId ? { ...m, ...cambios } : m));

// Cambia el estado de UN archivo dentro de un mensaje. Se identifica por
// su uri: es lo único que el teléfono conoce antes de que la base le dé
// un media_id.
export const marcarMedio = (
  cola: MensajeSaliente[], clientMessageId: string, uri: string,
  cambios: Partial<MedioLocal>,
): MensajeSaliente[] =>
  cola.map((m) => (m.clientMessageId === clientMessageId
    ? { ...m, medios: m.medios.map((x) => (x.uri === uri ? { ...x, ...cambios } : x)) }
    : m));

// ── LA REGLA QUE NO SE SALTA ─────────────────────────────────────────
// Un mensaje con adjuntos NO sale mientras alguno no esté registrado en
// la base con su media_id.
//
// Sin esta regla, un fallo a mitad de la subida crea un mensaje de foto
// SIN foto: Hermes recibe el texto, no ve adjunto, y contesta como si no
// existiera. Desde fuera parece que "la foto no llegó"; en realidad nunca
// se mandó y nadie puede saberlo mirando el mensaje.
export const todosAdjuntos = (m: MensajeSaliente): boolean =>
  m.medios.every((x) => x.estado === 'adjuntado' && !!x.mediaId);

export const puedeEnviarse = (m: MensajeSaliente): boolean =>
  m.medios.length === 0 || todosAdjuntos(m);

// Confirmado = fuera de la cola. Se queda en el historial del servidor,
// que es la fuente de verdad; mantenerlo aquí solo daría ocasión de
// reenviarlo.
export const confirmar = (
  cola: MensajeSaliente[], clientMessageId: string,
): MensajeSaliente[] => cola.filter((m) => m.clientMessageId !== clientMessageId);

export const quitar = confirmar;

// El siguiente a mandar: el más viejo que no esté ya en vuelo ni agotado.
// De uno en uno para que el orden de la conversación sea el orden en que
// se escribió.
export const siguiente = (cola: MensajeSaliente[]): MensajeSaliente | null => {
  const enVuelo = cola.some((m) => m.estado === 'subiendo'
    || m.estado === 'subido' || m.estado === 'enviando');
  if (enVuelo) return null;
  const candidatos = cola
    .filter((m) => (m.estado === 'pendiente' || m.estado === 'error')
                && m.intentos < MAX_INTENTOS && !m.servidorId)
    .sort((a, b) => a.creadoEn - b.creadoEn);
  return candidatos[0] || null;
};

export const agotados = (cola: MensajeSaliente[]): MensajeSaliente[] =>
  cola.filter((m) => m.intentos >= MAX_INTENTOS && !m.servidorId);

// Reintentar a mano vuelve a poner el contador a cero: es una decisión de
// la persona, no un bucle del programa.
export const reintentar = (
  cola: MensajeSaliente[], clientMessageId: string,
): MensajeSaliente[] =>
  marcar(cola, clientMessageId, { estado: 'pendiente', intentos: 0, error: undefined });

// Espera creciente entre intentos. Con la red intermitente de un local,
// reintentar tres veces seguidas en un segundo falla tres veces seguidas.
export const esperaMs = (intentos: number): number =>
  Math.min(30000, 1500 * 2 ** Math.max(0, intentos - 1));

// ── FUSIÓN CON EL SERVIDOR ───────────────────────────────────────────
// Al recuperar el historial pueden llegar mensajes que TAMBIÉN están en la
// cola local: es lo que pasa cuando la red se cayó justo después de
// insertar. Se reconocen por client_message_id y se quitan de la cola.
//
// Sin esto, el mensaje se vería dos veces: una del servidor y otra local.
export const conciliar = (
  cola: MensajeSaliente[], idsDelServidor: (string | null | undefined)[],
): MensajeSaliente[] => {
  const vistos = new Set(idsDelServidor.filter(Boolean) as string[]);
  return cola.filter((m) => !vistos.has(m.clientMessageId));
};

// Nada de guardar los bytes de una foto en AsyncStorage: solo su ruta
// local. Si el sistema la borró, el reintento falla y se dice — mejor eso
// que llenar el almacenamiento del teléfono con copias.
export const paraGuardar = (cola: MensajeSaliente[]): MensajeSaliente[] =>
  cola.map((m) => ({ ...m, medios: m.medios.map((x) => ({ ...x })) }));
