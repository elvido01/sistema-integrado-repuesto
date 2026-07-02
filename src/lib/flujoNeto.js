// =====================================================================
// Helpers puros de la tarjeta "Flujo neto acumulado del mes".
// Sin dependencias de React ni de Supabase -> 100% testeables con vitest.
// La logica financiera pesada vive en el RPC get_flujo_neto_dashboard;
// aqui solo se derivan etiquetas/colores/estados a partir de numeros.
// =====================================================================

/**
 * Formato monetario central en pesos dominicanos.
 * Mantiene el mismo locale/moneda que el resto del sistema
 * (Intl 'es-DO' / 'DOP'), con opcion de ocultar decimales.
 *
 * formatCurrencyDOP(85000)            -> "RD$85,000.00"
 * formatCurrencyDOP(85000, { decimals: 0 }) -> "RD$85,000"
 * formatCurrencyDOP(-55000, { decimals: 0 }) -> "-RD$55,000"
 */
export const formatCurrencyDOP = (value, { decimals = 2 } = {}) => {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
};

/**
 * Compara el flujo del periodo actual contra el mismo periodo del mes
 * anterior y devuelve un objeto listo para pintar.
 *
 * Reglas (segun especificacion):
 *  - Sin datos previos o mes anterior en cero -> "Sin base comparable".
 *  - Anterior negativo y actual >= 0 -> recuperacion (monto, sin % enganoso).
 *  - Anterior positivo y actual < 0 -> el flujo paso de positivo a negativo.
 *  - Resto (mismo signo) -> mejora/deterioro con % relativo a |anterior|.
 *    (Incluye el caso "ambos negativos": si el deficit se achica, es mejora.)
 *
 * @returns {{
 *   tipo: 'sin_base'|'recuperacion'|'caida'|'mejora'|'deterioro',
 *   diferencia: number,
 *   variacionPorcentual: number|null,
 *   direccion: 'up'|'down'|'flat',
 *   tono: 'positivo'|'negativo'|'neutral',
 *   mensaje: string
 * }}
 */
export const computeComparacion = (flujoActual, flujoAnterior, tieneDatos = true) => {
  const actual = Number(flujoActual) || 0;
  const anterior = Number(flujoAnterior) || 0;
  const diferencia = actual - anterior;

  // Sin base comparable (mes anterior sin movimientos o exactamente en cero).
  if (!tieneDatos || anterior === 0) {
    return {
      tipo: 'sin_base',
      diferencia,
      variacionPorcentual: null,
      direccion: 'flat',
      tono: 'neutral',
      mensaje: 'Sin base comparable',
    };
  }

  // Recuperacion: venia negativo y ahora es cero o positivo.
  if (anterior < 0 && actual >= 0) {
    return {
      tipo: 'recuperacion',
      diferencia,
      variacionPorcentual: null,
      direccion: 'up',
      tono: 'positivo',
      mensaje: `Recuperación de ${formatCurrencyDOP(Math.abs(diferencia), { decimals: 0 })} frente al período anterior`,
    };
  }

  // Caida: venia positivo y ahora es negativo.
  if (anterior > 0 && actual < 0) {
    return {
      tipo: 'caida',
      diferencia,
      variacionPorcentual: null,
      direccion: 'down',
      tono: 'negativo',
      mensaje: 'El flujo pasó de positivo a negativo',
    };
  }

  // Mismo signo: mejora si la diferencia sube, deterioro si baja.
  const variacionPorcentual = (diferencia / Math.abs(anterior)) * 100;
  const mejora = diferencia >= 0;
  return {
    tipo: mejora ? 'mejora' : 'deterioro',
    diferencia,
    variacionPorcentual,
    direccion: mejora ? 'up' : 'down',
    tono: mejora ? 'positivo' : 'negativo',
    mensaje: `${mejora ? '+' : ''}${variacionPorcentual.toFixed(2)}% vs mismo período del mes anterior`,
  };
};

/**
 * Estado de cumplimiento de la meta a partir de la proyeccion al cierre.
 *  verde   -> proyeccion >= meta
 *  amarillo-> proyeccion entre 80% y 99% de la meta
 *  rojo    -> proyeccion < 80% de la meta
 *  gris    -> informacion insuficiente (sin meta configurada)
 */
export const computeMetaEstado = (proyeccion, meta) => {
  const m = Number(meta) || 0;
  const p = Number(proyeccion) || 0;
  if (m <= 0) return { estado: 'gris', porcentaje: null };

  const porcentaje = (p / m) * 100;
  if (porcentaje >= 100) return { estado: 'verde', porcentaje };
  if (porcentaje >= 80) return { estado: 'amarillo', porcentaje };
  return { estado: 'rojo', porcentaje };
};

// Clases Tailwind por tono de comparacion (texto principal + badge).
export const tonoClasses = {
  positivo: { text: 'text-emerald-600', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  negativo: { text: 'text-rose-600', badge: 'text-rose-700 bg-rose-50 border-rose-200' },
  neutral: { text: 'text-slate-600', badge: 'text-slate-600 bg-slate-50 border-slate-200' },
};

// Clases Tailwind por estado de meta.
export const metaEstadoClasses = {
  verde: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  amarillo: 'text-amber-600 bg-amber-50 border-amber-200',
  rojo: 'text-rose-600 bg-rose-50 border-rose-200',
  gris: 'text-slate-500 bg-slate-50 border-slate-200',
};
