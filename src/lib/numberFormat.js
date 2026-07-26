// Formato de MONTOS mientras se escribe: separador de miles y 2 decimales.
//   1234567.5  ->  "1,234,567.5"
//
// La implementación vivía duplicada en varias páginas (Compras, Solicitudes,
// Recibo de Pago, Nota de Crédito, Otras Transacciones). Aquí queda una sola
// fuente de verdad para poder usarla en todo el sistema.
//
// OJO: es para DINERO. NO usar en campos de año, días, cuotas, cantidades ni
// porcentajes — ahí el separador de miles estorba ("2,026" en vez de 2026).
//
// Uso en un <Input>:
//   <Input type="text" inputMode="decimal"
//          value={fmtMontoInput(form.monto)}
//          onChange={(e) => setForm({ ...form, monto: parseMontoInput(e.target.value) })} />
// El estado guarda el crudo ("1234567.5"), así Number(...) sigue funcionando.

/** Pone las comas de miles conservando lo que el usuario va tecleando. */
export const fmtMontoInput = (raw) => {
  if (raw === '' || raw == null) return '';
  const [ip, dp] = String(raw).split('.');
  const intFmt = ip ? Number(ip).toLocaleString('en-US') : '0';
  return dp !== undefined ? `${intFmt}.${dp}` : intFmt;
};

/** Limpia lo tecleado a un crudo 'entero.decimales(2)' sin comas. */
export const parseMontoInput = (value) => {
  let raw = String(value).replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
  const [ip, dp] = raw.split('.');
  return dp !== undefined ? `${ip}.${dp.slice(0, 2)}` : ip;
};
