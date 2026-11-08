import { describe, it, expect } from 'vitest';
import { permisosDashboard, TARJETAS_DASHBOARD } from '@/lib/permissionsHelper';

const p = (module_key, can_view = true, can_edit = false) => ({ module_key, can_view, can_edit });

describe('tarjetas del Dashboard por usuario', () => {
  it('admin y owner ven y editan todo', () => {
    for (const role of ['admin', 'owner']) {
      const { verTarjeta, editarTarjeta } = permisosDashboard({ role }, []);
      expect(TARJETAS_DASHBOARD.every(verTarjeta)).toBe(true);
      expect(editarTarjeta('dash-gastos')).toBe(true);
    }
  });

  it('gerente sin casillas de Dashboard sigue viendo todo (como antes)', () => {
    const { verTarjeta, editarTarjeta } = permisosDashboard({ role: 'gerente' }, [p('ventas')]);
    expect(TARJETAS_DASHBOARD.every(verTarjeta)).toBe(true);
    expect(editarTarjeta('dash-compromisos')).toBe(true);
  });

  it('subgerente con casillas: solo lo marcado', () => {
    const { verTarjeta, editarTarjeta } = permisosDashboard({ role: 'manager' },
      [p('dash-compromisos', true, true), p('dash-gastos', true, true), p('dash-suplidores', true, false)]);
    expect(verTarjeta('dash-compromisos')).toBe(true);
    expect(verTarjeta('dash-suplidores')).toBe(true);
    expect(editarTarjeta('dash-suplidores')).toBe(false);   // ve, pero no paga
    expect(verTarjeta('dash-flujo')).toBe(false);
    expect(verTarjeta('dash-plan')).toBe(false);
  });

  it('cajera: solo gastos diarios', () => {
    const { verTarjeta, editarTarjeta } = permisosDashboard({ role: 'seller' }, [p('dash-gastos', true, true)]);
    expect(TARJETAS_DASHBOARD.filter(verTarjeta)).toEqual(['dash-gastos']);
    expect(editarTarjeta('dash-gastos')).toBe(true);
  });

  it('sin casillas, un vendedor no ve ninguna (como antes)', () => {
    const { verTarjeta } = permisosDashboard({ role: 'seller' }, [p('ventas')]);
    expect(TARJETAS_DASHBOARD.some(verTarjeta)).toBe(false);
  });

  it('editar sin ver no cuenta', () => {
    const { editarTarjeta } = permisosDashboard({ role: 'seller' }, [p('dash-gastos', false, true)]);
    expect(editarTarjeta('dash-gastos')).toBe(false);
  });
});
