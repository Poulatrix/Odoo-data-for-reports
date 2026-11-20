import React, { useState } from 'react';
import { 
  X, 
  Clock, 
  Receipt, 
  TrendingUp, 
  TrendingDown,
  User, 
  Calendar, 
  Building2, 
  FileText, 
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  DollarSign,
  Briefcase,
  Layers,
  Sparkles,
  ShoppingBag,
  PackageCheck
} from 'lucide-react';
import { UninvoicedOrderReportItem } from '../../types/odoo';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters';

interface ReportOrderDrilldownModalProps {
  order: UninvoicedOrderReportItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReportOrderDrilldownModal: React.FC<ReportOrderDrilldownModalProps> = ({
  order,
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'timesheets' | 'purchases' | 'purchase_orders' | 'manual_analytic'>('overview');

  if (!isOpen || !order) return null;

  const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1] : (order.partner_id || 'Client');
  const analyticName = Array.isArray(order.analytic_account_id) ? order.analytic_account_id[1] : 'Non défini';
  const commercialName = Array.isArray(order.user_id) ? order.user_id[1] : 'Non assigné';

  const vendorBillsTotal = order.vendorBillsTotal ?? (order.vendorBills || []).reduce((sum, pl) => sum + (Number(pl.price_subtotal) || Number(pl.debit) || 0), 0);
  const manualAnalyticCostsTotal = order.manualAnalyticCostsTotal ?? (order.manualAnalyticLines || []).reduce((sum, mal) => sum + (Number(mal.amount) || 0), 0);
  const purchaseOrdersPending = order.purchaseOrdersPending ?? (order.purchaseOrderLines || []).reduce((sum, pol) => sum + (Number(pol.amount_to_invoice) || 0), 0);
  const totalCommittedCosts = order.totalCommittedCosts ?? Math.round((vendorBillsTotal + manualAnalyticCostsTotal + purchaseOrdersPending) * 100) / 100;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
      <div 
        id="order-drilldown-modal-container"
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200/80 dark:border-slate-800 w-full max-w-7xl max-h-[95vh] flex flex-col overflow-hidden transition-colors my-auto"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/70 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
              <Briefcase className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {order.name}
                </h3>
                <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60">
                  À facturer
                </span>
                <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                  Commande confirmée
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-slate-700 dark:text-slate-300">{partnerName}</span>
                <span>•</span>
                <span>Compte analytique : <strong className="font-mono text-slate-700 dark:text-slate-300">{analyticName}</strong></span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 px-6 pt-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto shrink-0 scrollbar-thin">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-3 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'overview'
                ? 'border-sky-500 text-sky-600 dark:border-sky-400 dark:text-sky-300 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Synthèse & Rentabilité</span>
          </button>

          <button
            onClick={() => setActiveTab('timesheets')}
            className={`pb-3 px-3 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'timesheets'
                ? 'border-sky-500 text-sky-600 dark:border-sky-400 dark:text-sky-300 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Feuilles de Temps ({order.timesheets?.length || 0})</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-mono font-medium">
              {order.totalHours} hrs
            </span>
          </button>

          <button
            onClick={() => setActiveTab('purchases')}
            className={`pb-3 px-3 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'purchases'
                ? 'border-sky-500 text-sky-600 dark:border-sky-400 dark:text-sky-300 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Factures Fournisseurs ({order.vendorBills?.length || 0})</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-mono font-medium">
              {formatCurrency(vendorBillsTotal)}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('purchase_orders')}
            className={`pb-3 px-3 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'purchase_orders'
                ? 'border-sky-500 text-sky-600 dark:border-sky-400 dark:text-sky-300 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>BDC Fournisseurs en Cours ({order.purchaseOrderLines?.length || 0})</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/50 font-mono font-medium">
              {formatCurrency(purchaseOrdersPending)}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('manual_analytic')}
            className={`pb-3 px-3 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'manual_analytic'
                ? 'border-sky-500 text-sky-600 dark:border-sky-400 dark:text-sky-300 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Achats Matériel & Écritures Analytiques Directes ({order.manualAnalyticLines?.length || 0})</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono font-medium">
              {formatCurrency(manualAnalyticCostsTotal)}
            </span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-6">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Financial Balance Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    1. Montant Vente (€ HT)
                  </div>
                  <div className="text-base sm:text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                    {formatCurrency(order.amount_untaxed)}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    TTC : {formatCurrency(order.amount_total)}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <div className="text-xs font-medium text-rose-700 dark:text-rose-400 flex items-center gap-1">
                    <Receipt className="w-3.5 h-3.5 text-rose-500" />
                    <span>2. Factures Fournisseurs</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold font-mono text-rose-700 dark:text-rose-400 mt-1">
                    {formatCurrency(vendorBillsTotal)}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    {order.vendorBills?.length || 0} pièce(s) comptabilisée(s)
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <div className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <ShoppingBag className="w-3.5 h-3.5 text-amber-500" />
                    <span>3. BDC Achats Engagés</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold font-mono text-amber-700 dark:text-amber-400 mt-1">
                    {formatCurrency(purchaseOrdersPending)}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    {order.purchaseOrderLines?.length || 0} commande(s) non facturée(s)
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <div className="text-xs font-medium text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    <span>4. Écritures Pragma</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold font-mono text-indigo-700 dark:text-indigo-400 mt-1">
                    {formatCurrency(manualAnalyticCostsTotal)}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    {order.manualAnalyticLines?.length || 0} écriture(s) directe(s)
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    {order.grossMargin < 0 ? (
                      <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                    ) : (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    <span>5. Marge Réelle Estimée</span>
                  </div>
                  <div className={`text-base sm:text-lg font-bold font-mono mt-1 ${
                    order.grossMargin < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {formatCurrency(order.grossMargin)}
                  </div>
                  <div className={`text-[11px] mt-1 font-semibold ${
                    order.grossMargin < 0 ? 'text-rose-600/80 dark:text-rose-400/80' : 'text-emerald-600/80 dark:text-emerald-400/80'
                  }`}>
                    Taux : {order.marginRate}% (Coûts : {formatCurrency(totalCommittedCosts)})
                  </div>
                </div>
              </div>

              {/* Hourly Valuations Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-850/60 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="text-xs font-medium uppercase tracking-wider">Valorisation Heures (77,76 €/h)</span>
                    <Clock className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="text-xl font-semibold font-mono text-slate-900 dark:text-white mt-2">
                    {formatCurrency(order.valuation77_76)}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-normal">
                    Calcul : {order.totalHours} hrs prestées × 77,76 € HT / heure
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-850/60 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="text-xs font-medium uppercase tracking-wider">Valorisation Heures (90,00 €/h)</span>
                    <Clock className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="text-xl font-semibold font-mono text-slate-900 dark:text-white mt-2">
                    {formatCurrency(order.valuation90)}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-normal">
                    Calcul : {order.totalHours} hrs prestées × 90,00 € HT / heure
                  </div>
                </div>
              </div>

              {/* Order Metadata Grid */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  Informations de la Commande Client
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block">Date de commande</span>
                    <span className="font-medium text-slate-900 dark:text-white mt-0.5 block">
                      {formatDate(order.date_order, true)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block">Commercial</span>
                    <span className="font-medium text-slate-900 dark:text-white mt-0.5 block">
                      {commercialName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block">Heures prestées</span>
                    <span className="font-semibold font-mono text-slate-900 dark:text-white mt-0.5 block">
                      {order.totalHours} hrs
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block">Marge par heure</span>
                    <span className={`font-semibold font-mono mt-0.5 block ${
                      (order.hourlyMarginRate || 0) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {order.hourlyMarginRate !== undefined ? `${formatCurrency(order.hourlyMarginRate)} / h` : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick links to details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  onClick={() => setActiveTab('timesheets')}
                  className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between text-xs transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-200">
                        Feuilles de temps
                      </div>
                      <div className="text-slate-400 dark:text-slate-500 text-[11px]">
                        {order.timesheets?.length || 0} entrées ({order.totalHours} hrs)
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                </button>

                <button
                  onClick={() => setActiveTab('purchases')}
                  className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between text-xs transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-200">
                        Factures fournisseurs
                      </div>
                      <div className="text-slate-400 dark:text-slate-500 text-[11px]">
                        {order.vendorBills?.length || 0} pièces ({formatCurrency(vendorBillsTotal)})
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                </button>

                <button
                  onClick={() => setActiveTab('purchase_orders')}
                  className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between text-xs transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-200">
                        BDC en cours
                      </div>
                      <div className="text-slate-400 dark:text-slate-500 text-[11px]">
                        {order.purchaseOrderLines?.length || 0} lignes ({formatCurrency(purchaseOrdersPending)})
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                </button>

                <button
                  onClick={() => setActiveTab('manual_analytic')}
                  className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between text-xs transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-200">
                        Écritures Pragma
                      </div>
                      <div className="text-slate-400 dark:text-slate-500 text-[11px]">
                        {order.manualAnalyticLines?.length || 0} lignes ({formatCurrency(manualAnalyticCostsTotal)})
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: TIMESHEETS (account.analytic.line) */}
          {activeTab === 'timesheets' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                    Feuilles de Temps Prestées (`account.analytic.line`)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Heures enregistrées et rattachées au compte analytique de l'affaire
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-xs font-medium font-mono px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    Total : {order.totalHours} hrs
                  </div>
                  <div className="text-xs font-medium font-mono px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    Valo 77,76 € : {formatCurrency(order.valuation77_76)}
                  </div>
                  <div className="text-xs font-medium font-mono px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    Valo 90,00 € : {formatCurrency(order.valuation90)}
                  </div>
                </div>
              </div>

              {order.timesheets && order.timesheets.length > 0 ? (
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto shadow-xs bg-white dark:bg-slate-900">
                  <table className="w-full min-w-[650px] text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200 dark:border-slate-800 select-none">
                      <tr>
                        <th className="px-4 py-3 whitespace-nowrap">Date</th>
                        <th className="px-4 py-3 whitespace-nowrap">Intervenant / Utilisateur</th>
                        <th className="px-4 py-3 min-w-[200px]">Description de la prestation</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap">Heures prestées</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {order.timesheets.map((ts, idx) => {
                        const effectiveHours = ts.effective_hours !== undefined 
                          ? ts.effective_hours 
                          : ((ts.amount !== undefined && ts.amount > 0) ? -Math.abs(ts.unit_amount) : ts.unit_amount);
                        const isTransfer = effectiveHours < 0 || (ts.amount !== undefined && ts.amount > 0);

                        return (
                          <tr key={ts.id || idx} className={`hover:bg-blue-50/40 dark:hover:bg-slate-800/40 ${isTransfer ? 'bg-amber-50/30 dark:bg-amber-950/20' : ''}`}>
                            <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
                              {formatDate(ts.date)}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {Array.isArray(ts.user_id) ? ts.user_id[1] : (Array.isArray(ts.employee_id) ? ts.employee_id[1] : 'Collaborateur')}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium text-slate-800 dark:text-slate-200">{ts.name || 'Prestation'}</span>
                                {isTransfer && (
                                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-900/50">
                                    Transfert / Régulation d'encours
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-medium whitespace-nowrap">
                              {effectiveHours < 0 ? (
                                <span className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-200/80 dark:border-rose-900/50">
                                  {formatNumber(effectiveHours, 1)} hrs
                                </span>
                              ) : (
                                <span className="text-sky-700 dark:text-sky-300 font-bold bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded-md border border-sky-200 dark:border-sky-800">
                                  {formatNumber(effectiveHours, 1)} hrs
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 font-bold text-xs">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 font-bold">
                          Total Heures Prestées :
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-sky-700 dark:text-sky-300 whitespace-nowrap">
                          {order.totalHours} hrs
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700 text-slate-500 text-xs">
                  Aucune feuille de temps enregistrée pour cette affaire.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PURCHASES (account.move.line) */}
          {activeTab === 'purchases' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                    Achats Fournisseurs Facturés & Bons de Commande (`account.move.line` / `account.analytic.line`)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Lignes de factures fournisseurs comptabilisées (`posted`) ou achats analytiques rattachés
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {order.vendorBills?.length || 0} ligne(s)
                  </span>
                  <div className="text-xs font-medium font-mono px-3 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                    Total Factures : {formatCurrency(vendorBillsTotal)}
                  </div>
                </div>
              </div>

              {order.vendorBills && order.vendorBills.length > 0 ? (
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto shadow-xs bg-white dark:bg-slate-900">
                  <table className="w-full min-w-[750px] text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200 dark:border-slate-800 select-none">
                      <tr>
                        <th className="px-4 py-3 whitespace-nowrap">Date</th>
                        <th className="px-4 py-3 whitespace-nowrap">N° Pièce / Réf</th>
                        <th className="px-4 py-3 min-w-[150px]">Fournisseur</th>
                        <th className="px-4 py-3 min-w-[220px]">Libellé / Article</th>
                        <th className="px-4 py-3 text-center whitespace-nowrap">Statut</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap">Montant Imputé (€ HT)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {order.vendorBills.map((bill, idx) => {
                        const isProrated = bill.prorata_percentage !== undefined && bill.prorata_percentage < 100;
                        const refText = bill.ref || (Array.isArray(bill.move_id) ? bill.move_id[1] : (Array.isArray(bill.purchase_line_id) ? bill.purchase_line_id[1] : 'Facture'));

                        return (
                          <tr key={bill.id || idx} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                              {formatDate(bill.date)}
                            </td>
                            <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {refText}
                            </td>
                            <td className="px-4 py-3 text-slate-700 dark:text-slate-200 font-medium">
                              {Array.isArray(bill.partner_id) ? bill.partner_id[1] : 'Fournisseur'}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-800 dark:text-slate-200">{bill.name || 'Achat sous-traitance'}</span>
                                {isProrated && (
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                    Ventilation analytique : {bill.prorata_percentage}% ({formatCurrency(bill.original_price_subtotal || bill.price_subtotal)})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                                Comptabilisé
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-rose-700 dark:text-rose-300 whitespace-nowrap">
                              <div className="flex flex-col items-end">
                                <span>{formatCurrency(bill.price_subtotal)}</span>
                                {isProrated && (
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                                    ({bill.prorata_percentage}%)
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 font-bold text-xs">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 font-bold">
                          Total Factures Fournisseurs (€ HT) :
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-rose-700 dark:text-rose-300 whitespace-nowrap">
                          {formatCurrency(vendorBillsTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700 text-slate-500 text-xs">
                  Aucun achat fournisseur facturé n'est actuellement rattaché à cette affaire.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PURCHASE ORDERS IN PROGRESS (purchase.order.line) */}
          {activeTab === 'purchase_orders' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4 text-slate-500" />
                    <span>Bons de Commande Fournisseurs en Cours (`purchase.order.line`)</span>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Commandes confirmées (<code className="text-slate-700 dark:text-slate-300 font-mono text-[10px]">state IN ('purchase', 'done')</code>) — Reste engagé à facturer
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {order.purchaseOrderLines?.length || 0} ligne(s)
                  </span>
                  <div className="text-xs font-medium font-mono px-3 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60">
                    Total Engagé Non Facturé : {formatCurrency(purchaseOrdersPending)}
                  </div>
                </div>
              </div>

              {order.purchaseOrderLines && order.purchaseOrderLines.length > 0 ? (
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto shadow-xs bg-white dark:bg-slate-900">
                  <table className="w-full min-w-[900px] text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200 dark:border-slate-800 select-none">
                      <tr>
                        <th className="px-4 py-3 whitespace-nowrap">Date BDC</th>
                        <th className="px-4 py-3 whitespace-nowrap">N° Commande (PO)</th>
                        <th className="px-4 py-3 min-w-[170px]">Fournisseur</th>
                        <th className="px-4 py-3 min-w-[200px]">Article / Désignation</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">Qté Commandée</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">Qté Facturée</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">Reste à Facturer</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap">Prix Unit. HT</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap">Montant Restant (€ HT)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {order.purchaseOrderLines.map((pol, idx) => {
                        const poName = pol.order_name || (Array.isArray(pol.order_id) ? pol.order_id[1] : 'PO');
                        const partner = Array.isArray(pol.partner_id) ? pol.partner_id[1] : (typeof pol.partner_id === 'string' ? pol.partner_id : 'Fournisseur');
                        const productName = pol.name || (Array.isArray(pol.product_id) ? pol.product_id[1] : 'Article');
                        const prorata = pol.prorata_percentage ?? 100;

                        return (
                          <tr key={pol.id || idx} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                              {formatDate(pol.date_order || pol.date_approve)}
                            </td>
                            <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {poName}
                            </td>
                            <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-medium">
                              {partner}
                            </td>
                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                              <div className="font-medium text-slate-800 dark:text-slate-200">{productName}</div>
                              {prorata < 100 && (
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                  Ventilation : {prorata}% sur ce dossier
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {pol.product_qty}
                            </td>
                            <td className="px-3 py-3 text-center font-mono text-slate-400 whitespace-nowrap">
                              {pol.qty_invoiced}
                            </td>
                            <td className="px-3 py-3 text-center font-mono font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                              {pol.qty_to_invoice}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {formatCurrency(pol.price_unit)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                              {formatCurrency(pol.amount_to_invoice)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 font-bold text-xs">
                      <tr>
                        <td colSpan={8} className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 font-bold">
                          Total Bons de Commande Fournisseurs Engagés Non Facturés (€ HT) :
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                          {formatCurrency(purchaseOrdersPending)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700 text-slate-500 text-xs">
                  Aucun bon de commande d'achat engagé en attente de facturation pour cette affaire.
                </div>
              )}
            </div>
          )}

          {/* TAB 5: MANUAL ANALYTIC ENTRIES & PRAGMA (account.analytic.line where move_line_id = False) */}
          {activeTab === 'manual_analytic' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-slate-500" />
                    <span>Écritures Analytiques Directes & Régulations d'Encours / Pragma (`account.analytic.line`)</span>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Coûts directs saisis manuellement sans facture d'achat liée (<code className="text-slate-700 dark:text-slate-300 font-mono text-[10px]">move_line_id = False</code>)
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {order.manualAnalyticLines?.length || 0} écriture(s)
                  </span>
                  <div className="text-xs font-medium font-mono px-3 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                    Total Direct / Pragma : {formatCurrency(manualAnalyticCostsTotal)}
                  </div>
                </div>
              </div>

              {order.manualAnalyticLines && order.manualAnalyticLines.length > 0 ? (
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto shadow-xs bg-white dark:bg-slate-900">
                  <table className="w-full min-w-[850px] text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 dark:bg-slate-850 text-slate-500 dark:text-slate-400 text-[11px] font-medium uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-3 font-medium whitespace-nowrap">Date</th>
                        <th className="px-4 py-3 font-medium min-w-[180px]">Libellé / Description</th>
                        <th className="px-4 py-3 font-medium min-w-[150px]">Fournisseur / Réf</th>
                        <th className="px-4 py-3 font-medium min-w-[140px]">Compte Analytique</th>
                        <th className="px-4 py-3 font-medium text-center whitespace-nowrap">Quantité / Unité</th>
                        <th className="px-4 py-3 font-medium whitespace-nowrap">Saisie / Auteur</th>
                        <th className="px-4 py-3 font-medium text-center whitespace-nowrap">Origine Odoo</th>
                        <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Coût Imputé (€ HT)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {order.manualAnalyticLines.map((mal, idx) => {
                        const isTransport = String(mal.name || '').toUpperCase().includes('TRANSPORT') ||
                          (mal.partner_id && Array.isArray(mal.partner_id) && String(mal.partner_id[1]).toUpperCase().includes('TRANSPORT'));
                        const isMaterial = !isTransport && (mal.category === 'material' || (Array.isArray(mal.account_id) && String(mal.account_id[1]).toUpperCase().includes('MOU500')));
                        const uomStr = Array.isArray(mal.product_uom_id) ? mal.product_uom_id[1] : (typeof mal.product_uom_id === 'string' ? mal.product_uom_id : '');
                        const qtyStr = mal.unit_amount && mal.unit_amount > 0 ? `${mal.unit_amount} ${uomStr || 'unités'}` : '—';
                        const partnerStr = Array.isArray(mal.partner_id) ? mal.partner_id[1] : (typeof mal.partner_id === 'string' ? mal.partner_id : '');

                        return (
                          <tr key={mal.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
                              {formatDate(mal.date)}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium text-slate-800 dark:text-slate-200">{mal.name || 'Écriture directe'}</span>
                                {isTransport ? (
                                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                    Transport / Frais
                                  </span>
                                ) : isMaterial ? (
                                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                                    Achat Matériel / Non-heures
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60">
                                    Régulation Pragma
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-[11px]">
                              {partnerStr ? (
                                <div>
                                  <span className="font-medium text-slate-800 dark:text-slate-200">{partnerStr}</span>
                                  {mal.ref && <span className="text-slate-400 dark:text-slate-500 ml-1 font-mono">({mal.ref})</span>}
                                </div>
                              ) : mal.ref ? (
                                <span className="font-mono text-slate-500">Réf: {mal.ref}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                              {Array.isArray(mal.account_id) ? mal.account_id[1] : (analyticName || '—')}
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {qtyStr}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {Array.isArray(mal.user_id) ? mal.user_id[1] : (Array.isArray(mal.employee_id) ? mal.employee_id[1] : 'Manuel')}
                            </td>
                            <td className="px-4 py-2.5 text-center whitespace-nowrap">
                              {(() => {
                                const odooVal = mal.rawAmount !== undefined ? mal.rawAmount : -mal.amount;
                                const isPos = odooVal > 0;
                                return (
                                  <span className={`px-2 py-0.5 text-[10px] font-mono rounded-md border ${
                                    isPos 
                                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                  }`}>
                                    {isPos ? `+${odooVal.toFixed(2)} €` : `${odooVal.toFixed(2)} €`}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-medium whitespace-nowrap">
                              {(() => {
                                const costVal = Number(mal.amount) || 0;
                                const isDeduction = costVal < 0;
                                return (
                                  <span className={`inline-flex items-center gap-1 font-semibold ${
                                    isDeduction 
                                      ? 'text-rose-600 dark:text-rose-400' 
                                      : 'text-slate-900 dark:text-white'
                                  }`}>
                                    {isDeduction ? `${formatCurrency(costVal)} (déduction)` : (costVal > 0 ? `+${formatCurrency(costVal)}` : formatCurrency(0))}
                                  </span>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50/90 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 font-semibold text-xs">
                      <tr>
                        <td colSpan={7} className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                          Total Direct / Pragma (€ HT) :
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {formatCurrency(manualAnalyticCostsTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700 text-slate-500 text-xs">
                  Aucune écriture analytique directe / achat matériel direct n'a été imputé sur cette affaire.
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            ID Odoo : <span className="font-mono font-medium text-slate-700 dark:text-slate-300">sale.order #{order.id}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
