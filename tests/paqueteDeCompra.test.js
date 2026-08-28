// Con descripciones REALES de las facturas de Morla, no inventadas.
// Salen del extracted_json que quedó guardado en las 174 compras con OCR.

import { describe, it, expect } from 'vitest';
import { paqueteEnLaDescripcion, factorDePaquete } from '../src/lib/paqueteDeCompra';

describe('el paquete escrito en la factura', () => {
  it('lee el (100PCS) de la factura de Almonte', () => {
    // Línea literal de la factura FC-183483 del 26/08/2026
    expect(paqueteEnLaDescripcion('TORNILLO 10 CAB. STRIA 16 NIQ. (100PCS)')).toBe(100);
  });

  it('lee las otras formas de escribirlo', () => {
    expect(paqueteEnLaDescripcion('TUERCA 10 LAR.NIQ.CIEG RHYNO 100 PCS')).toBe(100);
    expect(paqueteEnLaDescripcion('BUJIAS CG JINCHENG (10 UDS)')).toBe(10);
    expect(paqueteEnLaDescripcion('ARANDELA PLANA X25 UND')).toBe(25);
    expect(paqueteEnLaDescripcion('KIT REPARACION (12 PIEZAS)')).toBe(12);
  });

  it('lo que viene suelto da 1', () => {
    // Nada de esto es un paquete, y confundirlo destrozaría el inventario.
    expect(paqueteEnLaDescripcion('MANEC. CLUTCH AX100 RHYNO')).toBe(1);
    expect(paqueteEnLaDescripcion('ARO 1.20X17 SIN BORDE AZUL C/STICKERS')).toBe(1);
    expect(paqueteEnLaDescripcion('85G SILICON NEGRO GRANDE')).toBe(1);
    expect(paqueteEnLaDescripcion('GOMA ESTRIBO XPRESS 125 JGO RHYNO')).toBe(1);
    expect(paqueteEnLaDescripcion('')).toBe(1);
    expect(paqueteEnLaDescripcion(null)).toBe(1);
  });

  it('no confunde el modelo de la moto con un paquete', () => {
    // "125", "160/180", "100" son modelos. Sin la palabra PCS no son cajas.
    expect(paqueteEnLaDescripcion('MANEC. CLUTCH XPRESS 125 COMPLETA RHYNO')).toBe(1);
    expect(paqueteEnLaDescripcion('DEFENSA APACHE 160/180/200 TVS')).toBe(1);
    expect(paqueteEnLaDescripcion('CONO DEL. MODERNO R3 NEGRO RHYNO')).toBe(1);
  });

  it('un paquete de 1 no es un paquete', () => {
    expect(paqueteEnLaDescripcion('TORNILLO (1PCS)')).toBe(1);
  });

  it('un numero absurdo no se aplica', () => {
    // Mejor dejarlo en 1 y que el dueño lo corrija que multiplicar por 9999.
    expect(paqueteEnLaDescripcion('TORNILLO (9999PCS)')).toBe(1);
  });
});

describe('quien manda cuando los dos hablan', () => {
  const aprendidos = { 'I-7414': 100, 'Y-6328': 10 };

  it('lo aprendido gana sobre la descripcion', () => {
    // La descripción dice 50, pero el dueño abrió esa caja como 100 antes.
    // Él sabe algo que la etiqueta no dice.
    const r = factorDePaquete(
      { code: 'I-7414', description: 'TORNILLO 10 CAB (50PCS)' }, aprendidos);
    expect(r).toEqual({ factor: 100, origen: 'aprendido' });
  });

  it('sin nada aprendido, se lee la descripcion', () => {
    const r = factorDePaquete(
      { code: 'X-9999', description: 'ARANDELA (25PCS)' }, aprendidos);
    expect(r).toEqual({ factor: 25, origen: 'descripcion' });
  });

  it('cuando nadie dice nada, no se toca la linea', () => {
    const r = factorDePaquete(
      { code: 'X-0203', description: '85G SILICON NEGRO GRANDE' }, aprendidos);
    expect(r).toEqual({ factor: 1, origen: null });
  });

  it('el codigo se compara sin importar mayusculas ni espacios', () => {
    expect(factorDePaquete({ code: ' i-7414 ', description: '' }, aprendidos).factor).toBe(100);
  });

  it('sin lista de aprendidos no revienta', () => {
    expect(factorDePaquete({ code: 'I-7414', description: 'X (12PCS)' }).factor).toBe(12);
    expect(factorDePaquete({}).factor).toBe(1);
  });
});

describe('la cuenta que tiene que cuadrar', () => {
  it('abrir el paquete no cambia el importe de la linea', () => {
    // Es la regla que hace esto seguro: si el importe cambiara, estariamos
    // pagandole al suplidor un numero distinto al de su factura.
    const cantidadFactura = 1, costoFactura = 583;
    const { factor } = factorDePaquete(
      { code: 'I-2094', description: 'TORNILLO 10 CAB.8 6X40 RHYNO (100PCS)' });

    const cantidadFinal = cantidadFactura * factor;
    const costoFinal = costoFactura / factor;

    expect(factor).toBe(100);
    expect(cantidadFinal).toBe(100);
    expect(costoFinal).toBeCloseTo(5.83, 2);
    expect(cantidadFinal * costoFinal).toBeCloseTo(cantidadFactura * costoFactura, 2);
  });
});
