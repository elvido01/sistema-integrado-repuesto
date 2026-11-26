import { describe, it, expect } from 'vitest';
import { textoPieEmpresa } from '@/components/common/pdf/pieEmpresa';

describe('pie de página de los comprobantes (26/11/2026)', () => {
  it('Motopréstamos: dirección y teléfono iguales salen una sola vez', () => {
    const t = '829-222-3566 / 809-390-4790 / 849-460-4790';
    expect(textoPieEmpresa({ direccion: t, telefono: t })).toBe(t);
    expect(textoPieEmpresa({ direccion: t + ' ', telefono: t.replace(/ /g, '  ') })).toBe(t);
  });
  it('el teléfono no se repite si ya está en la dirección', () => {
    expect(textoPieEmpresa({ direccion: 'Av. Duarte #45, Tel. 809-555-1234', telefono: '809-555-1234' }))
      .toBe('Av. Duarte #45, Tel. 809-555-1234');
  });
  it('distintos: los dos, separados', () => {
    expect(textoPieEmpresa({ direccion: 'Calle 1, Higüey', telefono: '809-000-0000' })).toBe('Calle 1, Higüey · 809-000-0000');
  });
  it('un número corto dentro de la dirección no se come el teléfono', () => {
    expect(textoPieEmpresa({ direccion: 'Calle 8, Edif. 809-A', telefono: '809' })).toBe('Calle 8, Edif. 809-A · 809');
    expect(textoPieEmpresa(null)).toBe('');
  });
  it('vacío: nada', () => {
    expect(textoPieEmpresa({})).toBe('');
    expect(textoPieEmpresa({ telefono: '809' })).toBe('809');
  });
});
