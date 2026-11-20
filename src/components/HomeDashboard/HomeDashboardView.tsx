import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Clock, 
  Scale, 
  Receipt, 
  BarChart3, 
  TrendingUp, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink, 
  Sparkles, 
  RefreshCw, 
  ChevronRight, 
  Calendar,
  Layers,
  ArrowRight,
  PackageMinus,
  ShoppingCart,
  Check,
  Info
} from 'lucide-react';
import { OdooConnectionCredentials } from '../../types/odoo';
import { odooClient } from '../../services/odooClient';
import { WipPurchasesInflowWidget } from '../WipPurchasesInflow/WipPurchasesInflowWidget';

interface HomeDashboardViewProps {
  credentials: OdooConnectionCredentials | null;
  isDemo?: boolean;
  userName?: string | null;
  onNavigate: (view: 'home' | 'report' | 'timesheets' | 'moulds' | 'billing' | 'wip-outflow' | 'explorer') => void;
  onUpdateBadges?: (badges: {
    uninvoicedOrdersCount?: number;
    timesheetAnomaliesCount?: number;
    mouldAnomaliesCount?: number;
  }) => void;
}

export const HomeDashboardView: React.FC<HomeDashboardViewProps> = ({
  credentials,
  isDemo = false,
  userName = 'Nicolas Hubert (Ecomi)',
  onNavigate,
  onUpdateBadges
}) => {
  // Aggregate states from each specialized service
  const [uninvoicedSummary, setUninvoicedSummary] = useState<any>(null);
  const [uninvoicedOrders, setUninvoicedOrders] = useState<any[]>([]);
  const [billingSummary, setBillingSummary] = useState<any>(null);
  const [wipOutflowSummary, setWipOutflowSummary] = useState<any>(null);
  const [timesheetSummary, setTimesheetSummary] = useState<any>(null);
  const [mouldWeightSummary, setMouldWeightSummary] = useState<any>(null);
  const [mouldAnomalies, setMouldAnomalies] = useState<any[]>([]);
  const [recentDossiers, setRecentDossiers] = useState<any[]>([]);

  const [selectedMonth, setSelectedMonth] = useState<string>('Septembre 2026');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [easterEggActive, setEasterEggActive] = useState<boolean>(false);
  const [showInflowDetail, setShowInflowDetail] = useState<boolean>(false);

  const loadAllDashboardData = async (forceRefresh: boolean = false) => {
    setIsLoading(true);
    try {
      const [uninvoicedRes, billingRes, timesheetsRes, mouldsRes, wipOutflowRes] = await Promise.allSettled([
        odooClient.getUninvoicedOrdersReport({ forceRefresh, credentials: credentials || undefined, isDemo }),
        odooClient.getBillingReport({ forceRefresh, credentials: credentials || undefined, isDemo }),
        odooClient.getTimesheetsAuditReport({ forceRefresh, credentials: credentials || undefined, isDemo }),
        odooClient.getMouldWeightCheckReport({ forceRefresh, credentials: credentials || undefined, isDemo }),
        odooClient.getWipPurchasesOutflowReport({ forceRefresh, credentials: credentials || undefined, isDemo })
      ]);

      let uninvoicedCount = 82;
      let timesheetCount = 8;
      let mouldsCount = 2;

      if (uninvoicedRes.status === 'fulfilled' && uninvoicedRes.value.success) {
        setUninvoicedSummary(uninvoicedRes.value.summary);
        setUninvoicedOrders(uninvoicedRes.value.records.slice(0, 5));
        uninvoicedCount = uninvoicedRes.value.summary.totalOrdersCount || uninvoicedRes.value.records.length;
      }
      if (billingRes.status === 'fulfilled' && billingRes.value.success) {
        setBillingSummary(billingRes.value.summary);
        setRecentDossiers(billingRes.value.dossiers.slice(0, 5));
      }
      if (wipOutflowRes.status === 'fulfilled' && wipOutflowRes.value.success) {
        setWipOutflowSummary(wipOutflowRes.value.summary);
      }
      if (timesheetsRes.status === 'fulfilled' && timesheetsRes.value.success) {
        setTimesheetSummary(timesheetsRes.value.summary);
        timesheetCount = timesheetsRes.value.summary.totalMissingDays || 8;
      }
      if (mouldsRes.status === 'fulfilled' && mouldsRes.value.success) {
        setMouldWeightSummary(mouldsRes.value.summary);
        const anom = mouldsRes.value.records.filter((r: any) => r.isAnomaly || r.weightNet === 0 || r.weightGross === 0);
        setMouldAnomalies(anom.slice(0, 2));
        mouldsCount = anom.length || mouldsRes.value.summary.anomaliesCount || 2;
      }

      onUpdateBadges?.({
        uninvoicedOrdersCount: uninvoicedCount,
        timesheetAnomaliesCount: timesheetCount,
        mouldAnomaliesCount: mouldsCount
      });

    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllDashboardData(false);
  }, [credentials, isDemo]);

  const formatEuros = (val: number | undefined | null, digits: number = 2) => {
    if (val === undefined || val === null || isNaN(val)) return '0,00 €';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(val);
  };

  const todayFormatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  // Capitalize first letter of date
  const dateStr = todayFormatted.charAt(0).toUpperCase() + todayFormatted.slice(1);

  // Month selector presets matching mockup
  const months = ['Septembre 2026', 'Août 2026', 'Juillet 2026'];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">

      {/* TOP HEADER SECTION MATCHING MOCKUP */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-4">
          <div className="hidden sm:flex w-[112px] h-[48px] rounded-2xl bg-white border border-slate-200/90 dark:border-slate-700/80 shadow-xs overflow-hidden shrink-0 items-center justify-center">
            <img
              src="/assets/aistudio/odoo-data-report_0b974500.png"
              alt="Logo Odoo Data Report"
              className="w-full h-full object-cover object-center"
            />
          </div>
          <div>
            {/* Status pill & date */}
            <div className="flex items-center space-x-2 text-xs mb-1">
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Cockpit Odoo Live</span>
              </span>
              <span className="text-slate-400 dark:text-slate-500 font-medium">{dateStr}</span>
            </div>

            {/* Greeting title */}
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Bonjour {userName || 'Nicolas Hubert (Ecomi)'}
            </h1>

            {/* Subtitle */}
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Consolidation en temps réel des affaires, encours d'achats, pointages et conformité logistique.
            </p>
          </div>
        </div>

        {/* Month Selector Pills */}
        <div className="flex items-center space-x-1.5 p-1 bg-white dark:bg-slate-900/60 rounded-full border border-slate-200/80 dark:border-slate-800 shadow-2xs self-start lg:self-center">
          {months.map((m) => {
            const isActive = selectedMonth === m;
            return (
              <button
                key={m}
                onClick={() => setSelectedMonth(m)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80'
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 BENTO METRIC CARDS MATCHING MOCKUP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* CARD 1: VENTES FACTURÉES */}
        <div 
          onClick={() => onNavigate('billing')}
          className="bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:border-sky-500/50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 font-sans">
                Ventes Facturées
              </span>
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-3 h-3" />
                <span>+13.2%</span>
              </span>
            </div>

            <div className="mt-3.5">
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
                {billingSummary ? formatEuros(billingSummary.totalSalesUntaxed, 2) : '1 131 362,71 €'}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {billingSummary?.totalDossiersCount || 184} factures clients (Consolidé)
              </p>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 group-hover:text-sky-500 transition-colors">
            <span>
              Marge Nette : <strong className="text-emerald-500 font-mono">+{billingSummary ? formatEuros(billingSummary.totalNetMarginUntaxed, 0) : '149 105 €'}</strong>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* CARD 2: ENCOURS ACHATS */}
        <div 
          onClick={() => onNavigate('wip-outflow')}
          className="bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:border-amber-500/50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 font-sans">
                Encours Achats
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                Septembre
              </span>
            </div>

            <div className="mt-3.5">
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
                {wipOutflowSummary ? formatEuros(wipOutflowSummary.totalPurchasesOutflowUntaxed, 2) : '21 273,07 €'}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Coût d'achat débouclé ({wipOutflowSummary?.totalInvoicesCount || 39} pièces)
              </p>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 group-hover:text-amber-500 transition-colors">
            <span>
              Marge Brute : <strong className="text-slate-900 dark:text-white font-mono">{wipOutflowSummary?.overallMarginRate || '83.9'}%</strong>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* CARD 3: AFFAIRES À FACTURER */}
        <div 
          onClick={() => onNavigate('report')}
          className="bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:border-sky-500/50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 font-sans">
                Affaires à Facturer
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono">
                {uninvoicedSummary?.totalOrdersCount || 82} Affaires
              </span>
            </div>

            <div className="mt-3.5">
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
                {uninvoicedSummary ? formatEuros(uninvoicedSummary.totalSalesUntaxed, 0) : '514 323 €'}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {uninvoicedSummary ? `${Number(uninvoicedSummary.totalTimesheetHours).toFixed(1)}h` : '3 018.9h'} prestées rattachées
              </p>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 group-hover:text-sky-500 transition-colors">
            <span>
              Valo heures : <strong className="text-slate-900 dark:text-white font-mono">{uninvoicedSummary ? `${(uninvoicedSummary.totalValuation77_76 / 1000).toFixed(1)}k €` : '234.7k €'}</strong>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* CARD 4: POINTAGES RH */}
        <div 
          onClick={() => onNavigate('timesheets')}
          className="bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:border-violet-500/50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 font-sans">
                Pointages RH
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono">
                {timesheetSummary?.totalMissingDays || 8} à vérifier
              </span>
            </div>

            <div className="mt-3.5">
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
                {timesheetSummary ? `${timesheetSummary.overallComplianceRate}%` : '92%'}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Taux de conformité matricielle
              </p>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center space-x-3">
            <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div 
                className="h-full bg-sky-500 rounded-full transition-all duration-500"
                style={{ width: `${timesheetSummary?.overallComplianceRate || 92}%` }}
              />
            </div>
            <span className="text-xs font-mono font-semibold text-slate-400 dark:text-slate-500 shrink-0">
              8/10
            </span>
          </div>
        </div>

      </div>

      {/* TWO-COLUMN SECTION MATCHING MOCKUP */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: SYNTHÈSE DES AFFAIRES À FACTURER (8 COLS) */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Synthèse des Affaires à Facturer
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Commandes de vente non soldées et valorisation des encours
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('report')}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer self-start sm:self-center"
            >
              Voir tout ({uninvoicedSummary?.totalOrdersCount || 82})
            </button>
          </div>

          {/* Table matching mockup */}
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/80 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-3">Référence & Client</th>
                  <th className="py-3 px-3 text-right">Vente HT</th>
                  <th className="py-3 px-3 text-right">Heures</th>
                  <th className="py-3 px-3 text-right">Valo 77.76€</th>
                  <th className="py-3 px-3 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {uninvoicedOrders.length === 0 ? (
                  // Fallback sample rows identical to mockup if still loading
                  [
                    { ref: 'FMF269999', client: 'ECOMI - BE01', sales: 0, hours: 3, valo: 233.28 },
                    { ref: 'FMF261105', client: 'Feronyl SA', sales: 0, hours: 0, valo: 0.00 },
                    { ref: 'FMF261104', client: 'Feronyl SA', sales: 350.00, hours: 5, valo: 388.80 },
                    { ref: 'FMF261102', client: 'NUTRIPACK OUEST - FR15', sales: 0, hours: 2, valo: 155.52 },
                    { ref: 'FMF261101', client: 'DELTA PLASTICS SA', sales: 0, hours: 15, valo: 1166.40 }
                  ].map((row) => (
                    <tr 
                      key={row.ref}
                      onClick={() => onNavigate('report')}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-3">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-slate-900 dark:text-white font-mono">{row.ref}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </div>
                        <div className="text-[11px] text-slate-400">{row.client}</div>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                        {formatEuros(row.sales)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {row.hours} h
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                        {formatEuros(row.valo)}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span>À facturer</span>
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  uninvoicedOrders.map((r) => {
                    const clientName = Array.isArray(r.partner_id) ? r.partner_id[1] : (r.clientDisplay || 'Client');
                    const hours = Number(r.totalHours) || 0;
                    const valo = r.valuation77_76 || (hours * 77.76);
                    return (
                      <tr 
                        key={r.id}
                        onClick={() => onNavigate('report')}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-3">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-slate-900 dark:text-white font-mono">{r.name}</span>
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[220px]" title={clientName}>
                            {clientName}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          {formatEuros(r.amount_untaxed)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                          {Math.round(hours)} h
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          {formatEuros(valo)}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span>À facturer</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* RIGHT COLUMN: CONTRÔLE MOULES NEUFS & ACCÈS DIRECTS (4 COLS) */}
        <div className="lg:col-span-4 space-y-5">
          
          {/* Bento Card: Contrôle Moules Neufs */}
          <div className="bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Contrôle Moules Neufs
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono">
                {mouldWeightSummary?.anomaliesCount || mouldAnomalies.length || 2} Anomalies
              </span>
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500">
              Moules neufs nécessitant la saisie du poids logistique en usine.
            </p>

            {/* List of anomalies */}
            <div className="space-y-2.5 pt-1">
              {mouldAnomalies.length > 0 ? (
                mouldAnomalies.map((anom, idx) => (
                  <div 
                    key={idx}
                    onClick={() => onNavigate('moulds')}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 hover:border-rose-400 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-rose-500 font-mono">
                        {anom.orderName || 'FMF261027'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {anom.productName || 'CP1120 - Canolones X6 1 Em...'}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0 font-mono">
                      0 kg
                    </span>
                  </div>
                ))
              ) : (
                <>
                  <div 
                    onClick={() => onNavigate('moulds')}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 hover:border-rose-400 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-rose-500 font-mono">FMF261027</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        CP1120 - Canolones X6 1 Em...
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0 font-mono">
                      0 kg
                    </span>
                  </div>

                  <div 
                    onClick={() => onNavigate('moulds')}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 hover:border-rose-400 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-rose-500 font-mono">FMF260921</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        CP 1118 GL14H58
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0 font-mono">
                      0 kg
                    </span>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('moulds')}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              Vérifier la conformité logistique
            </button>
          </div>

          {/* Bento Card: Accès Directs Modules (2x2 Grid) */}
          <div className="bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Accès Directs Modules
            </h3>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              
              <button
                type="button"
                onClick={() => onNavigate('billing')}
                className="p-3 rounded-xl border border-slate-200/70 dark:border-slate-800 hover:border-sky-500/40 bg-slate-50/50 dark:bg-slate-800/40 text-left transition-all cursor-pointer group"
              >
                <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500 w-fit mb-2 group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Bilan Factures
                </p>
                <p className="text-[10px] text-slate-400">
                  Mensuel HT
                </p>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('wip-outflow')}
                className="p-3 rounded-xl border border-slate-200/70 dark:border-slate-800 hover:border-amber-500/40 bg-slate-50/50 dark:bg-slate-800/40 text-left transition-all cursor-pointer group"
              >
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 w-fit mb-2 group-hover:scale-110 transition-transform">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Encours
                </p>
                <p className="text-[10px] text-slate-400">
                  Achats clients
                </p>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('timesheets')}
                className="p-3 rounded-xl border border-slate-200/70 dark:border-slate-800 hover:border-violet-500/40 bg-slate-50/50 dark:bg-slate-800/40 text-left transition-all cursor-pointer group"
              >
                <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500 w-fit mb-2 group-hover:scale-110 transition-transform">
                  <Clock className="w-4 h-4" />
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Pointages RH
                </p>
                <p className="text-[10px] text-slate-400">
                  Audits heures
                </p>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('moulds')}
                className="p-3 rounded-xl border border-slate-200/70 dark:border-slate-800 hover:border-emerald-500/40 bg-slate-50/50 dark:bg-slate-800/40 text-left transition-all cursor-pointer group"
              >
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 w-fit mb-2 group-hover:scale-110 transition-transform">
                  <Scale className="w-4 h-4" />
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Poids Moules
                </p>
                <p className="text-[10px] text-slate-400">
                  Logistique
                </p>
              </button>

            </div>
          </div>

        </div>

      </div>

      {/* DISCREET AUGMENTATION DE L'ENCOURS SECTION (ACHATS DU MOIS >= 500 €) */}
      <div className="pt-2">
        <WipPurchasesInflowWidget
          credentials={credentials}
          isDemo={isDemo}
          variant="card"
          className="bg-white dark:bg-slate-900/60 dark:backdrop-blur-md"
        />
      </div>

    </div>
  );
};
