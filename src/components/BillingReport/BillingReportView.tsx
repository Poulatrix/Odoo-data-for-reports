import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  Euro, 
  FileText, 
  ExternalLink, 
  RefreshCw, 
  Download, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Building2, 
  ShoppingCart, 
  Tag, 
  Layers, 
  Sparkles, 
  ChevronRight,
  Info
} from 'lucide-react';
import { 
  OdooConnectionCredentials, 
  MonthlyBillingSummaryItem, 
  InvoicedDossierItem, 
  BillingReportSummary, 
  BillingReportResponse 
} from '../../types/odoo';
import { odooClient } from '../../services/odooClient';

interface BillingReportViewProps {
  credentials: OdooConnectionCredentials | null;
  isDemo?: boolean;
  onNavigateHome?: () => void;
}

export const BillingReportView: React.FC<BillingReportViewProps> = ({
  credentials,
  isDemo = false,
  onNavigateHome
}) => {
  const [data, setData] = useState<BillingReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('all'); // 'all' or '2026-08', etc.
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'sale' | 'purchase'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'paid' | 'not_paid' | 'partial'>('all');
  const [hoveredMonth, setHoveredMonth] = useState<MonthlyBillingSummaryItem | null>(null);

  const loadData = async (forceRefresh: boolean = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await odooClient.getBillingReport({
        forceRefresh,
        credentials: credentials || undefined,
        isDemo
      });

      if (res.success) {
        setData(res);
        // By default select the most recent month if not yet set
        if (selectedMonthKey === 'all' && res.monthlySummaries.length > 0) {
          // Keep 'all' or auto-select latest
        }
      } else {
        setError(res.error || 'Erreur lors du chargement du bilan de facturation.');
      }
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le serveur Odoo.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [credentials, isDemo]);

  // Number / Currency Formatter
  const formatEuros = (val: number, showSign: boolean = false) => {
    const formatted = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    }).format(Math.abs(val));

    if (showSign && val > 0) return `+${formatted}`;
    if (val < 0) return `-${formatted}`;
    return formatted;
  };

  // Filtered Dossiers List
  const filteredDossiers = useMemo(() => {
    if (!data?.dossiers) return [];

    return data.dossiers.filter((item) => {
      // Month filter
      if (selectedMonthKey !== 'all' && item.monthKey !== selectedMonthKey) {
        return false;
      }

      // Category filter (sale vs purchase)
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }

      // Payment Status filter
      if (paymentStatusFilter !== 'all') {
        if (paymentStatusFilter === 'paid' && item.paymentState !== 'paid') return false;
        if (paymentStatusFilter === 'not_paid' && item.paymentState !== 'not_paid') return false;
        if (paymentStatusFilter === 'partial' && item.paymentState !== 'partial') return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesDossier = item.dossierRef.toLowerCase().includes(q);
        const matchesPartner = item.partnerName.toLowerCase().includes(q);
        const matchesRef = item.clientOrderRef?.toLowerCase().includes(q) || false;
        if (!matchesName && !matchesDossier && !matchesPartner && !matchesRef) {
          return false;
        }
      }

      return true;
    });
  }, [data, selectedMonthKey, categoryFilter, paymentStatusFilter, searchQuery]);

  // Stats for currently selected month or global
  const activeStats = useMemo(() => {
    if (!data) {
      return {
        salesUntaxed: 0,
        purchasesUntaxed: 0,
        netMargin: 0,
        marginRate: 0,
        salesCount: 0,
        purchasesCount: 0,
        totalCount: 0
      };
    }

    if (selectedMonthKey === 'all') {
      return {
        salesUntaxed: data.summary.totalSalesUntaxed,
        purchasesUntaxed: data.summary.totalPurchasesUntaxed,
        netMargin: data.summary.totalNetMarginUntaxed,
        marginRate: data.summary.overallMarginRate,
        salesCount: data.summary.totalSalesInvoicesCount,
        purchasesCount: data.summary.totalPurchasesBillsCount,
        totalCount: data.summary.totalDossiersCount
      };
    }

    const monthItem = data.monthlySummaries.find(m => m.monthKey === selectedMonthKey);
    if (monthItem) {
      return {
        salesUntaxed: monthItem.salesUntaxed,
        purchasesUntaxed: monthItem.purchasesUntaxed,
        netMargin: monthItem.netMarginUntaxed,
        marginRate: monthItem.marginRate,
        salesCount: monthItem.salesCount,
        purchasesCount: monthItem.purchasesCount,
        totalCount: monthItem.salesCount + monthItem.purchasesCount
      };
    }

    return {
      salesUntaxed: 0,
      purchasesUntaxed: 0,
      netMargin: 0,
      marginRate: 0,
      salesCount: 0,
      purchasesCount: 0,
      totalCount: 0
    };
  }, [data, selectedMonthKey]);

  // Export CSV
  const handleExportCSV = () => {
    if (!data) return;

    const headers = [
      'Type',
      'N° Pièce Facture',
      'N° Dossier / Commande',
      'Réf Client',
      'Partenaire (Client / Fournisseur)',
      'Date Facture',
      'Date Échéance',
      'Mois',
      'Montant HT (€)',
      'Montant TVA (€)',
      'Montant TTC (€)',
      'Statut Paiement',
      'Commercial'
    ];

    const rows = filteredDossiers.map(d => [
      d.category === 'sale' ? 'Vente (Client)' : 'Achat (Fournisseur)',
      `"${d.name.replace(/"/g, '""')}"`,
      `"${d.dossierRef.replace(/"/g, '""')}"`,
      `"${(d.clientOrderRef || '').replace(/"/g, '""')}"`,
      `"${d.partnerName.replace(/"/g, '""')}"`,
      d.invoiceDate,
      d.dueDate || '',
      d.monthKey,
      d.amountUntaxed.toFixed(2),
      d.amountTax.toFixed(2),
      d.amountTotal.toFixed(2),
      d.paymentState === 'paid' ? 'Payé' : d.paymentState === 'not_paid' ? 'Non payé' : 'Partiel',
      `"${(d.commercialUser || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `bilan_facturation_dossiers_${selectedMonthKey}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculation for the SVG Chart
  const chartData = useMemo(() => {
    if (!data?.monthlySummaries || data.monthlySummaries.length === 0) return [];
    return data.monthlySummaries;
  }, [data]);

  const maxVal = useMemo(() => {
    if (chartData.length === 0) return 100000;
    const maxSales = Math.max(...chartData.map(d => d.salesUntaxed), 0);
    const maxPurchases = Math.max(...chartData.map(d => d.purchasesUntaxed), 0);
    const highest = Math.max(maxSales, maxPurchases);
    // Round up to nice upper bound
    return Math.ceil((highest * 1.15) / 50000) * 50000 || 250000;
  }, [chartData]);

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Header Card */}
      <div className="bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="p-2.5 rounded-2xl bg-sky-500/10 text-sky-500 shadow-2xs">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>Bilan de Facturation</span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono">
                  Ventes & Achats
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 pl-11">
              Visualisation chronologique des dossiers facturés (clients & fournisseurs), récapitulatif mensuel des volumes HT et analyse de la marge nette.
            </p>
          </div>

          <div className="flex items-center space-x-2.5 shrink-0 self-end lg:self-center">
            <button
              onClick={() => loadData(true)}
              disabled={isLoading}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Rafraîchir les données de facturation"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={isLoading || filteredDossiers.length === 0}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              title="Exporter les dossiers affichés au format CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exporter CSV</span>
            </button>
          </div>
        </div>

        {/* Global Key Metrics Pills */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
            {/* Ventes HT */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Ventes Facturées HT
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-sky-500" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
                {formatEuros(activeStats.salesUntaxed)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {activeStats.salesCount} factures clients ({selectedMonthKey === 'all' ? 'Toutes périodes' : selectedMonthKey})
              </p>
            </div>

            {/* Achats HT */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Achats Facturés HT
                </span>
                <ArrowDownRight className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
                {formatEuros(activeStats.purchasesUntaxed)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {activeStats.purchasesCount} factures fournisseurs
              </p>
            </div>

            {/* Marge Nette HT */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Marge Nette Facturée
                </span>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-500 mt-1 tabular-nums">
                {formatEuros(activeStats.netMargin, true)}
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                Taux de marge : {activeStats.marginRate.toFixed(1)} %
              </p>
            </div>

            {/* Dossiers / Pièces */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Total Dossiers & Pièces
                </span>
                <FileText className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
                {activeStats.totalCount} dossiers
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {activeStats.salesCount} ventes • {activeStats.purchasesCount} achats
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-10 h-10 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Calcul et consolidation du bilan de facturation Odoo...
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Extraction des pièces comptables clients et fournisseurs validées.
          </p>
        </div>
      )}

      {error && !isLoading && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 text-rose-800 dark:text-rose-300 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold">Impossible de charger le bilan de facturation</h4>
            <p className="text-xs">{error}</p>
            <button
              onClick={() => loadData(true)}
              className="mt-2 px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        </div>
      )}

      {!isLoading && data && (
        <>
          {/* SECTION GRAPHIQUE INTERACTIF : MOIS EN ABSCISSE, EUROS EN ORDONNÉES */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800 gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-sky-500" />
                  <span>Évolution Mensuelle : Ventes vs Achats vs Marge</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  En abscisse : Les mois • En ordonnées : Montants en Euros (€ HT). Cliquez sur un mois pour filtrer les dossiers correspondants.
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center flex-wrap gap-3 text-xs font-medium">
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded-xs bg-sky-500 inline-block shadow-xs"></span>
                  <span className="text-slate-700 dark:text-slate-300">Ventes Facturées (€ HT)</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block shadow-xs"></span>
                  <span className="text-slate-700 dark:text-slate-300">Achats Facturés (€ HT)</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-xs"></span>
                  <span className="text-slate-700 dark:text-slate-300">Marge Nette (€ HT)</span>
                </div>
              </div>
            </div>

            {/* SVG Interactive Chart */}
            <div className="w-full overflow-x-auto no-scrollbar pt-2 pb-4">
              <div className="min-w-[650px] h-72 relative flex flex-col justify-end">
                
                {/* Horizontal grid lines with Euro labels (Ordonnées) */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[10px] font-mono text-slate-400 dark:text-slate-600 pb-8 pl-14">
                  {[1, 0.75, 0.5, 0.25, 0].map((ratio) => {
                    const euroLevel = Math.round(maxVal * ratio);
                    return (
                      <div key={ratio} className="w-full flex items-center relative">
                        <span className="absolute -left-14 w-12 text-right pr-2">
                          {euroLevel >= 1000 ? `${Math.round(euroLevel / 1000)}k€` : `${euroLevel}€`}
                        </span>
                        <div className="w-full border-b border-slate-100 dark:border-slate-800/80"></div>
                      </div>
                    );
                  })}
                </div>

                {/* Bars & Points Container */}
                <div className="relative z-10 pl-14 pr-4 h-[230px] flex items-end justify-between gap-2 sm:gap-4">
                  {chartData.map((m) => {
                    const salesHeight = Math.max((m.salesUntaxed / maxVal) * 100, 2);
                    const purchasesHeight = Math.max((m.purchasesUntaxed / maxVal) * 100, 2);
                    const marginHeight = Math.max((m.netMarginUntaxed / maxVal) * 100, 2);
                    const isSelected = selectedMonthKey === m.monthKey;
                    const isHovered = hoveredMonth?.monthKey === m.monthKey;

                    return (
                      <div 
                        key={m.monthKey}
                        onClick={() => setSelectedMonthKey(isSelected ? 'all' : m.monthKey)}
                        onMouseEnter={() => setHoveredMonth(m)}
                        onMouseLeave={() => setHoveredMonth(null)}
                        className={`flex-1 flex flex-col items-center h-full justify-end group cursor-pointer transition-all duration-200 relative ${
                          isSelected ? 'scale-[1.02]' : ''
                        }`}
                      >
                        {/* Hover Tooltip */}
                        {isHovered && (
                          <div className="absolute -top-24 z-30 bg-slate-900 text-white rounded-xl p-2.5 shadow-xl border border-slate-700 text-xs pointer-events-none whitespace-nowrap">
                            <div className="font-bold border-b border-slate-700 pb-1 mb-1 text-blue-300">
                              {m.monthLabel}
                            </div>
                            <div className="flex items-center justify-between gap-4 text-[11px]">
                              <span className="text-slate-300">Ventes :</span>
                              <span className="font-mono font-bold text-white">{formatEuros(m.salesUntaxed)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-[11px]">
                              <span className="text-amber-300">Achats :</span>
                              <span className="font-mono font-bold text-amber-200">{formatEuros(m.purchasesUntaxed)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-[11px]">
                              <span className="text-emerald-300">Marge :</span>
                              <span className="font-mono font-bold text-emerald-300">{formatEuros(m.netMarginUntaxed)} ({m.marginRate}%)</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 italic">
                              Cliquer pour filtrer les {m.salesCount + m.purchasesCount} dossiers
                            </div>
                          </div>
                        )}

                        {/* Top Margin Dot Indicator */}
                        <div 
                          className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 shadow-xs absolute transition-all duration-300 z-20"
                          style={{ bottom: `calc(${marginHeight}% - 4px)` }}
                          title={`Marge : ${formatEuros(m.netMarginUntaxed)} (${m.marginRate}%)`}
                        />

                        {/* Grouped Bars: Ventes & Achats */}
                        <div className="w-full flex items-end justify-center gap-1.5 h-full px-1">
                          
                          {/* Ventes Bar */}
                          <div 
                            className={`w-1/2 max-w-[28px] rounded-t-md transition-all duration-300 relative ${
                              isSelected
                                ? 'bg-sky-400 ring-2 ring-sky-300 shadow-md'
                                : 'bg-sky-500 hover:brightness-110'
                            }`}
                            style={{ height: `${salesHeight}%` }}
                          >
                            <span className="sr-only">Ventes {formatEuros(m.salesUntaxed)}</span>
                          </div>

                          {/* Achats Bar (Amber / Orange) */}
                          <div 
                            className={`w-1/2 max-w-[28px] rounded-t-md transition-all duration-300 relative ${
                              isSelected
                                ? 'bg-amber-600 ring-2 ring-amber-400 shadow-md'
                                : 'bg-amber-500 hover:brightness-110'
                            }`}
                            style={{ height: `${purchasesHeight}%` }}
                          >
                            <span className="sr-only">Achats {formatEuros(m.purchasesUntaxed)}</span>
                          </div>
                        </div>

                        {/* Month Label (Abscisse) */}
                        <div className="mt-2 text-center">
                          <span className={`text-[11px] font-semibold whitespace-nowrap block ${
                            isSelected 
                              ? 'text-sky-500 dark:text-sky-400 font-bold underline' 
                              : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white'
                          }`}>
                            {m.shortLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Quick helper message */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  Filtre actif : {selectedMonthKey === 'all' ? 'Toutes les périodes consolidées' : `Mois sélectionné : ${data.monthlySummaries.find(m => m.monthKey === selectedMonthKey)?.monthLabel || selectedMonthKey}`}
                </span>
              </span>
              {selectedMonthKey !== 'all' && (
                <button
                  onClick={() => setSelectedMonthKey('all')}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Réinitialiser (Tout afficher)
                </button>
              )}
            </div>
          </div>

          {/* TABLEAU RÉSUMÉ PAR MOIS */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-500" />
                  <span>Synthèse Mensuelle des Ventes et des Achats</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Détail mois par mois des volumes facturés, du nombre de dossiers et de la marge dégagée.
                </p>
              </div>
              <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
                {data.monthlySummaries.length} mois consolidés
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-400 dark:text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Mois</th>
                    <th className="py-3 px-4 text-center">Dossiers Ventes</th>
                    <th className="py-3 px-4 text-right">Ventes (€ HT)</th>
                    <th className="py-3 px-4 text-center">Dossiers Achats</th>
                    <th className="py-3 px-4 text-right">Achats (€ HT)</th>
                    <th className="py-3 px-4 text-right">Marge Nette (€ HT)</th>
                    <th className="py-3 px-4 text-center">Taux Marge</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.monthlySummaries.map((m) => {
                    const isSelected = selectedMonthKey === m.monthKey;
                    return (
                      <tr 
                        key={m.monthKey}
                        onClick={() => setSelectedMonthKey(isSelected ? 'all' : m.monthKey)}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50/80 dark:bg-blue-950/40 font-medium'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                          <span>{m.monthLabel}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            {m.salesCount} factures ({m.salesDossiersCount} dossiers)
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatEuros(m.salesUntaxed)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            {m.purchasesCount} factures ({m.purchasesDossiersCount} dossiers)
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-900 dark:text-amber-300">
                          {formatEuros(m.purchasesUntaxed)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 dark:text-emerald-300">
                          {formatEuros(m.netMarginUntaxed, true)}
                        </td>
                        <td className="py-3 px-4 text-center font-bold">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                            m.marginRate >= 50
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}>
                            {m.marginRate.toFixed(1)} %
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMonthKey(isSelected ? 'all' : m.monthKey);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                            }`}
                          >
                            {isSelected ? 'Actif' : 'Filtrer'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100/90 dark:bg-slate-950/80 font-bold border-t-2 border-slate-300 dark:border-slate-700">
                  <tr>
                    <td className="py-3 px-4 text-slate-900 dark:text-white">TOTAL CONSOLIDÉ</td>
                    <td className="py-3 px-4 text-center text-blue-700 dark:text-blue-300">
                      {data.summary.totalSalesInvoicesCount} factures
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-white">
                      {formatEuros(data.summary.totalSalesUntaxed)}
                    </td>
                    <td className="py-3 px-4 text-center text-amber-700 dark:text-amber-300">
                      {data.summary.totalPurchasesBillsCount} factures
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-amber-900 dark:text-amber-300">
                      {formatEuros(data.summary.totalPurchasesUntaxed)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-700 dark:text-emerald-300">
                      {formatEuros(data.summary.totalNetMarginUntaxed, true)}
                    </td>
                    <td className="py-3 px-4 text-center text-emerald-700 dark:text-emerald-300">
                      {data.summary.overallMarginRate.toFixed(1)} %
                    </td>
                    <td className="py-3 px-4 text-center text-slate-500">
                      {data.summary.totalDossiersCount} dossiers
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* SECTION DÉTAIL DES DOSSIERS FACTURÉS DURANT LE MOIS */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-5 space-y-4">
            
            {/* Header & Filter Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-500" />
                  <span>Détail des Dossiers Facturés</span>
                  {selectedMonthKey !== 'all' && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      {data.monthlySummaries.find(m => m.monthKey === selectedMonthKey)?.monthLabel || selectedMonthKey}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Liste des pièces comptables et dossiers facturés correspondants (ventes clients et achats fournisseurs).
                </p>
              </div>

              {/* Month Selector Dropdown / Pills */}
              <div className="flex items-center flex-wrap gap-2">
                <select
                  value={selectedMonthKey}
                  onChange={(e) => setSelectedMonthKey(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <option value="all">📅 Tous les mois ({data.summary.totalDossiersCount} dossiers)</option>
                  {data.monthlySummaries.map((m) => (
                    <option key={m.monthKey} value={m.monthKey}>
                      {m.monthLabel} ({m.salesCount + m.purchasesCount} pièces)
                    </option>
                  ))}
                </select>

                {/* Category Pills (Ventes / Achats / Tout) */}
                <div className="inline-flex rounded-xl p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      categoryFilter === 'all'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Tout ({filteredDossiers.length})
                  </button>
                  <button
                    onClick={() => setCategoryFilter('sale')}
                    className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      categoryFilter === 'sale'
                        ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    🟢 Ventes
                  </button>
                  <button
                    onClick={() => setCategoryFilter('purchase')}
                    className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      categoryFilter === 'purchase'
                        ? 'bg-amber-600 text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    🟠 Achats
                  </button>
                </div>
              </div>
            </div>

            {/* Search and Payment Filter Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Rechercher un dossier, client, facture..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center space-x-2 text-xs self-start sm:self-auto">
                <span className="text-slate-500 font-medium">Statut paiement :</span>
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="paid">Payé uniquement</option>
                  <option value="not_paid">Non payé</option>
                  <option value="partial">Partiel</option>
                </select>
              </div>
            </div>

            {/* Dossiers Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-400 dark:text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-3.5">Type</th>
                    <th className="py-3 px-3.5">N° Pièce Odoo</th>
                    <th className="py-3 px-3.5">Dossier / Commande</th>
                    <th className="py-3 px-3.5">Partenaire (Client / Fournisseur)</th>
                    <th className="py-3 px-3.5">Date Facture</th>
                    <th className="py-3 px-3.5 text-right">Montant HT</th>
                    <th className="py-3 px-3.5 text-right">Montant TTC</th>
                    <th className="py-3 px-3.5 text-center">Paiement</th>
                    <th className="py-3 px-3.5 text-center">Lien Odoo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredDossiers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Aucun dossier facturé ne correspond aux filtres sélectionnés.
                      </td>
                    </tr>
                  ) : (
                    filteredDossiers.map((d) => {
                      const isSale = d.category === 'sale';
                      const isRefund = d.moveType.includes('refund');

                      return (
                        <tr 
                          key={d.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Type */}
                          <td className="py-3.5 px-3.5 whitespace-nowrap">
                            <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              isRefund
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : isSale
                                ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                isRefund ? 'bg-rose-500' : isSale ? 'bg-sky-500' : 'bg-amber-500'
                              }`} />
                              <span>{isRefund ? 'Avoir' : isSale ? 'Vente' : 'Achat'}</span>
                            </span>
                          </td>

                          {/* N° Pièce Facture */}
                          <td className="py-3.5 px-3.5 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {d.name}
                          </td>

                          {/* Dossier / Commande */}
                          <td className="py-3.5 px-3.5 whitespace-nowrap">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {d.dossierRef}
                              </span>
                              {d.clientOrderRef && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                                  {d.clientOrderRef}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Partenaire */}
                          <td className="py-3.5 px-3.5 text-slate-800 dark:text-slate-200 max-w-[220px] truncate" title={d.partnerName}>
                            {d.partnerName}
                          </td>

                          {/* Date Facture */}
                          <td className="py-3.5 px-3.5 text-slate-400 dark:text-slate-500 whitespace-nowrap font-mono text-[11px]">
                            {d.invoiceDate}
                          </td>

                          {/* Montant HT */}
                          <td className="py-3.5 px-3.5 text-right font-mono font-bold whitespace-nowrap tabular-nums">
                            <span className={isSale ? 'text-sky-500 dark:text-sky-400' : 'text-amber-500'}>
                              {formatEuros(d.amountUntaxed)}
                            </span>
                          </td>

                          {/* Montant TTC */}
                          <td className="py-3.5 px-3.5 text-right font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap tabular-nums">
                            {formatEuros(d.amountTotal)}
                          </td>

                          {/* Paiement */}
                          <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                              d.paymentState === 'paid'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : d.paymentState === 'not_paid'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                d.paymentState === 'paid' ? 'bg-emerald-500' : d.paymentState === 'not_paid' ? 'bg-rose-500' : 'bg-amber-500'
                              }`} />
                              <span>{d.paymentState === 'paid' ? 'Payé' : d.paymentState === 'not_paid' ? 'Non payé' : 'Partiel'}</span>
                            </span>
                          </td>

                          {/* Lien direct Odoo */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {d.odooInvoiceUrl ? (
                              <a
                                href={d.odooInvoiceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-sky-500 hover:text-white text-slate-700 dark:text-slate-300 transition-colors text-[10px] font-medium"
                                title="Ouvrir la facture directement sur Odoo"
                              >
                                <span>Ouvrir</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination / Total count summary */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2">
              <span>
                Affichage de <strong>{filteredDossiers.length}</strong> dossier(s) facturé(s)
              </span>
              <span className="font-mono">
                Total HT affiché : {formatEuros(filteredDossiers.reduce((acc, d) => acc + d.amountUntaxed, 0))}
              </span>
            </div>
          </div>
        </>
      )}

    </div>
  );
};
