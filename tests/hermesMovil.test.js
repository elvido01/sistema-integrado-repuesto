// Pruebas del canal móvil de Hermes.
//
// Prueban la lógica que decide QUÉ se manda y CÓMO no se duplica. Lo que
// necesita un teléfono —cámara, micrófono, red— no se simula aquí: un
// simulacro que siempre pasa no prueba nada, y en el informe queda dicho
// qué quedó sin verificar.
//
// Los módulos son TypeScript puro sin nada de React Native, que es
// justamente por lo que se pusieron aparte del componente.
import { describe, it, expect } from 'vitest';
import {
  validarMedio, validarMensaje, tipoDeMensaje, mimePermitido,
  nuevoClientMessageId, nombreSeguro, extensionDe, rutaMedio,
  estadoCabecera, AGENTES, AUTORES, LIMITES, formatearDuracion, formatearTamano,
} from '../mobile/src/features/hermes/contrato';
import {
  encolar, marcar, marcarMedio, confirmar, siguiente, reintentar, conciliar,
  esperaMs, agotados, puedeEnviarse, todosAdjuntos, MAX_INTENTOS,
} from '../mobile/src/features/hermes/cola';

const img = (over = {}) => ({
  uri: 'file://a.jpg', kind: 'image', mimeType: 'image/jpeg',
  sizeBytes: 500_000, ...over,
});

describe('lo que se puede adjuntar', () => {
  it('acepta las imágenes del negocio', () => {
    for (const m of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
      expect(mimePermitido('image', m)).toBe(true);
    }
  });

  it('acepta PDF, Excel y Word como documentos', () => {
    expect(mimePermitido('document', 'application/pdf')).toBe(true);
    expect(mimePermitido('document', 'application/vnd.ms-excel')).toBe(true);
  });

  it('NO acepta ejecutables, y esa es la razón de la lista blanca', () => {
    for (const m of ['application/x-msdownload', 'application/vnd.android.package-archive',
                     'application/x-sh', 'application/octet-stream']) {
      expect(mimePermitido('document', m)).toBe(false);
    }
  });

  it('no confunde un audio con una imagen', () => {
    expect(mimePermitido('image', 'audio/mp4')).toBe(false);
    expect(mimePermitido('voice', 'image/png')).toBe(false);
  });

  it('ignora el parámetro del content-type', () => {
    expect(mimePermitido('voice', 'audio/mp4; codecs=aac')).toBe(true);
  });
});

describe('validarMedio', () => {
  it('rechaza el archivo vacío', () => {
    expect(validarMedio(img({ sizeBytes: 0 }))).toMatch(/vacío/i);
  });

  it('rechaza la imagen que pasa de 12 MB', () => {
    expect(validarMedio(img({ sizeBytes: LIMITES.imagen.maxBytes + 1 }))).toMatch(/máximo/i);
  });

  it('deja pasar un documento de 20 MB, que a una imagen le sobraría', () => {
    // Los topes son distintos a propósito: una factura escaneada pesa.
    expect(validarMedio({
      uri: 'f', kind: 'document', mimeType: 'application/pdf', sizeBytes: 20 * 1024 * 1024,
    })).toBeNull();
    expect(validarMedio(img({ sizeBytes: 20 * 1024 * 1024 }))).toMatch(/máximo/i);
  });

  it('rechaza la nota de voz de más de dos minutos', () => {
    expect(validarMedio({
      uri: 'f', kind: 'voice', mimeType: 'audio/mp4', sizeBytes: 90_000,
      durationMs: LIMITES.voz.maxDuracionMs + 1,
    })).toMatch(/máximo son 120/);
  });

  it('rechaza el toque sin querer', () => {
    expect(validarMedio({
      uri: 'f', kind: 'voice', mimeType: 'audio/mp4', sizeBytes: 900, durationMs: 120,
    })).toMatch(/corta/i);
  });
});

describe('validarMensaje', () => {
  it('no deja mandar un mensaje sin nada', () => {
    expect(validarMensaje('   ', [])).toMatch(/escribe algo/i);
  });

  it('deja mandar solo una foto, sin texto', () => {
    expect(validarMensaje('', [img()])).toBeNull();
  });

  it('corta a los 6 archivos', () => {
    expect(validarMensaje('mira', Array.from({ length: 7 }, () => img()))).toMatch(/Máximo 6/);
    expect(validarMensaje('mira', Array.from({ length: 6 }, () => img()))).toBeNull();
  });

  it('propaga el problema del archivo, no uno genérico', () => {
    expect(validarMensaje('hola', [img({ sizeBytes: 0 })])).toMatch(/vacío/i);
  });
});

describe('tipoDeMensaje — igual que lo calcula la base', () => {
  it('solo texto', () => expect(tipoDeMensaje('hola', [])).toBe('text'));
  it('solo fotos', () => expect(tipoDeMensaje('', [img(), img()])).toBe('image'));
  it('texto + foto es mixto', () => expect(tipoDeMensaje('¿qué es?', [img()])).toBe('mixed'));
  it('foto + documento es mixto aunque no haya texto', () => {
    expect(tipoDeMensaje('', [img(), { uri: 'f', kind: 'document', mimeType: 'application/pdf', sizeBytes: 10 }]))
      .toBe('mixed');
  });
  it('solo voz', () => {
    expect(tipoDeMensaje('', [{ uri: 'f', kind: 'voice', mimeType: 'audio/mp4', sizeBytes: 10 }]))
      .toBe('voice');
  });
});

describe('idempotencia', () => {
  it('cada mensaje nace con un identificador distinto', () => {
    const ids = new Set(Array.from({ length: 500 }, () => nuevoClientMessageId()));
    expect(ids.size).toBe(500);
  });

  it('el identificador se genera UNA vez y sobrevive a los reintentos', () => {
    // Es lo que hace que una red mala no meta el mismo mensaje tres veces:
    // la base tiene un índice único sobre este valor.
    let { cola, mensaje } = encolar([], 'hola', []);
    const id = mensaje.clientMessageId;
    cola = marcar(cola, id, { estado: 'error', intentos: 1 });
    cola = reintentar(cola, id);
    expect(cola[0].clientMessageId).toBe(id);
    expect(cola[0].intentos).toBe(0);
  });
});

describe('la cola de salida', () => {
  it('manda el más viejo primero', () => {
    let cola = [];
    ({ cola } = encolar(cola, 'primero', []));
    cola[0].creadoEn = 1000;
    ({ cola } = encolar(cola, 'segundo', []));
    cola[1].creadoEn = 2000;
    expect(siguiente(cola).texto).toBe('primero');
  });

  it('NO manda dos a la vez: el orden de la conversación es el de escritura', () => {
    let cola = [];
    ({ cola } = encolar(cola, 'a', []));
    ({ cola } = encolar(cola, 'b', []));
    cola = marcar(cola, cola[0].clientMessageId, { estado: 'subiendo' });
    expect(siguiente(cola)).toBeNull();
  });

  it('para a los 3 intentos en vez de reintentar sin fin', () => {
    let { cola, mensaje } = encolar([], 'hola', []);
    cola = marcar(cola, mensaje.clientMessageId, { estado: 'error', intentos: MAX_INTENTOS });
    expect(siguiente(cola)).toBeNull();
    expect(agotados(cola)).toHaveLength(1);
  });

  it('un mensaje ya confirmado sale de la cola y no se reenvía', () => {
    const { cola, mensaje } = encolar([], 'hola', []);
    expect(confirmar(cola, mensaje.clientMessageId)).toHaveLength(0);
  });

  it('espera cada vez más entre intentos, con tope', () => {
    expect(esperaMs(1)).toBe(1500);
    expect(esperaMs(2)).toBe(3000);
    expect(esperaMs(3)).toBe(6000);
    expect(esperaMs(20)).toBe(30000);
  });
});

describe('conciliar con el servidor', () => {
  it('quita de la cola lo que el servidor ya tiene', () => {
    // El caso real: se insertó y la red se cayó antes de contestarnos.
    // Sin esto el mensaje se vería dos veces.
    let cola = [];
    ({ cola } = encolar(cola, 'llegó', []));
    ({ cola } = encolar(cola, 'no llegó', []));
    const resultado = conciliar(cola, [cola[0].clientMessageId, null, undefined]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].texto).toBe('no llegó');
  });

  it('no borra nada si el servidor no reconoce ninguno', () => {
    const { cola } = encolar([], 'hola', []);
    expect(conciliar(cola, [null, undefined])).toHaveLength(1);
  });
});

describe('nombres y rutas', () => {
  it('sanea el nombre del archivo', () => {
    expect(nombreSeguro('../../etc/passwd')).not.toMatch(/\//);
    expect(nombreSeguro('factura 2026.pdf')).toBe('factura 2026.pdf');
    expect(nombreSeguro('a..b...c')).toBe('a.b.c');
  });

  it('nunca devuelve vacío', () => {
    expect(nombreSeguro('')).toBe('archivo');
    expect(nombreSeguro(undefined)).toBe('archivo');
  });

  it('la ruta empieza por el tenant, que es lo que mira el bucket', () => {
    const t = '00000000-0000-0000-0000-000000000001';
    const r = rutaMedio(t, 'a'.repeat(64), 'jpg');
    expect(r.split('/')[0]).toBe(t);
    expect(r).not.toMatch(/\.\./);
  });

  it('traduce el MIME a una extensión conocida', () => {
    expect(extensionDe('image/jpeg')).toBe('jpg');
    expect(extensionDe('application/pdf')).toBe('pdf');
    expect(extensionDe('audio/mp4')).toBe('m4a');
    expect(extensionDe('cosa/rara')).toBe('bin');
  });
});

describe('estado de la cabecera', () => {
  it('sin red gana sobre todo lo demás', () => {
    expect(estadoCabecera(true, false, true, true)).toBe('Sin conexión');
  });
  it('la aprobación pendiente se ve antes que el proceso', () => {
    expect(estadoCabecera(true, true, true, true)).toBe('Esperando aprobación');
  });
  it('conectado y quieto es Disponible', () => {
    expect(estadoCabecera(true, true, false, false)).toBe('Disponible');
  });
  it('sin señal de Hermes dice Conectando, no Disponible', () => {
    expect(estadoCabecera(false, true, false, false)).toBe('Conectando');
  });
});

describe('exactamente tres agentes', () => {
  it('ni uno más', () => {
    expect(AGENTES).toEqual(['hermes', 'jarvis', 'comercial_creativo']);
    expect(AGENTES).toHaveLength(3);
  });

  it('el usuario NO es un agente', () => {
    expect(AGENTES).not.toContain('usuario');
    expect(AUTORES.usuario.rol).toBe('');
  });

  it('cada agente se presenta con su papel, para que no parezca uno solo', () => {
    for (const a of AGENTES) {
      expect(AUTORES[a].nombre.length).toBeGreaterThan(0);
      expect(AUTORES[a].rol.length).toBeGreaterThan(0);
    }
  });
});

describe('formatos que ve la persona', () => {
  it('la duración va en minutos y segundos', () => {
    expect(formatearDuracion(0)).toBe('0:00');
    expect(formatearDuracion(65000)).toBe('1:05');
    expect(formatearDuracion(undefined)).toBe('0:00');
  });

  it('el tamaño se lee sin calculadora', () => {
    expect(formatearTamano(512)).toBe('512 B');
    expect(formatearTamano(2048)).toBe('2 KB');
    expect(formatearTamano(3 * 1048576)).toBe('3.0 MB');
  });
});

// =====================================================================
// La regla que faltaba: un mensaje de foto no sale sin la foto
// ---------------------------------------------------------------------
// (14/08/2026) Durante meses, adjuntar una foto desde Android fallaba y
// la pantalla decía "No se pudo enviar" — el mismo texto que sale cuando
// no hay señal. En la base quedaron ocho mensajes de Android, los ocho de
// texto, y cero medios en toda la historia.
//
// La causa era `crypto.subtle` (que no existe en React Native), pero lo
// que hizo el fallo indiagnosticable fue no tener esta regla escrita en
// ningún sitio comprobable. Ahora está aquí.
// =====================================================================
describe('un mensaje con adjuntos no sale hasta que estan todos', () => {
  const conFotos = (...estados) => ({
    clientMessageId: 'c1',
    texto: 'mira esto',
    medios: estados.map((e, i) => ({
      uri: `file://f${i}.jpg`, kind: 'image', mimeType: 'image/jpeg',
      sizeBytes: 1000, ...e,
    })),
    estado: 'pendiente', intentos: 0, creadoEn: 1,
  });

  it('sin adjuntos, siempre puede salir', () => {
    expect(puedeEnviarse({ ...conFotos(), medios: [] })).toBe(true);
  });

  it('con todos adjuntados, puede salir', () => {
    const m = conFotos({ estado: 'adjuntado', mediaId: 'a' }, { estado: 'adjuntado', mediaId: 'b' });
    expect(todosAdjuntos(m)).toBe(true);
    expect(puedeEnviarse(m)).toBe(true);
  });

  it('si uno esta a medias, NO sale', () => {
    for (const parcial of [{ estado: 'pendiente' }, { estado: 'subiendo' },
      { estado: 'subido' }, { estado: 'error' }, {}]) {
      const m = conFotos({ estado: 'adjuntado', mediaId: 'a' }, parcial);
      expect(puedeEnviarse(m), JSON.stringify(parcial)).toBe(false);
    }
  });

  // El caso exacto del fallo: el estado dice 'adjuntado' pero no hay
  // media_id. Sin comprobar las dos cosas, el mensaje saldria con una
  // lista de adjuntos vacia y Hermes recibiria texto suelto.
  it('adjuntado sin media_id no cuenta', () => {
    expect(puedeEnviarse(conFotos({ estado: 'adjuntado' }))).toBe(false);
  });
});

describe('marcarMedio', () => {
  const base = () => encolar([], 'hola', [
    { uri: 'file://1.jpg', kind: 'image', mimeType: 'image/jpeg', sizeBytes: 10 },
    { uri: 'file://2.jpg', kind: 'image', mimeType: 'image/jpeg', sizeBytes: 20 },
  ]).cola;

  it('toca solo el archivo indicado', () => {
    const c = marcarMedio(base(), base()[0].clientMessageId, 'file://2.jpg',
      { estado: 'adjuntado', mediaId: 'x' });
    // el clientMessageId cambia entre llamadas, asi que se busca por uri
    const m = c[0];
    expect(m.medios.find((x) => x.uri === 'file://1.jpg').estado).toBeUndefined();
  });

  it('no altera un mensaje que no es el suyo', () => {
    const c = base();
    const otro = marcarMedio(c, 'no-existe', 'file://1.jpg', { estado: 'error' });
    expect(otro[0].medios[0].estado).toBeUndefined();
  });
});

describe('un mensaje en vuelo bloquea la cola en todas sus etapas', () => {
  // Sin esto, un mensaje "enviando" no cuenta como en vuelo y el bombeo
  // arranca el siguiente: dos mensajes a la vez y el orden de la
  // conversacion deja de ser el orden en que se escribio.
  it.each(['subiendo', 'subido', 'enviando'])('%s bloquea', (estado) => {
    const c1 = encolar([], 'uno', []).cola;
    const c2 = encolar(c1, 'dos', []).cola;
    const bloqueada = marcar(c2, c2[0].clientMessageId, { estado });
    expect(siguiente(bloqueada)).toBeNull();
  });
});
