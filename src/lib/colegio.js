// Utilidades de centros educativos (colegios). Ver sql/centros_educativos_base.sql

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Meses de cobro de un año escolar: [{ mes: 9, anio: 2026, nombre: 'Septiembre 2026' }, …] */
export function mesesDelAnio(anio) {
  if (!anio || !anio.meses) return [];
  return Array.from({ length: Number(anio.meses) }, (_, i) => {
    const m0 = Number(anio.mes_inicio) - 1 + i;
    const mes = (m0 % 12) + 1;
    const a = Number(anio.anio_inicio) + Math.floor(m0 / 12);
    return { mes, anio: a, nombre: `${MESES[mes - 1]} ${a}` };
  });
}

/** Tarifa sugerida para el nuevo ingreso: la más alta de las activas + el incremento. */
export function tarifaSugerida(tarifas, incremento) {
  const activas = (tarifas || []).filter((t) => t.activa).map((t) => Number(t.monto));
  if (!activas.length) return null;
  return Math.max(...activas) + Number(incremento || 0);
}

/** Total del año pagado completo: solo las mensualidades llevan el descuento. */
export function totalAnioCompleto(tarifaMensual, meses, descuentoPct) {
  const bruto = Number(tarifaMensual || 0) * Number(meses || 0);
  return Math.round(bruto * (1 - Number(descuentoPct || 0) / 100) * 100) / 100;
}
