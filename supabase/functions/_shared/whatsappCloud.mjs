// WhatsApp oficial (Cloud API + coexistencia): convierte lo que manda Meta al
// webhook en eventos simples para el CRM. Sin red ni base de datos: se prueba
// con los ejemplos de la documentación de Meta (tests/whatsappCloud.test.js).
//
// Campos del webhook que se leen (doc "Onboard WhatsApp Business app users"):
//   messages            → lo que escribe el cliente (+ statuses de lo enviado)
//   smb_message_echoes  → lo que la empresa manda desde la APP del teléfono
//   history             → chats de los últimos 6 meses (una sola vez al conectar)
//   smb_app_state_sync  → contactos de la agenda del teléfono
//   account_update      → desconexión / reconexión de la cuenta
//
// Cada evento de mensaje sale con la misma forma, venga de donde venga:
//   { tipo:'mensaje', phoneNumberId, cliente, nombre, entrante, id, fecha,
//     clase, texto, mediaId, origen }
// `cliente` = número del cliente (wa_id) = clave de la conversación.

const ETIQUETA = {
  image: '📎 Imagen', video: '📎 Video', audio: '🎤 Audio', document: '📎 Documento',
  sticker: '📎 Sticker', location: '📍 Ubicación', contacts: '👤 Contacto',
};

// Tipos que acepta sales_messages.message_type (CHECK de la tabla).
const CLASE = { text: 'text', image: 'image', video: 'video', audio: 'audio', document: 'document', sticker: 'sticker' };

/** Fecha ISO desde el timestamp de Meta (segundos, como texto). */
export function fechaDeMeta(ts) {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

/** Texto, clase y media de un mensaje de WhatsApp (cualquier tipo). */
export function contenidoDe(m) {
  const tipo = String(m?.type || 'unknown');
  if (tipo === 'text') return { clase: 'text', texto: String(m.text?.body || '').trim(), mediaId: null };
  if (tipo === 'button') return { clase: 'text', texto: String(m.button?.text || m.button?.payload || '').trim(), mediaId: null };
  if (tipo === 'interactive') {
    const r = m.interactive?.button_reply || m.interactive?.list_reply || {};
    return { clase: 'text', texto: String(r.title || r.id || '').trim(), mediaId: null };
  }
  if (tipo === 'reaction') return { clase: 'unknown', texto: `Reaccionó ${m.reaction?.emoji || ''}`.trim(), mediaId: null };
  if (tipo === 'location') {
    const l = m.location || {};
    const donde = [l.name, l.address].filter(Boolean).join(' · ');
    return { clase: 'unknown', texto: `${ETIQUETA.location}${donde ? `: ${donde}` : ''}`, mediaId: null };
  }
  const media = m?.[tipo];
  if (media && typeof media === 'object' && (media.id || tipo in ETIQUETA)) {
    const pie = String(media.caption || media.filename || '').trim();
    return { clase: CLASE[tipo] || 'unknown', texto: pie || ETIQUETA[tipo] || '📎 Archivo', mediaId: media.id || null };
  }
  // media_placeholder (historial viejo sin archivo), unsupported, etc.
  return { clase: 'unknown', texto: ETIQUETA[tipo] || '📎 Mensaje', mediaId: null };
}

const mensaje = ({ phoneNumberId, cliente, nombre, entrante, m, origen }) => ({
  tipo: 'mensaje', phoneNumberId, cliente: String(cliente || ''), nombre: nombre || null,
  entrante, id: String(m.id || ''), fecha: fechaDeMeta(m.timestamp), origen, ...contenidoDe(m),
});

/**
 * Lee un POST del webhook y devuelve la lista de eventos.
 * Tipos: 'mensaje' | 'estado' | 'contacto' | 'historial_progreso' | 'historial_rechazado' | 'cuenta'.
 */
export function eventosDelWebhook(payload) {
  const out = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const field = change?.field;
      const v = change?.value || {};
      const phoneNumberId = v?.metadata?.phone_number_id ? String(v.metadata.phone_number_id) : null;
      const nombres = new Map((v.contacts || []).map((c) => [String(c.wa_id || ''), c.profile?.name || null]));

      if (field === 'messages') {
        for (const m of v.messages || []) {
          out.push(mensaje({ phoneNumberId, cliente: m.from, nombre: nombres.get(String(m.from)), entrante: true, m, origen: 'cliente' }));
        }
        for (const s of v.statuses || []) {
          out.push({ tipo: 'estado', phoneNumberId, id: String(s.id || ''), estado: s.status || null,
            fecha: fechaDeMeta(s.timestamp), cliente: s.recipient_id ? String(s.recipient_id) : null,
            error: s.errors?.[0]?.title || s.errors?.[0]?.message || null });
        }
      } else if (field === 'smb_message_echoes') {
        // Lo que la tienda mandó desde la app del teléfono: va como respuesta de la tienda.
        for (const m of v.message_echoes || []) {
          out.push(mensaje({ phoneNumberId, cliente: m.to, nombre: nombres.get(String(m.to)), entrante: false, m, origen: 'app' }));
        }
      } else if (field === 'history') {
        for (const h of v.history || []) {
          if (Array.isArray(h.errors) && h.errors.length) {
            out.push({ tipo: 'historial_rechazado', phoneNumberId, codigo: h.errors[0]?.code ?? null });
            continue;
          }
          const meta = h.metadata || {};
          out.push({ tipo: 'historial_progreso', phoneNumberId, fase: meta.phase ?? null, orden: meta.chunk_order ?? null, progreso: meta.progress ?? null });
          for (const t of h.threads || []) {
            const cliente = String(t.context?.wa_id || t.id || '');
            for (const m of t.messages || []) {
              // En el historial el que escribe es el cliente si `from` es su número.
              const entrante = String(m.from || '') === cliente;
              out.push(mensaje({ phoneNumberId, cliente, nombre: t.context?.username || null, entrante, m, origen: 'historial' }));
            }
          }
        }
      } else if (field === 'smb_app_state_sync') {
        for (const s of v.state_sync || []) {
          if (s.type !== 'contact') continue;
          const c = s.contact || {};
          out.push({ tipo: 'contacto', phoneNumberId, accion: s.action || 'add', numero: String(c.phone_number || ''),
            nombre: c.full_name || c.first_name || null });
        }
      } else if (field === 'account_update') {
        out.push({ tipo: 'cuenta', evento: v.event || null, wabaId: v.waba_info?.waba_id ? String(v.waba_info.waba_id) : null,
          motivo: v.disconnection_info?.reason || null, iniciadoPor: v.disconnection_info?.initiated_by || null });
      }
    }
  }
  return out;
}

/** Estado de la conexión después de un evento de cuenta (null = no cambia). */
export function estadoTrasEventoCuenta(evento) {
  if (evento === 'PARTNER_REMOVED' || evento === 'ACCOUNT_OFFBOARDED') return 'desconectado';
  if (evento === 'ACCOUNT_RECONNECTED') return 'conectado';
  return null;
}

/** Explicación para la campanita según el motivo de desconexión de Meta. */
export function avisoDesconexion(motivo) {
  return ({
    PRIMARY_INACTIVITY: 'El teléfono de WhatsApp lleva unos 14 días sin abrir la app. Ábrela y vuelve a conectar.',
    COMPANION_INACTIVITY: 'Un dispositivo vinculado estuvo inactivo mucho tiempo. Vuelve a conectar WhatsApp.',
    CHANGE_NUMBER: 'Se cambió el número de WhatsApp. Conecta el número nuevo.',
    USER_RE_REGISTERED: 'Se volvió a registrar el número en un teléfono. Vuelve a conectar WhatsApp.',
    BUSINESS_DOWNGRADE: 'El número dejó de ser WhatsApp Business. Vuelve a la app Business y conecta otra vez.',
    ACCOUNT_DISCONNECTED: 'WhatsApp se desconectó desde la app del teléfono.',
  })[motivo] || 'WhatsApp se desconectó de MotoFlow. Vuelve a conectar desde Configuración → Conexiones.';
}

// ── Envío desde MotoFlow (meta-send-queued) ─────────────────────────────

/** Clave de una conversación oficial: whatsapp:<phone_number_id>:<cliente>.
 *  Las del espejo (whatsapp:<numero> / whatsapp:name:…) devuelven null. */
export function leerClaveConversacion(clave) {
  const m = /^whatsapp:(\d{6,}):(\d{6,})$/.exec(String(clave || '').trim());
  return m ? { phoneNumberId: m[1], cliente: m[2] } : null;
}

/** Cuerpo de POST /{phone_number_id}/messages para un texto (Meta corta en 4096). */
export function cuerpoTexto(cliente, texto, responderA = null) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(cliente),
    type: 'text',
    text: { preview_url: false, body: String(texto).slice(0, 4096) },
    ...(responderA ? { context: { message_id: String(responderA) } } : {}),
  };
}

// Códigos de error de la Cloud API que quien atiende tiene que entender.
const MOTIVOS = {
  131047: 'ventana_24h_cerrada',     // pasaron 24 h desde el último mensaje del cliente
  131026: 'no_se_puede_entregar',    // número sin WhatsApp, bloqueó o versión vieja
  131030: 'numero_no_permitido',     // número de prueba sin ese destinatario
  131056: 'demasiados_seguidos',     // límite por par empresa-cliente
  130429: 'demasiados_seguidos',     // límite de mensajes por segundo
  131031: 'cuenta_bloqueada',
  131005: 'sin_permiso',
  10: 'sin_permiso',
  200: 'sin_permiso',
  190: 'permiso_vencido',            // el token de la empresa ya no sirve: reconectar
};

/** Motivo corto (para raw_data.dispatch_error) desde la respuesta de error de Meta. */
export function motivoFalloEnvio(body, status = 0) {
  const code = Number(body?.error?.code);
  if (MOTIVOS[code]) return MOTIVOS[code];
  return `meta_${code || status || 'sin_respuesta'}`;
}

/** Frase para la pantalla según el motivo. */
export function explicarFalloEnvio(motivo) {
  switch (motivo) {
    case 'ventana_24h_cerrada': return 'Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo deja escribirle con una plantilla aprobada, o contestar desde la app del teléfono.';
    case 'no_se_puede_entregar': return 'WhatsApp no lo pudo entregar: el número no tiene WhatsApp o bloqueó a la empresa.';
    case 'demasiados_seguidos': return 'Demasiados mensajes seguidos a ese cliente. Espera un momento y vuelve a enviar.';
    case 'permiso_vencido': return 'La conexión con WhatsApp venció. Ve a Perfil Empresa → Conexiones y pulsa Reconectar.';
    case 'whatsapp_desconectado': return 'El WhatsApp de la empresa está desconectado. Ve a Perfil Empresa → Conexiones.';
    case 'cuenta_bloqueada': return 'Meta bloqueó la cuenta de WhatsApp de la empresa. Revisa el administrador de WhatsApp de Meta.';
    case 'sin_permiso': return 'MotoFlow no tiene permiso para enviar por ese número. Reconecta WhatsApp en Perfil Empresa → Conexiones.';
    default: return null;
  }
}
