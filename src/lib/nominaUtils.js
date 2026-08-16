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

// SEMANAL: se paga POR SÁBADO, no por promedio anual.
//   sueldo del sábado = mensual / 4   (20,000 → 5,000 SIEMPRE)
//   el período paga tantos sábados como le caigan: 4 → 20,000, 5 → 25,000
// Antes se usaba 12/52 = 0.2307, y el mismo empleado cobraba 4,615.38 un
// sábado y el mes de 5 sábados valía igual que el de 4.

// Cuántas veces cae un día de la semana entre dos fechas 'YYYY-MM-DD'.
// dow: 0 = domingo … 6 = sábado. Se cuenta en UTC para que no se corra un
// día por la zona horaria de RD.
export function pagosEnPeriodo(desde, hasta, dow = 6) {
  const ms = (s) => {
    const [y, m, d] = String(s || '').split('-').map(Number);
    return (y && m && d) ? Date.UTC(y, m - 1, d) : NaN;
  };
  const a = ms(desde), b = ms(hasta);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  let n = 0;
  for (let t = a; t <= b; t += 86400000) if (new Date(t).getUTCDay() === dow) n += 1;
  return n;
}

// Cuántos sueldos le tocan al empleado en el período (fuera del semanal, 1).
// Sin período definido asume UNO, igual que nomina_factor() en la base.
export function pagosDelEmpleado(empleado, periodo) {
  if (empleado?.frecuencia_pago !== 'semanal') return 1;
  if (!periodo?.desde || !periodo?.hasta) return 1;
  const dow = Number.isInteger(empleado?.dia_pago_semanal) ? empleado.dia_pago_semanal : 6;
  return pagosEnPeriodo(periodo.desde, periodo.hasta, dow);
}

export function factorPeriodo(frecuencia, periodo, empleado) {
  if (frecuencia === 'quincenal') return 0.5;
  if (frecuencia === 'semanal') {
    return pagosDelEmpleado({ ...empleado, frecuencia_pago: 'semanal' }, periodo) / 4;
  }
  return 1;
}

// Lo que cobra el empleado CADA sábado.
//
// >>> POR QUÉ ESTO NO SE DERIVA SIEMPRE (2026-08-15) <<<
// Dividir el sueldo mensual entre 4 y dividirlo entre 52/12 dan números
// distintos, y la diferencia no es un redondeo: a RD$26,000 mensuales son
// RD$6,500 o RD$6,000 por semana, o sea RD$26,000 al año — un sueldo
// mensual entero. No hay una respuesta correcta en abstracto: depende de
// cómo le paga el dueño a CADA persona.
//
// Así que si el empleado tiene su tarifa semanal puesta, manda esa y no se
// calcula nada. Solo cuando no la tiene se divide entre 4, que es como se
// venía haciendo y tiene su motivo: el sábado sale redondo y el mes es
// múltiplo exacto de él.
export function tarifaSabado(sueldoMensual, empleado) {
  const propia = Number(empleado?.sueldo_semanal) || 0;
  if (propia > 0) return round2(propia);
  return round2((Number(sueldoMensual) || 0) / 4);
}

export function sueldoPorPeriodo(sueldoMensual, frecuencia, periodo, empleado) {
  const s = Number(sueldoMensual) || 0;
  if (frecuencia === 'semanal') {
    // Se redondea el SÁBADO y luego se multiplica: el sábado tiene que ser
    // siempre el mismo número redondo y el mes, múltiplo exacto de él.
    return round2(tarifaSabado(s, empleado)
      * pagosDelEmpleado({ ...empleado, frecuencia_pago: 'semanal' }, periodo));
  }
  return round2(s * factorPeriodo(frecuencia));
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
  const { adelantosDescuento = 0, otrosIngresos = 0, otrosDescuentos = 0, periodo = null } = extras;
  const semanal = empleado.frecuencia_pago === 'semanal';
  const pagos = pagosDelEmpleado(empleado, periodo);
  const factor = factorPeriodo(empleado.frecuencia_pago, periodo, empleado);
  const sueldoBase = sueldoPorPeriodo(empleado.sueldo_mensual, empleado.frecuencia_pago, periodo, empleado);

  const tssMes = calcularTssEmpleado(empleado.sueldo_mensual, empleado.cotiza_tss);
  // En semanal el descuento del sábado también es fijo, para que el empleado
  // reciba el MISMO NETO todos los sábados.
  const tssAfp = semanal ? round2(round2(tssMes.afp / 4) * pagos) : round2(tssMes.afp * factor);
  const tssSfs = semanal ? round2(round2(tssMes.sfs / 4) * pagos) : round2(tssMes.sfs * factor);

  // Sin el switch TSS el empleado es informal: CERO descuentos de ley
  // (tampoco ISR, aunque el sueldo pase del tramo exento).
  const isrMes = empleado.cotiza_tss
    ? calcularIsrMensual((Number(empleado.sueldo_mensual) || 0) - tssMes.afp - tssMes.sfs)
    : 0;
  const isr = semanal ? round2(round2(isrMes / 4) * pagos) : round2(isrMes * factor);

  const neto = round2(
    sueldoBase + (Number(otrosIngresos) || 0)
    - tssAfp - tssSfs - isr
    - (Number(adelantosDescuento) || 0)
    - (Number(otrosDescuentos) || 0)
  );

  return { sueldo_base: sueldoBase, tss_afp: tssAfp, tss_sfs: tssSfs, isr, neto, pagos_periodo: pagos };
}

// Período sugerido al generar una nómina, con fecha de pago 15 y 30.
// hoyStr = 'YYYY-MM-DD' (zona RD). Devuelve strings 'YYYY-MM-DD'.
export function periodoSugerido(frecuencia, hoyStr) {
  const [y, m, d] = String(hoyStr).split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (yy, mm, dd) => `${yy}-${pad(mm)}-${pad(dd)}`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();  // último día del mes m (1-based)

  // Semanal: el período es UNA SEMANA (lunes a sábado). Cada sábado es un
  // sueldo y un compromiso propio en el dashboard, igual que el quincenal
  // tiene el suyo el 15 y el 30. El mes suma sus 4 o 5 sábados.
  if (frecuencia === 'semanal') {
    const base = new Date(Date.UTC(y, m - 1, d));
    const dow = (base.getUTCDay() + 6) % 7;                  // lunes = 0
    const lunes = new Date(base);  lunes.setUTCDate(d - dow);
    const sabado = new Date(base); sabado.setUTCDate(d - dow + 5);
    const fmt = (dt) => iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    return { desde: fmt(lunes), hasta: fmt(sabado), fecha_pago: fmt(sabado) };
  }
  if (frecuencia === 'mensual') {
    return { desde: iso(y, m, 1), hasta: iso(y, m, lastDay), fecha_pago: iso(y, m, lastDay) };
  }
  // quincenal: 1ra (paga 15) y 2da (paga 30, o último si el mes es más corto)
  if (d <= 15) {
    return { desde: iso(y, m, 1), hasta: iso(y, m, 15), fecha_pago: iso(y, m, 15) };
  }
  return { desde: iso(y, m, 16), hasta: iso(y, m, lastDay), fecha_pago: iso(y, m, Math.min(30, lastDay)) };
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
