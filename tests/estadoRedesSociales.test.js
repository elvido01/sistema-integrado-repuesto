import { describe, it, expect } from 'vitest';
import { elegirCuentaPorRed, estadoCuenta, indicadoresRedes } from '@/lib/estadoRedesSociales';

// Las dos filas reales de YouTube de Repuestos Morla el 29/09/2026 (sin tokens:
// la tabla no los guarda y la pantalla no los pide).
const youtubeManual = {
  id: 'a-manual', platform: 'youtube', account_name: '@repuestos_morla', external_account_id: '@repuestos_morla',
  status: 'manual', connected_at: '2026-09-06T17:42:13Z', publicacion_habilitada: false,
  verificacion_detalle: 'Sin token guardado: la cuenta nunca se conecto por API.',
};
const youtubeOauth = {
  id: 'b-oauth', platform: 'youtube', account_name: 'repuestos_morla', external_account_id: 'UCpzCEh9wP212K8p8QP_YvFQ',
  status: 'connected', connected_at: '2026-09-29T12:30:08Z', publicacion_habilitada: false,
  verificacion_detalle: 'OAuth conectado. Publicación pendiente de pruebas y aprobación del proveedor.',
};

describe('estadoCuenta', () => {
  it('conectada pero no habilitada: pendiente, sin afirmar que puede publicar', () => {
    const e = estadoCuenta(youtubeOauth);
    expect(e.etiqueta).toBe('Conectado · publicación pendiente');
    expect(e.puede).toBe(false);
    expect(e.detalle).toMatch(/pendiente de pruebas/);
  });

  it('conectada y habilitada: puede publicar', () => {
    const e = estadoCuenta({ ...youtubeOauth, publicacion_habilitada: true });
    expect(e.etiqueta).toBe('Puede publicar');
    expect(e.puede).toBe(true);
  });

  it('registro manual: sin conectar, aunque la fila diga habilitada', () => {
    expect(estadoCuenta(youtubeManual).etiqueta).toBe('Sin conectar');
    const raro = estadoCuenta({ ...youtubeManual, publicacion_habilitada: true });
    expect(raro.etiqueta).toBe('Sin conectar');
    expect(raro.puede).toBe(false);
  });

  it('error o desconectada: requiere reconexión, con la explicación', () => {
    for (const status of ['error', 'disconnected']) {
      const e = estadoCuenta({ ...youtubeOauth, status, publicacion_habilitada: true, verificacion_detalle: 'Token vencido.' });
      expect(e.etiqueta).toBe('Requiere reconexión');
      expect(e.puede).toBe(false);
      expect(e.detalle).toBe('Token vencido.');
    }
  });

  it('sin detalle no inventa explicación', () => {
    expect(estadoCuenta({ ...youtubeOauth, verificacion_detalle: '   ' }).detalle).toBeNull();
  });
});

describe('registros duplicados', () => {
  it('YouTube real: gana la conexión OAuth sobre el manual antiguo, en cualquier orden', () => {
    expect(elegirCuentaPorRed([youtubeManual, youtubeOauth]).youtube.id).toBe('b-oauth');
    expect(elegirCuentaPorRed([youtubeOauth, youtubeManual]).youtube.id).toBe('b-oauth');
  });

  it('una sola etiqueta por red, y la de YouTube es la pendiente', () => {
    const ind = indicadoresRedes([youtubeManual, youtubeOauth,
      { id: 'fb', platform: 'facebook', status: 'connected', publicacion_habilitada: true }]);
    expect(ind.map((i) => i.platform)).toEqual(['facebook', 'youtube']);
    const yt = ind.find((i) => i.platform === 'youtube');
    expect(yt.etiqueta).toBe('Conectado · publicación pendiente');
    expect(yt.cuenta.external_account_id).toBe('UCpzCEh9wP212K8p8QP_YvFQ');
  });

  it('dos conectadas: manda la habilitada, luego la más reciente, luego el id', () => {
    const vieja = { ...youtubeOauth, id: 'x1', connected_at: '2026-01-01T00:00:00Z', publicacion_habilitada: true };
    const nueva = { ...youtubeOauth, id: 'x2', connected_at: '2026-09-01T00:00:00Z', publicacion_habilitada: false };
    expect(elegirCuentaPorRed([nueva, vieja]).youtube.id).toBe('x1');
    const a = { ...youtubeOauth, id: 'x2', publicacion_habilitada: false };
    const b = { ...youtubeOauth, id: 'x1', publicacion_habilitada: false };
    expect(elegirCuentaPorRed([a, b]).youtube.id).toBe('x1');
    expect(elegirCuentaPorRed([b, a]).youtube.id).toBe('x1');
  });

  it('una conexión rota manda sobre el manual (hay que reconectar, no "conectar")', () => {
    const rota = { ...youtubeOauth, status: 'error' };
    expect(estadoCuenta(elegirCuentaPorRed([youtubeManual, rota]).youtube).etiqueta).toBe('Requiere reconexión');
  });
});
