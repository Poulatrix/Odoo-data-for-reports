import React, { useState } from 'react';
import { X, Search, Sparkles, Layers, ArrowRight } from 'lucide-react';
import { OdooModelConfig } from '../types/odoo';

interface CustomModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCustomModel: (modelConfig: OdooModelConfig) => void;
}

const COMMON_SUGGESTIONS = [
  { id: 'stock.picking', name: 'Bons de Livraison & Réceptions', category: 'Inventaire', icon: 'Package' },
  { id: 'project.task', name: 'Tâches Projets', category: 'Projets', icon: 'CheckSquare' },
  { id: 'hr.employee', name: 'Employés & Collaborateurs', category: 'Contacts', icon: 'Users' },
  { id: 'mrp.production', name: 'Ordres de Fabrication (OF)', category: 'Inventaire', icon: 'Settings' },
  { id: 'account.payment', name: 'Paiements Clients & Fournisseurs', category: 'Comptabilité', icon: 'Euro' },
  { id: 'event.event', name: 'Événements & Billetterie', category: 'CRM', icon: 'Calendar' }
];

export const CustomModelModal: React.FC<CustomModelModalProps> = ({
  isOpen,
  onClose,
  onSelectCustomModel
}) => {
  const [modelTechnicalName, setModelTechnicalName] = useState('');
  const [modelDisplayName, setModelDisplayName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelTechnicalName.trim()) return;

    const technical = modelTechnicalName.trim().toLowerCase();
    const display = modelDisplayName.trim() || technical;

    const customModel: OdooModelConfig = {
      id: technical,
      name: display,
      technicalName: technical,
      category: 'Inventaire',
      icon: 'Layers',
      description: `Modèle technique Odoo ${technical}`,
      defaultFields: ['name', 'create_date', 'write_date'],
      defaultSort: { field: 'id', direction: 'desc' }
    };

    onSelectCustomModel(customModel);
    onClose();
  };

  const handleSelectSuggestion = (sug: typeof COMMON_SUGGESTIONS[0]) => {
    const customModel: OdooModelConfig = {
      id: sug.id,
      name: sug.name,
      technicalName: sug.id,
      category: sug.category as any,
      icon: sug.icon,
      description: `Modèle standard Odoo ${sug.id}`,
      defaultFields: ['name', 'create_date'],
      defaultSort: { field: 'id', direction: 'desc' }
    };
    onSelectCustomModel(customModel);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Explorer un autre modèle Odoo
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Saisissez le nom technique de n'importe quel modèle Odoo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Nom technique du modèle Odoo <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={modelTechnicalName}
                onChange={(e) => setModelTechnicalName(e.target.value)}
                placeholder="ex: stock.picking, mrp.production, project.task"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Nom d'affichage personnalisé (facultatif)
            </label>
            <input
              type="text"
              value={modelDisplayName}
              onChange={(e) => setModelDisplayName(e.target.value)}
              placeholder="ex: Livraisons & Réceptions"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Quick Suggestions */}
          <div className="pt-2">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-2">
              Modèles courants :
            </span>
            <div className="grid grid-cols-2 gap-2">
              {COMMON_SUGGESTIONS.map((sug) => (
                <button
                  key={sug.id}
                  type="button"
                  onClick={() => handleSelectSuggestion(sug)}
                  className="p-2 text-left rounded-xl border border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700 bg-slate-50 dark:bg-slate-800/40 hover:bg-purple-50/50 dark:hover:bg-purple-950/30 transition-all text-xs cursor-pointer group"
                >
                  <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span className="truncate">{sug.name}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-purple-600 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="text-[10px] font-mono text-purple-600 dark:text-purple-400 mt-0.5">
                    {sug.id}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 flex justify-end space-x-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!modelTechnicalName.trim()}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              Charger le modèle
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
