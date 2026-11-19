import { describe, it, expect } from 'vitest';
import { leerAvisoRegistro, opcionesLogin, estadoConexionTexto } from '@/lib/whatsappRegistro';

const msg = (event, data = {}) => JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event, data });

describe('Conectar WhatsApp: avisos de la ventana de Meta', () => {
  it('terminado con coexistencia (número que ya está en la app Business)', () => {
    expect(leerAvisoRegistro('https://www.facebook.com', msg('FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', { waba_id: 111, phone_number_id: '222' })))
      .toEqual({ estado: 'terminado', wabaId: '111', phoneNumberId: '222', coexistencia: true, soloCuenta: false });
  });
  it('terminado normal, cancelado y error', () => {
    expect(leerAvisoRegistro('https://web.facebook.com', msg('FINISH', { waba_id: '1', phone_number_id: '2' }))).toMatchObject({ estado: 'terminado', coexistencia: false });
    expect(leerAvisoRegistro('https://www.facebook.com', msg('CANCEL', { current_step: 'PHONE_NUMBER_SETUP' }))).toEqual({ estado: 'cancelado', paso: 'PHONE_NUMBER_SETUP' });
    expect(leerAvisoRegistro('https://www.facebook.com', msg('ERROR', { error_message: 'x' }))).toEqual({ estado: 'error', mensaje: 'x' });
  });
  it('ignora otros orígenes y otros mensajes', () => {
    expect(leerAvisoRegistro('https://facebook.com.evil.com', msg('FINISH', { waba_id: '1' }))).toBeNull();
    expect(leerAvisoRegistro('https://www.facebook.com', '{"type":"otra"}')).toBeNull();
    expect(leerAvisoRegistro('https://www.facebook.com', 'no json')).toBeNull();
    expect(leerAvisoRegistro('nada', msg('FINISH'))).toBeNull();
  });
  it('FB.login pide código con coexistencia', () => {
    expect(opcionesLogin('CFG')).toEqual({ config_id: 'CFG', response_type: 'code', override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' } });
  });
  it('texto del estado', () => {
    expect(estadoConexionTexto(null).texto).toBe('Sin conectar');
    expect(estadoConexionTexto({ estado: 'conectado' }).tono).toBe('verde');
    expect(estadoConexionTexto({ estado: 'desconectado' }).tono).toBe('rojo');
  });
});
