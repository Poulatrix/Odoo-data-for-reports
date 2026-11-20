import React from 'react';
import { 
  X, 
  Clock, 
  Calendar, 
  User, 
  Briefcase, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  FileText,
  CalendarOff,
  Palmtree,
  HeartPulse,
  Sparkles,
  HelpCircle,
  Edit2,
  Check
} from 'lucide-react';
import { TimesheetAuditEmployeeItem, TimesheetDayEntry, TimesheetExclusion } from '../../types/odoo';

interface TimesheetDayDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: TimesheetAuditEmployeeItem | null;
  selectedDay?: TimesheetDayEntry | null;
  thresholdHours: number;
  onOpenExclusionModal: (employee: TimesheetAuditEmployeeItem, date: string, day: TimesheetDayEntry) => void;
  onDirectValidateDay?: (employee: TimesheetAuditEmployeeItem, date: string, day: TimesheetDayEntry) => void;
  exclusions: Record<string, TimesheetExclusion>;
}

export const TimesheetDayDetailModal: React.FC<TimesheetDayDetailModalProps> = ({
  isOpen,
  onClose,
  employee,
  selectedDay,
  thresholdHours,
  onOpenExclusionModal,
  onDirectValidateDay,
  exclusions
}) => {
  if (!isOpen || !employee) return null;

  // If a specific day was clicked, show that day's lines; otherwise show all recorded lines for the period
  const dayEntries: TimesheetDayEntry[] = selectedDay 
    ? [selectedDay]
    : (Object.values(employee.days || {}) as TimesheetDayEntry[]).sort((a, b) => b.date.localeCompare(a.date));

  const isNok = employee.complianceStatus === 'NOK';
  const isCheck = employee.complianceStatus === 'CHECK';
  const isOk = employee.complianceStatus === 'OK';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200/80 dark:border-slate-800 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-medium text-sm border border-slate-200 dark:border-slate-700">
              {employee.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {employee.name}
                </h3>
                {isNok ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-900/60">
                    Statut : NOK
                  </span>
                ) : isCheck ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-900/60">
                    Statut : CHECK
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-900/60">
                    Statut : OK
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 font-normal">
                <span>{employee.jobTitle || 'Collaborateur'}</span>
                {employee.workEmail && <span>• {employee.workEmail}</span>}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          
          {/* Missing Dates Alert Box if any */}
          {employee.missingDates.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 flex items-start space-x-3 text-rose-900 dark:text-rose-200">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-xs font-bold">Jours ouvrés sans aucun pointage (0h) :</h4>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {employee.missingDates.map(dateStr => {
                    const dayEntry = employee.days?.[dateStr];
                    return (
                      <button
                        key={dateStr}
                        onClick={() => dayEntry && onOpenExclusionModal(employee, dateStr, dayEntry)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-100 hover:bg-rose-200 dark:bg-rose-900 dark:hover:bg-rose-800 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700 cursor-pointer transition-colors"
                        title="Cliquer pour justifier (Congé / Maladie / Férié)"
                      >
                        <span>{dateStr}</span>
                        <CalendarOff className="w-3 h-3 text-rose-600 dark:text-rose-300" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Timesheet Entries by Day */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center justify-between">
              <span>Détail des Journées & Imputations Analytiques</span>
              <span className="text-[11px] normal-case text-slate-400">
                {selectedDay ? `Jour sélectionné : ${selectedDay.formattedDate}` : `Période complète (${dayEntries.length} jours)`}
              </span>
            </h4>

            <div className="space-y-3">
              {dayEntries.map(day => {
                const todayStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
                const isToday = day.date === todayStr || day.status === 'today';
                const isExcluded = day.isExcluded;
                const isValidated = day.isValidated;
                const reason = day.exclusionReason;
                const comment = day.exclusionComment;
                const isMissing = day.status === 'missing';
                const isIncomplete = day.status === 'incomplete';
                const isOk = day.status === 'ok';
                const isWeekend = day.isWeekend;

                return (
                  <div
                    key={day.date}
                    className={`rounded-xl border p-4 transition-all ${
                      isValidated
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                        : isExcluded
                        ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-300 dark:border-slate-700'
                        : isMissing
                        ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                        : isIncomplete
                        ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
                        : isOk
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                        : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center space-x-2.5">
                        <div className={`p-1.5 rounded-lg ${
                          isValidated
                            ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                            : isExcluded
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            : isMissing
                            ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300'
                            : isIncomplete
                            ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                            : isOk
                            ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                        }`}>
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {day.formattedDate}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-2">
                            ({day.date})
                          </span>
                        </div>
                      </div>

                      {/* Status & Actions */}
                      <div className="flex items-center space-x-2">
                        {isValidated ? (
                          <div className="flex items-center space-x-2">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />
                              <span>Validé conforme ({day.hours}h)</span>
                            </span>
                            <button
                              onClick={() => onOpenExclusionModal(employee, day.date, day)}
                              className="px-2 py-1 rounded-md text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 cursor-pointer"
                            >
                              Modifier
                            </button>
                          </div>
                        ) : isExcluded ? (
                          <div className="flex items-center space-x-2">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600">
                              <CalendarOff className="w-3.5 h-3.5 text-slate-500" />
                              <span>Exclu : {reason === 'conge' ? 'Congé' : reason === 'maladie' ? 'Maladie' : reason === 'ferie' ? 'Férié' : 'Absence'}</span>
                            </span>
                            <button
                              onClick={() => onOpenExclusionModal(employee, day.date, day)}
                              className="px-2 py-1 rounded-md text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors"
                            >
                              Modifier
                            </button>
                          </div>
                        ) : (
                          <>
                            {isToday && !isOk && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-800">
                                <Clock className="w-3 h-3 text-sky-600 dark:text-sky-300" />
                                <span>JOURNÉE EN COURS ({day.hours}h saisies)</span>
                              </span>
                            )}
                            {isMissing && !isToday && !isWeekend && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300">
                                NON POINTÉ (0h)
                              </span>
                            )}
                            {isIncomplete && !isToday && !isWeekend && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
                                INCOMPLET ({day.hours}h / {thresholdHours}h)
                              </span>
                            )}
                            {isOk && !isWeekend && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300">
                                OK ({day.hours}h)
                              </span>
                            )}
                            {isWeekend && day.hours > 0 && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                                Supplément Weekend ({day.hours}h)
                              </span>
                            )}
                            {isWeekend && day.hours === 0 && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                Weekend (Repos)
                              </span>
                            )}

                            {/* Quick justify & Direct validate buttons */}
                            {!isWeekend && (
                              <div className="flex items-center space-x-1.5">
                                {onDirectValidateDay && (isMissing || isIncomplete) && (
                                  <button
                                    onClick={() => onDirectValidateDay(employee, day.date, day)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer shadow-2xs"
                                    title="Valider immédiatement ce pointage comme conforme"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Valider</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => onOpenExclusionModal(employee, day.date, day)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                                >
                                  <CalendarOff className="w-3 h-3 text-slate-500" />
                                  <span>Justifier / Valider</span>
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* If validated or excluded, display comment if any */}
                    {isValidated && comment && (
                      <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300 italic bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-lg border border-emerald-200 dark:border-emerald-800/60">
                        💬 Validation : &ldquo;{comment}&rdquo;
                      </p>
                    )}
                    {isExcluded && comment && (
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                        💬 Justification : &ldquo;{comment}&rdquo;
                      </p>
                    )}

                    {/* Lines for this day */}
                    {day.lines && day.lines.length > 0 ? (
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/60 space-y-2">
                        {day.lines.map((line, idx) => (
                          <div 
                            key={line.id || idx}
                            className="flex items-center justify-between text-xs bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800"
                          >
                            <div className="space-y-0.5">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {line.name || 'Feuille de temps'}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                {line.projectName && <span>📁 Projet : <strong>{line.projectName}</strong></span>}
                                {line.taskName && <span>• 🎯 Tâche : <strong>{line.taskName}</strong></span>}
                              </div>
                            </div>
                            <div className="font-bold text-slate-900 dark:text-white px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-md">
                              {line.unitAmount} h
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      isMissing && !isExcluded && (
                        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400 italic">
                          Aucune feuille de temps ou écriture analytique trouvée dans Odoo pour cette date.
                        </p>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
