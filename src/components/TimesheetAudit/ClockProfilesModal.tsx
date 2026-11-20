import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Users,
  Check,
  Shield,
  Coffee,
  AlertTriangle,
  Clock,
  Briefcase,
  Save,
  CheckCircle2,
  Sparkles,
  Search,
  Filter,
  UserCheck,
  HeartPulse,
  GraduationCap,
  HelpCircle
} from 'lucide-react';
import {
  ClockEmployeeProfile,
  ClockEmployeeStatus
} from '../../types/clockAudit';
import { TimesheetAuditEmployeeItem } from '../../types/odoo';
import { createDefaultProfile, normalizeClockProfile } from '../../services/clockAuditStorageService';

interface ClockProfilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: TimesheetAuditEmployeeItem[];
  profiles: Record<number, ClockEmployeeProfile>;
  onSaveProfiles: (updatedProfiles: ClockEmployeeProfile[]) => Promise<void>;
}

export const ClockProfilesModal: React.FC<ClockProfilesModalProps> = ({
  isOpen,
  onClose,
  employees,
  profiles,
  onSaveProfiles
}) => {
  const [localProfiles, setLocalProfiles] = useState<Record<number, ClockEmployeeProfile>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | ClockEmployeeStatus>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const initial: Record<number, ClockEmployeeProfile> = {};
      employees.forEach(emp => {
        if (profiles[emp.id]) {
          initial[emp.id] = normalizeClockProfile({ ...profiles[emp.id] });
        } else {
          initial[emp.id] = createDefaultProfile(emp.id, emp.name);
        }
      });
      setLocalProfiles(initial);
      setSaveSuccess(false);
    }
  }, [isOpen, employees, profiles]);

  const handleStatusChange = (empId: number, status: ClockEmployeeStatus) => {
    setLocalProfiles(prev => {
      const existing = prev[empId] || createDefaultProfile(empId, employees.find(e => e.id === empId)?.name || '');
      // When switching to contractor, automatically enable validation alert if not explicitly disabled
      const requireValidationAlert = status === 'contractor' ? true : existing.requireValidationAlert;

      return {
        ...prev,
        [empId]: {
          ...existing,
          status,
          contractType: status,
          requireValidationAlert,
          alertOnContractorEqual: requireValidationAlert
        }
      };
    });
  };

  const handleRuleToggle = (empId: number, rule: 'deductLunch' | 'requireValidationAlert', value: boolean) => {
    setLocalProfiles(prev => {
      const existing = prev[empId] || createDefaultProfile(empId, employees.find(e => e.id === empId)?.name || '');
      return {
        ...prev,
        [empId]: {
          ...existing,
          [rule]: value,
          lunchDeduction: rule === 'deductLunch' ? (value ? '30m' : 'none') : existing.lunchDeduction,
          alertOnContractorEqual: rule === 'requireValidationAlert' ? value : existing.alertOnContractorEqual
        }
      };
    });
  };

  // Bulk quick actions
  const handleBulkSetLunch = (enabled: boolean) => {
    setLocalProfiles(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        const id = Number(key);
        updated[id] = {
          ...updated[id],
          deductLunch: enabled,
          lunchDeduction: enabled ? '30m' : 'none'
        };
      });
      return updated;
    });
  };

  const handleBulkSetStatus = (status: ClockEmployeeStatus) => {
    setLocalProfiles(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        const id = Number(key);
        updated[id] = {
          ...updated[id],
          status,
          contractType: status,
          requireValidationAlert: status === 'contractor' ? true : updated[id].requireValidationAlert
        };
      });
      return updated;
    });
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const list = Object.values(localProfiles);
      await onSaveProfiles(list);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 800);
    } catch (err) {
      console.error('Error saving clock profiles:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const p = localProfiles[emp.id];
    if (filterStatus !== 'all' && p?.status !== filterStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return emp.name.toLowerCase().includes(q) || emp.departmentName?.toLowerCase().includes(q);
    }
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Matrice Personnel & Profils Pointeuse
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                  {employees.length} collaborateurs
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Grille de permissions : statuts contractuels (dispenses d'heures) et règles de calcul (pause midi 30 min, alerte de validation requise).
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

        {/* Bulk Action Toolbar */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-850 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2 font-medium text-slate-700 dark:text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-slate-400" />
            <span>Actions groupées :</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleBulkSetLunch(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium shadow-xs transition-colors cursor-pointer"
            >
              <Coffee className="w-3.5 h-3.5 text-amber-500" />
              <span>Cocher Pause Midi (30 min) pour tous</span>
            </button>

            <button
              type="button"
              onClick={() => handleBulkSetStatus('standard')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium shadow-xs transition-colors cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>Tous en Salarié Standard</span>
            </button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="px-6 py-3 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="relative flex-1 min-w-[240px]">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher un collaborateur par nom ou service..."
              className="w-full pl-9 pr-8 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-1 focus:ring-slate-400 dark:text-white"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick status filters */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs text-slate-400 font-medium mr-1">Filtrer :</span>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
              {(['all', 'standard', 'contractor', 'student', 'sick', 'other'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilterStatus(st)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    filterStatus === st
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {st === 'all' && 'Tous'}
                  {st === 'standard' && 'Salariés'}
                  {st === 'contractor' && 'Indépendants'}
                  {st === 'student' && 'Étudiants'}
                  {st === 'sick' && 'Malades'}
                  {st === 'other' && 'Autres'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Matrix Permissions Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              
              {/* Grouped Header */}
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-850 text-slate-600 dark:text-slate-300 font-medium border-b border-slate-200/80 dark:border-slate-800">
                  <th className="py-2.5 px-4 w-[240px]">
                    Collaborateur
                  </th>
                  <th colSpan={5} className="py-2.5 px-4 text-center border-l border-r border-slate-200/80 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-800/60">
                    <span className="text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300 font-medium">
                      Colonnes Statuts (Sélection exclusive)
                    </span>
                  </th>
                  <th colSpan={2} className="py-2.5 px-4 text-center bg-slate-100/50 dark:bg-slate-800/60">
                    <span className="text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300 font-medium">
                      Colonnes Règles de Calcul & Contrôle
                    </span>
                  </th>
                </tr>

                {/* Sub-headers */}
                <tr className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-medium text-[10px] uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                  <th className="py-2 px-4">Nom & Prénom</th>
                  
                  {/* Status columns */}
                  <th className="py-2 px-3 text-center border-l border-slate-200/80 dark:border-slate-800">
                    Salarié Standard
                  </th>
                  <th className="py-2 px-3 text-center">
                    Indépendant / Prestataire
                  </th>
                  <th className="py-2 px-3 text-center">
                    Étudiant
                  </th>
                  <th className="py-2 px-3 text-center">
                    Malade
                  </th>
                  <th className="py-2 px-3 text-center border-r border-slate-200/80 dark:border-slate-800">
                    Autre
                  </th>

                  {/* Rules columns */}
                  <th className="py-2 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Coffee className="w-3 h-3 text-slate-500" />
                      <span>Déduire Pause Midi (30 min)</span>
                    </div>
                  </th>
                  <th className="py-2 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-slate-500" />
                      <span>Alerte Validation Requis</span>
                    </div>
                  </th>
                </tr>
              </thead>

              {/* Body */}
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                {filteredEmployees.map(emp => {
                  const p = localProfiles[emp.id] || createDefaultProfile(emp.id, emp.name);

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Name & Dept */}
                      <td className="py-3 px-4 font-normal">
                        <div className="flex items-center space-x-2.5">
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center font-medium text-xs border ${
                            p.status === 'contractor'
                              ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                              : p.status === 'sick'
                              ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                              : p.status === 'student'
                              ? 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                              : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                          }`}>
                            {emp.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white text-xs">
                              {emp.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              {emp.departmentName || 'Atelier'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Status 1: Salarié Standard */}
                      <td className="py-3 px-3 text-center border-l border-slate-100 dark:border-slate-800">
                        <label className="inline-flex items-center justify-center cursor-pointer p-1">
                          <input
                            type="radio"
                            name={`status_${emp.id}`}
                            checked={p.status === 'standard'}
                            onChange={() => handleStatusChange(emp.id, 'standard')}
                            className="w-4 h-4 text-blue-600 border-slate-300 dark:border-slate-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </label>
                      </td>

                      {/* Status 2: Indépendant / Prestataire */}
                      <td className="py-3 px-3 text-center">
                        <label className="inline-flex items-center justify-center cursor-pointer p-1">
                          <input
                            type="radio"
                            name={`status_${emp.id}`}
                            checked={p.status === 'contractor'}
                            onChange={() => handleStatusChange(emp.id, 'contractor')}
                            className="w-4 h-4 text-amber-600 border-slate-300 dark:border-slate-600 focus:ring-amber-500 cursor-pointer"
                          />
                        </label>
                      </td>

                      {/* Status 3: Étudiant */}
                      <td className="py-3 px-3 text-center">
                        <label className="inline-flex items-center justify-center cursor-pointer p-1">
                          <input
                            type="radio"
                            name={`status_${emp.id}`}
                            checked={p.status === 'student'}
                            onChange={() => handleStatusChange(emp.id, 'student')}
                            className="w-4 h-4 text-indigo-600 border-slate-300 dark:border-slate-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </label>
                      </td>

                      {/* Status 4: Malade */}
                      <td className="py-3 px-3 text-center">
                        <label className="inline-flex items-center justify-center cursor-pointer p-1">
                          <input
                            type="radio"
                            name={`status_${emp.id}`}
                            checked={p.status === 'sick'}
                            onChange={() => handleStatusChange(emp.id, 'sick')}
                            className="w-4 h-4 text-rose-600 border-slate-300 dark:border-slate-600 focus:ring-rose-500 cursor-pointer"
                          />
                        </label>
                      </td>

                      {/* Status 5: Autre */}
                      <td className="py-3 px-3 text-center border-r border-slate-100 dark:border-slate-800">
                        <label className="inline-flex items-center justify-center cursor-pointer p-1">
                          <input
                            type="radio"
                            name={`status_${emp.id}`}
                            checked={p.status === 'other'}
                            onChange={() => handleStatusChange(emp.id, 'other')}
                            className="w-4 h-4 text-slate-600 border-slate-300 dark:border-slate-600 focus:ring-slate-500 cursor-pointer"
                          />
                        </label>
                      </td>

                      {/* Rule 1: Déduire Pause Midi (30 min) */}
                      <td className="py-3 px-3 text-center">
                        <label className="inline-flex items-center justify-center gap-1.5 cursor-pointer p-1">
                          <input
                            type="checkbox"
                            checked={p.deductLunch}
                            onChange={e => handleRuleToggle(emp.id, 'deductLunch', e.target.checked)}
                            className="w-4 h-4 rounded-sm border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-slate-400 cursor-pointer"
                          />
                          <span className={`text-[11px] font-medium ${p.deductLunch ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                            -30 min
                          </span>
                        </label>
                      </td>

                      {/* Rule 2: Alerte Validation Requis */}
                      <td className="py-3 px-3 text-center">
                        <label className="inline-flex items-center justify-center gap-1.5 cursor-pointer p-1">
                          <input
                            type="checkbox"
                            checked={p.requireValidationAlert}
                            onChange={e => handleRuleToggle(emp.id, 'requireValidationAlert', e.target.checked)}
                            className="w-4 h-4 rounded-sm border-amber-400 dark:border-amber-600 text-amber-600 focus:ring-amber-500/20 cursor-pointer"
                          />
                          <span className={`text-[11px] font-medium ${p.requireValidationAlert ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400'}`}>
                            {p.requireValidationAlert ? 'Requis' : 'Non'}
                          </span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {saveSuccess ? (
              <span className="text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" /> Matrice enregistrée et synchronisée avec succès !
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-slate-400" />
                <span>Les statuts et règles configurés s'appliquent immédiatement au comparatif Pointeuse vs Odoo.</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 transition-colors shadow-xs cursor-pointer disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Enregistrement...' : 'Enregistrer la Matrice'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
