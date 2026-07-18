// Utilidades puras del panel "Seguimientos de Hoy" (CRM crm_seguimiento).
// La fuente de verdad del "qué toca hoy" es la vista hermes_crm_hoy: el
// panel recibe sus ids como `idsHoy` y NO re-implementa ese criterio
// (incluye el gating de agotado_solicitado que espera la pieza).

// Igual que public.crm_whatsapp_phone_key: solo dígitos, sin el 1 de país.
export function normalizarTelefonoRD(valor) {
  const dig = String(valor || '').replace(/\D/g, '');
  return dig.length === 11 && dig.startsWith('1') ? dig.slice(1) : dig;
}

// 'vencido' | 'hoy' | 'proximo' | 'sin_fecha' comparando fechas YYYY-MM-DD
export function clasificarSeguimiento(ficha, hoyStr) {
  const f = ficha?.fecha_seguimiento || null;
  if (!f) return 'sin_fecha';
  if (f < hoyStr) return 'vencido';
  if (f > hoyStr) return 'proximo';
  return 'hoy';
}

const PESO_PRIORIDAD = { alta: 1, media: 2, baja: 3 };

// Alta primero; dentro de la misma prioridad, la fecha más vieja primero y
// las sin fecha al final (mismo criterio que hermes_crm_hoy).
export function ordenarSeguimientos(fichas) {
  return [...(fichas || [])].sort((a, b) => {
    const pa = PESO_PRIORIDAD[a.prioridad] || 2;
    const pb = PESO_PRIORIDAD[b.prioridad] || 2;
    if (pa !== pb) return pa - pb;
    if (a.fecha_seguimiento !== b.fecha_seguimiento) {
      if (!a.fecha_seguimiento) return 1;
      if (!b.fecha_seguimiento) return -1;
      return a.fecha_seguimiento < b.fecha_seguimiento ? -1 : 1;
    }
    return String(a.actualizado_en || '') < String(b.actualizado_en || '') ? -1 : 1;
  });
}

export function filtrarSeguimientos(fichas, filtros = {}, ctx = {}) {
  const { tab = 'hoy', estado = '', prioridad = '', canal = '', busqueda = '' } = filtros;
  const { hoyStr = '', idsHoy = new Set() } = ctx;
  const q = busqueda.trim().toLowerCase();
  const qTel = normalizarTelefonoRD(busqueda);

  return (fichas || []).filter((f) => {
    const clase = clasificarSeguimiento(f, hoyStr);
    if (tab === 'hoy' && !idsHoy.has(f.id)) return false;
    if (tab === 'vencidos' && !(idsHoy.has(f.id) && clase === 'vencido')) return false;
    if (tab === 'proximos' && clase !== 'proximo') return false;
    if (estado && f.estado !== estado) return false;
    if (prioridad && f.prioridad !== prioridad) return false;
    if (canal && f.canal_origen !== canal) return false;
    if (q) {
      const enTexto = [f.cliente_nombre, f.producto_consultado, f.codigo_producto]
        .some((v) => String(v || '').toLowerCase().includes(q));
      const enTel = qTel.length >= 3 && normalizarTelefonoRD(f.telefono).includes(qTel);
      if (!enTexto && !enTel) return false;
    }
    return true;
  });
}

// Resumen operativo del tope de la pantalla (sobre TODAS las fichas abiertas)
export function resumenSeguimientos(fichas, ctx = {}) {
  const { hoyStr = '', idsHoy = new Set() } = ctx;
  const abiertas = fichas || [];
  const enHoy = abiertas.filter((f) => idsHoy.has(f.id));
  return {
    hoy: enHoy.length,
    vencidos: enHoy.filter((f) => clasificarSeguimiento(f, hoyStr) === 'vencido').length,
    alta: enHoy.filter((f) => f.prioridad === 'alta').length,
    requiereAprobacion: abiertas.filter((f) => f.estado === 'requiere_aprobacion').length,
    agotadoSolicitado: abiertas.filter((f) => f.estado === 'agotado_solicitado').length,
  };
}

// Reglas de negocio del panel: perdido exige la razón; requiere_aprobacion
// (descuento, crédito, negociación, garantía, reclamo) exige la nota.
export function validarAccionEstado(estadoNuevo, nota) {
  const n = String(nota || '').trim();
  if (estadoNuevo === 'perdido' && !n) {
    return { ok: false, error: 'Para marcar perdido escribe la razón en la nota.' };
  }
  if (estadoNuevo === 'requiere_aprobacion' && !n) {
    return { ok: false, error: 'Requiere aprobación necesita la nota (qué pide el cliente).' };
  }
  return { ok: true, error: null };
}

// Las notas se acumulan con fecha (crm_upsert_seguimiento): la última línea
// es lo más reciente.
export function ultimaNota(notas) {
  const lineas = String(notas || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lineas.length ? lineas[lineas.length - 1] : '';
}
