function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

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
  };

  diag.rowsFound = rows.length;
  if (!rows.length) return { diag, convo: null };

  // data-id de una fila: puede estar en la fila o en un hijo. Solo mensajes
  // (prefijo true_/false_).
  const getDataId = (row) => {
    const self = row.getAttribute && row.getAttribute('data-id');
    if (self && /^(true|false)_/.test(self)) return self;
    const child = row.querySelector('[data-id]');
    const cid = child?.getAttribute('data-id') || '';
    return /^(true|false)_/.test(cid) ? cid : null;
  };

  // Teléfono desde cualquier data-id individual: `_<digitos>@c.us_`.
  let phone = '';
  for (const row of rows) {
    const id = getDataId(row);
    const m = id && id.match(/_(\d+)@c\.us_/);
    if (m) { phone = m[1]; break; }
  }
  if (!phone) return { diag, convo: null }; // grupo, o no pude extraer el número

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

  const messages = [];
  for (const row of rows.slice(-maxMessages)) {
    const dataId = getDataId(row);
    if (!dataId) continue; // filas de fecha/sistema no tienen data-id de mensaje
    const direction = dataId.startsWith('true_') ? 'out'
      : dataId.startsWith('false_') ? 'in'
      : (row.querySelector('.message-out') ? 'out' : 'in');
    const pre = row.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
    const text = cleanText(row.querySelector('.selectable-text')?.textContent || '');
    const mediaType = detectMedia(row);
    if (!text && mediaType === 'text') continue; // fila sin contenido útil
    messages.push({
      external_message_id: dataId,
      direction,
      text,
      message_type: mediaType,
      ts: parseTs(pre),
      pre: cleanText(pre) || null,
    });
  }
  diag.parsed = messages.length;
  if (!messages.length) return { diag, convo: null };

  return {
    diag,
    convo: {
      external_conversation_id: `whatsapp:${phone}`,
      phone,
      name: name || phone,
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
export async function attachFileToWhatsApp(file) {
  // El footer del chat solo existe cuando hay una conversacion abierta.
  if (!findMessageBox()) return false;

  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  if (!inputs.length) return false;

  // Preferimos el input de DOCUMENTOS (acepta cualquier archivo), no el de
  // solo imagenes/videos.
  const isDocInput = (inp) => {
    const accept = (inp.getAttribute('accept') || '').toLowerCase();
    if (!accept) return true;
    if (accept.includes('*')) return true;
    return !(accept.includes('image') || accept.includes('video'));
  };

  const input = inputs.find(isDocInput) || inputs[inputs.length - 1];
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
