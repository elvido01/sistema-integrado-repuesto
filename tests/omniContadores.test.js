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
// Y de fondo: `unread_count` no existe. Lo que sí estaba en los datos era
// quién habló de último, y de ahí salió esperaRespuesta.
//
// (2026-08-19) Ahora sí hay estado de lectura: sales_conversations.visto_at,
// que se escribe al abrir la conversación. Son dos preguntas distintas y
// conviven — `esperaRespuesta` es "falta contestarle" y manda en el filtro
// "Sin responder"; `estaSinVer` es "no lo has abierto" y manda en el punto
// de la lista y en el número del canal.

import { describe, it, expect } from 'vitest';
import {
  getChannelCounts, esperaRespuesta, estaSinVer, CHANNEL_TYPES,
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

describe('cuándo una conversación está sin ver', () => {
  // (2026-08-19) El dueño mandó una captura de TikTok: 86 puntos rojos,
  // casi todos de julio. El punto significaba "escribió y no se le ha
  // contestado", así que solo se apagaba CONTESTANDO — y a un mensaje de
  // hace un mes ya no se contesta. 86 avisos permanentes son lo mismo que
  // ninguno: el número deja de mirarse y el que sí importa se pierde.
  //
  // Por eso el punto pasó a decir "no lo has abierto". Ver no es contestar,
  // y las dos cosas siguen existiendo: esperaRespuesta manda en el filtro
  // "Sin responder", estaSinVer manda en el punto y en el número del canal.

  it('escribió y nunca se abrió: sin ver', () => {
    expect(estaSinVer(conversacion({ visto_at: null }))).toBe(true);
  });

  it('se abrió después de su mensaje: visto', () => {
    expect(estaSinVer(conversacion({ last_user_message_at: AYER, visto_at: HOY }))).toBe(false);
  });

  it('se abrió, y DESPUES volvió a escribir: sin ver otra vez', () => {
    // Lo que hace que el aviso siga sirviendo: apagarlo no es apagarlo para
    // siempre, es apagarlo hasta que esa persona vuelva a hablar.
    expect(estaSinVer(conversacion({ last_user_message_at: HOY, visto_at: AYER }))).toBe(true);
  });

  it('contestada pero nunca abierta: sigue sin ver', () => {
    // Contestar ya no apaga el punto. Suena raro y es a propósito: lo que el
    // dueño mira de un vistazo es qué le falta por MIRAR. Si además quiere
    // saber qué quedó sin respuesta, eso vive en su filtro.
    expect(estaSinVer(conversacion({ last_agent_message_at: HOY, visto_at: null }))).toBe(true);
  });

  it('nunca escribió: no hay nada que ver', () => {
    expect(estaSinVer(conversacion({ last_user_message_at: null, visto_at: null }))).toBe(false);
  });

  it('con basura no revienta', () => {
    for (const v of [null, undefined, {}, 0]) expect(estaSinVer(v)).toBe(false);
  });
});

describe('el número de cada canal', () => {
  // El número cuenta LO MISMO que pintan los puntos de la lista. Si contara
  // otra cosa volvería a pasar lo de Instagram: un número que no cuadra con
  // lo que se ve es un número que se deja de mirar.
  const nueve = [
    ...Array.from({ length: 5 }, () => conversacion({ visto_at: null })),
    ...Array.from({ length: 4 }, () => conversacion({ visto_at: HOY })),
  ];

  it('cuenta las que faltan por ver, no las que hay', () => {
    const c = getChannelCounts({ omniConversations: nueve });
    expect(c[CHANNEL_TYPES.INSTAGRAM]).toBe(5);
  });

  it('la Bandeja NO repite lo que ya cuentan los canales', () => {
    // Era `conversations.length`, y por eso IG y la Bandeja enseñaban lo
    // mismo. La Bandeja es la vista de los otros, no un canal más.
    const c = getChannelCounts({ omniConversations: nueve });
    expect(c[CHANNEL_TYPES.UNIFIED]).toBe(0);
  });

  it('con todo abierto no queda ningún número', () => {
    const c = getChannelCounts({
      omniConversations: [conversacion({ visto_at: HOY }), conversacion({ visto_at: HOY })],
    });
    expect(c[CHANNEL_TYPES.INSTAGRAM]).toBe(0);
    expect(c[CHANNEL_TYPES.UNIFIED]).toBe(0);
  });

  it('abrir una baja el número en uno', () => {
    // Es el gesto entero visto desde el riel: el dueño abre una de las
    // viejas de TikTok y el 86 tiene que pasar a 85.
    const antes = [conversacion({ platform: 'tiktok', visto_at: null }),
                   conversacion({ platform: 'tiktok', visto_at: null })];
    expect(getChannelCounts({ omniConversations: antes })[CHANNEL_TYPES.TIKTOK]).toBe(2);

    const despues = [{ ...antes[0], visto_at: HOY }, antes[1]];
    expect(getChannelCounts({ omniConversations: despues })[CHANNEL_TYPES.TIKTOK]).toBe(1);
  });

  it('cada canal cuenta lo suyo', () => {
    const c = getChannelCounts({
      omniConversations: [
        conversacion({ platform: 'instagram', visto_at: null }),
        conversacion({ platform: 'facebook', visto_at: null }),
        conversacion({ platform: 'facebook', visto_at: null }),
        conversacion({ platform: 'facebook', visto_at: HOY }),
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
        conversacion({ platform: 'tiktok', visto_at: null }),
        conversacion({ platform: 'tiktok', last_user_message_at: HOY, visto_at: AYER }),
        conversacion({ platform: 'tiktok', visto_at: HOY }),
        conversacion({ platform: 'instagram', visto_at: null }),
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
