import { describe, it, expect } from 'vitest';
import {
  parseJid,
  normalizarDigitosIntl,
  extraerTelefonoLegacyDataId,
  slugNombreChat,
  nombreMasUtil,
} from '../whatsapp-quote-extension/src/utils/jid.js';

describe('parseJid', () => {
  it('JID individual @c.us y @s.whatsapp.net devuelven el teléfono', () => {
    expect(parseJid('18097695965@c.us')).toEqual({ phone: '18097695965', tipo: 'individual' });
    expect(parseJid('18293364455@s.whatsapp.net')).toEqual({ phone: '18293364455', tipo: 'individual' });
  });
  it('grupos @g.us no tienen teléfono individual', () => {
    expect(parseJid('120363041234567890@g.us')).toEqual({ phone: null, tipo: 'grupo' });
    expect(parseJid('18095551234-1590000000@g.us').tipo).toBe('grupo');
  });
  it('valores raros no rompen', () => {
    expect(parseJid(null).tipo).toBe('desconocido');
    expect(parseJid('status@broadcast').tipo).toBe('desconocido');
    expect(parseJid('abc@c.us')).toEqual({ phone: null, tipo: 'desconocido' });
  });
});

describe('normalizarDigitosIntl', () => {
  it('deja solo dígitos, conservando el código de país', () => {
    expect(normalizarDigitosIntl('+1 (809) 769-5965')).toBe('18097695965');
    expect(normalizarDigitosIntl('809-769-5965')).toBe('8097695965');
    expect(normalizarDigitosIntl(null)).toBe('');
  });
});

describe('extraerTelefonoLegacyDataId', () => {
  it('saca el número de data-ids legacy true_/false_<tel>@c.us', () => {
    expect(extraerTelefonoLegacyDataId('false_18097695965@c.us_3EB0C4A1D2')).toBe('18097695965');
    expect(extraerTelefonoLegacyDataId('true_18293364455@c.us_AAA_18293364455@c.us')).toBe('18293364455');
  });
  it('acepta ids prefijados por conversación (formato del espejo)', () => {
    expect(extraerTelefonoLegacyDataId('whatsapp:name:juan:false_18095551234@c.us_XYZ')).toBe('18095551234');
  });
  it('formato nuevo (hex) y grupos devuelven null', () => {
    expect(extraerTelefonoLegacyDataId('A54AF2DDC9B33C1D16F010FCCFEDDF67')).toBe(null);
    expect(extraerTelefonoLegacyDataId('false_120363041234@g.us_AAA')).toBe(null);
    expect(extraerTelefonoLegacyDataId(null)).toBe(null);
  });
});

describe('slugNombreChat', () => {
  it('replica el name-key del espejo (lower, guiones, 40 chars)', () => {
    expect(slugNombreChat('Auto Lavado el CALVO')).toBe('auto-lavado-el-calvo');
    expect(slugNombreChat('  Isaac  Garantía Platina ')).toBe('isaac-garant-a-platina');
    expect(slugNombreChat('X'.repeat(60)).length).toBeLessThanOrEqual(40);
    expect(slugNombreChat('')).toBe('chat');
  });
});

describe('nombreMasUtil', () => {
  it('actualiza cuando el actual está vacío o es solo dígitos', () => {
    expect(nombreMasUtil('', 'Juan Pérez')).toBe(true);
    expect(nombreMasUtil('18095551234', 'Juan Pérez')).toBe(true);
    expect(nombreMasUtil(null, 'Juan')).toBe(true);
  });
  it('NO pisa un nombre bueno con dígitos o vacío', () => {
    expect(nombreMasUtil('Juan Pérez', '18095551234')).toBe(false);
    expect(nombreMasUtil('Juan Pérez', '')).toBe(false);
    expect(nombreMasUtil('Juan Pérez', 'Juan P.')).toBe(false);
  });
});
