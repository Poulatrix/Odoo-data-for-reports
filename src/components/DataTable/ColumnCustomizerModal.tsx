import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Check, 
  RotateCcw, 
  SlidersHorizontal, 
  User, 
  Layers, 
  CheckSquare, 
  Square,
  Sparkles,
  ArrowUpDown,
  MoveUp,
  MoveDown,
  Hash,
  Calendar,
  Building,
  Tag,
  HelpCircle,
  FileText
} from 'lucide-react';
import { OdooModelConfig, OdooFieldDefinition } from '../../types/odoo';

interface ColumnCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelConfig: OdooModelConfig;
  allAvailableFields: { key: string; def?: OdooFieldDefinition }[];
  visibleColumns: string[];
  onApplyColumns: (newColumns: string[]) => void;
  onResetColumns: () => void;
  userIdentifier: string;
  isCustomized: boolean;
}

export const ColumnCustomizerModal: React.FC<ColumnCustomizerModalProps> = ({
  isOpen,
  onClose,
  modelConfig,
  allAvailableFields,
  visibleColumns,
  onApplyColumns,
  onResetColumns,
  userIdentifier,
  isCustomized
}) => {
  const [selectedCols, setSelectedCols] = useState<string[]>(visibleColumns);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'selected' | 'unselected'>('all');
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Sync state whenever modal opens or visibleColumns prop updates
  React.useEffect(() => {
    if (isOpen) {
      setSelectedCols(visibleColumns);
      setSearchQuery('');
      setCategoryFilter('all');
    }
  }, [isOpen, visibleColumns]);

  // Map of field definitions for quick lookup
  const fieldsMap = useMemo(() => {
    const map = new Map<string, { key: string; def?: OdooFieldDefinition }>();
    allAvailableFields.forEach(item => {
      map.set(item.key, item);
    });
    return map;
  }, [allAvailableFields]);

  // Filtered fields according to search and category
  const filteredFields = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allAvailableFields.filter(({ key, def }) => {
      const label = (def?.string || key).toLowerCase();
      const techName = key.toLowerCase();
      const type = (def?.type || 'char').toLowerCase();
      const matchesSearch = !q || label.includes(q) || techName.includes(q) || type.includes(q);

      if (!matchesSearch) return false;

      const isSelected = selectedCols.includes(key);
      if (categoryFilter === 'selected' && !isSelected) return false;
      if (categoryFilter === 'unselected' && isSelected) return false;

      return true;
    });
  }, [allAvailableFields, searchQuery, categoryFilter, selectedCols]);

  if (!isOpen) return null;

  const handleToggleColumn = (key: string) => {
    if (selectedCols.includes(key)) {
      // Must keep at least 1 column
      if (selectedCols.length <= 1) return;
      setSelectedCols(selectedCols.filter(c => c !== key));
    } else {
      setSelectedCols([...selectedCols, key]);
    }
  };

  const handleSelectAll = () => {
    const allKeys = allAvailableFields.map(f => f.key);
    setSelectedCols(allKeys);
  };

  const handleDeselectAll = () => {
    // Keep first default field or 'name' so table isn't empty
    const firstDef = modelConfig.defaultFields?.[0] || 'name';
    setSelectedCols([firstDef]);
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= selectedCols.length) return;

    const copy = [...selectedCols];
    const temp = copy[index];
    copy[index] = copy[newIdx];
    copy[newIdx] = temp;
    setSelectedCols(copy);
  };

  const handleSaveAndApply = () => {
    onApplyColumns(selectedCols);
    setSaveSuccessNotice(true);
    setTimeout(() => {
      setSaveSuccessNotice(false);
      onClose();
    }, 400);
  };

  const handleResetToDefault = () => {
    const defs = modelConfig.defaultFields && modelConfig.defaultFields.length > 0
      ? modelConfig.defaultFields
      : ['id', 'name'];
    setSelectedCols(defs);
    onResetColumns();
    setSaveSuccessNotice(true);
    setTimeout(() => {
      setSaveSuccessNotice(false);
      onClose();
    }, 400);
  };

  // Helper to render type badge with appropriate styling
  const renderTypeBadge = (type?: string) => {
    const t = type || 'char';
    if (t === 'monetary' || t === 'float' || t === 'integer') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          {t}
        </span>
      );
    }
    if (t === 'many2one' || t === 'many2many' || t === 'one2many') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
          {t}
        </span>
      );
    }
    if (t === 'date' || t === 'datetime') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          {t}
        </span>
      );
    }
    if (t === 'selection') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          {t}
        </span>
      );
    }
    if (t === 'boolean') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          bool
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
        {t}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-purple-600 text-white shadow-xs">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Personnalisation des Colonnes
                </h3>
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono">
                  {modelConfig.technicalName}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                <User className="w-3 h-3 text-slate-400" />
                <span>Configuration sauvegardée pour : <strong className="text-slate-700 dark:text-slate-300">{userIdentifier}</strong></span>
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

        {/* Toolbar with Search, Category Filter, and Counts */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                id="column-customizer-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une colonne par nom ou champ..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center space-x-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                  categoryFilter === 'all'
                    ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Toutes ({allAvailableFields.length})
              </button>
              <button
                onClick={() => setCategoryFilter('selected')}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                  categoryFilter === 'selected'
                    ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Actives ({selectedCols.length})
              </button>
              <button
                onClick={() => setCategoryFilter('unselected')}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                  categoryFilter === 'unselected'
                    ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Masquées ({allAvailableFields.length - selectedCols.length})
              </button>
            </div>

          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSelectAll}
                className="text-purple-600 dark:text-purple-400 font-semibold hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Tout sélectionner</span>
              </button>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <button
                onClick={handleDeselectAll}
                className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center space-x-1 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Désélectionner tout</span>
              </button>
            </div>

            <div className="flex items-center space-x-1 text-slate-500 dark:text-slate-400 text-xs">
              <span>Sélection : </span>
              <strong className="text-purple-600 dark:text-purple-400 font-mono font-bold">
                {selectedCols.length}
              </strong>
              <span> / {allAvailableFields.length} colonnes</span>
            </div>
          </div>

        </div>

        {/* Scrollable Column Selection List */}
        <div className="p-4 overflow-y-auto max-h-[380px] space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800/60">
          {filteredFields.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-1">
              <Search className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Aucun champ ne correspond à votre recherche
              </p>
              <p className="text-[11px] text-slate-400">
                Essayez d'effacer le mot-clé ou de changer le filtre.
              </p>
            </div>
          ) : (
            filteredFields.map(({ key, def }, idx) => {
              const isSelected = selectedCols.includes(key);
              const isDefault = modelConfig.defaultFields?.includes(key);
              const orderIndex = selectedCols.indexOf(key);

              return (
                <div
                  key={key}
                  onClick={() => handleToggleColumn(key)}
                  className={`pt-1.5 pb-1.5 px-3 rounded-xl flex items-center justify-between transition-colors cursor-pointer group select-none ${
                    isSelected
                      ? 'bg-purple-50/60 dark:bg-purple-950/30 hover:bg-purple-100/60 dark:hover:bg-purple-900/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    
                    {/* Checkbox */}
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                      isSelected
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>

                    {/* Field Labels */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-medium ${
                          isSelected 
                            ? 'text-slate-900 dark:text-white font-semibold' 
                            : 'text-slate-700 dark:text-slate-300'
                        }`}>
                          {def?.string || key}
                        </span>

                        {isDefault && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            Défaut
                          </span>
                        )}

                        {def?.required && (
                          <span className="text-[10px] text-rose-500 font-bold" title="Champ obligatoire">
                            *
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          {key}
                        </span>
                        {def?.relation && (
                          <span className="text-[10px] text-purple-500 font-mono">
                            ➔ {def.relation}
                          </span>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Right side: Type Badge and Reorder arrows */}
                  <div className="flex items-center space-x-2 shrink-0 ml-2">
                    {renderTypeBadge(def?.type)}

                    {isSelected && (
                      <div className="flex items-center space-x-1 pl-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          disabled={orderIndex === 0}
                          onClick={() => handleMoveColumn(orderIndex, 'up')}
                          className="p-1 rounded text-slate-400 hover:text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/40 disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
                          title="Déplacer vers la gauche"
                        >
                          <MoveUp className="w-3 h-3" />
                        </button>
                        <button
                          disabled={orderIndex === selectedCols.length - 1}
                          onClick={() => handleMoveColumn(orderIndex, 'down')}
                          className="p-1 rounded text-slate-400 hover:text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/40 disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
                          title="Déplacer vers la droite"
                        >
                          <MoveDown className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer with Actions and Persistence notice */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleResetToDefault}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center space-x-1.5 cursor-pointer"
              title="Restaurer les colonnes par défaut fournies par le modèle"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Rétablir par défaut</span>
            </button>

            {isCustomized && (
              <span className="text-[11px] text-purple-600 dark:text-purple-400 flex items-center gap-1 font-medium">
                <Sparkles className="w-3 h-3" />
                <span>Configuration personnalisée active</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 justify-end">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              onClick={handleSaveAndApply}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              {saveSuccessNotice ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Enregistré !</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Appliquer & Sauvegarder</span>
                </>
              )}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
