import React, { useState, useEffect } from 'react';
import { 
  PackagePlus, 
  Calendar, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight, 
  ShoppingCart, 
  HelpCircle, 
  CheckCircle2, 
  ExternalLink,
  Layers,
  Clock,
  Sparkles,
  Info
} from 'lucide-react';
import { 
  OdooConnectionCredentials, 
  WipPurchasesInflowReportResponse 
} from '../../types/odoo';
import { odooClient } from '../../services/odooClient';

interface WipPurchasesInflowWidgetProps {
  credentials: OdooConnectionCredentials | null;
  isDemo?: boolean;
  selectedMonthKey?: string;
  onMonthChange?: (monthKey: string) => void;
  className?: string;
  variant?: 'banner' | 'card' | 'standalone';
  showDetailsToggle?: boolean;
}

export const WipPurchasesInflowWidget: React.FC<WipPurchasesInflowWidgetProps> = ({
  credentials,
  isDemo = false,
  selectedMonthKey: externalMonthKey,
  onMonthChange,
  className = '',
  variant = 'card',
  showDetailsToggle = true
}) => {
  const [internalMonthKey, setInternalMonthKey] = useState<string>(externalMonthKey || '2026-09');
  const monthKey = externalMonthKey || internalMonthKey;

  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<WipPurchasesInflowReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [showRuleTooltip, setShowRuleTooltip] = useState<boolean>(false);

  const handleMonthSelect = (newMonth: string) => {
    if (!newMonth) return;
    setInternalMonthKey(newMonth);
    if (onMonthChange) {
      onMonthChange(newMonth);
    }
  };

  const loadInflowData = async (forceRefresh: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await odooClient.getWipPurchasesInflowReport({
        monthKey,
        forceRefresh,
        credentials: credentials || undefined,
        isDemo
      });

      if (res.success) {
        setData(res);
      } else {
        setError(res.error || "Erreur lors du calcul de l'augmentation de l'encours.");
      }
    } catch (err: any) {
      setError(err.message || 'Impossible de contacter le serveur Odoo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInflowData(false);
  }, [monthKey, isDemo, credentials]);

  // Format currency
  const formatEuro = (val: number | undefined | null) => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  const availableMonths = data?.summary.availableMonths || [
    { monthKey: '2026-09', monthLabel: 'Septembre 2026' },
    { monthKey: '2026-08', monthLabel: 'Août 2026' },
    { monthKey: '2026-07', monthLabel: 'Juillet 2026' },
    { monthKey: '2026-06', monthLabel: 'Juin 2026' }
  ];

  const selectedMonthLabel = data?.summary.selectedMonthLabel || (
    availableMonths.find(m => m.monthKey === monthKey)?.monthLabel || monthKey
  );

  const totalAmount = data?.summary.totalPurchasesInflowUntaxed ?? 0;
  const eligibleOrdersCount = data?.summary.totalEligibleOrdersCount ?? 0;

  return (
    <div className={`rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 dark:backdrop-blur-md p-5 sm:p-6 transition-all shadow-xs ${className}`}>

      {/* Header & Title bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
            <PackagePlus className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white">
                Augmentation de l'Encours
              </h3>
              <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>Achats Engagés Non Facturés</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 font-semibold">
                Commandes d'Achat &ge; 500 €
              </span>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Achats du mois alimentant l'encours (commandes d'achat &ge; 500 €, déduction des montants déjà facturés)
            </p>
          </div>
        </div>

        {/* Month Selector Filter & Refresh button */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {/* Quick preset buttons */}
          <div className="hidden md:flex items-center space-x-1 p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-full border border-slate-200/80 dark:border-slate-700">
            {availableMonths.slice(0, 3).map((m) => (
              <button
                key={m.monthKey}
                type="button"
                onClick={() => handleMonthSelect(m.monthKey)}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                  monthKey === m.monthKey
                    ? 'bg-sky-500 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {m.monthLabel.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Month dropdown selector */}
          <div className="relative">
            <select
              value={monthKey}
              onChange={(e) => handleMonthSelect(e.target.value)}
              className="pl-3 pr-7 py-1.5 text-xs font-medium rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer appearance-none shadow-2xs"
            >
              {availableMonths.map(m => (
                <option key={m.monthKey} value={m.monthKey}>
                  {m.monthLabel}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
          </div>

          {/* HTML5 Month input for custom civil month */}
          <input
            type="month"
            value={monthKey}
            onChange={(e) => e.target.value && handleMonthSelect(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-mono font-medium rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer shadow-2xs"
            title="Sélectionner un mois civil spécifique"
          />

          {/* Refresh action */}
          <button
            onClick={() => loadInflowData(true)}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            title="Rafraîchir les achats engagés du mois"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* SYNTHETIC GLOBAL DISPLAY : SOMME TOTALE GLOBALE MISE EN AVANT */}
      <div className="pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Core Metric Presentation */}
        <div className="flex-1">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            <ShoppingCart className="w-3.5 h-3.5 text-amber-500" />
            <span>Total Achats en Cours du mois ({selectedMonthLabel}) :</span>
          </div>

          <div className="flex items-baseline space-x-3 mt-1.5">
            <span className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono text-slate-900 dark:text-white tabular-nums">
              {loading ? (
                <span className="text-slate-400 animate-pulse text-2xl font-sans">Calcul Odoo en cours...</span>
              ) : (
                formatEuro(totalAmount)
              )}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              HT non facturé
            </span>
          </div>

          <div className="flex items-center space-x-3 text-xs text-slate-400 dark:text-slate-500 mt-2 flex-wrap gap-y-1">
            <span>
              Périmètre : <strong className="text-slate-700 dark:text-slate-200">{eligibleOrdersCount}</strong> commande(s) d'achat &ge; 500 € non facturées
            </span>
            <span>•</span>
            <span className="text-slate-400 dark:text-slate-500">
              Achats &lt; 500 € exclus
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 text-emerald-500">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Deltas partiels déduits</span>
            </span>
          </div>
        </div>

        {/* Discreet Rule Tooltip Button instead of heavy yellow box */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowRuleTooltip(!showRuleTooltip)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <Info className="w-3.5 h-3.5 text-sky-500" />
            <span>Règle d'alimentation</span>
          </button>

          {showRuleTooltip && (
            <div 
              className="absolute right-0 top-full mt-2 w-80 p-3.5 rounded-2xl bg-slate-900 text-white dark:bg-slate-950 border border-slate-700 shadow-2xl z-40 text-xs space-y-1.5 animate-in fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                <span className="font-bold text-sky-400">Règle de gestion</span>
                <button onClick={() => setShowRuleTooltip(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Tous les achats du mois sur commandes d'achat &ge; 500 € <code className="text-amber-400 font-mono">(Montant commandé - Montant déjà facturé)</code>. Les achats &lt; 500 € ou 100% facturés sont exclus.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-xs">
          {error}
        </div>
      )}

      {/* Discrete Inspection Drawer */}
      {showDetailsToggle && data?.records && data.records.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer transition-colors"
          >
            {showDetails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span>
              {showDetails ? "Masquer le détail des commandes d'achat" : `Consulter le détail des commandes d'achat (${data.records.length} commandes éligibles)`}
            </span>
          </button>

          {showDetails && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3.5 py-3">Commande Achat</th>
                    <th className="px-3.5 py-3">Fournisseur</th>
                    <th className="px-3.5 py-3">Date Commande</th>
                    <th className="px-3.5 py-3 text-right">Total Commande</th>
                    <th className="px-3.5 py-3">Affaire / Compte Analytique</th>
                    <th className="px-3.5 py-3 text-right">Non Facturé (€ HT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {data.records.map(r => (
                    <tr key={r.orderId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="px-3.5 py-3.5 font-mono font-semibold text-sky-500 dark:text-sky-400">
                        {r.orderName}
                      </td>
                      <td className="px-3.5 py-3.5 max-w-[200px] truncate">{r.partnerName}</td>
                      <td className="px-3.5 py-3.5 text-[11px] text-slate-400 font-mono">
                        {r.dateOrder ? r.dateOrder.slice(0, 10) : '-'}
                      </td>
                      <td className="px-3.5 py-3.5 font-mono font-semibold text-right">
                        {formatEuro(r.amountTotal)}
                      </td>
                      <td className="px-3.5 py-3.5 text-[11px] text-slate-400 truncate max-w-[200px]">
                        {r.saleOrderName ? (
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{r.saleOrderName} - </span>
                        ) : null}
                        {r.analyticAccountName || (r.analyticAccountId ? `Compte #${r.analyticAccountId}` : 'Général')}
                      </td>
                      <td className="px-3.5 py-3.5 text-right font-mono font-bold text-amber-500">
                        {formatEuro(r.pendingPurchasesUntaxed)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-bold border-t border-slate-200 dark:border-slate-800">
                  <tr>
                    <td colSpan={5} className="px-3.5 py-3 text-right text-slate-700 dark:text-slate-200">
                      Total Achats en Cours ({selectedMonthLabel}) :
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono text-amber-500">
                      {formatEuro(totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
