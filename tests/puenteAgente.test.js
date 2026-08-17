// El puente entre el agente y la pantalla de Ventas.
//
// >>> POR QUÉ SE PRUEBA ESTO Y NO OTRA COSA <<<
// Aquí es donde una frase dicha en voz alta se convierte en una factura. Un
// número mal normalizado no da un error: da un comprobante fiscal equivocado
// delante de un cliente. Es el sitio del sistema donde más barato sale una
// prueba y más caro sale un fallo.

import { describe, it, expect } from 'vitest';
import { normalizarOrdenVenta } from '../src/lib/puenteAgente.js';

describe('normalizarOrdenVenta — preparar', () => {
  it('limpia códigos y cantidades', () => {
    const o = normalizarOrdenVenta({
      lineas: [{ codigo: '  52JK0550 ', cantidad: '2' }, { codigo: '', cantidad: 1 }],
    });
    expect(o.tipo).toBe('preparar_venta');
    expect(o.lineas).toEqual([{ codigo: '52JK0550', cantidad: 2 }]);
  });

  it('una cantidad disparatada no cuelga la pantalla', () => {
    // Dictar "cinco mil" en vez de "cinco" agregaría las líneas una por una.
    const o = normalizarOrdenVenta({ lineas: [{ codigo: 'X', cantidad: 5000 }] });
    expect(o.lineas[0].cantidad).toBe(50);
  });

  it('cantidad ausente o basura vale 1, nunca 0', () => {
    for (const c of [undefined, null, 'dos', 0, -3]) {
      expect(normalizarOrdenVenta({ lineas: [{ codigo: 'X', cantidad: c }] }).lineas[0].cantidad).toBe(1);
    }
  });

  it('acepta el número de cotización', () => {
    expect(normalizarOrdenVenta({ cotizacion: ' CT-000087 ' }).cotizacion).toBe('CT-000087');
    expect(normalizarOrdenVenta({ lineas: [] }).cotizacion).toBeNull();
  });

  it('solo pasan las cuatro formas de pago conocidas', () => {
    expect(normalizarOrdenVenta({ forma_pago: 'efectivo' }).forma_pago).toBe('EFECTIVO');
    // Un invento del modelo no puede llegar a la pantalla.
    expect(normalizarOrdenVenta({ forma_pago: 'YAPPY' }).forma_pago).toBeNull();
  });

  it('lo recibido tiene que ser un número positivo', () => {
    expect(normalizarOrdenVenta({ recibido: '500' }).recibido).toBe(500);
    for (const m of ['quinientos', 0, -5, null]) {
      expect(normalizarOrdenVenta({ recibido: m }).recibido).toBeNull();
    }
  });
});

describe('normalizarOrdenVenta — cobrar', () => {
  it('cobrar es un tipo aparte y no arrastra líneas', () => {
    // Si arrastrara líneas, cobrar volvería a agregar la mercancía encima de
    // la que ya está en pantalla y la factura saldría al doble.
    const o = normalizarOrdenVenta({
      tipo: 'cobrar_venta', forma_pago: 'EFECTIVO', recibido: 10000,
      lineas: [{ codigo: 'X', cantidad: 1 }],
    });
    expect(o.tipo).toBe('cobrar_venta');
    expect(o.lineas).toBeUndefined();
    expect(o.forma_pago).toBe('EFECTIVO');
    expect(o.recibido).toBe(10000);
  });

  it('sin forma de pago válida no se inventa ninguna', () => {
    // La pantalla no debe grabar a ciegas: nulo aquí significa "no toques la
    // forma de pago", y el efecto que graba espera a que cuadre.
    expect(normalizarOrdenVenta({ tipo: 'cobrar_venta', forma_pago: 'CRIPTO' }).forma_pago).toBeNull();
  });
});

// (2026-08-17) "Hay un error, cámbiate la mercancía", con la factura armada.
// No había forma de hacerlo: la única orden que tocaba las líneas era
// preparar_venta, y esa empieza con resetVenta(). Corregir una pieza obligaba
// a rehacer la factura entera, con el cliente y la forma de pago otra vez.
describe('normalizarOrdenVenta — corregir', () => {
  it('quita por código y agrega en la misma orden', () => {
    const o = normalizarOrdenVenta({
      tipo: 'corregir_venta',
      quitar: [{ codigo: ' 52JK0550 ' }, 'GX9036'],
      agregar: [{ codigo: ' I-7633 ', cantidad: '2' }],
    });
    expect(o.tipo).toBe('corregir_venta');
    // Acepta el código suelto o dentro de un objeto: el modelo manda las dos
    // formas y obligarlo a una sola es una vuelta perdida.
    expect(o.quitar).toEqual(['52JK0550', 'GX9036']);
    expect(o.agregar).toEqual([{ codigo: 'I-7633', cantidad: 2 }]);
  });

  it('NO arrastra líneas de preparar', () => {
    // Si `lineas` se colara, corregir volvería a agregar la mercancía encima
    // de la que ya está y la factura saldría al doble — el mismo fallo que
    // ya costó una vez con cobrar.
    const o = normalizarOrdenVenta({
      tipo: 'corregir_venta', lineas: [{ codigo: 'X', cantidad: 1 }],
      quitar: ['A'],
    });
    expect(o.lineas).toBeUndefined();
    expect(o.cotizacion).toBeUndefined();
  });

  it('las cantidades de lo que se agrega tienen los mismos topes', () => {
    const o = normalizarOrdenVenta({
      tipo: 'corregir_venta', agregar: [{ codigo: 'X', cantidad: 5000 }],
    });
    expect(o.agregar[0].cantidad).toBe(50);
  });

  it('con listas vacías o basura no revienta', () => {
    const o = normalizarOrdenVenta({ tipo: 'corregir_venta', quitar: null, agregar: 'nada' });
    expect(o.quitar).toEqual([]);
    expect(o.agregar).toEqual([]);
  });
});
