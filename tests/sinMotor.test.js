// Distinguir "el sistema falló" de "el agente se quedó sin motor".
//
// (2026-08-16) Hermes contestó "The model provider is rate-limiting requests"
// y el dueño lo leyó como un error de MotoFlow. No lo era: era su cuenta sin
// crédito. El aviso que se muestra debajo depende de acertar esta detección,
// así que un falso positivo taparía una respuesta buena con un aviso falso.

import { describe, it, expect, vi } from 'vitest';

// El módulo toca `window` al importarse.
vi.stubGlobal('window', {});
const { sinMotor } = await import('../src/components/jarvis/JarvisAdminAssistant.jsx');

describe('sinMotor', () => {
  it('reconoce lo que contestó Hermes de verdad', () => {
    expect(sinMotor('The model provider is rate-limiting requests. Please wait a moment and try again.')).toBe(true);
  });

  it('reconoce las otras formas de quedarse sin motor', () => {
    for (const t of [
      'insufficient_quota',
      'Your credit balance is too low',
      'Error 429: Too Many Requests',
      'The model is overloaded, try again',
      'La cuenta no tiene crédito',
    ]) expect(sinMotor(t), t).toBe(true);
  });

  it('no se dispara con una respuesta normal', () => {
    for (const t of [
      'Preparé la cotización para Miki: 1 agua cool heaven.',
      'No encontré esa pieza en el inventario.',
      'Listo. Cotización CT-000089 · RD$ 20',
      '', null, undefined,
    ]) expect(sinMotor(t), String(t)).toBe(false);
  });

  it('una respuesta larga no es un error, aunque nombre una cuota', () => {
    // Si el agente EXPLICA qué es una cuota, eso es una respuesta útil y
    // taparla con "cambia de agente" sería absurdo.
    const larga = 'Te explico cómo funciona la quota del proveedor: '.repeat(12);
    expect(larga.length).toBeGreaterThan(400);
    expect(sinMotor(larga)).toBe(false);
  });
});
