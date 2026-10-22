// (22/10/2026) La DGII exige el número de chasis en la descripción de la
// factura para endosar la matrícula. En MotoFlow el CÓDIGO de la moto es su
// chasis. Misma regla que el trigger de la base (sql/factura_chasis_en_descripcion.sql):
// código de 17 letras y números (con letras Y números: los de repuestos no
// son así) y que la descripción no lo traiga ya. Aquí se aplica para que el
// papel que sale al vender (se imprime con lo que hay en memoria) diga lo
// mismo que queda guardado. Máximo 80 letras, como el NombreItem del e-CF.
const ES_CHASIS = /^[A-Z0-9]{17}$/;

export function conChasis(codigo, descripcion) {
  const cod = String(codigo || '').trim().toUpperCase();
  const desc = String(descripcion || '');
  if (!ES_CHASIS.test(cod) || !/[0-9]/.test(cod) || !/[A-Z]/.test(cod)) return descripcion;
  if (desc.toUpperCase().includes(cod)) return descripcion;
  return `${desc.trim().replace(/\s+/g, ' ').slice(0, 80 - 26).trim()} CHASIS: ${cod}`;
}
