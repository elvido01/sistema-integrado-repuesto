import { describe, it, expect } from 'vitest';
import { accesoFuncion, infoFuncion, PERMITIDOS_FREE } from '../src/lib/planes';

const free = (id) => accesoFuncion(id, { planActual: 'FREE' });

describe('Plan FREE en el menú', () => {
  it('ve lo básico: ventas, catálogo, compras, inventario, caja', () => {
    for (const id of ['ventas', 'mercancias', 'clientes', 'suplidores', 'vendedores', 'compras', 'cierre-caja']) {
      expect(free(id).estado).toBe('libre');
    }
  });
  it('cotizaciones, crédito y DGII salen con ★ BÁSICO y tienen su ventanita', () => {
    for (const id of ['cotizaciones', 'recibo-ingreso', 'pago-suplidores', 'reportes-dgii', 'comprobantes-fiscales']) {
      expect(free(id)).toEqual({ estado: 'mejorar', plan: 'BASICO' });
      expect(infoFuncion(id)?.titulo).toBeTruthy();
    }
  });
  it('lo de planes más arriba no se enseña (Nómina, Sales Hub, contabilidad, IA)', () => {
    for (const id of ['nomina', 'whatsapp-crm', 'flujo-caja', 'libros-contables', 'ai-ceo', 'prestamos']) {
      expect(free(id).estado).toBe('oculta');
    }
  });
  it('no cambia nada para los demás planes', () => {
    expect(accesoFuncion('cotizaciones', { planActual: 'BASICO' }).estado).toBe('libre');
    expect(accesoFuncion('reportes-dgii', { planActual: 'SERVICIOS' }).estado).toBe('libre');
    expect(accesoFuncion('ventas', { planActual: null }).estado).toBe('libre');
    expect(accesoFuncion('nomina', { planActual: 'BASICO' })).toEqual({ estado: 'mejorar', plan: 'PRO' });
  });
  it('el superadmin ve todo aunque la empresa sea FREE', () => {
    expect(accesoFuncion('nomina', { planActual: 'FREE', superAdmin: true }).estado).toBe('libre');
  });
  it('la lista de FREE no incluye nada con crédito ni comprobantes', () => {
    for (const id of ['recibo-ingreso', 'pago-suplidores', 'cotizaciones', 'reportes-dgii', 'dgii-monitor']) {
      expect(PERMITIDOS_FREE.has(id)).toBe(false);
    }
  });
});
