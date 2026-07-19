// Motor del módulo SAN (Ahorro Programado).
// Reglas: el plan reparte el objetivo en días iguales y el ÚLTIMO día
// absorbe el redondeo (el total siempre cuadra al centavo). Un pago se
// aplica en cascada: llena el día tocado y el excedente corre a los días
// siguientes; si es menor, el día queda Parcial con su saldo.

const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

export function planPagos(montoObjetivo, dias) {
  const objetivo = Number(montoObjetivo) || 0;
  const n = Math.max(1, Math.trunc(Number(dias) || 1));
  const pagoDiario = round2(objetivo / n);
  const ultimoDia = round2(objetivo - pagoDiario * (n - 1));
  return { pagoDiario, ultimoDia, dias: n };
}

// diasPendientes: [{ numero_dia, falta }] en orden (el día tocado primero,
// luego los siguientes). Devuelve cuánto aplicar a cada día y el sobrante.
export function aplicarPagoEnCascada(diasPendientes, monto) {
  let resto = round2(monto);
  const aplicaciones = [];
  for (const d of diasPendientes || []) {
    if (resto <= 0) break;
    const falta = round2(d.falta);
    if (falta <= 0) continue;
    const aplicar = Math.min(falta, resto);
    aplicaciones.push({ numero_dia: d.numero_dia, monto: round2(aplicar) });
    resto = round2(resto - aplicar);
  }
  return { aplicaciones, sobrante: round2(resto) };
}

// Estado visual de un cuadro del calendario ('hoy' se marca aparte con borde)
export function estadoDia(pago, hoyStr) {
  if (pago.estado === 'Pagado') return 'pagado';
  const vencido = pago.fecha_programada < hoyStr;
  if (vencido) return 'atrasado';
  if (pago.estado === 'Parcial') return 'parcial';
  return 'pendiente';
}

// SAN largos (365 días): el calendario se agrupa en bloques de 30 días.
// Los bloques completos se colapsan en una barra y solo se despliega
// donde el usuario está trabajando — así no hay que hacer scroll eterno.
export function agruparEnBloques(pagos, hoyStr, tamano = 30) {
  const arr = pagos || [];
  const bloques = [];
  for (let i = 0; i < arr.length; i += tamano) {
    const dias = arr.slice(i, i + tamano);
    if (!dias.length) break;
    bloques.push({
      indice: bloques.length,
      desde: dias[0].numero_dia,
      hasta: dias[dias.length - 1].numero_dia,
      fecha_desde: dias[0].fecha_programada,
      fecha_hasta: dias[dias.length - 1].fecha_programada,
      dias,
      programado: round2(dias.reduce((s, p) => s + (Number(p.monto_programado) || 0), 0)),
      pagado: round2(dias.reduce((s, p) => s + (Number(p.monto_pagado) || 0), 0)),
      completo: dias.every((p) => p.estado === 'Pagado'),
      tieneHoy: dias.some((p) => p.fecha_programada === hoyStr),
      atrasados: dias.filter((p) => estadoDia(p, hoyStr) === 'atrasado').length,
    });
  }
  return bloques;
}

// Qué bloques nacen abiertos: donde cae hoy y el primero sin terminar
// (si ya está todo pagado, el último).
export function bloquesAbiertos(bloques) {
  const set = new Set();
  const arr = bloques || [];
  const conHoy = arr.find((b) => b.tieneHoy);
  if (conHoy) set.add(conHoy.indice);
  const incompleto = arr.find((b) => !b.completo);
  if (incompleto) set.add(incompleto.indice);
  if (set.size === 0 && arr.length) set.add(arr[arr.length - 1].indice);
  return set;
}

export function estadisticasSan(pagos, hoyStr) {
  const arr = pagos || [];
  const meta = round2(arr.reduce((s, p) => s + (Number(p.monto_programado) || 0), 0));
  const ahorrado = round2(arr.reduce((s, p) => s + (Number(p.monto_pagado) || 0), 0));
  const completados = arr.filter((p) => p.estado === 'Pagado').length;
  const parciales = arr.filter((p) => p.estado === 'Parcial').length;
  const atrasadosArr = arr.filter((p) => estadoDia(p, hoyStr) === 'atrasado');
  const deudaAtrasada = round2(atrasadosArr.reduce(
    (s, p) => s + (Number(p.monto_programado) || 0) - (Number(p.monto_pagado) || 0), 0));
  const transcurridos = arr.filter((p) => p.fecha_programada <= hoyStr).length;
  return {
    completados,
    parciales,
    atrasados: atrasadosArr.length,
    pendientes: arr.length - completados,
    ahorrado,
    restante: round2(meta - ahorrado),
    porcentaje: meta > 0 ? Math.round((ahorrado / meta) * 100) : 0,
    deudaAtrasada,
    promedioDiario: transcurridos > 0 ? round2(ahorrado / transcurridos) : 0,
  };
}
