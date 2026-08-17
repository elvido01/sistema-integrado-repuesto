// buildJarvisContext — lo único que Jarvis necesita saber para esta frase.
//
// >>> POR QUE UNA SOLA PUERTA <<<
// Antes, cada trozo de contexto se armaba donde hiciera falta: la pantalla
// en un sitio, el historial en otro, el glosario en ninguno. Al agregar la
// voz eso se vuelve inmanejable — el mismo contexto tiene que servir para
// transcribir Y para razonar, y si se arman por separado se desincronizan:
// el oído oye "Sander" mientras el cerebro cree que el cliente es otro.
//
// Aquí se arma UNA vez y se reparte:
//
//        buildJarvisContext()
//               │
//     ┌─────────┼──────────┐
//     ▼         ▼          ▼
//  pantalla  memoria   glosario
//     │         │          │
//     └────┬────┘          └──► al STT, ANTES de oír
//          ▼
//     al cerebro, para razonar
//
// >>> LO QUE NO HACE <<<
// No manda tablas, ni el catálogo, ni la conversación entera. El encargo
// era explícito y además es lo correcto: cada token de contexto se paga en
// cada pregunta, y un contexto grande no hace al modelo más listo — lo hace
// más lento y más propenso a agarrarse de lo que no toca.

import { leerContexto, leerModulos, contextoParaAgente } from '@/lib/pantallaContexto';
import { armarGlosario, terminosDeGlosario, terminosDeConversacion } from '@/lib/glosarioVoz';

// Cuántos mensajes de la charla se miran para sacar pistas. Seis es lo que
// dura una tarea normal: "busca la cotización de Sander" → … → "factúrala".
const MENSAJES_MIRADOS = 6;

/**
 * Arma el contexto completo de una interacción.
 *
 * @param {object}   opciones
 * @param {object}   opciones.perfil     profile del usuario (tenant_id, id)
 * @param {Array}    opciones.mensajes   historial en pantalla
 * @param {'texto'|'voz'} opciones.fuente
 * @returns {{pantalla: object, glosario: string, fuente: string, modulo: string|null}}
 */
export function buildJarvisContext({ perfil = null, mensajes = [], fuente = 'texto' } = {}) {
  let ctx = null;
  let modulos = [];
  try { ctx = leerContexto(); } catch { /* sin contexto se sigue igual */ }
  try { modulos = leerModulos(); } catch { /* idem */ }

  // Lo que se dijo hace un momento: de ahí salen los códigos y nombres que
  // el usuario va a volver a decir. Es la diferencia entre que el STT
  // escriba "CT-000097" o "sete cero cero cero noventa y siete".
  const recientes = terminosDeConversacion(mensajes, MENSAJES_MIRADOS * 2);

  let pantalla = null;
  try { pantalla = contextoParaAgente(modulos); } catch { pantalla = ctx; }

  return {
    pantalla,
    // El glosario solo se usa para oír. Para razonar no hace falta: el
    // cerebro ya recibe las entidades dentro de `pantalla`.
    glosario: armarGlosario(ctx, recientes),
    fuente,
    modulo: ctx?.panel || null,
    tenant_id: perfil?.tenant_id || null,
    user_id: perfil?.id || null,
  };
}

/**
 * Solo el glosario, para el momento de transcribir.
 *
 * Se expone aparte porque la transcripción ocurre ANTES de tener el texto,
 * y en ese instante no hace falta armar todo lo demás.
 */
export function glosarioDeAhora(mensajes = []) {
  try {
    return armarGlosario(leerContexto(), terminosDeConversacion(mensajes, 12));
  } catch {
    return armarGlosario(null, []);
  }
}

/**
 * Los mismos términos, pero en lista.
 *
 * El glosario en texto sirve para PEDIRLE al transcriptor que los reconozca;
 * la lista sirve para CORREGIRLO cuando no lo hizo. Salen del mismo sitio a
 * propósito: corregir contra una lista distinta de la que se le sugirió sería
 * inventar palabras que nadie mencionó.
 */
export function terminosDeAhora(mensajes = []) {
  try {
    return terminosDeGlosario(leerContexto(), terminosDeConversacion(mensajes, 12));
  } catch {
    return [];
  }
}
