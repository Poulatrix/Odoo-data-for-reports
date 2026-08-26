import React, { useState, useEffect, useMemo } from 'react';
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
  SlidersHorizontal
} from 'lucide-react';
import { UninvoicedOrderReportItem, OdooConnectionCredentials } from '../../types/odoo';
import { odooClient } from '../../services/odooClient';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters';
import { exportToCSV, exportToJSON, exportToExcel, exportReportToExcel } from '../../utils/exportUtils';
import { ReportOrderDrilldownModal } from './ReportOrderDrilldownModal';

interface UninvoicedOrdersReportProps {
  credentials: OdooConnectionCredentials | null;
  isDemo: boolean;
}

type SortField = 'clientDisplay' | 'amount_untaxed' | 'totalHours' | 'valuation77_76' | 'valuation90' | 'totalPurchases' | 'grossMargin' | 'marginRate' | 'date_order';

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

  useEffect(() => {
    loadReport(false, appliedAsOfDate);
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
      const vendorBillsVal = r.vendorBillsTotal ?? (r.vendorBills || []).reduce((sum, b) => sum + (Number(b.price_subtotal) || Number(b.debit) || 0), 0);
      const manualCostsVal = r.manualAnalyticCostsTotal ?? (r.manualAnalyticLines || []).reduce((sum, m) => sum + m.amount, 0);

      return {
        'Référence Commande': r.name,
        'Client': Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id,
        'Référence & Client': r.clientDisplay,
        'Montant Vente (€ HT)': r.amount_untaxed,
        'Montant Vente TTC (€)': r.amount_total,
        'Total Heures Prestées (hrs)': r.totalHours,
        'Valo. Heures (77,76 €/h)': r.valuation77_76,
        'Valo. Heures (90,00 €/h)': r.valuation90,
        'Factures Fournisseurs (€ HT)': vendorBillsVal,
        'Écritures Analytiques Directes / Pragma (€ HT)': manualCostsVal,
        'Total Achats & Coûts Directs (€ HT)': r.totalPurchases,
        'Marge Brute (€ HT)': r.grossMargin,
        'Taux de Marge (%)': `${r.marginRate}%`,
        'Statut Facturation': 'À facturer',
        'Date Commande': formatDate(r.date_order)
      };
    });
    const dateSuffix = appliedAsOfDate || new Date().toISOString().slice(0, 10);
    exportToCSV(exportData, undefined, undefined, `Bilan_Affaires_A_Facturer_${dateSuffix}.csv`);
  };

  const handleExportExcel = () => {
    const exportData = filteredRecords.map((r) => {
      const vendorBillsVal = r.vendorBillsTotal ?? (r.vendorBills || []).reduce((sum, b) => sum + (Number(b.price_subtotal) || Number(b.debit) || 0), 0);
      const manualCostsVal = r.manualAnalyticCostsTotal ?? (r.manualAnalyticLines || []).reduce((sum, m) => sum + m.amount, 0);

      return {
        'Référence Commande': r.name,
        'Client': Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id,
        'Référence & Client': r.clientDisplay,
        'Montant Vente (€ HT)': r.amount_untaxed,
        'Montant Vente TTC (€)': r.amount_total,
        'Total Heures Prestées (hrs)': r.totalHours,
        'Valo. Heures (77,76 €/h)': r.valuation77_76,
        'Valo. Heures (90,00 €/h)': r.valuation90,
        'Factures Fournisseurs (€ HT)': vendorBillsVal,
        'Écritures Analytiques Directes / Pragma (€ HT)': manualCostsVal,
        'Total Achats & Coûts Directs (€ HT)': r.totalPurchases,
        'Marge Brute (€ HT)': r.grossMargin,
        'Taux de Marge (%)': `${r.marginRate}%`,
        'Statut Facturation': 'À facturer',
        'Date Commande': formatDate(r.date_order)
      };
    });
    
    if (appliedAsOfDate) {
      exportReportToExcel({
        data: exportData,
        asOfDate: appliedAsOfDate,
        filename: `Bilan_Encours_Ecomi_${appliedAsOfDate}.xlsx`
      });
    } else {
      exportToExcel(exportData, undefined, undefined, `Bilan_Affaires_A_Facturer_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
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

      const exportData = targetRecords.map((r) => {
        const vendorBillsVal = r.vendorBillsTotal ?? (r.vendorBills || []).reduce((sum, b) => sum + (Number(b.price_subtotal) || Number(b.debit) || 0), 0);
        const manualCostsVal = r.manualAnalyticCostsTotal ?? (r.manualAnalyticLines || []).reduce((sum, m) => sum + m.amount, 0);

        return {
          'Référence Commande': r.name,
          'Client': Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id,
          'Référence & Client': r.clientDisplay,
          'Montant Vente (€ HT)': r.amount_untaxed,
          'Montant Vente TTC (€)': r.amount_total,
          'Total Heures Prestées (hrs)': r.totalHours,
          'Valo. Heures (77,76 €/h)': r.valuation77_76,
          'Valo. Heures (90,00 €/h)': r.valuation90,
          'Factures Fournisseurs (€ HT)': vendorBillsVal,
          'Écritures Analytiques Directes / Pragma (€ HT)': manualCostsVal,
          'Total Achats & Coûts Directs (€ HT)': r.totalPurchases,
          'Marge Brute (€ HT)': r.grossMargin,
          'Taux de Marge (%)': `${r.marginRate}%`,
          'Statut Facturation': 'À facturer',
          'Date Commande': formatDate(r.date_order)
        };
      });

      exportReportToExcel({
        data: exportData,
        asOfDate,
        filename: `Bilan_Encours_Ecomi_${asOfDate}.xlsx`
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
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-purple-600 text-white shadow-md shadow-purple-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  Bilan des affaires à facturer
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  Rapport Odoo
                </span>
                {appliedAsOfDate && (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Figé au {formatDate(appliedAsOfDate)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Consolidation automatisée des Ventes, Feuilles de temps et Achats fournisseurs rattachés
              </p>
            </div>
          </div>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {fromCache && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80">
              Cache actif ({executionTimeMs}ms)
            </span>
          )}

          <button
            onClick={() => loadReport(true, appliedAsOfDate)}
            disabled={loading}
            className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            title="Rafraîchir les requêtes vers l'API Odoo"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>

          {/* Export Dropdown / Buttons */}
          <div className="flex items-center space-x-1">
            <button
              onClick={handleExportExcel}
              disabled={filteredRecords.length === 0}
              className="px-3 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={filteredRecords.length === 0}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="p-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              title="Imprimer le rapport"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* DatePicker & Frozen Bilan Export Control Section */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center flex-wrap gap-2.5 w-full md:w-auto">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
            <span>Bilan à la date du :</span>
          </div>

          <div className="relative">
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
            />
          </div>

          <button
            onClick={handleApplyDateFilter}
            disabled={loading || appliedAsOfDate === asOfDate}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50 ${
              appliedAsOfDate === asOfDate
                ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
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
              className="px-2.5 py-1.5 text-xs font-medium rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
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
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            title={`Générer et télécharger le fichier Excel figé au ${asOfDate}`}
          >
            {isExportingFrozen ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            <span>Exporter le Bilan Figé (Excel)</span>
          </button>
        </div>
      </div>

      {/* Active Frozen Date Banner Alert */}
      {appliedAsOfDate && (
        <div className="p-3.5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between flex-wrap gap-2 shadow-xs">
          <div className="flex items-center space-x-2.5">
            <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Bilan figé au {formatDate(appliedAsOfDate)}</strong> — Seules les commandes créées/confirmées ≤ {formatDate(appliedAsOfDate)}, les feuilles de temps ≤ {formatDate(appliedAsOfDate)} et les factures fournisseurs comptabilisées ≤ {formatDate(appliedAsOfDate)} sont prises en compte.
            </span>
          </div>
          <button
            onClick={handleResetDateFilter}
            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
          >
            Revenir au Temps Réel
          </button>
        </div>
      )}

      {/* Specifications & Query Sequence Notice Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50/80 via-indigo-50/50 to-purple-50/80 dark:from-purple-950/20 dark:via-indigo-950/20 dark:to-purple-950/20 border border-purple-200/80 dark:border-purple-900/60 shadow-xs">
        <div className="flex items-start space-x-3">
          <div className="p-2 rounded-xl bg-purple-600/10 dark:bg-purple-400/10 text-purple-700 dark:text-purple-300 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs">
            <h3 className="font-bold text-slate-900 dark:text-white">
              Algorithme de calcul multi-modèles Odoo :
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-2">
              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-purple-100 dark:border-purple-900/50">
                <span className="font-bold text-purple-700 dark:text-purple-300 block mb-0.5">1. Filtrage Ventes (`sale.order`)</span>
                <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                  Commandes confirmées (<code className="text-purple-600 dark:text-purple-400 font-mono">state = 'sale'</code>) et en attente de facturation (<code className="text-purple-600 dark:text-purple-400 font-mono">invoice_status = 'to invoice'</code>).
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-purple-100 dark:border-purple-900/50">
                <span className="font-bold text-indigo-700 dark:text-indigo-300 block mb-0.5">2. Heures Prestées (`account.analytic.line`)</span>
                <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                  Extraction des feuilles de temps (<code className="text-indigo-600 dark:text-indigo-400 font-mono">unit_amount</code>) et double valorisation (77,76 € et 90 €/h).
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-purple-100 dark:border-purple-900/50">
                <span className="font-bold text-rose-700 dark:text-rose-300 block mb-0.5">3. Achats & Écritures Analytiques</span>
                <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                  Factures fournisseurs (<code className="text-rose-600 dark:text-rose-400 font-mono">account.move.line</code>) + Écritures directes / Pragma (<code className="text-rose-600 dark:text-rose-400 font-mono">account.analytic.line</code>).
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Metrics Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        
        {/* Metric 1: Nombre d'affaires */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Affaires</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1.5">
            {summary.totalOrdersCount}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
            <span>À facturer</span>
          </div>
        </div>

        {/* Metric 2: Montant Vente (€ HT) */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Ventes</span>
            <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1.5">
            {formatCurrency(summary.totalSalesUntaxed)}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Montant HT
          </div>
        </div>

        {/* Metric 3: Total Heures Prestées */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Heures</span>
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1.5">
            {summary.totalTimesheetHours} h
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Prestées
          </div>
        </div>

        {/* Metric 4: Valo 77.76 €/h */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Valo. 77,76 €</span>
            <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1.5">
            {formatCurrency(summary.totalValuation77_76)}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            {summary.totalTimesheetHours}h × 77,76 €
          </div>
        </div>

        {/* Metric 5: Valo 90.00 €/h */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Valo. 90,00 €</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1.5">
            {formatCurrency(summary.totalValuation90)}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            {summary.totalTimesheetHours}h × 90,00 €
          </div>
        </div>

        {/* Metric 6: Total Achats & Coûts Directs */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Achats & Coûts</span>
            <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <Receipt className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1.5">
            {formatCurrency(summary.totalPurchasesInvoiced)}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Factures & Pragma
          </div>
        </div>

        {/* Metric 7: Marge Brute Totale */}
        <div className={`p-3.5 rounded-2xl border shadow-xs col-span-2 md:col-span-2 lg:col-span-1 ${
          summary.totalGrossMargin < 0 
            ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60' 
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Marge Brute</span>
            <div className={`p-1.5 rounded-lg ${
              summary.totalGrossMargin < 0 
                ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400' 
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
            }`}>
              {summary.totalGrossMargin < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
            </div>
          </div>
          <div className={`text-xl font-black mt-1.5 ${
            summary.totalGrossMargin < 0 
              ? 'text-rose-600 dark:text-rose-400' 
              : 'text-emerald-600 dark:text-emerald-400'
          }`}>
            {formatCurrency(summary.totalGrossMargin)}
          </div>
          <div className={`text-[10px] font-bold mt-0.5 ${
            summary.totalGrossMargin < 0 
              ? 'text-rose-700 dark:text-rose-400' 
              : 'text-emerald-600 dark:text-emerald-400'
          }`}>
            Taux moyen : {summary.averageMarginRate}%
          </div>
        </div>

      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher affaire, référence ou client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
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

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <div className="flex items-center space-x-1 text-xs text-slate-500 dark:text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Marge min :</span>
            <select
              value={minMarginFilter}
              onChange={(e) => setMinMarginFilter(e.target.value === '' ? '' : Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <option value="">Toutes les marges</option>
              <option value="50">&gt; 50% de marge</option>
              <option value="70">&gt; 70% de marge</option>
              <option value="80">&gt; 80% de marge</option>
            </select>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium pl-2 border-l border-slate-200 dark:border-slate-800">
            <strong>{filteredRecords.length}</strong> affaire(s) affichée(s)
          </div>
        </div>
      </div>

      {/* Main Table: Bilan des affaires à facturer */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Génération du rapport en cours... Interrogation des Ventes, Feuilles de temps et Factures fournisseurs...
            </p>
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              Impossible de générer le rapport
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{error}</p>
            <button
              onClick={() => loadReport(true)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-16 text-center space-y-2">
            <Layers className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              Aucune affaire à facturer trouvée
            </div>
            <p className="text-xs text-slate-500">
              Toutes les commandes confirmées sont déjà facturées ou ne correspondent pas aux filtres actuels.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 select-none">
                <tr>
                  {/* Column 1: Référence & Client */}
                  <th 
                    onClick={() => handleSort('clientDisplay')}
                    className="px-5 py-3.5 font-bold cursor-pointer hover:text-purple-600 transition-colors"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>1. Référence & Client</span>
                      {sortField === 'clientDisplay' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-purple-600" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-600" />
                      )}
                    </div>
                  </th>

                  {/* Column 2: Montant Vente (€ HT) */}
                  <th 
                    onClick={() => handleSort('amount_untaxed')}
                    className="px-5 py-3.5 font-bold text-right cursor-pointer hover:text-purple-600 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span>2. Montant Vente (€ HT)</span>
                      {sortField === 'amount_untaxed' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-purple-600" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-600" />
                      )}
                    </div>
                  </th>

                  {/* Column 3: Total Heures Prestées */}
                  <th 
                    onClick={() => handleSort('totalHours')}
                    className="px-4 py-3.5 font-bold text-right cursor-pointer hover:text-purple-600 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span>3. Heures</span>
                      {sortField === 'totalHours' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-purple-600" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-600" />
                      )}
                    </div>
                  </th>

                  {/* Column 4: Valo. 77.76 €/h */}
                  <th 
                    onClick={() => handleSort('valuation77_76')}
                    className="px-4 py-3.5 font-bold text-right cursor-pointer hover:text-amber-600 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span>4. Valo. 77,76 €/h</span>
                      {sortField === 'valuation77_76' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-amber-600" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-600" />
                      )}
                    </div>
                  </th>

                  {/* Column 5: Valo. 90.00 €/h */}
                  <th 
                    onClick={() => handleSort('valuation90')}
                    className="px-4 py-3.5 font-bold text-right cursor-pointer hover:text-indigo-600 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span>5. Valo. 90,00 €/h</span>
                      {sortField === 'valuation90' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-indigo-600" /> : <ChevronDown className="w-3.5 h-3.5 text-indigo-600" />
                      )}
                    </div>
                  </th>

                  {/* Column 6: Total Achats & Coûts Directs / Pragma (€ HT) */}
                  <th 
                    onClick={() => handleSort('totalPurchases')}
                    className="px-4 py-3.5 font-bold text-right cursor-pointer hover:text-purple-600 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span>6. Achats & Coûts</span>
                      {sortField === 'totalPurchases' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-purple-600" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-600" />
                      )}
                    </div>
                  </th>

                  {/* Column 7: Statut Facturation */}
                  <th className="px-3 py-3.5 font-bold text-center">
                    <span>Statut</span>
                  </th>

                  {/* Column 8: Marge Estimée */}
                  <th 
                    onClick={() => handleSort('grossMargin')}
                    className="px-4 py-3.5 font-bold text-right cursor-pointer hover:text-purple-600 transition-colors"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span>Marge Estimée</span>
                      {sortField === 'grossMargin' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-purple-600" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-600" />
                      )}
                    </div>
                  </th>

                  {/* Action */}
                  <th className="px-3 py-3.5 font-bold text-center">
                    <span>Actions</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                {filteredRecords.map((item) => {
                  const partnerName = Array.isArray(item.partner_id) ? item.partner_id[1] : (item.partner_id || 'Client');
                  const analyticName = Array.isArray(item.analytic_account_id) ? item.analytic_account_id[1] : null;

                  return (
                    <tr 
                      key={item.id}
                      onClick={() => handleOpenDrilldown(item)}
                      className="hover:bg-purple-50/40 dark:hover:bg-purple-950/20 transition-colors cursor-pointer group"
                    >
                      {/* Column 1: Référence & Client */}
                      <td className="px-5 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold flex items-center justify-center text-xs shrink-0">
                            SO
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white text-xs group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                              {item.name} — {partnerName}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
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
                      <td className="px-4 py-4 text-right">
                        <div className="font-mono font-bold text-slate-900 dark:text-white text-xs">
                          {formatCurrency(item.amount_untaxed)}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">
                          TTC : {formatCurrency(item.amount_total)}
                        </div>
                      </td>

                      {/* Column 3: Total Heures Prestées */}
                      <td className="px-4 py-4 text-right">
                        <span className="inline-flex items-center font-mono font-bold text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/50 text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          {item.totalHours} h
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.timesheets?.length || 0} entrée(s)
                        </div>
                      </td>

                      {/* Column 4: Valo. 77.76 €/h */}
                      <td className="px-4 py-4 text-right">
                        <span className="inline-flex items-center font-mono font-bold text-amber-700 dark:text-amber-300 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200/60 dark:border-amber-900/50 text-xs">
                          {formatCurrency(item.valuation77_76)}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          77,76 €/h
                        </div>
                      </td>

                      {/* Column 5: Valo. 90.00 €/h */}
                      <td className="px-4 py-4 text-right">
                        <span className="inline-flex items-center font-mono font-bold text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-900/50 text-xs">
                          {formatCurrency(item.valuation90)}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          90,00 €/h
                        </div>
                      </td>

                      {/* Column 6: Total Achats & Coûts Directs (€ HT) */}
                      <td className="px-4 py-4 text-right">
                        <span className="inline-flex items-center font-mono font-bold text-rose-600 dark:text-rose-400 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-100 dark:border-rose-900/50 text-xs">
                          <Receipt className="w-3 h-3 mr-1" />
                          {formatCurrency(item.totalPurchases)}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.vendorBills?.length || 0} fact.{item.manualAnalyticLines && item.manualAnalyticLines.length > 0 ? ` + ${item.manualAnalyticLines.length} dir.` : ''}
                        </div>
                      </td>

                      {/* Column 7: Statut Facturation */}
                      <td className="px-3 py-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          À facturer
                        </span>
                      </td>

                      {/* Column 8: Marge Estimée */}
                      <td className="px-4 py-4 text-right">
                        <div className={`font-mono font-bold text-xs ${
                          item.grossMargin < 0 
                            ? 'text-rose-600 dark:text-rose-400' 
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {formatCurrency(item.grossMargin)}
                        </div>
                        <div className={`text-[11px] font-semibold ${
                          item.grossMargin < 0 
                            ? 'text-rose-700 dark:text-rose-400' 
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}>
                          {item.marginRate}%
                        </div>
                      </td>

                      {/* Column 9: Actions */}
                      <td className="px-3 py-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDrilldown(item);
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-purple-600 hover:text-white dark:hover:bg-purple-600 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                          title="Voir le détail des feuilles de temps et achats"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer Totals */}
              <tfoot className="bg-slate-50 dark:bg-slate-800/90 font-bold border-t-2 border-slate-300 dark:border-slate-700 text-xs">
                <tr>
                  <td className="px-5 py-3 text-slate-900 dark:text-white">
                    TOTAL ({filteredRecords.length} affaires)
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-purple-700 dark:text-purple-300">
                    {formatCurrency(filteredRecords.reduce((s, r) => s + r.amount_untaxed, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-blue-700 dark:text-blue-300">
                    {Math.round(filteredRecords.reduce((s, r) => s + r.totalHours, 0) * 10) / 10} h
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-amber-700 dark:text-amber-300">
                    {formatCurrency(filteredRecords.reduce((s, r) => s + (r.valuation77_76 || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-700 dark:text-indigo-300">
                    {formatCurrency(filteredRecords.reduce((s, r) => s + (r.valuation90 || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-rose-700 dark:text-rose-300">
                    {formatCurrency(filteredRecords.reduce((s, r) => s + r.totalPurchases, 0))}
                  </td>
                  <td className="px-3 py-3 text-center text-slate-500">
                    —
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(filteredRecords.reduce((s, r) => s + r.grossMargin, 0))}
                  </td>
                  <td className="px-3 py-3 text-center text-slate-500">
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
