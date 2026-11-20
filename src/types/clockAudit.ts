import { TimesheetDayEntry } from './odoo';

export type ClockLunchDeduction = 'none' | '30m' | '45m' | '60m';

// Statuts demandés dans la Matrice Personnel :
// Salarié Standard | Indépendant / Prestataire | Étudiant | Malade | Autre
export type ClockEmployeeStatus = 'standard' | 'contractor' | 'student' | 'sick' | 'other';

export type ClockContractType = 'standard' | 'contractor' | 'student' | 'sick' | 'other' | 'part_time';

export interface ClockEmployeeProfile {
  employeeId: number;
  employeeName: string;
  status: ClockEmployeeStatus; // 'standard' | 'contractor' | 'student' | 'sick' | 'other'
  contractType?: ClockContractType; // Rétrocompatibilité
  deductLunch: boolean; // Si coché -> Déduire 30 min fixe
  lunchDeduction?: ClockLunchDeduction; // Rétrocompatibilité ('30m' | 'none')
  requireValidationAlert: boolean; // Alerte orange 'Validation requise' même en cas d'égalité Pointeuse == Odoo
  alertOnContractorEqual?: boolean; // Rétrocompatibilité
  toleranceMinutes: number; // e.g. 15
  customNotes?: string;
  updatedAt?: string;
}

export interface ClockRawPunch {
  time: string; // '08:00'
  type?: 'in' | 'out';
}

export interface ClockImportedRecord {
  id: string;
  employeeNameRaw: string;
  matchedEmployeeId?: number;
  matchedEmployeeName?: string;
  date: string; // 'YYYY-MM-DD'
  rawHours: number;
  startTime?: string;
  endTime?: string;
  // Relevé exact pointeuse Excel :
  entree1?: string;
  sortie1?: string;
  entree2?: string;
  sortie2?: string;
  entree3?: string;
  sortie3?: string; // Valeur du temps présent calculé ou 3ème créneau
  tempsPresentEff?: string;
  calculationMethod?: 'sortie_3' | 'creneaux' | 'total_eff' | 'zero';
  isNonWorkingDay?: boolean; // ex: Entree_3 === '0:00' et absence
  punches?: ClockRawPunch[];
  sourceRow?: number;
  badgeNumber?: string;
}

export type ClockDiscrepancyStatus =
  | 'compliant'              // 🟢 Conforme (écart dans la tolérance)
  | 'unallocated_presence'   // 🔴 Écart positif (> tolérance) : Présence en atelier non imputée
  | 'contractor_equal_alert' // 🟡 Alerte Indépendant : Pointage égal à la pointeuse
  | 'validation_required'    // 🟡 Alerte Validation Requise (règle cochée dans la matrice)
  | 'excess_odoo'            // 🔵 Heures Odoo > Pointeuse (< -tolérance)
  | 'missing_odoo'           // ⚪ Pointeuse présente mais 0h Odoo
  | 'missing_clock'          // ⚪ Imputation Odoo présente mais 0h Pointeuse
  | 'sick_covered'           // 🟣 Arrêt Maladie (alertes d'heures masquées)
  | 'student_covered'        // 🟣 Statut Étudiant (alertes d'heures masquées)
  | 'other_covered'          // 🟣 Statut Autre (alertes d'heures masquées)
  | 'justified';             // 🟣 Anomalie ou écart justifié / validé

export interface ClockJustification {
  id: string; // `${employeeId}_${date}`
  employeeId: number;
  employeeName: string;
  date: string;
  reason: string;
  reasonLabel: string;
  comment: string;
  status: 'justified' | 'pending';
  createdAt: string;
  updatedAt: string;
  justifiedBy?: string;
}

export interface ClockDiscrepancyRow {
  id: string; // `${employeeId}_${date}`
  employeeId: number;
  employeeName: string;
  date: string;
  formattedDate: string;
  dayOfWeek: number;
  isWeekend: boolean;
  statusType: ClockEmployeeStatus;
  contractType: ClockContractType;
  toleranceMinutes: number;
  
  rawClockHours: number;
  lunchDeductionHours: number; // 0.5h si deductLunch est vrai et présence > 0
  lunchDeductionType: string;
  adjustedClockHours: number;
  
  odooHours: number;
  odooLinesCount: number;
  
  discrepancyHours: number; // adjustedClockHours - odooHours
  discrepancyMinutes: number;
  
  status: ClockDiscrepancyStatus;
  statusLabel: string;
  statusDescription: string;
  
  justification?: ClockJustification;
  odooDayDetail?: TimesheetDayEntry;
  rawClockRecord?: ClockImportedRecord;
}

export interface ClockAuditSummary {
  totalRows: number;
  totalAdjustedClockHours: number;
  totalOdooHours: number;
  netDiscrepancyHours: number;
  compliantCount: number;
  unallocatedPresenceCount: number;
  contractorAlertCount: number;
  validationRequiredCount: number;
  excessOdooCount: number;
  justifiedCount: number;
  missingOdooCount: number;
  missingClockCount: number;
  exemptedCount: number; // Malade, Étudiant, Autre
}
