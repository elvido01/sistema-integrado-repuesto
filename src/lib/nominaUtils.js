// Motor de cálculo del módulo de Nómina (RD).
// Tasas y topes VIGENTES 2026 (TSS Resolución 01-2025; DGII DDG-AR1-2026-00001):
//   TSS empleado: AFP 2.87% (tope cotizable RD$464,460/mes)
//                 SFS 3.04% (tope cotizable RD$232,230/mes)
//   ISR anual   : exento hasta 416,220; 15% del exceso hasta 624,329;
//                 31,216 + 20% del exceso hasta 867,123; 79,776 + 25% arriba.
//   La base del ISR es el bruto MENOS la TSS del empleado.
// El período (quincenal/semanal) prorratea las retenciones mensuales.

export const TSS_2026 = {
  afpPct: 0.0287, afpTope: 464460,
  sfsPct: 0.0304, sfsTope: 232230,
};

export const ISR_2026 = [
  { hasta: 416220, fijo: 0, pct: 0, desde: 0 },
  { hasta: 624329, fijo: 0, pct: 0.15, desde: 416220 },
  { hasta: 867123, fijo: 31216, pct: 0.20, desde: 624329 },
  { hasta: Infinity, fijo: 79776, pct: 0.25, desde: 867123 },
];

const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

// 12 pagas mensuales = 24 quincenas = 52 semanas al año
export function factorPeriodo(frecuencia) {
  if (frecuencia === 'quincenal') return 0.5;
  if (frecuencia === 'semanal') return 12 / 52;
  return 1;
}

export function sueldoPorPeriodo(sueldoMensual, frecuencia) {
  return round2((Number(sueldoMensual) || 0) * factorPeriodo(frecuencia));
}

// TSS del MES del empleado (0 si no cotiza), con topes cotizables
export function calcularTssEmpleado(sueldoMensual, cotizaTss) {
  if (!cotizaTss) return { afp: 0, sfs: 0 };
  const s = Number(sueldoMensual) || 0;
  return {
    afp: round2(Math.min(s, TSS_2026.afpTope) * TSS_2026.afpPct),
    sfs: round2(Math.min(s, TSS_2026.sfsTope) * TSS_2026.sfsPct),
  };
}

// Retención de ISR del MES sobre la base mensual (bruto - TSS)
export function calcularIsrMensual(baseMensual) {
  const anual = (Number(baseMensual) || 0) * 12;
  const tramo = ISR_2026.find((t) => anual <= t.hasta) || ISR_2026[ISR_2026.length - 1];
  if (tramo.pct === 0) return 0;
  return round2((tramo.fijo + (anual - tramo.desde) * tramo.pct) / 12);
}

// Línea completa de nómina de un empleado para SU período de pago
export function calcularDetalleNomina(empleado, extras = {}) {
  const { adelantosDescuento = 0, otrosIngresos = 0, otrosDescuentos = 0 } = extras;
  const factor = factorPeriodo(empleado.frecuencia_pago);
  const sueldoBase = sueldoPorPeriodo(empleado.sueldo_mensual, empleado.frecuencia_pago);

  const tssMes = calcularTssEmpleado(empleado.sueldo_mensual, empleado.cotiza_tss);
  const tssAfp = round2(tssMes.afp * factor);
  const tssSfs = round2(tssMes.sfs * factor);

  const isrMes = calcularIsrMensual((Number(empleado.sueldo_mensual) || 0) - tssMes.afp - tssMes.sfs);
  const isr = round2(isrMes * factor);

  const neto = round2(
    sueldoBase + (Number(otrosIngresos) || 0)
    - tssAfp - tssSfs - isr
    - (Number(adelantosDescuento) || 0)
    - (Number(otrosDescuentos) || 0)
  );

  return { sueldo_base: sueldoBase, tss_afp: tssAfp, tss_sfs: tssSfs, isr, neto };
}

export function pendienteAdelanto(adelanto) {
  return round2((Number(adelanto?.monto) || 0) - (Number(adelanto?.descontado) || 0));
}

// Propuesta por defecto: descontar el pendiente completo de cada adelanto
// (el usuario puede bajar el monto en la nómina en borrador — fraccionable)
export function proponerDescuentos(adelantosPendientes) {
  return (adelantosPendientes || [])
    .filter((a) => (Number(a.pendiente) || 0) > 0)
    .map((a) => ({ id: a.id, monto: round2(a.pendiente) }));
}
