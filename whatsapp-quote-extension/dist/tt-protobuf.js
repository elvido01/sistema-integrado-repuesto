// MotoFlow Omni — lector del formato binario de la bandeja de TikTok.
//
// TikTok NO contesta JSON en sus mensajes. im-api-sg.tiktok.com devuelve
// protobuf crudo (arraybuffer). Se comprobó en la consola del dueño el
// 2026-08-15: no viene cifrado ni comprimido — entre 54% y 85% del cuerpo
// es texto legible a simple vista.
//
// Se puede leer sin tener el .proto porque el formato de cable de protobuf
// lleva, delante de cada campo, su NÚMERO y su TIPO. No hacen falta los
// nombres para sacar los datos: hacen falta para saber qué significan, y
// eso se resuelve por la forma de lo que hay dentro.
//
// >>> POR QUÉ ESTE ARCHIVO NO TOCA EL NAVEGADOR <<<
// Aquí no hay fetch, ni DOM, ni chrome.*. Es solo aritmética sobre bytes,
// y por eso se puede probar con datos hechos a mano:
// tests/tiktokProtobuf.test.js evalúa ESTE mismo archivo, el que se
// instala, no una copia. Lo único que no se puede probar sin TikTok
// delante es si TikTok manda lo que creemos que manda; para eso está el
// diagnóstico de tt-probe.js.
(function (raiz) {
  'use strict';

  // ── Formato de cable ────────────────────────────────────────────────
  // clave = (numero_de_campo << 3) | tipo
  //   0 varint   1 fixed64   2 largo-delimitado   5 fixed32
  // Los tipos 3 y 4 (grupos) están muertos desde proto2; si aparecen, el
  // registro se descarta entero en vez de adivinar.

  function varint(b, i, fin) {
    let x = 0n;
    let s = 0n;
    while (i < fin) {
      const c = b[i++];
      x |= BigInt(c & 0x7f) << s;
      if (!(c & 0x80)) return [x, i];
      s += 7n;
      if (s > 63n) return [0n, -1];   // varint más largo que 64 bits: basura
    }
    return [0n, -1];
  }

  // Devuelve los campos de UN mensaje, o null si los bytes no son un
  // mensaje válido. Que exija consumir hasta el último byte no es
  // exigencia de purista: es el filtro que separa un submensaje de una
  // cadena de texto que por casualidad empieza como uno.
  function leerCampos(b, ini, fin) {
    const out = [];
    let i = ini;
    while (i < fin) {
      const [clave, i1] = varint(b, i, fin);
      if (i1 === -1) return null;
      const n = Number(clave >> 3n);
      const w = Number(clave & 7n);
      if (n === 0) return null;
      i = i1;
      if (w === 0) {
        const [v, i2] = varint(b, i, fin);
        if (i2 === -1) return null;
        out.push({ n: n, w: w, v: v });
        i = i2;
      } else if (w === 2) {
        const [L, i2] = varint(b, i, fin);
        if (i2 === -1) return null;
        const largo = Number(L);
        if (!Number.isSafeInteger(largo) || largo < 0 || i2 + largo > fin) return null;
        out.push({ n: n, w: w, v: b.subarray(i2, i2 + largo) });
        i = i2 + largo;
      } else if (w === 1) {
        if (i + 8 > fin) return null;
        out.push({ n: n, w: w, v: null });
        i += 8;
      } else if (w === 5) {
        if (i + 4 > fin) return null;
        out.push({ n: n, w: w, v: null });
        i += 4;
      } else {
        return null;
      }
    }
    return out.length ? out : null;
  }

  const decodificador = typeof TextDecoder !== 'undefined'
    ? new TextDecoder('utf-8', { fatal: true })
    : null;

  // null si los bytes no son UTF-8 válido. Es la única forma barata de
  // distinguir una cadena de un puñado de bytes cualesquiera.
  function aTexto(u8) {
    if (!decodificador || !u8) return null;
    try { return decodificador.decode(u8); } catch (e) { return null; }
  }

  const PROFUNDIDAD_MAX = 14;

  // Baja por todo el árbol y avisa de cada mensaje que encuentra. Entra en
  // cualquier campo largo-delimitado que se deje leer como mensaje; los que
  // no lo son se caen solos en leerCampos.
  function recorrer(bytes, visitar, prof) {
    prof = prof || 0;
    if (prof > PROFUNDIDAD_MAX || !bytes || !bytes.length) return;
    const campos = leerCampos(bytes, 0, bytes.length);
    if (!campos) return;
    visitar(campos, prof);
    for (let k = 0; k < campos.length; k++) {
      const c = campos[k];
      if (c.w === 2 && c.v && c.v.length > 1) recorrer(c.v, visitar, prof + 1);
    }
  }

  // ── De campos sueltos a un mensaje ──────────────────────────────────

  // La llave de conversación de TikTok: "0:1:<uno>:<otro>". Los dos que
  // hablan están escritos ahí, y de eso cuelga todo lo demás.
  const CLAVE_CONV = /^\d+:\d+:\d+:\d+$/;

  // Marcas de tiempo. TikTok las manda en MICROsegundos; se aceptan
  // milisegundos por si algún endpoint usa la otra escala. Los rangos no se
  // solapan, así que no hay ambigüedad, y dejan fuera los identificadores
  // de usuario (19 cifras) que si no se confundirían con fechas.
  const esMicro = (v) => v >= 1000000000000000n && v < 20000000000000000n;
  const esMili = (v) => v >= 1000000000000n && v < 20000000000000n;

  function separar(campos) {
    const cadenas = [];
    const numeros = [];
    for (let k = 0; k < campos.length; k++) {
      const c = campos[k];
      if (c.w === 0) {
        numeros.push({ n: c.n, v: c.v });
      } else if (c.w === 2) {
        const s = aTexto(c.v);
        if (s !== null) cadenas.push({ n: c.n, s: s });
      }
    }
    return { cadenas: cadenas, numeros: numeros };
  }

  // Lo que el vendedor va a leer. Solo se nombra lo que se sabe; lo que no,
  // se anota como adjunto para que al menos conste que llegó algo.
  function leerContenido(j) {
    if (typeof j.text === 'string' && j.text.trim()) {
      return { texto: j.text, tipo: 'text', media: null };
    }
    const img = j.url
      || (j.display_image && j.display_image.url_list && j.display_image.url_list[0])
      || (j.image && j.image.url_list && j.image.url_list[0])
      || null;
    if (img) return { texto: '[Imagen]', tipo: 'image', media: String(img) };
    if (j.tos_key || j.tos_uri) return { texto: '[Imagen]', tipo: 'image', media: null };
    if (j.emoji_id || j.sticker_id) return { texto: '[Sticker]', tipo: 'text', media: null };
    if (typeof j.tips === 'string' && j.tips.trim()) {
      return { texto: j.tips, tipo: 'text', media: null };
    }
    if (j.aweme_id || j.item_id) return { texto: '[Video compartido]', tipo: 'text', media: null };
    return null;
  }

  function mensajeDe(campos) {
    const partido = separar(campos);
    const cadenas = partido.cadenas;
    const numeros = partido.numeros;

    let conv = null;
    for (let k = 0; k < cadenas.length; k++) {
      if (CLAVE_CONV.test(cadenas[k].s)) { conv = cadenas[k].s; break; }
    }
    if (!conv) return null;

    // El contenido viaja como JSON DENTRO del binario. El campo 8 es el que
    // lo trae — se comprobó en la consola — pero se busca por forma además
    // de por número: si TikTok renumera sus campos, esto sigue leyendo.
    let cont = null;
    const ordenadas = cadenas.slice().sort((a, b) => (b.n === 8 ? 1 : 0) - (a.n === 8 ? 1 : 0));
    for (let k = 0; k < ordenadas.length; k++) {
      const s = ordenadas[k].s.trim();
      if (s.charAt(0) !== '{' || s.charAt(s.length - 1) !== '}') continue;
      try {
        const j = JSON.parse(s);
        if (j && typeof j === 'object' && !Array.isArray(j)) {
          const leido = leerContenido(j);
          if (leido) { cont = leido; break; }
        }
      } catch (e) { /* no era JSON: sigue buscando */ }
    }
    if (!cont) return null;

    let ts = null;
    const fechas = numeros.filter((x) => esMicro(x.v) || esMili(x.v));
    const elegida = fechas.filter((x) => x.n === 4)[0] || fechas[0];
    if (elegida) {
      const ms = esMicro(elegida.v) ? elegida.v / 1000n : elegida.v;
      const d = new Date(Number(ms));
      ts = isNaN(d.getTime()) ? null : d.toISOString();
    }

    // Quién habló: de los dos que están en la llave, el que además aparece
    // como número en este mismo registro. No hace falta saber qué campo es.
    const trozos = conv.split(':');
    const uno = trozos[2];
    const otro = trozos[3];
    let emisor = null;
    for (let k = 0; k < numeros.length; k++) {
      const s = String(numeros[k].v);
      if (s === uno || s === otro) { emisor = s; break; }
    }

    return {
      conv: conv, emisor: emisor, ts: ts,
      texto: cont.texto, tipo: cont.tipo, media: cont.media
    };
  }

  // ── Quién soy yo ────────────────────────────────────────────────────
  // No hace falta preguntárselo a TikTok: mi identificador es el único que
  // sale en TODAS las conversaciones. Con dos hilos distintos ya se sabe.
  function deducirMiId(claves) {
    let comunes = null;
    for (let k = 0; k < claves.length; k++) {
      const t = String(claves[k]).split(':');
      const par = [t[2], t[3]];
      if (!comunes) { comunes = par.slice(); continue; }
      comunes = comunes.filter((x) => par.indexOf(x) !== -1);
    }
    return comunes && comunes.length === 1 ? comunes[0] : null;
  }

  // El campo 15 del sobre trae el usuario conectado (visto en consola). Es
  // la segunda vía, para cuando solo hay una conversación y la deducción de
  // arriba no puede decidir.
  function campoQuinceDe(campos) {
    for (let k = 0; k < campos.length; k++) {
      const c = campos[k];
      if (c.n === 15 && c.w === 0 && c.v > 100000000000000000n) return String(c.v);
    }
    return null;
  }

  // ── Identificador estable de cada mensaje ───────────────────────────
  // No se usa el id que manda TikTok porque no se sabe con certeza cuál de
  // los números del registro es. Uno derivado del contenido cumple lo único
  // que importa aquí: leer la bandeja diez veces no duplica nada.
  function huella(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  // ── De bytes a hilos listos para el espejo ──────────────────────────
  function extraerHilos(bytes, opciones) {
    opciones = opciones || {};
    if (!bytes || !bytes.length) {
      return { hilos: [], miId: opciones.miId || null, registros: 0 };
    }

    const crudos = [];
    let quince = null;
    let registros = 0;
    recorrer(bytes, function (campos, prof) {
      registros++;
      if (prof === 0 && !quince) quince = campoQuinceDe(campos);
      const m = mensajeDe(campos);
      if (m) crudos.push(m);
    });

    const vistos = Object.create(null);
    const unicos = [];
    for (let k = 0; k < crudos.length; k++) {
      const m = crudos[k];
      const clave = m.conv + '|' + (m.ts || '') + '|' + m.texto;
      if (vistos[clave]) continue;
      vistos[clave] = true;
      unicos.push(m);
    }

    const claves = [];
    for (let k = 0; k < unicos.length; k++) {
      if (claves.indexOf(unicos[k].conv) === -1) claves.push(unicos[k].conv);
    }

    const miId = opciones.miId || deducirMiId(claves) || quince || null;
    const nombres = opciones.nombres || {};

    const porHilo = Object.create(null);
    for (let k = 0; k < unicos.length; k++) {
      const m = unicos[k];
      const t = m.conv.split(':');
      // Si todavía no se sabe quién soy, el interlocutor no se puede
      // decidir: se deja el segundo del par. El espejo lo corrige solo en
      // la vuelta siguiente, cuando ya haya dos conversaciones.
      const otro = miId ? (t[2] === miId ? t[3] : t[2]) : t[3];
      if (!porHilo[m.conv]) {
        porHilo[m.conv] = {
          thread_id: m.conv,
          user_id: otro || null,
          handle: nombres[otro] ? (nombres[otro].handle || null) : null,
          nombre: nombres[otro] ? (nombres[otro].nombre || nombres[otro].handle || null) : null,
          messages: []
        };
      }
      porHilo[m.conv].messages.push({
        id: 'tt:' + m.conv + ':' + (m.ts || '') + ':' + huella(m.texto),
        de: (miId && m.emisor && m.emisor === miId) ? 'agent' : 'user',
        texto: m.texto,
        tipo: m.tipo,
        media_url: m.media,
        ts: m.ts
      });
    }

    const hilos = [];
    for (const k in porHilo) {
      const h = porHilo[k];
      h.messages.sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));
      hilos.push(h);
    }

    return { hilos: hilos, miId: miId, registros: registros };
  }

  // ── Nombres ─────────────────────────────────────────────────────────
  // Los identificadores numéricos no le dicen nada a nadie. TikTok manda
  // los nombres en sus respuestas JSON normales (perfil, sugerencias, la
  // propia bandeja), así que se van recogiendo de paso.
  function cosecharNombres(valor, destino, prof) {
    destino = destino || {};
    prof = prof || 0;
    if (!valor || typeof valor !== 'object' || prof > 8) return destino;
    if (Array.isArray(valor)) {
      for (let k = 0; k < valor.length && k < 500; k++) cosecharNombres(valor[k], destino, prof + 1);
      return destino;
    }
    const id = valor.uid || valor.user_id || valor.userId || valor.id;
    const apodo = valor.nickname || valor.nick_name || valor.nickName;
    const arroba = valor.unique_id || valor.uniqueId || valor.custom_id;
    if (id && /^\d{6,}$/.test(String(id)) && (apodo || arroba)) {
      destino[String(id)] = {
        nombre: apodo ? String(apodo) : null,
        handle: arroba ? String(arroba) : null
      };
    }
    for (const k in valor) cosecharNombres(valor[k], destino, prof + 1);
    return destino;
  }

  raiz.MFTikTok = {
    leerCampos: leerCampos,
    aTexto: aTexto,
    recorrer: recorrer,
    mensajeDe: mensajeDe,
    deducirMiId: deducirMiId,
    extraerHilos: extraerHilos,
    cosecharNombres: cosecharNombres,
    huella: huella
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
