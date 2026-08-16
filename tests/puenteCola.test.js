// El buzón del puente tiene que ser una COLA.
//
// (2026-08-16) Era una sola orden por panel. El agente mandó preparar la venta
// y cobrarla en la misma respuesta, la segunda pisó a la primera, y la
// pantalla acabó con la mercancía puesta, RECIBIDO en cero y la factura sin
// grabar — mientras el agente decía que estaba hecha.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ordenarPantalla, escucharOrdenes } from '../src/lib/puenteAgente.js';

describe('buzón del puente', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('guarda las DOS órdenes cuando la pantalla aún no escucha', async () => {
    ordenarPantalla('panel-a', { tipo: 'preparar_venta' });
    ordenarPantalla('panel-a', { tipo: 'cobrar_venta' });

    const recibidas = [];
    const baja = escucharOrdenes('panel-a', (o) => recibidas.push(o.tipo));
    await new Promise((r) => setTimeout(r, 5));
    baja();

    expect(recibidas).toEqual(['preparar_venta', 'cobrar_venta']);
  });

  it('las entrega en el mismo orden en que se mandaron', async () => {
    for (const n of [1, 2, 3]) ordenarPantalla('panel-b', { tipo: 'x', n });
    const vistas = [];
    const baja = escucharOrdenes('panel-b', (o) => vistas.push(o.n));
    await new Promise((r) => setTimeout(r, 5));
    baja();
    expect(vistas).toEqual([1, 2, 3]);
  });

  it('si ya hay quien escuche, llegan al momento', () => {
    const vistas = [];
    const baja = escucharOrdenes('panel-c', (o) => vistas.push(o.tipo));
    ordenarPantalla('panel-c', { tipo: 'preparar_venta' });
    ordenarPantalla('panel-c', { tipo: 'cobrar_venta' });
    baja();
    expect(vistas).toEqual(['preparar_venta', 'cobrar_venta']);
  });

  it('el buzón se vacía: no se reparten dos veces', async () => {
    ordenarPantalla('panel-d', { tipo: 'preparar_venta' });

    const primera = [];
    const baja1 = escucharOrdenes('panel-d', (o) => primera.push(o.tipo));
    await new Promise((r) => setTimeout(r, 5));
    baja1();

    const segunda = [];
    const baja2 = escucharOrdenes('panel-d', (o) => segunda.push(o.tipo));
    await new Promise((r) => setTimeout(r, 5));
    baja2();

    expect(primera).toEqual(['preparar_venta']);
    // Repartirla otra vez facturaría dos veces lo mismo.
    expect(segunda).toEqual([]);
  });
});
