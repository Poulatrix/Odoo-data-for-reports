import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileSpreadsheet, 
  RefreshCw, 
  Download, 
  Filter, 
  Search, 
  ArrowUpDown, 
  ChevronUp, 
  ChevronDown, 
  ExternalLink,
  Layers, 
  DollarSign, 
  Clock, 
  Receipt, 
  TrendingUp, 
  TrendingDown,
  AlertCircle, 
  CheckCircle2, 
  Sparkles,
  Info,
  Calendar,
  Building2,
  FileDown,
  Printer,
  ChevronRight,
  Eye,
  BarChart3,
  SlidersHorizontal,
  ShoppingBag
} from 'lucide-react';
import { UninvoicedOrderReportItem, OdooConnectionCredentials } from '../../types/odoo';
import { odooClient } from '../../services/odooClient';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters';
import { exportToCSV, exportToJSON, exportToExcel, exportReportToExcel, exportStyledReportToExcel } from '../../utils/exportUtils';
import { ReportOrderDrilldownModal } from './ReportOrderDrilldownModal';

interface UninvoicedOrdersReportProps {
  credentials: OdooConnectionCredentials | null;
  isDemo: boolean;
}

type SortField = 'clientDisplay' | 'amount_untaxed' | 'totalHours' | 'valuation77_76' | 'valuation90' | 'totalPurchases' | 'purchaseOrdersPending' | 'grossMargin' | 'marginRate' | 'date_order';

export const UninvoicedOrdersReport: React.FC<UninvoicedOrdersReportProps> = ({
  credentials,
  isDemo
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [records, setRecords] = useState<UninvoicedOrderReportItem[]>([]);
  const [summary, setSummary] = useState({
    totalOrdersCount: 0,
    totalSalesUntaxed: 0,
    totalTimesheetHours: 0,
    totalPurchasesInvoiced: 0,
    totalPurchaseOrdersPending: 0,
    totalGrossMargin: 0,
    averageMarginRate: 0,
    totalValuation77_76: 0,
    totalValuation90: 0
  });
  const [executionTimeMs, setExecutionTimeMs] = useState<number>(0);
  const [fromCache, setFromCache] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('clientDisplay');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [minMarginFilter, setMinMarginFilter] = useState<number | ''>('');

  // Retroactive Frozen Date Filter state (As of Date)
  // Default to today's date in YYYY-MM-DD
  const [asOfDate, setAsOfDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [appliedAsOfDate, setAppliedAsOfDate] = useState<string | null>(null);
  const [isExportingFrozen, setIsExportingFrozen] = useState<boolean>(false);

  // Selected Order for Drilldown
  const [selectedOrder, setSelectedOrder] = useState<UninvoicedOrderReportItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [showAlgoInfo, setShowAlgoInfo] = useState<boolean>(false);

  // Load Report Data
  const loadReport = async (forceRefresh: boolean = false, dateToQuery?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const activeDate = dateToQuery !== undefined ? dateToQuery : appliedAsOfDate;
      const res = await odooClient.getUninvoicedOrdersReport({
        forceRefresh,
        credentials: credentials || undefined,
        isDemo,
        asOfDate: activeDate || undefined
      });

      if (res.success) {
        setRecords(res.records);
        setSummary({
          ...res.summary,
          totalPurchaseOrdersPending: res.summary.totalPurchaseOrdersPending ?? res.records.reduce((sum, r) => sum + (r.purchaseOrdersPending || 0), 0),
          totalValuation77_76: res.summary.totalValuation77_76 ?? Math.round((res.summary.totalTimesheetHours || 0) * 77.76 * 100) / 100,
          totalValuation90: res.summary.totalValuation90 ?? Math.round((res.summary.totalTimesheetHours || 0) * 90 * 100) / 100
        });
        setExecutionTimeMs(res.executionTimeMs || 0);
        setFromCache(!!res.fromCache);
      } else {
        setError(res.error || 'Erreur lors de la génération du rapport.');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadReport(true, appliedAsOfDate);
    } else {
      loadReport(false, appliedAsOfDate);
    }
  }, [credentials, isDemo]);

  // Apply as-of-date to the live table view
  const handleApplyDateFilter = () => {
    if (asOfDate) {
      setAppliedAsOfDate(asOfDate);
      loadReport(false, asOfDate);
    }
  };

  // Reset to live / all-time view
  const handleResetDateFilter = () => {
    setAppliedAsOfDate(null);
    loadReport(false, null);
  };

  // Filtered and Sorted Records
  const filteredRecords = useMemo(() => {
    return records
      .filter((item) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const clientMatch = item.clientDisplay?.toLowerCase().includes(q);
        const nameMatch = item.name?.toLowerCase().includes(q);
        const partnerName = Array.isArray(item.partner_id) ? item.partner_id[1].toLowerCase() : '';
        return clientMatch || nameMatch || partnerName.includes(q);
      })
      .filter((item) => {
        if (minMarginFilter === '') return true;
        return item.marginRate >= Number(minMarginFilter);
      })
      .sort((a, b) => {
        if (sortField === 'clientDisplay' || sortField === 'name') {
          const refA = a.name || a.clientDisplay || '';
          const refB = b.name || b.clientDisplay || '';
          const cmp = refA.localeCompare(refB, undefined, { numeric: true, sensitivity: 'base' });
          return sortAsc ? cmp : -cmp;
        }

        let valA: any = a[sortField];
        let valB: any = b[sortField];

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortAsc ? valA - valB : valB - valA;
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        return 0;
      });
  }, [records, searchQuery, sortField, sortAsc, minMarginFilter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleOpenDrilldown = (order: UninvoicedOrderReportItem) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  // Export handlers
  const handleExportCSV = () => {
    const exportData = filteredRecords.map((r) => {
      const clientName = Array.isArray(r.partner_id) ? r.partner_id[1] : (r.partner_id || r.clientDisplay || '');
      const hours = Number(r.totalHours) || 0;
      const sales = Number(r.amount_untaxed) || 0;
      const valoCost = r.valuation77_76 !== undefined ? Number(r.valuation77_76) : Math.round(hours * 77.76 * 100) / 100;
      const valoSell = r.valuation90 !== undefined ? Number(r.valuation90) : Math.round(hours * 90.00 * 100) / 100;
      const vendorBillsVal = r.vendorBillsTotal ?? (r.vendorBills || []).reduce((sum, b) => sum + (Number(b.price_subtotal) || Number(b.debit) || 0), 0);
      const manualCostsVal = r.manualAnalyticCostsTotal ?? (r.manualAnalyticLines || []).reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
      const totalCosts = Math.round((valoSell + vendorBillsVal + manualCostsVal) * 100) / 100;
      const bdcVal = r.purchaseOrdersPending ?? 0;
      const rentabilite = Math.round((sales - totalCosts) * 100) / 100;

      return {
        'Projet': r.name,
        'Client': clientName,
        'Ventes à facturer (€)': sales,
        'Heures': hours,
        'Valorisation (77,76€/h)': valoCost,
        'Valorisation (90€/h)': valoSell,
        'Factures fournisseur (€)': vendorBillsVal,
        'Écritures directes / Pragma (€)': manualCostsVal,
        'TOTAL (heures à 90€ + factures + pragma)': totalCosts,
        'BDC (Commandé mais pas facturé)': bdcVal !== 0 ? bdcVal : 0,
        'Rentabilité du projet (€)': rentabilite
      };
    });
    const dateSuffix = appliedAsOfDate || new Date().toISOString().slice(0, 10);
    exportToCSV(exportData, undefined, undefined, `Rapport_Projets_${dateSuffix}.csv`);
  };

  const handleExportExcel = () => {
    const dateSuffix = appliedAsOfDate || new Date().toISOString().slice(0, 10);
    exportStyledReportToExcel({
      records: filteredRecords,
      asOfDate: appliedAsOfDate,
      hourlyCostRate: 77.76,
      hourlySellingRate: 90.00,
      filename: `Rapport_Projets_${dateSuffix}.xlsx`
    });
  };

  // Dedicated Retroactive Export Handler ("Exporter le Bilan Figé (Excel)")
  const handleExportFrozenExcel = async () => {
    if (!asOfDate) return;
    setIsExportingFrozen(true);
    try {
      let targetRecords: UninvoicedOrderReportItem[] = [];

      // If current view already has data matching the chosen asOfDate, use them directly
      if (appliedAsOfDate === asOfDate && filteredRecords.length > 0) {
        targetRecords = filteredRecords;
      } else {
        // Fetch retroactive dataset at date asOfDate
        const res = await odooClient.getUninvoicedOrdersReport({
          forceRefresh: false,
          credentials: credentials || undefined,
          isDemo,
          asOfDate
        });
        targetRecords = res.records || [];
      }

      if (targetRecords.length === 0) {
        alert(`Aucune affaire à facturer trouvée à la date du ${asOfDate}.`);
        return;
      }

      exportStyledReportToExcel({
        records: targetRecords,
        asOfDate,
        hourlyCostRate: 77.76,
        hourlySellingRate: 90.00,
        filename: `Rapport_Projets_Fige_${asOfDate}.xlsx`
      });
    } catch (err: any) {
      console.error('Error generating frozen Excel export:', err);
      alert(`Erreur lors de l'export du bilan figé : ${err.message || 'Erreur inconnue'}`);
    } finally {
      setIsExportingFrozen(false);
    }
  };

  const handleExportJSON = () => {
    const dateSuffix = appliedAsOfDate || new Date().toISOString().slice(0, 10);
    exportToJSON(filteredRecords, `Bilan_Affaires_A_Facturer_${dateSuffix}.json`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="uninvoiced-orders-report-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header & Page Title */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/10 text-sky-500 shadow-2xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Affaires à Facturer
                </h1>
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  Rapport Odoo
                </span>
                {appliedAsOfDate && (
                  <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-amber-500" />
                    Figé au {formatDate(appliedAsOfDate)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-normal">
                Consolidation automatisée des Ventes, Feuilles de temps et Achats fournisseurs rattachés
              </p>
            </div>
          </div>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {fromCache && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-normal bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 font-mono">
              Cache actif ({executionTimeMs}ms)
            </span>
          )}

          <button
            onClick={() => loadReport(true, appliedAsOfDate)}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950/40 hover:border-sky-300 dark:hover:border-sky-800 hover:text-sky-600 dark:hover:text-sky-400 text-slate-700 dark:text-slate-200 transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            title="Rafraîchir les requêtes vers l'API Odoo"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>

          {/* Bouton Info Algorithme de Calcul avec bulle pop-up au survol / clic */}
          <div 
            className="relative"
            onMouseEnter={() => setShowAlgoInfo(true)}
            onMouseLeave={() => setShowAlgoInfo(false)}
          >
            <button
              type="button"
              onClick={() => setShowAlgoInfo(!showAlgoInfo)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors shadow-2xs cursor-pointer"
              title="Survolez ou cliquez pour afficher l'algorithme de calcul"
            >
              <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Algorithme de calcul</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            </button>

            {showAlgoInfo && (
              <div 
                className="absolute right-0 top-full mt-1.5 z-50 w-[330px] sm:w-[480px] p-4 rounded-2xl bg-slate-900 text-white dark:bg-slate-950 border border-slate-700 shadow-2xl space-y-3 pointer-events-auto"
                onMouseEnter={() => setShowAlgoInfo(true)}
                onMouseLeave={() => setShowAlgoInfo(false)}
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center space-x-2 font-bold text-xs text-blue-300">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <span>Méthodologie & Algorithme de calcul multi-modèles</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAlgoInfo(false)}
                    className="text-slate-400 hover:text-white text-xs cursor-pointer p-0.5"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 text-[11px] leading-relaxed">
                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
                    <span className="font-semibold text-blue-200 block mb-0.5">1. Filtrage Ventes (sale.order)</span>
                    <p className="text-slate-300 text-[11px]">
                      Commandes confirmées (<code className="text-blue-300 font-mono text-[10px]">state = 'sale'</code>) et en attente de facturation (<code className="text-blue-300 font-mono text-[10px]">invoice_status = 'to invoice'</code>).
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
                    <span className="font-semibold text-indigo-200 block mb-0.5">2. Heures Prestées (account.analytic.line)</span>
                    <p className="text-slate-300 text-[11px]">
                      Extraction des feuilles de temps (<code className="text-indigo-300 font-mono text-[10px]">unit_amount</code>) et double valorisation interne (77,76 €/h) et vente (90,00 €/h).
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
                    <span className="font-semibold text-amber-200 block mb-0.5">3. Achats & Écritures Analytiques</span>
                    <p className="text-slate-300 text-[11px]">
                      Factures fournisseurs (<code className="text-amber-300 font-mono text-[10px]">account.move.line</code>) + Écritures directes / Pragma (<code className="text-amber-300 font-mono text-[10px]">account.analytic.line</code>) et BDC engagés non facturés.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
                    <span className="font-semibold text-emerald-200 block mb-0.5">4. Marge Brute Réelle & Taux</span>
                    <p className="text-slate-300 text-[11px]">
                      Montant Vente HT déduit du coût de revient réel (Achats HT + Heures valorisées), avec ratio de rentabilité en direct.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Export Dropdown / Buttons */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={handleExportExcel}
              disabled={filteredRecords.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center space-x-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={filteredRecords.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="p-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              title="Imprimer le rapport"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* DatePicker & Frozen Bilan Export Control Section */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center flex-wrap gap-2.5 w-full md:w-auto">
          <div className="flex items-center space-x-2 text-xs font-medium text-slate-700 dark:text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>Bilan à la date du :</span>
          </div>

          <div className="relative">
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-normal text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer font-mono"
            />
          </div>

          <button
            onClick={handleApplyDateFilter}
            disabled={loading || appliedAsOfDate === asOfDate}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${
              appliedAsOfDate === asOfDate
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
            }`}
            title="Appliquer cette date à l'ensemble du tableau et des KPI"
          >
            {appliedAsOfDate === asOfDate ? 'Date active' : 'Visualiser à cette date'}
          </button>

          {appliedAsOfDate && (
            <button
              onClick={handleResetDateFilter}
              disabled={loading}
              className="px-2.5 py-1.5 text-xs font-normal rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50/70 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
              title="Revenir au bilan en direct (toutes dates confondues)"
            >
              Réinitialiser (Temps Réel)
            </button>
          )}
        </div>

        {/* Dedicated Action Button: Exporter le Bilan Figé (Excel) */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            onClick={handleExportFrozenExcel}
            disabled={isExportingFrozen || !asOfDate}
            className="w-full sm:w-auto px-3.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            title={`Générer et télécharger le fichier Excel figé au ${asOfDate}`}
          >
            {isExportingFrozen ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            <span>Exporter le Bilan Figé (Excel)</span>
          </button>
        </div>
      </div>

      {/* Active Frozen Date Banner Alert */}
      {appliedAsOfDate && (
        <div className="p-3.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between flex-wrap gap-2 shadow-xs">
          <div className="flex items-center space-x-2.5">
            <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Bilan figé au {formatDate(appliedAsOfDate)}</strong> — Seules les commandes créées/confirmées ≤ {formatDate(appliedAsOfDate)}, les feuilles de temps ≤ {formatDate(appliedAsOfDate)} et les factures fournisseurs comptabilisées ≤ {formatDate(appliedAsOfDate)} sont prises en compte.
            </span>
          </div>
          <button
            onClick={handleResetDateFilter}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-amber-600 hover:bg-amber-700 text-white cursor-pointer transition-colors"
          >
            Revenir au Temps Réel
          </button>
        </div>
      )}

      {/* KPI Metrics Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        
        {/* Metric 1: Nombre d'affaires */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-sky-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Affaires</span>
            <div className="p-1.5 rounded-xl bg-sky-500/10 text-sky-500">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight font-mono text-slate-900 dark:text-white mt-2 tabular-nums">
            {summary.totalOrdersCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>À facturer</span>
          </div>
        </div>

        {/* Metric 2: Montant Vente (€ HT) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-sky-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Ventes</span>
            <div className="p-1.5 rounded-xl bg-sky-500/10 text-sky-500">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight font-mono text-slate-900 dark:text-white mt-2 tabular-nums">
            {formatCurrency(summary.totalSalesUntaxed)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-medium">
            Montant net HT
          </div>
        </div>

        {/* Metric 3: Total Heures Prestées */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-sky-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Heures</span>
            <div className="p-1.5 rounded-xl bg-sky-500/10 text-sky-500">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight font-mono text-slate-900 dark:text-white mt-2 tabular-nums">
            {summary.totalTimesheetHours} h
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-medium">
            Prestées
          </div>
        </div>

        {/* Metric 4: Valo 77.76 €/h */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-sky-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Valo. 77,76 €</span>
            <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-500">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight font-mono text-slate-900 dark:text-white mt-2 tabular-nums">
            {formatCurrency(summary.totalValuation77_76)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-medium">
            {summary.totalTimesheetHours}h × 77,76 €
          </div>
        </div>

        {/* Metric 5: Valo 90.00 €/h */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-sky-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Valo. 90,00 €</span>
            <div className="p-1.5 rounded-xl bg-sky-500/10 text-sky-500">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight font-mono text-slate-900 dark:text-white mt-2 tabular-nums">
            {formatCurrency(summary.totalValuation90)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-medium">
            {summary.totalTimesheetHours}h × 90,00 €
          </div>
        </div>

        {/* Metric 6: Total Achats & Coûts Directs */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-sky-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Factures & Pragma</span>
            <div className="p-1 rounded-md bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/50">
              <Receipt className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold tracking-tight font-mono text-rose-700 dark:text-rose-300 mt-2">
            {formatCurrency(summary.totalPurchasesInvoiced)}
          </div>
          <div className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-1 font-medium">
            Comptabilisés
          </div>
        </div>

        {/* Metric 7: BDC Achats Engagés Non Facturés */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-orange-300 dark:hover:border-orange-700 transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">BDC Engagés</span>
            <div className="p-1 rounded-md bg-orange-50 dark:bg-orange-950/70 text-orange-600 dark:text-orange-300 border border-orange-200/60 dark:border-orange-900/50">
              <ShoppingBag className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold tracking-tight font-mono text-orange-700 dark:text-orange-300 mt-2">
            {formatCurrency(summary.totalPurchaseOrdersPending)}
          </div>
          <div className="text-[11px] text-orange-600/80 dark:text-orange-400/80 mt-1 font-medium">
            PO non facturés
          </div>
        </div>

        {/* Metric 8: Marge Brute Totale */}
        <div className={`p-3.5 rounded-xl border shadow-xs transition-colors ${
          summary.totalGrossMargin < 0 
            ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50' 
            : 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
        }`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Marge Réelle</span>
            <div className={`p-1 rounded-md border ${
              summary.totalGrossMargin < 0 
                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300/70 dark:border-rose-900/60' 
                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300/70 dark:border-emerald-900/60'
            }`}>
              {summary.totalGrossMargin < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
            </div>
          </div>
          <div className={`text-xl font-bold tracking-tight font-mono mt-2 ${
            summary.totalGrossMargin < 0 
              ? 'text-rose-700 dark:text-rose-300' 
              : 'text-emerald-700 dark:text-emerald-300'
          }`}>
            {formatCurrency(summary.totalGrossMargin)}
          </div>
          <div className={`text-[11px] mt-1 font-semibold ${
            summary.totalGrossMargin < 0 
              ? 'text-rose-700 dark:text-rose-400' 
              : 'text-emerald-700 dark:text-emerald-400'
          }`}>
            Taux moyen : {summary.averageMarginRate}%
          </div>
        </div>

      </div>

      {/* Filter and Search Bar */}
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher affaire, référence ou client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 font-normal"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Marge min :</span>
            <select
              value={minMarginFilter}
              onChange={(e) => setMinMarginFilter(e.target.value === '' ? '' : Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-normal text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
            >
              <option value="">Toutes les marges</option>
              <option value="50">&gt; 50% de marge</option>
              <option value="70">&gt; 70% de marge</option>
              <option value="80">&gt; 80% de marge</option>
            </select>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 font-normal pl-3 border-l border-slate-200 dark:border-slate-800">
            <span className="font-semibold text-slate-800 dark:text-slate-200">{filteredRecords.length}</span> affaire(s)
          </div>
        </div>
      </div>

      {/* Main Table: Bilan des affaires à facturer */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
            <p className="text-xs font-normal text-slate-500 dark:text-slate-400">
              Génération du rapport en cours... Interrogation des Ventes, Feuilles de temps et Factures fournisseurs...
            </p>
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              Impossible de générer le rapport
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{error}</p>
            <button
              onClick={() => loadReport(true)}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-16 text-center space-y-2">
            <Layers className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              Aucune affaire à facturer trouvée
            </div>
            <p className="text-xs text-slate-500">
              Toutes les commandes confirmées sont déjà facturées ou ne correspondent pas aux filtres actuels.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-400 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 select-none">
                <tr>
                  {/* Column 1: Référence & Client */}
                  <th 
                    onClick={() => handleSort('clientDisplay')}
                    className="px-5 py-3.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">1. Référence & Client</span>
                      {sortField === 'clientDisplay' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Column 2: Montant Vente (€ HT) */}
                  <th 
                    onClick={() => handleSort('amount_untaxed')}
                    className="px-5 py-3.5 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">2. Montant Vente (€ HT)</span>
                      {sortField === 'amount_untaxed' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Column 3: Total Heures Prestées */}
                  <th 
                    onClick={() => handleSort('totalHours')}
                    className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">3. Heures</span>
                      {sortField === 'totalHours' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Column 4: Valo. 77.76 €/h */}
                  <th 
                    onClick={() => handleSort('valuation77_76')}
                    className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">4. Valo. 77,76 €/h</span>
                      {sortField === 'valuation77_76' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Column 5: Valo. 90.00 €/h */}
                  <th 
                    onClick={() => handleSort('valuation90')}
                    className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">5. Valo. 90,00 €/h</span>
                      {sortField === 'valuation90' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Column 6: Total Achats & Coûts Directs / Pragma (€ HT) */}
                  <th 
                    onClick={() => handleSort('totalPurchases')}
                    className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">6. Factures & Pragma</span>
                      {sortField === 'totalPurchases' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Column 7: BDC Achats Engagés Non Facturés (€ HT) */}
                  <th 
                    onClick={() => handleSort('purchaseOrdersPending')}
                    className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">7. BDC Engagés</span>
                      {sortField === 'purchaseOrdersPending' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Column 8: Statut Facturation */}
                  <th className="px-3 py-3.5 text-center">
                    <span className="text-slate-600 dark:text-slate-300 font-semibold">Statut</span>
                  </th>

                  {/* Column 9: Marge Estimée */}
                  <th 
                    onClick={() => handleSort('grossMargin')}
                    className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">Marge Réelle</span>
                      {sortField === 'grossMargin' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Action */}
                  <th className="px-3 py-3.5 text-center">
                    <span className="text-slate-600 dark:text-slate-300 font-semibold">Actions</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                {filteredRecords.map((item, index) => {
                  const partnerName = Array.isArray(item.partner_id) ? item.partner_id[1] : (item.partner_id || 'Client');
                  const analyticName = Array.isArray(item.analytic_account_id) ? item.analytic_account_id[1] : null;

                  return (
                    <tr 
                      key={item.id}
                      onClick={() => handleOpenDrilldown(item)}
                      className={`hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group ${
                        index % 2 === 1 ? 'bg-slate-50/40 dark:bg-slate-900/40' : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      {/* Column 1: Référence & Client */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center space-x-3">
                          <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono text-[11px] font-bold border border-sky-500/20 flex items-center justify-center shrink-0">
                            SO
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white text-xs group-hover:text-sky-500 dark:group-hover:text-sky-400 transition-colors">
                              {item.name} — {partnerName}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1.5">
                              <span>Date : {formatDate(item.date_order)}</span>
                              {analyticName && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-[180px]" title={analyticName}>
                                    Projet : {analyticName}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Montant Vente (€ HT) */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="font-mono font-bold text-slate-900 dark:text-white text-xs">
                          {formatCurrency(item.amount_untaxed)}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                          TTC : {formatCurrency(item.amount_total)}
                        </div>
                      </td>

                      {/* Column 3: Total Heures Prestées */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="inline-flex items-center font-mono font-semibold text-sky-800 dark:text-sky-300 px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 border border-sky-200/90 dark:border-sky-800 text-xs">
                          <Clock className="w-3 h-3 mr-1 text-sky-500" />
                          {item.totalHours} h
                        </span>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {item.timesheets?.length || 0} entrée(s)
                        </div>
                      </td>

                      {/* Column 4: Valo. 77.76 €/h */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-300 text-xs">
                          {formatCurrency(item.valuation77_76)}
                        </span>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          77,76 €/h
                        </div>
                      </td>

                      {/* Column 5: Valo. 90.00 €/h */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-mono font-semibold text-blue-700 dark:text-blue-300 text-xs">
                          {formatCurrency(item.valuation90)}
                        </span>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          90,00 €/h
                        </div>
                      </td>

                      {/* Column 6: Total Achats & Coûts Directs (€ HT) */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="inline-flex items-center font-mono font-semibold text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200/90 dark:border-rose-800 text-xs">
                          <Receipt className="w-3 h-3 mr-1 text-rose-500" />
                          {formatCurrency(item.totalPurchases)}
                        </span>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {item.vendorBills?.length || 0} fact.{item.manualAnalyticLines && item.manualAnalyticLines.length > 0 ? ` + ${item.manualAnalyticLines.length} dir.` : ''}
                        </div>
                      </td>

                      {/* Column 7: BDC Achats Engagés Non Facturés (€ HT) */}
                      <td className="px-4 py-3.5 text-right">
                        <span className={`inline-flex items-center font-mono font-semibold px-2 py-0.5 rounded-md text-xs border ${
                          (item.purchaseOrdersPending || 0) > 0
                            ? 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200/90 dark:border-amber-800'
                            : 'text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-800/30 border-slate-200/50 dark:border-slate-800'
                        }`}>
                          <ShoppingBag className="w-3 h-3 mr-1 text-amber-500" />
                          {formatCurrency(item.purchaseOrdersPending || 0)}
                        </span>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {item.purchaseOrderLines?.length || 0} ligne(s) BDC
                        </div>
                      </td>

                      {/* Column 8: Statut Facturation */}
                      <td className="px-3 py-3.5 text-center">
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span>À facturer</span>
                        </span>
                      </td>

                      {/* Column 9: Marge Estimée */}
                      <td className="px-4 py-3.5 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-md border font-mono font-bold text-xs ${
                          item.grossMargin < 0 
                            ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800' 
                            : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800'
                        }`}>
                          {formatCurrency(item.grossMargin)}
                        </span>
                        <div className={`text-[11px] font-semibold mt-0.5 ${
                          item.grossMargin < 0 
                            ? 'text-rose-600 dark:text-rose-400' 
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {item.marginRate}%
                        </div>
                      </td>

                      {/* Column 10: Actions */}
                      <td className="px-3 py-3.5 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDrilldown(item);
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-sky-500 hover:border-sky-500 text-slate-400 hover:text-white transition-all cursor-pointer shadow-2xs"
                          title="Voir le détail des feuilles de temps, achats et BDC"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer Totals */}
              <tfoot className="bg-slate-50 dark:bg-slate-900 font-semibold border-t-2 border-slate-200 dark:border-slate-800 text-xs">
                <tr>
                  <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                    TOTAL ({filteredRecords.length} affaires)
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white text-xs">
                    {formatCurrency(filteredRecords.reduce((s, r) => s + r.amount_untaxed, 0))}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-sky-700 dark:text-sky-300 text-xs">
                    {Math.round(filteredRecords.reduce((s, r) => s + r.totalHours, 0) * 10) / 10} h
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-semibold text-indigo-700 dark:text-indigo-300 text-xs">
                    {formatCurrency(filteredRecords.reduce((s, r) => s + (r.valuation77_76 || 0), 0))}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-semibold text-blue-700 dark:text-blue-300 text-xs">
                    {formatCurrency(filteredRecords.reduce((s, r) => s + (r.valuation90 || 0), 0))}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-rose-700 dark:text-rose-300 text-xs">
                    {formatCurrency(filteredRecords.reduce((s, r) => s + r.totalPurchases, 0))}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-amber-700 dark:text-amber-300 text-xs">
                    {formatCurrency(filteredRecords.reduce((s, r) => s + (r.purchaseOrdersPending || 0), 0))}
                  </td>
                  <td className="px-3 py-3.5 text-center text-slate-400">
                    —
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-300 text-xs">
                    {formatCurrency(filteredRecords.reduce((s, r) => s + r.grossMargin, 0))}
                  </td>
                  <td className="px-3 py-3.5 text-center text-slate-400">
                    —
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Drilldown Modal */}
      <ReportOrderDrilldownModal
        order={selectedOrder}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedOrder(null);
        }}
      />

    </div>
  );
};
