import { describe, it, expect } from 'vitest';
import { construirResumenSan, totalesSan } from '../mobile/src/services/sanResumen';

const HOY = '2026-07-19';

// Datos reales de la pantalla del usuario
const sanes = [
  { id: 's1', nombre: 'BANCO AGRICOLA', monto_objetivo: 860000, monto_ahorrado: 141369.60, pago_diario: 2356.16, fecha_fin: '2027-07-21', dias: 365 },
  { id: 's2', nombre: 'ESPOSA VERAS', monto_objetivo: 100000, monto_ahorrado: 9999.99, pago_diario: 3333.33, fecha_fin: '2026-08-16', dias: 30 },
];
const pendientes = [
  { san_id: 's1', fecha_programada: '2026-07-18', saldo_pendiente: 2356.16 }, // atrasado
  { san_id: 's1', fecha_programada: HOY, saldo_pendiente: 2356.16 },          // hoy
  { san_id: 's2', fecha_programada: HOY, saldo_pendiente: 1000 },             // hoy, parcial
];

describe('construirResumenSan (tarjeta móvil)', () => {
  it('calcula ahorrado, restante y porcentaje de cada SAN', () => {
    const [a, b] = construirResumenSan(sanes, pendientes, HOY);
    expect(a.nombre).toBe('BANCO AGRICOLA');
    expect(a.ahorrado).toBe(141369.60);
    expect(a.restante).toBe(718630.40);
    expect(a.porcentaje).toBe(16);
    expect(b.porcentaje).toBe(10);
  });

  it('separa lo de hoy de lo atrasado', () => {
    const [a, b] = construirResumenSan(sanes, pendientes, HOY);
    expect(a.diasAtrasados).toBe(1);
    expect(a.faltaHoy).toBe(2356.16);
    expect(a.faltaAlDia).toBe(4712.32);   // atrasado + hoy
    expect(b.diasAtrasados).toBe(0);
    expect(b.faltaHoy).toBe(1000);
    expect(b.faltaAlDia).toBe(1000);
  });

  it('un SAN al día no reporta faltantes', () => {
    const [a] = construirResumenSan([sanes[0]], [], HOY);
    expect(a.diasAtrasados).toBe(0);
    expect(a.faltaHoy).toBe(0);
    expect(a.faltaAlDia).toBe(0);
  });

  it('tolera listas vacías', () => {
    expect(construirResumenSan(null, null, HOY)).toEqual([]);
  });
});

describe('totalesSan', () => {
  it('suma comprometido y ahorrado de todos', () => {
    const t = totalesSan(construirResumenSan(sanes, pendientes, HOY));
    expect(t.activos).toBe(2);
    expect(t.comprometido).toBe(960000);
    expect(t.ahorrado).toBe(151369.59);
    expect(t.porcentaje).toBe(16);
    expect(t.faltaAlDia).toBe(5712.32);
  });
  it('sin SAN devuelve ceros', () => {
    expect(totalesSan([])).toEqual({ activos: 0, comprometido: 0, ahorrado: 0, porcentaje: 0, faltaAlDia: 0 });
  });
});
