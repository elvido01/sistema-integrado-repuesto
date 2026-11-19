import { describe, it, expect } from 'vitest';
import { leerClaveConversacion, cuerpoTexto, motivoFalloEnvio, explicarFalloEnvio } from '../supabase/functions/_shared/whatsappCloud.mjs';

describe('WhatsApp oficial: contestar desde MotoFlow', () => {
  it('lee la clave de la conversación oficial y rechaza las del espejo', () => {
    expect(leerClaveConversacion('whatsapp:106540352242922:18095551234')).toEqual({ phoneNumberId: '106540352242922', cliente: '18095551234' });
    expect(leerClaveConversacion('whatsapp:18095551234')).toBeNull();
    expect(leerClaveConversacion('whatsapp:name:edwin-crx')).toBeNull();
    expect(leerClaveConversacion('instagram:1:2')).toBeNull();
    expect(leerClaveConversacion(null)).toBeNull();
  });
  it('arma el texto como lo pide la Cloud API', () => {
    expect(cuerpoTexto('18095551234', 'Hola')).toEqual({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '18095551234', type: 'text',
      text: { preview_url: false, body: 'Hola' },
    });
    expect(cuerpoTexto('1', 'x', 'wamid.ABC').context).toEqual({ message_id: 'wamid.ABC' });
    expect(cuerpoTexto('1', 'a'.repeat(5000)).text.body).toHaveLength(4096);
  });
  it('traduce los errores de Meta a algo que se entiende', () => {
    expect(motivoFalloEnvio({ error: { code: 131047, message: 'Re-engagement message' } })).toBe('ventana_24h_cerrada');
    expect(motivoFalloEnvio({ error: { code: 190 } })).toBe('permiso_vencido');
    expect(motivoFalloEnvio({ error: { code: 999 } }, 400)).toBe('meta_999');
    expect(motivoFalloEnvio(null, 502)).toBe('meta_502');
    expect(explicarFalloEnvio('ventana_24h_cerrada')).toMatch(/24 horas/);
    expect(explicarFalloEnvio('permiso_vencido')).toMatch(/Reconectar/);
    expect(explicarFalloEnvio('meta_999')).toBeNull();
  });
});
