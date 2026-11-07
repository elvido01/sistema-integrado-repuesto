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

/** Edad en años cumplidos a la fecha `hoy` (YYYY-MM-DD o Date). */
export function edadDe(fechaNacimiento, hoy = new Date()) {
  if (!fechaNacimiento) return null;
  const n = new Date(`${String(fechaNacimiento).slice(0, 10)}T12:00:00`);
  const h = hoy instanceof Date ? hoy : new Date(`${String(hoy).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(n.getTime())) return null;
  let e = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e -= 1;
  return e >= 0 ? e : null;
}

/**
 * Tarifa para un estudiante NUEVO.
 * - Si tiene un hermano activo en el colegio: la misma del hermano (si hay
 *   varios, la más baja: la del que lleva más tiempo). Regla del colegio.
 * - Si no: la tarifa activa más alta (la del nuevo ingreso de este año).
 */
export function tarifaParaNuevo(tarifas, hermanosActivos = []) {
  const conTarifa = (hermanosActivos || []).filter((h) => Number(h.tarifa_mensual) > 0);
  if (conTarifa.length) {
    const h = conTarifa.reduce((a, b) => (Number(b.tarifa_mensual) < Number(a.tarifa_mensual) ? b : a));
    return {
      monto: Number(h.tarifa_mensual),
      tarifa_id: h.tarifa_id || null,
      nota: `Tarifa del hermano: ${h.nombres || ''}`.trim(),
      porHermano: true,
    };
  }
  const activas = (tarifas || []).filter((t) => t.activa);
  if (!activas.length) return null;
  const t = activas.reduce((a, b) => (Number(b.monto) > Number(a.monto) ? b : a));
  return { monto: Number(t.monto), tarifa_id: t.id, nota: null, porHermano: false };
}

// ── Importar estudiantes desde la plantilla de Excel ─────────────────────
export const COLUMNAS_PLANTILLA = [
  'Familia (apellidos)', 'Nombres', 'Apellidos', 'Fecha de nacimiento (dd/mm/aaaa)', 'Lugar de nacimiento',
  'Curso', 'Tanda', 'Condición (nuevo/continuante)', 'Mensualidad', 'Beca %', 'Sala de Tareas (si/no)',
  'Madre', 'Teléfono madre', 'Padre', 'Teléfono padre', 'Tutor', 'Teléfono tutor', 'Dirección', 'Sector', 'Notas',
];

const quitarTildes = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const texto = (v) => { const s = String(v ?? '').trim(); return s || null; };

/** Fecha de Excel (número de serie) o texto dd/mm/aaaa → 'YYYY-MM-DD'. */
export function fechaDeExcel(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400000);   // 25569 = 1970-01-01 en serie de Excel
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const m = String(v).trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, dd, mm, aa] = m;
    if (aa.length === 2) aa = Number(aa) > 30 ? `19${aa}` : `20${aa}`;
    const iso = `${aa}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) || d.getDate() !== Number(dd) ? null : iso;
  }
  const iso = String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/**
 * Convierte las filas de la plantilla (arreglo de arreglos, con encabezado en
 * la fila 0) a estudiantes listos para guardar, agrupados por familia.
 * Devuelve { familias: Map<clave, {datos, estudiantes[]}>, errores: [{fila, motivo}] }.
 */
export function leerPlantillaEstudiantes(filas, cursos) {
  const errores = [];
  const familias = new Map();
  const cursoPorNombre = new Map((cursos || []).map((c) => [quitarTildes(c.nombre), c]));
  const cuerpo = (filas || []).slice(1);
  cuerpo.forEach((f, i) => {
    const filaN = i + 2;   // como la ve el usuario en Excel
    const c = (k) => f[COLUMNAS_PLANTILLA.indexOf(k)];
    const nombres = texto(c('Nombres'));
    const apellidos = texto(c('Apellidos'));
    if (!nombres && !apellidos) return;   // fila vacía
    if (!nombres || !apellidos) { errores.push({ fila: filaN, motivo: 'Faltan nombres o apellidos' }); return; }
    const curso = cursoPorNombre.get(quitarTildes(c('Curso')));
    if (!curso) { errores.push({ fila: filaN, motivo: `Curso no encontrado: "${c('Curso') ?? ''}"` }); return; }
    const tanda = quitarTildes(c('Tanda')) || curso.tandas?.[0] || 'matutina';
    if (!['matutina', 'vespertina', 'extendida', 'nocturna'].includes(tanda)) {
      errores.push({ fila: filaN, motivo: `Tanda no válida: "${c('Tanda')}"` }); return;
    }
    if (curso.tandas?.length && !curso.tandas.includes(tanda)) {
      errores.push({ fila: filaN, motivo: `${curso.nombre} no se da en la tanda ${tanda}` }); return;
    }
    const mensualidad = Number(String(c('Mensualidad') ?? '').replace(/[^\d.]/g, ''));
    if (!Number.isFinite(mensualidad) || mensualidad <= 0) { errores.push({ fila: filaN, motivo: 'Falta la mensualidad' }); return; }
    const beca = Number(String(c('Beca %') ?? '').replace(/[^\d.]/g, '')) || 0;
    if (beca < 0 || beca > 100) { errores.push({ fila: filaN, motivo: 'Beca fuera de 0-100' }); return; }
    const cond = quitarTildes(c('Condición (nuevo/continuante)')).startsWith('n') ? 'nuevo' : 'continuante';
    const fechaTxt = c('Fecha de nacimiento (dd/mm/aaaa)');
    const fecha = fechaDeExcel(fechaTxt);
    if (fechaTxt !== '' && fechaTxt != null && !fecha) { errores.push({ fila: filaN, motivo: `Fecha no válida: "${fechaTxt}"` }); return; }

    const madre = texto(c('Madre')); const padre = texto(c('Padre'));
    const claveFam = quitarTildes(c('Familia (apellidos)')) || quitarTildes(`${apellidos}|${madre || ''}|${padre || ''}`);
    if (!familias.has(claveFam)) {
      familias.set(claveFam, {
        datos: {
          nombre: texto(c('Familia (apellidos)')) || apellidos,
          madre_nombre: madre, madre_celular: texto(c('Teléfono madre')),
          padre_nombre: padre, padre_celular: texto(c('Teléfono padre')),
          tutor_nombre: texto(c('Tutor')), tutor_telefono: texto(c('Teléfono tutor')),
          direccion: texto(c('Dirección')), sector: texto(c('Sector')),
        },
        estudiantes: [],
      });
    }
    familias.get(claveFam).estudiantes.push({
      fila: filaN, nombres, apellidos, fecha_nacimiento: fecha, lugar_nacimiento: texto(c('Lugar de nacimiento')),
      curso_id: curso.id, tanda, condicion: cond, tarifa_mensual: mensualidad, beca_pct: beca,
      sala_tareas: quitarTildes(c('Sala de Tareas (si/no)')).startsWith('s'), notas: texto(c('Notas')),
    });
  });
  return { familias, errores };
}

/** Hoy en Santo Domingo (YYYY-MM-DD). */
export const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
/** Fecha local de Santo Domingo de un timestamptz (no la de UTC). */
export const fechaLocalRD = (ts) => (ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }) : '');
/** Lo que falta de un cargo (en su moneda), redondeado a centavos. */
export const pendienteDe = (c) => Math.max(0, Math.round((Number(c.monto) - Number(c.descuento) - Number(c.pagado)) * 100) / 100);
/** Estado del estudiante como se lee en pantalla. 'por_confirmar' = subió de curso en el
 *  cambio de año pero la familia no ha confirmado que sigue (fuera del aula, sin mensualidades). */
export const ESTADO_ESTUDIANTE = { activo: 'activo', por_confirmar: 'por confirmar', retirado: 'retirado', graduado: 'graduado' };

export const TANDAS_NOMBRE = { matutina: 'Matutina', vespertina: 'Vespertina', extendida: 'Extendida', nocturna: 'Nocturna' };

/** Días de atraso de un cargo pendiente (negativo = todavía no vence). */
export function diasAtraso(desde, hoy = hoyRD()) {
  if (!desde) return 0;
  const a = new Date(`${String(desde).slice(0, 10)}T12:00:00`);
  const b = new Date(`${hoy}T12:00:00`);
  return Math.round((b - a) / 86400000);
}

/** Tramo de antigüedad de saldos (lo que pidió el colegio: 30 / 60). */
export function tramoAntiguedad(dias) {
  if (dias <= 0) return 'por_vencer';
  if (dias <= 30) return 'd30';
  if (dias <= 60) return 'd60';
  return 'd60mas';
}

// (06/11/2026) Módulos que ve un colegio fuera del grupo Colegio: lo general
// de una empresa (caja, bancos, gastos, nómina, DGII, usuarios) y el inventario
// de UNIFORMES, que se maneja igual que en un repuestos (decisión del dueño).
export const MODULOS_EDUCATIVO = new Set([
  'ventas', 'devoluciones', 'mercancias', 'almacenes', 'entrada-mercancia', 'salida-mercancia',
  'orden-compra', 'solicitudes', 'tipos-producto', 'reporte-movimientos', 'inventario-fisico',
  'inventario-inteligente', 'etiquetas-masivas', 'clientes',
  'recibo-ingreso', 'compras', 'pago-suplidores', 'nomina', 'cuentas-bancarias',
  'reporte-compras', 'reporte-transacciones-diarias', 'reportes-dgii', 'libros-contables',
  'estado-resultados', 'flujo-caja', 'suplidores',
  'usuarios', 'config_sistema', 'perfil-empresa', 'cierre-caja', 'comprobantes-fiscales', 'dgii-monitor',
  // Sales Hub / CRM: solo EDUCA PRO o TOTAL a precio completo (lo decide el plan, ver lib/planes).
  'whatsapp-crm',
]);
export const esModuloDeColegio = (key) => String(key).startsWith('colegio-') || MODULOS_EDUCATIVO.has(key);

// Secretaria (lo que pidió el colegio): cobrar, inscribir, familias, caja del
// día, cierre de caja y ver quién está atrasado. NO configura, NO cuentas
// bancarias, NO borra (eso lo frena la base). Vende uniformes en Ventas.
export const PLANTILLA_SECRETARIA = [
  { module_key: 'colegio-caja', can_view: true, can_edit: true },
  { module_key: 'colegio-estudiantes', can_view: true, can_edit: true },
  { module_key: 'colegio-reportes', can_view: true, can_edit: false },
  { module_key: 'cierre-caja', can_view: true, can_edit: true },
  { module_key: 'ventas', can_view: true, can_edit: true },
  { module_key: 'clientes', can_view: true, can_edit: true },
];
