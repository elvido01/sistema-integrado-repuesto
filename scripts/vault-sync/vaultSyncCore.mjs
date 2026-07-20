// Lógica pura del sincronizador del vault. Sin fs, sin Supabase: así se
// puede probar aparte, que es justo lo que hace falta cuando el error
// posible es "perdí una nota".

import { createHash } from 'node:crypto';

export const AGENTES = ['hermes', 'claude'];

// Normaliza fin de línea antes de hashear: Obsidian en Windows guarda
// CRLF y Postgres devuelve LF. Sin esto toda nota parecería modificada
// en cada arranque y se sincronizaría en círculos.
export function hashContenido(texto) {
  const normalizado = String(texto ?? '').replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalizado, 'utf8').digest('hex');
}

export function parsearNota(contenido, ruta = '') {
  const texto = String(contenido ?? '');

  const encabezado = texto.match(/^\s*#\s+(.+?)\s*$/m);
  const titulo = encabezado
    ? encabezado[1]
    : (ruta.split('/').pop() || '').replace(/\.md$/, '');

  // [[destino]] y [[destino|alias]] -> nos quedamos con el destino
  const wikilinks = [
    ...new Set([...texto.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim())),
  ];

  // #tag, pero NO los encabezados markdown (# Título) — de ahí el
  // requisito de que venga pegado a un espacio o al inicio y sin espacio
  // después del #.
  const tags = [
    ...new Set(
      [...texto.matchAll(/(?:^|\s)#([A-Za-zÁÉÍÓÚáéíóúÑñ0-9_-]+)/g)]
        .map((m) => m[1])
        .filter((t) => !/^\d+$/.test(t)),
    ),
  ];

  return { titulo, wikilinks, tags };
}

export function duenoDeRuta(ruta) {
  const partes = String(ruta || '').split('/');
  if (partes[0] === 'agentes' && AGENTES.includes(partes[1])) return partes[1];
  return 'elvido';
}

export function puedeEscribir(autor, ruta) {
  return duenoDeRuta(ruta) === autor;
}

// El corazón del asunto. `hashBase` es lo que se sincronizó la última vez;
// comparando los tres sabemos quién cambió de verdad.
//
// Principio: ante la duda, NUNCA perder texto. Preferimos dejar un
// archivo de conflicto o resucitar una nota borrada antes que
// sobrescribir en silencio.
export function decidirAccion({ hashLocal, hashRemoto, hashBase }) {
  const local = hashLocal ?? null;
  const remoto = hashRemoto ?? null;
  const base = hashBase ?? null;

  if (local === remoto) return { accion: 'nada', motivo: 'idénticos' };

  const cambioLocal = local !== base;
  const cambioRemoto = remoto !== base;

  // Solo cambió un lado -> ese manda
  if (cambioLocal && !cambioRemoto) {
    if (local === null) return { accion: 'borrar-remoto', motivo: 'borrada en disco' };
    return { accion: 'subir', motivo: 'cambió en disco' };
  }
  if (cambioRemoto && !cambioLocal) {
    if (remoto === null) return { accion: 'borrar-local', motivo: 'borrada en Supabase' };
    return { accion: 'bajar', motivo: 'cambió en Supabase' };
  }

  // Ambos cambiaron. Si uno de los dos es un borrado, gana el que tiene
  // texto: recuperar un archivo que no querías es trivial, recuperar una
  // nota que se borró sola no lo es.
  if (cambioLocal && cambioRemoto) {
    if (local === null) return { accion: 'bajar', motivo: 'borrada aquí pero editada allá; gana el texto' };
    if (remoto === null) return { accion: 'subir', motivo: 'borrada allá pero editada aquí; gana el texto' };
    return { accion: 'conflicto', motivo: 'editada en los dos lados' };
  }

  return { accion: 'nada', motivo: 'sin cambios' };
}

export function nombreConflicto(ruta, fechaISO) {
  return String(ruta).replace(/\.md$/, `.conflicto-${fechaISO}.md`);
}
