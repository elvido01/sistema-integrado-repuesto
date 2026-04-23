import ExcelJS from 'exceljs';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Descarga un respaldo completo de los datos del tenant actual
 * en un archivo Excel (.xlsx) con múltiples hojas.
 *
 * El usuario solo presiona un botón — no necesita conocimientos técnicos.
 */

// Definición de tablas a exportar y sus columnas legibles
const TABLAS = [
  {
    nombre: 'Productos',
    tabla: 'productos',
    select: 'codigo, referencia, descripcion, precio, costo, existencia, min_stock, max_stock, itbis_pct, activo, chasis, motor, color, anio, condicion, placa, matricula, created_at',
    columnas: {
      codigo: 'Código', referencia: 'Referencia', descripcion: 'Descripción',
      precio: 'Precio', costo: 'Costo', existencia: 'Existencia',
      min_stock: 'Mínima', max_stock: 'Máxima', itbis_pct: 'ITBIS %',
      activo: 'Activo', chasis: 'Chasis', motor: 'Motor', color: 'Color',
      anio: 'Año', condicion: 'Condición', placa: 'Placa', matricula: 'Matrícula',
      created_at: 'Fecha Creación',
    },
  },
  {
    nombre: 'Presentaciones',
    tabla: 'presentaciones',
    select: '*, productos(codigo, descripcion)',
    columnas: {
      'productos.codigo': 'Código Producto', 'productos.descripcion': 'Producto',
      tipo: 'Tipo', cantidad: 'Cantidad', costo: 'Costo',
      precio1: 'Precio 1', precio2: 'Precio 2', precio3: 'Precio 3',
      margen_pct: 'Margen %', afecta_ft: 'Afecta Factura', afecta_inv: 'Afecta Inventario',
    },
    flatten: (row) => ({
      ...row,
      'productos.codigo': row.productos?.codigo || '',
      'productos.descripcion': row.productos?.descripcion || '',
    }),
  },
  {
    nombre: 'Clientes',
    tabla: 'clientes',
    select: 'codigo, nombre, rnc, telefono, celular, direccion, email, limite_credito, dias_credito, activo, created_at',
    columnas: {
      codigo: 'Código', nombre: 'Nombre', rnc: 'RNC/Cédula',
      telefono: 'Teléfono', celular: 'Celular', direccion: 'Dirección',
      email: 'Email', limite_credito: 'Límite Crédito', dias_credito: 'Días Crédito',
      activo: 'Activo', created_at: 'Fecha Creación',
    },
  },
  {
    nombre: 'Proveedores',
    tabla: 'proveedores',
    select: 'codigo, nombre, rnc, telefono, direccion, email, activo, created_at',
    columnas: {
      codigo: 'Código', nombre: 'Nombre', rnc: 'RNC',
      telefono: 'Teléfono', direccion: 'Dirección', email: 'Email',
      activo: 'Activo', created_at: 'Fecha Creación',
    },
  },
  {
    nombre: 'Facturas',
    tabla: 'facturas',
    select: 'numero, fecha, cliente_id, manual_cliente_nombre, subtotal, descuento, itbis, total, forma_pago, estado, vendedor, notas, created_at',
    columnas: {
      numero: 'Número', fecha: 'Fecha', manual_cliente_nombre: 'Cliente',
      subtotal: 'Subtotal', descuento: 'Descuento', itbis: 'ITBIS',
      total: 'Total', forma_pago: 'Forma Pago', estado: 'Estado',
      vendedor: 'Vendedor', notas: 'Notas', created_at: 'Fecha Creación',
    },
  },
  {
    nombre: 'Facturas Detalle',
    tabla: 'facturas_detalle',
    select: '*, facturas(numero)',
    columnas: {
      'facturas.numero': 'Factura #', codigo: 'Código', descripcion: 'Descripción',
      cantidad: 'Cantidad', precio: 'Precio', descuento: 'Descuento',
      itbis: 'ITBIS', importe: 'Importe',
    },
    flatten: (row) => ({
      ...row,
      'facturas.numero': row.facturas?.numero || '',
    }),
  },
  {
    nombre: 'Cotizaciones',
    tabla: 'cotizaciones',
    select: 'numero, fecha_cotizacion, subtotal, descuento_total, itbis_total, monto_total, estado, notas, created_at',
    columnas: {
      numero: 'Número', fecha_cotizacion: 'Fecha', subtotal: 'Subtotal',
      descuento_total: 'Descuento', itbis_total: 'ITBIS', monto_total: 'Total',
      estado: 'Estado', notas: 'Notas', created_at: 'Fecha Creación',
    },
  },
  {
    nombre: 'Pedidos',
    tabla: 'pedidos',
    select: 'numero, fecha, subtotal, descuento_total, itbis_total, monto_total, estado, notas, created_at',
    columnas: {
      numero: 'Número', fecha: 'Fecha', subtotal: 'Subtotal',
      descuento_total: 'Descuento', itbis_total: 'ITBIS', monto_total: 'Total',
      estado: 'Estado', notas: 'Notas', created_at: 'Fecha Creación',
    },
  },
  {
    nombre: 'Solicitudes Compras',
    tabla: 'solicitudes_compras',
    select: 'numero, fecha, estado, cliente_nombre, cliente_rnc, marca, modelo, chasis, motor, color, anio, condicion, valor_contado, inicial, financiamiento, tiempo_meses, tasa_interes, total_pagares, cuota_mensual, tipo_financiamiento, incluye_placa, incluye_gps, incluye_casco, incluye_seguro, notas, created_at',
    columnas: {
      numero: 'Número', fecha: 'Fecha', estado: 'Estado',
      cliente_nombre: 'Cliente', cliente_rnc: 'RNC/Cédula',
      marca: 'Marca', modelo: 'Modelo', chasis: 'Chasis', motor: 'Motor',
      color: 'Color', anio: 'Año', condicion: 'Condición',
      valor_contado: 'Valor Contado', inicial: 'Inicial', financiamiento: 'Financiamiento',
      tiempo_meses: 'Meses', tasa_interes: 'Tasa %', total_pagares: 'Total Pagarés',
      cuota_mensual: 'Cuota Mensual', tipo_financiamiento: 'Tipo Financiamiento',
      incluye_placa: 'Placa', incluye_gps: 'GPS', incluye_casco: 'Casco',
      incluye_seguro: 'Seguro', notas: 'Notas', created_at: 'Fecha Creación',
    },
  },
  {
    nombre: 'Cartas de Ruta',
    tabla: 'cartas_ruta',
    select: 'numero, fecha, cliente_nombre, cliente_cedula, tipo, marca, modelo, color, anio, chasis, motor, placa, condicion, inicial, cuota_mensual, tiempo_meses, valor_contado, descripcion_factura, clausulas, created_at',
    columnas: {
      numero: 'Número', fecha: 'Fecha', cliente_nombre: 'Cliente',
      cliente_cedula: 'Cédula', tipo: 'Tipo', marca: 'Marca', modelo: 'Modelo',
      color: 'Color', anio: 'Año', chasis: 'Chasis', motor: 'Motor',
      placa: 'Placa', condicion: 'Condición', inicial: 'Inicial',
      cuota_mensual: 'Cuota', tiempo_meses: 'Meses', valor_contado: 'Valor Contado',
      descripcion_factura: 'Desc. Factura', clausulas: 'Cláusulas',
      created_at: 'Fecha Creación',
    },
  },
  {
    nombre: 'Cuentas por Cobrar',
    tabla: 'facturas',
    select: 'numero, fecha, manual_cliente_nombre, total, monto_pagado, balance, estado, dias_credito, created_at',
    filtro: (query) => query.eq('forma_pago', 'CREDITO').neq('estado', 'ANULADA'),
    columnas: {
      numero: 'Factura #', fecha: 'Fecha', manual_cliente_nombre: 'Cliente',
      total: 'Total', monto_pagado: 'Pagado', balance: 'Balance',
      estado: 'Estado', dias_credito: 'Días Crédito', created_at: 'Fecha Creación',
    },
  },
];

/**
 * Exportar respaldo completo del tenant
 * @param {string} empresaNombre - Nombre de la empresa (para el archivo)
 * @param {function} onProgress - Callback (mensaje) para mostrar progreso
 * @returns {Promise<{ok: boolean, tablas: number, registros: number}>}
 */
export async function descargarRespaldoTenant(empresaNombre, onProgress) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MotoFlow - Sistema de Gestión Integral';
  workbook.created = new Date();

  let totalRegistros = 0;
  let tablasExportadas = 0;

  for (const t of TABLAS) {
    try {
      onProgress?.(`Exportando ${t.nombre}...`);

      let query = supabase.from(t.tabla).select(t.select);
      if (t.filtro) query = t.filtro(query);
      query = query.order('created_at', { ascending: false }).limit(50000);

      const { data, error } = await query;
      if (error) {
        console.warn(`[Backup] Error en ${t.nombre}:`, error.message);
        continue;
      }
      if (!data || data.length === 0) continue;

      // Flatten nested objects if needed
      const rows = t.flatten ? data.map(t.flatten) : data;

      const worksheet = workbook.addWorksheet(t.nombre);
      const colKeys = Object.keys(t.columnas);

      // Header
      worksheet.columns = colKeys.map(key => ({
        header: t.columnas[key],
        key,
        width: Math.max(t.columnas[key].length + 4, 14),
      }));

      // Style header row
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1E3A' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FF333333' } },
        };
      });

      // Data rows
      rows.forEach((row, idx) => {
        const values = {};
        colKeys.forEach(key => {
          let val = key.includes('.') ? row[key] : row[key];
          if (val === true) val = 'Sí';
          if (val === false) val = 'No';
          if (val === null || val === undefined) val = '';
          values[key] = val;
        });
        const r = worksheet.addRow(values);
        // Alternate row color
        if (idx % 2 === 0) {
          r.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
          });
        }
      });

      // Auto-filter
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: colKeys.length },
      };

      // Freeze header row
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      totalRegistros += rows.length;
      tablasExportadas++;
    } catch (err) {
      console.warn(`[Backup] Excepción en ${t.nombre}:`, err);
    }
  }

  // Hoja resumen
  onProgress?.('Generando resumen...');
  const resumen = workbook.addWorksheet('Resumen', { properties: { tabColor: { argb: 'FF00AA00' } } });
  resumen.columns = [
    { header: 'Campo', key: 'campo', width: 25 },
    { header: 'Valor', key: 'valor', width: 40 },
  ];
  resumen.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1E3A' } };
  });
  resumen.addRows([
    { campo: 'Empresa', valor: empresaNombre },
    { campo: 'Fecha del Respaldo', valor: new Date().toLocaleString('es-DO') },
    { campo: 'Tablas Exportadas', valor: tablasExportadas },
    { campo: 'Total Registros', valor: totalRegistros },
    { campo: 'Generado por', valor: 'MotoFlow - Sistema de Gestión Integral' },
    { campo: 'Versión', valor: '1.0' },
  ]);

  // Descargar
  onProgress?.('Descargando archivo...');
  const fechaFile = new Date().toISOString().split('T')[0];
  const nombreLimpio = (empresaNombre || 'Empresa').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
  const fileName = `Respaldo_${nombreLimpio}_${fechaFile}`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);

  return { ok: true, tablas: tablasExportadas, registros: totalRegistros };
}
