// ¿Cuánto de este pago sale de una cuenta, y en qué moneda?
//
// (2026-08-28) PS-000020: se le pagaron US$4,650.66 a TERUEL en EFECTIVO,
// con los dólares de la CAJA CHICA — Dólares. La caja siguió marcando
// US$4,651.00. El dinero salió y el saldo no se movió.
//
// >>> LA REGLA, Y POR QUE NO ES "EFECTIVO NO TOCA CUENTAS" <<<
// El efectivo en PESOS lo controla el cierre de caja: la caja del día ya le
// resta los pagos a suplidor en efectivo (sql/fix_caja_dia_pagos_efectivo).
// Restarlo además de una cuenta lo contaría dos veces.
//
// Los DÓLARES no están en ningún cierre —el cierre es en pesos—. La caja en
// dólares es el único sitio donde viven, así que sacar dólares de ella SÍ es
// una salida de cuenta aunque la forma de pago diga "Efectivo".
//
// Esta misma regla está escrita en corregir_forma_pago_suplidor(). Si se
// cambia aquí hay que cambiarla allá: si las dos no dicen lo mismo, crear un
// pago y corregirlo dejan saldos distintos.

const POR_BANCO = (forma) => forma === 'Transferencia' || forma === 'Cheque';

/**
 * Cuánto de las formas de pago sale de la cuenta elegida, en RD$.
 *
 * @param {Array}  formas  [{forma, monto}]
 * @param {object} cuenta  la cuenta elegida (hace falta su `moneda`)
 * @returns {number} monto en PESOS (las formas siempre se digitan en RD$)
 */
export function montoQueSaleDeLaCuenta(formas, cuenta) {
  if (!cuenta) return 0;
  const enDivisa = cuenta.moneda && cuenta.moneda !== 'DOP';
  return (formas || []).reduce((s, f) => {
    const sale = POR_BANCO(f?.forma) || (enDivisa && f?.forma === 'Efectivo');
    return sale ? s + (Number(f?.monto) || 0) : s;
  }, 0);
}

/**
 * Lo que hay que restarle a la cuenta, ya en SU moneda.
 * A una caja en dólares no se le pueden restar pesos: le dejaría el saldo
 * inventado, que es peor que no moverla.
 *
 * @returns {{monto: number, faltaTasa: boolean}}
 */
export function salidaParaLaCuenta(formas, cuenta, tasa) {
  const pesos = montoQueSaleDeLaCuenta(formas, cuenta);
  if (pesos <= 0) return { monto: 0, faltaTasa: false };
  if (!cuenta?.moneda || cuenta.moneda === 'DOP') return { monto: pesos, faltaTasa: false };
  if (!(Number(tasa) > 0)) return { monto: 0, faltaTasa: true };
  return { monto: Math.round((pesos / Number(tasa)) * 100) / 100, faltaTasa: false };
}

/**
 * ¿Hay que preguntar de qué cuenta salió?
 * Con una forma que va por banco, siempre. Con efectivo, solo cuando hay
 * dólares de por medio: es el caso en que el efectivo tiene una cuenta.
 */
export function hayQuePreguntarCuenta(formas, hayDolares) {
  return (formas || []).some((f) => POR_BANCO(f?.forma) || (hayDolares && f?.forma === 'Efectivo'));
}
