import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  X, 
  Calendar, 
  CalendarOff, 
  Check, 
  Users, 
  User, 
  Palmtree, 
  HeartPulse, 
  Sparkles, 
  HelpCircle, 
  Search, 
  CheckSquare, 
  Square, 
  ShieldCheck, 
  ArrowRight, 
  ArrowLeft, 
  Trash2, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  UserCheck
} from 'lucide-react';
import { 
  TimesheetExclusion, 
  TimesheetExclusionReason, 
  TimesheetWorkgroup 
} from '../../types/odoo';

export interface BulkAbsenceEmployeeItem {
  id: number;
  name: string;
  departmentName?: string;
  jobTitle?: string;
}

interface TimesheetBulkAbsenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableEmployees?: BulkAbsenceEmployeeItem[];
  employees?: BulkAbsenceEmployeeItem[];
  workgroups?: TimesheetWorkgroup[];
  activeWorkgroupId?: string | null;
  currentStartDate?: string;
  currentEndDate?: string;
  onSaveBulkExclusions: (exclusionsToAdd: TimesheetExclusion[]) => void;
}

const BASE_MIN_DATE = '2020-01-01';

const FRENCH_DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const FRENCH_MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function formatFrenchDateShort(isoDate: string): string {
  const d = new Date(isoDate);
  const dayName = FRENCH_DAYS_SHORT[d.getDay()];
  const dayNum = String(d.getDate()).padStart(2, '0');
  const monthName = FRENCH_MONTHS_SHORT[d.getMonth()];
  return `${dayName} ${dayNum} ${monthName}`;
}

export const TimesheetBulkAbsenceModal: React.FC<TimesheetBulkAbsenceModalProps> = ({
  isOpen,
  onClose,
  availableEmployees = [],
  employees = [],
  workgroups = [],
  currentStartDate = '',
  currentEndDate = '',
  onSaveBulkExclusions
}) => {
  // Extract all valid distinct employees present in real Odoo list
  const allEmployees = useMemo(() => {
    const raw = availableEmployees && availableEmployees.length > 0 ? availableEmployees : employees;
    if (!raw || raw.length === 0) return [];
    
    // Filter out duplicates and any invalid/placeholder names
    const seen = new Set<number>();
    const valid: BulkAbsenceEmployeeItem[] = [];
    for (const emp of raw) {
      if (emp && typeof emp.id === 'number' && emp.name && !seen.has(emp.id)) {
        seen.add(emp.id);
        valid.push(emp);
      }
    }
    return valid;
  }, [availableEmployees, employees]);

  // Wizard Step: 1 = Configuration, 2 = Résumé par personne & Validation
  const [step, setStep] = useState<1 | 2>(1);

  const [selectedReason, setSelectedReason] = useState<TimesheetExclusionReason>('conge');
  const [startDate, setStartDate] = useState<string>(
    currentStartDate && currentStartDate >= BASE_MIN_DATE ? currentStartDate : new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState<string>(
    currentEndDate && currentEndDate >= BASE_MIN_DATE ? currentEndDate : new Date().toISOString().slice(0, 10)
  );
  const [excludeBusinessDaysOnly, setExcludeBusinessDaysOnly] = useState<boolean>(true);
  const [comment, setComment] = useState<string>('');
  
  // Dropdown & Search state for operator selection
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [employeeSearch, setEmployeeSearch] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Selected employee IDs set - STRICTLY EMPTY BY DEFAULT AS REQUESTED
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);

  // Reset modal state upon opening: No operator is checked by default!
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedEmployeeIds([]); // Aucune case cochée par défaut
      setIsDropdownOpen(false);
      setEmployeeSearch('');
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Filtered employees list for search inside dropdown
  const filteredEmployees = useMemo(() => {
    if (!allEmployees || allEmployees.length === 0) return [];
    if (!employeeSearch.trim()) return allEmployees;
    const q = employeeSearch.toLowerCase().trim();
    return allEmployees.filter(e => 
      e.name.toLowerCase().includes(q) || 
      (e.jobTitle && e.jobTitle.toLowerCase().includes(q)) ||
      (e.departmentName && e.departmentName.toLowerCase().includes(q))
    );
  }, [allEmployees, employeeSearch]);

  // Compute total dates that will be excluded
  const generatedDates = useMemo(() => {
    if (!startDate || !endDate) return [];
    const dStart = new Date(startDate);
    const dEnd = new Date(endDate);
    if (dStart > dEnd) return [];

    const dates: string[] = [];
    const current = new Date(dStart);

    while (current <= dEnd) {
      const dayOfWeek = current.getDay(); // 0 = Dimanche, 6 = Samedi
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (!excludeBusinessDaysOnly || !isWeekend) {
        const iso = current.toISOString().slice(0, 10);
        if (iso >= BASE_MIN_DATE) {
          dates.push(iso);
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [startDate, endDate, excludeBusinessDaysOnly]);

  const totalExclusionsCount = selectedEmployeeIds.length * generatedDates.length;

  // Toggle single employee selection
  const toggleEmployee = (empId: number) => {
    setSelectedEmployeeIds(prev => 
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  // Remove single employee
  const handleRemoveEmployee = (empId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedEmployeeIds(prev => prev.filter(id => id !== empId));
  };

  // Select / Deselect all filtered employees
  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredEmployees.map(e => e.id);
    const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedEmployeeIds.includes(id));
    if (isAllSelected) {
      setSelectedEmployeeIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedEmployeeIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  // Clear all selections
  const handleClearAll = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedEmployeeIds([]);
  };

  // Quick select by workgroup (only adding existing valid employees)
  const handleSelectWorkgroup = (wg: TimesheetWorkgroup) => {
    const validWgIds = wg.employeeIds.filter(id => allEmployees.some(e => e.id === id));
    setSelectedEmployeeIds(prev => Array.from(new Set([...prev, ...validWgIds])));
  };

  const handleSave = () => {
    if (selectedEmployeeIds.length === 0 || generatedDates.length === 0) return;

    const newExclusions: TimesheetExclusion[] = [];
    const now = new Date().toISOString();

    for (const empId of selectedEmployeeIds) {
      const emp = allEmployees.find(e => e.id === empId);
      if (!emp) continue; // Skip phantom IDs
      const empName = emp.name;

      for (const d of generatedDates) {
        newExclusions.push({
          id: `${empId}_${d}`,
          employeeId: empId,
          employeeName: empName,
          date: d,
          reason: selectedReason,
          comment: comment.trim() || undefined,
          createdAt: now
        });
      }
    }

    onSaveBulkExclusions(newExclusions);
    onClose();
  };

  const REASONS_LIST: {
    id: TimesheetExclusionReason;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    colorClass: string;
    badgeClass: string;
  }[] = [
    {
      id: 'conge',
      label: 'Congé / RTT',
      description: 'Congés payés, RTT, congés sans solde, pont',
      icon: Palmtree,
      colorClass: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50',
      badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
    },
    {
      id: 'maladie',
      label: 'Maladie / Arrêt',
      description: 'Arrêt de travail, maladie, accident du travail',
      icon: HeartPulse,
      colorClass: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50',
      badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300 border-rose-200 dark:border-rose-800'
    },
    {
      id: 'ferie',
      label: 'Jour Férié',
      description: 'Férié légal, fermeture annuelle ou chômé',
      icon: Sparkles,
      colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
    },
    {
      id: 'autre',
      label: 'Autre / Validation',
      description: 'Formation, déplacement, tolérance ou validation',
      icon: HelpCircle,
      colorClass: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
    }
  ];

  const selectedReasonObj = REASONS_LIST.find(r => r.id === selectedReason) || REASONS_LIST[0];
  const SelectedReasonIcon = selectedReasonObj.icon;

  // Selected employees list objects
  const selectedEmployees = useMemo(() => {
    return selectedEmployeeIds
      .map(id => allEmployees.find(e => e.id === id))
      .filter((e): e is BulkAbsenceEmployeeItem => e !== undefined);
  }, [selectedEmployeeIds, allEmployees]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200/80 dark:border-slate-800 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <CalendarOff className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Déclarer une Absence / Congé par Plage de Dates
                </h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border ${
                  step === 1 
                    ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                }`}>
                  Étape {step} / 2 : {step === 1 ? 'Saisie' : 'Validation par personne'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                {step === 1 
                  ? 'Choisissez les opérateurs dans la liste déroulante et définissez la période d\'absence' 
                  : 'Vérifiez le résumé par personne avant de valider définitivement'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {step === 1 ? (
            /* ================= STEP 1: CONFIGURATION ================= */
            <>
              {/* 1. Collaborators Selection: Compact Multi-Select Dropdown */}
              <div className="space-y-2" ref={dropdownRef}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>Opérateur(s) concerné(s) *</span>
                    <span className={`font-medium text-xs ${selectedEmployeeIds.length > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                      ({selectedEmployeeIds.length} sélectionné{selectedEmployeeIds.length > 1 ? 's' : ''})
                    </span>
                  </label>

                  {selectedEmployeeIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-xs font-normal text-rose-500 hover:text-rose-700 hover:underline cursor-pointer"
                    >
                      Désélectionner tout
                    </button>
                  )}
                </div>

                {/* Dropdown Selector Trigger */}
                <div className="relative">
                  <div
                    onClick={() => setIsDropdownOpen(prev => !prev)}
                    className={`w-full min-h-[42px] px-3.5 py-2 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-2 bg-white dark:bg-slate-900 ${
                      isDropdownOpen 
                        ? 'border-slate-900 dark:border-slate-300 ring-1 ring-slate-900/10 shadow-xs' 
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      {selectedEmployeeIds.length === 0 ? (
                        <div className="flex items-center text-slate-400 text-xs gap-2">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>Cliquez pour choisir les opérateurs dans la liste...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {selectedEmployeeIds.length} opérateur{selectedEmployeeIds.length > 1 ? 's' : ''}
                          </span>
                          {selectedEmployees.slice(0, 3).map(emp => (
                            <span 
                              key={emp.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-normal bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700"
                            >
                              {emp.name}
                              <button
                                type="button"
                                onClick={(e) => handleRemoveEmployee(emp.id, e)}
                                className="text-slate-400 hover:text-rose-500 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                          {selectedEmployees.length > 3 && (
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-1">
                              +{selectedEmployees.length - 3} autre{selectedEmployees.length - 3 > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-slate-400 shrink-0">
                      {isDropdownOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  {/* Dropdown Floating Menu Overlay */}
                  {isDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                      
                      {/* Search Bar inside dropdown */}
                      <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                          <input
                            type="text"
                            autoFocus
                            placeholder="Rechercher un opérateur par nom, métier ou département..."
                            value={employeeSearch}
                            onChange={(e) => setEmployeeSearch(e.target.value)}
                            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                          />
                          {employeeSearch && (
                            <button
                              type="button"
                              onClick={() => setEmployeeSearch('')}
                              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quick Action Toolbar & Groups */}
                      <div className="px-3 py-2 bg-slate-50/70 dark:bg-slate-850/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSelectAllFiltered}
                            className="text-xs font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer flex items-center gap-1"
                          >
                            <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                            <span>
                              {filteredEmployees.length > 0 && filteredEmployees.every(e => selectedEmployeeIds.includes(e.id))
                                ? 'Tout désélectionner' 
                                : `Tout cocher (${filteredEmployees.length})`}
                            </span>
                          </button>
                        </div>

                        {/* Quick Workgroup Selection Chips */}
                        {workgroups && workgroups.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[10px] font-medium text-slate-400">Groupes:</span>
                            {workgroups.map(wg => (
                              <button
                                key={wg.id}
                                type="button"
                                onClick={() => handleSelectWorkgroup(wg)}
                                className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                              >
                                + {wg.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Operators Checkboxes List */}
                      <div className="max-h-56 overflow-y-auto p-1.5 divide-y divide-slate-100 dark:divide-slate-800/80">
                        {filteredEmployees.length === 0 ? (
                          <div className="py-6 text-center text-xs text-slate-400">
                            Aucun opérateur trouvé dans la liste Odoo
                          </div>
                        ) : (
                          filteredEmployees.map(emp => {
                            const isSelected = selectedEmployeeIds.includes(emp.id);
                            return (
                              <div
                                key={emp.id}
                                onClick={() => toggleEmployee(emp.id)}
                                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                                  isSelected 
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium' 
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <div className="flex items-center space-x-2.5">
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-slate-900 dark:text-white shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                  )}
                                  <div>
                                    <span className="text-xs font-medium block">{emp.name}</span>
                                    <span className="text-[10px] text-slate-400 block font-normal">{emp.jobTitle || 'Collaborateur'}</span>
                                  </div>
                                </div>
                                {emp.departmentName && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-normal">
                                    {emp.departmentName}
                                  </span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Dropdown Footer */}
                      <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-normal text-[11px]">
                          {selectedEmployeeIds.length} opérateur(s) sélectionné(s)
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen(false)}
                          className="px-3 py-1 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 cursor-pointer"
                        >
                          Fermer la liste
                        </button>
                      </div>

                    </div>
                  )}
                </div>
              </div>

              {/* 2. Motif Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                  Motif de l'absence *
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {REASONS_LIST.map(r => {
                    const Icon = r.icon;
                    const isSelected = selectedReason === r.id;
                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedReason(r.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors flex flex-col items-center text-center space-y-1.5 ${
                          isSelected
                            ? 'border-slate-900 dark:border-slate-300 bg-slate-50/80 dark:bg-slate-800/80 shadow-xs'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${r.colorClass}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {r.label}
                        </span>
                        <span className="text-[10px] text-slate-400 line-clamp-1 font-normal">
                          {r.description}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Date Range & Weekends Option */}
              <div className="p-4 rounded-lg bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>Date de début *</span>
                    </label>
                    <input
                      type="date"
                      min={BASE_MIN_DATE}
                      value={startDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          setStartDate(val);
                          if (val > endDate) setEndDate(val);
                        }
                      }}
                      className="w-full px-3 py-2 text-xs font-normal rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>Date de fin *</span>
                    </label>
                    <input
                      type="date"
                      min={startDate >= BASE_MIN_DATE ? startDate : BASE_MIN_DATE}
                      value={endDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) setEndDate(val);
                      }}
                      className="w-full px-3 py-2 text-xs font-normal rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono"
                    />
                  </div>
                </div>

                {/* Business days only toggle */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
                  <label className="flex items-center space-x-2 text-xs font-normal text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={excludeBusinessDaysOnly}
                      onChange={(e) => setExcludeBusinessDaysOnly(e.target.checked)}
                      className="w-4 h-4 rounded text-slate-900 border-slate-300 focus:ring-slate-400 cursor-pointer"
                    />
                    <span>Exclure uniquement les jours ouvrés (du lundi au vendredi)</span>
                  </label>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 font-mono">
                    {generatedDates.length} jour(s) par opérateur
                  </span>
                </div>
              </div>

              {/* 4. Optional Comment */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Commentaire ou référence RH (facultatif)
                </label>
                <input
                  type="text"
                  placeholder="ex: Congés d'été validés / Arrêt maladie N°4490"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              {/* Summary Pre-check Box */}
              <div className="p-3.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>
                    Prévision : <strong>{selectedEmployeeIds.length}</strong> opérateur(s) × <strong>{generatedDates.length}</strong> jour(s) = <strong>{totalExclusionsCount}</strong> absence(s).
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* ================= STEP 2: PERSON-BY-PERSON REVIEW & VALIDATION ================= */
            <div className="space-y-4">
              
              {/* Alert notice */}
              <div className="p-3.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 flex items-start space-x-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold block">
                    Vérification avant enregistrement définitif
                  </span>
                  <p className="text-xs text-amber-800/90 dark:text-amber-300 font-normal">
                    Veuillez contrôler ci-dessous le détail pour chaque collaborateur concerné. Vous pouvez retirer un collaborateur ou revenir en arrière pour modifier les dates.
                  </p>
                </div>
              </div>

              {/* Global Key Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                  <span className="text-[11px] text-slate-400 block font-normal">Motif</span>
                  <div className="flex items-center space-x-1.5 mt-1">
                    <SelectedReasonIcon className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{selectedReasonObj.label}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                  <span className="text-[11px] text-slate-400 block font-normal">Période</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 mt-1 block font-mono">
                    {startDate} → {endDate}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                  <span className="text-[11px] text-slate-400 block font-normal">Par personne</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 block font-mono">
                    {generatedDates.length} jour(s) ouvré(s)
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                  <span className="text-[11px] text-slate-400 block font-normal">Total général</span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-white mt-1 block font-mono">
                    {totalExclusionsCount} absence(s)
                  </span>
                </div>
              </div>

              {/* List of dates preview */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Dates concernées ({generatedDates.length} jours) :
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200/80 dark:border-slate-700">
                  {generatedDates.map(d => (
                    <span
                      key={d}
                      className="px-2 py-0.5 rounded text-[11px] font-normal bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-mono"
                    >
                      {formatFrenchDateShort(d)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Breakdown Person by Person */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-slate-500" />
                    <span>Détail par collaborateur ({selectedEmployeeIds.length})</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Cliquez sur l'icône poubelle pour retirer une personne
                  </span>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {selectedEmployeeIds.length === 0 ? (
                    <div className="p-6 text-center text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800">
                      Aucun collaborateur sélectionné. Veuillez revenir en arrière pour en ajouter.
                    </div>
                  ) : (
                    selectedEmployeeIds.map(empId => {
                      const emp = allEmployees.find(e => e.id === empId);
                      const name = emp?.name || `Collaborateur #${empId}`;
                      return (
                        <div
                          key={empId}
                          className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-medium text-xs border border-slate-200 dark:border-slate-700">
                              {name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                                  {name}
                                </span>
                                {emp?.departmentName && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                                    {emp.departmentName}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 block font-normal">
                                {emp?.jobTitle || 'Collaborateur'} • <strong className="text-slate-700 dark:text-slate-200 font-medium">{generatedDates.length} jour(s)</strong> de {selectedReasonObj.label}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-medium border ${selectedReasonObj.badgeClass}`}>
                              {selectedReasonObj.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveEmployee(empId)}
                              title="Retirer cette personne de cet encodage"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {comment && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-0.5">Commentaire RH joint :</span>
                  <span className="text-slate-600 dark:text-slate-400 italic">« {comment} »</span>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={selectedEmployeeIds.length === 0 || generatedDates.length === 0}
                className="flex items-center space-x-2 px-5 py-2.5 text-xs font-medium rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>Vérifier le résumé par personne</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>← Modifier les paramètres</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={selectedEmployeeIds.length === 0 || generatedDates.length === 0}
                className="flex items-center space-x-2 px-6 py-2.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>✓ Confirmer et Enregistrer ({totalExclusionsCount} absences)</span>
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
