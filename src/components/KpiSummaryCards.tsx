import React from 'react';
import { 
  FileSpreadsheet, 
  TrendingUp, 
  Euro, 
  Layers, 
  CheckCircle2, 
  Clock, 
  PieChart 
} from 'lucide-react';
import { OdooModelConfig } from '../types/odoo';
import { formatCurrency, formatNumber } from '../utils/formatters';

interface KpiSummaryCardsProps {
  currentModel: OdooModelConfig;
  records: Record<string, any>[];
  totalCount: number;
}

export const KpiSummaryCards: React.FC<KpiSummaryCardsProps> = ({
  currentModel,
  records,
  totalCount
}) => {
  // Calculate metrics based on model definition
  const amountField = currentModel.amountField || 'amount_total';
  const statusField = currentModel.statusField || 'state';

  // Total sum of amount if applicable
  const hasAmounts = records.some(r => typeof r[amountField] === 'number');
  const totalAmount = hasAmounts
    ? records.reduce((acc, r) => acc + (typeof r[amountField] === 'number' ? r[amountField] : 0), 0)
    : 0;

  const averageAmount = records.length > 0 && hasAmounts ? totalAmount / records.length : 0;

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  records.forEach(r => {
    let st = r[statusField];
    if (Array.isArray(st) && st.length >= 2) st = st[1];
    const key = String(st || 'Autre');
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  });

  const topStatuses = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      
      {/* Card 1: Total Records */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:border-purple-300 dark:hover:border-purple-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Lignes chargées
          </span>
          <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {formatNumber(records.length)}
          </span>
          {totalCount > records.length && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              sur {formatNumber(totalCount)} total
            </span>
          )}
        </div>
        <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <span className="font-mono text-purple-600 dark:text-purple-400 font-medium">
            {currentModel.technicalName}
          </span>
        </div>
      </div>

      {/* Card 2: Total Amount (or Active proportion) */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:border-purple-300 dark:hover:border-purple-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {hasAmounts ? 'Volume Financier Cumulé' : 'Statut Principal'}
          </span>
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
            {hasAmounts ? <Euro className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          </div>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {hasAmounts ? formatCurrency(totalAmount) : `${records.length} entrées`}
          </span>
        </div>
        <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          {hasAmounts ? 'Total calculé sur la vue filtrée' : 'Tous enregistrements actifs'}
        </div>
      </div>

      {/* Card 3: Average Ticket / Average Value */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:border-purple-300 dark:hover:border-purple-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {hasAmounts ? 'Montant Moyen par Ligne' : 'Catégorie Odoo'}
          </span>
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {hasAmounts ? formatCurrency(averageAmount) : currentModel.category}
          </span>
        </div>
        <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          {hasAmounts ? 'Moyenne unitaire sur la sélection' : `Module Odoo ${currentModel.category}`}
        </div>
      </div>

      {/* Card 4: Top Status distribution */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:border-purple-300 dark:hover:border-purple-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Répartition Statuts
          </span>
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
            <PieChart className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {topStatuses.length > 0 ? (
            topStatuses.map(([stKey, count]) => {
              const badgeDef = currentModel.stateBadgeMap?.[stKey];
              const displayLabel = badgeDef?.label || stKey;
              return (
                <span
                  key={stKey}
                  className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                >
                  <span className="font-semibold mr-1">{count}</span>
                  <span className="truncate max-w-[80px]">{displayLabel}</span>
                </span>
              );
            })
          ) : (
            <span className="text-xs text-slate-400">Aucun statut</span>
          )}
        </div>
        <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          Distribution des états Odoo
        </div>
      </div>

    </div>
  );
};
