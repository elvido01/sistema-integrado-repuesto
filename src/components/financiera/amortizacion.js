// Calculo de amortizacion en el cliente (espejo de la RPC calc_amortizacion en
// sql/financiera_prestamos.sql) para la vista previa instantanea.

export const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

function addPeriodo(baseDate, k, frecuencia) {
  const d = new Date(baseDate);
  if (frecuencia === 'semanal') d.setDate(d.getDate() + (k - 1) * 7);
  else if (frecuencia === 'quincenal') d.setDate(d.getDate() + (k - 1) * 15);
  else d.setMonth(d.getMonth() + (k - 1));
  return d.toISOString().slice(0, 10);
}

export function calcAmortizacion({ monto, tasa, plazo, metodo, frecuencia, fechaPrimera, cuotaAjustada }) {
  const P = Number(monto) || 0;
  const i = (Number(tasa) || 0) / 100;
  const n = parseInt(plazo, 10) || 0;
  if (P <= 0 || n <= 0) return [];

  // Cuota ajustada (redondeo manual como el sistema viejo): si se especifica,
  // la cuota es fija = cuotaAjustada; capital = P/n e interes = cuota - capital.
  const adj = round2(cuotaAjustada);

  const base = fechaPrimera ? new Date(`${fechaPrimera}T00:00:00`) : null;
  let saldo = P;
  let sumCap = 0;
  let cuotaFija = 0;
  if (metodo === 'frances' && i > 0) {
    cuotaFija = round2((P * i) / (1 - Math.pow(1 + i, -n)));
  }

  // A VENCIMIENTO (interes periodico): NO se generan cuotas de interes por
  // adelantado. Va UNA sola linea con el capital, venciendo al final del
  // plazo; el interes lo acumula el sistema dia a dia (interes corriente),
  // igual que los prestamos a interes que vienen del sistema viejo.
  if (metodo === 'vencimiento') {
    return [{
      numero_cuota: 1,
      fecha_vencimiento: base ? addPeriodo(base, n, frecuencia) : '',
      capital: P,
      interes: 0,
      monto_cuota: P,
    }];
  }

  const rows = [];
  for (let k = 1; k <= n; k++) {
    let cap; let interes; let cuota;
    if (adj > 0) {
      // Cuota fija ajustada por el operador
      cap = round2(P / n);
      cuota = adj;
      interes = round2(adj - cap);
    } else if (metodo === 'frances') {
      if (i > 0) {
        interes = round2(saldo * i);
        cuota = cuotaFija;
        cap = round2(cuota - interes);
      } else {
        cap = round2(P / n);
        interes = 0;
        cuota = cap;
      }
    } else {
      // simple / flat: capital igual por cuota, interes fijo sobre el capital original
      cap = round2(P / n);
      interes = round2(P * i);
      cuota = round2(cap + interes);
    }
    if (k === n) {
      cap = round2(P - sumCap);
      cuota = adj > 0 ? adj : round2(cap + interes);
      if (adj > 0) interes = round2(adj - cap);
    }
    sumCap = round2(sumCap + cap);
    saldo = round2(saldo - cap);
    rows.push({
      numero_cuota: k,
      fecha_vencimiento: base ? addPeriodo(base, k, frecuencia) : '',
      capital: cap,
      interes,
      monto_cuota: cuota,
    });
  }
  return rows;
}

// Reparte un monto entre cuotas (mora -> interes -> capital, mas vieja primero).
// cuotas: [{ cuota_id, mora_pend, interes_pend, capital_pend, ... }] ya ordenadas.
export function distribuirAbono(cuotas, monto) {
  let rest = round2(monto);
  return (cuotas || []).map((c) => {
    const take = (amt) => {
      const t = Math.min(rest, Number(amt) || 0);
      rest = round2(rest - t);
      return round2(t);
    };
    const ab_mora = take(c.mora_pend);
    const ab_int = take(c.interes_pend);
    const ab_cap = take(c.capital_pend);
    return { ...c, ab_mora, ab_int, ab_cap, abono: round2(ab_mora + ab_int + ab_cap) };
  });
}
