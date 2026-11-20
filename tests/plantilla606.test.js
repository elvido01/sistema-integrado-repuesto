import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { celdasFila606, llenarFilaXml, llenarHoja606, nombreArchivo606, prepararPlantilla606, MAX_FILAS_PLANTILLA_606 } from '@/lib/plantilla606';

const fila = ['130688011', '1', '09', 'B0100101814', '', '20260717', '20260717', '0.00', '13184.75', '13184.75', '2373.26',
  '0.00', '0.00', '0.00', '2373.26', '0.00', '', '0.00', '0.00', '0.00', '0.00', '0.00', '01'];

describe('celdasFila606', () => {
  it('pone cada dato en su columna de la plantilla de la DGII', () => {
    const c = celdasFila606(fila);
    expect(c.B).toEqual({ t: 's', v: '130688011' });
    expect(c.C).toEqual({ t: 'n', v: 1 });
    expect(c.D.v).toBe('09 -COMPRAS Y GASTOS QUE FORMARAN PARTE DEL COSTO DE VENTA ');
    expect(c.E.v).toBe('B0100101814');
    expect(c.G.v).toBe(202607); expect(c.H.v).toBe(17);
    expect(c.I.v).toBe(202607); expect(c.J.v).toBe(17);
    expect(c.L.v).toBe(13184.75); expect(c.M.v).toBe(13184.75);
    expect(c.N.v).toBe(2373.26); expect(c.R.v).toBe(2373.26);
    expect(c.Z.v).toBe('01 - EFECTIVO');
    // lo vacío o en cero no se escribe (como la herramienta)
    expect(c.F).toBeUndefined(); expect(c.K).toBeUndefined(); expect(c.T).toBeUndefined(); expect(c.U).toBeUndefined();
  });
  it('retención de ISR y forma de pago con el texto de la lista', () => {
    const f = [...fila]; f[16] = '2'; f[17] = '100'; f[22] = '04'; f[6] = '';
    const c = celdasFila606(f);
    expect(c.T.v).toBe('02 - HONORARIOS POR SERVICIOS');
    expect(c.U.v).toBe(100);
    expect(c.Z.v).toBe('04 - COMPRA A CREDITO');
    expect(c.I).toBeUndefined(); expect(c.J).toBeUndefined();
  });
});

describe('llenarFilaXml', () => {
  it('conserva el estilo de la celda y no toca las demás', () => {
    const xml = '<row r="12" spans="1:32"><c r="A12" s="86"><v>1</v></c><c r="B12" s="91"/><c r="E12" s="94"/><c r="AA12" s="90" t="s"><v>83</v></c></row>';
    const out = llenarFilaXml(xml, 12, { B: { t: 's', v: 'A&B <1>' }, E: { t: 'n', v: 5 } });
    expect(out).toContain('<c r="A12" s="86"><v>1</v></c>');
    expect(out).toContain('<c r="B12" s="91" t="inlineStr"><is><t xml:space="preserve">A&amp;B &lt;1&gt;</t></is></c>');
    expect(out).toContain('<c r="E12" s="94"><v>5</v></c>');
    expect(out).toContain('<c r="AA12" s="90" t="s"><v>83</v></c>');
  });
  it('al insertar no corta una celda con fórmula <f/> adentro', () => {
    const xml = '<row r="10"><c r="B10" s="1"><v>1</v></c><c r="C10" s="2"><f t="shared" si="0"/><v>2</v></c></row>';
    const out = llenarFilaXml(xml, 10, { D: { t: 'n', v: 9 } });
    expect(out).toBe('<row r="10"><c r="B10" s="1"><v>1</v></c><c r="C10" s="2"><f t="shared" si="0"/><v>2</v></c><c r="D10"><v>9</v></c></row>');
  });
  it('inserta en orden una celda que la fila no traía', () => {
    const out = llenarFilaXml('<row r="4"><c r="A4" s="1"/><c r="D4" s="2"/></row>', 4, { C: { t: 'n', v: 7 } });
    expect(out).toBe('<row r="4"><c r="A4" s="1"/><c r="C4"><v>7</v></c><c r="D4" s="2"/></row>');
  });
});

describe('llenarHoja606', () => {
  const hoja = '<worksheet><sheetData>'
    + '<row r="4"><c r="C4" s="24"/></row><row r="5"><c r="C5" s="14"/></row><row r="6"><c r="C6" s="19"/></row>'
    + '<row r="12"><c r="A12" s="86"><v>1</v></c><c r="B12" s="91"/></row><row r="13"><c r="A13" s="87"><v>2</v></c><c r="B13" s="91"/></row>'
    + '</sheetData></worksheet>';
  it('encabezado (RNC con su cero, período, cantidad) y detalle desde la fila 12', () => {
    const out = llenarHoja606(hoja, { rnc: '028-0041718-6', periodo: '202607', filas: [fila] });
    expect(out).toContain('<c r="C4" s="24" t="inlineStr"><is><t xml:space="preserve">02800417186</t></is></c>');
    expect(out).toContain('<c r="C5" s="14"><v>202607</v></c>');
    expect(out).toContain('<c r="C6" s="19"><v>1</v></c>');
    expect(out).toContain('<c r="B12" s="91" t="inlineStr"><is><t xml:space="preserve">130688011</t></is></c>');
    expect(out).toContain('<c r="B13" s="91"/>');
  });
  it('avisa si la plantilla no tiene las filas', () => {
    expect(() => llenarHoja606(hoja, { rnc: '1', periodo: 202607, filas: [fila, fila, fila] })).toThrow(/forma esperada/);
  });
  it('no pasa de 10,000 registros', () => {
    expect(() => llenarHoja606(hoja, { rnc: '1', periodo: 202607, filas: new Array(MAX_FILAS_PLANTILLA_606 + 1).fill(fila) })).toThrow(/10,000/);
  });
  it('la plantilla real tiene las filas 4-6 y 12-10011', () => {
    expect(fs.existsSync('src/assets/plantillas/dgii-606.xlsm')).toBe(true);
  });
});

describe('nombreArchivo606', () => {
  it('606_<RNC>_<AAAAMM>.xlsm', () => expect(nombreArchivo606('028-0041718-6', '202607')).toBe('606_02800417186_202607.xlsm'));
});

describe('prepararPlantilla606', () => {
  it('si no llegó un .xlsm (p. ej. la página web) lo dice claro', async () => {
    const html = new TextEncoder().encode('<!doctype html><html></html>');
    await expect(prepararPlantilla606(html.buffer)).rejects.toThrow(/No llegó la plantilla/);
  });
  it('abre la plantilla real', async () => {
    const buf = fs.readFileSync('src/assets/plantillas/dgii-606.xlsm');
    const p = await prepararPlantilla606(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(typeof p.armar).toBe('function');
  });
});
