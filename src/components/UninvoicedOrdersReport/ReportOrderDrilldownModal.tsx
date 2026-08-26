import React, { useState } from 'react';
import { 
  X, 
  Clock, 
  Receipt, 
  TrendingUp, 
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
  Sparkles
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
  const [activeTab, setActiveTab] = useState<'overview' | 'timesheets' | 'purchases' | 'manual_analytic'>('overview');

  if (!isOpen || !order) return null;

  const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1] : (order.partner_id || 'Client');
  const analyticName = Array.isArray(order.analytic_account_id) ? order.analytic_account_id[1] : 'Non défini';
  const commercialName = Array.isArray(order.user_id) ? order.user_id[1] : 'Non assigné';

  const vendorBillsTotal = order.vendorBillsTotal ?? (order.vendorBills || []).reduce((sum, pl) => sum + (Number(pl.price_subtotal) || Number(pl.debit) || 0), 0);
  const manualAnalyticCostsTotal = order.manualAnalyticCostsTotal ?? (order.manualAnalyticLines || []).reduce((sum, mal) => sum + mal.amount, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div 
        id="order-drilldown-modal-container"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden transition-colors"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-600 text-white shadow-md shadow-purple-500/20">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {order.name}
                </h3>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  À facturer
                </span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Commande confirmée
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                <span>{partnerName}</span>
                <span>•</span>
                <span>Compte analytique : <strong>{analyticName}</strong></span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 px-6 pt-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'overview'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Synthèse & Rentabilité</span>
          </button>

          <button
            onClick={() => setActiveTab('timesheets')}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'timesheets'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Feuilles de Temps ({order.timesheets?.length || 0})</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 dark:bg-slate-800 font-mono">
              {order.totalHours} hrs
            </span>
          </button>

          <button
            onClick={() => setActiveTab('purchases')}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'purchases'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Factures Fournisseurs ({order.vendorBills?.length || 0})</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 dark:bg-slate-800 font-mono">
              {formatCurrency(vendorBillsTotal)}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('manual_analytic')}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'manual_analytic'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Achats Matériel & Écritures Analytiques Directes ({order.manualAnalyticLines?.length || 0})</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 dark:bg-slate-800 font-mono">
              {formatCurrency(manualAnalyticCostsTotal)}
            </span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-160px)] space-y-6">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Financial Balance Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    1. Montant Vente (€ HT)
                  </div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                    {formatCurrency(order.amount_untaxed)}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    TTC : {formatCurrency(order.amount_total)}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60">
                  <div className="text-xs font-medium text-rose-700 dark:text-rose-400 flex items-center gap-1">
                    <Receipt className="w-3.5 h-3.5" />
                    <span>2. Factures Fournisseurs</span>
                  </div>
                  <div className="text-lg font-bold text-rose-700 dark:text-rose-300 mt-1">
                    {formatCurrency(vendorBillsTotal)}
                  </div>
                  <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-1">
                    {order.vendorBills?.length || 0} ligne(s) comptabilisée(s)
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                  <div className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>3. Écritures Analytiques / Pragma</span>
                  </div>
                  <div className="text-lg font-bold text-amber-700 dark:text-amber-300 mt-1">
                    {formatCurrency(manualAnalyticCostsTotal)}
                  </div>
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                    {order.manualAnalyticLines?.length || 0} écriture(s) directe(s)
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                  <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>4. Marge Brute Estimée</span>
                  </div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                    {formatCurrency(order.grossMargin)}
                  </div>
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1 font-semibold">
                    Taux : {order.marginRate}% (Total Coûts: {formatCurrency(order.totalPurchases)})
                  </div>
                </div>
              </div>

              {/* Hourly Valuations Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                  <div className="flex items-center justify-between text-amber-800 dark:text-amber-300">
                    <span className="text-xs font-bold uppercase tracking-wider">Valorisation Heures (77,76 €/h)</span>
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-2xl font-black font-mono text-amber-700 dark:text-amber-300 mt-2">
                    {formatCurrency(order.valuation77_76)}
                  </div>
                  <div className="text-[11px] text-amber-700/80 dark:text-amber-400 mt-1">
                    Calcul : {order.totalHours} hrs prestées × 77,76 € HT / heure
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60">
                  <div className="flex items-center justify-between text-indigo-800 dark:text-indigo-300">
                    <span className="text-xs font-bold uppercase tracking-wider">Valorisation Heures (90,00 €/h)</span>
                    <Clock className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-2xl font-black font-mono text-indigo-700 dark:text-indigo-300 mt-2">
                    {formatCurrency(order.valuation90)}
                  </div>
                  <div className="text-[11px] text-indigo-700/80 dark:text-indigo-400 mt-1">
                    Calcul : {order.totalHours} hrs prestées × 90,00 € HT / heure
                  </div>
                </div>
              </div>

              {/* Order Metadata Grid */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                  Informations de la Commande Client
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Date de commande</span>
                    <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">
                      {formatDate(order.date_order, true)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Commercial</span>
                    <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">
                      {commercialName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Heures prestées</span>
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5 block">
                      {order.totalHours} hrs
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Marge par heure</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                      {order.hourlyMarginRate ? `${formatCurrency(order.hourlyMarginRate)} / h` : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick links to details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => setActiveTab('timesheets')}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-600 bg-white dark:bg-slate-800 flex items-center justify-between text-xs transition-all cursor-pointer group"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Feuilles de temps
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                        {order.timesheets?.length || 0} entrées ({order.totalHours} hrs)
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
                </button>

                <button
                  onClick={() => setActiveTab('purchases')}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-600 bg-white dark:bg-slate-800 flex items-center justify-between text-xs transition-all cursor-pointer group"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Factures fournisseurs
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                        {order.vendorBills?.length || 0} pièces ({formatCurrency(vendorBillsTotal)})
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
                </button>

                <button
                  onClick={() => setActiveTab('manual_analytic')}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-600 bg-white dark:bg-slate-800 flex items-center justify-between text-xs transition-all cursor-pointer group"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Écritures Pragma / Directes
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                        {order.manualAnalyticLines?.length || 0} lignes ({formatCurrency(manualAnalyticCostsTotal)})
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: TIMESHEETS (account.analytic.line) */}
          {activeTab === 'timesheets' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Feuilles de Temps Prestées (`account.analytic.line`)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Heures enregistrées et rattachées au compte analytique de l'affaire
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    Total : {order.totalHours} hrs
                  </div>
                  <div className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Valo 77,76 € : {formatCurrency(order.valuation77_76)}
                  </div>
                  <div className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Valo 90,00 € : {formatCurrency(order.valuation90)}
                  </div>
                </div>
              </div>

              {order.timesheets && order.timesheets.length > 0 ? (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Date</th>
                        <th className="px-4 py-2.5 font-semibold">Intervenant / Utilisateur</th>
                        <th className="px-4 py-2.5 font-semibold">Description de la prestation</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Heures prestées</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {order.timesheets.map((ts, idx) => {
                        const effectiveHours = ts.effective_hours !== undefined 
                          ? ts.effective_hours 
                          : ((ts.amount !== undefined && ts.amount > 0) ? -Math.abs(ts.unit_amount) : ts.unit_amount);
                        const isTransfer = effectiveHours < 0 || (ts.amount !== undefined && ts.amount > 0);

                        return (
                          <tr key={ts.id || idx} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 ${isTransfer ? 'bg-amber-50/30 dark:bg-amber-950/20' : ''}`}>
                            <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {formatDate(ts.date)}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {Array.isArray(ts.user_id) ? ts.user_id[1] : (Array.isArray(ts.employee_id) ? ts.employee_id[1] : 'Collaborateur')}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{ts.name || 'Prestation'}</span>
                                {isTransfer && (
                                  <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                    Transfert / Régulation d'encours
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold whitespace-nowrap">
                              {effectiveHours < 0 ? (
                                <span className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-900/50">
                                  {formatNumber(effectiveHours, 1)} hrs
                                </span>
                              ) : (
                                <span className="text-indigo-600 dark:text-indigo-400">
                                  {formatNumber(effectiveHours, 1)} hrs
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
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
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Achats Fournisseurs Facturés (`account.move.line`)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Lignes de factures fournisseurs comptabilisées (`parent_state = 'posted'`)
                  </p>
                </div>
                <div className="text-xs font-bold px-3 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                  Total Factures : {formatCurrency(vendorBillsTotal)}
                </div>
              </div>

              {order.vendorBills && order.vendorBills.length > 0 ? (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Date</th>
                        <th className="px-4 py-2.5 font-semibold">N° Pièce / Réf</th>
                        <th className="px-4 py-2.5 font-semibold">Fournisseur</th>
                        <th className="px-4 py-2.5 font-semibold">Libellé / Article</th>
                        <th className="px-4 py-2.5 font-semibold text-center">Statut</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Montant (€ HT)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {order.vendorBills.map((bill, idx) => (
                        <tr key={bill.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                            {formatDate(bill.date)}
                          </td>
                          <td className="px-4 py-2.5 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {Array.isArray(bill.move_id) ? bill.move_id[1] : (bill.ref || 'Facture')}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                            {Array.isArray(bill.partner_id) ? bill.partner_id[1] : 'Fournisseur'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                            {bill.name || 'Achat sous-traitance'}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                              Comptabilisé
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                            {formatCurrency(bill.price_subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700 text-slate-500 text-xs">
                  Aucun achat fournisseur facturé n'est actuellement rattaché à cette affaire.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MANUAL ANALYTIC ENTRIES & PRAGMA (account.analytic.line where move_line_id = False) */}
          {activeTab === 'manual_analytic' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>Écritures Analytiques Directes & Régulations d'Encours / Pragma (`account.analytic.line`)</span>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Coûts directs saisis manuellement sans facture d'achat liée (<code className="text-purple-600 dark:text-purple-400 font-mono">move_line_id = False</code>)
                  </p>
                </div>
                <div className="text-xs font-bold px-3 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  Total Direct / Pragma : {formatCurrency(manualAnalyticCostsTotal)}
                </div>
              </div>

              {order.manualAnalyticLines && order.manualAnalyticLines.length > 0 ? (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Date</th>
                        <th className="px-4 py-2.5 font-semibold">Libellé / Description</th>
                        <th className="px-4 py-2.5 font-semibold">Fournisseur / Réf</th>
                        <th className="px-4 py-2.5 font-semibold">Compte Analytique</th>
                        <th className="px-4 py-2.5 font-semibold text-center">Quantité / Unité</th>
                        <th className="px-4 py-2.5 font-semibold">Saisie / Auteur</th>
                        <th className="px-4 py-2.5 font-semibold text-center">Origine Odoo</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Coût Imputé (€ HT)</th>
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
                            <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {formatDate(mal.date)}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{mal.name || 'Écriture directe'}</span>
                                {isTransport ? (
                                  <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    Transport / Frais
                                  </span>
                                ) : isMaterial ? (
                                  <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    Achat Matériel / Non-heures
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                    Régulation Pragma
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 text-[11px]">
                              {partnerStr ? (
                                <div>
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">{partnerStr}</span>
                                  {mal.ref && <span className="text-slate-400 dark:text-slate-500 ml-1 font-mono">({mal.ref})</span>}
                                </div>
                              ) : mal.ref ? (
                                <span className="font-mono text-slate-500">Réf: {mal.ref}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                              {Array.isArray(mal.account_id) ? mal.account_id[1] : (analyticName || '—')}
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {qtyStr}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {Array.isArray(mal.user_id) ? mal.user_id[1] : (Array.isArray(mal.employee_id) ? mal.employee_id[1] : 'Manuel')}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                                {mal.rawAmount < 0 ? `${mal.rawAmount.toFixed(2)} €` : `+${mal.rawAmount.toFixed(2)} €`}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700 dark:text-amber-400">
                              {formatCurrency(mal.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
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
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            ID Odoo : <span className="font-mono font-semibold">sale.order #{order.id}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
