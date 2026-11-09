import { describe, it, expect } from 'vitest';
import { leerPulgadas, pulgadasTexto, medidaRazonable } from '@/lib/ventanas';

describe('medidas en pulgadas', () => {
  it('lee entero, decimal y fracciones', () => {
    expect(leerPulgadas('40')).toBe(40);
    expect(leerPulgadas('40.25')).toBe(40.25);
    expect(leerPulgadas('40 1/4')).toBe(40.25);
    expect(leerPulgadas('40-1/4')).toBe(40.25);
    expect(leerPulgadas('40 1 4')).toBe(40.25);      // como en el teclado numérico
    expect(leerPulgadas('120 1 8')).toBe(120.125);
    expect(leerPulgadas('3/4')).toBe(0.75);
    expect(leerPulgadas('40,5')).toBe(40.5);
  });
  it('rechaza lo que no es medida', () => {
    expect(leerPulgadas('')).toBeNull();
    expect(leerPulgadas('abc')).toBeNull();
    expect(leerPulgadas('40 5 4')).toBeNull();        // 5/4 no es fracción propia
    expect(leerPulgadas('40 1 0')).toBeNull();
  });
  it('muestra a 1/16', () => {
    expect(pulgadasTexto(40.25)).toBe('40 1/4');
    expect(pulgadasTexto(40.125)).toBe('40 1/8');
    expect(pulgadasTexto(40.5)).toBe('40 1/2');
    expect(pulgadasTexto(40)).toBe('40');
    expect(pulgadasTexto(40.9999)).toBe('41');
    expect(pulgadasTexto(40.0625)).toBe('40 1/16');
    expect(pulgadasTexto(0.125)).toBe('1/8');
  });
  it('medida razonable', () => {
    expect(medidaRazonable(40)).toBe(true);
    expect(medidaRazonable(2)).toBe(false);
    expect(medidaRazonable(900)).toBe(false);
    expect(medidaRazonable(null)).toBe(false);
  });
});

import { desgloseVentana, planBarras, materialesProyecto } from '@/lib/ventanas';

const piezas = [
  { codigo: 'CABEZAL', nombre: 'Cabezal', tipo: 'perfil', base: 'ancho', por_hoja: false, descuento: 0.5, cant_fija: 1, cant_por_hoja: 0, orden: 1 },
  { codigo: 'LATERAL', nombre: 'Laterales', tipo: 'perfil', base: 'alto', por_hoja: false, descuento: 0.5, cant_fija: 2, cant_por_hoja: 0, orden: 2 },
  { codigo: 'CAB_HOJA', nombre: 'Cabezal de hoja', tipo: 'perfil', base: 'ancho', por_hoja: true, descuento: -0.5, cant_fija: 0, cant_por_hoja: 1, orden: 3 },
  { codigo: 'ENGANCHE', nombre: 'Enganche', tipo: 'perfil', base: 'alto', por_hoja: false, descuento: 0.875, cant_fija: -2, cant_por_hoja: 2, orden: 4 },
  { codigo: 'CRISTAL_AN', nombre: 'Cristal (ancho)', tipo: 'cristal', base: 'ancho', por_hoja: true, descuento: 2.25, cant_fija: 0, cant_por_hoja: 1, orden: 5 },
  { codigo: 'CRISTAL_AL', nombre: 'Cristal (alto)', tipo: 'cristal', base: 'alto', por_hoja: false, descuento: 3.5, cant_fija: 0, cant_por_hoja: 1, orden: 6 },
];

describe('desglose', () => {
  it('medidas y cantidades de una ventana de 2 hojas', () => {
    const d = desgloseVentana({ ancho: 40.5, alto: 40.125, hojas: 2, cantidad: 1 }, piezas);
    const p = Object.fromEntries(d.map((c) => [c.pieza.codigo, c]));
    expect(p.CABEZAL.largo).toBe(40);            // 40 1/2 − 1/2
    expect(p.LATERAL).toMatchObject({ largo: 39.625, cantidad: 2 });
    expect(p.CAB_HOJA).toMatchObject({ largo: 20.75, cantidad: 2 });   // 40.5/2 + 1/2 (20.75)
    expect(p.ENGANCHE.cantidad).toBe(2);          // 2×2 − 2
    expect(p.CRISTAL_AN.largo).toBe(18);          // 20.25 − 2.25
  });
  it('3 hojas y 2 ventanas iguales', () => {
    const d = desgloseVentana({ ancho: 120.125, alto: 40.25, hojas: 3, cantidad: 2 }, piezas);
    const p = Object.fromEntries(d.map((c) => [c.pieza.codigo, c]));
    expect(p.ENGANCHE.cantidad).toBe(8);          // (3×2 − 2) × 2
    expect(p.CAB_HOJA.cantidad).toBe(6);
    expect(p.CAB_HOJA.largo).toBe(40.5625);       // 120.125/3 + 0.5 = 40.54 → 40 9/16
  });
  it('plan de barras de 240" con merma', () => {
    const r = planBarras([120, 120, 100, 60], 240, 0.125);
    expect(r.barras.length).toBe(2);
    expect(r.barras[0].cortes).toEqual([120, 100]);
    expect(planBarras([250], 240).sinCaber).toEqual([250]);
  });
  it('materiales del proyecto por perfil y color', () => {
    const m = materialesProyecto([{ sistema_id: 's', ancho: 40.5, alto: 40.125, hojas: 2, cantidad: 1, color: 'Blanco' }], { s: piezas }, { largo_barra: 240 });
    const lat = m.perfiles.find((x) => x.perfil === 'Laterales');
    expect(lat.cortes).toEqual([39.625, 39.625]);
    expect(lat.barras).toBe(1);
    expect(m.cristales[0]).toMatchObject({ ancho: 18, alto: 36.625, cantidad: 2 });
  });
});

import { presupuestoProyecto } from '@/lib/ventanas';

describe('presupuesto (igual que vent_crear_cotizacion)', () => {
  const precios = [{ sistema_id: 's', color: '', modo: 'pie2', precio: 250, minimo_pie2: 4, producto_id: 'p1' }];
  it('pie², mínimo y extras', () => {
    const r = presupuestoProyecto([
      { sistema_id: 's', ancho: 40.5, alto: 40.125, cantidad: 1, color: 'Blanco' },
      { sistema_id: 's', ancho: 12, alto: 12, cantidad: 2, color: 'Bronce' },
    ], precios, [{ producto_id: 'mo', cantidad: 1, precio: 3000 }]);
    expect(r.lineas.map((l) => l.importe)).toEqual([2822.5, 2000, 3000]);
    expect(r.total).toBe(7822.5);
    expect(r.faltan).toEqual([]);
  });
  it('el precio del color manda; sin precio queda en faltan', () => {
    const p2 = [...precios, { sistema_id: 's', color: 'Negro', modo: 'unidad', precio: 9000, minimo_pie2: 0, producto_id: 'p2' }];
    const r = presupuestoProyecto([{ sistema_id: 's', ancho: 40, alto: 40, cantidad: 1, color: 'Negro' }, { sistema_id: 'x', ancho: 40, alto: 40, cantidad: 1 }], p2);
    expect(r.lineas[0].unitario).toBe(9000);
    expect(r.faltan.length).toBe(1);
  });
});

describe('croquisVidrios', () => {
  it('agrupa vidrios iguales y cuenta pie² por ventana × cantidad', async () => {
    const { croquisVidrios, pedidoVidrioTexto } = await import('../src/lib/ventanas.js');
    const piezas = { s1: [
      { id: 'a', nombre: 'Cristal ancho', tipo: 'cristal', base: 'ancho', por_hoja: true, descuento: 2, cant_fija: 0, cant_por_hoja: 1, orden: 1 },
      { id: 'b', nombre: 'Cristal alto', tipo: 'cristal', base: 'alto', por_hoja: false, descuento: 3, cant_fija: 0, cant_por_hoja: 1, orden: 2 },
    ] };
    const medidas = [
      { sistema_id: 's1', hojas: 2, ancho: 40, alto: 39, cantidad: 2 },
      { sistema_id: 's1', hojas: 2, ancho: 40, alto: 39, cantidad: 1 },
      { sistema_id: 'sx', hojas: 2, ancho: 30, alto: 30, cantidad: 1 },
    ];
    const c = croquisVidrios(medidas, piezas);
    expect(c.ventanas[0].vidrio).toMatchObject({ ancho: 18, alto: 36, porVentana: 2, cantidad: 4 });
    expect(c.ventanas[2].vidrio).toBeNull();
    expect(c.pedido).toHaveLength(1);
    expect(c.pedido[0]).toMatchObject({ ancho: 18, alto: 36, cantidad: 6, ventanas: [1, 2] });
    expect(c.totalPie2).toBeCloseTo(27, 2);
    const t = pedidoVidrioTexto({ empresa: 'D Mario', proyecto: { nombre: 'Casa', numero: 3 }, croquis: c, tipoVidrio: 'claro 5 mm' });
    expect(t).toContain('6 × 18" × 36"');
    expect(t).toContain('Vidrio: claro 5 mm');
  });
});

describe('formas de cobrar y fracciones', () => {
  it('m², pie lineal, material + mano de obra y mínimo', async () => {
    const v = await import('../src/lib/ventanas.js');
    const piezas = { s1: [
      { id: 'l', nombre: 'Lateral', tipo: 'perfil', base: 'alto', por_hoja: false, descuento: 0, cant_fija: 2, cant_por_hoja: 0, orden: 1 },
      { id: 'c', nombre: 'Cabezal', tipo: 'perfil', base: 'ancho', por_hoja: false, descuento: 0, cant_fija: 2, cant_por_hoja: 0, orden: 2 },
      { id: 'a', nombre: 'Cristal ancho', tipo: 'cristal', base: 'ancho', por_hoja: true, descuento: 0, cant_fija: 0, cant_por_hoja: 1, orden: 3 },
      { id: 'b', nombre: 'Cristal alto', tipo: 'cristal', base: 'alto', por_hoja: false, descuento: 0, cant_fija: 0, cant_por_hoja: 1, orden: 4 },
    ] };
    const m = { sistema_id: 's1', hojas: 2, ancho: 48, alto: 36, cantidad: 2, color: '' };
    const base = { sistema_id: 's1', color: '', producto_id: 'x', minimo_pie2: 0 };
    const linea = (p) => v.presupuestoProyecto([m], [{ ...base, ...p }], [], piezas).lineas[0];
    expect(linea({ modo: 'm2', precio: 1000 }).unitario).toBe(1110);             // 48×36" = 1.11 m²
    expect(linea({ modo: 'pie_lineal', precio: 100 }).unitario).toBe(1400);      // 2×(48+36)/12 = 14'
    expect(linea({ modo: 'pie2', precio: 100, minimo_pie2: 15 }).unitario).toBe(1500);   // 12 pie² < mínimo 15
    const mo = linea({ modo: 'material_mo', precio: 0, precio_perfil_pie: 10, precio_vidrio_pie2: 50, mano_obra: 500 });
    // perfil: 2×36 + 2×48 = 168" = 14' → 140; vidrio 2 × (24×36/144 = 6) = 12 pie² → 600; + 500
    expect(mo.unitario).toBe(1240);
    expect(mo.importe).toBe(2480);
    expect(v.cobroTexto(mo)).toContain('M.O.');
    expect(v.presupuestoProyecto([m], [{ ...base, modo: 'material_mo', precio: 0 }], [], piezas).faltan).toHaveLength(1);
  });
  it('cuartos, barras con fracción y planchas', async () => {
    const v = await import('../src/lib/ventanas.js');
    expect(v.aCuartos(2.1).texto).toBe('2 1/4');
    expect(v.aCuartos(2).texto).toBe('2');
    expect(v.aCuartos(0.6).texto).toBe('3/4');
    const plan = v.planBarras([200, 100], 240, 0);   // barra 1: 200 (sobra 40) · barra 2: 100 (sobra 140)
    expect(v.barrasConFraccion(plan, 240).texto).toBe('1 1/2');
    expect(v.planchasVidrio(60, 96, 72, false).texto).toBe('2');   // plancha 48 pie²
    expect(v.planchasVidrio(60, 96, 72, true).texto).toBe('1 1/4');   // 60 ÷ 48 = 1.25
  });
});

describe('vidrio por cuartos de plancha', () => {
  it('lee la cantidad escrita como fracción y la lleva al ¼', async () => {
    const { leerCuartos } = await import('../src/lib/ventanas.js');
    expect(leerCuartos('3/4')).toBe(0.75);
    expect(leerCuartos('1 1/2')).toBe(1.5);
    expect(leerCuartos('0,75')).toBe(0.75);
    expect(leerCuartos('2')).toBe(2);
    expect(leerCuartos('1.6')).toBe(1.5);
    expect(leerCuartos('0.1')).toBe(0);
    expect(leerCuartos('')).toBe(0);
  });
  it('línea aparte solo por la unidad o la nota exacta, no por el nombre del producto', async () => {
    const { esLineaFraccion } = await import('../src/lib/ventanas.js');
    expect(esLineaFraccion({ descripcion: 'PERFIL P40 (5 PIES)' })).toBe(true);
    expect(esLineaFraccion({ descripcion: 'VIDRIO 3MM (3/4 PLANCHA)' })).toBe(true);
    expect(esLineaFraccion({ descripcion: 'VIDRIO 3MM (1 1/2 PLANCHA)' })).toBe(true);
    expect(esLineaFraccion({ descripcion: 'VIDRIO', unidad: 'PLANCHA' })).toBe(true);
    expect(esLineaFraccion({ descripcion: 'MANGUERA GASOLINA (ROLLO 25 PIES)' })).toBe(false);
    expect(esLineaFraccion({ descripcion: 'LAMINA ZINC (CAL 26 PLANCHA)' })).toBe(false);
    expect(esLineaFraccion({ descripcion: 'ACEITE', unidad: 'UND' })).toBe(false);
  });
});
