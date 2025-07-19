import ExcelJS from 'exceljs';

export const exportToExcel = async (data, headers, fileName) => {
  const ExcelJS = window.ExcelJS;
  if (!ExcelJS) {
    console.error("ExcelJS library not found on window object.");
    return;
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

  const currencyColumns = ['precio', 'costo', 'existencia'];
  currencyColumns.forEach(colKey => {
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