import { describe, it, expect } from 'vitest';
import { leerPlantillaEstudiantes, COLUMNAS_PLANTILLA } from '@/lib/colegio';
const cursos = [{ id: 'k', nombre: 'Kínder', tandas: ['matutina'], activo: true }];
const fila = (o) => COLUMNAS_PLANTILLA.map((k) => o[k] ?? '');
const base = { Nombres: 'Ana', Apellidos: 'Pérez', 'Fecha de nacimiento (dd/mm/aaaa)': '05/03/2020', Curso: 'Kinder', Tanda: 'Matutina', Mensualidad: '5000', Madre: 'M', 'Teléfono madre': '809-000-0000', Padre: 'P', 'Teléfono padre': 8090000001 };
const leer = (o) => leerPlantillaEstudiantes([COLUMNAS_PLANTILLA, fila(o)], cursos);
describe('import obligatorios', () => {
  it('completa pasa', () => { const r = leer(base); expect(r.errores).toEqual([]); expect(r.familias.size).toBe(1); });
  it('sin fecha', () => expect(leer({ ...base, 'Fecha de nacimiento (dd/mm/aaaa)': '' }).errores[0].motivo).toMatch(/fecha/));
  it('sin padres', () => expect(leer({ ...base, Madre: '', Padre: '' }).errores[0].motivo).toMatch(/padres/));
  it('sin tel madre', () => expect(leer({ ...base, 'Teléfono madre': '' }).errores[0].motivo).toMatch(/madre/));
  it('tel padre corto', () => expect(leer({ ...base, 'Teléfono padre': '809' }).errores[0].motivo).toMatch(/padre/));
});
