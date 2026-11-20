import { ClockImportedRecord } from '../types/clockAudit';
import { TimesheetAuditEmployeeItem } from '../types/odoo';
import { parsePointeuseFile, ParsePointeuseResult } from './clockSpreadsheetParser';

export * from './clockSpreadsheetParser';

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
 * Parses time string (e.g. '08:15', '08h30', '8.5', '8,25') into decimal hours
 */
export function parseHoursValue(rawVal: string): number {
  if (!rawVal) return 0;
  const cleaned = rawVal.trim().replace(/"/g, '').replace(/'/g, '');

  // Case 1: HH:MM or HH:MM:SS or HHhMM
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
 * Parses various date formats into YYYY-MM-DD
 */
export function parseDateValue(rawVal: string): string | null {
  if (!rawVal) return null;
  const cleaned = rawVal.trim().replace(/"/g, '').replace(/'/g, '');

  // Format 1: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Format 2: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const euMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (euMatch) {
    const d = euMatch[1].padStart(2, '0');
    const m = euMatch[2].padStart(2, '0');
    const y = euMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Format 3: Timestamp (e.g. 2026-08-25 08:00:00)
  const dt = new Date(cleaned);
  if (!isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Detect delimiter: semicolon, comma, or tab
 */
export function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join('\n');
  const semiCount = (firstLines.match(/;/g) || []).length;
  const commaCount = (firstLines.match(/,/g) || []).length;
  const tabCount = (firstLines.match(/\t/g) || []).length;

  if (semiCount >= commaCount && semiCount >= tabCount && semiCount > 0) return ';';
  if (tabCount >= commaCount && tabCount > 0) return '\t';
  return ',';
}

/**
 * Splits a CSV line taking into account quoted strings
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export interface CsvHeaderMapping {
  nameIndex: number;
  dateIndex: number;
  hoursIndex: number;
  inIndex: number;
  outIndex: number;
  badgeIndex: number;
}

/**
 * Detects indices of relevant columns based on header names
 */
export function detectHeaderIndices(headers: string[]): CsvHeaderMapping {
  const mapping: CsvHeaderMapping = {
    nameIndex: -1,
    dateIndex: -1,
    hoursIndex: -1,
    inIndex: -1,
    outIndex: -1,
    badgeIndex: -1
  };

  headers.forEach((h, idx) => {
    const norm = normalizeString(h);

    // Name column
    if (mapping.nameIndex === -1 && (
      norm.includes('collaborat') ||
      norm.includes('employe') ||
      norm.includes('nom') ||
      norm.includes('agent') ||
      norm.includes('person') ||
      norm.includes('salarie') ||
      norm === 'name' ||
      norm === 'employee' ||
      norm === 'user'
    )) {
      mapping.nameIndex = idx;
    }

    // Date column
    if (mapping.dateIndex === -1 && (
      norm.includes('date') ||
      norm.includes('jour') ||
      norm === 'day'
    )) {
      mapping.dateIndex = idx;
    }

    // Hours / Duration column
    if (mapping.hoursIndex === -1 && (
      norm.includes('brut') ||
      norm.includes('presence') ||
      norm.includes('heures') ||
      norm.includes('temps') ||
      norm.includes('duree') ||
      norm.includes('total') ||
      norm === 'hours' ||
      norm === 'duration'
    )) {
      mapping.hoursIndex = idx;
    }

    // Punch In
    if (mapping.inIndex === -1 && (
      norm.includes('entree') ||
      norm.includes('arrivee') ||
      norm === 'in' ||
      norm === 'start'
    )) {
      mapping.inIndex = idx;
    }

    // Punch Out
    if (mapping.outIndex === -1 && (
      norm.includes('sortie') ||
      norm.includes('depart') ||
      norm === 'out' ||
      norm === 'end'
    )) {
      mapping.outIndex = idx;
    }

    // Badge
    if (mapping.badgeIndex === -1 && (
      norm.includes('badge') ||
      norm.includes('matricule') ||
      norm.includes('card')
    )) {
      mapping.badgeIndex = idx;
    }
  });

  // Fallbacks if not explicitly found by name
  if (mapping.nameIndex === -1 && headers.length > 0) mapping.nameIndex = 0;
  if (mapping.dateIndex === -1 && headers.length > 1) mapping.dateIndex = 1;
  if (mapping.hoursIndex === -1 && headers.length > 2) mapping.hoursIndex = 2;

  return mapping;
}

/**
 * Matches a raw name against an Odoo employee list
 */
export function matchEmployee(
  rawName: string,
  employees: TimesheetAuditEmployeeItem[]
): { matchedId?: number; matchedName?: string } {
  if (!rawName || !employees.length) return {};

  const normRaw = normalizeString(rawName);
  const rawParts = normRaw.split(' ').filter(Boolean);

  // 1. Exact normalized match
  for (const emp of employees) {
    const normEmp = normalizeString(emp.name);
    if (normEmp === normRaw) {
      return { matchedId: emp.id, matchedName: emp.name };
    }
  }

  // 2. Reversed name match (e.g. "Hubert Nicolas" vs "Nicolas Hubert")
  if (rawParts.length >= 2) {
    const reversed = [...rawParts].reverse().join(' ');
    for (const emp of employees) {
      const normEmp = normalizeString(emp.name);
      if (normEmp === reversed) {
        return { matchedId: emp.id, matchedName: emp.name };
      }
    }
  }

  // 3. Substring / all parts included match
  for (const emp of employees) {
    const normEmp = normalizeString(emp.name);
    if (rawParts.every(part => normEmp.includes(part))) {
      return { matchedId: emp.id, matchedName: emp.name };
    }
  }

  // 4. Any major word match if long enough
  for (const emp of employees) {
    const normEmp = normalizeString(emp.name);
    const empParts = normEmp.split(' ').filter(p => p.length >= 4);
    if (empParts.some(p => normRaw.includes(p))) {
      return { matchedId: emp.id, matchedName: emp.name };
    }
  }

  return {};
}

export interface ParseCsvResult {
  records: ClockImportedRecord[];
  errors: string[];
  totalRowsProcessed: number;
  matchedCount: number;
  unmatchedCount: number;
  dateRange: { start: string; end: string } | null;
  detectedHeaders: string[];
  delimiterUsed: string;
}

/**
 * Main CSV Parser for clock data
 */
export function parseClockCsv(
  csvText: string,
  availableEmployees: TimesheetAuditEmployeeItem[]
): ParseCsvResult {
  const result: ParseCsvResult = {
    records: [],
    errors: [],
    totalRowsProcessed: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    dateRange: null,
    detectedHeaders: [],
    delimiterUsed: ','
  };

  if (!csvText || !csvText.trim()) {
    result.errors.push('Le contenu du fichier CSV est vide.');
    return result;
  }

  const delimiter = detectDelimiter(csvText);
  result.delimiterUsed = delimiter;

  const rawLines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (rawLines.length < 2) {
    result.errors.push('Le fichier doit contenir au moins une ligne d\'en-tête et une ligne de données.');
    return result;
  }

  const headerLine = rawLines[0];
  const headers = splitCsvLine(headerLine, delimiter);
  result.detectedHeaders = headers;

  const mapping = detectHeaderIndices(headers);

  let earliestDate: string | null = null;
  let latestDate: string | null = null;

  // Key for deduplication / grouping by employee + date
  const groupedRecords: Map<string, ClockImportedRecord> = new Map();

  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line) continue;

    const cells = splitCsvLine(line, delimiter);
    if (cells.length < 2) continue;

    result.totalRowsProcessed++;

    const rawName = mapping.nameIndex >= 0 && cells[mapping.nameIndex] ? cells[mapping.nameIndex].trim() : '';
    const rawDateStr = mapping.dateIndex >= 0 && cells[mapping.dateIndex] ? cells[mapping.dateIndex].trim() : '';
    const rawHoursStr = mapping.hoursIndex >= 0 && cells[mapping.hoursIndex] ? cells[mapping.hoursIndex].trim() : '';
    const rawInStr = mapping.inIndex >= 0 && cells[mapping.inIndex] ? cells[mapping.inIndex].trim() : '';
    const rawOutStr = mapping.outIndex >= 0 && cells[mapping.outIndex] ? cells[mapping.outIndex].trim() : '';
    const rawBadge = mapping.badgeIndex >= 0 && cells[mapping.badgeIndex] ? cells[mapping.badgeIndex].trim() : '';

    if (!rawName) {
      continue;
    }

    const parsedDate = parseDateValue(rawDateStr);
    if (!parsedDate) {
      // Date invalid or missing
      continue;
    }

    // Calculate hours: either direct hours or difference between in and out
    let hours = parseHoursValue(rawHoursStr);
    if (hours === 0 && rawInStr && rawOutStr) {
      const inH = parseHoursValue(rawInStr);
      const outH = parseHoursValue(rawOutStr);
      if (outH > inH) {
        hours = Math.round((outH - inH) * 100) / 100;
      }
    }

    // Match employee with Odoo
    const match = matchEmployee(rawName, availableEmployees);

    const groupKey = `${match.matchedId || rawName}_${parsedDate}`;
    
    if (groupedRecords.has(groupKey)) {
      // Accumulate hours if multiple records exist on the same day for this employee
      const existing = groupedRecords.get(groupKey)!;
      existing.rawHours = Math.round((existing.rawHours + hours) * 100) / 100;
      if (rawOutStr && (!existing.endTime || rawOutStr > existing.endTime)) {
        existing.endTime = rawOutStr;
      }
    } else {
      const record: ClockImportedRecord = {
        id: `clock_${Date.now()}_${i}`,
        employeeNameRaw: rawName,
        matchedEmployeeId: match.matchedId,
        matchedEmployeeName: match.matchedName || (match.matchedId ? availableEmployees.find(e => e.id === match.matchedId)?.name : undefined),
        date: parsedDate,
        rawHours: hours,
        startTime: rawInStr || undefined,
        endTime: rawOutStr || undefined,
        badgeNumber: rawBadge || undefined,
        sourceRow: i + 1
      };
      groupedRecords.set(groupKey, record);
    }

    // Date range tracking
    if (!earliestDate || parsedDate < earliestDate) earliestDate = parsedDate;
    if (!latestDate || parsedDate > latestDate) latestDate = parsedDate;
  }

  result.records = Array.from(groupedRecords.values());

  // Count matched / unmatched
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

  return result;
}
