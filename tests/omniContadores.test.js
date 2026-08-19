// El número que se ve en la barra de canales de la extensión Omni.
//
// (2026-08-17) El dueño mandó una captura: Instagram con un 9 y la Bandeja
// con otro 9, teniendo las nueve conversaciones abiertas. Dos fallos en el
// mismo sitio:
//
//   1. Contaba TODAS las conversaciones, no las que piden algo. Un número
//      que nunca baja deja de mirarse.
//   2. La Bandeja repetía el número de Instagram, porque la Bandeja ES
//      Instagram + Facebook + TikTok.
//
// Y de fondo: `unread_count` no existe. sales_conversations_view no tiene
// estado de lectura, así que el filtro "No leídos" devolvía vacío siempre.
// Lo que sí está en los datos es quién habló de último.

import { describe, it, expect } from 'vitest';
import {
  getChannelCounts, esperaRespuesta, CHANNEL_TYPES,
} from '../whatsapp-quote-extension/src/channels/channelRegistry.js';

const AYER = '2026-08-16T10:00:00Z';
const HOY = '2026-08-17T10:00:00Z';

const conversacion = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  platform: 'instagram',
  last_user_message_at: AYER,
  last_agent_message_at: HOY,
  ...over,
});

describe('cuándo una conversación pide algo', () => {
  it('el cliente escribió lo último: espera', () => {
    expect(esperaRespuesta(conversacion({ last_user_message_at: HOY, last_agent_message_at: AYER }))).toBe(true);
  });

  it('nunca se le contestó: espera', () => {
    // Es el caso caro: hay cinco así en producción, la más vieja de enero.
    expect(esperaRespuesta(conversacion({ last_agent_message_at: null }))).toBe(true);
  });

  it('contestamos después: no espera', () => {
    expect(esperaRespuesta(conversacion())).toBe(false);
  });

  it('nunca escribió: no espera', () => {
    // Sin mensaje del cliente no hay nada que contestar.
    expect(esperaRespuesta(conversacion({ last_user_message_at: null, last_agent_message_at: null }))).toBe(false);
  });

  it('acepta los nombres viejos de los campos', () => {
    // La vista publica last_user_message_at; el código traía escritos
    // last_customer_message_at y last_inbound_at, que no existen. Se aceptan
    // los tres para no romper si algún día llega por otro camino.
    expect(esperaRespuesta({ last_customer_message_at: HOY, last_agent_message_at: AYER })).toBe(true);
    expect(esperaRespuesta({ last_inbound_at: HOY, last_outbound_at: AYER })).toBe(true);
  });

  it('con basura no revienta', () => {
    for (const v of [null, undefined, {}, 0]) expect(esperaRespuesta(v)).toBe(false);
  });
});

describe('el número de cada canal', () => {
  const nueve = [
    ...Array.from({ length: 5 }, () => conversacion({ last_agent_message_at: null })),
    ...Array.from({ length: 4 }, () => conversacion()),
  ];

  it('cuenta las que esperan, no las que hay', () => {
    // El caso exacto de la captura: 9 conversaciones, 5 sin contestar.
    const c = getChannelCounts({ omniConversations: nueve });
    expect(c[CHANNEL_TYPES.INSTAGRAM]).toBe(5);
  });

  it('la Bandeja NO repite lo que ya cuentan los canales', () => {
    // Era `conversations.length`, y por eso IG y la Bandeja enseñaban lo
    // mismo. La Bandeja es la vista de los otros, no un canal más.
    const c = getChannelCounts({ omniConversations: nueve });
    expect(c[CHANNEL_TYPES.UNIFIED]).toBe(0);
  });

  it('con todo contestado no queda ningún número', () => {
    // Es lo que el dueño esperaba ver y no veía.
    const c = getChannelCounts({ omniConversations: [conversacion(), conversacion()] });
    expect(c[CHANNEL_TYPES.INSTAGRAM]).toBe(0);
    expect(c[CHANNEL_TYPES.UNIFIED]).toBe(0);
  });

  it('cada canal cuenta lo suyo', () => {
    const c = getChannelCounts({
      omniConversations: [
        conversacion({ platform: 'instagram', last_agent_message_at: null }),
        conversacion({ platform: 'facebook', last_agent_message_at: null }),
        conversacion({ platform: 'facebook', last_agent_message_at: null }),
        conversacion({ platform: 'facebook' }),
      ],
    });
    expect(c[CHANNEL_TYPES.INSTAGRAM]).toBe(1);
    expect(c[CHANNEL_TYPES.FACEBOOK]).toBe(2);
  });

  it('TikTok cuenta igual que los demás', () => {
    // (2026-08-19) TT estaba clavado en 0: la pestaña existía en la barra
    // desde el principio pero nunca hubo nada detrás. Ahora hay espejo.
    const c = getChannelCounts({
      omniConversations: [
        conversacion({ platform: 'tiktok', last_agent_message_at: null }),
        conversacion({ platform: 'tiktok', last_user_message_at: HOY, last_agent_message_at: AYER }),
        conversacion({ platform: 'tiktok' }),
        conversacion({ platform: 'instagram', last_agent_message_at: null }),
      ],
    });
    expect(c[CHANNEL_TYPES.TIKTOK]).toBe(2);
    expect(c[CHANNEL_TYPES.INSTAGRAM]).toBe(1);
    expect(c[CHANNEL_TYPES.UNIFIED]).toBe(0);
  });

  it('sin datos devuelve ceros y no explota', () => {
    const c = getChannelCounts();
    expect(c[CHANNEL_TYPES.INSTAGRAM]).toBe(0);
    expect(c[CHANNEL_TYPES.FOLLOWUPS]).toBe(0);
  });

  it('los seguimientos siguen contando lo suyo', () => {
    // Ese sí es un conjunto distinto: sale de morosos, no de la bandeja.
    const c = getChannelCounts({
      morosos: { clientes: [{ tiene_promesa: true }, { seg_fecha: '2026-08-20' }, {}] },
      omniConversations: [],
    });
    expect(c[CHANNEL_TYPES.FOLLOWUPS]).toBe(2);
  });
});

// (2026-08-19) El SG del riel contaba solo cobranza. Ahora tambien los
// seguimientos de venta, porque al pulsarlo se ven las dos cosas: arriba a
// quien llamar por una pieza, abajo a quien cobrarle. Un numero que no cuadra
// con lo que se ve deja de mirarse -- es lo que le paso al de Instagram.
describe('el numero de Seguimientos', () => {
  const conMorosos = { clientes: [{ tiene_promesa: true }, { seg_fecha: '2026-08-20' }, {}] };

  it('suma la cobranza y los seguimientos de venta', () => {
    const c = getChannelCounts({
      morosos: conMorosos,
      seguimientos: [{ id: 'a' }, { id: 'b' }],
    });
    expect(c[CHANNEL_TYPES.FOLLOWUPS]).toBe(4);   // 2 de cobranza + 2 de venta
  });

  it('sin seguimientos sigue contando solo la cobranza', () => {
    // La firma cambio; lo viejo tiene que seguir funcionando igual.
    expect(getChannelCounts({ morosos: conMorosos })[CHANNEL_TYPES.FOLLOWUPS]).toBe(2);
  });

  it('con basura en seguimientos no revienta ni inventa', () => {
    for (const v of [null, undefined, 'dos', {}, 7]) {
      expect(getChannelCounts({ morosos: conMorosos, seguimientos: v })[CHANNEL_TYPES.FOLLOWUPS],
             String(v)).toBe(2);
    }
  });

  it('solo seguimientos, sin cobranza', () => {
    expect(getChannelCounts({ seguimientos: [{ id: 'a' }] })[CHANNEL_TYPES.FOLLOWUPS]).toBe(1);
  });
});
