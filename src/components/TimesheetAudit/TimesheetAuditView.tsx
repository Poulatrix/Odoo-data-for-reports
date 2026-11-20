import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Clock, 
  RefreshCw, 
  Download, 
  Calendar, 
  Users, 
  Filter, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Sparkles, 
  FileSpreadsheet, 
  Layers,
  Settings,
  Plus,
  CalendarOff,
  ChevronDown,
  X,
  Star
} from 'lucide-react';
import { 
  TimesheetAuditEmployeeItem, 
  TimesheetAuditReportResponse, 
  TimesheetDayEntry, 
  TimesheetWorkgroup,
  TimesheetExclusion,
  TimesheetComplianceStatus,
  TimesheetDayStatusType,
  OdooConnectionCredentials 
} from '../../types/odoo';
import { odooClient } from '../../services/odooClient';
import { exportTimesheetAuditToExcel } from '../../utils/exportUtils';
import { TimesheetMatrixTable } from './TimesheetMatrixTable';
import { TimesheetNonCompliantTable } from './TimesheetNonCompliantTable';
import { TimesheetDayDetailModal } from './TimesheetDayDetailModal';
import { TimesheetWorkgroupModal } from './TimesheetWorkgroupModal';
import { TimesheetExclusionModal } from './TimesheetExclusionModal';
import { TimesheetBulkAbsenceModal } from './TimesheetBulkAbsenceModal';
import { TimesheetManageExclusionsModal } from './TimesheetManageExclusionsModal';
import { ClockAuditView } from './ClockAuditView';
import {
  ClockEmployeeProfile,
  ClockImportedRecord,
  ClockJustification
} from '../../types/clockAudit';
import {
  loadClockProfiles,
  saveBulkClockProfiles,
  subscribeToClockProfiles,
  loadClockJustifications,
  saveClockJustification,
  deleteClockJustification,
  subscribeToClockJustifications,
  loadImportedClockRecords,
  loadImportedClockRecordsFromFirestore,
  saveNewImportedClockRecords,
  clearImportedClockRecords,
  subscribeToImportedClockRecords
} from '../../services/clockAuditStorageService';
import { 
  loadWorkgroups, 
  saveWorkgroups, 
  loadExclusions, 
  saveExclusions,
  subscribeToWorkgroups,
  subscribeToExclusions,
  getFavoriteWorkgroupId,
  setFavoriteWorkgroupId
} from '../../services/timesheetStorageService';

interface TimesheetAuditViewProps {
  credentials: OdooConnectionCredentials | null;
  isDemo: boolean;
}

type PeriodPreset = 'last7days' | 'currentMonth' | 'lastMonth' | 'custom';

const BASE_MIN_DATE = '2020-01-01';

export const TimesheetAuditView: React.FC<TimesheetAuditViewProps> = ({
  credentials,
  isDemo
}) => {
  // Preset calculations with flexible date bounds
  const calculatePresetDates = (preset: PeriodPreset): { start: string; end: string } => {
    const today = new Date();
    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const s = `${y}-${m}-${day}`;
      return s < BASE_MIN_DATE ? BASE_MIN_DATE : s;
    };

    if (preset === 'last7days') {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return { start: formatDate(start), end: formatDate(today) };
    }

    if (preset === 'currentMonth') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: formatDate(start), end: formatDate(today) };
    }

    if (preset === 'lastMonth') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: formatDate(start), end: formatDate(end) };
    }

    const defaultStart = new Date(today);
    defaultStart.setDate(today.getDate() - 6);
    return { start: formatDate(defaultStart), end: formatDate(today) };
  };

  // Filter States
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('last7days');
  const [startDate, setStartDate] = useState<string>(() => calculatePresetDates('last7days').start);
  const [endDate, setEndDate] = useState<string>(() => calculatePresetDates('last7days').end);
  const [hideWeekends, setHideWeekends] = useState<boolean>(false);
  const [thresholdHours, setThresholdHours] = useState<number>(7.0);
  
  // Search by Name State
  const [nameSearchQuery, setNameSearchQuery] = useState<string>('');

  // Workgroups State & Saved Favorite Filter
  const [favoriteWorkgroupId, setFavoriteWorkgroupIdState] = useState<string | null>(() => getFavoriteWorkgroupId());
  const [workgroups, setWorkgroups] = useState<TimesheetWorkgroup[]>([]);
  const [activeWorkgroupId, setActiveWorkgroupId] = useState<string | null>(() => getFavoriteWorkgroupId());
  const [isWorkgroupModalOpen, setIsWorkgroupModalOpen] = useState<boolean>(false);

  // Exclusions State (SaaS Only)
  const [exclusions, setExclusions] = useState<Record<string, TimesheetExclusion>>({});
  const [isExclusionModalOpen, setIsExclusionModalOpen] = useState<boolean>(false);
  const [isBulkAbsenceModalOpen, setIsBulkAbsenceModalOpen] = useState<boolean>(false);
  const [isManageExclusionsModalOpen, setIsManageExclusionsModalOpen] = useState<boolean>(false);
  const [targetExclusionEmp, setTargetExclusionEmp] = useState<{ id: number; name: string } | null>(null);
  const [targetExclusionDate, setTargetExclusionDate] = useState<string>('');
  const [targetExclusionFormattedDate, setTargetExclusionFormattedDate] = useState<string>('');
  const [targetExclusionHours, setTargetExclusionHours] = useState<number>(0);

  // Sub-Tab State: 'matrix' (Matrice & Conformité Odoo) vs 'clock_audit' (Audit Pointeuse CSV)
  const [activeTab, setActiveTab] = useState<'matrix' | 'clock_audit'>('matrix');

  // Clock Audit State (Pointeuse CSV vs Odoo)
  const [clockProfiles, setClockProfiles] = useState<Record<number, ClockEmployeeProfile>>({});
  const [clockJustifications, setClockJustifications] = useState<Record<string, ClockJustification>>({});
  const [importedClockRecords, setImportedClockRecords] = useState<ClockImportedRecord[]>(() => loadImportedClockRecords());

  // Data State
  const [loading, setLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<TimesheetAuditReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Modal Detail State
  const [selectedEmployee, setSelectedEmployee] = useState<TimesheetAuditEmployeeItem | null>(null);
  const [selectedDay, setSelectedDay] = useState<TimesheetDayEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const isInitialMount = useRef(true);

  // Load Workgroups, Exclusions, Clock Profiles, and Clock Justifications on mount + real-time multi-browser sync
  useEffect(() => {
    let unsubExclusions: (() => void) | undefined;
    let unsubWorkgroups: (() => void) | undefined;
    let unsubClockProfiles: (() => void) | undefined;
    let unsubClockJustifications: (() => void) | undefined;
    let unsubClockRecords: (() => void) | undefined;
    let isStorageReady = false;

    async function initStorage() {
      try {
        const [loadedGroups, loadedExclusions, loadedProfiles, loadedJustifications, loadedClockRecords] = await Promise.all([
          loadWorkgroups(),
          loadExclusions(),
          loadClockProfiles(),
          loadClockJustifications(),
          loadImportedClockRecordsFromFirestore()
        ]);
        setWorkgroups(loadedGroups);
        setExclusions(loadedExclusions);
        setClockProfiles(loadedProfiles);
        setClockJustifications(loadedJustifications);
        if (loadedClockRecords && loadedClockRecords.length > 0) {
          setImportedClockRecords(loadedClockRecords);
        }

        const savedFav = getFavoriteWorkgroupId();
        if (savedFav && loadedGroups.some(g => g.id === savedFav)) {
          setActiveWorkgroupId(savedFav);
        }
      } catch (err) {
        console.warn('Init timesheet storage warning:', err);
      } finally {
        isStorageReady = true;
      }

      // Realtime listener across all devices/browsers
      unsubExclusions = subscribeToExclusions((liveExclusions) => {
        setExclusions(liveExclusions);
      });
      unsubWorkgroups = subscribeToWorkgroups((liveWorkgroups) => {
        setWorkgroups(liveWorkgroups);
      });
      unsubClockProfiles = subscribeToClockProfiles((liveProfiles) => {
        setClockProfiles(liveProfiles);
      });
      unsubClockJustifications = subscribeToClockJustifications((liveJustifications) => {
        setClockJustifications(liveJustifications);
      });
      unsubClockRecords = subscribeToImportedClockRecords((liveRecords) => {
        if (isStorageReady) {
          setImportedClockRecords(liveRecords);
        } else if (liveRecords && liveRecords.length > 0) {
          setImportedClockRecords(liveRecords);
        }
      });
    }

    initStorage();

    return () => {
      if (unsubExclusions) unsubExclusions();
      if (unsubWorkgroups) unsubWorkgroups();
      if (unsubClockProfiles) unsubClockProfiles();
      if (unsubClockJustifications) unsubClockJustifications();
      if (unsubClockRecords) unsubClockRecords();
    };
  }, []);

  // Toggle Favorite / Pinned Workgroup
  const handleToggleFavoriteWorkgroup = (groupId: string | null) => {
    if (favoriteWorkgroupId === groupId) {
      setFavoriteWorkgroupId(null);
      setFavoriteWorkgroupIdState(null);
    } else {
      setFavoriteWorkgroupId(groupId);
      setFavoriteWorkgroupIdState(groupId);
    }
  };

  // Save Workgroups handler
  const handleSaveWorkgroups = async (updated: TimesheetWorkgroup[]) => {
    setWorkgroups(updated);
    if (activeWorkgroupId && !updated.some(g => g.id === activeWorkgroupId)) {
      setActiveWorkgroupId(null);
    }
    if (favoriteWorkgroupId && !updated.some(g => g.id === favoriteWorkgroupId)) {
      setFavoriteWorkgroupId(null);
      setFavoriteWorkgroupIdState(null);
    }
    await saveWorkgroups(updated);
  };

  // Save Single Exclusion handler (SaaS only)
  const handleSaveExclusion = async (exclusion: TimesheetExclusion) => {
    const updated = {
      ...exclusions,
      [exclusion.id]: exclusion
    };
    setExclusions(updated);
    await saveExclusions(updated);
  };

  // Save Bulk Exclusions handler
  const handleSaveBulkExclusions = async (exclusionsToAdd: TimesheetExclusion[]) => {
    const updated = { ...exclusions };
    for (const item of exclusionsToAdd) {
      updated[item.id] = item;
    }
    setExclusions(updated);
    await saveExclusions(updated);
  };

  // --------------------------------------------------------------------------
  // CLOCK AUDIT HANDLERS (POINTEUSE CSV vs ODOO)
  // --------------------------------------------------------------------------

  // Save Clock Employee Profiles (Batch)
  const handleSaveClockProfiles = async (updatedProfiles: ClockEmployeeProfile[]) => {
    const updatedMap = { ...clockProfiles };
    updatedProfiles.forEach(p => {
      updatedMap[p.employeeId] = p;
    });
    setClockProfiles(updatedMap);
    await saveBulkClockProfiles(updatedProfiles);
  };

  // Save Clock Discrepancy Justification
  const handleSaveClockJustification = async (justification: ClockJustification) => {
    const updated = {
      ...clockJustifications,
      [justification.id]: justification
    };
    setClockJustifications(updated);
    await saveClockJustification(justification);
  };

  // Remove Clock Discrepancy Justification
  const handleRemoveClockJustification = async (id: string) => {
    const updated = { ...clockJustifications };
    delete updated[id];
    setClockJustifications(updated);
    await deleteClockJustification(id);
  };

  // Import CSV/Excel Complete: merges new records with historical records without overwriting past days
  const handleClockImportComplete = async (newRecords: ClockImportedRecord[]) => {
    try {
      const merged = await saveNewImportedClockRecords(newRecords, importedClockRecords);
      setImportedClockRecords(merged);

      // Auto-adjust date range to display newly imported records if outside current filter
      let minD = '';
      let maxD = '';
      newRecords.forEach(r => {
        if (r.date) {
          if (!minD || r.date < minD) minD = r.date;
          if (!maxD || r.date > maxD) maxD = r.date;
        }
      });
      if (minD && maxD) {
        if (minD < startDate || maxD > endDate) {
          setStartDate(minD < startDate ? minD : startDate);
          setEndDate(maxD > endDate ? maxD : endDate);
          setPeriodPreset('custom');
        }
      }
    } catch (err) {
      console.error('Error saving imported clock records:', err);
    }
  };

  // Clear Imported Records from database
  const handleClearImportedRecords = async () => {
    if (window.confirm('Voulez-vous vraiment effacer tous les pointages de la pointeuse enregistrés dans la base de données ?')) {
      setImportedClockRecords([]);
      await clearImportedClockRecords();
    }
  };

  // Direct 1-Click Validate Day (Conformity override for CHECK / Missing)
  const handleDirectValidateDay = async (
    emp: TimesheetAuditEmployeeItem,
    dateStr: string,
    day: TimesheetDayEntry
  ) => {
    const key = `${emp.id}_${dateStr}`;
    const newExclusion: TimesheetExclusion = {
      id: key,
      employeeId: emp.id,
      employeeName: emp.name,
      date: dateStr,
      reason: 'valide',
      comment: `Pointage validé conforme (${day.hours || 0}h)`,
      createdAt: new Date().toISOString()
    };
    const updated = {
      ...exclusions,
      [key]: newExclusion
    };
    setExclusions(updated);
    await saveExclusions(updated);
  };

  // Remove Exclusion handler
  const handleRemoveExclusion = async (employeeId: number, date: string) => {
    const key = `${employeeId}_${date}`;
    const updated = { ...exclusions };
    delete updated[key];
    setExclusions(updated);
    await saveExclusions(updated);
  };

  // Remove Range Exclusions handler
  const handleRemoveRangeExclusions = async (rangeStart: string, rangeEnd: string, employeeId?: number) => {
    const updated: Record<string, TimesheetExclusion> = {};
    (Object.entries(exclusions) as [string, TimesheetExclusion][]).forEach(([key, item]) => {
      if (!item || !item.date) return;
      const inRange = item.date >= rangeStart && item.date <= rangeEnd;
      const matchEmp = employeeId ? item.employeeId === employeeId : true;
      if (inRange && matchEmp) {
        // Drop this item
      } else {
        updated[key] = item;
      }
    });
    setExclusions(updated);
    await saveExclusions(updated);
  };

  // Calculate date span present in imported clock records (if any)
  const importedDatesRange = useMemo(() => {
    if (!importedClockRecords || importedClockRecords.length === 0) return null;
    let minD = '';
    let maxD = '';
    importedClockRecords.forEach(r => {
      if (r.date) {
        if (!minD || r.date < minD) minD = r.date;
        if (!maxD || r.date > maxD) maxD = r.date;
      }
    });
    return minD && maxD ? { minD, maxD } : null;
  }, [importedClockRecords]);

  // Load Audit Data from Odoo
  // Load Audit Data from Odoo
  const loadAuditData = async (forceRefresh: boolean = false) => {
    setLoading(true);
    setError(null);

    // Enforce minimal start boundary
    let effectiveStart = startDate < BASE_MIN_DATE ? BASE_MIN_DATE : startDate;
    let effectiveEnd = endDate < BASE_MIN_DATE ? BASE_MIN_DATE : endDate;
    if (effectiveStart > effectiveEnd) {
      effectiveEnd = effectiveStart;
    }

    // Only when inspecting pointeuse CSV comparison, expand if needed
    if (activeTab === 'clock_audit' && importedDatesRange) {
      if (importedDatesRange.minD >= BASE_MIN_DATE && importedDatesRange.minD < effectiveStart) {
        effectiveStart = importedDatesRange.minD;
      }
      if (importedDatesRange.maxD >= BASE_MIN_DATE && importedDatesRange.maxD > effectiveEnd) {
        effectiveEnd = importedDatesRange.maxD;
      }
    }

    try {
      const res = await odooClient.getTimesheetsAuditReport({
        startDate: effectiveStart,
        endDate: effectiveEnd,
        thresholdHours,
        hideWeekends: false, // Toujours récupérer tous les jours depuis Odoo pour que les pointages de week-end soient disponibles
        forceRefresh,
        credentials: credentials || undefined,
        isDemo
      });

      if (res.success) {
        setReportData(res);
      } else {
        setError(res.error || 'Erreur lors du calcul du suivi des pointages.');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur de communication avec le serveur.');
    } finally {
      setLoading(false);
    }
  };

  // Reload when date filters change or when imported clock records change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadAuditData(true);
    } else {
      loadAuditData(false);
    }
  }, [startDate, endDate, thresholdHours, hideWeekends, isDemo, importedClockRecords.length, activeTab, credentials?.url, credentials?.db]);

  // Handle Preset Change
  const handlePresetChange = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset !== 'custom') {
      const dates = calculatePresetDates(preset);
      if (startDate === dates.start && endDate === dates.end) {
        loadAuditData(true);
      } else {
        setStartDate(dates.start);
        setEndDate(dates.end);
      }
    }
  };

  // Active workgroup object
  const activeWorkgroup = useMemo(() => {
    if (!activeWorkgroupId) return null;
    return workgroups.find(g => g.id === activeWorkgroupId) || null;
  }, [workgroups, activeWorkgroupId]);

  // All distinct available employees from report data for group management
  const availableEmployeesList = useMemo(() => {
    if (!reportData?.records) return [];
    return reportData.records.map(r => ({
      id: r.id,
      name: r.name,
      departmentName: r.departmentName,
      jobTitle: r.jobTitle
    }));
  }, [reportData?.records]);

  // Processed Records: Filter by Workgroup + Name Search + Apply Exclusions dynamically
  const processedRecords: TimesheetAuditEmployeeItem[] = useMemo(() => {
    if (!reportData?.records) return [];

    let list = reportData.records;

    // 1. Filter by Workgroup if selected
    if (activeWorkgroup) {
      const memberIds = new Set(activeWorkgroup.employeeIds);
      list = list.filter(emp => memberIds.has(emp.id));
    }

    // 2. Filter by Name search
    if (nameSearchQuery.trim()) {
      const query = nameSearchQuery.toLowerCase().trim();
      list = list.filter(emp => emp.name.toLowerCase().includes(query));
    }

    // 3. Recalculate each employee's days and compliance status taking into account exclusions
    return list.map(emp => {
      const updatedDays: Record<string, TimesheetDayEntry> = {};
      let missingDaysCount = 0;
      let incompleteDaysCount = 0;
      let okDaysCount = 0;
      let businessDaysCount = 0;
      let excludedDaysCount = 0;
      const missingDates: string[] = [];
      const incompleteDates: string[] = [];
      const excludedDates: string[] = [];

      const rawDays = emp.days || {};
      const dateKeys = Object.keys(rawDays).sort();

      const todayStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());

      for (const d of dateKeys) {
        if (d < startDate || d > endDate) continue;
        const day = rawDays[d];
        if (!day) continue;
        const isToday = d === todayStr;
        const isFuture = d > todayStr;
        const exclusionKey = `${emp.id}_${d}`;
        const exclusion = exclusions[exclusionKey];
        const isValidated = Boolean(
          exclusion && (
            exclusion.reason === 'valide' ||
            (exclusion.reason === 'autre' && (day.hours > 0 || exclusion.comment?.toLowerCase().includes('valid')))
          )
        );
        const isExcluded = Boolean(exclusion && !isValidated);
        const isWeekend = day.isWeekend;
        const isBizDay = !isWeekend;

        let status: TimesheetDayStatusType = day.status;

        if (isValidated) {
          // Un pointage validé passe en vert (OK / conforme) et n'est pas considéré comme exclu
          status = 'ok';
          okDaysCount++;
          if (isBizDay) businessDaysCount++;
        } else if (isExcluded) {
          status = 'excluded';
          excludedDaysCount++;
          excludedDates.push(d);
        } else if (isFuture) {
          status = 'future';
        } else if (isWeekend) {
          // Weekend : 0h est tout à fait normal (repos hebdomadaire).
          // Des heures pointées le weekend sont un supplément facultatif (heures sup) sans condition de conformité.
          if (day.hours > 0) {
            status = 'ok';
          } else {
            status = 'weekend';
          }
        } else if (isToday) {
          // Jour ouvré actuel : les collaborateurs pointent en fin de journée.
          // Ne doit pas être comptabilisé comme manquant ou incomplet dans les journées non conformes.
          if (day.hours >= thresholdHours) {
            status = 'ok';
            okDaysCount++;
            businessDaysCount++;
          } else {
            status = 'today';
            // Pas de pénalité de conformité pour le jour en cours
          }
        } else {
          // Jours ouvrés passés (lundi au vendredi)
          if (day.status === 'missing' || day.hours === 0) {
            status = 'missing';
            missingDaysCount++;
            missingDates.push(d);
            businessDaysCount++;
          } else if (day.status === 'incomplete' || day.hours < thresholdHours) {
            status = 'incomplete';
            incompleteDaysCount++;
            incompleteDates.push(d);
            businessDaysCount++;
          } else {
            status = 'ok';
            okDaysCount++;
            businessDaysCount++;
          }
        }

        updatedDays[d] = {
          ...day,
          status,
          isExcluded,
          isValidated,
          exclusionReason: exclusion?.reason,
          exclusionComment: exclusion?.comment
        };
      }

      // Strict text status:
      // "OK" (Vert) : Tous les jours ouvrés sont >= 7h
      // "NOK" (Rouge) : Au moins un jour ouvré est à 0h (missing)
      // "CHECK" (Orange) : Aucun jour à 0h, mais au moins un jour ouvré à < 7h (incomplete)
      const complianceStatus: TimesheetComplianceStatus = missingDaysCount > 0
        ? 'NOK'
        : incompleteDaysCount > 0
        ? 'CHECK'
        : 'OK';

      const complianceRate = businessDaysCount > 0
        ? Math.min(100, Math.round((okDaysCount / businessDaysCount) * 100))
        : 100;

      const expectedHours = Math.round(businessDaysCount * thresholdHours * 100) / 100;

      return {
        ...emp,
        days: updatedDays,
        businessDaysCount,
        expectedHours,
        missingDaysCount,
        incompleteDaysCount,
        okDaysCount,
        excludedDaysCount,
        missingDates,
        incompleteDates,
        excludedDates,
        complianceStatus,
        complianceRate
      };
    });
  }, [reportData?.records, activeWorkgroup, nameSearchQuery, exclusions, hideWeekends, thresholdHours, startDate, endDate]);

  // Handle Export to Excel
  const handleExportExcel = async () => {
    if (!processedRecords.length) return;
    setIsExporting(true);
    try {
      await exportTimesheetAuditToExcel({
        records: processedRecords,
        summary: reportData?.summary,
        startDate,
        endDate,
        thresholdHours
      });
    } catch (err) {
      console.error('Error exporting timesheets to Excel:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Open Day Detail Modal
  const handleOpenDayDetail = (emp: TimesheetAuditEmployeeItem, day?: TimesheetDayEntry) => {
    // Find the latest updated employee item with exclusions applied
    const updatedEmp = processedRecords.find(e => e.id === emp.id) || emp;
    setSelectedEmployee(updatedEmp);
    setSelectedDay(day || null);
    setIsDetailModalOpen(true);
  };

  // Open Quick Exclusion Modal
  const handleOpenQuickExclusion = (emp: TimesheetAuditEmployeeItem, dateStr: string, day: TimesheetDayEntry) => {
    setTargetExclusionEmp({ id: emp.id, name: emp.name });
    setTargetExclusionDate(dateStr);
    setTargetExclusionFormattedDate(day.formattedDate || dateStr);
    setTargetExclusionHours(day.hours || 0);
    setIsExclusionModalOpen(true);
  };

  const summary = reportData?.summary;

  const matrixDateList = useMemo(() => {
    if (!summary?.dateList) return [];
    return summary.dateList.filter(d => {
      if (d.date < startDate || d.date > endDate) return false;
      if (hideWeekends && d.isWeekend) return false;
      return true;
    });
  }, [summary?.dateList, startDate, endDate, hideWeekends]);

  return (
    <div className="space-y-6">
      
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-2xl bg-violet-500/10 text-violet-500 shadow-2xs">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Contrôle des Pointages
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/10 text-violet-600 dark:text-violet-400 font-mono">
                  Audit RH
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Suivi des pointages par groupe de travail, contrôle de conformité et gestion des absences justifiées
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {/* Quick Action: Bulk Absence / Leave Declaration */}
          <button
            onClick={() => setIsBulkAbsenceModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-600 text-white transition-colors shadow-2xs cursor-pointer"
            title="Déclarer une plage de congés ou d'absence pour un collaborateur"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Déclarer une Absence / Congé</span>
          </button>

          {/* Manage / Clean Exclusions button */}
          <button
            onClick={() => setIsManageExclusionsModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors shadow-xs cursor-pointer"
            title="Consulter, filtrer ou nettoyer les justifications et congés enregistrés"
          >
            <CalendarOff className="w-3.5 h-3.5 text-slate-500" />
            <span>Gérer justifications ({Object.keys(exclusions).length})</span>
          </button>

          <button
            onClick={() => loadAuditData(true)}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors shadow-xs cursor-pointer disabled:opacity-60"
            title="Forcer le rafraîchissement depuis Odoo"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-slate-600' : 'text-slate-400'}`} />
            <span>Actualiser</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={loading || isExporting || !processedRecords.length}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer disabled:opacity-60"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isExporting ? 'Génération...' : 'Exporter Excel Pro'}</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs - Clean Segmented Control */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-850 rounded-xl border border-slate-200/60 dark:border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('matrix')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'matrix'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Matrice & Conformité Odoo</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('clock_audit')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'clock_audit'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Audit Pointeuse (CSV)</span>
          {importedClockRecords.length > 0 ? (
            <span className={`px-2 py-0.2 rounded text-[10px] font-mono tabular-nums ${
              activeTab === 'clock_audit'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}>
              {importedClockRecords.length}
            </span>
          ) : (
            <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Nouveau
            </span>
          )}
        </button>
      </div>

      {/* Tab 2: Audit Pointeuse (CSV) 100% isolé */}
      {activeTab === 'clock_audit' ? (
        <ClockAuditView
          employees={reportData?.records || []}
          startDate={startDate}
          endDate={endDate}
          periodPreset={periodPreset}
          thresholdHours={thresholdHours}
          hideWeekends={hideWeekends}
          onPeriodChange={handlePresetChange}
          onCustomDatesChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
            setPeriodPreset('custom');
          }}
          onToggleHideWeekends={setHideWeekends}
          onRefreshOdoo={() => loadAuditData(true)}
          loading={loading}
          workgroups={workgroups}
          activeWorkgroupId={activeWorkgroupId}
          onWorkgroupChange={setActiveWorkgroupId}
          importedDatesRange={importedDatesRange}
          profiles={clockProfiles}
          justifications={clockJustifications}
          importedRecords={importedClockRecords}
          onSaveProfiles={handleSaveClockProfiles}
          onSaveJustification={handleSaveClockJustification}
          onRemoveJustification={handleRemoveClockJustification}
          onImportComplete={handleClockImportComplete}
          onClearImportedRecords={handleClearImportedRecords}
        />
      ) : (
        <>
          {/* Filter Toolbar Card */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        
        {/* Row 1: Workgroup Selector & Period Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          
          {/* Workgroup Selector & Favorite Pin */}
          <div className="space-y-1.5 min-w-[280px]">
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span>Groupe de Travail</span>
                {activeWorkgroupId && favoriteWorkgroupId === activeWorkgroupId && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80">
                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                    Favori par défaut
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsWorkgroupModalOpen(true)}
                className="text-[11px] text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-medium cursor-pointer flex items-center gap-1 normal-case transition-colors"
              >
                <Settings className="w-3 h-3 text-slate-400" />
                <span>Gérer les groupes</span>
              </button>
            </label>
            
            <div className="flex items-center space-x-1.5">
              <div className="relative flex-1">
                <select
                  value={activeWorkgroupId || ''}
                  onChange={(e) => setActiveWorkgroupId(e.target.value || null)}
                  className="w-full pl-3 pr-8 py-2 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 cursor-pointer appearance-none transition-colors"
                >
                  <option value="">
                    {favoriteWorkgroupId === null ? '★ ' : ''}Tous les collaborateurs ({reportData?.records.length || 0})
                  </option>
                  {workgroups.map(group => (
                    <option key={group.id} value={group.id}>
                      {favoriteWorkgroupId === group.id ? '★ ' : ''}{group.name} ({group.employeeIds.length} coll.)
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 pointer-events-none" />
              </div>

              {/* Bouton Figer le groupe en favori par défaut */}
              <button
                onClick={() => handleToggleFavoriteWorkgroup(activeWorkgroupId)}
                className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                  activeWorkgroupId && favoriteWorkgroupId === activeWorkgroupId
                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-amber-500 border-slate-200 dark:border-slate-700'
                }`}
                title={
                  activeWorkgroupId && favoriteWorkgroupId === activeWorkgroupId
                    ? 'Filtre favori actif (cliquer pour retirer la vue par défaut)'
                    : activeWorkgroupId
                    ? 'Figer ce groupe comme favori par défaut au démarrage'
                    : 'Figer la vue complète (Tous les collaborateurs) par défaut'
                }
              >
                <Star className={`w-4 h-4 ${activeWorkgroupId && favoriteWorkgroupId === activeWorkgroupId ? 'fill-amber-400 text-amber-500' : ''}`} />
              </button>

              <button
                onClick={() => setIsWorkgroupModalOpen(true)}
                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer shrink-0 transition-colors"
                title="Créer un nouveau groupe de travail"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Period Presets */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Période d'analyse
            </label>
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
              <button
                type="button"
                onClick={() => handlePresetChange('last7days')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  periodPreset === 'last7days'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                7 derniers jours
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange('currentMonth')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  periodPreset === 'currentMonth'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Ce mois-ci
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange('lastMonth')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  periodPreset === 'lastMonth'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Mois dernier
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange('custom')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  periodPreset === 'custom'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Personnalisé
              </button>
            </div>
          </div>

          {/* Custom Date Pickers */}
          <div className="flex items-center space-x-2">
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
                  if (val) {
                    setStartDate(val);
                    setPeriodPreset('custom');
                  }
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono"
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
                  if (val) {
                    setEndDate(val);
                    setPeriodPreset('custom');
                  }
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono"
              />
            </div>
          </div>

          {/* Daily Threshold */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Seuil (h/jour)
            </label>
            <div className="flex items-center space-x-1.5">
              <input
                type="number"
                min="1"
                max="12"
                step="0.5"
                value={thresholdHours}
                onChange={(e) => setThresholdHours(Math.max(1, Number(e.target.value) || 7))}
                className="w-18 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono"
              />
              <span className="text-xs text-slate-500">h</span>
            </div>
          </div>

          {/* Weekends toggle */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Weekends
            </label>
            <label className="flex items-center space-x-2 text-xs font-normal text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={hideWeekends}
                onChange={(e) => setHideWeekends(e.target.checked)}
                className="w-4 h-4 rounded text-slate-900 border-slate-300 focus:ring-slate-400 cursor-pointer"
              />
              <span>Masquer Sam/Dim</span>
            </label>
          </div>

        </div>

      </div>

      {/* Name Search Bar right above the Matrix */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            placeholder="Filtrer par nom de collaborateur..."
            value={nameSearchQuery}
            onChange={(e) => setNameSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 shadow-2xs"
          />
          {nameSearchQuery && (
            <button
              onClick={() => setNameSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          Affichage de <span className="font-semibold text-slate-900 dark:text-white">{processedRecords.length}</span> collaborateur(s)
          {activeWorkgroup && ` dans « ${activeWorkgroup.name} »`}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 flex items-start space-x-3">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-semibold">Erreur de chargement des pointages Odoo</h4>
            <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !reportData ? (
        <div className="p-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center space-y-3">
          <RefreshCw className="w-6 h-6 text-slate-500 animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Analyse des feuilles de temps Odoo en cours...
          </p>
          <p className="text-xs text-slate-400">
            Chargement de la matrice journalière pour la période sélectionnée.
          </p>
        </div>
      ) : (
        <>
          {/* 1. Tableau Matrice Journalière */}
          <TimesheetMatrixTable
            records={processedRecords}
            dateList={matrixDateList}
            thresholdHours={thresholdHours}
            onSelectEmployeeDay={handleOpenDayDetail}
            onQuickExclusion={handleOpenQuickExclusion}
          />

          {/* 2. Deuxième Tableau : Détail des Journées Non Conformes par Collaborateur */}
          <TimesheetNonCompliantTable
            employees={processedRecords}
            thresholdHours={thresholdHours}
            onOpenDetailModal={handleOpenDayDetail}
            onQuickExclusion={handleOpenQuickExclusion}
            onDirectValidateDay={handleDirectValidateDay}
            exclusions={exclusions}
          />
        </>
      )}
      </>
      )}

      {/* Day / Employee Detail Modal */}
      <TimesheetDayDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        employee={selectedEmployee}
        selectedDay={selectedDay}
        thresholdHours={thresholdHours}
        onOpenExclusionModal={(emp, date, day) => {
          setIsDetailModalOpen(false);
          handleOpenQuickExclusion(emp, date, day);
        }}
        onDirectValidateDay={handleDirectValidateDay}
        exclusions={exclusions}
      />

      {/* Workgroups Management Modal */}
      <TimesheetWorkgroupModal
        isOpen={isWorkgroupModalOpen}
        onClose={() => setIsWorkgroupModalOpen(false)}
        workgroups={workgroups}
        onSaveWorkgroups={handleSaveWorkgroups}
        availableEmployees={availableEmployeesList}
        activeWorkgroupId={activeWorkgroupId}
        onSelectWorkgroup={(id) => setActiveWorkgroupId(id)}
        favoriteWorkgroupId={favoriteWorkgroupId}
        onSetFavoriteWorkgroup={handleToggleFavoriteWorkgroup}
      />

      {/* Day Exclusion Modal (Congés / Maladie / Férié) */}
      <TimesheetExclusionModal
        isOpen={isExclusionModalOpen}
        onClose={() => setIsExclusionModalOpen(false)}
        employeeId={targetExclusionEmp?.id || null}
        employeeName={targetExclusionEmp?.name || ''}
        date={targetExclusionDate}
        formattedDate={targetExclusionFormattedDate}
        currentHours={targetExclusionHours}
        existingExclusion={targetExclusionEmp ? exclusions[`${targetExclusionEmp.id}_${targetExclusionDate}`] : null}
        onSaveExclusion={handleSaveExclusion}
        onRemoveExclusion={handleRemoveExclusion}
      />

      {/* Bulk Absence / Leave Modal */}
      <TimesheetBulkAbsenceModal
        isOpen={isBulkAbsenceModalOpen}
        onClose={() => setIsBulkAbsenceModalOpen(false)}
        availableEmployees={availableEmployeesList}
        workgroups={workgroups}
        activeWorkgroupId={activeWorkgroupId}
        currentStartDate={startDate}
        currentEndDate={endDate}
        onSaveBulkExclusions={handleSaveBulkExclusions}
      />

      {/* Manage & Clean Exclusions Modal */}
      <TimesheetManageExclusionsModal
        isOpen={isManageExclusionsModalOpen}
        onClose={() => setIsManageExclusionsModalOpen(false)}
        exclusions={exclusions}
        onRemoveExclusion={handleRemoveExclusion}
        onRemoveRangeExclusions={handleRemoveRangeExclusions}
      />

    </div>
  );
};
