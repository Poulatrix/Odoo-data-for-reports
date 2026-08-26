import * as XLSX from 'xlsx';
import { OdooFieldDefinition } from '../types/odoo';
import { getMany2OneDisplay } from './formatters';

export function exportToCSV(
  data: Record<string, any>[],
  columns?: string[],
  fieldDefs?: Record<string, OdooFieldDefinition>,
  filename: string = 'odoo_export.csv'
) {
  if (!data || data.length === 0) return;

  const cols = columns && columns.length > 0 ? columns : Object.keys(data[0] || {});
  const headers = cols.map(col => {
    const label = fieldDefs?.[col]?.string || col;
    return `"${label.replace(/"/g, '""')}"`;
  });

  const rows = data.map(row => {
    return cols.map(col => {
      let val = row[col];
      if (val === null || val === undefined) return '""';
      if (Array.isArray(val) && val.length >= 2) {
        val = val[1]; // take name of many2one
      }
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToExcel(
  data: Record<string, any>[],
  columns?: string[],
  fieldDefs?: Record<string, OdooFieldDefinition>,
  filename: string = 'odoo_export.xlsx'
) {
  if (!data || data.length === 0) return;

  const cols = columns && columns.length > 0 ? columns : Object.keys(data[0] || {});
  const cleanData = data.map(row => {
    const obj: Record<string, any> = {};
    cols.forEach(col => {
      const header = fieldDefs?.[col]?.string || col;
      let val = row[col];
      if (Array.isArray(val) && val.length >= 2) {
        val = val[1];
      }
      obj[header] = val ?? '';
    });
    return obj;
  });

  const worksheet = XLSX.utils.json_to_sheet(cleanData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Odoo Data');
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/**
 * Specialized Excel export for Bilan des Affaires à Facturer (Encours figé)
 * Adds the top header: "Bilan des affaires à facturer au : [Date D]"
 * Generates file: 'Bilan_Encours_Ecomi_[YYYY-MM-DD].xlsx'
 */
export function exportReportToExcel({
  data,
  columns,
  asOfDate,
  filename
}: {
  data: Record<string, any>[];
  columns?: string[];
  asOfDate?: string;
  filename?: string;
}) {
  if (!data || data.length === 0) return;

  const cols = columns && columns.length > 0 ? columns : Object.keys(data[0] || {});
  
  // Format date display for title (e.g. 31/07/2026 or DD/MM/YYYY)
  let formattedDateDisplay = '';
  if (asOfDate) {
    const parts = asOfDate.split('-');
    if (parts.length === 3) {
      formattedDateDisplay = `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else {
      formattedDateDisplay = asOfDate;
    }
  } else {
    const now = new Date();
    formattedDateDisplay = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const dateSlug = asOfDate || new Date().toISOString().slice(0, 10);
  const finalFilename = filename || `Bilan_Encours_Ecomi_${dateSlug}.xlsx`;

  // Row 1: Header title requested
  const titleRow = [`Bilan des affaires à facturer au : ${formattedDateDisplay}`];
  // Row 2: Empty separation line
  const emptyRow: string[] = [];
  // Row 3: Column headers
  const headerRow = cols;
  
  // Rows 4+: Clean data rows
  const dataRows = data.map(row => cols.map(col => {
    const val = row[col];
    if (val === null || val === undefined) return '';
    if (Array.isArray(val) && val.length >= 2) return val[1];
    return val;
  }));

  const aoa = [
    titleRow,
    emptyRow,
    headerRow,
    ...dataRows
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  // Set column widths
  worksheet['!cols'] = cols.map((col, idx) => {
    const headerLen = col.length;
    let maxLen = headerLen;
    dataRows.forEach(row => {
      const cellLen = String(row[idx] ?? '').length;
      if (cellLen > maxLen) maxLen = cellLen;
    });
    return { wch: Math.min(Math.max(maxLen + 3, 14), 45) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Bilan Encours');
  XLSX.writeFile(workbook, finalFilename.endsWith('.xlsx') ? finalFilename : `${finalFilename}.xlsx`);
}

export function exportToJSON(
  data: Record<string, any>[],
  filename: string = 'odoo_export.json'
) {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename.endsWith('.json') ? filename : `${filename}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
