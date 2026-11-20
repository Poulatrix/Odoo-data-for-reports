import React, { useState, useEffect, useMemo } from 'react';
import { 
  Receipt,
  FileSpreadsheet,
  Calendar,
  Euro,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Search,
  SlidersHorizontal,
  PackageMinus,
  Sparkles,
  TrendingUp,
  FileText,
  Building2,
  CheckCircle2,
  ShoppingCart,
  Layers,
  HelpCircle,
  X,
  Clock
} from 'lucide-react';
import { 
  OdooConnectionCredentials, 
  WipOutflowInvoiceItem, 
  WipOutflowReportResponse, 
  WipPurchaseDetailItem 
} from '../../types/odoo';
import { odooClient } from '../../services/odooClient';
import { exportWipPurchasesOutflowToExcel } from '../../utils/exportUtils';
import { WipPurchasesInflowWidget } from '../WipPurchasesInflow/WipPurchasesInflowWidget';

interface WipPurchasesOutflowViewProps {
  credentials: OdooConnectionCredentials | null;
  isDemo: boolean;
  onNavigateHome?: () => void;
}

export const WipPurchasesOutflowView: React.FC<WipPurchasesOutflowViewProps> = ({
  credentials,
  isDemo
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<WipOutflowReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Month selection state (defaults to '2026-09' or current available)
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('2026-09');

  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Expandable row state (Set of invoice IDs)
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<number>>(new Set());

  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Load report data
  const loadData = async (forceRefresh: boolean = false, targetMonth?: string) => {
    setLoading(true);
    setError(null);
    try {
      const monthToLoad = targetMonth || selectedMonthKey;
      const res = await odooClient.getWipPurchasesOutflowReport({
        monthKey: monthToLoad,
        forceRefresh,
        credentials: credentials || undefined,
        isDemo
      });

      if (res.success) {
        setData(res);
        if (res.summary.selectedMonthKey && res.summary.selectedMonthKey !== selectedMonthKey) {
          setSelectedMonthKey(res.summary.selectedMonthKey);
        }
      } else {
        setError(res.error || 'Erreur lors du calcul des sorties d\'encours achats.');
      }
    } catch (err: any) {
      setError(err.message || 'Impossible de contacter le serveur Odoo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false, selectedMonthKey);
  }, [selectedMonthKey, isDemo]);

  // Toggle expanded row
  const toggleRow = (invoiceId: number) => {
    setExpandedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(invoiceId)) {
        next.delete(invoiceId);
      } else {
        next.add(invoiceId);
      }
      return next;
    });
  };

  // Expand or collapse all
  const toggleExpandAll = () => {
    if (!data?.records) return;
    if (expandedInvoiceIds.size === data.records.length) {
      setExpandedInvoiceIds(new Set());
    } else {
      setExpandedInvoiceIds(new Set(data.records.map(r => r.id)));
    }
  };

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

  // Règle métier stricte : exclusion formelle des références commençant par FV ou ODMEN
  const isExcludedPieceRef = (refStr: string | undefined | null): boolean => {
    if (!refStr) return false;
    const clean = String(refStr).trim().toUpperCase();
    return clean.startsWith('FV') || clean.startsWith('ODMEN') || /^(FV|ODMEN)[\/\-_ \d]/i.test(clean);
  };

  // Sanitized records : garantit qu'aucune pièce d'achat ne commence par FV ou ODMEN
  const sanitizedRecords = useMemo(() => {
    if (!data?.records) return [];
    return data.records.map(r => {
      const validPieces = (r.purchaseDetails || []).filter(p => !isExcludedPieceRef(p.reference));
      const attachedPurchasesUntaxed = Math.round(validPieces.reduce((sum, p) => sum + p.amountUntaxed, 0) * 100) / 100;
      const grossMarginUntaxed = Math.round((r.invoicedSalesUntaxed - attachedPurchasesUntaxed) * 100) / 100;
      const grossMarginRate = r.invoicedSalesUntaxed > 0 ? (grossMarginUntaxed / r.invoicedSalesUntaxed) * 100 : 0;
      return {
        ...r,
        purchaseDetails: validPieces,
        purchasesCount: validPieces.length,
        attachedPurchasesUntaxed,
        grossMarginUntaxed,
        grossMarginRate
      };
    });
  }, [data?.records]);

  // Filtered records based on search query
  const filteredRecords = useMemo(() => {
    if (!sanitizedRecords.length) return [];
    if (!searchQuery.trim()) return sanitizedRecords;
    const q = searchQuery.toLowerCase().trim();
    return sanitizedRecords.filter(r => 
      r.invoiceNumber.toLowerCase().includes(q) ||
      r.saleOrderName.toLowerCase().includes(q) ||
      r.partnerName.toLowerCase().includes(q) ||
      (r.clientOrderRef && r.clientOrderRef.toLowerCase().includes(q)) ||
      (r.analyticAccountName && r.analyticAccountName.toLowerCase().includes(q))
    );
  }, [sanitizedRecords, searchQuery]);

  // Recalculate summary on filtered records
  const filteredTotals = useMemo(() => {
    const sales = Math.round(filteredRecords.reduce((s, r) => s + r.invoicedSalesUntaxed, 0) * 100) / 100;
    const purchases = Math.round(filteredRecords.reduce((s, r) => s + r.attachedPurchasesUntaxed, 0) * 100) / 100;
    const margin = Math.round((sales - purchases) * 100) / 100;
    const rate = sales > 0 ? Math.round((margin / sales) * 1000) / 10 : 0;
    const totalPieces = filteredRecords.reduce((s, r) => s + r.purchasesCount, 0);
    return { sales, purchases, margin, rate, totalPieces };
  }, [filteredRecords]);

  // Handle Excel export
  const handleExportExcel = async () => {
    if (!data) return;
    setIsExporting(true);
    try {
      await exportWipPurchasesOutflowToExcel({
        records: filteredRecords,
        summary: data.summary,
        filename: `Sorties_Encours_Achats_${selectedMonthKey}.xlsx`
      });
    } catch (err) {
      console.error('Erreur export Excel:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const availableMonths = data?.summary.availableMonths || [];
  const selectedMonthLabel = data?.summary.selectedMonthLabel || selectedMonthKey;

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 shadow-2xs">
              <PackageMinus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Sorties d'Encours Achats
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
                  Ventes Facturées
                </span>
                {isDemo && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    Démo Live
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Suivi mensuel des achats et sous-traitances rattachés aux affaires facturées aux clients (sortie de l'en-cours de production)
              </p>
            </div>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <button
            onClick={() => loadData(true)}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-60"
            title="Rafraîchir les données depuis Odoo"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-500' : 'text-slate-400'}`} />
            <span>Actualiser</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={loading || isExporting || !filteredRecords.length}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            title="Télécharger le classeur Excel (.xlsx) avec synthèse et détail par pièce"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Génération...' : "Exporter (Excel)"}</span>
          </button>
        </div>
      </div>

      {/* 1. SÉLECTEUR DE PÉRIODE (UI EXPLICITE : [ Septembre 2026 | Août 2026 | Choisir un mois ]) */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Calendar className="w-4 h-4 text-sky-500" />
            <span>Mois de facturation client :</span>
          </div>

          {/* Quick preset buttons for recent months */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setSelectedMonthKey('2026-09')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                selectedMonthKey === '2026-09'
                  ? 'bg-sky-500 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Septembre 2026
            </button>

            <button
              type="button"
              onClick={() => setSelectedMonthKey('2026-08')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                selectedMonthKey === '2026-08'
                  ? 'bg-sky-500 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Août 2026
            </button>

            <button
              type="button"
              onClick={() => setSelectedMonthKey('2026-07')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                selectedMonthKey === '2026-07'
                  ? 'bg-sky-500 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Juillet 2026
            </button>
          </div>

          {/* Dropdown "Choisir un mois" */}
          <div className="relative">
            <select
              value={selectedMonthKey}
              onChange={(e) => setSelectedMonthKey(e.target.value)}
              className="pl-3 pr-8 py-1.5 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer appearance-none"
            >
              <option value="" disabled>Choisir un mois...</option>
              {availableMonths.map(m => (
                <option key={m.monthKey} value={m.monthKey}>
                  {m.monthLabel} ({m.invoicesCount} facture{m.invoicesCount > 1 ? 's' : ''})
                </option>
              ))}
              {/* Fallback months if list is empty */}
              {availableMonths.length === 0 && (
                <>
                  <option value="2026-09">Septembre 2026</option>
                  <option value="2026-08">Août 2026</option>
                  <option value="2026-07">Juillet 2026</option>
                  <option value="2026-06">Juin 2026</option>
                </>
              )}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Sélecteur de mois personnalisé (input HTML5) */}
          <div className="flex items-center space-x-1.5 pl-1 border-l border-slate-200 dark:border-slate-800">
            <input
              type="month"
              value={selectedMonthKey}
              onChange={(e) => e.target.value && setSelectedMonthKey(e.target.value)}
              className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
              title="Sélectionner un mois/année spécifique dans le calendrier"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Période active : <strong className="text-slate-900 dark:text-white">{selectedMonthLabel}</strong></span>
        </div>
      </div>

      {/* 2. NOUVEAU RAPPORT / WIDGET : AUGMENTATION DE L'ENCOURS (ACHATS ENGAGÉS NON FACTURÉS DU MOIS) */}
      <WipPurchasesInflowWidget
        credentials={credentials}
        isDemo={isDemo}
        selectedMonthKey={selectedMonthKey}
        onMonthChange={(newMonth) => setSelectedMonthKey(newMonth)}
        variant="banner"
      />

      {/* 3. KPI BENTO CARDS : SORTIES D'ENCOURS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Vente Facturée Client */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-sky-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Ventes Facturées</span>
            <div className="p-1.5 rounded-xl bg-sky-500/10 text-sky-500">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
            {formatEuro(filteredTotals.sales)}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Sur <strong className="text-slate-700 dark:text-slate-200">{filteredRecords.length}</strong> facture(s) émise(s)
          </p>
        </div>

        {/* Card 2: Total Achats Sortis de l'Encours */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-amber-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span>Sorties d'Encours Achats</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            </span>
            <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-500">
              <PackageMinus className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight font-mono text-amber-500 mt-1 tabular-nums">
            {formatEuro(filteredTotals.purchases)}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Coût d'achat débouclé ({filteredTotals.totalPieces} pièces fournisseurs)
          </p>
        </div>

        {/* Card 3: Marge Brute Sortie (€ HT) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-emerald-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Marge Brute Sortie</span>
            <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-500">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl sm:text-2xl font-extrabold tracking-tight font-mono mt-1 tabular-nums ${
            filteredTotals.margin >= 0 ? 'text-emerald-500' : 'text-rose-500'
          }`}>
            {formatEuro(filteredTotals.margin)}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Ventes HT - Achats rattachés
          </p>
        </div>

        {/* Card 4: Taux de Marge Réalisé (%) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-indigo-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Taux de Marge Réalisé</span>
            <div className="p-1.5 rounded-xl bg-violet-500/10 text-violet-500">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight font-mono text-violet-500 mt-1 tabular-nums">
            {filteredTotals.rate.toFixed(1)}%
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Rentabilité des affaires facturées
          </p>
        </div>

      </div>

      {/* Search Bar & Table Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            placeholder="Filtrer par N° facture, affaire SO, client, réf..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={toggleExpandAll}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs cursor-pointer"
          >
            {expandedInvoiceIds.size === filteredRecords.length ? 'Tout replier' : 'Tout déplier'}
          </button>

          <span className="text-xs text-slate-500 dark:text-slate-400">
            <strong>{filteredRecords.length}</strong> facture(s) client
          </span>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => loadData(true)}
            className="underline font-semibold cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="p-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center space-y-3">
          <RefreshCw className="w-6 h-6 text-slate-500 animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Analyse des factures clients et extraction des sorties d'encours achats...
          </p>
          <p className="text-xs text-slate-400">
            Rapprochement des commandes de vente et des comptes analytiques rattachés pour {selectedMonthLabel}.
          </p>
        </div>
      )}

      {/* 3. TABLEAU SYNTHÉTIQUE ET DÉTAIL DÉPLIABLE */}
      {(!loading || data) && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-850 border-b border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                  <th className="py-3 px-3 w-8 text-center"></th>
                  <th className="py-3 px-3">N° Facture Client</th>
                  <th className="py-3 px-3">Date Facture</th>
                  <th className="py-3 px-3">Commande / Affaire</th>
                  <th className="py-3 px-3">Client</th>
                  <th className="py-3 px-3 text-right">Total Vente Facturée (€)</th>
                  <th className="py-3 px-3 text-right font-bold text-amber-700 dark:text-amber-400">
                    Total Achats Rattachés (€)
                  </th>
                  <th className="py-3 px-3 text-right">Marge Brute (€ / %)</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 text-xs">
                      Aucune facture client trouvée pour {selectedMonthLabel} correspondant aux critères.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((item) => {
                    const isExpanded = expandedInvoiceIds.has(item.id);
                    const isProfitable = item.grossMarginUntaxed >= 0;

                    return (
                      <React.Fragment key={item.id}>
                        {/* Parent Row : Facture Client */}
                        <tr 
                          onClick={() => toggleRow(item.id)}
                          className={`hover:bg-slate-50/70 dark:hover:bg-slate-850/60 transition-colors cursor-pointer ${
                            isExpanded ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRow(item.id);
                              }}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                              title={isExpanded ? 'Replier le détail des achats' : 'Déplier le détail des achats'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          </td>

                          {/* N° Facture Client */}
                          <td className="py-3 px-3 font-semibold text-blue-600 dark:text-blue-400 font-mono">
                            <div className="flex items-center space-x-1.5">
                              <span>{item.invoiceNumber}</span>
                              {item.odooInvoiceUrl && (
                                <a
                                  href={item.odooInvoiceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                  title="Ouvrir la facture client dans Odoo"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </td>

                          {/* Date Facture */}
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-mono">
                            {item.invoiceDate}
                          </td>

                          {/* Commande / Affaire */}
                          <td className="py-3 px-3">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {item.saleOrderName}
                              </span>
                              {item.odooOrderUrl && (
                                <a
                                  href={item.odooOrderUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                  title="Ouvrir la commande dans Odoo"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                            {item.projectName && (
                              <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium truncate max-w-[220px]" title={item.projectName}>
                                Projet : {item.projectName}
                              </div>
                            )}
                            {item.analyticAccountName && item.analyticAccountName !== item.projectName && (
                              <div className="text-[10px] text-slate-400 truncate max-w-[200px]" title={item.analyticAccountName}>
                                Compte : {item.analyticAccountName}
                              </div>
                            )}
                          </td>

                          {/* Client */}
                          <td className="py-3 px-3 text-slate-700 dark:text-slate-200">
                            <div className="font-medium truncate max-w-[220px]" title={item.partnerName}>
                              {item.partnerName}
                            </div>
                            {item.clientOrderRef && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                Réf : {item.clientOrderRef}
                              </div>
                            )}
                          </td>

                          {/* Total Vente Facturée (€) */}
                          <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                            {formatEuro(item.invoicedSalesUntaxed)}
                          </td>

                          {/* Total Achats Rattachés (€) */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                            {formatEuro(item.attachedPurchasesUntaxed)}
                            <div className="text-[10px] text-slate-400 font-sans font-normal">
                              {item.purchasesCount} pièce{item.purchasesCount > 1 ? 's' : ''}
                            </div>
                          </td>

                          {/* Marge Brute (€ / %) */}
                          <td className="py-3 px-3 text-right font-mono">
                            <span className={`font-semibold ${isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {formatEuro(item.grossMarginUntaxed)}
                            </span>
                            <div className={`text-[10px] font-medium ${isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                              {item.grossMarginRate.toFixed(1)}%
                            </div>
                          </td>

                          {/* Action */}
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRow(item.id);
                              }}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                              <span>{isExpanded ? 'Masquer' : 'Détail'}</span>
                              <span className="text-[10px] text-slate-400">({item.purchasesCount})</span>
                            </button>
                          </td>
                        </tr>

                        {/* Accordion Child Row : Détail des Factures & Bons de Commande Fournisseurs */}
                        {isExpanded && (
                          <tr className="bg-slate-50/60 dark:bg-slate-850/40 border-b border-slate-200/80 dark:border-slate-800">
                            <td colSpan={9} className="py-3 px-4 pl-12">
                              <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-2.5">
                                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                  <div className="flex items-center space-x-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                                    <ShoppingCart className="w-3.5 h-3.5 text-amber-500" />
                                    <span>
                                      Achats et coûts fournisseurs inclus dans la sortie d'encours pour l'affaire {item.saleOrderName}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-slate-400">
                                    Total achats dossier : <strong className="text-amber-600 dark:text-amber-400 font-mono">{formatEuro(item.attachedPurchasesUntaxed)}</strong>
                                  </span>
                                </div>

                                {item.purchaseDetails.length === 0 ? (
                                  <div className="py-4 text-center text-xs text-slate-400 italic">
                                    Aucun achat ou sous-traitance fournisseur spécifique rattaché à cette affaire.
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-[11px]">
                                      <thead>
                                        <tr className="text-slate-400 uppercase text-[10px] border-b border-slate-100 dark:border-slate-800">
                                          <th className="py-1.5 px-2">Type</th>
                                          <th className="py-1.5 px-2">Réf. Pièce</th>
                                          <th className="py-1.5 px-2">Fournisseur</th>
                                          <th className="py-1.5 px-2">Date</th>
                                          <th className="py-1.5 px-2">Description / Article</th>
                                          <th className="py-1.5 px-2 text-right">Montant HT (€)</th>
                                          <th className="py-1.5 px-2 text-center">Odoo</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                                        {item.purchaseDetails.map((piece, pIdx) => (
                                          <tr key={`${piece.id}_${pIdx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                            <td className="py-2 px-2">
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                piece.type === 'vendor_bill'
                                                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800'
                                                  : piece.type === 'purchase_order'
                                                  ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800'
                                                  : 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800'
                                              }`}>
                                                {piece.typeLabel}
                                              </span>
                                            </td>
                                            <td className="py-2 px-2 font-mono font-semibold text-slate-800 dark:text-slate-200">
                                              {piece.reference}
                                            </td>
                                            <td className="py-2 px-2 text-slate-700 dark:text-slate-300 font-medium">
                                              {piece.partnerName}
                                            </td>
                                            <td className="py-2 px-2 text-slate-500 font-mono">
                                              {piece.date}
                                            </td>
                                            <td className="py-2 px-2 text-slate-600 dark:text-slate-400">
                                              {piece.productLabel}
                                            </td>
                                            <td className="py-2 px-2 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                                              {formatEuro(piece.amountUntaxed)}
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                              {piece.odooUrl && (
                                                <a
                                                  href={piece.odooUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 inline-flex"
                                                  title="Voir la pièce dans Odoo"
                                                >
                                                  <ExternalLink className="w-3 h-3" />
                                                </a>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* 4. LIGNE DE TOTAL EN BAS DU TABLEAU */}
              {filteredRecords.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-850/90 text-slate-800 dark:text-slate-100 font-bold text-xs border-t-2 border-slate-200 dark:border-slate-800">
                    <td className="py-3.5 px-3 text-center">
                      <PackageMinus className="w-4 h-4 text-amber-500 inline" />
                    </td>
                    <td colSpan={4} className="py-3.5 px-3 uppercase tracking-wider text-[11px] text-slate-700 dark:text-slate-300">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span>TOTAL GÉNÉRAL DES SORTIES D'ENCOURS SUR LE MOIS</span>
                        <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 lowercase font-sans">
                          ({filteredRecords.length} dossier{filteredRecords.length > 1 ? 's' : ''} facturé{filteredRecords.length > 1 ? 's' : ''})
                        </span>
                      </div>
                    </td>
                    {/* Total Ventes Facturées */}
                    <td className="py-3.5 px-3 text-right font-mono text-sm font-bold text-slate-900 dark:text-white">
                      {formatEuro(filteredTotals.sales)}
                    </td>
                    {/* Total des achats sortis de l'encours sur le mois */}
                    <td className="py-3.5 px-3 text-right font-mono text-sm font-bold text-amber-600 dark:text-amber-400">
                      {formatEuro(filteredTotals.purchases)}
                    </td>
                    {/* Marge Brute Sortie (€ et %) */}
                    <td className="py-3.5 px-3 text-right font-mono text-sm font-bold">
                      <span className={filteredTotals.margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                        {formatEuro(filteredTotals.margin)}
                      </span>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {filteredTotals.rate.toFixed(1)}% marge
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-center text-[10px] text-slate-500 dark:text-slate-400 font-normal font-sans">
                      {filteredTotals.totalPieces} pièces
                    </td>
                  </tr>
                  <tr className="bg-amber-500/10 text-amber-900 dark:text-amber-200 font-bold text-xs border-t border-amber-500/20">
                    <td colSpan={9} className="py-2.5 px-4 text-right">
                      <span className="text-xs uppercase tracking-wide mr-2 text-slate-600 dark:text-slate-300 font-semibold">
                        Total des achats sortis de l'encours sur le mois :
                      </span>
                      <span className="font-mono text-amber-600 dark:text-amber-400 text-sm font-extrabold">
                        {formatEuro(filteredTotals.purchases)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Bottom Summary Bar with Explicit Callout */}
          <div className="px-6 py-4 bg-amber-50/70 dark:bg-amber-950/30 border-t border-amber-200/70 dark:border-amber-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2 text-amber-900 dark:text-amber-200">
              <span className="font-semibold">Bilan de clôture de l'en-cours :</span>
              <span>
                <strong>Total des achats sortis de l'encours sur le mois :</strong>{' '}
                <span className="font-mono text-amber-700 dark:text-amber-300 font-bold text-sm">
                  {formatEuro(filteredTotals.purchases)}
                </span>
              </span>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Mois : <strong>{selectedMonthLabel}</strong> • Données conformes à la facturation Odoo Live
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
