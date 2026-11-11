// RNC / cédula para comprobante fiscal (10/11/2026).
// Mismo criterio que el builder del e-CF (tipoEcfDeCliente): un RNC tiene 9
// dígitos y una cédula 11. Con otro largo la factura sale como consumo (E32)
// aunque el cliente esté marcado crédito fiscal.

export const soloDigitos = (v) => String(v || '').replace(/\D/g, '');

export function docFiscalValido(rnc) {
  const d = soloDigitos(rnc);
  return (d.length === 9 || d.length === 11) && !/^0+$/.test(d);
}

// Tipos de comprobante que exigen RNC/cédula del cliente.
const TIPOS_CON_RNC = new Set(['01', '14', '15', '31', '44', '45']);
export const tipoExigeRnc = (tipo) => TIPOS_CON_RNC.has(String(tipo || '').toUpperCase().replace(/^[BE]/, ''));

// Mensaje para el usuario, o null si está bien.
export function problemaDocFiscal(rnc, tipo) {
  if (!tipoExigeRnc(tipo)) return null;
  const d = soloDigitos(rnc);
  if (docFiscalValido(d)) return null;
  if (!d.length) return 'Para crédito fiscal hace falta el RNC o la cédula.';
  if (/^0+$/.test(d)) return 'El RNC/cédula no puede ser todo ceros.';
  return `El RNC/cédula tiene ${d.length} dígito${d.length === 1 ? '' : 's'}: un RNC lleva 9 y una cédula 11.`;
}

// (11/11/2026) Cómo lo escribe la DGII: RNC (9) 130-55836-1, cédula (11)
// 028-0015556-2. Solo para MOSTRAR: en la base se compara por dígitos.
// Lo que no sea 9 u 11 dígitos (pasaporte, vacío) se devuelve tal cual.
export function formatoDocDgii(v) {
  const d = soloDigitos(v);
  if (/^0+$/.test(d)) return String(v ?? '').trim(); // 000000000 = sin RNC, no se disfraza
  if (d.length === 9) return `${d.slice(0, 3)}-${d.slice(3, 8)}-${d.slice(8)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
  return String(v ?? '').trim();
}
