import { it, expect } from 'vitest';
import { buildReciboIngresoEscPos } from '@/services/escposReceipt';
it('RI sin facturas: concepto y sin balances', () => {
  const s = buildReciboIngresoEscPos({ numero: 'RI-000003', fecha: '2026-11-25', clienteNombre: 'Fam', balanceAnterior: 39235, totalPagado: 39235, balanceActual: 0, abonos: [], formasPago: [{ forma: 'Efectivo', monto: 39235 }], concepto: 'Colegio RC-000003: Año completo RD$41,300.00 - 5% (2,065.00) = 39,235.00' }, {});
  expect(s).toContain('CONCEPTO:'); expect(s).toContain('2,065.00'); expect(s).not.toContain('Balance Anterior'); expect(s).not.toContain('FACTURAS ABONADAS');
  const c = buildReciboIngresoEscPos({ numero: 'RI-4', fecha: '2026-11-25', clienteNombre: 'C', balanceAnterior: 100, totalPagado: 50, balanceActual: 50, abonos: [{ referencia: 'FT-9', monto_abono: 50 }], formasPago: [] }, {});
  expect(c).toContain('FT-9'); expect(c).toContain('Balance Anterior'); expect(c).not.toContain('CONCEPTO:');
});
