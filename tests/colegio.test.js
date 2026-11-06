import { describe, it, expect } from 'vitest';
import { mesesDelAnio, tarifaSugerida, totalAnioCompleto } from '../src/lib/colegio.js';

describe('colegio: año escolar', () => {
  it('septiembre a junio = 10 mensualidades que cruzan el año', () => {
    const m = mesesDelAnio({ anio_inicio: 2026, mes_inicio: 9, meses: 10 });
    expect(m).toHaveLength(10);
    expect(m[0].nombre).toBe('Septiembre 2026');
    expect(m[3].nombre).toBe('Diciembre 2026');
    expect(m[4].nombre).toBe('Enero 2027');
    expect(m[9].nombre).toBe('Junio 2027');
  });

  it('un año que empieza en agosto', () => {
    const m = mesesDelAnio({ anio_inicio: 2026, mes_inicio: 8, meses: 11 });
    expect(m[0].nombre).toBe('Agosto 2026');
    expect(m.at(-1).nombre).toBe('Junio 2027');
  });
});

describe('colegio: tarifas', () => {
  const tarifas = [4500, 5000, 5500, 5900, 6150].map((monto) => ({ monto, activa: true }));

  it('la del nuevo ingreso = la última + el incremento', () => {
    expect(tarifaSugerida(tarifas, 150)).toBe(6300);
  });

  it('las desactivadas no cuentan', () => {
    expect(tarifaSugerida([...tarifas, { monto: 9000, activa: false }], 200)).toBe(6350);
    expect(tarifaSugerida([], 150)).toBeNull();
  });

  it('año completo: 5% solo sobre las mensualidades (ejemplo del colegio)', () => {
    expect(totalAnioCompleto(5000, 10, 5)).toBe(47500);
    expect(totalAnioCompleto(6150, 10, 5)).toBe(58425);
  });
});
