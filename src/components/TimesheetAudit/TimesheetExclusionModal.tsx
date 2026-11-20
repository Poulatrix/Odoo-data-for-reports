import React, { useState } from 'react';
import { 
  X, 
  CalendarOff, 
  Check, 
  CheckCircle2,
  Trash2, 
  Palmtree, 
  HeartPulse, 
  Sparkles, 
  HelpCircle,
  Clock,
  User,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { TimesheetExclusion, TimesheetExclusionReason } from '../../types/odoo';

interface TimesheetExclusionModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: number | null;
  employeeName: string;
  date: string; // 'YYYY-MM-DD'
  formattedDate?: string;
  currentHours?: number;
  existingExclusion?: TimesheetExclusion | null;
  onSaveExclusion: (exclusion: TimesheetExclusion) => void;
  onRemoveExclusion: (employeeId: number, date: string) => void;
}

export const TimesheetExclusionModal: React.FC<TimesheetExclusionModalProps> = ({
  isOpen,
  onClose,
  employeeId,
  employeeName,
  date,
  formattedDate,
  currentHours = 0,
  existingExclusion,
  onSaveExclusion,
  onRemoveExclusion
}) => {
  const [selectedReason, setSelectedReason] = useState<TimesheetExclusionReason>(
    existingExclusion?.reason || (currentHours > 0 ? 'valide' : 'conge')
  );
  const [comment, setComment] = useState<string>(existingExclusion?.comment || '');

  if (!isOpen || !employeeId || !date) return null;

  const handleSave = () => {
    const defaultComment = selectedReason === 'valide' && !comment.trim()
      ? `Pointage validé conforme (${currentHours}h)`
      : comment.trim();

    const newExclusion: TimesheetExclusion = {
      id: `${employeeId}_${date}`,
      employeeId,
      employeeName,
      date,
      reason: selectedReason,
      comment: defaultComment,
      createdAt: new Date().toISOString()
    };
    onSaveExclusion(newExclusion);
    onClose();
  };

  const handleRemove = () => {
    onRemoveExclusion(employeeId, date);
    onClose();
  };

  const REASONS_LIST: {
    id: TimesheetExclusionReason;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    colorClass: string;
    borderClass: string;
  }[] = [
    {
      id: 'valide',
      label: 'Valider le pointage comme conforme (< 7h)',
      description: 'Le pointage passe simplement en vert avec ses heures (statut OK / conforme, non exclu)',
      icon: CheckCircle2,
      colorClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
      borderClass: 'border-emerald-200 dark:border-emerald-800'
    },
    {
      id: 'conge',
      label: 'Congé / RTT (Absence)',
      description: 'Congés payés, RTT, récupération ou absence autorisée',
      icon: Palmtree,
      colorClass: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50',
      borderClass: 'border-indigo-200 dark:border-indigo-800'
    },
    {
      id: 'maladie',
      label: 'Maladie / Arrêt de travail (Absence)',
      description: 'Arrêt maladie, accident du travail ou rendez-vous médical',
      icon: HeartPulse,
      colorClass: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50',
      borderClass: 'border-rose-200 dark:border-rose-800'
    },
    {
      id: 'ferie',
      label: 'Jour Férié / Chômé (Absence)',
      description: 'Jour férié légal ou fermeture exceptionnelle du site',
      icon: Sparkles,
      colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50',
      borderClass: 'border-amber-200 dark:border-amber-800'
    },
    {
      id: 'autre',
      label: 'Autre motif d\'absence',
      description: 'Formation, déplacement extérieur ou motif divers d\'absence',
      icon: HelpCircle,
      colorClass: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
      borderClass: 'border-slate-200 dark:border-slate-700'
    }
  ];

  const handleQuickValidate = () => {
    const newExclusion: TimesheetExclusion = {
      id: `${employeeId}_${date}`,
      employeeId,
      employeeName,
      date,
      reason: 'valide',
      comment: `Pointage validé conforme (${currentHours}h)`,
      createdAt: new Date().toISOString()
    };
    onSaveExclusion(newExclusion);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200/80 dark:border-slate-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <CalendarOff className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {existingExclusion ? 'Modifier l\'exclusion de date' : 'Justifier / Exclure cette journée'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                La journée ne sera plus comptée comme anomalie (NOK / CHECK)
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
        <div className="p-6 space-y-4">
          
          {/* Target employee and date card */}
          <div className="p-3 rounded-lg bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-medium text-slate-900 dark:text-white">
                {employeeName}
              </span>
            </div>
            <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 font-normal">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-medium text-slate-700 dark:text-slate-300">{formattedDate || date}</span>
              <span className="text-[11px] font-mono">({currentHours}h saisies)</span>
            </div>
          </div>

          {/* Quick 1-click validation action button */}
          <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/60 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 block">
                Validation directe (Statut CHECK / Incomplet)
              </span>
              <span className="text-[11px] text-emerald-700/90 dark:text-emerald-300/80 block font-normal">
                Valider immédiatement ce pointage comme conforme ({currentHours}h).
              </span>
            </div>
            <button
              type="button"
              onClick={handleQuickValidate}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer shadow-2xs shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Valider le pointage</span>
            </button>
          </div>

          {/* Reasons Radio / Buttons */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Motif de l'exclusion *
            </label>
            
            <div className="grid grid-cols-1 gap-2">
              {REASONS_LIST.map((r) => {
                const Icon = r.icon;
                const isSelected = selectedReason === r.id;

                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedReason(r.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors flex items-start space-x-3 ${
                      isSelected
                        ? 'border-slate-900 dark:border-slate-300 bg-slate-50/80 dark:bg-slate-800/80 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${r.colorClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {r.label}
                        </span>
                        {isSelected && (
                          <span className="w-4 h-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
                        {r.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comment input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Commentaire ou justification (facultatif)
            </label>
            <textarea
              rows={2}
              placeholder="ex: Justificatif CP validé par RH / Arrêt maladie jusqu'au 02/09"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          {/* SaaS-only Notice */}
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 border border-slate-200/60 dark:border-slate-700/60 font-normal">
            <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              Cette exclusion est enregistrée dans le SaaS uniquement (n'écrit rien dans Odoo).
            </span>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 flex items-center justify-between">
          <div>
            {existingExclusion ? (
              <button
                onClick={handleRemove}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50/70 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Rétablir le pointage</span>
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
              >
                Annuler
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleSave}
              className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-medium rounded-lg text-white shadow-xs transition-colors cursor-pointer ${
                selectedReason === 'valide'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>{selectedReason === 'valide' ? 'Valider le pointage (Conforme)' : 'Enregistrer l\'exclusion'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
