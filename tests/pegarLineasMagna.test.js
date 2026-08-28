// Se prueba con la lista de verdad que llegó de Magna, no con una inventada.
//
// Esa lista tiene las tres cosas que rompen un pegado ingenuo: las columnas
// al revés que el formulario, una columna de más (Imagen) cuyos valores son
// números igual que el ID de orden, y los valores en negrita de markdown.

import { describe, it, expect } from 'vitest';
import { parsearLineasPegadas } from '../src/components/cotizaciones_magna/pegarLineas';

const LISTA_DE_MAGNA = `
| Imagen | VIN                   | ID orden |
| ------ | --------------------- | -------: |
| 1      | **MD2A76BX9TWG47363** | **1631** |
| 1      | **MD2A76BX8TWE47302** | **1634** |
| 1      | **MD2A76BX6TWE47301** | **1632** |
| 1      | **MD2A76BX1TWF48441** | **1638** |
| 2      | **MD2A76BX1TWG47356** | **1747** |
| 2      | **MD2A76BXXTWF47076** | **1899** |
| 2      | **MD2A76BX0TWH47867** | **2027** |
| 2      | **MD2A76BX2TWG47298** | **2028** |
| 3      | **MD2A76BX9TWG47363** | **2744** |
| 3      | **MD2A76BX9TWE48091** | **2746** |
| 3      | **MD2A76BXXTWJ48195** | **2748** |
| 3      | **MD2A76BX5TWJ48203** | **2751** |
| 4      | **MD2A76BX3VWA47733** | **3355** |
| 5      | **MD2A76BX3TWJ47552** | **2750** |
| 5      | **MD2A76BX5TWG47442** | **2747** |
| 5      | **MD2A76BXXTWH47701** | **2749** |
| 5      | **MD2A76BX0TWH47707** | **2859** |
`;

describe('la lista que mandó Magna', () => {
  const r = parsearLineasPegadas(LISTA_DE_MAGNA);

  it('saca las 17 motos', () => {
    expect(r.lineas).toHaveLength(17);
  });

  it('no confunde la columna Imagen con el número de orden', () => {
    // Es LA trampa de esta tabla: Imagen y ID orden son las dos numéricas.
    expect(r.lineas[0]).toEqual({ numero_orden: '1631', chasis: 'MD2A76BX9TWG47363' });
    expect(r.lineas[4]).toEqual({ numero_orden: '1747', chasis: 'MD2A76BX1TWG47356' });
    expect(r.lineas[16]).toEqual({ numero_orden: '2859', chasis: 'MD2A76BX0TWH47707' });
    // Ni una sola línea puede quedarse con el 1, 2, 3, 4 o 5 de Imagen.
    for (const l of r.lineas) expect(l.numero_orden.length).toBeGreaterThan(1);
  });

  it('la cabecera y el separador no se cuentan como errores', () => {
    expect(r.ignoradas).toEqual([]);
  });

  it('avisa del chasis que viene dos veces', () => {
    // MD2A76BX9TWG47363 sale en la orden 1631 y en la 2744.
    expect(r.repetidos).toHaveLength(1);
    expect(r.repetidos[0]).toContain('MD2A76BX9TWG47363');
    expect(r.repetidos[0]).toContain('1631');
    expect(r.repetidos[0]).toContain('2744');
    // Avisar no es descartar: las dos órdenes entran.
    expect(r.lineas.filter((l) => l.chasis === 'MD2A76BX9TWG47363')).toHaveLength(2);
  });
});

describe('venga como venga', () => {
  it('lee un copiado de Excel (tabuladores)', () => {
    const r = parsearLineasPegadas('1631\tMD2A76BX9TWG47363\n1634\tMD2A76BX8TWE47302');
    expect(r.lineas).toEqual([
      { numero_orden: '1631', chasis: 'MD2A76BX9TWG47363' },
      { numero_orden: '1634', chasis: 'MD2A76BX8TWE47302' },
    ]);
  });

  it('da igual el orden de las columnas', () => {
    const alDerecho = parsearLineasPegadas('1631,MD2A76BX9TWG47363');
    const alReves   = parsearLineasPegadas('MD2A76BX9TWG47363,1631');
    expect(alDerecho.lineas).toEqual(alReves.lineas);
  });

  it('lee chasis y orden separados por espacios', () => {
    const r = parsearLineasPegadas('MD2A76BX3VWA47733   3355');
    expect(r.lineas).toEqual([{ numero_orden: '3355', chasis: 'MD2A76BX3VWA47733' }]);
  });

  it('pone el chasis en mayúsculas', () => {
    const r = parsearLineasPegadas('md2a76bx3vwa47733 3355');
    expect(r.lineas[0].chasis).toBe('MD2A76BX3VWA47733');
  });

  it('acepta la moto sin número de orden todavía', () => {
    const r = parsearLineasPegadas('MD2A76BX3VWA47733');
    expect(r.lineas).toEqual([{ numero_orden: '', chasis: 'MD2A76BX3VWA47733' }]);
  });
});

describe('lo que no se pudo leer sale a la luz', () => {
  it('devuelve la línea con un chasis mal copiado en vez de tragársela', () => {
    // 16 caracteres: le falta uno. Silenciarla seria perder una moto de la
    // cotizacion sin que nadie lo note.
    const r = parsearLineasPegadas('| 1 | MD2A76BX9TWG4736 | 1631 |');
    expect(r.lineas).toHaveLength(0);
    expect(r.ignoradas).toHaveLength(1);
    expect(r.ignoradas[0]).toContain('MD2A76BX9TWG4736');
  });

  it('las lineas en blanco no molestan', () => {
    const r = parsearLineasPegadas('\n\n  \nMD2A76BX3VWA47733 3355\n\n');
    expect(r.lineas).toHaveLength(1);
    expect(r.ignoradas).toEqual([]);
  });

  it('un pegado vacio no revienta', () => {
    expect(parsearLineasPegadas('')).toEqual({ lineas: [], ignoradas: [], repetidos: [] });
    expect(parsearLineasPegadas(null)).toEqual({ lineas: [], ignoradas: [], repetidos: [] });
  });
});
