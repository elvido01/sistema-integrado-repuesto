import ExcelJS from 'exceljs';

// Exporta filas a un .xlsx. Se puede llamar de dos formas:
//
//   exportToExcel(data, 'Nombre_del_archivo')            <- la de siempre
//   exportToExcel(data, { clave: 'Titulo' }, 'Nombre')   <- titulos a mano
//
// La primera es la que usan las dos pantallas que exportan, y era la que NO
// funcionaba: la firma pedia (data, headers, fileName), asi que el nombre del
// archivo caia en `headers`. Object.keys('Listado_de_Productos') devuelve los
// INDICES del texto, o sea 20 columnas tituladas L, i, s, t, a, d, o... con
// claves '0','1','2' que no coinciden con ninguna columna de los datos: el
// Excel salia con encabezados de letras sueltas, SIN NINGUNA FILA, y llamado
// "undefined.xlsx". Comprobado ejecutandolo.
export const exportToExcel = async (data, headers, fileName) => {
  if (!ExcelJS) {
    console.error("ExcelJS library not found.");
    return;
  }

  // Si el segundo argumento es texto, es el nombre del archivo y los titulos
  // salen de los datos: la primera fila dice como se llama cada columna.
  if (typeof headers === 'string' || headers == null) {
    fileName = typeof headers === 'string' ? headers : (fileName || 'Datos');
    const primera = Array.isArray(data) && data.length > 0 ? data[0] : {};
    headers = Object.keys(primera).reduce((acc, k) => ({ ...acc, [k]: k }), {});
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Datos');

  const headerKeys = Object.keys(headers);

  worksheet.columns = headerKeys.map(key => ({
    header: headers[key],
    key: key,
    width: 20
  }));

  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF002060' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  
  worksheet.addRows(data);

  // Formato de dinero, solo en las columnas que EXISTEN. `getColumn('precio')`
  // con una clave que no esta en la hoja no devuelve null: ExcelJS lee el texto
  // como LETRA de columna ("precio" -> una columna astronomica) y revienta con
  // "Out of bounds". Eso es lo que tumbaba la exportacion entera.
  const currencyColumns = ['precio', 'costo', 'Precio', 'Costo'];
  currencyColumns.forEach(colKey => {
      if (!headerKeys.includes(colKey)) return;
      const col = worksheet.getColumn(colKey);
      if(col && col.key) {
          col.numFmt = '$#,##0.00';
      }
  });

  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};