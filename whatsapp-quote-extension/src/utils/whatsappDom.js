import { parseJid, normalizarDigitosIntl, extraerTelefonoLegacyDataId, slugNombreChat } from './jid.js';

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// JID del chat activo, anunciado por jid-probe.js (corre en world MAIN y lee
// los módulos internos de WhatsApp Web). Es la ÚNICA fuente confiable del
// número cuando el contacto está guardado (el título trae el nombre).
let jidActivo = { jid: null, at: 0 };
try {
  window.addEventListener('message', (ev) => {
    const d = ev?.data;
    if (d && d.source === 'motoflow-omni' && d.type === 'active-chat-jid') {
      jidActivo = { jid: d.jid || null, at: Date.now() };
    }
  });
} catch { /* entorno sin window (tests) */ }

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function getCurrentChat() {
  const header =
    document.querySelector('#main header') ||
    document.querySelector('[data-testid="conversation-panel-header"]') ||
    document.querySelector('[data-testid="conversation-info-header"]') ||
    document.querySelector('main header');

  const titleNode =
    header?.querySelector('span[dir="auto"][title]') ||
    header?.querySelector('[data-testid="conversation-info-header-chat-title"]') ||
    header?.querySelector('span[dir="auto"]');

  const title = titleNode?.getAttribute?.('title') || titleNode?.textContent || '';

  const name = cleanText(title);
  const path = cleanText(window.location.pathname);
  const hash = cleanText(window.location.hash);
  const id = name || hash || path || 'whatsapp-web';

  return { id, name };
}

/**
 * Con quien se esta hablando en el chat abierto, sin leer los mensajes.
 *
 * >>> POR QUE EXISTE APARTE <<<
 * (2026-08-20) El boton de Sugerir preguntaba el telefono, y con un contacto
 * GUARDADO no hay telefono: el titulo es un nombre. El chat de prueba se
 * llamaba "Enrique Ismael Tvs 100 Santo DOMINGO" — tres digitos, ningun
 * numero — asi que el boton no hacia nada.
 *
 * El espejo nunca tuvo ese problema porque no identifica por telefono sino
 * por `external_conversation_id`, que cae en el nombre cuando no hay numero.
 * Esa misma regla es la que hace falta, y por eso ahora vive en un solo
 * sitio en vez de copiada.
 *
 * `rows` es opcional: solo sirve para el rescate por data-id viejo.
 */
export function identidadDelChat(nombre = null, rows = []) {
  const name = nombre != null ? nombre : getCurrentChat().name;

  let jid = null;
  let phone = '';
  const probe = (Date.now() - jidActivo.at) < 20000 ? parseJid(jidActivo.jid) : { phone: null, tipo: 'desconocido' };
  if (probe.tipo === 'grupo') return { grupo: true, jid: null, phone: '', nameKey: null, externalId: null, name };
  if (probe.tipo === 'individual') { jid = jidActivo.jid; phone = probe.phone; }
  if (!phone) {
    const digits = normalizarDigitosIntl(name);
    if (digits.length >= 7) phone = digits;
  }
  if (!phone) {
    for (const row of rows || []) {
      const t = extraerTelefonoLegacyDataId(getDataId(row));
      if (t) { phone = t; break; }
    }
  }

  const nameKey = `whatsapp:name:${slugNombreChat(name)}`;
  return {
    grupo: false,
    jid: jid || null,
    phone: phone || '',
    nameKey,
    // Exactamente lo que guarda el espejo. Es la llave con la que se
    // encuentra la conversacion, tenga telefono o no.
    externalId: phone ? `whatsapp:${phone}` : nameKey,
    name,
  };
}

// Lee la conversación de WhatsApp ABIERTA (contacto + mensajes visibles)
// para espejarla a Sales Hub. NO invasivo: solo lee lo que está en pantalla
// (no hace scroll). El dedup por data-id (external_message_id) del lado del
// servidor evita duplicar al re-leer. Solo chats individuales (@c.us);
// los grupos (@g.us) se ignoran. Devuelve null si no hay chat/mensajes.
export function readCurrentConversation({ maxMessages = 40 } = {}) {
  // diag: se manda SIEMPRE como latido, aunque no se lea nada. `probe` lleva
  // un mapa de la estructura real de WhatsApp Web para poder ajustar los
  // selectores sin devtools cuando cambie.
  const main = document.querySelector('#main');
  const diag = { mainPresent: !!main, chatOpen: false, rowsFound: 0, parsed: 0, probe: null };
  if (!main) return { diag, convo: null };
  diag.chatOpen = !!main.querySelector('[contenteditable="true"]');

  const { name } = getCurrentChat();

  // Estrategia robusta para ubicar las filas de mensaje. WhatsApp Web va
  // cambiando: probamos por role="row", luego burbujas .message-in/out, y por
  // último cualquier elemento con data-id de mensaje.
  let rows = Array.from(main.querySelectorAll('div[role="row"]'));
  if (!rows.length) {
    rows = Array.from(main.querySelectorAll('.message-in, .message-out'))
      .map((el) => el.closest('[role="row"]') || el);
  }
  if (!rows.length) {
    rows = Array.from(main.querySelectorAll('[data-id]'))
      .filter((el) => /^(true|false)_/.test(el.getAttribute('data-id') || ''));
  }

  // Sonda de diagnóstico: qué encuentra realmente cada selector.
  const allDataId = Array.from(main.querySelectorAll('[data-id]'));
  diag.probe = {
    rowRole: main.querySelectorAll('div[role="row"]').length,
    msgInOut: main.querySelectorAll('.message-in, .message-out').length,
    dataIdCount: allDataId.length,
    sampleDataIds: allDataId.slice(0, 4).map((el) => el.getAttribute('data-id')),
    selectable: main.querySelectorAll('.selectable-text').length,
    copyable: main.querySelectorAll('.copyable-text').length,
    preText: main.querySelectorAll('[data-pre-plain-text]').length,
    tickRows: main.querySelectorAll('[data-icon^="msg-"]').length, // ticks = salientes
    tailOut: main.querySelectorAll('[data-icon="tail-out"]').length,
    tailIn: main.querySelectorAll('[data-icon="tail-in"]').length,
  };

  diag.rowsFound = rows.length;
  if (!rows.length) return { diag, convo: null };

  // data-id del mensaje. WhatsApp Web NUEVO ya no usa el prefijo true_/false_
  // ni el jid: el data-id es solo el ID del mensaje (hex). Aceptamos cualquiera.
  const getDataId = (row) => {
    const self = row.getAttribute && row.getAttribute('data-id');
    if (self) return self;
    return row.querySelector('[data-id]')?.getAttribute('data-id') || null;
  };

  // Dirección (quién envió). WhatsApp nuevo no usa .message-out ni ticks
  // msg-*. Señal robusta: POSICIÓN — los mensajes que YO envío van alineados
  // a la derecha del panel. Fast-paths por clase/icono/tail si existieran.
  const mainRect = main.getBoundingClientRect();
  const getDirection = (row, dataId) => {
    if (dataId && dataId.startsWith('true_')) return 'out';
    if (dataId && dataId.startsWith('false_')) return 'in';
    if (row.querySelector('.message-out, [data-icon="tail-out"], [data-icon^="msg-"]')) return 'out';
    if (row.querySelector('.message-in, [data-icon="tail-in"]')) return 'in';
    // por posición de la burbuja de contenido
    const content = row.querySelector('[data-pre-plain-text]')
      || row.querySelector('.copyable-text')
      || row.querySelector('.selectable-text')
      || row.querySelector('span[aria-label], audio, img[src^="blob:"]')
      || row.firstElementChild || row;
    const rc = content.getBoundingClientRect ? content.getBoundingClientRect() : null;
    if (rc && rc.width > 0 && mainRect.width > 0) {
      const center = rc.left + rc.width / 2;
      return center > mainRect.left + mainRect.width * 0.5 ? 'out' : 'in';
    }
    return 'in';
  };

  // Teléfono — en orden de confiabilidad:
  //  1) JID interno del chat activo (probe world MAIN): funciona con
  //     contactos GUARDADOS, que es donde el título no trae número.
  //  2) Título del encabezado si es un número (contacto no guardado).
  //  3) data-id legacy de algún mensaje (formatos viejos de WA Web).
  // Grupos (@g.us): NO se espejan — no hay destinatario individual válido.
  const ident = identidadDelChat(name, rows);
  if (ident.grupo) {
    diag.grupo = true;
    return { diag, convo: null };
  }
  const { jid, phone, nameKey, externalId: convId } = ident;
  diag.telefono = phone || null;

  // La foto, no solo el hecho de que hubo una. Un blob: solo vale dentro de
  // esta pestaña, asi que se devuelve el <img> para que quien pueda hacerlo
  // (fotoDelChat) lo copie antes de que la fila se recicle. Ver
  // src/utils/fotoDelChat.js.
  const fotoDe = (row) => row.querySelector('img[src^="blob:"]') || null;

  const detectMedia = (row) => {
    if (row.querySelector('img[src^="blob:"]')) return 'image';
    if (row.querySelector('[data-icon="audio"], [data-icon="ptt"], [data-icon="ptt-status"], [aria-label*="voz" i]')) return 'audio';
    if (row.querySelector('video, [data-icon="media-play"]')) return 'video';
    if (row.querySelector('[data-icon="document"], [data-icon="document-refreshed"]')) return 'document';
    if (row.querySelector('[data-icon="sticker"]')) return 'sticker';
    return 'text';
  };

  // data-pre-plain-text: "[10:30 p. m., 14/7/2026] Nombre: " → intento de fecha.
  const parseTs = (pre) => {
    const m = String(pre || '').match(/\[([^\]]+)\]/);
    if (!m) return null;
    const d = new Date(m[1]);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const seen = new Set();
  const messages = [];
  for (const row of rows.slice(-maxMessages)) {
    const dataId = getDataId(row);
    if (!dataId || seen.has(dataId)) continue; // sin id o duplicado en el DOM
    const pre = row.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
    const text = cleanText(row.querySelector('.selectable-text')?.textContent || '');
    const mediaType = detectMedia(row);
    // filas de fecha/sistema ("viernes", "Llamada") no tienen texto ni media útil
    if (!text && mediaType === 'text') continue;
    seen.add(dataId);
    const msg = {
      external_message_id: `${convId}:${dataId}`,
      direction: getDirection(row, dataId),
      text,
      message_type: mediaType,
      ts: parseTs(pre),
      pre: cleanText(pre) || null,
    };
    // Se cuelga el elemento, NO se sube aqui: leer el DOM tiene que seguir
    // siendo sincrono y barato. Quien lo suba lo borra antes de mandar el
    // payload — un nodo del DOM no se puede serializar a JSON.
    if (mediaType === 'image') msg._img = fotoDe(row);
    messages.push(msg);
  }
  diag.parsed = messages.length;
  if (!messages.length) return { diag, convo: null };

  return {
    diag,
    convo: {
      external_conversation_id: convId,
      phone: phone || null,
      jid: jid || null,                 // JID crudo del proveedor (auditoría)
      name_key: nameKey,                // para migrar la conversación vieja por-nombre
      name: name || convId,
      messages,
    },
  };
}

export function openWhatsAppChatViaInternalLink(phone, text = '') {
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone) return false;

  const params = new URLSearchParams({ phone: cleanPhone });
  if (text) params.set('text', text);

  try {
    const link = document.createElement('a');
    link.href = `/send?${params.toString()}`;
    link.rel = 'noopener';
    link.style.position = 'fixed';
    link.style.left = '-9999px';
    link.style.top = '-9999px';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => link.remove(), 1000);
    return true;
  } catch {
    return false;
  }
}

function findMessageBox() {
  const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));

  return (
    editables.find((node) => node.getAttribute('data-tab') === '10') ||
    editables.find((node) => node.getAttribute('role') === 'textbox') ||
    editables[editables.length - 1] ||
    null
  );
}

// #main es el area del chat abierto. La busqueda de CHATS vive fuera de el;
// dentro de #main solo esta la busqueda de MENSAJES del chat (la que NO
// queremos tocar: abria el panel "Buscar mensajes" por error).
function isInsideMain(node) {
  return Boolean(node && node.closest && node.closest('#main'));
}

// Caja de busqueda del panel lateral (distinta a la caja de mensaje data-tab="10"
// y a la busqueda de mensajes del chat). Soporta contenteditable e <input>.
function findSearchBox() {
  const pool = Array.from(document.querySelectorAll(
    '#side [contenteditable="true"], #side input[type="text"], #side input[type="search"], [contenteditable="true"][data-tab="3"]'
  )).filter((node) => !isInsideMain(node));

  return (
    pool.find((n) => n.getAttribute('data-tab') === '3') ||
    pool.find((n) => /buscar|search/i.test(n.getAttribute('aria-label') || n.getAttribute('placeholder') || '')) ||
    pool[0] ||
    null
  );
}

// Boton/icono de la lupa del panel LATERAL unicamente (nunca la lupa del chat
// abierto, que abre "Buscar mensajes" dentro de la conversacion).
function findSearchButton() {
  const icon = document.querySelector('#side [data-icon="search"], #side [data-icon="search-refreshed"]');
  if (icon && !isInsideMain(icon)) return icon.closest('button') || icon;
  return Array.from(document.querySelectorAll('#side button'))
    .filter((btn) => !isInsideMain(btn))
    .find((btn) => /buscar|search/i.test(btn.getAttribute('aria-label') || ''));
}

async function writeIntoEditable(box, text) {
  const target = String(text);
  box.focus();

  // <input>/<textarea>: usar el setter nativo + evento input (React lo lee asi).
  if (box.tagName === 'INPUT' || box.tagName === 'TEXTAREA') {
    try {
      const proto = box.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(box, target);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(150);
      return String(box.value || '').includes(target);
    } catch {
      return false;
    }
  }

  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  await wait(80);

  // 1) insertText (funciona con el editor Lexical de WhatsApp)
  document.execCommand('insertText', false, target);
  await wait(150);
  if (cleanText(box.textContent).includes(cleanText(target))) return true;

  // 2) evento paste como respaldo (limpiando antes para no duplicar)
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  const clipboardData = new DataTransfer();
  clipboardData.setData('text/plain', target);
  box.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  await wait(200);
  return cleanText(box.textContent).length > 0;
}

function dispatchEnter(node) {
  for (const type of ['keydown', 'keypress', 'keyup']) {
    node.dispatchEvent(new KeyboardEvent(type, {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
    }));
  }
}

function clickNode(node) {
  for (const type of ['mousedown', 'mouseup', 'click']) {
    node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
}

export async function clearWhatsAppSearch() {
  const box = findSearchBox();
  if (!box) return;
  box.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  box.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true
  }));
}

// Primera fila de resultados de la busqueda, por posicion VISUAL (top). Las
// listas de WhatsApp estan virtualizadas: el orden del DOM no es el visual,
// asi que "el primer [role=listitem] del DOM" puede ser cualquier chat.
function findFirstSearchResultRow() {
  const scopes = Array.from(document.querySelectorAll('[aria-label]'))
    .filter((node) => !isInsideMain(node) && /resultado|search result/i.test(node.getAttribute('aria-label') || ''));
  const pane = document.querySelector('#pane-side');
  if (pane) scopes.push(pane);

  for (const scope of scopes) {
    const rows = Array.from(scope.querySelectorAll('[role="listitem"], [role="row"]'))
      .filter((row) => row.offsetParent !== null);
    if (rows.length) {
      rows.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      return rows[0];
    }
  }
  return null;
}

async function waitForChatChange(before, attempts = 6, stepMs = 350) {
  for (let i = 0; i < attempts; i += 1) {
    await wait(stepMs);
    const current = getCurrentChat();
    if (current.name && current.name !== before.name) return true;
  }
  return false;
}

// Abre un chat SIN recargar la pagina usando el buscador de WhatsApp Web:
// escribe la consulta (telefono o nombre), espera a que filtre y abre el
// primer resultado (Enter; si no, click directo en la fila). Devuelve
// { ok, reason } — reason indica en que paso fallo, para diagnostico.
// NOTA: pushState('/send?...') + PopStateEvent NO funciona: WhatsApp Web solo
// procesa /send al cargar la pagina, su router ignora popstate sintetico.
export async function openWhatsAppChatViaSearch(query) {
  let box = findSearchBox();

  // Si no hay caja visible, intenta activar el modo busqueda con la lupa.
  if (!box) {
    const btn = findSearchButton();
    if (btn) {
      clickNode(btn);
      await wait(400);
      box = findSearchBox();
    }
  }
  if (!box) return { ok: false, reason: 'sin_buscador' };

  const before = getCurrentChat();
  const wrote = await writeIntoEditable(box, String(query));
  if (!wrote) {
    await clearWhatsAppSearch();
    return { ok: false, reason: 'no_escribio' };
  }

  // dar tiempo a que el buscador filtre
  await wait(1000);

  // ¿El filtro sigue activo? (la caja aun contiene la consulta). Si no, las
  // filas visibles son la lista NORMAL de chats y hacer clic abriria uno
  // equivocado — en ese caso solo se permite el intento con Enter.
  const boxValue = () => {
    const b = findSearchBox();
    if (!b) return '';
    return cleanText(b.tagName === 'INPUT' || b.tagName === 'TEXTAREA' ? b.value : b.textContent);
  };
  const filterActive = () => boxValue().includes(cleanText(String(query)).slice(0, 12));

  // 1) Enter abre el mejor resultado
  dispatchEnter(findSearchBox() || box);
  if (await waitForChatChange(before)) return { ok: true };

  // 2) click directo sobre el primer resultado (solo con filtro activo)
  let row = null;
  if (filterActive()) {
    row = findFirstSearchResultRow();
    if (row) {
      clickNode(row);
      if (await waitForChatChange(before)) return { ok: true };
    }
  }

  // 3) flecha abajo + Enter (resalta el primer resultado y lo abre)
  if (filterActive()) {
    const box3 = findSearchBox() || box;
    box3.focus();
    for (const type of ['keydown', 'keyup']) {
      box3.dispatchEvent(new KeyboardEvent(type, {
        key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true
      }));
    }
    await wait(250);
    dispatchEnter(box3);
    if (await waitForChatChange(before)) return { ok: true };
  }

  await clearWhatsAppSearch();
  return { ok: false, reason: row ? 'no_abrio_resultado' : 'sin_resultados' };
}

export function getWhatsAppDraftText() {
  return cleanText(findMessageBox()?.textContent || '');
}

// Adjunta un archivo (PDF) en el chat abierto de WhatsApp Web.
// Devuelve true si encontro el chat + un input de documentos y le inyecto
// el archivo (aparece el preview para revisar y enviar). Si el chat aun no
// carga o no hay input adecuado, devuelve false (para reintentar / respaldo).
export async function attachFileToWhatsApp(file, { comoImagen = false } = {}) {
  // El footer del chat solo existe cuando hay una conversacion abierta.
  if (!findMessageBox()) return false;

  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  if (!inputs.length) return false;

  const acceptDe = (inp) => (inp.getAttribute('accept') || '').toLowerCase();

  // Preferimos el input de DOCUMENTOS (acepta cualquier archivo), no el de
  // solo imagenes/videos.
  const isDocInput = (inp) => {
    const accept = acceptDe(inp);
    if (!accept) return true;
    if (accept.includes('*')) return true;
    return !(accept.includes('image') || accept.includes('video'));
  };

  // >>> UNA FOTO NO VA POR EL INPUT DE DOCUMENTOS <<<
  // (2026-08-20) Por ahi llega como archivo adjunto: el cliente ve un icono
  // con un nombre y tiene que descargarlo para verlo. La foto del catalogo
  // se manda para que se VEA en el chat, asi que va por el input de imagenes.
  const isMediaInput = (inp) => {
    const accept = acceptDe(inp);
    return accept.includes('image') || accept.includes('video');
  };

  const input = comoImagen
    ? (inputs.find(isMediaInput) || inputs.find(isDocInput) || inputs[inputs.length - 1])
    : (inputs.find(isDocInput) || inputs[inputs.length - 1]);
  if (!input) return false;

  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } catch {
    return false;
  }

  // Espera a que aparezca el preview del adjunto (boton de enviar).
  await wait(400);
  return true;
}

export async function pasteTextIntoWhatsApp(text) {
  const box = findMessageBox();
  if (!box) return false;

  box.focus();

  const target = cleanText(text);
  const needle = target.slice(0, 25);
  const hasTarget = () => needle && cleanText(box.textContent).includes(needle);

  const initialText = cleanText(box.textContent);
  const clipboardData = new DataTransfer();
  clipboardData.setData('text/plain', text);

  box.dispatchEvent(
    new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData
    })
  );

  // Esperar mas que antes: el editor puede procesar el paste con retraso y el
  // fallback terminaba insertando el texto por SEGUNDA vez (mensaje duplicado).
  await wait(300);
  if (hasTarget() || cleanText(box.textContent) !== initialText) {
    return true;
  }

  document.execCommand('insertText', false, text);
  await wait(80);

  // Si por la carrera anterior quedo pegado DOS veces, limpiar y dejar UNA.
  const current = cleanText(box.textContent);
  const occurrences = needle ? current.split(needle).length - 1 : 0;
  if (occurrences > 1) {
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, text);
    await wait(80);
  }

  if (!cleanText(box.textContent)) {
    box.textContent = text;
    box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }

  return true;
}
