import { describe, it, expect } from 'vitest';
import { buildRfceDesdeEcf } from '../supabase/functions/emitir-fiscal/dgii_rfce_produccion.ts';

// e-CF 32 firmado mínimo: lo único que el resumen lee de él.
const ecf = ({ comprador = '', formas = '' } = {}) =>
  '<?xml version="1.0" encoding="UTF-8"?><ECF><Encabezado><Version>1.0</Version>' +
  `<IdDoc><TipoeCF>32</TipoeCF><eNCF>E320000000032</eNCF><TipoIngresos>01</TipoIngresos><TipoPago>1</TipoPago>${formas}</IdDoc>` +
  '<Emisor><RNCEmisor>02800991560</RNCEmisor><RazonSocialEmisor>Prueba</RazonSocialEmisor><FechaEmision>06-11-2026</FechaEmision></Emisor>' +
  comprador +
  '<Totales><MontoGravadoTotal>1152.54</MontoGravadoTotal><TotalITBIS>207.46</TotalITBIS><MontoTotal>1360.00</MontoTotal></Totales>' +
  '</Encabezado><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>N1a6iCxyz</SignatureValue></Signature></ECF>';

// Un elemento vacío sale del firmador como <X/> y la DGII rechaza con "Firma Inválida".
const vacios = (xml) => xml.match(/<([A-Za-z]+)><\/\1>|<[A-Za-z]+\/>/g) || [];

describe('resumen RFCE de producción', () => {
  it('venta sin cliente: omite <Comprador> en vez de mandarlo vacío (E320000000032)', () => {
    const r = buildRfceDesdeEcf(ecf());
    expect(r).not.toContain('<Comprador');
    expect(vacios(r)).toEqual([]);
    expect(r).toContain('<CodigoSeguridadeCF>N1a6iC</CodigoSeguridadeCF>');
  });

  it('con Cliente Genérico: el comprador va igual que antes', () => {
    const r = buildRfceDesdeEcf(ecf({ comprador: '<Comprador><RazonSocialComprador>Cliente Genérico</RazonSocialComprador></Comprador>' }));
    expect(r).toContain('<Comprador><RazonSocialComprador>Cliente Genérico</RazonSocialComprador></Comprador>');
  });

  it('una forma de pago sin datos no deja un <FormaDePago> vacío', () => {
    const r = buildRfceDesdeEcf(ecf({ formas: '<TablaFormasPago><FormaDePago/><FormaDePago><FormaPago>1</FormaPago><MontoPago>1360.00</MontoPago></FormaDePago></TablaFormasPago>' }));
    expect(vacios(r)).toEqual([]);
    expect(r.match(/<FormaDePago>/g)).toHaveLength(1);
  });

  it('XML guardado sin totales: avisa claro en vez de mandar un resumen roto', () => {
    const roto = ecf().replace(/<Totales>[\s\S]*<\/Totales>/, '');
    expect(() => buildRfceDesdeEcf(roto)).toThrow(/totales/);
  });
});
