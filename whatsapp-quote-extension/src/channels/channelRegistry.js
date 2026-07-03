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

export function getChannelCounts({ morosos, omniConversations } = {}) {
  const clientes = morosos?.clientes || [];
  const conversations = omniConversations || [];
  return {
    [CHANNEL_TYPES.WHATSAPP]: 0,
    [CHANNEL_TYPES.INSTAGRAM]: conversations.filter((conversation) => conversation.platform === CHANNEL_TYPES.INSTAGRAM).length,
    [CHANNEL_TYPES.FACEBOOK]: conversations.filter((conversation) => conversation.platform === CHANNEL_TYPES.FACEBOOK).length,
    [CHANNEL_TYPES.TIKTOK]: 0,
    [CHANNEL_TYPES.UNIFIED]: conversations.length,
    [CHANNEL_TYPES.FOLLOWUPS]: clientes.filter((cliente) => (
      cliente.tiene_promesa || cliente.seg_fecha || cliente.por_reenviar
    )).length
  };
}
