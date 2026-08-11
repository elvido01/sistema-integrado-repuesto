import React, { useEffect, useMemo, useState } from 'react';
import { getOmniConversations, getOmniMessages, sendOmniReply, updateOmniConversationStatus } from '../../services/apiClient.js';

const CHANNEL_LABELS = {
  unified: 'Bandeja integrada',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube'
};

const CHANNEL_BADGES = {
  instagram: 'IG',
  facebook: 'FB',
  youtube: 'YT',
  whatsapp: 'WA'
};

const STATUS_LABELS = {
  nuevo: 'Nuevo',
  abierta: 'Abierta',
  en_atencion: 'En atencion',
  esperando_cliente: 'Esperando cliente',
  cotizando: 'Cotizando',
  cotizacion_enviada: 'Cotizacion enviada',
  pendiente_revision: 'Revision',
  seguimiento: 'Seguimiento',
  seguimiento_futuro: 'Seguimiento',
  cerrado: 'Cerrado',
  perdido: 'Perdido'
};

const STATUS_OPTIONS = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'en_atencion', label: 'En atencion' },
  { value: 'cotizando', label: 'Cotizando' },
  { value: 'cotizacion_enviada', label: 'Cotizacion enviada' },
  { value: 'esperando_cliente', label: 'Esperando cliente' },
  { value: 'seguimiento', label: 'Seguimiento' },
  { value: 'cerrado', label: 'Cerrado' },
  { value: 'perdido', label: 'Perdido' }
];

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-DO', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function getConversationName(conversation) {
  return conversation?.customer_name
    || conversation?.cliente_nombre
    || conversation?.customer_phone
    || conversation?.customer_external_id
    || 'Cliente sin nombre';
}

function getInitial(conversation) {
  return getConversationName(conversation).trim().charAt(0).toUpperCase() || '?';
}

function getMessageBody(message) {
  return message?.message_text || (message?.media_url ? `[${message.message_type || 'media'}]` : 'Mensaje sin texto');
}

export default function OmniInbox({ channel, onQuoteConversation, onConversationsChange, onSelectedConversationChange }) {
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState('todos');
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const title = CHANNEL_LABELS[channel] || CHANNEL_LABELS.unified;

  const filterOptions = [
    { key: 'todos', label: 'Todos' },
    { key: 'no_leidos', label: 'No leidos' },
    { key: 'sin_responder', label: 'Sin responder' },
    { key: 'mios', label: 'Asignadas a mi' },
    { key: 'seguimientos', label: 'Seguimientos' }
  ];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');

    getOmniConversations({ channel, search })
      .then((rows) => {
        if (!alive) return;
        setConversations(rows || []);
        onConversationsChange?.(rows || []);
        setSelected((current) => {
          if (current && rows?.some((row) => row.id === current.id)) return current;
          return rows?.[0] || null;
        });
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || 'No se pudo cargar la bandeja integrada.');
        setConversations([]);
        setSelected(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [channel, search, refreshKey]);

  useEffect(() => {
    onSelectedConversationChange?.(selected || null);
  }, [selected?.id, selected?.status]);

  useEffect(() => () => onSelectedConversationChange?.(null), []);

  useEffect(() => {
    let alive = true;
    setMessages([]);
    if (!selected?.id) return () => { alive = false; };

    setDetailLoading(true);
    getOmniMessages(selected.id)
      .then((rows) => {
        if (alive) setMessages(rows || []);
      })
      .catch((err) => {
        if (alive) setError(err.message || 'No se pudo cargar la conversacion.');
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [selected?.id]);

  const selectedMeta = useMemo(() => {
    if (!selected) return null;
    return {
      name: getConversationName(selected),
      platform: selected.platform || 'instagram',
      status: STATUS_LABELS[selected.status] || selected.status || 'Nuevo'
    };
  }, [selected]);

  const visibleConversations = useMemo(() => {
    const hasUnread = (conversation) => Number(conversation.unread_count || conversation.unread || 0) > 0;
    const isAssignedToMe = (conversation) => Boolean(conversation.assigned_to_me || conversation.mine || conversation.assigned_to);
    const isFollowup = (conversation) => ['seguimiento', 'seguimiento_futuro', 'pendiente_revision'].includes(conversation.status);
    const needsReply = (conversation) => {
      const lastCustomer = conversation.last_customer_message_at || conversation.last_inbound_at || conversation.last_message_at;
      const lastAgent = conversation.last_agent_message_at || conversation.last_outbound_at;
      if (!lastCustomer) return false;
      if (!lastAgent) return true;
      return new Date(lastCustomer).getTime() > new Date(lastAgent).getTime();
    };

    return conversations.filter((conversation) => {
      if (listFilter === 'no_leidos') return hasUnread(conversation);
      if (listFilter === 'sin_responder') return needsReply(conversation);
      if (listFilter === 'mios') return isAssignedToMe(conversation);
      if (listFilter === 'seguimientos') return isFollowup(conversation);
      return true;
    });
  }, [conversations, listFilter]);

  function getWaitingLabel(conversation) {
    const value = conversation.last_customer_message_at || conversation.last_inbound_at || conversation.last_message_at;
    if (!value) return '';
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  function handleSelectConversation(conversation) {
    setSelected({ ...conversation, unread_count: 0, unread: 0 });
    setConversations((current) => current.map((item) => (
      item.id === conversation.id ? { ...item, unread_count: 0, unread: 0 } : item
    )));
  }

  async function handleSendReply(event) {
    event?.preventDefault?.();
    if (!selected || !replyText.trim() || sending) return;

    const text = replyText.trim();
    const tempId = `local-${selected.id}-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      conversation_id: selected.id,
      platform: selected.platform || 'instagram',
      sender_type: 'agent',
      message_type: 'text',
      message_text: text,
      status: 'sending',
      created_at: new Date().toISOString()
    };

    setSending(true);
    setError('');
    setReplyText('');
    setMessages((current) => [...current, optimisticMessage]);

    try {
      const saved = await sendOmniReply({ conversation: selected, text });
      setMessages((current) => current.map((message) => (
        message.id === tempId ? (saved || { ...optimisticMessage, status: 'queued' }) : message
      )));
      // Que no se haya enviado tiene que verse. Antes la fila entraba en la
      // bandeja y ahi se quedaba: parecia contestado sin haber salido nada.
      if (saved?.dispatch_error) {
        setError(`No salio por ${CHANNEL_LABELS[selected.platform] || selected.platform}: ${saved.dispatch_error}`);
      }
      setConversations((current) => current.map((conversation) => (
        conversation.id === selected.id
          ? {
              ...conversation,
              last_message_preview: text,
              last_agent_message_at: saved?.created_at || optimisticMessage.created_at,
              last_message_at: saved?.created_at || optimisticMessage.created_at
          }
          : conversation
      )));
      setSelected((current) => current?.id === selected.id
        ? {
            ...current,
            last_message_preview: text,
            last_agent_message_at: saved?.created_at || optimisticMessage.created_at,
            last_message_at: saved?.created_at || optimisticMessage.created_at
          }
        : current);
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setMessages((current) => current.filter((message) => message.id !== tempId));
      setReplyText(text);
      setError(err.message || 'No se pudo registrar la respuesta.');
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(nextStatus) {
    if (!selected?.id || !nextStatus || updatingStatus) return;
    const previous = selected;
    const patch = { ...selected, status: nextStatus };
    setSelected(patch);
    setConversations((current) => current.map((conversation) => (
      conversation.id === selected.id ? { ...conversation, status: nextStatus } : conversation
    )));
    setUpdatingStatus(true);
    setError('');

    try {
      const saved = await updateOmniConversationStatus({
        conversationId: selected.id,
        status: nextStatus
      });
      if (saved) {
        setSelected((current) => current?.id === saved.id ? { ...current, ...saved } : current);
        setConversations((current) => current.map((conversation) => (
          conversation.id === saved.id ? { ...conversation, ...saved } : conversation
        )));
      }
    } catch (err) {
      setSelected(previous);
      setConversations((current) => current.map((conversation) => (
        conversation.id === previous.id ? previous : conversation
      )));
      setError(err.message || 'No se pudo actualizar el estado.');
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <section className="mf-omni-inbox">
      <header className="mf-omni-inbox-head">
        <div>
          <strong>{title}</strong>
          <span>{visibleConversations.length} de {conversations.length} conversaciones</span>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          {loading ? '...' : 'Actualizar'}
        </button>
      </header>

      <div className="mf-omni-search">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar conversacion..."
        />
      </div>

      <div className="mf-omni-filters">
        {filterOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className={listFilter === option.key ? 'is-active' : ''}
            onClick={() => setListFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <p className="mf-omni-error">{error}</p>}

      <div className="mf-omni-layout">
        <div className="mf-omni-list">
          {loading && !conversations.length && <p className="mf-muted">Cargando bandeja...</p>}
          {!loading && !conversations.length && <p className="mf-muted">No hay conversaciones para este canal.</p>}
          {!loading && conversations.length > 0 && !visibleConversations.length && <p className="mf-muted">No hay conversaciones en este filtro.</p>}

          {visibleConversations.map((conversation) => {
            const active = selected?.id === conversation.id;
            const platform = conversation.platform || 'instagram';
            const unread = Number(conversation.unread_count || conversation.unread || 0);
            const waiting = getWaitingLabel(conversation);
            return (
              <button
                key={conversation.id}
                type="button"
                className={active ? 'is-active' : ''}
                onClick={() => handleSelectConversation(conversation)}
              >
                <span className="mf-omni-avatar">{getInitial(conversation)}</span>
                <span className="mf-omni-conv-main">
                  <b>{getConversationName(conversation)}</b>
                  <small>{conversation.last_message_preview || 'Sin mensajes'}</small>
                </span>
                <span className="mf-omni-conv-side">
                  <i>{CHANNEL_BADGES[platform] || platform.slice(0, 2).toUpperCase()}</i>
                  {unread > 0 && <em>{unread > 99 ? '99+' : unread}</em>}
                  <small>{formatTime(conversation.last_message_at)}</small>
                  {waiting && <small>{waiting}</small>}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mf-omni-detail">
          {!selected ? (
            <div className="mf-omni-empty">Selecciona una conversacion.</div>
          ) : (
            <>
              <header className="mf-omni-detail-head">
                <div>
                  <strong>{selectedMeta.name}</strong>
                  <span>{updatingStatus ? 'Actualizando estado...' : selectedMeta.status}</span>
                </div>
                <select
                  value={selected.status || 'nuevo'}
                  onChange={(event) => handleStatusChange(event.target.value)}
                  disabled={updatingStatus}
                  aria-label="Estado de conversacion"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <b>{CHANNEL_BADGES[selectedMeta.platform] || selectedMeta.platform.slice(0, 2).toUpperCase()}</b>
              </header>

              <div className="mf-omni-messages">
                {detailLoading && <p className="mf-muted">Cargando mensajes...</p>}
                {!detailLoading && !messages.length && <p className="mf-muted">Esta conversacion no tiene mensajes guardados.</p>}

                {messages.map((message) => {
                  const outgoing = ['agent', 'assistant', 'system'].includes(message.sender_type);
                  return (
                    <article key={message.id} className={outgoing ? 'is-outgoing' : 'is-incoming'}>
                      <p>{getMessageBody(message)}</p>
                      <small>{formatTime(message.created_at)}</small>
                    </article>
                  );
                })}
              </div>

              <form className="mf-omni-reply" onSubmit={handleSendReply}>
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder={`Responder por ${selectedMeta.platform === 'instagram' ? 'Instagram' : selectedMeta.platform === 'facebook' ? 'Facebook' : 'este canal'}...`}
                  rows="2"
                />
                <button type="submit" disabled={sending || !replyText.trim()}>
                  {sending ? 'Guardando...' : 'Responder'}
                </button>
                <button type="button" onClick={() => onQuoteConversation?.(selected)}>
                  Cotizar desde chat
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
