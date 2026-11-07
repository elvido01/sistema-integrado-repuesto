import { describe, it, expect } from 'vitest';
import {
  mesesDelAnio, tarifaSugerida, totalAnioCompleto, edadDe, tarifaParaNuevo,
  fechaDeExcel, leerPlantillaEstudiantes, COLUMNAS_PLANTILLA, diasAtraso, tramoAntiguedad,
} from '../src/lib/colegio.js';

describe('colegio: estudiantes', () => {
  const tarifas = [
    { id: 't45', monto: 4500, activa: true }, { id: 't59', monto: 5900, activa: true },
    { id: 't61', monto: 6150, activa: true }, { id: 'tv', monto: 9999, activa: false },
  ];

  it('edad cumplida', () => {
    expect(edadDe('2018-11-07', '2026-11-06')).toBe(7);
    expect(edadDe('2018-11-06', '2026-11-06')).toBe(8);
    expect(edadDe(null)).toBeNull();
  });

  it('nuevo sin hermanos: la tarifa activa más alta (la del nuevo ingreso)', () => {
    expect(tarifaParaNuevo(tarifas, [])).toMatchObject({ monto: 6150, tarifa_id: 't61', porHermano: false });
  });

  it('nuevo con hermano en el colegio: hereda la del hermano (la más baja si son varios)', () => {
    const r = tarifaParaNuevo(tarifas, [
      { nombres: 'Pedro', tarifa_mensual: 5900, tarifa_id: 't59' },
      { nombres: 'Ana', tarifa_mensual: 4500, tarifa_id: 't45' },
    ]);
    expect(r).toMatchObject({ monto: 4500, tarifa_id: 't45', porHermano: true });
    expect(r.nota).toContain('Ana');
  });

  it('fechas de Excel: serie y dd/mm/aaaa', () => {
    expect(fechaDeExcel(43922)).toBe('2020-04-01');
    expect(fechaDeExcel('5/3/2019')).toBe('2019-03-05');
    expect(fechaDeExcel('31/02/2019')).toBeNull();
    expect(fechaDeExcel('')).toBeNull();
  });

  it('plantilla: agrupa hermanos por familia y reporta errores por fila', () => {
    const cursos = [
      { id: 'c3', nombre: '3ro de Primaria', tandas: ['matutina', 'vespertina'] },
      { id: 's1', nombre: '1ro de Secundaria', tandas: ['matutina'] },
    ];
    const fila = (o) => COLUMNAS_PLANTILLA.map((k) => o[k] ?? '');
    const filas = [
      COLUMNAS_PLANTILLA,
      fila({ 'Familia (apellidos)': 'Pérez Santana', Nombres: 'María', Apellidos: 'Pérez Santana', Curso: '3ro de primaria', Tanda: 'Matutina', Mensualidad: '5,900', 'Madre': 'Ana Santana', 'Sala de Tareas (si/no)': 'Sí' }),
      fila({ 'Familia (apellidos)': 'perez santana', Nombres: 'José', Apellidos: 'Pérez Santana', Curso: '1ro de Secundaria', Mensualidad: 5900, 'Beca %': 50 }),
      fila({ Nombres: 'Luis', Apellidos: 'Gómez', Curso: '1ro de Secundaria', Tanda: 'vespertina', Mensualidad: 6150 }),
      fila({ Nombres: 'Sin', Apellidos: 'Curso', Curso: 'Noveno', Mensualidad: 6150 }),
      fila({}),
    ];
    const { familias, errores } = leerPlantillaEstudiantes(filas, cursos);
    expect(familias.size).toBe(1);
    const fam = [...familias.values()][0];
    expect(fam.datos.madre_nombre).toBe('Ana Santana');
    expect(fam.estudiantes.map((e) => e.nombres)).toEqual(['María', 'José']);
    expect(fam.estudiantes[0]).toMatchObject({ tarifa_mensual: 5900, sala_tareas: true, tanda: 'matutina', curso_id: 'c3' });
    expect(fam.estudiantes[1]).toMatchObject({ beca_pct: 50, tanda: 'matutina' });
    expect(errores.map((e) => e.fila)).toEqual([4, 5]);
    expect(errores[0].motivo).toContain('vespertina');
  });
});

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

describe('colegio: antigüedad de saldos', () => {
  it('cuenta los días desde el día límite', () => {
    expect(diasAtraso('2026-09-05', '2026-11-06')).toBe(62);
    expect(diasAtraso('2026-11-05', '2026-11-06')).toBe(1);
    expect(diasAtraso('2026-12-05', '2026-11-06')).toBeLessThan(0);
  });

  it('tramos 30 / 60 como pidió el colegio', () => {
    expect(tramoAntiguedad(0)).toBe('por_vencer');
    expect(tramoAntiguedad(-10)).toBe('por_vencer');
    expect(tramoAntiguedad(1)).toBe('d30');
    expect(tramoAntiguedad(30)).toBe('d30');
    expect(tramoAntiguedad(31)).toBe('d60');
    expect(tramoAntiguedad(60)).toBe('d60');
    expect(tramoAntiguedad(61)).toBe('d60mas');
  });
});

import { finalCompetencia, finalArea, notaValida } from '../src/lib/colegio.js';

describe('colegio: notas del boletín', () => {
  const llenas = { '1-1': 90, '1-2': 85, '1-3': 88, '1-4': 91, '2-1': 83, '2-2': 80, '2-3': 79, '2-4': 84, '3-1': 81, '3-2': 77, '3-3': 90, '3-4': 86 };
  it('C1-C3 = promedio de los 4 períodos, redondeado', () => {
    expect(finalCompetencia(llenas, 1)).toBe(89);   // 88.5 → 89
    expect(finalCompetencia(llenas, 2)).toBe(82);   // 81.5 → 82
    expect(finalCompetencia(llenas, 3)).toBe(84);   // 83.5 → 84
  });
  it('final del área = promedio de C1-C3', () => {
    expect(finalArea(llenas)).toBe(85);             // (89+82+84)/3 = 85
  });
  it('con períodos vacíos no calcula (como el boletín de papel)', () => {
    expect(finalCompetencia({ '1-1': 90 }, 1)).toBeNull();
    expect(finalArea({ ...llenas, '3-4': undefined })).toBeNull();
  });
  it('valida lo tecleado', () => {
    expect(notaValida('')).toEqual({ ok: true, valor: null });
    expect(notaValida('85')).toEqual({ ok: true, valor: 85 });
    expect(notaValida('87,5')).toEqual({ ok: true, valor: 87.5 });
    expect(notaValida('101').ok).toBe(false);
    expect(notaValida('abc').ok).toBe(false);
  });
});
