// ============================================================
// Rangos e-NCF: leer lo que se escribe y validar el rango (31/10/2026)
// ------------------------------------------------------------
// Lo usa DgiiSecuenciasEcf.jsx. Cada autorización de la DGII trae SU
// vencimiento y el sistema guarda uno solo, así que un rango nuevo no se
// junta con el viejo: empieza después del último autorizado. La excepción
// es CORREGIR el rango cargado (mismo «Desde», otro «Hasta»), por si se
// tecleó mal. La base aplica la misma regla (sql/ecf_secuencia_sin_solape.sql).
// ============================================================

export const MAX_SECUENCIA = 9999999999;
export const TIPOS_ECF = ['31', '32', '33', '34', '41', '43', '44', '45', '46', '47'];

export const encf = (tipo, n) => `E${tipo}${String(n).padStart(10, '0')}`;

// El número pelado (600, "1,000") o el e-NCF completo (E320000000600).
// Devuelve { n, tipo } — tipo solo si vino el e-NCF — o { error }.
// Solo la coma vale como separador de miles (1,000). El punto no: en RD es
// decimal, y "600.500" podría ser 600 — no se adivina.
export function leerSecuencia(v) {
  const t = String(v || '').replace(/\s/g, '').toUpperCase();
  if (!t) return { error: 'vacio' };
  const m = t.match(/^E(\d{2})(\d{10})$/);
  if (m) return TIPOS_ECF.includes(m[1]) ? { n: Number(m[2]), tipo: m[1] } : { error: 'tipo' };
  if (/^\d{1,10}$/.test(t)) return { n: Number(t) };
  if (/^\d{1,3}(,\d{3})+$/.test(t)) {
    const n = Number(t.replace(/,/g, ''));
    if (n <= MAX_SECUENCIA) return { n };
  }
  return { error: 'formato' };
}

// actual = lo ya cargado de ese tipo ({ desde, hasta, ultimo, quedan }) o null.
// Devuelve { d, h, caso } con caso 'nuevo' | 'siguiente' | 'salto' | 'correccion',
// o { error }.
export function validarRango(tipo, desde, hasta, actual) {
  const d = leerSecuencia(desde), h = leerSecuencia(hasta);
  if (d.error === 'tipo' || h.error === 'tipo') return { error: 'Eso no es un e-NCF válido: revisa los dos números después de la E.' };
  if (d.error || h.error) {
    return { error: 'Escribe solo el número de secuencia (ej. 600) o el e-NCF completo (ej. E320000000600).' };
  }
  const otro = [d.tipo, h.tipo].find((t) => t && t !== tipo);
  if (otro) return { error: `Pegaste un e-NCF de E${otro}, pero arriba está elegido E${tipo}. Cambia el tipo.` };
  if (d.n < 1 || h.n < d.n) return { error: '«Desde» tiene que ser 1 o más y «Hasta» igual o mayor.' };
  if (!actual) return { d: d.n, h: h.n, caso: 'nuevo' };

  const aDesde = Number(actual.desde), aHasta = Number(actual.hasta), aUltimo = Number(actual.ultimo);
  if (d.n === aDesde) {
    if (h.n <= aUltimo) return { error: `Ya se usaron los e-NCF hasta ${encf(tipo, aUltimo)}: el «Hasta» corregido tiene que ser mayor.` };
    return { d: d.n, h: h.n, caso: 'correccion' };
  }
  if (d.n <= aHasta) {
    return { error: `E${tipo} ya tiene autorizado hasta ${encf(tipo, aHasta)}. El rango nuevo tiene que empezar después (normalmente en ${encf(tipo, aHasta + 1)}). Para corregir el rango cargado, deja «Desde» en ${encf(tipo, aDesde)}.` };
  }
  return { d: d.n, h: h.n, caso: d.n === aHasta + 1 ? 'siguiente' : 'salto' };
}

export const sugerirDesde = (fila) => {
  if (!fila) return '1';
  return Number(fila.hasta) < MAX_SECUENCIA ? String(Number(fila.hasta) + 1) : '';
};
