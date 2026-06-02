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

function findMessageBox() {
  const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));

  return (
    editables.find((node) => node.getAttribute('data-tab') === '10') ||
    editables.find((node) => node.getAttribute('role') === 'textbox') ||
    editables[editables.length - 1] ||
    null
  );
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
