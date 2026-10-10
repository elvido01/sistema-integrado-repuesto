import { describe, it, expect } from 'vitest';
import { traducirErrorIA, errorIANecesitaDueno } from '@/lib/errorIA';

describe('traducirErrorIA', () => {
  it('OpenAI sin saldo (el error real del 10/10/2026 en Equipo IA)', () => {
    const real = 'OpenAI 429: { "error": { "message": "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.", "type": "insufficient_quota", "param": null, "code": "credit_balance_exhausted" } }';
    const t = traducirErrorIA(real);
    expect(t).toMatch(/SIN SALDO/);
    expect(t).toMatch(/Add credits/);
    expect(errorIANecesitaDueno(real)).toBe(true);
  });

  it('429 por velocidad no se confunde con falta de saldo', () => {
    const t = traducirErrorIA('OpenAI 429: {"error":{"code":"rate_limit_exceeded"}}');
    expect(t).toMatch(/demasiados pedidos/);
    expect(t).not.toMatch(/SIN SALDO/);
  });

  it('token de Meta vencido', () => {
    expect(traducirErrorIA('{"error":{"type":"OAuthException","code":190}}')).toMatch(/token de Meta/);
  });

  it('lo desconocido se muestra tal cual', () => {
    expect(traducirErrorIA('falta la foto del producto')).toBe('falta la foto del producto');
    expect(traducirErrorIA(null)).toBe('');
  });
});
