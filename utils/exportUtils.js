import ExcelJS from 'exceljs';
import PdfTable from 'pdfkit-table';
import fs from 'fs';

/**
 * Export data to Excel
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Column definitions { header: 'Name', key: 'name', width: 10 }
 * @param {string} worksheetName - Name of the worksheet
 * @returns {Promise<Buffer>} - Excel file buffer
 */
export const exportToExcel = async (data, columns, worksheetName = 'Data') => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(worksheetName);

  worksheet.columns = columns;

  // Add data
  worksheet.addRows(data);

  // Style header
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  return await workbook.xlsx.writeBuffer();
};

/**
 * Export data to PDF
 * @param {Array} data - Array of objects to export
 * @param {Array} headers - Array of header strings ['Name', 'Email']
 * @param {Array} keys - Array of object keys corresponding to headers ['name', 'email']
 * @param {string} title - PDF title
 * @returns {Promise<Buffer>} - PDF file buffer
 */
export const exportToPdf = async (data, headers, keys, title) => {
  return new Promise((resolve, reject) => {
    const doc = new PdfTable({ margin: 30, size: 'A4' });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Add title
    doc.fontSize(20).text(title, { align: 'center' });
    doc.moveDown();

    const rows = data.map(item => keys.map(key => {
        const val = item[key];
        return val === null || val === undefined ? '' : String(val);
    }));

    const table = {
      title: "",
      headers: headers,
      rows: rows,
    };

    doc.table(table, {
      prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
      prepareRow: () => doc.font('Helvetica').fontSize(10),
    });

    doc.end();
  });
};
