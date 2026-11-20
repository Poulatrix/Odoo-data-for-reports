import React, { useState, useEffect, useMemo } from 'react';
import { 
  Scale, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  ExternalLink, 
  Search, 
  Filter, 
  Download, 
  Boxes, 
  Tag, 
  ArrowUpDown, 
  ChevronUp, 
  ChevronDown, 
  AlertCircle,
  FileSpreadsheet,
  Info,
  Package
} from 'lucide-react';
import { odooClient } from '../../services/odooClient';
import { 
  OdooConnectionCredentials, 
  MouldWeightCheckItem, 
  MouldWeightCheckSummary 
} from '../../types/odoo';

interface MouldWeightCheckViewProps {
  credentials: OdooConnectionCredentials | null;
  isDemo: boolean;
}

type FilterMode = 'all' | 'anomalies' | 'compliant';
type SortField = 'orderName' | 'partnerName' | 'productName' | 'weight' | 'status';

export const MouldWeightCheckView: React.FC<MouldWeightCheckViewProps> = ({
  credentials,
  isDemo
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MouldWeightCheckItem[]>([]);
  const [summary, setSummary] = useState<MouldWeightCheckSummary>({
    totalOrdersCount: 0,
    totalProductsCount: 0,
    anomaliesCount: 0,
    compliantCount: 0,
    complianceRate: 100
  });

  // UI state
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortAsc, setSortAsc] = useState<boolean>(true); // ANOMALIE first by default

  // Fetch data
  const loadData = async (forceRefresh: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await odooClient.getMouldWeightCheckReport({
        forceRefresh,
        credentials: credentials || undefined,
        isDemo
      });

      if (res.success) {
        setItems(res.records || []);
        if (res.summary) {
          setSummary(res.summary);
        }
      } else {
        setError(res.error || 'Erreur lors de la récupération des données Odoo.');
        setItems([]);
      }
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le serveur Odoo.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [credentials, isDemo]);

  // Filtering & Sorting
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Filter by mode
    if (filterMode === 'anomalies') {
      result = result.filter(item => item.status === 'ANOMALIE');
    } else if (filterMode === 'compliant') {
      result = result.filter(item => item.status === 'CONFORME');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => 
        item.orderName.toLowerCase().includes(q) ||
        item.partnerName.toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q) ||
        (item.productDefaultCode && item.productDefaultCode.toLowerCase().includes(q)) ||
        (item.clientOrderRef && item.clientOrderRef.toLowerCase().includes(q)) ||
        item.tagNames.some(t => t.toLowerCase().includes(q))
      );
    }

    // Sorting
    result.sort((a, b) => {
      let va: any = a[sortField];
      let vb: any = b[sortField];

      // Custom priority for status: ANOMALIE first
      if (sortField === 'status') {
        const orderWeightA = a.status === 'ANOMALIE' ? 0 : 1;
        const orderWeightB = b.status === 'ANOMALIE' ? 0 : 1;
        return sortAsc ? orderWeightA - orderWeightB : orderWeightB - orderWeightA;
      }

      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();

      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    return result;
  }, [items, filterMode, searchQuery, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredItems.length === 0) return;

    const headers = [
      'N° Commande',
      'Client',
      'Article / Moule',
      'Référence Interne',
      'Étiquettes',
      'Poids Renseigné (kg)',
      'Statut',
      'Libellé Alerte',
      'Date Commande',
      'Réf Client'
    ];

    const rows = filteredItems.map(item => [
      `"${item.orderName}"`,
      `"${item.partnerName.replace(/"/g, '""')}"`,
      `"${item.productName.replace(/"/g, '""')}"`,
      `"${item.productDefaultCode || ''}"`,
      `"${item.tagDisplay}"`,
      item.weight,
      item.status,
      `"${item.statusLabel}"`,
      `"${item.orderDate || ''}"`,
      `"${item.clientOrderRef || ''}"`
    ]);

    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `verification_poids_moules_neufs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const anomaliesCount = summary.anomaliesCount;
  const compliantCount = summary.compliantCount;
  const totalCount = summary.totalProductsCount;

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-500 shadow-2xs">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Poids Moules Neufs
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono">
                  Logistique
                </span>
                {anomaliesCount > 0 ? (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    <span>{anomaliesCount} {anomaliesCount > 1 ? 'anomalies' : 'anomalie'}</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Tous conformes</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Commandes de vente non entièrement facturées avec le tag <strong>« Moule neuf »</strong> • Contrôle de l'attribut <code>weight</code> (Logistique / Inventaire Odoo).
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => loadData(true)}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Rafraîchir les données depuis Odoo"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={filteredItems.length === 0}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Exporter la liste en format CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exporter CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* Total Commandes Moules Neufs */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-sky-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Commandes Analysées
            </span>
            <div className="p-1.5 rounded-xl bg-sky-500/10 text-sky-500">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-1 text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
            {summary.totalOrdersCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
            <Tag className="w-3 h-3 text-sky-500" />
            <span>Tag « Moule neuf » actif</span>
          </div>
        </div>

        {/* Total Articles Moules */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-sky-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Articles / Moules
            </span>
            <div className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-1 text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
            {summary.totalProductsCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Lignes d'articles inspectées
          </div>
        </div>

        {/* Anomalies (ROSE) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-rose-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Anomalies (0 kg)
            </span>
            <div className="p-1.5 rounded-xl bg-rose-500/10 text-rose-500">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-1 text-xl sm:text-2xl font-extrabold font-mono text-rose-500 tabular-nums">
            {anomaliesCount}
          </div>
          <div className="text-[11px] text-rose-500 mt-0.5 font-medium">
            {anomaliesCount > 0 ? 'Poids manquant à renseigner' : 'Aucune anomalie'}
          </div>
        </div>

        {/* Conformes (VERT) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-emerald-500/50 transition-colors">
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Articles Conformes
            </span>
            <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-1 text-xl sm:text-2xl font-extrabold font-mono text-emerald-500 tabular-nums">
            {compliantCount}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
            Poids &gt; 0 kg renseigné
          </div>
        </div>

        {/* Taux de conformité */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 dark:backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-sky-500/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Taux de Conformité
            </span>
            <span className={`text-xs font-bold font-mono ${
              summary.complianceRate < 100 ? 'text-amber-500' : 'text-emerald-500'
            }`}>
              {summary.complianceRate}%
            </span>
          </div>
          <div className="mt-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${
                summary.complianceRate === 100 
                  ? 'bg-emerald-500' 
                  : summary.complianceRate >= 70 
                  ? 'bg-amber-500' 
                  : 'bg-rose-500'
              }`}
              style={{ width: `${summary.complianceRate}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            {compliantCount} sur {totalCount} articles renseignés
          </div>
        </div>

      </div>

      {/* Info Notice Box */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold text-slate-900 dark:text-white">Règle de gestion :</span> Commandes de Vente (SO) non entièrement facturées avec le tag <strong>« Moule neuf »</strong>. Pour chaque article, le champ <code>weight</code> de la fiche article Odoo (section Logistique / Inventaire) doit impérativement être supérieur à 0 kg.
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        
        {/* Quick Filter Buttons */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              filterMode === 'all'
                ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Tout afficher ({totalCount})
          </button>

          <button
            onClick={() => setFilterMode('anomalies')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              filterMode === 'anomalies'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Anomalies uniquement ({anomaliesCount})</span>
          </button>

          <button
            onClick={() => setFilterMode('compliant')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              filterMode === 'compliant'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Conformes ({compliantCount})</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrer commande, client, article..."
            className="w-full pl-9 pr-3.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ×
            </button>
          )}
        </div>

      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-sky-500 animate-spin" />
            <p className="text-xs text-slate-500 font-medium">
              Vérification des commandes et des poids d'articles sur Odoo...
            </p>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
            <div className="text-sm font-semibold text-rose-700 dark:text-rose-400">
              Impossible de charger le rapport
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{error}</p>
            <button
              onClick={() => loadData(true)}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 cursor-pointer shadow-xs"
            >
              Réessayer
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Scale className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {searchQuery || filterMode !== 'all' 
                ? 'Aucun résultat ne correspond aux filtres appliqués'
                : 'Aucune commande de vente « Moule neuf » à facturer'}
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {filterMode === 'anomalies'
                ? 'Félicitations ! Aucun article présentant un poids nul ou manquant n\'a été détecté.'
                : 'Vérifiez que vos commandes de vente confirmées portent l\'étiquette « Moule neuf ».'}
            </p>
            {(searchQuery || filterMode !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterMode('all');
                }}
                className="mt-2 px-3 py-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              
              {/* Table Header */}
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200 dark:border-slate-800 select-none">
                <tr>
                  
                  {/* Column 1: N° Commande & Date */}
                  <th 
                    onClick={() => handleSort('orderName')}
                    className="px-5 py-3.5 cursor-pointer hover:text-slate-700 dark:hover:text-white transition-colors"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>N° Commande</span>
                      {sortField === 'orderName' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Column 2: Client */}
                  <th 
                    onClick={() => handleSort('partnerName')}
                    className="px-5 py-3.5 cursor-pointer hover:text-slate-700 dark:hover:text-white transition-colors"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>Client</span>
                      {sortField === 'partnerName' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Column 3: Article / Moule */}
                  <th 
                    onClick={() => handleSort('productName')}
                    className="px-5 py-3.5 cursor-pointer hover:text-slate-700 dark:hover:text-white transition-colors min-w-[260px]"
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>Article / Moule</span>
                      {sortField === 'productName' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Column 4: Étiquette */}
                  <th className="px-4 py-3.5">
                    <span>Étiquette</span>
                  </th>

                  {/* Column 5: Poids Renseigné */}
                  <th 
                    onClick={() => handleSort('weight')}
                    className="px-4 py-3.5 text-right cursor-pointer hover:text-slate-700 dark:hover:text-white transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span>Poids Renseigné</span>
                      {sortField === 'weight' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Column 6: Statut / Alerte */}
                  <th 
                    onClick={() => handleSort('status')}
                    className="px-5 py-3.5 text-center cursor-pointer hover:text-slate-700 dark:hover:text-white transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-center space-x-1.5">
                      <span>Statut / Alerte</span>
                      {sortField === 'status' && (
                        sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </div>
                  </th>

                  {/* Column 7: Actions */}
                  <th className="px-4 py-3.5 text-center">
                    <span>Actions Odoo</span>
                  </th>

                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                {filteredItems.map((item, index) => {
                  const isAnomaly = item.status === 'ANOMALIE';

                  return (
                    <tr 
                      key={item.id}
                      className={`transition-colors ${
                        isAnomaly 
                          ? 'bg-rose-50/30 hover:bg-rose-50/70 dark:bg-rose-950/20 dark:hover:bg-rose-950/40' 
                          : index % 2 === 1 
                          ? 'bg-slate-50/40 hover:bg-blue-50/40 dark:bg-slate-900/40 dark:hover:bg-slate-800/40' 
                          : 'bg-white hover:bg-blue-50/40 dark:bg-slate-900 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      
                      {/* Column 1: N° Commande & Date */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono text-[11px] font-bold border border-sky-500/20 flex items-center justify-center shrink-0">
                            SO
                          </span>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white font-mono text-xs">
                              {item.orderName}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {item.orderDate ? item.orderDate.slice(0, 10) : '—'}
                              {item.clientOrderRef && ` • Réf : ${item.clientOrderRef}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Client */}
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white text-xs">
                          {item.partnerName}
                        </div>
                      </td>

                      {/* Column 3: Article / Moule */}
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white text-xs">
                          {item.productName}
                        </div>
                        {item.productDefaultCode && (
                          <div className="mt-0.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              Réf : {item.productDefaultCode}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Column 4: Étiquette */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {item.tagNames.map((tag, tIdx) => {
                            const isMouldTag = tag.toLowerCase().includes('moule neuf');
                            return (
                              <span 
                                key={tIdx}
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                                  isMouldTag 
                                    ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25' 
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                <Tag className="w-2.5 h-2.5 mr-1 opacity-70" />
                                {tag}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Column 5: Poids Renseigné */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        {isAnomaly ? (
                          <span className="inline-flex items-center font-mono font-bold px-2.5 py-1 rounded-md text-xs text-rose-700 dark:text-rose-300 bg-rose-100/90 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800">
                            <Scale className="w-3.5 h-3.5 mr-1.5 text-rose-600 dark:text-rose-400" />
                            0 kg
                          </span>
                        ) : (
                          <span className="inline-flex items-center font-mono font-bold px-2.5 py-1 rounded-md text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800">
                            <Scale className="w-3.5 h-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                            {item.weight} kg
                          </span>
                        )}
                      </td>

                      {/* Column 6: Statut / Alerte */}
                      <td className="px-5 py-3.5 text-center whitespace-nowrap">
                        {isAnomaly ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-900/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
                            <span>Poids manquant (0 kg)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-900/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <span>{item.statusLabel}</span>
                          </span>
                        )}
                      </td>

                      {/* Column 7: Actions */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1.5">
                          
                          {/* Direct Button to Odoo Product Sheet */}
                          {item.odooProductUrl ? (
                            <a
                              href={item.odooProductUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                                isAnomaly
                                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-xs'
                                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                              }`}
                              title="Corriger le poids sur la fiche article Odoo (Onglet Inventaire / Logistique)"
                            >
                              <span>{isAnomaly ? 'Corriger Poids' : 'Fiche Article'}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}

                          {/* Direct Button to Odoo Sale Order */}
                          {item.odooOrderUrl && (
                            <a
                              href={item.odooOrderUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                              title="Ouvrir la commande de vente sur Odoo"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}

                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer Summary */}
              <tfoot className="bg-slate-50 dark:bg-slate-900 border-t-2 border-slate-200 dark:border-slate-800 text-xs font-semibold">
                <tr>
                  <td colSpan={4} className="px-5 py-3 text-slate-900 dark:text-white font-bold">
                    TOTAL : {filteredItems.length} article(s) affiché(s)
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {filteredItems.reduce((acc, curr) => acc + curr.weight, 0).toFixed(1)} kg
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="font-bold text-xs text-slate-600 dark:text-slate-300">
                      {filteredItems.filter(i => i.status === 'ANOMALIE').length} anomalie(s)
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-400">
                    —
                  </td>
                </tr>
              </tfoot>

            </table>
          </div>
        )}

      </div>

    </div>
  );
};
