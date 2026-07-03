function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function getCurrentChat() {
  const header = document.querySelector('header');
  const title =
    header?.querySelector('[title]')?.getAttribute('title') ||
    header?.querySelector('span[dir="auto"]')?.textContent ||
    '';

  const name = cleanText(title);
  const path = cleanText(window.location.pathname);
  const hash = cleanText(window.location.hash);
  const id = name || hash || path || 'whatsapp-web';

  return { id, name };
}

export function openWhatsAppChatInPlace(phone, text = '') {
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone) return false;

  const params = new URLSearchParams({ phone: cleanPhone });
  if (text) params.set('text', text);

  try {
    window.history.pushState({}, '', `/send?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    return true;
  } catch {
    return false;
  }
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

  await wait(120);
  const pastedText = cleanText(box.textContent);
  if (pastedText && pastedText !== initialText) {
    return true;
  }

  document.execCommand('insertText', false, text);
  await wait(60);

  const insertedText = cleanText(box.textContent);
  if (!insertedText || insertedText === initialText) {
    box.textContent = text;
    box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }

  return true;
}
