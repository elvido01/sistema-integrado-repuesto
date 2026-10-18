export const CHANNEL_TYPES = {
  WHATSAPP: 'whatsapp',
  INSTAGRAM: 'instagram',
  FACEBOOK: 'facebook',
  TIKTOK: 'tiktok',
  UNIFIED: 'unified',
  FOLLOWUPS: 'followups'
};

export const OMNI_CHANNELS = [
  { key: CHANNEL_TYPES.WHATSAPP, label: 'WhatsApp', shortLabel: 'WA', flag: 'omni_enabled' },
  { key: CHANNEL_TYPES.INSTAGRAM, label: 'Instagram', shortLabel: 'IG', flag: 'instagram_enabled' },
  { key: CHANNEL_TYPES.FACEBOOK, label: 'Facebook', shortLabel: 'FB', flag: 'facebook_enabled' },
  { key: CHANNEL_TYPES.TIKTOK, label: 'TikTok', shortLabel: 'TT', flag: 'tiktok_enabled' },
  { key: CHANNEL_TYPES.UNIFIED, label: 'Bandeja', shortLabel: 'IN', flag: 'unified_inbox_enabled' },
  { key: CHANNEL_TYPES.FOLLOWUPS, label: 'Seguimientos', shortLabel: 'SG', flag: 'omni_enabled' }
];

export function isChannelEnabled(channel, flags = {}) {
  if (channel.key === CHANNEL_TYPES.WHATSAPP) return true;
  return Boolean(flags[channel.flag]);
}

export function getInitialChannel() {
  return CHANNEL_TYPES.WHATSAPP;
}

// ── QUE SIGNIFICA EL NUMERO DE LA BARRA ─────────────────────────────
//
// (2026-08-17) Instagram enseñaba 9 y la Bandeja enseñaba 9, con las nueve
// conversaciones abiertas. Dos cosas mal:
//
//   1. Contaba TODAS las conversaciones, no las que piden algo. Un número
//      que nunca baja no avisa de nada: es parte del decorado.
//   2. La Bandeja repetía el número de Instagram, porque la Bandeja ES
//      Instagram + Facebook + TikTok. El mismo mensaje pintado dos veces
//      en la misma barra.
//
// >>> NO ES "NO LEIDAS", Y NO PUEDE SERLO <<<
// sales_conversations_view no tiene estado de lectura — ni columna, ni nada
// que la haga. Contar lecturas seria contar algo que no existe (es lo que
// hacia el filtro "No leidos": devolvia vacio siempre).
//
// Lo que si esta en los datos, y ademas es lo que importa en un mostrador,
// es quien hablo de ultimo. Si el cliente escribio y nadie le contesto, esa
// conversacion pide algo. Y baja sola al contestar, que es lo que un
// contador tiene que hacer para que alguien lo mire.
export function esperaRespuesta(conversation) {
  const delCliente = conversation?.last_user_message_at
    || conversation?.last_customer_message_at
    || conversation?.last_inbound_at;
  if (!delCliente) return false;
  const nuestro = conversation?.last_agent_message_at || conversation?.last_outbound_at;
  if (!nuestro) return true;                       // escribio y nunca se le contesto
  return new Date(delCliente).getTime() > new Date(nuestro).getTime();
}

/**
 * La ventana de 24 horas de Instagram y Messenger (18/10/2026).
 *
 * Un mensaje directo solo se puede contestar dentro de las 24 h siguientes al
 * ULTIMO mensaje directo del cliente (un comentario no cuenta: la vista lo
 * deja fuera en ultimo_dm_cliente_at). En 30 dias, 10 de 13 conversaciones
 * por privado se quedaron sin respuesta hasta cerrarse.
 *
 * null si no aplica (otro canal, o el cliente solo comento). Si no:
 *   { estado: 'abierta' | 'por_vencer' | 'cerrada', msQuedan, texto }
 * 'por_vencer' = quedan menos de 6 h.
 */
export const HORAS_VENTANA_DM = 24;
const HORAS_POR_VENCER = 6;

export function ventanaDM(conversation, ahora = Date.now()) {
  if (!['instagram', 'facebook'].includes(conversation?.platform)) return null;
  const ultimo = conversation?.ultimo_dm_cliente_at;
  if (!ultimo) return null;
  const msQuedan = new Date(ultimo).getTime() + HORAS_VENTANA_DM * 3600000 - ahora;
  if (!Number.isFinite(msQuedan)) return null;
  if (msQuedan <= 0) return { estado: 'cerrada', msQuedan, texto: 'cerrada' };
  const min = Math.floor(msQuedan / 60000);
  const texto = min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 && min < 600 ? ` ${min % 60}m` : ''}`;
  return { estado: msQuedan < HORAS_POR_VENCER * 3600000 ? 'por_vencer' : 'abierta', msQuedan, texto };
}

/**
 * ¿Hay algo aqui que todavia no se ha MIRADO?
 *
 * Distinto de esperaRespuesta a proposito. Aquello solo se apaga
 * contestando, y a un mensaje de hace un mes ya no se contesta: la bandeja
 * de TikTok llego a 86 puntos rojos permanentes, que es lo mismo que
 * ninguno — el numero deja de mirarse y el que si importa se pierde dentro.
 *
 * Esto se apaga al abrir la conversacion, y se vuelve a encender solo si
 * despues llega un mensaje mas nuevo que esa visita.
 */
export function estaSinVer(conversation) {
  const delCliente = conversation?.last_user_message_at
    || conversation?.last_customer_message_at
    || conversation?.last_inbound_at;
  if (!delCliente) return false;
  const visto = conversation?.visto_at;
  if (!visto) return true;
  return new Date(delCliente).getTime() > new Date(visto).getTime();
}

export function getChannelCounts({ morosos, omniConversations, seguimientos } = {}) {
  const clientes = morosos?.clientes || [];
  // El numero del canal cuenta lo mismo que pintan los puntos de la lista.
  // Si contara otra cosa volveria a pasar lo de Instagram: un numero que no
  // cuadra con lo que se ve es un numero que se deja de mirar.
  const pendientes = (omniConversations || []).filter(estaSinVer);
  const enEsperaDe = (plataforma) => pendientes.filter((c) => c.platform === plataforma).length;

  return {
    [CHANNEL_TYPES.WHATSAPP]: 0,
    [CHANNEL_TYPES.INSTAGRAM]: enEsperaDe(CHANNEL_TYPES.INSTAGRAM),
    [CHANNEL_TYPES.FACEBOOK]: enEsperaDe(CHANNEL_TYPES.FACEBOOK),
    [CHANNEL_TYPES.TIKTOK]: enEsperaDe(CHANNEL_TYPES.TIKTOK),
    // La Bandeja no lleva número a propósito: no es un canal, es la vista de
    // los otros. Lo suyo ya está contado en IG y FB.
    [CHANNEL_TYPES.UNIFIED]: 0,
    // SG son las dos cosas que hay que perseguir hoy, y se ven juntas al
    // pulsarlo: arriba a quien llamar por una pieza, abajo a quien cobrarle.
    // Contar solo una de las dos volveria a dejar un numero que no cuadra con
    // lo que se ve, que es como el de Instagram dejo de mirarse.
    [CHANNEL_TYPES.FOLLOWUPS]:
      clientes.filter((cliente) => (
        cliente.tiene_promesa || cliente.seg_fecha || cliente.por_reenviar
      )).length
      + (Array.isArray(seguimientos) ? seguimientos.length : 0)
  };
}
