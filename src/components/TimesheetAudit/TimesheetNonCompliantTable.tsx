import React from 'react';
import { 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  CalendarOff, 
  ChevronRight, 
  Clock, 
  User, 
  ExternalLink,
  ShieldCheck,
  Palmtree,
  HeartPulse,
  Sparkles,
  Check
} from 'lucide-react';
import { TimesheetAuditEmployeeItem, TimesheetDayEntry, TimesheetExclusion } from '../../types/odoo';

interface TimesheetNonCompliantTableProps {
  employees: TimesheetAuditEmployeeItem[];
  thresholdHours: number;
  onOpenDetailModal: (employee: TimesheetAuditEmployeeItem, selectedDay?: TimesheetDayEntry | null) => void;
  onQuickExclusion: (employee: TimesheetAuditEmployeeItem, date: string, day: TimesheetDayEntry) => void;
  onDirectValidateDay?: (employee: TimesheetAuditEmployeeItem, date: string, day: TimesheetDayEntry) => void;
  exclusions: Record<string, TimesheetExclusion>;
}

export const TimesheetNonCompliantTable: React.FC<TimesheetNonCompliantTableProps> = ({
  employees = [],
  thresholdHours,
  onOpenDetailModal,
  onQuickExclusion,
  onDirectValidateDay,
  exclusions = {}
}) => {
  const todayStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());

  // Filter only employees with genuine anomalies (excluding today and future days)
  const nonCompliantEmployees = (employees || []).filter(emp => {
    if (emp.complianceStatus !== 'NOK' && emp.complianceStatus !== 'CHECK') return false;
    const dayEntries = Object.values(emp.days || {}) as TimesheetDayEntry[];
    return dayEntries.some(day => !day.isWeekend && !day.isExcluded && day.date < todayStr && (day.status === 'missing' || day.status === 'incomplete'));
  });

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-850">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <AlertTriangle className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                Détail des Journées Non Conformes par Collaborateur
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {nonCompliantEmployees.length} collaborateur(s)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
              Récapitulatif des jours ouvrés passés à 0h (Non pointés) ou incomplets (&lt; {thresholdHours}h), hors weekends, exclusions et jour en cours
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {nonCompliantEmployees.length === 0 ? (
        <div className="p-8 text-center bg-slate-50/50 dark:bg-slate-850/50 space-y-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-200/70 dark:border-emerald-800/70">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
              Aucune anomalie détectée sur la période !
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto font-normal">
              Tous les collaborateurs affichés ont atteint le seuil requis de {thresholdHours}h par jour ouvré ou ont leurs absences justifiées.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-6">Collaborateur</th>
                <th className="py-2.5 px-4 text-center">Statut</th>
                <th className="py-2.5 px-4">Liste des dates en anomalie (avec heures saisies)</th>
                <th className="py-2.5 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {nonCompliantEmployees.map((emp) => {
                // Collect anomaly days for this employee (excluding weekends & exclusions)
                const dayEntries = Object.values(emp.days || {}) as TimesheetDayEntry[];
                
                const anomalyDays = dayEntries.filter(day => {
                  if (day.isWeekend) return false;
                  if (day.isExcluded) return false;
                  if (day.date >= todayStr) return false; // Ne pas pénaliser le jour en cours
                  if (day.status === 'missing' || day.status === 'incomplete') return true;
                  return false;
                }).sort((a, b) => a.date.localeCompare(b.date));

                const isNok = emp.complianceStatus === 'NOK';
                const isCheck = emp.complianceStatus === 'CHECK';

                return (
                  <tr 
                    key={emp.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Collaborateur */}
                    <td className="py-3 px-6">
                      <div className="flex items-center space-x-3">
                        <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium flex items-center justify-center text-xs shrink-0 border border-slate-200 dark:border-slate-700">
                          {emp.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium text-slate-900 dark:text-white block text-xs">
                            {emp.name}
                          </span>
                          <span className="text-[11px] text-slate-400 block font-normal">
                            {emp.jobTitle || 'Collaborateur'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Statut Badge */}
                    <td className="py-3 px-4 text-center">
                      {isNok ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-900/60">
                          <AlertCircle className="w-3 h-3 text-rose-500" />
                          NOK
                        </span>
                      ) : isCheck ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-900/60">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          CHECK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-900/60">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          OK
                        </span>
                      )}
                    </td>

                    {/* Anomalous Dates List with Hours */}
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {anomalyDays.map(day => {
                          const isZero = day.hours === 0;
                          return (
                            <div 
                              key={day.date}
                              className={`inline-flex items-center rounded-md border text-[11px] font-normal shadow-2xs ${
                                isZero
                                  ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200/70 dark:border-rose-900/50 text-rose-700 dark:text-rose-300'
                                  : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/70 dark:border-amber-900/50 text-amber-800 dark:text-amber-300'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => onQuickExclusion(emp, day.date, day)}
                                title={`Cliquer pour justifier (Congé / Maladie / Autre) pour le ${day.formattedDate}`}
                                className="inline-flex items-center space-x-1.5 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                              >
                                <span>{day.formattedDate.replace(/^([a-zéû]+)\s/i, '')}</span>
                                <span className="font-mono font-medium">({day.hours}h)</span>
                                <CalendarOff className="w-3 h-3 opacity-60" />
                              </button>

                              {onDirectValidateDay && (
                                <button
                                  type="button"
                                  onClick={() => onDirectValidateDay(emp, day.date, day)}
                                  title={`Valider immédiatement cette journée (${day.hours}h) comme conforme`}
                                  className="px-1.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer border-l border-emerald-700 flex items-center justify-center"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {isCheck && onDirectValidateDay && anomalyDays.length > 0 && (
                          <button
                            onClick={() => {
                              // Validate all remaining anomaly days for this employee
                              anomalyDays.forEach(day => onDirectValidateDay(emp, day.date, day));
                            }}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                            title="Valider toutes les journées incomplètes de ce collaborateur"
                          >
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Valider CHECK</span>
                          </button>
                        )}

                        <button
                          onClick={() => onOpenDetailModal(emp)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs"
                        >
                          <span>Détail</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
