import { describe, it, expect } from 'vitest';
import { recomendaciones, franjaDe } from '@/lib/recomendacionesPromo';

const fila = (o) => ({
  bundle_id: o.id || Math.random().toString(36), producto_id: 'p', descripcion: o.d || 'PIEZA',
  publicado_at: o.at || '2026-11-10T22:00:00Z', formato: o.f || 'imagen', objetivo: o.o || 'venta',
  alcance: o.a ?? 100, uds_antes: o.ua ?? 0, uds_despues: o.ud ?? 0, ventas_despues: o.vd ?? 0,
  dias_despues: o.dd ?? 7, con_descuento: o.c ?? false,
});

describe('recomendaciones', () => {
  it('sin datos no inventa nada', () => {
    expect(recomendaciones([])).toEqual([]);
  });

  it('compara objetivos solo con 3+ por grupo y 25% de diferencia', () => {
    const filas = [
      ...[300, 320, 280].map((a) => fila({ o: 'educativo', a })),
      ...[100, 110, 90].map((a) => fila({ o: 'venta', a })),
    ];
    const r = recomendaciones(filas).find((x) => x.id === 'objetivo');
    expect(r.titulo).toContain('Educar');
    expect(r.titulo).toContain('200%');
    // con dos en un grupo no se compara
    expect(recomendaciones(filas.slice(1)).find((x) => x.id === 'objetivo')).toBeUndefined();
  });

  it('no llama "más" a una diferencia chica', () => {
    const filas = [...[100, 100, 100].map((a) => fila({ f: 'reel', a })), ...[90, 90, 90].map((a) => fila({ f: 'imagen', a }))];
    expect(recomendaciones(filas).find((x) => x.id === 'formato')).toBeUndefined();
  });

  it('propone repetir la que más vendió después, con acción', () => {
    const filas = [fila({ id: 'b1', d: 'BATERIA', ua: 1, ud: 6, vd: 6000 }), fila({ id: 'b2', d: 'GOMA', ua: 0, ud: 2 })];
    const r = recomendaciones(filas).find((x) => x.id.startsWith('repetir'));
    expect(r.titulo).toBe('Repite: BATERIA');
    expect(r.accion).toMatchObject({ tipo: 'reusar', bundle_id: 'b1' });
  });

  it('las ventas solo cuentan con 3+ días medidos', () => {
    const filas = [fila({ ua: 0, ud: 9, dd: 1 })];
    expect(recomendaciones(filas).find((x) => x.id.startsWith('repetir'))).toBeUndefined();
  });

  it('avisa cuando la mitad o más no vendió nada', () => {
    const filas = [fila({ d: 'A' }), fila({ d: 'B' }), fila({ d: 'C', ud: 3, ua: 3 })];
    const r = recomendaciones(filas).find((x) => x.id === 'sin-efecto');
    expect(r.titulo).toBe('2 de 3 promociones no vendieron ni una');
    expect(r.tono).toBe('ojo');
  });

  it('franja por hora de Santo Domingo', () => {
    expect(franjaDe('2026-11-10T13:00:00Z')).toBe('mañana'); // 9 am RD
    expect(franjaDe('2026-11-10T18:00:00Z')).toBe('tarde');  // 2 pm RD
    expect(franjaDe('2026-11-10T23:00:00Z')).toBe('noche');  // 7 pm RD
  });
});
