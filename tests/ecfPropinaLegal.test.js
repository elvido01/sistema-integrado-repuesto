import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'fs';
import { facturaToEcfInput, buildEcfXml } from '../supabase/functions/emitir-fiscal/dgii_xml_builder.ts';

// (13/11/2026) Propina legal en el e-CF: Tabla I código 001, 10 %, como
// impuesto adicional (formato e-CF v1.0, campos 104-110 y TablaImpuestoAdicional).
const emisor = { rnc_emisor: '02800530103', nombre_emisor: 'OSCAR ARISTY RICHIEZ', direccion: 'C/ JOSE A. SANTANA #13', fecha_vencimiento_secuencia: '2027-12-31' };
const cliente = { nombre: 'AMSTAR DMC S A', rnc: '101894229' };
const detalle = [{ descripcion: 'LAVADO NORMAL', cantidad: 1, precio: 515.47, itbis: 92.78, importe: 608.25, naturaleza: 'servicio' }];
const factura = (extra) => ({ id: 'f1', numero: 1, fecha: '2026-11-13T15:00:00Z', forma_pago: 'CREDITO', dias_credito: 30, total: 659.80, propina: 51.55, ...extra });

describe('e-CF con propina legal', () => {
  it('E31: TablaImpuestoAdicional en el ítem y 001 al 10% en Totales; MontoTotal la incluye', () => {
    const input = facturaToEcfInput(factura(), detalle, cliente, emisor, 'E310000000001');
    const xml = buildEcfXml('31', input);
    if (process.env.ECF_XML_OUT) writeFileSync(process.env.ECF_XML_OUT, xml);
    expect(xml).toContain('<TablaImpuestoAdicional><ImpuestoAdicional><TipoImpuesto>001</TipoImpuesto></ImpuestoAdicional></TablaImpuestoAdicional>');
    expect(xml).toMatch(/<TotalITBIS1>92\.78<\/TotalITBIS1>\s*<MontoImpuestoAdicional>51\.55<\/MontoImpuestoAdicional><ImpuestosAdicionales><ImpuestoAdicional><TipoImpuesto>001<\/TipoImpuesto><TasaImpuestoAdicional>10<\/TasaImpuestoAdicional><OtrosImpuestosAdicionales>51\.55<\/OtrosImpuestosAdicionales><\/ImpuestoAdicional><\/ImpuestosAdicionales>\s*<MontoTotal>659\.80<\/MontoTotal>/);
  });
  it('sin propina el XML no cambia', () => {
    const xml = buildEcfXml('31', facturaToEcfInput(factura({ propina: 0, total: 608.25 }), detalle, cliente, emisor, 'E310000000001'));
    expect(xml).not.toContain('ImpuestoAdicional');
    expect(xml).toContain('<MontoTotal>608.25</MontoTotal>');
  });
  it('una propina que no es el 10% no se emite', () => {
    expect(() => facturaToEcfInput(factura({ propina: 100 }), detalle, cliente, emisor, 'E310000000001')).toThrow(/10%/);
  });
  it('consumo (E32) con propina no se emite', () => {
    expect(() => facturaToEcfInput(factura(), detalle, { nombre: 'CLIENTE GENERICO', rnc: '' }, emisor, 'E320000000001')).toThrow(/E31/);
  });
});

import { propinaLegal } from '../src/lib/propinaLegal.js';
import { propinaLegalDgii } from '../supabase/functions/emitir-fiscal/dgii_xml_builder.ts';

describe('propina: misma cuenta en la venta y en el e-CF', () => {
  it('líneas con precio con ITBIS dan la misma propina que los MontoItem del XML', () => {
    const lineasVenta = [
      { cantidad: 1, precio: 608.25, descuento: 0, itbis_pct: 0.18 },
      { cantidad: 3, precio: 123.45, descuento: 10, itbis_pct: 0.18 },
      { cantidad: 2, precio: 50, descuento: 0, itbis_pct: 0 },
    ];
    // Como las guarda useVentas: precio = base / cantidad.
    const detalles = lineasVenta.map((l) => {
      const neto = l.cantidad * l.precio * (1 - l.descuento / 100);
      return { cantidad: l.cantidad, precio: neto / (1 + l.itbis_pct) / l.cantidad };
    });
    expect(propinaLegal(lineasVenta)).toBe(propinaLegalDgii(detalles));
  });
});
