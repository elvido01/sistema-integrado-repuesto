import { describe, it, expect } from 'vitest';
import { comaTecleada, normalizarPegado } from '@/components/ui/MontoInput';
import { fmtMontoInput, parseMontoInput } from '@/lib/numberFormat';

// Simula teclear un carácter al final del campo como lo hace el navegador.
const teclear = (crudo, ch) => {
  const antes = fmtMontoInput(crudo);
  const t = antes + ch;
  return parseMontoInput(comaTecleada(t, t.length, antes));
};

describe('MontoInput', () => {
  it('la coma tecleada es el decimal (teclado en español)', () => {
    let v = '';
    for (const ch of '1500,50') v = teclear(v, ch);
    expect(v).toBe('1500.50');
    expect(fmtMontoInput(v)).toBe('1,500.50');
  });

  it('sin coma, las comas de miles las pone el campo', () => {
    let v = '';
    for (const ch of '6150') v = teclear(v, ch);
    expect(v).toBe('6150');
    expect(fmtMontoInput(v)).toBe('6,150');
  });

  it('una segunda coma después del decimal no hace nada', () => {
    expect(teclear('15.5', ',')).toBe('15.5');
  });

  it('pegar estilo europeo o americano', () => {
    expect(normalizarPegado('1.500,00')).toBe('1500.00');
    expect(normalizarPegado('1500,5')).toBe('1500.5');
    expect(normalizarPegado('1,500.00')).toBe('1500.00');
    expect(normalizarPegado('RD$ 12,345')).toBe('12345');
    expect(normalizarPegado('2500')).toBe('2500');
  });
});

describe('crudoAMostrar (la pantalla guarda el monto como número)', () => {
  it('conserva el punto y los ceros tecleados mientras valgan lo mismo', async () => {
    const { crudoAMostrar } = await import('../src/components/ui/MontoInput.jsx');
    expect(crudoAMostrar('100.', 100)).toBe('100.');
    expect(crudoAMostrar('100.50', 100.5)).toBe('100.50');
    expect(crudoAMostrar('', 0)).toBe('');
    expect(crudoAMostrar('2500', 2000)).toBe(2000);      // la pantalla lo topó: manda la pantalla
    expect(crudoAMostrar(null, 1500)).toBe(1500);         // nada tecleado todavía
  });
});
