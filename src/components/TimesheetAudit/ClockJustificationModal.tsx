import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Save,
  Trash2,
  Clock,
  Briefcase,
  Calendar,
  User
} from 'lucide-react';
import { ClockDiscrepancyRow, ClockJustification } from '../../types/clockAudit';
import { formatMinutesDiff } from '../../services/clockAuditStorageService';

interface ClockJustificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: ClockDiscrepancyRow | null;
  existingJustification: ClockJustification | null;
  onSaveJustification: (justification: ClockJustification) => Promise<void>;
  onRemoveJustification: (id: string) => Promise<void>;
}

const REASONS = [
  { id: 'maintenance_atelier', label: 'Travaux généraux / Entretien & Rangement atelier' },
  { id: 'reunion_formation', label: 'Réunion d\'équipe / Formation interne' },
  { id: 'travaux_tiers_deduire', label: 'Travaux pour compte tiers à déduire (Indépendant)' },
  { id: 'teletravail_deplacement', label: 'Télétravail autorisé / Déplacement extérieur' },
  { id: 'oubli_badge', label: 'Oubli de badgeage / Sortie non enregistrée' },
  { id: 'regularisation_odoo', label: 'Régularisation de feuille de temps Odoo en cours' },
  { id: 'autre', label: 'Autre motif spécifique' }
];

export const ClockJustificationModal: React.FC<ClockJustificationModalProps> = ({
  isOpen,
  onClose,
  row,
  existingJustification,
  onSaveJustification,
  onRemoveJustification
}) => {
  const [reason, setReason] = useState<string>('maintenance_atelier');
  const [comment, setComment] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (existingJustification) {
        setReason(existingJustification.reason || 'maintenance_atelier');
        setComment(existingJustification.comment || '');
      } else {
        // Auto-select based on row status
        if (row?.status === 'contractor_equal_alert') {
          setReason('travaux_tiers_deduire');
        } else if (row?.status === 'missing_clock') {
          setReason('teletravail_deplacement');
        } else {
          setReason('maintenance_atelier');
        }
        setComment('');
      }
    }
  }, [isOpen, existingJustification, row]);

  if (!isOpen || !row) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const selectedReasonObj = REASONS.find(r => r.id === reason);
      const justification: ClockJustification = {
        id: row.id,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        date: row.date,
        reason,
        reasonLabel: selectedReasonObj?.label || reason,
        comment: comment.trim(),
        status: 'justified',
        createdAt: existingJustification?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await onSaveJustification(justification);
      onClose();
    } catch (err) {
      console.error('Error saving justification:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingJustification) return;
    setIsDeleting(true);
    try {
      await onRemoveJustification(existingJustification.id);
      onClose();
    } catch (err) {
      console.error('Error deleting justification:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Valider & Justifier l'Écart
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                {row.employeeName} — {row.formattedDate} ({row.date})
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

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          
          {/* Discrepancy recap card */}
          <div className="p-4 rounded-lg bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Diagnostic de l'écart :
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {row.statusLabel}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-200/60 dark:border-slate-700/60 font-mono">
              <div>
                <div className="text-[10px] uppercase font-medium text-slate-400">Pointeuse Ajustée</div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                  {row.adjustedClockHours.toFixed(2)} h
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-medium text-slate-400">Imputé Odoo</div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                  {row.odooHours.toFixed(2)} h
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-medium text-slate-400">Écart Net</div>
                <div className={`text-xs font-semibold mt-0.5 tabular-nums ${
                  row.discrepancyMinutes > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {formatMinutesDiff(row.discrepancyMinutes)}
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
              {row.statusDescription}
            </p>
          </div>

          {/* Reason selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Motif de justification :
            </label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs font-normal bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
            >
              {REASONS.map(r => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Comment / Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Commentaire / Détails explicatifs :
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Ex : Temps consacré au nettoyage des postes et entretien hebdomadaire de la machine CNC..."
              className="w-full px-3 py-2 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-between border-t border-slate-200/80 dark:border-slate-800">
            {existingJustification ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50/70 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Suppression...' : 'Supprimer justification'}</span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white transition-colors shadow-xs cursor-pointer disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Enregistrement...' : 'Valider l\'écart'}</span>
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
