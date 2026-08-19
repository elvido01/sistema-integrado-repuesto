import React, { useEffect, useMemo, useState } from 'react';
import { DIAS_EN_BANDEJA, getOmniConversations, getOmniMessages, marcarCanalVisto, marcarConversacionVista, marcarUsoSugerencia, sendOmniReply, sugerirRespuesta, updateOmniConversationStatus } from '../../services/apiClient.js';
import { esperaRespuesta, estaSinVer } from '../../channels/channelRegistry.js';

const CHANNEL_LABELS = {
  unified: 'Bandeja integrada',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube'
};

const CHANNEL_BADGES = {
  instagram: 'IG',
  facebook: 'FB',
  tiktok: 'TT',
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
  // Lo que Hermes propuso y todavia no se ha resuelto. Se guarda el TEXTO
  // original para poder comparar: si sale igual es 'usada', si sale cambiado
  // es 'editada'. Esa diferencia es el material de aprendizaje.
  const [sugerencia, setSugerencia] = useState(null);   // { texto, messageId, productos }
  const [sugiriendo, setSugiriendo] = useState(false);

  const title = CHANNEL_LABELS[channel] || CHANNEL_LABELS.unified;

  // "No leidos" estaba aqui y devolvia SIEMPRE una lista vacia: leia
  // conversation.unread_count, un campo que sales_conversations_view no
  // tiene y nunca tuvo. Un filtro que no filtra nada es peor que no
  // tenerlo — quien lo pulsa cree que no hay nada pendiente.
  const filterOptions = [
    { key: 'todos', label: 'Todos' },
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
    const isAssignedToMe = (conversation) => Boolean(conversation.assigned_to_me || conversation.mine || conversation.assigned_to);
    const isFollowup = (conversation) => ['seguimiento', 'seguimiento_futuro', 'pendiente_revision'].includes(conversation.status);

    return conversations.filter((conversation) => {
      // El mismo criterio que el número de la barra, de una sola fuente: si
      // el filtro dijera una cosa y el contador otra, no habría forma de
      // saber cuál de los dos mirar. Antes esta copia leía
      // `last_customer_message_at`, que la vista no publica, y acertaba de
      // rebote por el fallback a `last_message_at`.
      if (listFilter === 'sin_responder') return esperaRespuesta(conversation);
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

  async function handleMarcarTodoVisto() {
    const ahora = new Date().toISOString();
    // La Bandeja (unified) no es una plataforma: manda null y el servidor
    // entiende "todo lo que no es WhatsApp", que es justo lo que enseña.
    const platform = ['instagram', 'facebook', 'tiktok', 'youtube'].includes(channel) ? channel : null;
    setConversations((lista) => {
      const siguiente = lista.map((c) => (estaSinVer(c) ? { ...c, visto_at: ahora } : c));
      onConversationsChange?.(siguiente);
      return siguiente;
    });
    try {
      await marcarCanalVisto({ platform });
    } catch (err) {
      setError(err.message || 'No se pudo marcar el canal como visto.');
    }
  }

  function handleSelectConversation(conversation) {
    // Irse a otra conversacion dejando la sugerencia sin mandar cuenta como
    // descartarla. Callarselo dejaria a Hermes creyendo que aun se esta
    // pensando, cuando en realidad no sirvio.
    if (sugerencia && conversation?.id !== selected?.id) {
      if (sugerencia.messageId) {
        marcarUsoSugerencia({ messageId: sugerencia.messageId, resultado: 'descartada' }).catch(() => {});
      }
      setSugerencia(null);
      setReplyText('');
    }

    setSelected(conversation);

    // El punto se apaga AQUI, en la pantalla, sin esperar al servidor: si se
    // esperara, el aviso seguiria encendido un segundo despues de abrir la
    // conversacion y parece que el clic no hizo nada. Lo de abajo solo lo
    // deja escrito para la proxima vez que se abra la bandeja.
    if (!conversation?.id || !estaSinVer(conversation)) return;
    const ahora = new Date().toISOString();
    const marcar = (c) => (c?.id === conversation.id ? { ...c, visto_at: ahora } : c);
    setConversations((lista) => {
      const siguiente = lista.map(marcar);
      onConversationsChange?.(siguiente);   // el numero del canal baja con el punto
      return siguiente;
    });

    marcarConversacionVista({ conversationId: conversation.id }).catch(() => {
      // Que no se pueda dejar escrito no es motivo para molestar a nadie:
      // lo peor que pasa es que el punto vuelva al recargar la bandeja.
    });
  }

  async function handleSugerir() {
    if (!selected?.id || sugiriendo) return;
    setSugiriendo(true);
    setError('');
    try {
      const d = await sugerirRespuesta({ conversationId: selected.id });
      // Va DIRECTO a la caja de texto, no a un panel aparte: lo que se busca
      // es que se corrija encima, no que se copie y pegue.
      setReplyText(d.sugerencia || '');
      setSugerencia({
        texto: d.sugerencia || '',
        messageId: d.message_id || null,
        productos: Array.isArray(d.productos) ? d.productos : [],
      });
    } catch (err) {
      setError(err.message || 'Hermes no pudo redactar una respuesta.');
    } finally {
      setSugiriendo(false);
    }
  }

  // Se tira la sugerencia sin mandarla: tambien es informacion. Que Hermes
  // proponga algo que nunca se usa es lo que hay que poder ver.
  function descartarSugerencia() {
    if (sugerencia?.messageId) {
      marcarUsoSugerencia({ messageId: sugerencia.messageId, resultado: 'descartada' }).catch(() => {});
    }
    setSugerencia(null);
    setReplyText('');
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

    // >>> AQUI SE CIERRA EL BUCLE <<<
    // Se manda tal cual = 'usada'. Se toco una coma = 'editada'. Sin esta
    // comparacion Hermes propondria lo mismo para siempre sin enterarse de
    // que se le corrige, y el porcentaje de "usada sin tocar" -- el numero
    // que decide si algun dia puede contestar solo -- no existiria.
    //
    // Se hace ANTES de esperar el envio: lo que se esta juzgando es la
    // redaccion, no si la red social acepto el mensaje.
    if (sugerencia?.messageId) {
      const resultado = text === (sugerencia.texto || '').trim() ? 'usada' : 'editada';
      marcarUsoSugerencia({ messageId: sugerencia.messageId, resultado }).catch(() => {});
      setSugerencia(null);
    }

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

  const sinVerCount = conversations.filter(estaSinVer).length;

  return (
    <section className="mf-omni-inbox">
      <header className="mf-omni-inbox-head">
        <div>
          <strong>{title}</strong>
          {/* Que la ventana se DIGA. Sin esto, quien vio ayer 413 conversaciones
              y hoy ve 19 piensa que se borraron, y esa es la clase de susto que
              hace desconfiar de todo lo demas. */}
          <span>
            {visibleConversations.length} de {conversations.length} conversaciones
            {!search.trim() && ` · últimos ${DIAS_EN_BANDEJA} días`}
          </span>
        </div>
        <div className="mf-omni-head-actions">
          {/* Solo aparece si hay algo que apagar: un boton que no hace nada
              cuando se pulsa es peor que no estar. */}
          {sinVerCount > 0 && (
            <button
              type="button"
              onClick={handleMarcarTodoVisto}
              title="Apaga el punto de las que ya no vas a contestar. No cierra nada ni cambia su estado."
            >
              Marcar {sinVerCount} como visto
            </button>
          )}
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            {loading ? '...' : 'Actualizar'}
          </button>
        </div>
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
          {!loading && !conversations.length && (
            <p className="mf-muted">
              {search.trim()
                ? 'No hay conversaciones que coincidan con esa búsqueda.'
                : `Ninguna conversación en los últimos ${DIAS_EN_BANDEJA} días. Las de antes siguen ahí: búscalas por nombre o por número.`}
            </p>
          )}
          {!loading && conversations.length > 0 && !visibleConversations.length && <p className="mf-muted">No hay conversaciones en este filtro.</p>}

          {visibleConversations.map((conversation) => {
            const active = selected?.id === conversation.id;
            const platform = conversation.platform || 'instagram';
            // El punto marca lo que todavía no se ha MIRADO, no lo que falta
            // por contestar. Antes era lo segundo y solo se apagaba
            // contestando: a un mensaje de hace un mes ya no se contesta, así
            // que TikTok acumuló 86 puntos fijos y el aviso dejó de avisar.
            // "Sin responder" sigue estando, en su filtro, para quien busque
            // justo eso.
            const espera = estaSinVer(conversation);
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
                  {espera && <em title="No lo has abierto todavía">•</em>}
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

              {/* Lo que Hermes MIRO de verdad antes de escribir. Se enseña para
                  que el precio se pueda verificar de un vistazo: una sugerencia
                  que no se puede comprobar hay que reescribirla entera, y
                  entonces no ahorra nada. */}
              {sugerencia?.productos?.length > 0 && (
                <div className="mf-omni-sugerencia-fuentes">
                  <span>Hermes miró:</span>
                  {sugerencia.productos.slice(0, 4).map((p, i) => (
                    <b key={i}>
                      {p.codigo || p.descripcion}
                      {p.precio != null && ` · RD$${Number(p.precio).toLocaleString('es-DO')}`}
                      {p.existencia != null && ` · ${Number(p.existencia) > 0 ? `${p.existencia} en stock` : 'agotado'}`}
                    </b>
                  ))}
                </div>
              )}

              <form className="mf-omni-reply" onSubmit={handleSendReply}>
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder={`Responder por ${selectedMeta.platform === 'instagram' ? 'Instagram' : selectedMeta.platform === 'facebook' ? 'Facebook' : 'este canal'}...`}
                  rows="2"
                />
                <button
                  type="button"
                  onClick={handleSugerir}
                  disabled={sugiriendo || sending}
                  title="Hermes lee la conversación, consulta el inventario y redacta. No envía nada: tú decides."
                >
                  {sugiriendo ? 'Redactando...' : '✨ Sugerir'}
                </button>
                <button type="submit" disabled={sending || !replyText.trim()}>
                  {sending ? 'Guardando...' : 'Responder'}
                </button>
                {sugerencia && (
                  <button type="button" onClick={descartarSugerencia} title="Tirar la sugerencia sin mandarla">
                    Descartar
                  </button>
                )}
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
