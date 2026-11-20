import React, { useState, useMemo } from 'react';
import { 
  X, 
  Trash2, 
  CalendarOff, 
  Palmtree, 
  HeartPulse, 
  Sparkles, 
  HelpCircle, 
  Filter, 
  Search, 
  Calendar,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { TimesheetExclusion } from '../../types/odoo';

interface TimesheetManageExclusionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  exclusions: Record<string, TimesheetExclusion>;
  onRemoveExclusion: (employeeId: number, date: string) => void;
  onRemoveRangeExclusions: (startDate: string, endDate: string, employeeId?: number) => void;
}

export const TimesheetManageExclusionsModal: React.FC<TimesheetManageExclusionsModalProps> = ({
  isOpen,
  onClose,
  exclusions = {},
  onRemoveExclusion,
  onRemoveRangeExclusions
}) => {
  const [search, setSearch] = useState<string>('');
  const [filterReason, setFilterReason] = useState<string>('all');
  
  // Date range purge state
  const [purgeStart, setPurgeStart] = useState<string>('');
  const [purgeEnd, setPurgeEnd] = useState<string>('');
  const [purgeSuccessMsg, setPurgeSuccessMsg] = useState<string | null>(null);

  const exclusionsList = useMemo(() => {
    return (Object.values(exclusions) as TimesheetExclusion[]).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.employeeName.localeCompare(b.employeeName);
    });
  }, [exclusions]);

  const filteredList = useMemo(() => {
    return exclusionsList.filter(item => {
      if (filterReason !== 'all' && item.reason !== filterReason) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = item.employeeName.toLowerCase().includes(q);
        const matchDate = item.date.includes(q);
        const matchComment = item.comment?.toLowerCase().includes(q);
        if (!matchName && !matchDate && !matchComment) return false;
      }
      return true;
    });
  }, [exclusionsList, filterReason, search]);

  const handlePurgeRange = () => {
    if (!purgeStart || !purgeEnd) return;
    if (purgeStart > purgeEnd) return;
    
    onRemoveRangeExclusions(purgeStart, purgeEnd);
    setPurgeSuccessMsg(`Toutes les absences entre le ${purgeStart} et le ${purgeEnd} ont été supprimées.`);
    setPurgeStart('');
    setPurgeEnd('');
    setTimeout(() => setPurgeSuccessMsg(null), 4000);
  };

  if (!isOpen) return null;

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case 'valide':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" />
            <span>Validé conforme</span>
          </span>
        );
      case 'conge':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            <Palmtree className="w-3 h-3" />
            <span>Congé / RTT</span>
          </span>
        );
      case 'maladie':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <HeartPulse className="w-3 h-3" />
            <span>Maladie / Arrêt</span>
          </span>
        );
      case 'ferie':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Sparkles className="w-3 h-3" />
            <span>Jour Férié</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <HelpCircle className="w-3 h-3" />
            <span>Autre</span>
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              <CalendarOff className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Gestion & Nettoyage des Justifications d'Absences
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                  {exclusionsList.length} active(s)
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consultez, filtrez ou supprimez des congés et justifications enregistrés
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

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">

          {/* Purge Success Banner */}
          {purgeSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center space-x-2 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{purgeSuccessMsg}</span>
            </div>
          )}

          {/* Bulk Purge Box */}
          <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 space-y-3">
            <div className="flex items-center space-x-2 text-rose-800 dark:text-rose-300">
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span className="text-xs font-bold">Nettoyer / Supprimer une plage de dates entière</span>
            </div>
            <p className="text-[11px] text-rose-700/80 dark:text-rose-400">
              Pratique si vous avez encodé des congés par erreur sur une période :
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="flex items-center space-x-1.5">
                <span className="text-[11px] text-slate-500 font-medium">Du :</span>
                <input
                  type="date"
                  value={purgeStart}
                  onChange={(e) => setPurgeStart(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center space-x-1.5">
                <span className="text-[11px] text-slate-500 font-medium">Au :</span>
                <input
                  type="date"
                  value={purgeEnd}
                  onChange={(e) => setPurgeEnd(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="button"
                onClick={handlePurgeRange}
                disabled={!purgeStart || !purgeEnd || purgeStart > purgeEnd}
                className="px-3 py-1 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer disabled:opacity-40"
              >
                Supprimer cette plage
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Rechercher par nom, date, motif..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div className="flex items-center space-x-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'all', label: 'Tous' },
                { id: 'valide', label: 'Validés' },
                { id: 'conge', label: 'Congés' },
                { id: 'maladie', label: 'Maladie' },
                { id: 'ferie', label: 'Fériés' },
                { id: 'autre', label: 'Autre' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterReason(f.id)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    filterReason === f.id
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Exclusions List */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {filteredList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs space-y-1">
                <CalendarOff className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <span className="font-bold block text-slate-600 dark:text-slate-300">
                  Aucune justification trouvée
                </span>
                <span className="text-[11px] block">
                  {exclusionsList.length === 0 
                    ? 'Aucune absence n\'est actuellement enregistrée' 
                    : 'Modifiez vos filtres de recherche'}
                </span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {filteredList.map(item => (
                  <div
                    key={item.id}
                    className="p-3 bg-white dark:bg-slate-900 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-xs shrink-0">
                        {item.employeeName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {item.employeeName}
                          </span>
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            • {item.date}
                          </span>
                        </div>
                        {item.comment && (
                          <span className="text-[11px] text-slate-400 block italic">
                            « {item.comment} »
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2.5">
                      {getReasonBadge(item.reason)}
                      <button
                        onClick={() => onRemoveExclusion(item.employeeId, item.date)}
                        title="Supprimer cette justification"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
