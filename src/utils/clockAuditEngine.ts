import {
  ClockDiscrepancyRow,
  ClockDiscrepancyStatus,
  ClockEmployeeProfile,
  ClockEmployeeStatus,
  ClockImportedRecord,
  ClockJustification,
  ClockAuditSummary
} from '../types/clockAudit';
import { TimesheetAuditEmployeeItem, TimesheetDayEntry } from '../types/odoo';
import { lunchDeductionToHours, formatMinutesDiff, createDefaultProfile } from '../services/clockAuditStorageService';

export interface BuildDiscrepanciesOptions {
  importedRecords: ClockImportedRecord[];
  odooEmployees: TimesheetAuditEmployeeItem[];
  profiles: Record<number, ClockEmployeeProfile>;
  justifications: Record<string, ClockJustification>;
  startDate: string;
  endDate: string;
  hideWeekends?: boolean;
}

/**
 * Normalise a string for accent-insensitive and punctuation-free comparison
 */
export function normalizeString(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Flexible matching between raw operator name (e.g. "BANTUELLE Alexandre")
 * and an Odoo employee item (e.g. "Alexandre Bantuelle").
 */
export function findMatchingOdooEmployee(
  rawName: string,
  odooEmployees: TimesheetAuditEmployeeItem[]
): TimesheetAuditEmployeeItem | undefined {
  if (!rawName || !odooEmployees.length) return undefined;

  const normRaw = normalizeString(rawName);
  const rawWords = normRaw.split(' ').filter(w => w.length > 0);
  const sortedRawWords = [...rawWords].sort().join(' ');

  // 1. Exact normalized match (e.g. "alexandre bantuelle" === "alexandre bantuelle")
  for (const emp of odooEmployees) {
    const normEmp = normalizeString(emp.name);
    if (normEmp === normRaw) return emp;
  }

  // 2. Word permutation / sorted words match (e.g. "Bantuelle Alexandre" === "Alexandre Bantuelle")
  for (const emp of odooEmployees) {
    const normEmp = normalizeString(emp.name);
    const empWords = normEmp.split(' ').filter(w => w.length > 0);
    const sortedEmpWords = [...empWords].sort().join(' ');
    if (sortedRawWords && sortedEmpWords && sortedRawWords === sortedEmpWords) {
      return emp;
    }
  }

  // 3. Reversed words match
  if (rawWords.length >= 2) {
    const reversedRaw = [...rawWords].reverse().join(' ');
    for (const emp of odooEmployees) {
      const normEmp = normalizeString(emp.name);
      if (normEmp === reversedRaw) return emp;
    }
  }

  // 4. Subset matching: all words of emp in raw, or all words of raw in emp
  for (const emp of odooEmployees) {
    const normEmp = normalizeString(emp.name);
    const empWords = normEmp.split(' ').filter(w => w.length >= 2);
    if (empWords.length >= 2 && empWords.every(w => normRaw.includes(w))) {
      return emp;
    }
    if (rawWords.length >= 2 && rawWords.every(w => normEmp.includes(w))) {
      return emp;
    }
  }

  // 5. Significant token overlap (at least 2 matching words)
  if (rawWords.length >= 2) {
    for (const emp of odooEmployees) {
      const normEmp = normalizeString(emp.name);
      const empWords = normEmp.split(' ').filter(w => w.length >= 2);
      if (empWords.length >= 2) {
        const matchesCount = rawWords.filter(rw => empWords.includes(rw)).length;
        if (matchesCount >= 2) return emp;
      }
    }
  }

  return undefined;
}

/**
 * Generate a stable negative ID for unlinked operators to avoid collisions with Odoo IDs
 */
function hashStringToId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return -Math.abs(hash || 1);
}

interface PersonEntity {
  id: number;
  name: string;
  rawOperatorNames: string[];
  odooEmp?: TimesheetAuditEmployeeItem;
}

/**
 * Builds comparison rows between clock punches and Odoo timesheets
 * with flexible employee matching and full non-blocking import support.
 */
export function buildClockDiscrepancies({
  importedRecords,
  odooEmployees,
  profiles,
  justifications,
  startDate,
  endDate,
  hideWeekends = false
}: BuildDiscrepanciesOptions): {
  rows: ClockDiscrepancyRow[];
  summary: ClockAuditSummary;
} {
  const rows: ClockDiscrepancyRow[] = [];

  // Map imported records by `${employeeNameRaw.trim().toLowerCase()}_${date}` and by `${matchedEmployeeId}_${date}`
  const clockMapByRaw = new Map<string, ClockImportedRecord>();
  const clockMapByMatchedId = new Map<string, ClockImportedRecord>();

  importedRecords.forEach(rec => {
    const rawKey = `${rec.employeeNameRaw.trim().toLowerCase()}_${rec.date}`;
    clockMapByRaw.set(rawKey, rec);
    if (rec.matchedEmployeeId) {
      clockMapByMatchedId.set(`${rec.matchedEmployeeId}_${rec.date}`, rec);
    }
  });

  // Collect all unique dates between start and end date or dates present in imported records
  const allDatesSet = new Set<string>();
  
  // 1. If startDate and endDate are provided, respect them as the primary filter period
  if (startDate && endDate) {
    const cur = new Date(startDate);
    const end = new Date(endDate);
    while (cur <= end) {
      allDatesSet.add(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    // 2. If no explicit range, collect dates from imported records
    importedRecords.forEach(r => {
      if (r.date) allDatesSet.add(r.date);
    });
  }

  const sortedDates = Array.from(allDatesSet).sort();

  // Gather all unique raw operator names from imported records
  const rawOperatorsSet = new Set<string>();
  importedRecords.forEach(r => {
    if (r.employeeNameRaw && r.employeeNameRaw.trim()) {
      rawOperatorsSet.add(r.employeeNameRaw.trim());
    }
  });

  // Perform flexible matching between imported operators and Odoo employees
  const operatorToOdooEmp = new Map<string, TimesheetAuditEmployeeItem>();

  rawOperatorsSet.forEach(rawOp => {
    const match = findMatchingOdooEmployee(rawOp, odooEmployees);
    if (match) {
      operatorToOdooEmp.set(rawOp, match);
    }
  });

  // Build the complete list of entities to process:
  // All Odoo employees + all distinct imported operators
  const entitiesMap = new Map<number, PersonEntity>();

  // A. Add entities for Odoo employees
  odooEmployees.forEach(emp => {
    const matchingRawNames: string[] = [];
    rawOperatorsSet.forEach(rawOp => {
      const match = operatorToOdooEmp.get(rawOp);
      if (match && match.id === emp.id) {
        matchingRawNames.push(rawOp);
      }
    });

    entitiesMap.set(emp.id, {
      id: emp.id,
      name: emp.name,
      rawOperatorNames: matchingRawNames,
      odooEmp: emp
    });
  });

  // B. Add entities for imported operators that have NO Odoo match
  rawOperatorsSet.forEach(rawOp => {
    if (!operatorToOdooEmp.has(rawOp)) {
      const syntheticId = hashStringToId(rawOp);
      entitiesMap.set(syntheticId, {
        id: syntheticId,
        name: rawOp,
        rawOperatorNames: [rawOp],
        odooEmp: undefined
      });
    }
  });

  const entitiesToProcess = Array.from(entitiesMap.values());

  entitiesToProcess.forEach(entity => {
    const profile = profiles[entity.id] || createDefaultProfile(entity.id, entity.name);
    const empStatus: ClockEmployeeStatus = profile.status || (profile.contractType === 'contractor' ? 'contractor' : 'standard');
    const toleranceMinutes = profile.toleranceMinutes || 15;
    
    // Règle Matrice : Si "Déduire Pause Midi (30 min)" est coché -> soustraire 30 min (0.5h) fixe
    const deductLunch = typeof profile.deductLunch === 'boolean'
      ? profile.deductLunch
      : (profile.lunchDeduction ? profile.lunchDeduction !== 'none' : true);
    const lunchDeductionHours = deductLunch ? 0.5 : 0.0;

    const requireValidationAlert = typeof profile.requireValidationAlert === 'boolean'
      ? profile.requireValidationAlert
      : (empStatus === 'contractor' || profile.alertOnContractorEqual);

    sortedDates.forEach(dateStr => {
      const dt = new Date(dateStr);
      const dayOfWeek = dt.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (hideWeekends && isWeekend) {
        return;
      }

      // 1. Get Clock Record if any for this entity
      let clockRec: ClockImportedRecord | undefined = undefined;
      for (const rawName of entity.rawOperatorNames) {
        const r = clockMapByRaw.get(`${rawName.toLowerCase()}_${dateStr}`);
        if (r) {
          clockRec = r;
          break;
        }
      }
      if (!clockRec) {
        clockRec = clockMapByMatchedId.get(`${entity.id}_${dateStr}`);
      }
      if (!clockRec) {
        clockRec = clockMapByRaw.get(`${entity.name.toLowerCase()}_${dateStr}`);
      }

      const rawClockHours = clockRec ? clockRec.rawHours : 0;

      // 2. Compute lunch deduction: soustraire 30 min (0.50h) si coché et présence > 0
      const actualDeduction = (deductLunch && rawClockHours > 0) ? lunchDeductionHours : 0;
      const adjustedClockHours = Math.max(0, Math.round((rawClockHours - actualDeduction) * 100) / 100);

      // 3. Get Odoo hours for this day
      const odooDay: TimesheetDayEntry | undefined = entity.odooEmp?.days ? entity.odooEmp.days[dateStr] : undefined;
      const odooHours = odooDay ? odooDay.hours : 0;
      const odooLinesCount = odooDay?.lines ? odooDay.lines.length : 0;

      // If no clock and no Odoo hours at all on a weekend or inactive day, skip to avoid empty noise
      if (rawClockHours === 0 && odooHours === 0) {
        return;
      }

      // 4. Compute Discrepancy (Δ = Pointeuse Ajustée - Odoo)
      const discrepancyHours = Math.round((adjustedClockHours - odooHours) * 100) / 100;
      const discrepancyMinutes = Math.round(discrepancyHours * 60);

      // 5. Check for existing justification
      const rowId = `${entity.id}_${dateStr}`;
      const justification = justifications[rowId];

      // 6. Determine Status & Labels based on User Business Rules:
      // - Si temps total badgeuse > temps odoo: c'est correct (VERT / compliant)
      // - Si temps odoo = temps badgeuse:
      //     * orange (validation_required / contractor_equal_alert) si 30 min table activé ou indépendant
      //     * vert (compliant) si la personne ne prend pas de temps de table
      // - Si Odoo > temps badgeuse: c'est pas correct et c'est ROUGE (excess_odoo)
      const totalBadgeuseHours = rawClockHours > 0 ? rawClockHours : adjustedClockHours;
      const isContractor = empStatus === 'contractor';
      const has30MinLunchActive = deductLunch !== false;
      const diffBadgeuseOdoo = Math.round((totalBadgeuseHours - odooHours) * 100) / 100;
      const isHoursEqual = Math.abs(diffBadgeuseOdoo) <= 0.05 && odooHours > 0;

      let status: ClockDiscrepancyStatus = 'compliant';
      let statusLabel = 'Conforme';
      let statusDescription = `Écart conforme (dans la marge de ${toleranceMinutes} min)`;

      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      const formattedDate = `${dayNames[dayOfWeek]} ${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}`;

      if (justification && justification.status === 'justified') {
        status = 'justified';
        statusLabel = 'Justifié / Validé';
        statusDescription = justification.reasonLabel 
          ? `${justification.reasonLabel} : ${justification.comment || 'Aucun détail'}`
          : (justification.comment || 'Écart justifié par le responsable');
      } else if (empStatus === 'sick') {
        // RÈGLE : Si "Malade" est coché -> Masquer les alertes d'heures manquantes Odoo
        status = 'sick_covered';
        statusLabel = 'Arrêt Maladie';
        statusDescription = "Collaborateur en arrêt maladie (alertes d'heures masquées)";
      } else if (empStatus === 'student') {
        // RÈGLE : Si "Étudiant" est coché -> Masquer les alertes d'heures manquantes Odoo
        status = 'student_covered';
        statusLabel = 'Étudiant';
        statusDescription = "Statut étudiant (alertes d'heures masquées)";
      } else if (empStatus === 'other') {
        // RÈGLE : Si "Autre" est coché -> Masquer les alertes d'heures manquantes Odoo
        status = 'other_covered';
        statusLabel = 'Autre statut';
        statusDescription = "Statut particulier (alertes d'heures masquées)";
      } else if (isHoursEqual) {
        // RÈGLE UTILISATEUR : Si temps odoo = temps badgeuse :
        // Orange si 30 min de table activé sur l'utilisateur, ou s'il est indépendant.
        // Vert si la personne ne prend pas de temps de table.
        if (has30MinLunchActive || isContractor || requireValidationAlert) {
          status = isContractor ? 'contractor_equal_alert' : 'validation_required';
          statusLabel = isContractor ? 'Validation Indépendant requise' : 'Contrôle Pause 30 min';
          statusDescription = isContractor
            ? `Pointage égal au temps Odoo (${odooHours}h) : contrôle requis (indépendant / sous-traitance)`
            : `Pointage égal au total badgeuse (${odooHours}h) alors que la pause de midi de 30 min est activée (vérifier la déduction)`;
        } else {
          status = 'compliant';
          statusLabel = 'Conforme';
          statusDescription = `Conforme : Pas de temps de table, pointage égal (${odooHours}h)`;
        }
      } else if (diffBadgeuseOdoo > 0.05) {
        // RÈGLE UTILISATEUR : Si temps total badgeuse > temps odoo : c'est correct (VERT)
        if (odooHours > 0) {
          status = 'compliant';
          statusLabel = 'Conforme';
          statusDescription = `Correct : Temps total badgeuse (${totalBadgeuseHours}h) supérieur aux heures Odoo (${odooHours}h)`;
        } else {
          status = 'unallocated_presence';
          statusLabel = 'Présence sans imputation Odoo';
          statusDescription = `Pointage de ${totalBadgeuseHours}h badgé à la pointeuse — Aucune imputation Odoo enregistrée sur cette journée`;
        }
      } else if (odooHours > totalBadgeuseHours) {
        // RÈGLE UTILISATEUR : Si Odoo est supérieur au temps de badgeuse, alors là c'est pas correct et c'est ROUGE
        status = 'excess_odoo';
        statusLabel = 'Non conforme (Odoo > Badgeuse)';
        statusDescription = `Pas correct : Heures imputées dans Odoo (${odooHours}h) supérieures au temps total badgeuse (${totalBadgeuseHours}h)`;
      } else {
        status = 'compliant';
        statusLabel = 'Conforme';
        statusDescription = `Écart conforme (${formatMinutesDiff(discrepancyMinutes)})`;
      }

      rows.push({
        id: rowId,
        employeeId: entity.id,
        employeeName: entity.name,
        date: dateStr,
        formattedDate,
        dayOfWeek,
        isWeekend,
        statusType: empStatus,
        contractType: empStatus,
        toleranceMinutes,
        rawClockHours,
        lunchDeductionHours: actualDeduction,
        lunchDeductionType: deductLunch ? '30m' : 'none',
        adjustedClockHours,
        odooHours,
        odooLinesCount,
        discrepancyHours,
        discrepancyMinutes,
        status,
        statusLabel,
        statusDescription,
        justification,
        odooDayDetail: odooDay,
        rawClockRecord: clockRec
      });
    });
  });

  // Sort rows: by date descending, then employee name
  rows.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return a.employeeName.localeCompare(b.employeeName);
  });

  // Compute Summary KPIs
  let totalAdjustedClockHours = 0;
  let totalOdooHours = 0;
  let compliantCount = 0;
  let unallocatedPresenceCount = 0;
  let contractorAlertCount = 0;
  let excessOdooCount = 0;
  let justifiedCount = 0;
  let missingOdooCount = 0;
  let missingClockCount = 0;

  let validationRequiredCount = 0;
  let exemptedCount = 0;

  rows.forEach(r => {
    totalAdjustedClockHours += r.adjustedClockHours;
    totalOdooHours += r.odooHours;

    if (r.status === 'compliant') compliantCount++;
    else if (r.status === 'unallocated_presence') unallocatedPresenceCount++;
    else if (r.status === 'contractor_equal_alert') contractorAlertCount++;
    else if (r.status === 'validation_required') validationRequiredCount++;
    else if (r.status === 'excess_odoo') excessOdooCount++;
    else if (r.status === 'justified') justifiedCount++;
    else if (r.status === 'missing_odoo') missingOdooCount++;
    else if (r.status === 'missing_clock') missingClockCount++;
    else if (r.status === 'sick_covered' || r.status === 'student_covered' || r.status === 'other_covered') exemptedCount++;
  });

  const netDiscrepancyHours = Math.round((totalAdjustedClockHours - totalOdooHours) * 100) / 100;

  const summary: ClockAuditSummary = {
    totalRows: rows.length,
    totalAdjustedClockHours: Math.round(totalAdjustedClockHours * 100) / 100,
    totalOdooHours: Math.round(totalOdooHours * 100) / 100,
    netDiscrepancyHours,
    compliantCount,
    unallocatedPresenceCount,
    contractorAlertCount,
    validationRequiredCount,
    excessOdooCount,
    justifiedCount,
    missingOdooCount,
    missingClockCount,
    exemptedCount
  };

  return { rows, summary };
}
