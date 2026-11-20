import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Calendar,
  Eye,
  CalendarOff,
  Palmtree,
  HeartPulse,
  Sparkles,
  HelpCircle,
  Check,
  Clock,
  Users
} from 'lucide-react';
import { TimesheetAuditEmployeeItem, TimesheetDayEntry, TimesheetExclusion } from '../../types/odoo';

interface TimesheetMatrixTableProps {
  records: TimesheetAuditEmployeeItem[];
  dateList: { date: string; formattedDate: string; isWeekend: boolean; dayOfWeek: number }[];
  thresholdHours: number;
  onSelectEmployeeDay: (employee: TimesheetAuditEmployeeItem, day?: TimesheetDayEntry) => void;
  onQuickExclusion?: (employee: TimesheetAuditEmployeeItem, date: string, day: TimesheetDayEntry) => void;
}

export const TimesheetMatrixTable: React.FC<TimesheetMatrixTableProps> = ({
  records = [],
  dateList = [],
  thresholdHours,
  onSelectEmployeeDay,
  onQuickExclusion
}) => {
  const todayStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
      
      {/* Legend & Help bar */}
      <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-slate-850 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-400 font-normal">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <span>Matrice Journalière — Cliquez sur une case pour inspecter les heures ou justifier/exclure une date</span>
        </div>

        {/* Legend pills */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-normal">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="text-slate-600 dark:text-slate-400">Conforme (≥ {thresholdHours}h)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-slate-600 dark:text-slate-400">Incomplet (&lt; {thresholdHours}h)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span className="text-slate-600 dark:text-slate-400">Non Pointé (0h)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-500"></span>
            <span className="text-slate-600 dark:text-slate-400">Aujourd'hui (En cours)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500"></span>
            <span className="text-slate-500 dark:text-slate-400">Exclu / Justifié</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600"></span>
            <span className="text-slate-400 dark:text-slate-500">Weekend (repos)</span>
          </div>
        </div>
      </div>

      {/* Table Container with Horizontal Scroll */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wider font-semibold select-none">
              <th className="py-3 px-5 sticky left-0 z-20 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 shadow-xs min-w-[220px]">
                Collaborateur
              </th>
              {dateList.map(d => {
                const isToday = d.date === todayStr;
                return (
                  <th 
                    key={d.date} 
                    className={`py-2.5 px-2 text-center min-w-[90px] border-l border-slate-200 dark:border-slate-800 ${
                      isToday
                        ? 'bg-sky-50/80 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300'
                        : d.isWeekend 
                        ? 'bg-slate-100/60 dark:bg-slate-900/60 text-slate-400 dark:text-slate-500' 
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="font-semibold flex items-center justify-center gap-1">
                      <span>{d.formattedDate}</span>
                      {isToday && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-sky-500 text-white">
                          Aujourd'hui
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] font-normal mt-0.5 font-mono ${
                      isToday ? 'text-sky-600 dark:text-sky-400' : d.isWeekend ? 'text-slate-400 dark:text-slate-500' : 'text-slate-400'
                    }`}>
                      {isToday ? 'En cours' : d.isWeekend ? 'Weekend' : `${thresholdHours}h`}
                    </div>
                  </th>
                );
              })}
              <th className="py-2.5 px-4 text-center min-w-[110px] bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                Conformité
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {records.length === 0 ? (
              <tr>
                <td colSpan={dateList.length + 2} className="py-14 text-center">
                  <div className="max-w-md mx-auto space-y-2">
                    <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Aucune feuille de temps à afficher
                    </p>
                    <p className="text-xs text-slate-400">
                      Aucun collaborateur ou pointage ne correspond à la période et aux filtres sélectionnés.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              records.map((emp) => {
                const isNok = emp.complianceStatus === 'NOK';
                const isCheck = emp.complianceStatus === 'CHECK';
                const isOk = emp.complianceStatus === 'OK';

                return (
                  <tr 
                    key={emp.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Sticky Employee Name Column */}
                    <td className="py-3 px-5 sticky left-0 z-10 bg-white dark:bg-slate-900 shadow-xs border-r border-slate-200/80 dark:border-slate-800">
                      <div 
                        onClick={() => onSelectEmployeeDay(emp)}
                        className="flex items-center space-x-2.5 cursor-pointer group"
                      >
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                          {emp.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-white group-hover:text-sky-500 dark:group-hover:text-sky-400 transition-colors block text-xs">
                            {emp.name}
                          </span>
                          <span className="text-[11px] text-slate-400 block font-normal">
                            {emp.jobTitle || 'Collaborateur'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Date Grid Cells */}
                    {dateList.map(d => {
                      const dayEntry = emp.days?.[d.date];
                      const hours = dayEntry ? dayEntry.hours : 0;
                      const isExcluded = dayEntry?.isExcluded;
                      const isValidated = dayEntry?.isValidated;
                      const reason = dayEntry?.exclusionReason;
                      const status = dayEntry?.status;
                      const isToday = d.date === todayStr;

                      const isMissing = status === 'missing';
                      const isIncomplete = status === 'incomplete';
                      const isCellOk = status === 'ok';

                      return (
                        <td 
                          key={d.date}
                          onClick={() => onSelectEmployeeDay(emp, dayEntry)}
                          className={`py-2 px-2 text-center border-l border-slate-100 dark:border-slate-800 cursor-pointer transition-colors ${
                            isToday && !isExcluded && !isValidated && hours < thresholdHours
                              ? 'bg-sky-50/30 dark:bg-sky-950/10'
                              : d.isWeekend && hours === 0
                              ? 'bg-slate-50/50 dark:bg-slate-850/30'
                              : isExcluded
                              ? 'bg-slate-50/70 dark:bg-slate-800/40'
                              : isValidated
                              ? 'bg-emerald-50/30 dark:bg-emerald-950/10'
                              : ''
                          }`}
                          title={
                            isValidated
                              ? `${emp.name} - ${d.formattedDate} : ${hours}h (Pointage validé conforme). Cliquer pour modifier.`
                              : isExcluded 
                              ? `${emp.name} - ${d.formattedDate} : Exclu (${reason || 'Justifié'}). Cliquer pour modifier.`
                              : isToday
                              ? `${emp.name} - ${d.formattedDate} : Journée en cours (${hours}h saisies). Pointage final attendu en fin de journée.`
                              : d.isWeekend && hours === 0
                              ? `${emp.name} - ${d.formattedDate} : Weekend (repos normal).`
                              : d.isWeekend && hours > 0
                              ? `${emp.name} - ${d.formattedDate} : ${hours}h (supplément weekend).`
                              : `${emp.name} - ${d.formattedDate} : ${hours}h pointées. Cliquer pour inspecter/exclure.`
                          }
                        >
                          {isExcluded ? (
                            <span className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-normal bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700">
                              <CalendarOff className="w-3 h-3 text-slate-400" />
                              <span>
                                {reason === 'conge' ? 'Congé' : reason === 'maladie' ? 'Maladie' : reason === 'ferie' ? 'Férié' : 'Exclu'}
                              </span>
                            </span>
                          ) : isToday && hours < thresholdHours ? (
                            <span className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium font-mono tabular-nums bg-sky-50/70 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border border-sky-200/70 dark:border-sky-800/70">
                              <Clock className="w-3 h-3 text-sky-500 shrink-0" />
                              <span>{hours > 0 ? `${hours.toFixed(1)} h` : 'En cours'}</span>
                            </span>
                          ) : isMissing ? (
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[11px] font-medium font-mono tabular-nums bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/40">
                              0.0 h
                            </span>
                          ) : isIncomplete ? (
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[11px] font-medium font-mono tabular-nums bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40">
                              {hours.toFixed(1)} h
                            </span>
                          ) : isCellOk ? (
                            <span className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium font-mono tabular-nums bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-900/40">
                              {isValidated && <Check className="w-2.5 h-2.5 text-emerald-600 shrink-0" />}
                              <span>{hours.toFixed(1)} h</span>
                            </span>
                          ) : d.isWeekend ? (
                            <span className="text-slate-300 dark:text-slate-600 text-[11px] font-mono tabular-nums">
                              {hours > 0 ? `${hours.toFixed(1)} h` : '—'}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px] font-mono tabular-nums">
                              {hours.toFixed(1)} h
                            </span>
                          )}
                        </td>
                      );
                    })}

                    {/* Compliance Text Badge Column (OK, NOK, CHECK) */}
                    <td className="py-2.5 px-4 text-center border-l border-slate-200/80 dark:border-slate-800">
                      {isNok ? (
                        <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-900/60">
                          <AlertCircle className="w-3 h-3 text-rose-500" />
                          NOK
                        </span>
                      ) : isCheck ? (
                        <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-900/60">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          CHECK
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-900/60">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};
