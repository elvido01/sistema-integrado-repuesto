// El lector del formato binario de TikTok.
//
// TikTok no contesta JSON en su bandeja: manda protobuf crudo. Eso no se
// puede probar "abriendo TikTok a ver si sale" — hay que fabricar los bytes
// a mano y comprobar que salen los mensajes correctos. Es justo lo que hace
// este archivo: arma respuestas con la misma forma que las de TikTok y
// verifica lo que el espejo va a mandar al CRM.
//
// Se evalúa EL ARCHIVO QUE SE INSTALA (public/tt-protobuf.js), no una copia
// pegada aquí. Si alguien lo edita y lo rompe, esto se pone rojo.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const fuente = readFileSync(new URL('../whatsapp-quote-extension/public/tt-protobuf.js', import.meta.url), 'utf8');
const caja = {};
// El archivo se cuelga de `globalThis`; aquí se le pasa uno de mentira para
// no ensuciar el de las pruebas.
new Function('globalThis', fuente).call(caja, caja);
const TT = caja.MFTikTok;

// ── Un protobuf de juguete para fabricar los casos ────────────────────
// Es el mismo formato de cable, escrito al revés: clave, luego valor.
const varint = (n) => {
  let v = BigInt(n);
  const out = [];
  while (v > 0x7fn) { out.push(Number((v & 0x7fn) | 0x80n)); v >>= 7n; }
  out.push(Number(v));
  return out;
};
const clave = (n, w) => varint((BigInt(n) << 3n) | BigInt(w));
const num = (n, v) => [...clave(n, 0), ...varint(v)];
const cad = (n, s) => {
  const b = [...Buffer.from(String(s), 'utf8')];
  return [...clave(n, 2), ...varint(b.length), ...b];
};
const sub = (n, bytes) => [...clave(n, 2), ...varint(bytes.length), ...bytes];
const bytes = (...trozos) => new Uint8Array(trozos.flat());

// Los identificadores de TikTok son de 19 cifras y las fechas van en
// microsegundos. Que se parezcan tanto es exactamente el problema que el
// lector tiene que resolver sin equivocarse.
const YO = '6849321775432109876';
const CLIENTE = '7123456789012345678';
const OTRO_CLIENTE = '7987654321098765432';
const MICROS = 1787158800000000;                    // 2026-08-19 17:00:00 UTC
const ISO = '2026-08-19T17:00:00.000Z';

// Un mensaje con la forma que trae TikTok: llave de conversación, fecha en
// el campo 4, quién lo mandó, y el contenido como JSON dentro del binario
// en el campo 8.
const mensaje = ({ yo = YO, otro = CLIENTE, de = CLIENTE, ts = MICROS, json }) => sub(2, [
  ...cad(1, `0:1:${yo}:${otro}`),
  ...num(4, ts),
  ...num(5, de),
  ...cad(8, JSON.stringify(json)),
]);

// El sobre en el que TikTok mete todo, con el usuario conectado en el 15.
const respuesta = (...mensajes) => bytes(...mensajes, num(15, YO));

describe('leer los bytes', () => {
  it('saca un mensaje de texto con su hilo, su fecha y su texto', () => {
    const r = TT.extraerHilos(respuesta(mensaje({ json: { text: 'Tienen bujía para AX100?' } })));

    expect(r.hilos).toHaveLength(1);
    const h = r.hilos[0];
    expect(h.thread_id).toBe(`0:1:${YO}:${CLIENTE}`);
    expect(h.user_id).toBe(CLIENTE);
    expect(h.messages).toHaveLength(1);
    expect(h.messages[0].texto).toBe('Tienen bujía para AX100?');
    expect(h.messages[0].tipo).toBe('text');
    expect(h.messages[0].ts).toBe(ISO);
  });

  it('distingue lo que escribió el cliente de lo que escribimos nosotros', () => {
    // Es la diferencia entre "hay que contestarle" y "ya se contestó": de
    // esto vive el contador de la barra.
    const r = TT.extraerHilos(respuesta(
      mensaje({ de: CLIENTE, json: { text: 'Hola' } }),
      mensaje({ de: YO, ts: MICROS + 60000000, json: { text: 'Dime' } }),
    ));

    const m = r.hilos[0].messages;
    expect(m.map((x) => x.de)).toEqual(['user', 'agent']);
  });

  it('no confunde un identificador de 19 cifras con una fecha', () => {
    // Los dos son números grandes en el mismo registro. Si el lector toma
    // el uid por fecha, el mensaje aparece con fecha del año 58.000.
    const r = TT.extraerHilos(respuesta(mensaje({ json: { text: 'x' } })));
    expect(r.hilos[0].messages[0].ts).toBe(ISO);
  });

  it('ordena los mensajes por fecha aunque lleguen al revés', () => {
    const r = TT.extraerHilos(respuesta(
      mensaje({ ts: MICROS + 120000000, json: { text: 'segundo' } }),
      mensaje({ ts: MICROS, json: { text: 'primero' } }),
    ));
    expect(r.hilos[0].messages.map((m) => m.texto)).toEqual(['primero', 'segundo']);
  });

  it('encuentra los mensajes aunque estén metidos en varias capas', () => {
    // TikTok no promete a qué profundidad los pone, y de hecho cambia según
    // el endpoint. El lector baja hasta encontrarlos.
    const hondo = sub(1, sub(3, sub(7, mensaje({ json: { text: 'hondo' } }))));
    const r = TT.extraerHilos(bytes(hondo, num(15, YO)));
    expect(r.hilos[0].messages[0].texto).toBe('hondo');
  });
});

describe('quién soy yo', () => {
  it('lo deduce: es el único que sale en todas las conversaciones', () => {
    // Sin preguntarle nada a TikTok. Con dos hilos distintos ya no hay duda.
    expect(TT.deducirMiId([`0:1:${YO}:${CLIENTE}`, `0:1:${YO}:${OTRO_CLIENTE}`])).toBe(YO);
  });

  it('con una sola conversación no adivina', () => {
    // Devolver cualquiera de los dos sería una moneda al aire, y equivocarse
    // marca los mensajes del cliente como si los hubiéramos escrito nosotros.
    expect(TT.deducirMiId([`0:1:${YO}:${CLIENTE}`])).toBe(null);
  });

  it('con una sola conversación tira del campo 15 del sobre', () => {
    const r = TT.extraerHilos(respuesta(mensaje({ de: YO, json: { text: 'buenas' } })));
    expect(r.miId).toBe(YO);
    expect(r.hilos[0].user_id).toBe(CLIENTE);
    expect(r.hilos[0].messages[0].de).toBe('agent');
  });

  it('con dos clientes saca los dos hilos y el interlocutor correcto de cada uno', () => {
    const r = TT.extraerHilos(respuesta(
      mensaje({ otro: CLIENTE, de: CLIENTE, json: { text: 'uno' } }),
      mensaje({ otro: OTRO_CLIENTE, de: OTRO_CLIENTE, json: { text: 'dos' } }),
    ));
    expect(r.miId).toBe(YO);
    expect(r.hilos.map((h) => h.user_id).sort()).toEqual([CLIENTE, OTRO_CLIENTE].sort());
  });
});

describe('lo que no es texto', () => {
  it('una imagen entra como [Imagen] y conserva la url', () => {
    const r = TT.extraerHilos(respuesta(mensaje({ json: { url: 'https://p16.tiktok.com/foo.jpg' } })));
    const m = r.hilos[0].messages[0];
    expect(m.texto).toBe('[Imagen]');
    expect(m.tipo).toBe('image');
    expect(m.media_url).toBe('https://p16.tiktok.com/foo.jpg');
  });

  it('un video compartido se anota aunque no viaje el contenido', () => {
    // Que conste que llegó algo vale más que un hueco en la conversación.
    const r = TT.extraerHilos(respuesta(mensaje({ json: { aweme_id: '73991' } })));
    expect(r.hilos[0].messages[0].texto).toBe('[Video compartido]');
  });

  it('un contenido que no se sabe leer no inventa un mensaje vacío', () => {
    const r = TT.extraerHilos(respuesta(mensaje({ json: { algo_nuevo: 1 } })));
    expect(r.hilos).toHaveLength(0);
  });
});

describe('leerlo dos veces no duplica nada', () => {
  it('los identificadores son los mismos en la segunda pasada', () => {
    // El espejo relee la bandeja cada vez que TikTok la refresca. Si los
    // identificadores cambiaran, el CRM se llenaría de copias.
    const b = respuesta(mensaje({ json: { text: 'una sola vez' } }));
    const a1 = TT.extraerHilos(b).hilos[0].messages[0].id;
    const a2 = TT.extraerHilos(b).hilos[0].messages[0].id;
    expect(a1).toBe(a2);
  });

  it('el mismo mensaje repetido dentro de la misma respuesta cuenta una vez', () => {
    const m = mensaje({ json: { text: 'eco' } });
    const r = TT.extraerHilos(bytes(m, m, num(15, YO)));
    expect(r.hilos[0].messages).toHaveLength(1);
  });

  it('dos mensajes con el mismo texto en distinto momento son dos', () => {
    const r = TT.extraerHilos(respuesta(
      mensaje({ json: { text: 'hola' } }),
      mensaje({ ts: MICROS + 3600000000, json: { text: 'hola' } }),
    ));
    expect(r.hilos[0].messages).toHaveLength(2);
  });
});

describe('cuando los bytes no son lo que se espera', () => {
  it('basura no revienta ni inventa hilos', () => {
    const basura = new Uint8Array(400);
    for (let i = 0; i < basura.length; i++) basura[i] = (i * 37) % 256;
    expect(() => TT.extraerHilos(basura)).not.toThrow();
    expect(TT.extraerHilos(basura).hilos).toEqual([]);
  });

  it('vacío, nulo o indefinido devuelven cero hilos', () => {
    for (const v of [new Uint8Array(0), null, undefined]) {
      expect(TT.extraerHilos(v).hilos).toEqual([]);
    }
  });

  it('un mensaje cortado a la mitad se descarta entero', () => {
    // Un lector que "aproveche lo que se pueda" de bytes truncados escribe
    // basura en el CRM. Mejor perder ese lote.
    const b = respuesta(mensaje({ json: { text: 'completo' } }));
    expect(TT.leerCampos(b.subarray(0, b.length - 3), 0, b.length - 3)).toBe(null);
  });

  it('bytes que no son UTF-8 no se toman por texto', () => {
    expect(TT.aTexto(new Uint8Array([0xff, 0xfe, 0xfd]))).toBe(null);
  });
});

describe('los nombres', () => {
  it('los saca de cualquier respuesta JSON de TikTok', () => {
    // El identificador numérico no le dice nada a nadie en el mostrador.
    const n = TT.cosecharNombres({
      data: { users: [{ uid: CLIENTE, nickname: 'Juan Motos', unique_id: 'juanmotos' }] },
    });
    expect(n[CLIENTE]).toEqual({ nombre: 'Juan Motos', handle: 'juanmotos' });
  });

  it('los pega al hilo que les toca', () => {
    const nombres = { [CLIENTE]: { nombre: 'Juan Motos', handle: 'juanmotos' } };
    const r = TT.extraerHilos(respuesta(mensaje({ json: { text: 'hola' } })), { nombres });
    expect(r.hilos[0].nombre).toBe('Juan Motos');
    expect(r.hilos[0].handle).toBe('juanmotos');
  });

  it('sin nombre deja el hueco en vez de inventarlo', () => {
    const r = TT.extraerHilos(respuesta(mensaje({ json: { text: 'hola' } })));
    expect(r.hilos[0].nombre).toBe(null);
  });

  it('no confunde un objeto cualquiera con un usuario', () => {
    const n = TT.cosecharNombres({ id: 'abc', nickname: 'no es un uid' });
    expect(Object.keys(n)).toHaveLength(0);
  });
});
