import * as XLSX from 'xlsx';
import { ClockImportedRecord } from '../types/clockAudit';
import { TimesheetAuditEmployeeItem } from '../types/odoo';

/**
 * Normalizes text for comparison (removes accents, lowercase, trims spaces)
 */
export function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[-_.]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Converts a time string (e.g. '08:15', '08h30', '8.5', '8,25', '7:30') into decimal hours
 */
export function parseHoursValue(rawVal: any): number {
  if (rawVal === null || rawVal === undefined || rawVal === '') return 0;
  
  if (typeof rawVal === 'number') {
    // If it's an Excel fraction of day (e.g. 0.3125 for 07:30)
    // Only treat as day fraction if < 1.0 and not 0, and user likely loaded raw time
    // But usually numbers like 7.5 are hours
    return Math.round(rawVal * 100) / 100;
  }

  const cleaned = String(rawVal).trim().replace(/"/g, '').replace(/'/g, '');

  // Case 1: HH:MM or HH:MM:SS or HHhMM (e.g. '7:30', '07:42', '15:37')
  const timeRegex = /^(\d{1,2})[:hH](\d{2})(?::(\d{2}))?$/;
  const match = cleaned.match(timeRegex);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = match[3] ? parseInt(match[3], 10) : 0;
    return Math.round((hours + minutes / 60 + seconds / 3600) * 100) / 100;
  }

  // Case 2: Decimal number (with dot or comma, e.g. '8.25' or '8,25')
  const numStr = cleaned.replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(numStr);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
}

/**
 * Converts time string to minutes from midnight (e.g. '07:42' -> 462 min)
 */
export function timeStringToMinutes(rawVal: any): number | null {
  if (rawVal === null || rawVal === undefined || rawVal === '') return null;
  const str = String(rawVal).trim().replace(/"/g, '').replace(/'/g, '');
  if (!str || str === '0' || str === '0:00' || str === '00:00') return null;

  const match = str.match(/^(\d{1,2})[:hH](\d{2})(?::(\d{2}))?$/);
  if (match) {
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  const dec = parseFloat(str.replace(',', '.'));
  if (!isNaN(dec)) {
    return Math.round(dec * 60);
  }
  return null;
}

/**
 * Calculates duration between two time stamps in decimal hours
 * e.g. '07:42' and '15:37' -> (937 - 462) / 60 = 7.92h
 */
export function calculateSlotDuration(inStr: any, outStr: any): number {
  const inMin = timeStringToMinutes(inStr);
  const outMin = timeStringToMinutes(outStr);
  if (inMin === null || outMin === null) return 0;

  let diff = outMin - inMin;
  if (diff < 0) {
    // Night cross
    diff += 24 * 60;
  }
  return Math.round((diff / 60) * 100) / 100;
}

/**
 * Parses date string in various formats:
 * - "Lu 10/08", "Ma 11/08", "Me 12/08", "Je 13/08", "Ve 14/08", "Sa 15/08", "Di 16/08"
 * - "10/08", "10/08/2026", "2026-08-10"
 * - Excel serial date numbers (e.g. 46244)
 * - JS Date object
 */
export function parseClockDate(rawVal: any, referenceYear = 2026): string | null {
  if (rawVal === null || rawVal === undefined || rawVal === '') return null;

  // Case A: JS Date object
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    const y = rawVal.getFullYear();
    const m = String(rawVal.getMonth() + 1).padStart(2, '0');
    const d = String(rawVal.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Case B: Numeric Excel serial date (e.g. 46244 -> 2026-08-10)
  if (typeof rawVal === 'number' && rawVal > 30000 && rawVal < 70000) {
    // Excel base date 1899-12-30
    const date = new Date(Math.round((rawVal - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(rawVal).trim().replace(/"/g, '').replace(/'/g, '');
  if (!str) return null;

  // Case C: ISO format YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Case D: French day-prefix + DD/MM or DD/MM/YYYY
  // Examples: "Lu 10/08", "Ma 11/08", "Me 12/08", "Je 13/08", "Ve 14/08", "Sa 15/08", "Di 16/08"
  // "Lundi 10/08", "10/08", "10/08/2026", "10-08-2026"
  const frMatch = str.match(/^(?:[a-zA-ZÀ-ÿ]{2,10}\.?\s+)?(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?$/);
  if (frMatch) {
    const d = frMatch[1].padStart(2, '0');
    const m = frMatch[2].padStart(2, '0');
    let y = frMatch[3] ? parseInt(frMatch[3], 10) : referenceYear;
    if (y < 100) y += 2000;
    return `${y}-${m}-${d}`;
  }

  // Case E: Standard date parse fallback
  const dt = new Date(str);
  if (!isNaN(dt.getTime()) && dt.getFullYear() >= 2000) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Matches a raw operator name (e.g. "BANTUELLE Alexandre") against Odoo employees
 */
export function matchEmployee(
  rawName: string,
  employees: TimesheetAuditEmployeeItem[]
): { matchedId?: number; matchedName?: string } {
  if (!rawName || !employees.length) return {};

  const normRaw = normalizeString(rawName);
  const rawParts = normRaw.split(' ').filter(Boolean);

  // 1. Exact match
  for (const emp of employees) {
    const normEmp = normalizeString(emp.name);
    if (normEmp === normRaw) {
      return { matchedId: emp.id, matchedName: emp.name };
    }
  }

  // 2. Reversed name match (e.g. "Bantuelle Alexandre" <-> "Alexandre Bantuelle")
  if (rawParts.length >= 2) {
    const reversed = [...rawParts].reverse().join(' ');
    for (const emp of employees) {
      const normEmp = normalizeString(emp.name);
      if (normEmp === reversed) {
        return { matchedId: emp.id, matchedName: emp.name };
      }
    }
  }

  // 3. All parts included in employee name
  for (const emp of employees) {
    const normEmp = normalizeString(emp.name);
    if (rawParts.every(part => normEmp.includes(part))) {
      return { matchedId: emp.id, matchedName: emp.name };
    }
  }

  // 4. Employee parts included in raw name
  for (const emp of employees) {
    const normEmp = normalizeString(emp.name);
    const empParts = normEmp.split(' ').filter(p => p.length >= 3);
    if (empParts.length > 0 && empParts.every(p => normRaw.includes(p))) {
      return { matchedId: emp.id, matchedName: emp.name };
    }
  }

  return {};
}

export interface ClockColumnMapping {
  operatorIdx: number;
  dateIdx: number;
  entree1Idx: number;
  sortie1Idx: number;
  entree2Idx: number;
  sortie2Idx: number;
  entree3Idx: number;
  sortie3Idx: number;
  totalEffIdx: number;
}

/**
 * Detects column indices for:
 * [Operateur, Date, Entree_1, Sortie_1, Entree_2, Sortie_2, Entree_3, Sortie_3, Temps_Present_Eff]
 */
export function detectPointeuseColumns(headers: string[]): ClockColumnMapping {
  const mapping: ClockColumnMapping = {
    operatorIdx: -1,
    dateIdx: -1,
    entree1Idx: -1,
    sortie1Idx: -1,
    entree2Idx: -1,
    sortie2Idx: -1,
    entree3Idx: -1,
    sortie3Idx: -1,
    totalEffIdx: -1
  };

  headers.forEach((h, idx) => {
    const norm = normalizeString(h);

    // Operator
    if (mapping.operatorIdx === -1 && (
      norm.includes('operat') ||
      norm.includes('collaborat') ||
      norm.includes('employe') ||
      norm.includes('agent') ||
      norm.includes('person') ||
      norm === 'nom' ||
      norm === 'name' ||
      norm === 'user'
    )) {
      mapping.operatorIdx = idx;
      return;
    }

    // Date
    if (mapping.dateIdx === -1 && (
      norm === 'date' ||
      norm === 'jour' ||
      norm === 'day' ||
      norm.includes('date')
    )) {
      mapping.dateIdx = idx;
      return;
    }

    // Entree 1
    if (mapping.entree1Idx === -1 && (
      (norm.includes('entree') && norm.includes('1')) ||
      (norm.includes('arrivee') && norm.includes('1')) ||
      norm === 'in 1' || norm === 'in_1' || norm === 'in1'
    )) {
      mapping.entree1Idx = idx;
      return;
    }

    // Sortie 1
    if (mapping.sortie1Idx === -1 && (
      (norm.includes('sortie') && norm.includes('1')) ||
      (norm.includes('depart') && norm.includes('1')) ||
      norm === 'out 1' || norm === 'out_1' || norm === 'out1'
    )) {
      mapping.sortie1Idx = idx;
      return;
    }

    // Entree 2
    if (mapping.entree2Idx === -1 && (
      (norm.includes('entree') && norm.includes('2')) ||
      (norm.includes('arrivee') && norm.includes('2')) ||
      norm === 'in 2' || norm === 'in_2' || norm === 'in2'
    )) {
      mapping.entree2Idx = idx;
      return;
    }

    // Sortie 2
    if (mapping.sortie2Idx === -1 && (
      (norm.includes('sortie') && norm.includes('2')) ||
      (norm.includes('depart') && norm.includes('2')) ||
      norm === 'out 2' || norm === 'out_2' || norm === 'out2'
    )) {
      mapping.sortie2Idx = idx;
      return;
    }

    // Entree 3
    if (mapping.entree3Idx === -1 && (
      (norm.includes('entree') && norm.includes('3')) ||
      (norm.includes('arrivee') && norm.includes('3')) ||
      norm === 'in 3' || norm === 'in_3' || norm === 'in3'
    )) {
      mapping.entree3Idx = idx;
      return;
    }

    // Sortie 3
    if (mapping.sortie3Idx === -1 && (
      (norm.includes('sortie') && norm.includes('3')) ||
      (norm.includes('depart') && norm.includes('3')) ||
      norm === 'out 3' || norm === 'out_3' || norm === 'out3'
    )) {
      mapping.sortie3Idx = idx;
      return;
    }

    // Temps Present Eff
    if (mapping.totalEffIdx === -1 && (
      norm.includes('temps') ||
      norm.includes('present') ||
      norm.includes('eff') ||
      norm.includes('duree') ||
      norm.includes('total') ||
      norm.includes('heures')
    )) {
      mapping.totalEffIdx = idx;
      return;
    }
  });

  // Fallback by exact 9-column order if headers did not match
  // [Operateur, Date, Entree_1, Sortie_1, Entree_2, Sortie_2, Entree_3, Sortie_3, Temps_Present_Eff]
  if (headers.length >= 8) {
    if (mapping.operatorIdx === -1) mapping.operatorIdx = 0;
    if (mapping.dateIdx === -1) mapping.dateIdx = 1;
    if (mapping.entree1Idx === -1) mapping.entree1Idx = 2;
    if (mapping.sortie1Idx === -1) mapping.sortie1Idx = 3;
    if (mapping.entree2Idx === -1) mapping.entree2Idx = 4;
    if (mapping.sortie2Idx === -1) mapping.sortie2Idx = 5;
    if (mapping.entree3Idx === -1) mapping.entree3Idx = 6;
    if (mapping.sortie3Idx === -1) mapping.sortie3Idx = 7;
    if (mapping.totalEffIdx === -1 && headers.length > 8) mapping.totalEffIdx = 8;
  }

  return mapping;
}

export interface ParsePointeuseResult {
  records: ClockImportedRecord[];
  errors: string[];
  totalRowsProcessed: number;
  matchedCount: number;
  unmatchedCount: number;
  dateRange: { start: string; end: string } | null;
  detectedHeaders: string[];
  fileFormatDetected: 'xlsx' | 'xls' | 'csv';
}

/**
 * Main parser for Pointeuse Excel (.xlsx, .xls) and CSV files
 */
export async function parsePointeuseFile(
  file: File | ArrayBuffer | string,
  availableEmployees: TimesheetAuditEmployeeItem[] = [],
  fileName = 'fichier.xlsx',
  referenceYear = 2026
): Promise<ParsePointeuseResult> {
  const result: ParsePointeuseResult = {
    records: [],
    errors: [],
    totalRowsProcessed: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    dateRange: null,
    detectedHeaders: [],
    fileFormatDetected: 'xlsx'
  };

  try {
    let workbook: XLSX.WorkBook;

    if (typeof file === 'string') {
      // Plain text CSV
      workbook = XLSX.read(file, { type: 'string', cellDates: true, raw: false });
      result.fileFormatDetected = 'csv';
    } else if (file instanceof File) {
      const isCsv = file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt');
      result.fileFormatDetected = isCsv ? 'csv' : 'xlsx';
      
      const arrayBuffer = await file.arrayBuffer();
      workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    } else {
      // ArrayBuffer
      workbook = XLSX.read(file, { type: 'array', cellDates: true });
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      result.errors.push('Aucune feuille trouvée dans le fichier.');
      return result;
    }

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData: any[][] = XLSX.utils.sheet_to_json(firstSheet, {
      header: 1,
      defval: '',
      blankrows: false
    });

    if (!rawData || rawData.length < 2) {
      result.errors.push('Le fichier doit contenir au moins une ligne d\'en-tête et une ligne de données.');
      return result;
    }

    // Find header row (first row with at least 2 non-empty cells)
    let headerRowIdx = 0;
    while (headerRowIdx < rawData.length) {
      const row = rawData[headerRowIdx];
      const filledCells = row.filter((c: any) => c !== null && c !== undefined && String(c).trim() !== '');
      if (filledCells.length >= 2) {
        break;
      }
      headerRowIdx++;
    }

    if (headerRowIdx >= rawData.length) {
      result.errors.push('Impossible d\'identifier la ligne d\'en-tête du fichier.');
      return result;
    }

    // Trim all column headers automatically
    const rawHeaders = rawData[headerRowIdx] || [];
    const headers = rawHeaders.map((h: any) => String(h || '').trim());
    result.detectedHeaders = headers;

    const mapping = detectPointeuseColumns(headers);

    let earliestDate: string | null = null;
    let latestDate: string | null = null;

    // Deduplication / grouping map by employee + date
    const groupedRecords: Map<string, ClockImportedRecord> = new Map();

    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row || row.length === 0) continue;

      const rawOperator = mapping.operatorIdx >= 0 && row[mapping.operatorIdx] !== undefined
        ? String(row[mapping.operatorIdx]).trim()
        : '';
      const rawDate = mapping.dateIdx >= 0 && row[mapping.dateIdx] !== undefined
        ? row[mapping.dateIdx]
        : '';

      if (!rawOperator || String(rawDate).trim() === '') {
        continue;
      }

      result.totalRowsProcessed++;

      // Parse Date (handles "Lu 10/08", Excel serial, etc.)
      const parsedDate = parseClockDate(rawDate, referenceYear);
      if (!parsedDate) {
        continue;
      }

      // Slot cells
      const in1 = mapping.entree1Idx >= 0 && row[mapping.entree1Idx] !== undefined ? String(row[mapping.entree1Idx]).trim() : '';
      const out1 = mapping.sortie1Idx >= 0 && row[mapping.sortie1Idx] !== undefined ? String(row[mapping.sortie1Idx]).trim() : '';
      const in2 = mapping.entree2Idx >= 0 && row[mapping.entree2Idx] !== undefined ? String(row[mapping.entree2Idx]).trim() : '';
      const out2 = mapping.sortie2Idx >= 0 && row[mapping.sortie2Idx] !== undefined ? String(row[mapping.sortie2Idx]).trim() : '';
      const in3 = mapping.entree3Idx >= 0 && row[mapping.entree3Idx] !== undefined ? String(row[mapping.entree3Idx]).trim() : '';
      const out3 = mapping.sortie3Idx >= 0 && row[mapping.sortie3Idx] !== undefined ? String(row[mapping.sortie3Idx]).trim() : '';
      const totalEff = mapping.totalEffIdx >= 0 && row[mapping.totalEffIdx] !== undefined ? String(row[mapping.totalEffIdx]).trim() : '';

      // Check special pointeuse rules:
      // a) If Entree_3 contains '0:00' -> indicates non-working day (week-end / absence)
      const isEntree3Zero = in3 === '0:00' || in3 === '00:00' || in3 === '0' || in3 === '0.00';

      // b) Read priority:
      // 1. Sortie_3 if present in HH:MM format and > 0
      // 2. Sum of slots: (Sortie_1 - Entree_1) + (Sortie_2 - Entree_2)
      // 3. Fallback: Temps_Present_Eff
      let rawHours = 0;
      let calculationMethod: 'sortie_3' | 'creneaux' | 'total_eff' | 'zero' = 'zero';
      let isNonWorkingDay = false;

      const out3Hours = parseHoursValue(out3);
      if (out3 && out3 !== '0:00' && out3 !== '00:00' && out3 !== '0' && out3Hours > 0) {
        rawHours = out3Hours;
        calculationMethod = 'sortie_3';
      } else {
        // Calculate dynamically from slots
        let slotSum = 0;
        if (in1 && out1 && out1 !== '0:00' && out1 !== '0') {
          slotSum += calculateSlotDuration(in1, out1);
        }
        if (in2 && out2 && out2 !== '0:00' && out2 !== '0') {
          slotSum += calculateSlotDuration(in2, out2);
        }

        if (slotSum > 0) {
          rawHours = Math.round(slotSum * 100) / 100;
          calculationMethod = 'creneaux';
        } else if (totalEff && totalEff !== '0:00' && totalEff !== '0') {
          const totalEffHours = parseHoursValue(totalEff);
          if (totalEffHours > 0) {
            rawHours = totalEffHours;
            calculationMethod = 'total_eff';
          }
        }
      }

      if (isEntree3Zero && rawHours === 0) {
        isNonWorkingDay = true;
      }

      // Match employee with Odoo
      const match = matchEmployee(rawOperator, availableEmployees);

      // Start and end times representation
      const startTime = in1 || in2 || (in3 !== '0:00' ? in3 : undefined);
      const endTime = out2 || out1 || (calculationMethod !== 'sortie_3' && out3 !== '0:00' ? out3 : undefined);

      const groupKey = `${rawOperator}_${parsedDate}`;

      if (groupedRecords.has(groupKey)) {
        // Multiple entries on the same day: accumulate
        const existing = groupedRecords.get(groupKey)!;
        existing.rawHours = Math.round((existing.rawHours + rawHours) * 100) / 100;
        if (endTime && (!existing.endTime || endTime > existing.endTime)) {
          existing.endTime = endTime;
        }
      } else {
        const record: ClockImportedRecord = {
          id: `clock_${Date.now()}_${r}`,
          employeeNameRaw: rawOperator,
          matchedEmployeeId: match.matchedId,
          matchedEmployeeName: match.matchedName || (match.matchedId ? availableEmployees.find(e => e.id === match.matchedId)?.name : undefined),
          date: parsedDate,
          rawHours,
          startTime,
          endTime,
          entree1: in1 || undefined,
          sortie1: out1 || undefined,
          entree2: in2 || undefined,
          sortie2: out2 || undefined,
          entree3: in3 || undefined,
          sortie3: out3 || undefined,
          tempsPresentEff: totalEff || undefined,
          calculationMethod,
          isNonWorkingDay,
          sourceRow: r + 1
        };
        groupedRecords.set(groupKey, record);
      }

      // Track date range
      if (!earliestDate || parsedDate < earliestDate) earliestDate = parsedDate;
      if (!latestDate || parsedDate > latestDate) latestDate = parsedDate;
    }

    result.records = Array.from(groupedRecords.values());

    result.records.forEach(rec => {
      if (rec.matchedEmployeeId) {
        result.matchedCount++;
      } else {
        result.unmatchedCount++;
      }
    });

    if (earliestDate && latestDate) {
      result.dateRange = { start: earliestDate, end: latestDate };
    }
  } catch (err: any) {
    console.error('Pointeuse parsing error:', err);
    result.errors.push(`Erreur lors de l'analyse du fichier : ${err?.message || String(err)}`);
  }

  return result;
}

/**
 * Generates an exact Excel (.xlsx) demo file with the 9 specific columns:
 * [Operateur, Date, Entree_1, Sortie_1, Entree_2, Sortie_2, Entree_3, Sortie_3, Temps_Present_Eff]
 */
export function generateSamplePointeuseXlsxBlob(
  availableEmployees: TimesheetAuditEmployeeItem[],
  referenceYear = 2026
): Blob {
  const headers = [
    'Operateur',
    'Date',
    'Entree_1',
    'Sortie_1',
    'Entree_2',
    'Sortie_2',
    'Entree_3',
    'Sortie_3',
    'Temps_Present_Eff'
  ];

  const emps = availableEmployees.length > 0
    ? availableEmployees.slice(0, 6)
    : [
        { id: 1, name: 'BANTUELLE Alexandre' },
        { id: 2, name: 'DEVOLDERE Nicolas' },
        { id: 3, name: 'DECK Joris' },
        { id: 4, name: 'ERRERA Giancarlo' },
        { id: 5, name: 'MARIA Domenico' }
      ];

  const days = [
    { label: 'Lu 10/08', isWeekend: false },
    { label: 'Ma 11/08', isWeekend: false },
    { label: 'Me 12/08', isWeekend: false },
    { label: 'Je 13/08', isWeekend: false },
    { label: 'Ve 14/08', isWeekend: false },
    { label: 'Sa 15/08', isWeekend: true },
    { label: 'Di 16/08', isWeekend: true }
  ];

  const rows: any[][] = [headers];

  emps.forEach((emp, empIdx) => {
    // Format operator name in uppercase or capitalized
    const operatorName = emp.name.toUpperCase();

    days.forEach(day => {
      if (day.isWeekend) {
        // Weekend: Entree_3 = '0:00' indicating non-working day
        rows.push([
          operatorName,
          day.label,
          '',
          '',
          '',
          '',
          '0:00',
          '0:00',
          '0:00'
        ]);
      } else {
        if (empIdx === 0) {
          // Alexandre Bantuelle: Standard working day, 1 slot 07:42 -> 15:37, Sortie_3 = 7:30
          rows.push([
            operatorName,
            day.label,
            '07:42',
            '15:37',
            '',
            '',
            '',
            '7:30',
            '7:30'
          ]);
        } else if (empIdx === 1) {
          // Nicolas Devoldere: 2 slots 08:03 -> 10:02 and 11:31 -> 16:48, Sortie_3 = 8:00
          rows.push([
            operatorName,
            day.label,
            '08:03',
            '10:02',
            '11:31',
            '16:48',
            '',
            '8:00',
            '8:00'
          ]);
        } else if (empIdx === 2) {
          // Joris Deck: Sortie_3 missing, calculation via slots 07:30 -> 16:00
          rows.push([
            operatorName,
            day.label,
            '07:30',
            '16:00',
            '',
            '',
            '',
            '',
            '8:30'
          ]);
        } else {
          rows.push([
            operatorName,
            day.label,
            '07:45',
            '16:15',
            '',
            '',
            '',
            '8:00',
            '8:00'
          ]);
        }
      }
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Auto-width for neat Excel presentation
  ws['!cols'] = [
    { wch: 26 }, // Operateur
    { wch: 14 }, // Date
    { wch: 12 }, // Entree_1
    { wch: 12 }, // Sortie_1
    { wch: 12 }, // Entree_2
    { wch: 12 }, // Sortie_2
    { wch: 12 }, // Entree_3
    { wch: 12 }, // Sortie_3
    { wch: 18 }  // Temps_Present_Eff
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relevé Pointeuse');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
