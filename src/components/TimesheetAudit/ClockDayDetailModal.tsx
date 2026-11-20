import React from 'react';
import {
  X,
  Clock,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Calendar,
  User,
  ArrowRight
} from 'lucide-react';
import { ClockDiscrepancyRow } from '../../types/clockAudit';

interface ClockDayDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  row?: ClockDiscrepancyRow | null;
  employeeName: string;
  dateStr: string;
  dateLabel: string;
}

export const ClockDayDetailModal: React.FC<ClockDayDetailModalProps> = ({
  isOpen,
  onClose,
  row,
  employeeName,
  dateStr,
  dateLabel
}) => {
  if (!isOpen) return null;

  const odooHours = row ? row.odooHours : 0;
  const rawClockHours = row ? row.rawClockHours : 0;
  const clockHours = row ? row.adjustedClockHours : 0;
  const totalBadgeuseHours = rawClockHours > 0 ? rawClockHours : clockHours;
  const lunchDeduction = row ? row.lunchDeductionHours : 0;
  const has30MinLunch = row ? row.lunchDeductionType !== 'none' : true;
  const isContractor = row ? (row.statusType === 'contractor' || row.contractType === 'contractor') : false;

  const diffBadgeuseOdoo = Math.round((totalBadgeuseHours - odooHours) * 100) / 100;
  const isHoursEqual = Math.abs(diffBadgeuseOdoo) <= 0.05 && odooHours > 0;
  const isBadgeuseGreater = diffBadgeuseOdoo > 0.05;
  const isOdooGreater = odooHours > totalBadgeuseHours && Math.abs(diffBadgeuseOdoo) > 0.05;

  // Status determined by User Rules:
  // - Badgeuse > Odoo: Correct (VERT)
  // - Odoo = Badgeuse:
  //     * Orange si 30 min table activé ou indépendant
  //     * Vert si la personne ne prend pas de temps de table
  // - Odoo > Badgeuse: Pas correct (ROUGE)
  let ruleStatus: 'green' | 'orange' | 'red' | 'neutral' = 'neutral';
  let ruleBadgeText = 'Neutre';
  let ruleExplanation = 'Aucune heure enregistrée.';

  if (row?.justification && row.justification.status === 'justified') {
    ruleStatus = 'green';
    ruleBadgeText = 'Justifié / Validé';
    ruleExplanation = `Justifié : ${row.justification.reasonLabel || row.justification.comment || 'Validé par le responsable'}`;
  } else if (odooHours === 0 && totalBadgeuseHours === 0) {
    ruleStatus = 'neutral';
    ruleBadgeText = 'Repos / 0h';
    ruleExplanation = 'Aucun pointage ni imputation sur cette journée.';
  } else if (isOdooGreater) {
    ruleStatus = 'red';
    ruleBadgeText = 'Pas correct (Odoo > Badgeuse)';
    ruleExplanation = `Non conforme : Les heures déclarées dans Odoo (${odooHours.toFixed(1)}h) dépassent le temps total badgeuse (${totalBadgeuseHours.toFixed(1)}h).`;
  } else if (isHoursEqual) {
    if (has30MinLunch || isContractor) {
      ruleStatus = 'orange';
      ruleBadgeText = isContractor ? 'Alerte Indépendant' : 'Alerte Pause 30 min';
      ruleExplanation = isContractor
        ? `Temps égal (${odooHours.toFixed(1)}h) : contrôle requis pour indépendant / prestation.`
        : `Temps Odoo égal au total badgeuse (${odooHours.toFixed(1)}h). La pause déjeuner de 30 min (${(lunchDeduction * 60 || 30).toFixed(0)} min) devrait normalement être déduite.`;
    } else {
      ruleStatus = 'green';
      ruleBadgeText = 'Conforme (Sans table)';
      ruleExplanation = `Conforme : La personne ne prend pas de temps de table, pointages égaux (${odooHours.toFixed(1)}h).`;
    }
  } else if (isBadgeuseGreater) {
    if (odooHours > 0) {
      ruleStatus = 'green';
      ruleBadgeText = 'Correct (Badgeuse > Odoo)';
      ruleExplanation = `Correct : Le temps total badgeuse (${totalBadgeuseHours.toFixed(1)}h) est supérieur au temps déclaré dans Odoo (${odooHours.toFixed(1)}h).`;
    } else {
      ruleStatus = 'orange';
      ruleBadgeText = 'Présence sans Odoo';
      ruleExplanation = `Pointage de ${totalBadgeuseHours.toFixed(1)}h enregistré à la badgeuse, mais aucune imputation Odoo (0.0 h).`;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{employeeName}</span>
                <span className="text-xs font-normal text-slate-300 dark:text-slate-600">·</span>
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {dateLabel || dateStr}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Inspection comparative des heures imputées Odoo vs relevé de badgeuse
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Comparison Cards */}
          <div className="grid grid-cols-3 gap-3">
            
            {/* Odoo */}
            <div className="bg-white dark:bg-slate-850/50 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 text-center">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Imputé Odoo
              </div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                {odooHours.toFixed(2)} <span className="text-xs font-normal text-slate-400">h</span>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                {row?.odooLinesCount || 0} {(row?.odooLinesCount || 0) > 1 ? 'imputations' : 'imputation'}
              </div>
            </div>

            {/* Badgeuse Total */}
            <div className="bg-white dark:bg-slate-850/50 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 text-center">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Badgeuse
              </div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                {totalBadgeuseHours.toFixed(2)} <span className="text-xs font-normal text-slate-400">h</span>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                {lunchDeduction > 0 ? `Net : ${clockHours.toFixed(2)}h (-${(lunchDeduction * 60).toFixed(0)}m table)` : 'Sans déduction table'}
              </div>
            </div>

            {/* Statut / Règle */}
            <div className="bg-white dark:bg-slate-850/50 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 text-center">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Écart (Badgeuse - Odoo)
              </div>
              <div className={`text-2xl font-semibold font-mono tabular-nums mt-1 ${
                ruleStatus === 'green'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : ruleStatus === 'orange'
                  ? 'text-amber-700 dark:text-amber-400'
                  : ruleStatus === 'red'
                  ? 'text-rose-700 dark:text-rose-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}>
                {diffBadgeuseOdoo > 0 ? `+${diffBadgeuseOdoo.toFixed(2)}` : diffBadgeuseOdoo.toFixed(2)} <span className="text-xs font-normal text-slate-400">h</span>
              </div>
              <div className="text-[11px] font-medium mt-0.5">
                {ruleStatus === 'green' ? (
                  <span className="text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {ruleBadgeText}
                  </span>
                ) : ruleStatus === 'orange' ? (
                  <span className="text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {ruleBadgeText}
                  </span>
                ) : ruleStatus === 'red' ? (
                  <span className="text-rose-700 dark:text-rose-400 flex items-center justify-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {ruleBadgeText}
                  </span>
                ) : (
                  <span className="text-slate-500">
                    {ruleBadgeText}
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* Règle appliquée explicative */}
          <div className={`p-3.5 rounded-lg border text-xs flex items-center gap-3 ${
            ruleStatus === 'green'
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200'
              : ruleStatus === 'orange'
              ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/80 dark:border-amber-800/60 text-amber-800 dark:text-amber-200'
              : ruleStatus === 'red'
              ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-800/60 text-rose-800 dark:text-rose-200'
              : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400'
          }`}>
            {ruleStatus === 'green' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : ruleStatus === 'orange' ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : ruleStatus === 'red' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <div className="font-medium">
              {ruleExplanation}
            </div>
          </div>

          {/* Section 1: Imputations Odoo */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 text-slate-400" />
              <span>Détail des feuilles de temps Odoo</span>
            </h4>

            {row?.odooDayDetail?.lines && row.odooDayDetail.lines.length > 0 ? (
              <div className="border border-slate-200/80 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Projet / Affaire</th>
                      <th className="py-2.5 px-3">Tâche</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-right">Durée</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {row.odooDayDetail.lines.map((line: any) => (
                      <tr key={line.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                          {line.projectName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                          {line.taskName || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 italic max-w-xs truncate">
                          {line.name || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium font-mono tabular-nums text-slate-900 dark:text-white">
                          {line.unitAmount.toFixed(2)} h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Aucune imputation Odoo enregistrée sur cette journée.</span>
              </div>
            )}
          </div>

          {/* Section 2: Relevé Badgeuse */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Pointages bruts de la badgeuse</span>
            </h4>

            {row?.rawClockRecord ? (
              <div className="border border-slate-200/80 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-850/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Nom brut dans le fichier :</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{row.rawClockRecord.employeeNameRaw}</span>
                </div>

                {/* Pointages chronologiques */}
                <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center">
                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Créneau 1</div>
                    <div className="font-mono tabular-nums text-xs font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                      {row.rawClockRecord.in1 || '—'} <ArrowRight className="w-2.5 h-2.5 inline mx-0.5 text-slate-400" /> {row.rawClockRecord.out1 || '—'}
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center">
                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Créneau 2</div>
                    <div className="font-mono tabular-nums text-xs font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                      {row.rawClockRecord.in2 || '—'} <ArrowRight className="w-2.5 h-2.5 inline mx-0.5 text-slate-400" /> {row.rawClockRecord.out2 || '—'}
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center">
                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Créneau 3</div>
                    <div className="font-mono tabular-nums text-xs font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                      {row.rawClockRecord.in3 || '—'} <ArrowRight className="w-2.5 h-2.5 inline mx-0.5 text-slate-400" /> {row.rawClockRecord.out3 || '—'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs pt-2 text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                  <span>Temps brut : <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{row.rawClockHours.toFixed(2)} h</strong></span>
                  {lunchDeduction > 0 && (
                    <span className="text-amber-700 dark:text-amber-400 font-medium">
                      Déduction pause midi : -{(lunchDeduction * 60).toFixed(0)} min
                    </span>
                  )}
                  <span>Temps retenu : <strong className="font-mono tabular-nums text-slate-900 dark:text-white">{clockHours.toFixed(2)} h</strong></span>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Aucun pointage badgeuse enregistré pour ce collaborateur à cette date.</span>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 transition-colors cursor-pointer shadow-xs"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
