import React, { useState } from 'react';
import { 
  X, 
  Info, 
  PackagePlus, 
  PackageMinus, 
  Clock, 
  Scale, 
  FileSpreadsheet, 
  BarChart3, 
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Search
} from 'lucide-react';

interface CalculationRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalculationRulesModal: React.FC<CalculationRulesModalProps> = ({
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'inflow' | 'outflow' | 'uninvoiced' | 'timesheets' | 'moulds'>('all');
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const rules = [
    {
      id: 'inflow',
      category: 'inflow',
      title: "Augmentation de l'Encours (Achats engagés du mois)",
      icon: PackagePlus,
      color: 'amber',
      formula: "Somme (Montant HT commandé - Montant HT déjà facturé) sur commandes d'achat >= 500 €",
      details: [
        "Seules les commandes d'achat avec un total >= 500 € HT sont additionnées à l'encours.",
        "Si le montant total de la commande d'achat est strictement inférieur à 500 €, elle est exclue.",
        "Tous les achats passés dans le mois civil qui n'ont pas encore été facturés sont pris en compte.",
        "Si une commande d'achat fait l'objet d'une facture fournisseur partielle, seul le delta résiduel non facturé est comptabilisé."
      ]
    },
    {
      id: 'outflow',
      category: 'outflow',
      title: "Sorties d'Encours Achats (Ventes facturées du mois)",
      icon: PackageMinus,
      color: 'sky',
      formula: "Somme des achats et sous-traitances rattachés aux affaires facturées aux clients",
      details: [
        "Filtre les factures clients (out_invoice) émises sur le mois civil sélectionné.",
        "Identifie le compte analytique et l'affaire correspondante.",
        "Extrait l'ensemble des factures d'achat fournisseurs (in_invoice) rattachées à cette affaire pour déboucler l'encours.",
        "Calcule la marge brute et le taux de marge débouclé en temps réel."
      ]
    },
    {
      id: 'uninvoiced',
      category: 'uninvoiced',
      title: "Affaires à Facturer & Rentabilité Réelle",
      icon: FileSpreadsheet,
      color: 'blue',
      formula: "Marge = Ventes HT - (Heures x 77,76 € + Factures Fournisseurs + Écritures Directes inversées)",
      details: [
        "Valorisation horaire : Coût interne à 77,76 €/h et valorisation commerciale à 90,00 €/h.",
        "Écritures directes et Pragma : Inversion du signe de la valeur pour correspondre au coût effectif (une écriture de 125 000 € se déduit des coûts et améliore la marge).",
        "Engagements BDC : Commandes d'achat confirmées en attente de facturation fournisseur.",
        "Possibilité d'exporter le bilan figé rétroactivement à n'importe quelle date du passé."
      ]
    },
    {
      id: 'timesheets',
      category: 'timesheets',
      title: "Contrôle des Pointages Matriciels (Audit RH)",
      icon: Clock,
      color: 'violet',
      formula: "Taux de conformité = (Jours conformes / Jours ouvrés travaillés) x 100",
      details: [
        "Matrice quotidienne des collaborateurs sur la période sélectionnée.",
        "Vérifie la complétude journalière (minimum requis d'heures prestées ou congés déclarés).",
        "Action de déclaration d'absence ou congé en masse pour régulariser les anomalies."
      ]
    },
    {
      id: 'moulds',
      category: 'moulds',
      title: "Poids des Moules Neufs (Contrôle Logistique)",
      icon: Scale,
      color: 'rose',
      formula: "Détection des anomalies si Poids net / Poids brut = 0 kg sur articles de moules neufs",
      details: [
        "Scanne les lignes de commandes de vente étiquetées ou typées 'Moule neuf'.",
        "Alerte immédiate lorsque le poids n'a pas été renseigné par le bureau d'études ou l'atelier.",
        "Lien direct vers la fiche article et la commande Odoo pour saisie rapide."
      ]
    }
  ];

  const filteredRules = rules.filter(r => {
    if (activeTab !== 'all' && r.category !== activeTab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return r.title.toLowerCase().includes(s) || r.details.some(d => d.toLowerCase().includes(s));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/10 text-sky-500 dark:text-sky-400">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Règles de Calcul & Formules Métier
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Documentation des règles de gestion appliquées dans le cockpit Ecomi Drive.
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Tabs */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Toutes
            </button>
            <button
              onClick={() => setActiveTab('inflow')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'inflow'
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Encours Achats
            </button>
            <button
              onClick={() => setActiveTab('uninvoiced')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'uninvoiced'
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Affaires
            </button>
            <button
              onClick={() => setActiveTab('timesheets')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'timesheets'
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Pointages
            </button>
          </div>

          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Rechercher une règle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredRules.map((rule) => {
            const Icon = rule.icon;
            return (
              <div 
                key={rule.id}
                className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/40 space-y-3"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <Icon className="w-4 h-4 text-sky-500" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {rule.title}
                  </h4>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 font-mono text-xs text-sky-600 dark:text-sky-300 font-semibold">
                  {rule.formula}
                </div>

                <ul className="space-y-1.5 pt-1 text-xs text-slate-600 dark:text-slate-300">
                  {rule.details.map((d, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0 mt-1.5" />
                      <span className="leading-relaxed">{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
