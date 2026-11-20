import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GUIAS, guiaPorId } from '../src/guias/definiciones';
import { versionMayor, queHacerConGuia, guiaDisponible, posicionVentanita, pasoValido } from '../src/guias/reglas';

// Todo el código de pantallas, para comprobar que cada selector de las guías existe.
const leerTodo = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.isDirectory()) return leerTodo(p);
  return /\.(jsx?|tsx?)$/.test(d.name) ? [fs.readFileSync(p, 'utf8')] : [];
});
const CODIGO = leerTodo(path.resolve(__dirname, '../src/components')).concat(leerTodo(path.resolve(__dirname, '../src/pages'))).join('\n');

describe('Guías: definiciones', () => {
  it('ids únicos, válidos para el servidor, con versión y pasos', () => {
    const ids = GUIAS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GUIAS) {
      expect(g.id).toMatch(/^[a-z0-9-]{2,60}$/);
      expect(g.version).toMatch(/^\d+\.\d+$/);
      expect(g.pasos.length).toBeGreaterThan(1);
      for (const p of g.pasos) { expect(p.selector).toBeTruthy(); expect(p.titulo).toBeTruthy(); expect(p.texto).toBeTruthy(); }
    }
    expect(guiaPorId('venta')?.modulo).toBe('ventas');
  });

  it('cada selector apunta a un id o data-guia que existe en las pantallas', () => {
    const faltan = [];
    for (const g of GUIAS) {
      for (const p of g.pasos) {
        // Basta con que exista una de las alternativas (separadas por coma).
        const alternativas = p.selector.split(',').map((s) => s.trim());
        const existe = alternativas.some((sel) => {
          let m;
          if ((m = sel.match(/^\[data-guia="([^"]+)"\]$/))) return CODIGO.includes(`data-guia="${m[1]}"`);
          if ((m = sel.match(/^#([\w-]+)$/))) return CODIGO.includes(`id="${m[1]}"`);
          if ((m = sel.match(/^\[id\^="([\w-]+)"\]$/))) return CODIGO.includes(`id={\`${m[1]}`);
          if ((m = sel.match(/^button\[title="([^"]+)"\]$/))) return CODIGO.includes(`title="${m[1]}"`);
          return false;
        });
        if (!existe) faltan.push(`${g.id}: ${p.selector}`);
      }
    }
    expect(faltan).toEqual([]);
  });

  it('la marca "Quién vende" está en el desplegable de VENDEDOR (no en el del comprobante)', () => {
    const header = fs.readFileSync(path.resolve(__dirname, '../src/components/ventas/VentasHeader.jsx'), 'utf8').split(String.fromCharCode(10));
    const lineas = header.map((l, i) => [l, i]).filter(([l]) => l.includes('data-guia="venta-vendedor"'));
    expect(lineas.length).toBeGreaterThan(0);
    for (const [, i] of lineas) expect(header[i - 1]).toContain('onVendedorChange');
  });
});

describe('Guías: reglas', () => {
  const guia = { id: 'venta', version: '1.3', modulo: 'ventas', plataformas: ['web'] };

  it('versión mayor', () => {
    expect(versionMayor('2.7')).toBe(2);
    expect(versionMayor('1')).toBe(1);
    expect(versionMayor(null)).toBe(0);
  });

  it('se ofrece la primera vez, se continúa a medias y no se repite sola', () => {
    expect(queHacerConGuia(guia, undefined)).toBe('ofrecer');
    expect(queHacerConGuia(guia, { version: '1.0', estado: 'iniciada', paso: 2 })).toBe('continuar');
    expect(queHacerConGuia(guia, { version: '1.0', estado: 'completada' })).toBeNull();
    expect(queHacerConGuia(guia, { version: '1.0', estado: 'omitida' })).toBeNull();
  });

  it('un retoque (versión menor) no obliga a repetir; un cambio mayor sí la vuelve a ofrecer', () => {
    expect(queHacerConGuia({ ...guia, version: '1.9' }, { version: '1.0', estado: 'completada' })).toBeNull();
    expect(queHacerConGuia({ ...guia, version: '2.0' }, { version: '1.4', estado: 'completada' })).toBe('ofrecer');
  });

  it('no se ofrece donde no aplica: tipo de negocio, plataforma o sin acceso', () => {
    const compra = { ...guia, modulo: 'compras', tiposExcluidos: ['servicios'] };
    expect(guiaDisponible(compra, { tipoNegocio: 'servicios' })).toBe(false);
    expect(guiaDisponible(compra, { tipoNegocio: 'repuestos' })).toBe(true);
    expect(guiaDisponible(guia, { plataforma: 'movil' })).toBe(false);
    expect(guiaDisponible(guia, { puedeAbrir: () => false })).toBe(false);
  });

  it('un paso guardado que ya no existe se acota a la guía', () => {
    const g = { pasos: [{}, {}, {}] };
    expect(pasoValido(g, 7)).toBe(2);
    expect(pasoValido(g, -1)).toBe(0);
    expect(pasoValido(g, 'x')).toBe(0);
    expect(pasoValido({ pasos: [] }, 3)).toBe(0);
  });

  it('la ventanita nunca queda fuera de la pantalla', () => {
    const abajo = posicionVentanita({ top: 100, bottom: 130, left: 1200 }, { vw: 1280, vh: 800 });
    expect(abajo.top).toBe(142);
    expect(abajo.left).toBeLessThanOrEqual(1280 - 320 - 12);
    const arriba = posicionVentanita({ top: 700, bottom: 760, left: 10 }, { vw: 1280, vh: 800 });
    expect(arriba.top).toBeLessThan(700);
    const centro = posicionVentanita(null, { vw: 1280, vh: 800 });
    expect(centro.left).toBeGreaterThan(0);
  });
});
