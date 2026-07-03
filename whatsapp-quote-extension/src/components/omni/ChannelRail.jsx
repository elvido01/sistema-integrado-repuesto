import React from 'react';
import { isChannelEnabled, OMNI_CHANNELS } from '../../channels/channelRegistry.js';

export default function ChannelRail({ activeChannel, counts, flags, onSelect }) {
  return (
    <nav className="mf-omni-rail" aria-label="Canales MotoFlow Omni">
      {OMNI_CHANNELS.map((channel) => {
        const enabled = isChannelEnabled(channel, flags);
        const count = counts?.[channel.key] || 0;
        return (
          <button
            key={channel.key}
            type="button"
            className={`${activeChannel === channel.key ? 'is-active' : ''}${enabled ? '' : ' is-disabled'}`}
            onClick={() => enabled && onSelect?.(channel.key)}
            title={enabled ? channel.label : `${channel.label} no conectado`}
            aria-label={enabled ? channel.label : `${channel.label} no conectado`}
            aria-pressed={activeChannel === channel.key}
            disabled={!enabled}
          >
            <span>{channel.shortLabel}</span>
            {count > 0 && <b>{count > 99 ? '99+' : count}</b>}
          </button>
        );
      })}
    </nav>
  );
}
