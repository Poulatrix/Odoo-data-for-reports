import React, { useState, useMemo } from 'react';
import {
  UploadCloud,
  Settings,
  Download,
  Trash2,
  Filter,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Briefcase,
  Calendar,
  Users,
  FileSpreadsheet,
  HelpCircle,
  RefreshCw,
  ChevronDown,
  Layers,
  Sparkles
} from 'lucide-react';
import {
  ClockEmployeeProfile,
  ClockImportedRecord,
  ClockJustification,
  ClockDiscrepancyRow
} from '../../types/clockAudit';
import { TimesheetAuditEmployeeItem, TimesheetWorkgroup } from '../../types/odoo';
import { buildClockDiscrepancies } from '../../utils/clockAuditEngine';
import { ClockImportModal } from './ClockImportModal';
import { ClockProfilesModal } from './ClockProfilesModal';
import { ClockDayDetailModal } from './ClockDayDetailModal';

export type ClockPeriodPreset = 'last7days' | 'currentMonth' | 'lastMonth' | 'custom';

interface ClockAuditViewProps {
  employees: TimesheetAuditEmployeeItem[];
  startDate: string;
  endDate: string;
  periodPreset?: ClockPeriodPreset;
  thresholdHours?: number;
  hideWeekends?: boolean;
  onPeriodChange?: (preset: ClockPeriodPreset) => void;
  onCustomDatesChange?: (start: string, end: string) => void;
  onToggleHideWeekends?: (hide: boolean) => void;
  onRefreshOdoo?: () => Promise<void>;
  loading?: boolean;
  workgroups?: TimesheetWorkgroup[];
  activeWorkgroupId?: string | null;
  onWorkgroupChange?: (id: string | null) => void;
  importedDatesRange?: { minD: string; maxD: string } | null;
  profiles: Record<number, ClockEmployeeProfile>;
  justifications: Record<string, ClockJustification>;
  importedRecords: ClockImportedRecord[];
  onSaveProfiles: (profiles: ClockEmployeeProfile[]) => Promise<void>;
  onSaveJustification: (justification: ClockJustification) => Promise<void>;
  onRemoveJustification: (id: string) => Promise<void>;
  onImportComplete: (records: ClockImportedRecord[]) => void;
  onClearImportedRecords: () => void;
}

interface MatrixDateColumn {
  dateStr: string;
  label: string;
  dayOfWeek: number;
  isWeekend: boolean;
}

interface MatrixRow {
  employeeId: number;
  employeeName: string;
  statusType?: string;
  contractType?: string;
  has30minTable: boolean;
  isContractor: boolean;
  totalOdoo: number;
  totalClock: number; // total badgeuse brut
  totalNetClock: number; // badgeuse après pause 30m
  totalDiscrepancy: number;
  hasDiscrepancy: boolean;
  days: Map<string, ClockDiscrepancyRow>;
}

const BASE_MIN_DATE = '2020-01-01';

export const ClockAuditView: React.FC<ClockAuditViewProps> = ({
  employees,
  startDate,
  endDate,
  periodPreset = 'custom',
  thresholdHours = 7,
  hideWeekends = true,
  onPeriodChange,
  onCustomDatesChange,
  onToggleHideWeekends,
  onRefreshOdoo,
  loading = false,
  workgroups = [],
  activeWorkgroupId = null,
  onWorkgroupChange,
  importedDatesRange,
  profiles,
  justifications,
  importedRecords,
  onSaveProfiles,
  onImportComplete,
  onClearImportedRecords
}) => {
  // Modals state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isProfilesModalOpen, setIsProfilesModalOpen] = useState(false);
  
  // Selected day detail modal state
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    row?: ClockDiscrepancyRow;
    employeeName: string;
    dateStr: string;
    dateLabel: string;
  } | null>(null);

  // Local table filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterDiscrepanciesOnly, setFilterDiscrepanciesOnly] = useState<boolean>(false);

  // 1. Build all discrepancy data across the period using the engine
  const { rows, summary } = useMemo(() => {
    return buildClockDiscrepancies({
      importedRecords,
      odooEmployees: employees,
      profiles,
      justifications,
      startDate,
      endDate,
      hideWeekends: false // We keep all dates so we can toggle weekend visibility in the matrix
    });
  }, [importedRecords, employees, profiles, justifications, startDate, endDate]);

  // 2. Extract unique dates list for matrix columns
  const dateColumns = useMemo<MatrixDateColumn[]>(() => {
    const map = new Map<string, MatrixDateColumn>();
    
    // First, fill from rows
    rows.forEach(r => {
      if (!map.has(r.date)) {
        map.set(r.date, {
          dateStr: r.date,
          label: r.formattedDate,
          dayOfWeek: r.dayOfWeek,
          isWeekend: r.isWeekend
        });
      }
    });

    // Fallback: if no rows yet, generate from startDate to endDate
    if (map.size === 0 && startDate && endDate) {
      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      const cur = new Date(startDate);
      const end = new Date(endDate);
      while (cur <= end) {
        const dateStr = cur.toISOString().slice(0, 10);
        const dayOfWeek = cur.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const day = cur.getDate().toString().padStart(2, '0');
        const month = (cur.getMonth() + 1).toString().padStart(2, '0');
        map.set(dateStr, {
          dateStr,
          label: `${dayNames[dayOfWeek]} ${day}/${month}`,
          dayOfWeek,
          isWeekend
        });
        cur.setDate(cur.getDate() + 1);
      }
    }

    const list = Array.from(map.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    if (hideWeekends) {
      return list.filter(d => !d.isWeekend);
    }
    return list;
  }, [rows, startDate, endDate, hideWeekends]);

  // 3. Build Collaborator Matrix Rows with User Business Rules
  const matrixRows = useMemo<MatrixRow[]>(() => {
    const empMap = new Map<number, MatrixRow>();

    rows.forEach(r => {
      if (!empMap.has(r.employeeId)) {
        const prof = profiles[r.employeeId];
        const has30min = prof ? prof.deductLunch !== false : true;
        const isContractor = r.statusType === 'contractor' || r.contractType === 'contractor' || prof?.status === 'contractor';

        empMap.set(r.employeeId, {
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          statusType: r.statusType,
          contractType: r.contractType,
          has30minTable: has30min,
          isContractor: !!isContractor,
          totalOdoo: 0,
          totalClock: 0,
          totalNetClock: 0,
          totalDiscrepancy: 0,
          hasDiscrepancy: false,
          days: new Map()
        });
      }

      const emp = empMap.get(r.employeeId)!;
      emp.days.set(r.date, r);

      // Only sum for displayed dates
      if (!hideWeekends || !r.isWeekend) {
        const totalBadgeuse = r.rawClockHours > 0 ? r.rawClockHours : r.adjustedClockHours;
        emp.totalOdoo += r.odooHours;
        emp.totalClock += totalBadgeuse;
        emp.totalNetClock += r.adjustedClockHours;
        emp.totalDiscrepancy += (totalBadgeuse - r.odooHours);

        // RÈGLE UTILISATEUR :
        // - Badgeuse > Odoo : correct (vert)
        // - Odoo == Badgeuse : orange si 30m ou indépendant, vert si pas de table
        // - Odoo > Badgeuse : rouge (pas correct)
        const diffBadgeuseOdoo = Math.round((totalBadgeuse - r.odooHours) * 100) / 100;
        const isOdooGreater = r.odooHours > totalBadgeuse && Math.abs(diffBadgeuseOdoo) > 0.05;
        const isEqual = Math.abs(diffBadgeuseOdoo) <= 0.05 && r.odooHours > 0;
        const isOrangeAlert = isEqual && (emp.has30minTable || emp.isContractor);

        if (isOdooGreater || isOrangeAlert) {
          emp.hasDiscrepancy = true;
        }
      }
    });

    // Round employee totals
    empMap.forEach(emp => {
      emp.totalOdoo = Math.round(emp.totalOdoo * 100) / 100;
      emp.totalClock = Math.round(emp.totalClock * 100) / 100;
      emp.totalNetClock = Math.round(emp.totalNetClock * 100) / 100;
      emp.totalDiscrepancy = Math.round(emp.totalDiscrepancy * 100) / 100;
    });

    return Array.from(empMap.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [rows, hideWeekends, profiles]);

  // 4. Filtered matrix rows based on active workgroup, search, and discrepancy filter
  const filteredMatrixRows = useMemo(() => {
    // Workgroup filter
    let baseList = matrixRows;
    if (activeWorkgroupId && workgroups.length > 0) {
      const activeGroup = workgroups.find(g => g.id === activeWorkgroupId);
      if (activeGroup) {
        baseList = baseList.filter(emp => activeGroup.employeeIds.includes(emp.employeeId));
      }
    }

    return baseList.filter(emp => {
      if (filterDiscrepanciesOnly && !emp.hasDiscrepancy) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!emp.employeeName.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [matrixRows, activeWorkgroupId, workgroups, filterDiscrepanciesOnly, searchQuery]);

  // 5. Compute Team Totals per Date Column
  const teamDateTotals = useMemo(() => {
    const map = new Map<string, { odoo: number; clock: number }>();
    dateColumns.forEach(d => {
      let odooSum = 0;
      let clockSum = 0;
      filteredMatrixRows.forEach(emp => {
        const dayRow = emp.days.get(d.dateStr);
        if (dayRow) {
          const totalBadgeuse = dayRow.rawClockHours > 0 ? dayRow.rawClockHours : dayRow.adjustedClockHours;
          odooSum += dayRow.odooHours;
          clockSum += totalBadgeuse;
        }
      });
      map.set(d.dateStr, {
        odoo: Math.round(odooSum * 100) / 100,
        clock: Math.round(clockSum * 100) / 100
      });
    });
    return map;
  }, [dateColumns, filteredMatrixRows]);

  // 6. Overall KPI Totals across filtered rows
  const overallTotals = useMemo(() => {
    let odoo = 0;
    let clock = 0;
    let greenCount = 0;
    let orangeCount = 0;
    let redCount = 0;
    let justifiedCount = 0;

    filteredMatrixRows.forEach(emp => {
      odoo += emp.totalOdoo;
      clock += emp.totalClock;

      dateColumns.forEach(col => {
        const dayRow = emp.days.get(col.dateStr);
        if (!dayRow) return;

        const odooH = dayRow.odooHours;
        const totalBadgeuse = dayRow.rawClockHours > 0 ? dayRow.rawClockHours : dayRow.adjustedClockHours;
        const diff = Math.round((totalBadgeuse - odooH) * 100) / 100;
        const isEqual = Math.abs(diff) <= 0.05 && odooH > 0;

        if (dayRow.justification && dayRow.justification.status === 'justified') {
          justifiedCount++;
        } else if (odooH === 0 && totalBadgeuse === 0) {
          // Neutral day, no count
        } else if (odooH > totalBadgeuse && Math.abs(diff) > 0.05) {
          redCount++;
        } else if (isEqual) {
          if (emp.has30minTable || emp.isContractor) {
            orangeCount++;
          } else {
            greenCount++;
          }
        } else if (diff > 0.05) {
          greenCount++;
        }
      });
    });

    odoo = Math.round(odoo * 100) / 100;
    clock = Math.round(clock * 100) / 100;
    const diff = Math.round((clock - odoo) * 100) / 100;

    return { odoo, clock, diff, greenCount, orangeCount, redCount, justifiedCount };
  }, [filteredMatrixRows, dateColumns]);

  // Export Matrix to CSV
  const handleExportCsv = () => {
    const headerRow: string[] = ['Collaborateur', 'Total Odoo (h)', 'Total Pointeuse (h)', 'Écart Global (h)'];
    dateColumns.forEach(d => {
      headerRow.push(`${d.label} [Odoo]`, `${d.label} [Badgeuse]`);
    });

    const csvLines: string[] = [headerRow.join(';')];

    filteredMatrixRows.forEach(emp => {
      const line: string[] = [
        `"${emp.employeeName}"`,
        emp.totalOdoo.toFixed(2),
        emp.totalClock.toFixed(2),
        emp.totalDiscrepancy.toFixed(2)
      ];

      dateColumns.forEach(d => {
        const dayRow = emp.days.get(d.dateStr);
        const odooH = dayRow ? dayRow.odooHours.toFixed(2) : '0.00';
        const totalBadgeuse = dayRow ? (dayRow.rawClockHours > 0 ? dayRow.rawClockHours : dayRow.adjustedClockHours).toFixed(2) : '0.00';
        line.push(odooH, totalBadgeuse);
      });

      csvLines.push(line.join(';'));
    });

    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Synthese_Matrice_Pointages_${startDate}_au_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          
          {/* Title & Description */}
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
                Contrôle des Pointages — Matrice Croisée
              </h2>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                Odoo vs Badgeuse
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Vue synthétique journalière : Total Odoo vs Total Badgeuse avec détection automatique des écarts
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-xs transition-colors cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Importer Relevé (Excel/CSV)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsProfilesModalOpen(true)}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-xs transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>Règles & Tolérances</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredMatrixRows.length === 0}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
              title="Exporter la matrice en CSV"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Exporter CSV</span>
            </button>

            {importedRecords.length > 0 && (
              <button
                type="button"
                onClick={onClearImportedRecords}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50/60 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                title="Effacer les pointages importés"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vider pointages</span>
              </button>
            )}
          </div>

        </div>

        {/* Persisted Pointages Banner */}
        {importedRecords.length > 0 && importedDatesRange && (
          <div className="mt-5 py-3 px-4 rounded-lg bg-slate-50 dark:bg-slate-850/60 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2.5 text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span>
                <strong>{importedRecords.length} pointage{importedRecords.length > 1 ? 's' : ''} enregistré{importedRecords.length > 1 ? 's' : ''} en base de données</strong> couvrant la période du <strong>{importedDatesRange.minD}</strong> au <strong>{importedDatesRange.maxD}</strong>.
              </span>
            </div>
            {(startDate > importedDatesRange.minD || endDate < importedDatesRange.maxD) && (
              <button
                type="button"
                onClick={() => onCustomDatesChange?.(importedDatesRange.minD, importedDatesRange.maxD)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-xs transition-colors cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Afficher cette période ({importedDatesRange.minD} → {importedDatesRange.maxD})</span>
              </button>
            )}
          </div>
        )}

        {/* Global KPI Stats - Harmonized minimal cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3.5 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
          
          {/* Card 1: Collaborateurs */}
          <div className="bg-white dark:bg-slate-900/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Collaborateurs
            </div>
            <div className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums tracking-tight mt-1.5">
              {filteredMatrixRows.length} <span className="text-xs font-normal text-slate-400">/ {matrixRows.length}</span>
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              {activeWorkgroupId ? 'Groupe filtré' : 'Équipe complète'}
            </div>
          </div>

          {/* Card 2: Cumul Odoo */}
          <div className="bg-white dark:bg-slate-900/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cumul Odoo
            </div>
            <div className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums tracking-tight mt-1.5">
              {overallTotals.odoo.toFixed(1)} <span className="text-xs font-normal text-slate-400">h</span>
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              Feuilles de temps
            </div>
          </div>

          {/* Card 3: Cumul Badgeuse */}
          <div className="bg-white dark:bg-slate-900/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cumul Badgeuse
            </div>
            <div className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums tracking-tight mt-1.5">
              {overallTotals.clock.toFixed(1)} <span className="text-xs font-normal text-slate-400">h</span>
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              Présence physique
            </div>
          </div>

          {/* Card 4: Écart */}
          <div className="bg-white dark:bg-slate-900/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Écart (Badgeuse - Odoo)
            </div>
            <div className={`text-2xl font-semibold tabular-nums tracking-tight mt-1.5 ${
              overallTotals.diff > 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : overallTotals.diff < 0
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-slate-900 dark:text-white'
            }`}>
              {overallTotals.diff > 0 ? `+${overallTotals.diff.toFixed(1)}` : overallTotals.diff.toFixed(1)} <span className="text-xs font-normal text-slate-400">h</span>
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              {overallTotals.diff > 0 ? 'Badgeuse > Odoo (OK)' : overallTotals.diff < 0 ? 'Odoo > Badgeuse (Alerte)' : 'Équilibre exact'}
            </div>
          </div>

          {/* Card 5: Jours Conformes (Vert pastel) */}
          <div className="bg-white dark:bg-slate-900/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Corrects</span>
            </div>
            <div className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums tracking-tight mt-1.5">
              {overallTotals.greenCount}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              Badgeuse &ge; Odoo
            </div>
          </div>

          {/* Card 6: Contrôles Requis (Orange pastel) */}
          <div className="bg-white dark:bg-slate-900/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>À Contrôler</span>
            </div>
            <div className="text-2xl font-semibold text-amber-700 dark:text-amber-400 tabular-nums tracking-tight mt-1.5">
              {overallTotals.orangeCount}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              Pause 30m / Indép.
            </div>
          </div>

          {/* Card 7: Non conformes Odoo > Badgeuse (Rouge pastel) */}
          <div className="bg-white dark:bg-slate-900/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span>Pas correct</span>
            </div>
            <div className="text-2xl font-semibold text-rose-700 dark:text-rose-400 tabular-nums tracking-tight mt-1.5">
              {overallTotals.redCount}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              Odoo &gt; Badgeuse
            </div>
          </div>

        </div>
      </div>

      {/* COMPREHENSIVE TIME FILTER TOOLBAR */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        
        {/* Row 1: Workgroup + Period Presets + Date Inputs + Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          
          {/* Workgroup Selector */}
          <div className="space-y-1.5 min-w-[240px]">
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Groupe de Travail</span>
            </label>
            <div className="relative">
              <select
                value={activeWorkgroupId || ''}
                onChange={(e) => onWorkgroupChange?.(e.target.value || null)}
                className="w-full pl-3 pr-8 py-1.5 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-1 focus:ring-slate-400 cursor-pointer appearance-none transition-colors"
              >
                <option value="">
                  Tous les collaborateurs ({employees.length})
                </option>
                {workgroups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.employeeIds.length} coll.)
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Period Presets */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Période d'analyse</span>
            </label>
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
              <button
                type="button"
                onClick={() => onPeriodChange?.('last7days')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  periodPreset === 'last7days'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                7 derniers jours
              </button>
              <button
                type="button"
                onClick={() => onPeriodChange?.('currentMonth')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  periodPreset === 'currentMonth'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Ce mois-ci
              </button>
              <button
                type="button"
                onClick={() => onPeriodChange?.('lastMonth')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  periodPreset === 'lastMonth'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Mois dernier
              </button>

              {/* Quick Button: Match exact date range of the imported file */}
              {importedDatesRange && (
                <button
                  type="button"
                  onClick={() => onCustomDatesChange?.(importedDatesRange.minD, importedDatesRange.maxD)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                    startDate === importedDatesRange.minD && endDate === importedDatesRange.maxD
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                  }`}
                  title={`Aligner la période sur les dates du fichier importé (${importedDatesRange.minD} au ${importedDatesRange.maxD})`}
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Période importée ({importedDatesRange.minD.slice(5)} au {importedDatesRange.maxD.slice(5)})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onPeriodChange?.('custom')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  periodPreset === 'custom' && !(importedDatesRange && startDate === importedDatesRange.minD && endDate === importedDatesRange.maxD)
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Personnalisé
              </button>
            </div>
          </div>

          {/* Custom Date Pickers */}
          <div className="flex items-center space-x-2.5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Du
              </label>
              <input
                type="date"
                min={BASE_MIN_DATE}
                value={startDate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) onCustomDatesChange?.(val, endDate);
                }}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-1 focus:ring-slate-400 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Au
              </label>
              <input
                type="date"
                min={BASE_MIN_DATE}
                value={endDate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) onCustomDatesChange?.(startDate, val);
                }}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-1 focus:ring-slate-400 font-mono"
              />
            </div>
          </div>

          {/* Hide Weekends toggle & Refresh Button */}
          <div className="flex items-center space-x-2.5 pt-4 sm:pt-0">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={hideWeekends}
                onChange={e => onToggleHideWeekends?.(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              <span>Masquer Sam/Dim</span>
            </label>

            {onRefreshOdoo && (
              <button
                type="button"
                onClick={onRefreshOdoo}
                disabled={loading}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                title="Actualiser les données Odoo pour cette période"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-slate-600' : 'text-slate-400'}`} />
                <span>{loading ? 'Chargement...' : 'Actualiser Odoo'}</span>
              </button>
            )}
          </div>

        </div>

        {/* Row 2: Visual Legend & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          
          {/* Left: User Rules Visual Legend with soft pastel badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mr-1">
              Règles :
            </span>
            <span 
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/50"
              title="Temps total badgeuse supérieur au temps Odoo, OU pointage égal quand la personne ne prend pas de temps de table"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Correct (Badgeuse &gt; Odoo ou Sans table)
            </span>
            <span 
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/50"
              title="Temps Odoo égal au temps badgeuse avec pause 30 min activée, ou statut indépendant"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              À vérifier (Odoo = Badgeuse + 30m table / Indép.)
            </span>
            <span 
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-800/50"
              title="Heures imputées dans Odoo supérieures au temps de présence physique à la badgeuse"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Pas correct (Odoo &gt; Badgeuse)
            </span>
            <span 
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/60"
              title="Écart validé et documenté par le responsable"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              Justifié
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-400">
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              0.0 h / Repos
            </span>
          </div>

          {/* Right: Quick Search & Discrepancies Filter */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setFilterDiscrepanciesOnly(!filterDiscrepanciesOnly)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                filterDiscrepanciesOnly
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Écarts uniquement ({matrixRows.filter(r => r.hasDiscrepancy).length})</span>
            </button>

            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filtrer collaborateur..."
                className="w-48 pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-1 focus:ring-slate-400 dark:text-white"
              />
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            </div>
          </div>

        </div>

      </div>

      {/* Main Cross-Matrix Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto max-h-[72vh]">
          <table className="w-full text-left text-xs border-collapse">
            
            {/* Header with Dates and Sub-columns */}
            <thead className="sticky top-0 z-30 bg-slate-50 dark:bg-slate-850 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 shadow-xs select-none">
              
              {/* Row 1: Collaborator + Totals + Date Headers */}
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-40 bg-slate-50 dark:bg-slate-850 py-3.5 px-4 font-semibold uppercase tracking-wider text-[11px] text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 min-w-[210px]"
                >
                  Collaborateur
                </th>

                <th
                  rowSpan={2}
                  className="py-3.5 px-3 text-center font-semibold text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 text-[11px] min-w-[80px]"
                  title="Total des heures imputées dans Odoo sur la période sélectionnée"
                >
                  Tot. Odoo
                </th>

                <th
                  rowSpan={2}
                  className="py-3.5 px-3 text-center font-semibold text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 text-[11px] min-w-[80px]"
                  title="Total des heures de présence physique enregistrées à la badgeuse"
                >
                  Tot. Badgé
                </th>

                <th
                  rowSpan={2}
                  className="py-3.5 px-3 text-center font-semibold text-slate-700 dark:text-slate-200 border-r-2 border-slate-200 dark:border-slate-700 text-[11px] min-w-[80px]"
                  title="Écart net : Total Badgeuse - Total Odoo"
                >
                  Écart (Δ)
                </th>

                {/* Day Headers (Span 2 sub-columns each) */}
                {dateColumns.map(col => (
                  <th
                    key={col.dateStr}
                    colSpan={2}
                    className={`py-2.5 px-2 text-center font-medium border-r border-slate-200 dark:border-slate-700 min-w-[108px] ${
                      col.isWeekend
                        ? 'bg-slate-100/70 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500'
                        : 'bg-slate-50 dark:bg-slate-850 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="text-[11px] whitespace-nowrap">{col.label}</div>
                  </th>
                ))}
              </tr>

              {/* Row 2: Sub-columns [Odoo] and [Badgeuse] */}
              <tr>
                {dateColumns.map(col => (
                  <React.Fragment key={`sub_${col.dateStr}`}>
                    <th
                      className="py-1 px-1 text-center font-medium text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800"
                      title="Total des heures imputées dans Odoo"
                    >
                      Odoo
                    </th>
                    <th
                      className="py-1 px-1 text-center font-medium text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-700/80"
                      title="Total des heures badgées"
                    >
                      Badgeuse
                    </th>
                  </React.Fragment>
                ))}
              </tr>

            </thead>

            {/* Table Body: One Row per Collaborator */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {filteredMatrixRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + dateColumns.length * 2}
                    className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm"
                  >
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="font-medium text-slate-700 dark:text-slate-300">
                        Aucun collaborateur à afficher
                      </div>
                      <p className="text-xs max-w-md text-slate-400">
                        {importedRecords.length === 0
                          ? "Aucun relevé de pointeuse n'a encore été importé. Cliquez sur le bouton [Importer Relevé (Excel/CSV)] ci-dessus pour charger votre fichier."
                          : "Aucun résultat ne correspond aux filtres actuels (recherche ou filtre d'écarts)."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMatrixRows.map((emp, index) => {
                  // Global status for the collaborator across period
                  const isGlobalExcessOdoo = emp.totalOdoo > emp.totalClock && Math.abs(emp.totalOdoo - emp.totalClock) > 0.1;
                  const isGlobalBadgeuseGreater = emp.totalClock > emp.totalOdoo && Math.abs(emp.totalClock - emp.totalOdoo) > 0.1;
                  const isGlobalEqual = Math.abs(emp.totalClock - emp.totalOdoo) <= 0.1 && emp.totalOdoo > 0;
                  const isGlobalWarning = isGlobalEqual && (emp.has30minTable || emp.isContractor);

                  return (
                    <tr
                      key={emp.employeeId}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-850/50 transition-colors ${
                        index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/30 dark:bg-slate-850/20'
                      }`}
                    >
                      {/* Fixed Left Column: Collaborator Name */}
                      <td className="sticky left-0 z-20 bg-inherit py-3 px-4 font-medium text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="flex items-center space-x-2">
                          <span className="truncate max-w-[170px]" title={emp.employeeName}>
                            {emp.employeeName}
                          </span>
                          {emp.isContractor ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60 uppercase shrink-0" title="Profil Indépendant">
                              Indép.
                            </span>
                          ) : !emp.has30minTable ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60 shrink-0" title="Pas de déduction repas">
                              Sans table
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Period Total Odoo */}
                      <td className="py-3 px-2 text-center font-medium font-mono tabular-nums text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {emp.totalOdoo.toFixed(1)} h
                      </td>

                      {/* Period Total Badgeuse */}
                      <td className="py-3 px-2 text-center font-medium font-mono tabular-nums text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        {emp.totalClock.toFixed(1)} h
                      </td>

                      {/* Period Total Écart (Δ) */}
                      <td className={`py-3 px-2 text-center font-semibold font-mono tabular-nums border-r-2 border-slate-200 dark:border-slate-700 whitespace-nowrap ${
                        isGlobalExcessOdoo
                          ? 'text-rose-700 dark:text-rose-400'
                          : isGlobalWarning
                          ? 'text-amber-700 dark:text-amber-400'
                          : isGlobalBadgeuseGreater
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        {emp.totalDiscrepancy > 0 ? `+${emp.totalDiscrepancy.toFixed(1)}` : emp.totalDiscrepancy.toFixed(1)} h
                      </td>

                      {/* Day Columns (Odoo & Badgeuse pairs) */}
                      {dateColumns.map(col => {
                        const dayRow = emp.days.get(col.dateStr);
                        const odooH = dayRow ? dayRow.odooHours : 0;
                        const rawClockH = dayRow ? dayRow.rawClockHours : 0;
                        const clockH = dayRow ? dayRow.adjustedClockHours : 0;
                        const totalBadgeuse = rawClockH > 0 ? rawClockH : clockH;
                        
                        const isZero = odooH === 0 && totalBadgeuse === 0;
                        const diffBadgeuseOdoo = Math.round((totalBadgeuse - odooH) * 100) / 100;
                        const isOdooGreater = odooH > totalBadgeuse && Math.abs(diffBadgeuseOdoo) > 0.05;
                        const isEqual = Math.abs(diffBadgeuseOdoo) <= 0.05 && odooH > 0;
                        const isBadgeuseGreater = diffBadgeuseOdoo > 0.05;
                        const isJustified = dayRow?.justification && dayRow.justification.status === 'justified';

                        // RÈGLES UTILISATEUR :
                        // 1. Badgeuse > Odoo: Correct (VERT PASTEL)
                        // 2. Odoo = Badgeuse:
                        //    - Orange pastel si 30 min de table activé sur l'utilisateur, ou s'il est indépendant
                        //    - Vert pastel si la personne ne prend pas de temps de table
                        // 3. Odoo > Badgeuse: Pas correct et c'est ROUGE PASTEL
                        let odooChipClass = 'text-slate-400 dark:text-slate-500';
                        let clockChipClass = 'text-slate-400 dark:text-slate-500';
                        let cellTitle = `${emp.employeeName} — ${col.label}`;

                        if (isJustified) {
                          odooChipClass = 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-medium';
                          clockChipClass = 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-medium';
                          cellTitle = `Justifié : ${dayRow?.justification?.reasonLabel || 'Validé par le responsable'}`;
                        } else if (isZero) {
                          cellTitle = col.isWeekend ? 'Week-end' : 'Repos / 0h';
                        } else if (isOdooGreater) {
                          // ROUGE PASTEL: Odoo > Badgeuse
                          odooChipClass = 'bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60 font-medium';
                          clockChipClass = 'bg-rose-50/60 text-rose-600 border border-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/50';
                          cellTitle = `Pas correct : Heures Odoo (${odooH.toFixed(1)}h) supérieures au total badgeuse (${totalBadgeuse.toFixed(1)}h)`;
                        } else if (isEqual) {
                          if (emp.has30minTable || emp.isContractor) {
                            // ORANGE PASTEL: 30 min table activé ou Indépendant
                            odooChipClass = 'bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60 font-medium';
                            clockChipClass = 'bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60 font-medium';
                            cellTitle = emp.isContractor
                              ? `Alerte Indépendant : Pointage égal (${odooH.toFixed(1)}h), contrôle requis`
                              : `Alerte Pause 30 min : Temps Odoo égal au total badgeuse (${odooH.toFixed(1)}h) avec pause 30m activée`;
                          } else {
                            // VERT PASTEL: Pas de temps de table
                            odooChipClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60 font-medium';
                            clockChipClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60 font-medium';
                            cellTitle = `Conforme : Pas de temps de table, pointage égal (${odooH.toFixed(1)}h)`;
                          }
                        } else if (isBadgeuseGreater) {
                          // VERT PASTEL: Badgeuse > Odoo
                          if (odooH > 0) {
                            odooChipClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60 font-medium';
                            clockChipClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60 font-medium';
                            cellTitle = `Correct : Temps total badgeuse (${totalBadgeuse.toFixed(1)}h) supérieur aux heures Odoo (${odooH.toFixed(1)}h)`;
                          } else {
                            // Badgeuse seule (présence sans imputation Odoo)
                            odooChipClass = 'text-slate-400 dark:text-slate-500';
                            clockChipClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60 font-medium';
                            cellTitle = `Pointage badgé (${totalBadgeuse.toFixed(1)}h) sans imputation Odoo (0.0h)`;
                          }
                        }

                        const handleCellClick = () => {
                          setSelectedDayDetail({
                            row: dayRow,
                            employeeName: emp.employeeName,
                            dateStr: col.dateStr,
                            dateLabel: col.label
                          });
                        };

                        return (
                          <React.Fragment key={`${emp.employeeId}_${col.dateStr}`}>
                            
                            {/* Odoo Sub-Column Cell */}
                            <td
                              onClick={handleCellClick}
                              className={`py-2 px-1 text-center border-r border-slate-100 dark:border-slate-800 cursor-pointer hover:opacity-75 transition-opacity ${
                                col.isWeekend ? 'bg-slate-50/40 dark:bg-slate-800/20' : ''
                              }`}
                              title={`${cellTitle} (Cliquer pour ouvrir le détail)`}
                            >
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums min-w-[46px] text-center ${odooChipClass}`}>
                                {odooH > 0 ? `${odooH.toFixed(1)} h` : col.isWeekend ? '-' : '0.0 h'}
                              </span>
                            </td>

                            {/* Badgeuse Sub-Column Cell */}
                            <td
                              onClick={handleCellClick}
                              className={`py-2 px-1 text-center border-r border-slate-200/80 dark:border-slate-700/80 cursor-pointer hover:opacity-75 transition-opacity ${
                                col.isWeekend ? 'bg-slate-50/40 dark:bg-slate-800/20' : ''
                              }`}
                              title={`${cellTitle} (Cliquer pour ouvrir le détail)`}
                            >
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums min-w-[46px] text-center ${clockChipClass}`}>
                                {totalBadgeuse > 0 ? `${totalBadgeuse.toFixed(1)} h` : col.isWeekend ? '-' : '0.0 h'}
                              </span>
                            </td>

                          </React.Fragment>
                        );
                      })}

                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Matrix Footer: Team Daily Totals */}
            {filteredMatrixRows.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 bg-slate-50 dark:bg-slate-850 font-medium border-t-2 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs">
                <tr>
                  <td className="sticky left-0 z-30 bg-slate-50 dark:bg-slate-850 px-4 py-3.5 border-r border-slate-200 dark:border-slate-700 font-semibold uppercase tracking-wider text-[11px]">
                    Total Équipe
                  </td>
                  <td className="py-3 px-2 text-center text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-700 font-mono tabular-nums font-semibold">
                    {overallTotals.odoo.toFixed(1)} h
                  </td>
                  <td className="py-3 px-2 text-center text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-700 font-mono tabular-nums font-semibold">
                    {overallTotals.clock.toFixed(1)} h
                  </td>
                  <td className={`py-3 px-2 text-center border-r-2 border-slate-200 dark:border-slate-700 font-mono tabular-nums font-semibold ${
                    overallTotals.diff > 0.5
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : overallTotals.diff < -0.5
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}>
                    {overallTotals.diff > 0 ? `+${overallTotals.diff.toFixed(1)}` : overallTotals.diff.toFixed(1)} h
                  </td>

                  {/* Daily Team Totals for Odoo and Badgeuse */}
                  {dateColumns.map(col => {
                    const totals = teamDateTotals.get(col.dateStr) || { odoo: 0, clock: 0 };
                    return (
                      <React.Fragment key={`tot_${col.dateStr}`}>
                        <td className="py-3 px-1 text-center text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 font-medium">
                          {totals.odoo > 0 ? `${totals.odoo.toFixed(1)} h` : '-'}
                        </td>
                        <td className="py-3 px-1 text-center text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 font-medium">
                          {totals.clock > 0 ? `${totals.clock.toFixed(1)} h` : '-'}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tfoot>
            )}

          </table>
        </div>

        {/* Quick Help / Instruction footer */}
        <div className="bg-slate-50 dark:bg-slate-850 border-t border-slate-200/80 dark:border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between text-xs text-slate-500">
          <span>
            Affichage de <strong>{filteredMatrixRows.length}</strong> collaborateur{filteredMatrixRows.length > 1 ? 's' : ''} sur <strong>{dateColumns.length}</strong> jours ouvrés.
          </span>
          <span className="text-[11px] text-slate-400">
            Astuce : Cliquez sur une cellule de la matrice pour consulter le détail des imputations et des pointages.
          </span>
        </div>

      </div>

      {/* Modals */}
      <ClockImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        availableEmployees={employees}
        startDate={startDate}
        endDate={endDate}
        onImportComplete={onImportComplete}
      />

      <ClockProfilesModal
        isOpen={isProfilesModalOpen}
        onClose={() => setIsProfilesModalOpen(false)}
        employees={employees}
        profiles={profiles}
        onSaveProfiles={onSaveProfiles}
      />

      <ClockDayDetailModal
        isOpen={!!selectedDayDetail}
        onClose={() => setSelectedDayDetail(null)}
        row={selectedDayDetail?.row}
        employeeName={selectedDayDetail?.employeeName || ''}
        dateStr={selectedDayDetail?.dateStr || ''}
        dateLabel={selectedDayDetail?.dateLabel || ''}
      />

    </div>
  );
};
