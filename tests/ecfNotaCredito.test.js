import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'fs';
import { notaToEcfInput, buildEcfXml } from '../supabase/functions/emitir-fiscal/dgii_xml_builder.ts';

// (14/11/2026) Nota de crédito electrónica (E34) de una devolución de venta.
// La devolución copia de la factura: precio = base SIN ITBIS y el MONTO de
// ITBIS de la línea (proporcional a lo devuelto).
const emisor = { rnc_emisor: '131123456', nombre_emisor: 'REPUESTOS DE PRUEBA SRL', direccion: 'C/ PRINCIPAL #1' };
const opts = { codigo_modificacion: '3', razon_modificacion: 'Devolución de mercancía', indicador_nota_credito: '0' };
const facturaE32 = { ncf: 'E320000000150', fecha: '2026-11-10' };

const xmlDe = (items, factura = facturaE32, cliente = null) => {
  const input = notaToEcfInput({ fecha: '2026-11-14', items, tipo: 'credito' }, factura, cliente, emisor, 'E340000000001', opts);
  return { input, xml: buildEcfXml('34', input) };
};
const tag = (xml, t) => (xml.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1];

describe('nota de crédito E34 de una devolución', () => {
  it('usa el ITBIS cobrado de la línea, no lo recalcula', () => {
    // 2 × 1,101.69 base; ITBIS cobrado 396.61 (no 396.60 de 2203.38 × 18 %)
    const { xml } = xmlDe([{ descripcion: 'BATERIA 12V', cantidad: 2, precio: 1101.69, itbis: 396.61 }]);
    expect(tag(xml, 'MontoGravadoTotal')).toBe('2203.38');
    expect(tag(xml, 'TotalITBIS')).toBe('396.61');
    expect(tag(xml, 'MontoTotal')).toBe('2599.99');
  });

  it('línea con ITBIS 0 sale exenta', () => {
    const { input } = xmlDe([{ descripcion: 'ACEITE', cantidad: 1, precio: 500, itbis: 0 }]);
    expect(input.items[0].indicador_facturacion).toBe('4');
    expect(input.totales.itbis_total).toBe(0);
  });

  it('referencia la factura con su fecha en DD-MM-AAAA y código 3', () => {
    const { xml } = xmlDe([{ descripcion: 'BUJIA', cantidad: 1, precio: 100, itbis: 18 }]);
    expect(tag(xml, 'NCFModificado')).toBe('E320000000150');
    expect(tag(xml, 'FechaNCFModificado')).toBe('10-11-2026');
    expect(tag(xml, 'CodigoModificacion')).toBe('3');
    expect(tag(xml, 'IndicadorNotaCredito')).toBe('0');
    expect(xml).not.toContain('FechaVencimientoSecuencia');
    // Para validar contra el XSD oficial de la DGII (e-CF 34 v1.0).
    if (process.env.NOTA_XML_OUT) writeFileSync(process.env.NOTA_XML_OUT, xml);
  });

  it('una nota de un E31 exige el RNC del comprador', () => {
    expect(() => xmlDe([{ descripcion: 'X', cantidad: 1, precio: 100, itbis: 18 }], { ncf: 'E310000000005', fecha: '2026-11-10' }, null))
      .toThrow(/comprador/);
    const { xml } = xmlDe([{ descripcion: 'X', cantidad: 1, precio: 100, itbis: 18 }],
      { ncf: 'E310000000005', fecha: '2026-11-10' }, { nombre: 'TALLER EL AMIGO SRL', rnc: '101894229' });
    expect(tag(xml, 'RNCComprador')).toBe('101894229');
  });
});
