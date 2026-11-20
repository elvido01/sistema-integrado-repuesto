// =====================================================================
// Imágenes de la documentación del cliente (tabla documentacion_clientes,
// bucket documentacion-clientes). Las usan Notas y Comentarios y
// Documentación Cliente.
//
// (20/11/2026) "Registro DGII": en TODAS las empresas tipo financiera (las de
// hoy y las que se creen), por pedido del dueño. En otro tipo de empresa solo
// se ve si el registro ya tiene esa imagen (p. ej. visto desde otra empresa del grupo).
// =====================================================================

export const DOC_FIELDS = [
  { key: 'cedula_pasaporte_path', label: 'Cédula / Pasaporte' },
  { key: 'matricula_moto_path', label: 'Matrícula Moto' },
  { key: 'placa_path', label: 'Placa' },
  { key: 'autorizacion_path', label: 'Autorización' },
  { key: 'carta_saldo_path', label: 'Carta de Saldo' },
  { key: 'seguro_path', label: 'Seguro' },
];

export const DOC_REGISTRO_DGII = { key: 'registro_dgii_path', label: 'Registro DGII' };

export const TIPOS_CON_REGISTRO_DGII = new Set(['financiera']);

/** Todas las imágenes posibles (para firmar enlaces, subir y borrar). */
export const TODOS_DOC_FIELDS = [...DOC_FIELDS, DOC_REGISTRO_DGII];

/** Las imágenes que se muestran para esta empresa y este registro. */
export const camposDocumentacion = (tipoNegocio, record) =>
  (TIPOS_CON_REGISTRO_DGII.has(String(tipoNegocio || '').toLowerCase()) || record?.[DOC_REGISTRO_DGII.key]) ? TODOS_DOC_FIELDS : DOC_FIELDS;

/** Clase de la cuadrícula según cuántas imágenes hay (6 o 7 por fila en pantalla grande). */
export const gridDocumentos = (n) => `grid grid-cols-2 md:grid-cols-3 ${n > 6 ? 'xl:grid-cols-7' : 'xl:grid-cols-6'} gap-3`;
