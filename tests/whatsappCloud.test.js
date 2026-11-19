import { describe, it, expect } from 'vitest';
import { eventosDelWebhook, contenidoDe, estadoTrasEventoCuenta, avisoDesconexion, fechaDeMeta } from '../supabase/functions/_shared/whatsappCloud.mjs';

// Ejemplos con la forma exacta de la documentación de Meta (coexistencia).
const envolver = (field, value) => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA1', changes: [{ field, value }] }] });
const meta = { display_phone_number: '18095550000', phone_number_id: 'PN1' };

describe('WhatsApp oficial: lectura del webhook', () => {
  it('mensaje del cliente con su nombre', () => {
    const ev = eventosDelWebhook(envolver('messages', {
      messaging_product: 'whatsapp', metadata: meta,
      contacts: [{ wa_id: '18291112222', profile: { name: 'Juan' } }],
      messages: [{ from: '18291112222', id: 'wamid.A', timestamp: '1763500000', type: 'text', text: { body: ' ¿Tienen banda de freno? ' } }],
    }));
    expect(ev).toEqual([{ tipo: 'mensaje', phoneNumberId: 'PN1', cliente: '18291112222', nombre: 'Juan', entrante: true,
      id: 'wamid.A', fecha: '2025-11-18T21:06:40.000Z', origen: 'cliente', clase: 'text', texto: '¿Tienen banda de freno?', mediaId: null }]);
  });

  it('nota de voz: clase audio con su media id', () => {
    const [e] = eventosDelWebhook(envolver('messages', { metadata: meta,
      messages: [{ from: '1829', id: 'wamid.B', timestamp: '1', type: 'audio', audio: { id: 'MEDIA9', voice: true } }] }));
    expect(e).toMatchObject({ clase: 'audio', texto: '🎤 Audio', mediaId: 'MEDIA9', entrante: true });
  });

  it('lo que la tienda manda desde la app del teléfono = respuesta de la tienda', () => {
    const [e] = eventosDelWebhook(envolver('smb_message_echoes', { metadata: meta,
      contacts: [{ wa_id: '18291112222' }],
      message_echoes: [{ from: '18095550000', to: '18291112222', id: 'wamid.C', timestamp: '1763500100', type: 'text', text: { body: 'Sí, RD$450' } }] }));
    expect(e).toMatchObject({ cliente: '18291112222', entrante: false, origen: 'app', texto: 'Sí, RD$450' });
  });

  it('historial: quién escribió según `from`, progreso y placeholders', () => {
    const ev = eventosDelWebhook(envolver('history', { metadata: meta,
      history: [{ metadata: { phase: 1, chunk_order: 2, progress: 40 }, threads: [{ id: '1829', context: { wa_id: '1829' }, messages: [
        { from: '1829', id: 'h1', timestamp: '10', type: 'text', text: { body: 'hola' } },
        { from: '18095550000', id: 'h2', timestamp: '11', type: 'text', text: { body: 'dígame' } },
        { from: '1829', id: 'h3', timestamp: '12', type: 'media_placeholder' },
      ] }] }] }));
    expect(ev[0]).toEqual({ tipo: 'historial_progreso', phoneNumberId: 'PN1', fase: 1, orden: 2, progreso: 40 });
    expect(ev.slice(1).map((e) => [e.id, e.entrante, e.origen])).toEqual([['h1', true, 'historial'], ['h2', false, 'historial'], ['h3', true, 'historial']]);
    expect(ev[3]).toMatchObject({ clase: 'unknown', mediaId: null });
  });

  it('historial rechazado por el cliente', () => {
    const ev = eventosDelWebhook(envolver('history', { metadata: meta, history: [{ errors: [{ code: 2593109 }] }] }));
    expect(ev).toEqual([{ tipo: 'historial_rechazado', phoneNumberId: 'PN1', codigo: 2593109 }]);
  });

  it('contactos de la agenda y estados de lo enviado', () => {
    const c = eventosDelWebhook(envolver('smb_app_state_sync', { metadata: meta,
      state_sync: [{ type: 'contact', contact: { full_name: 'Ana Pérez', phone_number: '1809' }, action: 'add' }] }));
    expect(c).toEqual([{ tipo: 'contacto', phoneNumberId: 'PN1', accion: 'add', numero: '1809', nombre: 'Ana Pérez' }]);
    const s = eventosDelWebhook(envolver('messages', { metadata: meta,
      statuses: [{ id: 'wamid.X', status: 'failed', timestamp: '5', recipient_id: '1829', errors: [{ title: 'Re-engagement message' }] }] }));
    expect(s[0]).toMatchObject({ tipo: 'estado', estado: 'failed', error: 'Re-engagement message' });
  });

  it('desconexión: evento, motivo y aviso', () => {
    const [e] = eventosDelWebhook(envolver('account_update', { event: 'PARTNER_REMOVED',
      waba_info: { waba_id: 'WABA1' }, disconnection_info: { reason: 'PRIMARY_INACTIVITY', initiated_by: 'SYSTEM' } }));
    expect(e).toEqual({ tipo: 'cuenta', evento: 'PARTNER_REMOVED', wabaId: 'WABA1', motivo: 'PRIMARY_INACTIVITY', iniciadoPor: 'SYSTEM' });
    expect(estadoTrasEventoCuenta('PARTNER_REMOVED')).toBe('desconectado');
    expect(estadoTrasEventoCuenta('ACCOUNT_RECONNECTED')).toBe('conectado');
    expect(estadoTrasEventoCuenta('OTRO')).toBeNull();
    expect(avisoDesconexion('PRIMARY_INACTIVITY')).toMatch(/14 días/);
  });

  it('otros tipos: imagen con pie, ubicación, botón, fecha inválida', () => {
    expect(contenidoDe({ type: 'image', image: { id: 'I1', caption: 'esta pieza' } })).toEqual({ clase: 'image', texto: 'esta pieza', mediaId: 'I1' });
    expect(contenidoDe({ type: 'location', location: { name: 'Higüey' } }).texto).toBe('📍 Ubicación: Higüey');
    expect(contenidoDe({ type: 'button', button: { text: 'Sí' } })).toMatchObject({ clase: 'text', texto: 'Sí' });
    expect(fechaDeMeta('x')).toBeNull();
    expect(eventosDelWebhook(null)).toEqual([]);
  });
});
