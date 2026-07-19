// Cálculo puro del resumen SAN para la tarjeta del móvil.
// Sin dependencias de Supabase ni de React: así se puede probar aparte
// y reusar. Las mismas reglas que la web (src/lib/sanUtils.js).

export type SanRow = {
  id: string;
  nombre: string;
  monto_objetivo: number;
  monto_ahorrado: number;
  pago_diario: number;
  fecha_fin: string | null;
  dias: number;
};

// Días NO pagados con fecha <= hoy (lo que hace falta para estar al día)
export type PagoPendienteRow = {
  san_id: string;
  fecha_programada: string;
  saldo_pendiente: number;
};

export type SanResumen = {
  id: string;
  nombre: string;
  meta: number;
  ahorrado: number;
  restante: number;
  pagoDiario: number;
  porcentaje: number;
  fechaFin: string | null;
  diasAtrasados: number;
  faltaHoy: number;
  faltaAlDia: number;
};

const round2 = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

export function construirResumenSan(
  sanes: SanRow[] | null | undefined,
  pendientes: PagoPendienteRow[] | null | undefined,
  hoyStr: string
): SanResumen[] {
  const pend = pendientes || [];
  return (sanes || []).map((s) => {
    const mios = pend.filter((p) => p.san_id === s.id);
    const meta = Number(s.monto_objetivo) || 0;
    const ahorrado = round2(Number(s.monto_ahorrado) || 0);
    return {
      id: s.id,
      nombre: s.nombre,
      meta,
      ahorrado,
      restante: round2(meta - ahorrado),
      pagoDiario: Number(s.pago_diario) || 0,
      porcentaje: meta > 0 ? Math.round((ahorrado / meta) * 100) : 0,
      fechaFin: s.fecha_fin ?? null,
      diasAtrasados: mios.filter((p) => p.fecha_programada < hoyStr).length,
      faltaHoy: round2(mios
        .filter((p) => p.fecha_programada === hoyStr)
        .reduce((acc, p) => acc + (Number(p.saldo_pendiente) || 0), 0)),
      faltaAlDia: round2(mios.reduce((acc, p) => acc + (Number(p.saldo_pendiente) || 0), 0)),
    };
  });
}

export function totalesSan(resumenes: SanResumen[] | null | undefined) {
  const arr = resumenes || [];
  const comprometido = round2(arr.reduce((s, r) => s + r.meta, 0));
  const ahorrado = round2(arr.reduce((s, r) => s + r.ahorrado, 0));
  return {
    activos: arr.length,
    comprometido,
    ahorrado,
    porcentaje: comprometido > 0 ? Math.round((ahorrado / comprometido) * 100) : 0,
    faltaAlDia: round2(arr.reduce((s, r) => s + r.faltaAlDia, 0)),
  };
}
