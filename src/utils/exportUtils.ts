import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { 
  OdooFieldDefinition,
  WipOutflowInvoiceItem,
  WipOutflowReportSummary
} from '../types/odoo';

export interface UninvoicedProjectExportRow {
  projet: string;
  ventes: number;
  heures: number;
  valoCost: number;
  valoSell: number;
  factures: number;
  total: number;
  bdc: number | string;
  rentabilite: number;
}

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
        val = val[1];
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
 * High-Fidelity Excel export formatted strictly according to the user reference layout:
 * - Row 1: Title "Rapport projets (non totalement facturés)" spanning columns with dark navy blue fill (#1B365D) and bold white text
 * - Row 2: Subtitle "Extrait au DD/MM/YYYY — X projets" in italic slate font
 * - Row 3: Blank separator
 * - Row 4: Column headers with dark navy blue background (#1B365D), white bold text, auto-filter
 * - Rows 5+: Formatted numbers with 2 decimals (0.00 / #,##0.00), bold totals, and negative profitability highlighted in red
 */
export async function exportStyledReportToExcel({
  records,
  asOfDate,
  hourlyCostRate = 77.76,
  hourlySellingRate = 90.00,
  filename
}: {
  records: any[];
  asOfDate?: string;
  hourlyCostRate?: number;
  hourlySellingRate?: number;
  filename?: string;
}) {
  if (!records || records.length === 0) return;

  // Format date display (e.g. 04/08/2026 or DD/MM/YYYY)
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
  const finalFilename = filename || `Rapport_Projets_${dateSlug}.xlsx`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Odoo Datatables AA';
  workbook.lastModifiedBy = 'Odoo Datatables AA';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Rapport Projets', {
    views: [{ showGridLines: true }],
    pageSetup: { orientation: 'landscape', fitToPage: true }
  });

  // Column definitions & widths matching layout with Client and Pragma
  worksheet.columns = [
    { key: 'projet', width: 16 },
    { key: 'client', width: 28 },
    { key: 'ventes', width: 22 },
    { key: 'heures', width: 14 },
    { key: 'valo_cost', width: 18 },
    { key: 'valo_sell', width: 18 },
    { key: 'factures', width: 24 },
    { key: 'pragma', width: 26 },
    { key: 'total', width: 30 },
    { key: 'bdc', width: 26 },
    { key: 'rentabilite', width: 22 },
  ];

  const NAVY_BLUE_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF17365D' } // Dark Navy Blue matching image
  };

  const BORDER_LIGHT_GRAY: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };

  // ROW 1: Title Banner (merged from Col A to K)
  worksheet.mergeCells('A1:K1');
  const titleRow = worksheet.getRow(1);
  titleRow.height = 34;
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Rapport projets (non totalement facturés)';
  titleCell.fill = NAVY_BLUE_FILL;
  titleCell.font = {
    name: 'Calibri',
    size: 15,
    bold: true,
    color: { argb: 'FFFFFFFF' }
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  // ROW 2: Subtitle
  const subtitleRow = worksheet.getRow(2);
  subtitleRow.height = 22;
  const subtitleCell = worksheet.getCell('A2');
  subtitleCell.value = `Extrait au ${formattedDateDisplay} — ${records.length} projets`;
  subtitleCell.font = {
    name: 'Calibri',
    size: 10.5,
    italic: true,
    color: { argb: 'FF475569' }
  };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // ROW 3: Blank spacing row
  const spacerRow = worksheet.getRow(3);
  spacerRow.height = 10;

  // ROW 4: Table Headers
  const costRateLabel = Number.isInteger(hourlyCostRate) ? `${hourlyCostRate}€/h` : `${hourlyCostRate.toFixed(2).replace('.', ',')}€/h`;
  const sellRateLabel = Number.isInteger(hourlySellingRate) ? `${hourlySellingRate}€/h` : `${hourlySellingRate.toFixed(2).replace('.', ',')}€/h`;

  const headers = [
    'Projet',
    'Client',
    'Ventes à facturer\n(€)',
    'Heures',
    `Valorisation\n(${costRateLabel})`,
    `Valorisation\n(${sellRateLabel})`,
    'Factures fournisseur (€)',
    'Écritures directes /\nPragma (€)',
    `TOTAL (heures à ${sellRateLabel.split('/')[0]} + factures + pragma)`,
    'BDC (Commandé mais pas facturé)',
    'Rentabilité du projet (€)'
  ];

  const headerRow = worksheet.getRow(4);
  headerRow.height = 32;

  headers.forEach((hdr, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = hdr;
    cell.fill = NAVY_BLUE_FILL;
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: (idx === 0 || idx === 1) ? 'left' : 'center',
      wrapText: true
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F233D' } },
      left: { style: 'thin', color: { argb: 'FF2A4D7A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F233D' } },
      right: { style: 'thin', color: { argb: 'FF2A4D7A' } }
    };
  });

  // Enable AutoFilter on header row A4:K4
  worksheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: headers.length }
  };

  // Add Data Rows (Row 5+)
  let currentRowIndex = 5;

  records.forEach((r) => {
    const clientName = Array.isArray(r.partner_id) ? r.partner_id[1] : (r.partner_id || r.clientDisplay || '');
    const hours = Number(r.totalHours) || 0;
    const sales = Number(r.amount_untaxed) || 0;
    const valoCost = r.valuation77_76 !== undefined ? Number(r.valuation77_76) : Math.round(hours * hourlyCostRate * 100) / 100;
    const valoSell = r.valuation90 !== undefined ? Number(r.valuation90) : Math.round(hours * hourlySellingRate * 100) / 100;
    const vendorBillsVal = r.vendorBillsTotal !== undefined ? Number(r.vendorBillsTotal) : (r.vendorBills || []).reduce((sum: number, b: any) => sum + (b.price_subtotal !== undefined ? Number(b.price_subtotal) : (Number(b.debit || 0) - Number(b.credit || 0))), 0);
    const manualCostsVal = r.manualAnalyticCostsTotal !== undefined ? Number(r.manualAnalyticCostsTotal) : (r.manualAnalyticLines || []).reduce((sum: number, m: any) => sum + (Number(m.amount) || 0), 0);
    const totalCosts = Math.round((valoSell + vendorBillsVal + manualCostsVal) * 100) / 100;
    const bdcVal = r.purchaseOrdersPending ?? 0;
    const rentabilite = Math.round((sales - totalCosts) * 100) / 100;

    const row = worksheet.getRow(currentRowIndex);
    row.height = 20;

    // Col 1: Projet
    const c1 = row.getCell(1);
    c1.value = String(r.name || '');
    c1.alignment = { vertical: 'middle', horizontal: 'left' };
    c1.font = { name: 'Calibri', size: 10 };
    c1.border = BORDER_LIGHT_GRAY;

    // Col 2: Client
    const c2 = row.getCell(2);
    c2.value = String(clientName || '');
    c2.alignment = { vertical: 'middle', horizontal: 'left' };
    c2.font = { name: 'Calibri', size: 10 };
    c2.border = BORDER_LIGHT_GRAY;

    // Col 3: Ventes à facturer (€)
    const c3 = row.getCell(3);
    c3.value = sales;
    c3.numFmt = '#,##0.00';
    c3.alignment = { vertical: 'middle', horizontal: 'right' };
    c3.font = { name: 'Calibri', size: 10 };
    c3.border = BORDER_LIGHT_GRAY;

    // Col 4: Heures
    const c4 = row.getCell(4);
    c4.value = hours;
    c4.numFmt = '#,##0.00';
    c4.alignment = { vertical: 'middle', horizontal: 'right' };
    c4.font = { name: 'Calibri', size: 10 };
    c4.border = BORDER_LIGHT_GRAY;

    // Col 5: Valorisation (77,76€/h)
    const c5 = row.getCell(5);
    c5.value = valoCost;
    c5.numFmt = '#,##0.00';
    c5.alignment = { vertical: 'middle', horizontal: 'right' };
    c5.font = { name: 'Calibri', size: 10 };
    c5.border = BORDER_LIGHT_GRAY;

    // Col 6: Valorisation (90€/h)
    const c6 = row.getCell(6);
    c6.value = valoSell;
    c6.numFmt = '#,##0.00';
    c6.alignment = { vertical: 'middle', horizontal: 'right' };
    c6.font = { name: 'Calibri', size: 10 };
    c6.border = BORDER_LIGHT_GRAY;

    // Col 7: Factures fournisseur (€)
    const c7 = row.getCell(7);
    c7.value = vendorBillsVal;
    c7.numFmt = '#,##0.00';
    c7.alignment = { vertical: 'middle', horizontal: 'right' };
    c7.font = { name: 'Calibri', size: 10 };
    c7.border = BORDER_LIGHT_GRAY;

    // Col 8: Écritures directes / Pragma (€)
    const c8 = row.getCell(8);
    c8.value = manualCostsVal;
    c8.numFmt = '#,##0.00';
    c8.alignment = { vertical: 'middle', horizontal: 'right' };
    c8.font = { name: 'Calibri', size: 10 };
    c8.border = BORDER_LIGHT_GRAY;

    // Col 9: TOTAL (heures à 90€ + factures + pragma) (Bold)
    const c9 = row.getCell(9);
    c9.value = totalCosts;
    c9.numFmt = '#,##0.00';
    c9.alignment = { vertical: 'middle', horizontal: 'right' };
    c9.font = { name: 'Calibri', size: 10, bold: true };
    c9.border = BORDER_LIGHT_GRAY;

    // Col 10: BDC (Commandé mais pas facturé)
    const c10 = row.getCell(10);
    c10.value = bdcVal !== 0 ? bdcVal : '';
    if (typeof bdcVal === 'number' && bdcVal !== 0) {
      c10.numFmt = '#,##0.00';
    }
    c10.alignment = { vertical: 'middle', horizontal: 'right' };
    c10.font = { name: 'Calibri', size: 10 };
    c10.border = BORDER_LIGHT_GRAY;

    // Col 11: Rentabilité du projet (€) (Red if negative)
    const c11 = row.getCell(11);
    c11.value = rentabilite;
    c11.numFmt = '#,##0.00;[Red]-#,##0.00;0.00';
    c11.alignment = { vertical: 'middle', horizontal: 'right' };
    c11.font = {
      name: 'Calibri',
      size: 10,
      color: rentabilite < 0 ? { argb: 'FFB91C1C' } : undefined
    };
    c11.border = BORDER_LIGHT_GRAY;

    currentRowIndex++;
  });

  // Write file to buffer and trigger browser download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', finalFilename.endsWith('.xlsx') ? finalFilename : `${finalFilename}.xlsx`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Backward-compatible exportReportToExcel calling the styled generator
 */
export async function exportReportToExcel({
  data,
  asOfDate,
  filename
}: {
  data: Record<string, any>[];
  columns?: string[];
  asOfDate?: string;
  filename?: string;
}) {
  return exportStyledReportToExcel({
    records: data,
    asOfDate,
    filename
  });
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

/**
 * Export Excel Haute Fidélité pour le Contrôle et Suivi des Pointages (Timesheets)
 */
export async function exportTimesheetAuditToExcel({
  records,
  summary,
  startDate,
  endDate,
  thresholdHours = 7.0,
  filename
}: {
  records: any[];
  summary: any;
  startDate: string;
  endDate: string;
  thresholdHours?: number;
  filename?: string;
}) {
  const finalFilename = filename || `Controle_Pointages_Odoo_${startDate}_au_${endDate}.xlsx`;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Odoo DataTable SaaS';
  workbook.lastModifiedBy = 'Odoo DataTable SaaS';
  workbook.created = new Date();
  workbook.modified = new Date();

  // ----------------------------------------------------
  // FEUILLE 1 : SYNTHÈSE & ANOMALIES DE POINTAGE
  // ----------------------------------------------------
  const wsSummary = workbook.addWorksheet('Synthèse & Alertes', {
    views: [{ showGridLines: true }]
  });

  // Titre
  wsSummary.mergeCells('A1:K1');
  const titleCell = wsSummary.getCell('A1');
  titleCell.value = 'CONTRÔLE DE SAISIE DES HEURES & FEUILLES DE TEMPS ODOO';
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' } // Slate 800
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  wsSummary.getRow(1).height = 32;

  // Sous-titre
  wsSummary.mergeCells('A2:K2');
  const subTitleCell = wsSummary.getCell('A2');
  subTitleCell.value = `Période analysée : du ${startDate} au ${endDate} | Seuil journalier requis : ${thresholdHours}h/jour | Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`;
  subTitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
  subTitleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  wsSummary.getRow(2).height = 20;

  // Ligne blanche
  wsSummary.getRow(3).height = 10;

  // En-têtes du tableau
  const headers = [
    'Collaborateur',
    'Département',
    'Poste / Rôle',
    'Statut Global',
    'Jours Non Pointés (0h)',
    'Jours Incomplets (< seuil)',
    'Dates Exactes Non Pointées',
    'Heures Saisies',
    'Heures Attendues',
    'Taux de Conformité',
    'Dernier Pointage Enregistré'
  ];

  const headerRow = wsSummary.getRow(4);
  headerRow.height = 28;

  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' } // Slate 900
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: idx >= 4 && idx <= 9 ? 'center' : 'left',
      wrapText: true
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: { style: 'medium', color: { argb: 'FF0284C7' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } }
    };
  });

  // Remplissage des lignes de données
  let rowNum = 5;
  for (const emp of records) {
    const r = wsSummary.getRow(rowNum);
    r.height = 22;

    const hasMissing = emp.missingDaysCount > 0;
    const hasIncomplete = emp.incompleteDaysCount > 0;
    const statusText = hasMissing ? 'NON POINTÉ' : (hasIncomplete ? 'INCOMPLET' : 'À JOUR');

    // Dates non pointées formatées (ex: 25/08, 26/08)
    const missingFormatted = (emp.missingDates || []).map((d: string) => {
      const parts = d.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
    }).join(', ');

    const lastPointageStr = emp.lastRecordedDate 
      ? `${emp.lastRecordedDate} (${emp.lastRecordedHours || 0}h)` 
      : 'Aucun enregistrement';

    r.getCell(1).value = emp.name;
    r.getCell(2).value = emp.departmentName || 'Général';
    r.getCell(3).value = emp.jobTitle || 'Opérateur';
    r.getCell(4).value = statusText;
    r.getCell(5).value = emp.missingDaysCount;
    r.getCell(6).value = emp.incompleteDaysCount;
    r.getCell(7).value = missingFormatted || '—';
    r.getCell(8).value = emp.totalHours;
    r.getCell(9).value = emp.expectedHours;
    r.getCell(10).value = (emp.complianceRate || 0) / 100;
    r.getCell(11).value = lastPointageStr;

    // Styles des cellules
    for (let c = 1; c <= 11; c++) {
      const cell = r.getCell(c);
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (rowNum % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      }
    }

    // Alignements & Formats numériques
    r.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    r.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    
    // Badge de statut couleur
    if (statusText === 'NON POINTÉ') {
      r.getCell(4).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFDC2626' } };
      r.getCell(5).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFDC2626' } };
      r.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    } else if (statusText === 'INCOMPLET') {
      r.getCell(4).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFD97706' } };
      r.getCell(6).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFD97706' } };
      r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    } else {
      r.getCell(4).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF16A34A' } };
    }

    r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(7).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(7).font = { name: 'Calibri', size: 9, italic: true, color: hasMissing ? { argb: 'FFB91C1C' } : { argb: 'FF64748B' } };

    r.getCell(8).numFmt = '#,##0.0 "h"';
    r.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };

    r.getCell(9).numFmt = '#,##0.0 "h"';
    r.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };

    r.getCell(10).numFmt = '0.0%';
    r.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(10).font = { name: 'Calibri', size: 10, bold: true };

    rowNum++;
  }

  // Ligne de Totalisation
  const totRow = wsSummary.getRow(rowNum);
  totRow.height = 24;
  totRow.getCell(1).value = 'TOTAL / SYNTHÈSE GLOBALE';
  totRow.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };

  totRow.getCell(5).value = summary?.totalMissingDays || 0;
  totRow.getCell(6).value = summary?.totalIncompleteDays || 0;
  totRow.getCell(8).value = summary?.totalRecordedHours || 0;
  totRow.getCell(9).value = summary?.totalExpectedHours || 0;
  totRow.getCell(10).value = (summary?.overallComplianceRate || 0) / 100;

  for (let c = 1; c <= 11; c++) {
    const cell = totRow.getCell(c);
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } }
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }
    };
    if (c === 5 || c === 6) cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (c === 8 || c === 9) {
      cell.numFmt = '#,##0.0 "h"';
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    }
    if (c === 10) {
      cell.numFmt = '0.0%';
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  // Largeurs des colonnes de la feuille 1
  wsSummary.columns = [
    { width: 28 }, // Collaborateur
    { width: 22 }, // Département
    { width: 26 }, // Poste
    { width: 16 }, // Statut
    { width: 18 }, // Jours non pointés
    { width: 18 }, // Jours incomplets
    { width: 28 }, // Dates exactes
    { width: 16 }, // Heures saisies
    { width: 16 }, // Heures attendues
    { width: 18 }, // Taux de conformité
    { width: 30 }  // Dernier pointage
  ];

  // ----------------------------------------------------
  // FEUILLE 2 : MATRICE JOURNALIÈRE (DATE X COLLABORATEUR)
  // ----------------------------------------------------
  const dateList = summary?.dateList || [];
  if (dateList.length > 0) {
    const wsMatrix = workbook.addWorksheet('Matrice Journalière', {
      views: [{ showGridLines: true }]
    });

    // Titre Matrice
    const totalCols = 3 + dateList.length + 1;
    wsMatrix.mergeCells(1, 1, 1, totalCols);
    const mTitleCell = wsMatrix.getCell(1, 1);
    mTitleCell.value = `MATRICE DES POINTAGES JOURNALIERS (${startDate} au ${endDate})`;
    mTitleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    mTitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }
    };
    mTitleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    wsMatrix.getRow(1).height = 30;

    // En-têtes de la Matrice
    const mHeaderRow = wsMatrix.getRow(3);
    mHeaderRow.height = 26;

    mHeaderRow.getCell(1).value = 'Collaborateur';
    mHeaderRow.getCell(2).value = 'Département';
    mHeaderRow.getCell(3).value = 'Rôle';

    for (let c = 1; c <= 3; c++) {
      const cell = mHeaderRow.getCell(c);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    }

    dateList.forEach((dObj: any, dIdx: number) => {
      const colIndex = 4 + dIdx;
      const cell = mHeaderRow.getCell(colIndex);
      cell.value = dObj.formattedDate || dObj.date;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: dObj.isWeekend ? { argb: 'FF475569' } : { argb: 'FF0F172A' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const totColIdx = 4 + dateList.length;
    const totHeaderCell = mHeaderRow.getCell(totColIdx);
    totHeaderCell.value = 'Total Période';
    totHeaderCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    totHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0369A1' } }; // Blue
    totHeaderCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Données matrice
    let mRowNum = 4;
    for (const emp of records) {
      const r = wsMatrix.getRow(mRowNum);
      r.height = 20;

      r.getCell(1).value = emp.name;
      r.getCell(1).font = { bold: true, color: { argb: 'FF0F172A' } };
      r.getCell(2).value = emp.departmentName || 'Général';
      r.getCell(3).value = emp.jobTitle || 'Opérateur';

      dateList.forEach((dObj: any, dIdx: number) => {
        const colIndex = 4 + dIdx;
        const cell = r.getCell(colIndex);
        const dayEntry = emp.days?.[dObj.date];
        const hours = dayEntry ? dayEntry.hours : 0;
        const status = dayEntry?.status;

        cell.value = hours;
        cell.numFmt = '0.0 "h"';
        cell.alignment = { vertical: 'middle', horizontal: 'center' };

        if (status === 'missing') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // Light red
          cell.font = { bold: true, color: { argb: 'FFDC2626' } };
        } else if (status === 'incomplete') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Light orange
          cell.font = { bold: true, color: { argb: 'FFD97706' } };
        } else if (status === 'ok') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // Light green
          cell.font = { color: { argb: 'FF15803D' } };
        } else if (dObj.isWeekend) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          cell.font = { color: { argb: 'FF94A3B8' } };
        }
      });

      const totalCell = r.getCell(totColIdx);
      totalCell.value = emp.totalHours;
      totalCell.numFmt = '#,##0.0 "h"';
      totalCell.font = { bold: true, color: { argb: 'FF0369A1' } };
      totalCell.alignment = { vertical: 'middle', horizontal: 'right' };

      mRowNum++;
    }

    // Largeurs colonnes matrice
    wsMatrix.getColumn(1).width = 26;
    wsMatrix.getColumn(2).width = 20;
    wsMatrix.getColumn(3).width = 22;
    for (let c = 4; c <= totColIdx; c++) {
      wsMatrix.getColumn(c).width = 14;
    }
  }

  // Écriture du fichier et téléchargement
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', finalFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exporte le Rapport de Sorties d'Encours Achats au format Excel (.xlsx) professionnel
 * Avec feuille synthèse par facture client et feuille détail des pièces fournisseurs rattachées
 */
export async function exportWipPurchasesOutflowToExcel(params: {
  records: WipOutflowInvoiceItem[];
  summary: WipOutflowReportSummary;
  filename?: string;
}) {
  const { records = [], summary, filename } = params;
  const monthLabel = summary.selectedMonthLabel || summary.selectedMonthKey || 'Mois';
  const finalFilename = filename || `Sorties_Encours_Achats_${summary.selectedMonthKey || 'Export'}.xlsx`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ecomi Live - Sorties d\'Encours Achats';
  workbook.created = new Date();

  // ==========================================
  // FEUILLE 1 : SYNTHÈSE DES AFFAIRES FACTURÉES
  // ==========================================
  const wsMain = workbook.addWorksheet('Sorties d\'Encours Achats', {
    views: [{ showGridLines: true }]
  });

  // Titre & Métadonnées
  wsMain.mergeCells('A1:H1');
  const titleCell = wsMain.getCell('A1');
  titleCell.value = `BILAN DES SORTIES D'ENCOURS ACHATS — ${monthLabel.toUpperCase()}`;
  titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2559' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  wsMain.getRow(1).height = 36;

  // Sous-titre
  wsMain.mergeCells('A2:H2');
  const subTitleCell = wsMain.getCell('A2');
  subTitleCell.value = `Extraction des Factures Clients émises sur ${monthLabel} et consolidation des Achats Fournisseurs rattachés sortant de l'encours`;
  subTitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
  subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  subTitleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  wsMain.getRow(2).height = 22;

  // Cartouches KPI en ligne 4
  wsMain.getRow(3).height = 10; // Espacement

  wsMain.getCell('A4').value = 'Total Ventes Facturées HT :';
  wsMain.getCell('B4').value = summary.totalInvoicedSalesUntaxed;
  wsMain.getCell('B4').numFmt = '#,##0.00 "€"';

  wsMain.getCell('C4').value = 'Total Achats Sortis Encours HT :';
  wsMain.getCell('D4').value = summary.totalPurchasesOutflowUntaxed;
  wsMain.getCell('D4').numFmt = '#,##0.00 "€"';

  wsMain.getCell('E4').value = 'Marge Brute Sortie HT :';
  wsMain.getCell('F4').value = summary.totalGrossMarginUntaxed;
  wsMain.getCell('F4').numFmt = '#,##0.00 "€"';

  wsMain.getCell('G4').value = 'Taux de Marge Réalisé :';
  wsMain.getCell('H4').value = summary.overallMarginRate / 100;
  wsMain.getCell('H4').numFmt = '0.0%';

  ['A4', 'C4', 'E4', 'G4'].forEach(c => {
    const cell = wsMain.getCell(c);
    cell.font = { bold: true, color: { argb: 'FF475569' }, size: 9 };
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  ['B4', 'D4', 'F4', 'H4'].forEach(c => {
    const cell = wsMain.getCell(c);
    cell.font = { bold: true, color: { argb: 'FF0B2559' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });
  wsMain.getRow(4).height = 26;

  wsMain.getRow(5).height = 12; // Espacement

  // En-têtes du Tableau
  const mainHeaders = [
    'N° Facture Client',
    'Date Facture',
    'Commande / Affaire',
    'Réf. Client',
    'Client',
    'Total Vente Facturée (€ HT)',
    'Total Achats Rattachés (€ HT)',
    'Marge Brute (€ HT)',
    'Taux de Marge (%)',
    'Nb Pièces Fournisseurs'
  ];

  const headerRow = wsMain.getRow(6);
  headerRow.values = mainHeaders;
  headerRow.height = 28;

  headerRow.eachCell((cell, colNum) => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { 
      vertical: 'middle', 
      horizontal: colNum >= 6 && colNum <= 9 ? 'right' : (colNum === 10 ? 'center' : 'left'),
      wrapText: true 
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF475569' } }
    };
  });

  // Remplissage des lignes de données
  let rowIdx = 7;
  for (const item of records) {
    const r = wsMain.getRow(rowIdx);
    r.values = [
      item.invoiceNumber,
      item.invoiceDate,
      item.projectName && item.projectName !== item.saleOrderName ? `${item.saleOrderName} (${item.projectName})` : item.saleOrderName,
      item.clientOrderRef || '-',
      item.partnerName,
      item.invoicedSalesUntaxed,
      item.attachedPurchasesUntaxed,
      item.grossMarginUntaxed,
      item.grossMarginRate / 100,
      item.purchasesCount
    ];
    r.height = 22;

    const isEven = (rowIdx % 2 === 0);
    const bgArgb = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

    r.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFF1F5F9' } }
      };

      if (colNum === 1) {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0284C7' } };
      } else if (colNum === 6) {
        cell.numFmt = '#,##0.00 "€"';
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (colNum === 7) {
        cell.numFmt = '#,##0.00 "€"';
        cell.font = { bold: true, color: { argb: 'FFD97706' } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (colNum === 8) {
        cell.numFmt = '#,##0.00 "€"';
        cell.font = { bold: true, color: item.grossMarginUntaxed >= 0 ? { argb: 'FF16A34A' } : { argb: 'FFDC2626' } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (colNum === 9) {
        cell.numFmt = '0.0%';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (colNum === 10) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });

    rowIdx++;
  }

  // LIGNE DE TOTALISATION GÉNÉRALE (Point clé demandé par le client)
  const totalRow = wsMain.getRow(rowIdx);
  totalRow.values = [
    'TOTAL GÉNÉRAL DU MOIS',
    '',
    `${records.length} dossier(s) facturé(s)`,
    '',
    '',
    summary.totalInvoicedSalesUntaxed,
    summary.totalPurchasesOutflowUntaxed,
    summary.totalGrossMarginUntaxed,
    summary.overallMarginRate / 100,
    records.reduce((s, r) => s + r.purchasesCount, 0)
  ];
  totalRow.height = 30;

  totalRow.eachCell((cell, colNum) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2559' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } }
    };

    if (colNum >= 6 && colNum <= 8) {
      cell.numFmt = '#,##0.00 "€"';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    } else if (colNum === 9) {
      cell.numFmt = '0.0%';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    } else if (colNum === 10) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    }
  });

  // Ajustement largeurs colonnes Feuille 1
  wsMain.getColumn(1).width = 22; // N° Facture Client
  wsMain.getColumn(2).width = 15; // Date
  wsMain.getColumn(3).width = 22; // Commande
  wsMain.getColumn(4).width = 16; // Réf Client
  wsMain.getColumn(5).width = 30; // Client
  wsMain.getColumn(6).width = 24; // Vente Facturée
  wsMain.getColumn(7).width = 25; // Achats Rattachés
  wsMain.getColumn(8).width = 20; // Marge Brute
  wsMain.getColumn(9).width = 18; // Taux Marge
  wsMain.getColumn(10).width = 20; // Nb Pièces

  // ==========================================
  // FEUILLE 2 : DÉTAIL DES PIÈCES FOURNISSEURS INCLUSES
  // ==========================================
  const wsDetails = workbook.addWorksheet('Détail Pièces Fournisseurs', {
    views: [{ showGridLines: true }]
  });

  wsDetails.mergeCells('A1:H1');
  const dTitle = wsDetails.getCell('A1');
  dTitle.value = `DÉTAIL DES ACHATS FOURNISSEURS SORTIS DE L'ENCOURS — ${monthLabel.toUpperCase()}`;
  dTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  dTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  dTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  wsDetails.getRow(1).height = 32;

  const detailHeaders = [
    'N° Facture Client',
    'Affaire / Commande SO',
    'Type de Pièce',
    'Référence Fournisseur',
    'Fournisseur',
    'Date Pièce',
    'Description / Article / Prestation',
    'Montant Achat (€ HT)'
  ];

  const dHeaderRow = wsDetails.getRow(3);
  dHeaderRow.values = detailHeaders;
  dHeaderRow.height = 26;

  dHeaderRow.eachCell((cell, colNum) => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cell.alignment = { 
      vertical: 'middle', 
      horizontal: colNum === 8 ? 'right' : 'left' 
    };
  });

  let dRowIdx = 4;
  let allPurchasesCount = 0;
  let allPurchasesSum = 0;

  for (const inv of records) {
    const validDetails = (inv.purchaseDetails || []).filter(p => {
      const refClean = String(p.reference || '').trim().toUpperCase();
      return !refClean.startsWith('FV') && !refClean.startsWith('ODMEN');
    });
    for (const p of validDetails) {
      allPurchasesCount++;
      allPurchasesSum += p.amountUntaxed;

      const dr = wsDetails.getRow(dRowIdx);
      dr.values = [
        inv.invoiceNumber,
        inv.saleOrderName,
        p.typeLabel,
        p.reference,
        p.partnerName,
        p.date,
        p.productLabel,
        p.amountUntaxed
      ];
      dr.height = 20;

      dr.eachCell((cell, colNum) => {
        cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF1E293B' } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        if (colNum === 8) {
          cell.numFmt = '#,##0.00 "€"';
          cell.font = { bold: true, color: { argb: 'FFD97706' } };
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (colNum === 3) {
          cell.font = { italic: true, color: { argb: 'FF64748B' } };
        }
      });

      dRowIdx++;
    }
  }

  // Total feuille détail
  const dTotRow = wsDetails.getRow(dRowIdx);
  dTotRow.values = [
    'TOTAL DES ACHATS FOURNISSEURS SORTIS',
    '',
    '',
    '',
    '',
    '',
    `${allPurchasesCount} pièce(s) fournisseur`,
    allPurchasesSum
  ];
  dTotRow.height = 26;

  dTotRow.eachCell((cell, colNum) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2559' } };
    if (colNum === 8) {
      cell.numFmt = '#,##0.00 "€"';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    }
  });

  wsDetails.getColumn(1).width = 20; // Facture Client
  wsDetails.getColumn(2).width = 22; // Commande SO
  wsDetails.getColumn(3).width = 20; // Type
  wsDetails.getColumn(4).width = 24; // Réf Fournisseur
  wsDetails.getColumn(5).width = 30; // Fournisseur
  wsDetails.getColumn(6).width = 14; // Date
  wsDetails.getColumn(7).width = 38; // Description
  wsDetails.getColumn(8).width = 22; // Montant HT

  // Écriture du fichier et téléchargement
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', finalFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

