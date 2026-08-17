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

export function getChannelCounts({ morosos, omniConversations } = {}) {
  const clientes = morosos?.clientes || [];
  const pendientes = (omniConversations || []).filter(esperaRespuesta);
  const enEsperaDe = (plataforma) => pendientes.filter((c) => c.platform === plataforma).length;

  return {
    [CHANNEL_TYPES.WHATSAPP]: 0,
    [CHANNEL_TYPES.INSTAGRAM]: enEsperaDe(CHANNEL_TYPES.INSTAGRAM),
    [CHANNEL_TYPES.FACEBOOK]: enEsperaDe(CHANNEL_TYPES.FACEBOOK),
    [CHANNEL_TYPES.TIKTOK]: 0,
    // La Bandeja no lleva número a propósito: no es un canal, es la vista de
    // los otros. Lo suyo ya está contado en IG y FB.
    [CHANNEL_TYPES.UNIFIED]: 0,
    [CHANNEL_TYPES.FOLLOWUPS]: clientes.filter((cliente) => (
      cliente.tiene_promesa || cliente.seg_fecha || cliente.por_reenviar
    )).length
  };
}
