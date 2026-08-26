import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Filter, 
  SlidersHorizontal, 
  Download, 
  FileText, 
  FileSpreadsheet, 
  Code, 
  RefreshCw, 
  CheckSquare, 
  Square, 
  ExternalLink, 
  Eye, 
  EyeOff, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Plus, 
  Trash2, 
  Sparkles,
  Layers,
  Building,
  Tag,
  Settings2,
  RotateCcw,
  Check
} from 'lucide-react';
import { 
  OdooModelConfig, 
  OdooFieldDefinition, 
  TableSortState, 
  FilterCondition 
} from '../../types/odoo';
import { MODEL_FIELD_DEFINITIONS } from '../../data/odooModels';
import { 
  formatCurrency, 
  formatDate, 
  getMany2OneDisplay, 
  getSelectionDisplay 
} from '../../utils/formatters';
import { 
  exportToCSV, 
  exportToExcel, 
  exportToJSON 
} from '../../utils/exportUtils';
import {
  getUserIdentifier,
  getSavedColumnsForModel,
  saveColumnsForModel,
  resetSavedColumnsForModel,
  hasCustomColumnsForModel
} from '../../utils/columnPreferences';
import { RecordDetailModal } from '../RecordDetailModal';
import { ColumnCustomizerModal } from './ColumnCustomizerModal';

interface DataTableProps {
  modelConfig: OdooModelConfig;
  records: Record<string, any>[];
  totalCount: number;
  fieldDefs: Record<string, OdooFieldDefinition>;
  isLoading: boolean;
  onRefresh: (forceRefresh?: boolean) => void;
  cacheInfo?: { fromCache?: boolean; executionTimeMs?: number };
  currentUser?: string;
  isDemo?: boolean;
  onColumnsChange?: (columns: string[]) => void;
}

export const DataTable: React.FC<DataTableProps> = ({
  modelConfig,
  records,
  totalCount,
  fieldDefs,
  isLoading,
  onRefresh,
  cacheInfo,
  currentUser,
  isDemo,
  onColumnsChange
}) => {
  // Search & Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQuickFilter, setSelectedQuickFilter] = useState<string>('all');
  const [customFilters, setCustomFilters] = useState<FilterCondition[]>([]);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isCustomizerModalOpen, setIsCustomizerModalOpen] = useState(false);

  // User storage identifier
  const userIdentifier = useMemo(() => {
    return getUserIdentifier(currentUser, isDemo);
  }, [currentUser, isDemo]);

  // Sorting
  const [sortState, setSortState] = useState<TableSortState>(
    modelConfig.defaultSort || { field: 'id', direction: 'desc' }
  );

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Row Selection & Inspection
  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([]);
  const [inspectingRecord, setInspectingRecord] = useState<Record<string, any> | null>(null);

  // Predefined & Introspected available fields for current model
  const allAvailableFields = useMemo(() => {
    const predefinedMap = (MODEL_FIELD_DEFINITIONS[modelConfig.technicalName] || MODEL_FIELD_DEFINITIONS[modelConfig.id] || {}) as Record<string, OdooFieldDefinition>;
    const map = new Map<string, OdooFieldDefinition>();

    // 1. Predefined model definitions
    Object.entries(predefinedMap).forEach(([k, def]) => {
      map.set(k, def as OdooFieldDefinition);
    });

    // 2. Introspected fields from Odoo
    if (fieldDefs && typeof fieldDefs === 'object') {
      Object.entries(fieldDefs).forEach(([k, def]) => {
        if (!map.has(k)) {
          map.set(k, def as OdooFieldDefinition);
        } else {
          const existing = map.get(k)!;
          map.set(k, { ...existing, ...(def as OdooFieldDefinition) });
        }
      });
    }

    // 3. Default fields if any is not yet in map
    (modelConfig.defaultFields || []).forEach(k => {
      if (!map.has(k)) {
        map.set(k, { name: k, string: k, type: 'char' });
      }
    });

    return Array.from(map.entries()).map(([key, def]) => ({ key, def }));
  }, [modelConfig, fieldDefs]);

  const allFieldKeys = useMemo(() => {
    return allAvailableFields.map(f => f.key);
  }, [allAvailableFields]);

  // Visible Columns state initialized per user and per model
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    return getSavedColumnsForModel(
      userIdentifier,
      modelConfig.technicalName,
      modelConfig.defaultFields && modelConfig.defaultFields.length > 0
        ? modelConfig.defaultFields
        : ['id', 'name']
    );
  });

  // Keep visible columns synchronized when switching model or user profile
  useEffect(() => {
    const loaded = getSavedColumnsForModel(
      userIdentifier,
      modelConfig.technicalName,
      modelConfig.defaultFields && modelConfig.defaultFields.length > 0
        ? modelConfig.defaultFields
        : ['id', 'name']
    );
    setVisibleColumns(loaded);
    setSelectedRowIds([]);
    setCurrentPage(1);
    setSelectedQuickFilter('all');
    setCustomFilters([]);
  }, [modelConfig.id, modelConfig.technicalName, userIdentifier]);

  // Column update handler with automatic per-user + per-model persistence
  const handleUpdateColumns = (newCols: string[]) => {
    if (!newCols || newCols.length === 0) return;
    setVisibleColumns(newCols);
    saveColumnsForModel(userIdentifier, modelConfig.technicalName, newCols);
    if (onColumnsChange) {
      onColumnsChange(newCols);
    }
  };

  // Reset columns handler back to default fields
  const handleResetColumns = () => {
    const defaultCols = modelConfig.defaultFields && modelConfig.defaultFields.length > 0
      ? modelConfig.defaultFields
      : ['id', 'name'];
    setVisibleColumns(defaultCols);
    resetSavedColumnsForModel(userIdentifier, modelConfig.technicalName);
    if (onColumnsChange) {
      onColumnsChange(defaultCols);
    }
  };

  const isModelCustomized = useMemo(() => {
    return hasCustomColumnsForModel(userIdentifier, modelConfig.technicalName);
  }, [userIdentifier, modelConfig.technicalName, visibleColumns]);

  // Quick Filter presets based on current model
  const quickFilters = useMemo(() => {
    const filters = [{ id: 'all', label: 'Tous' }];
    if (modelConfig.id === 'sale.order') {
      filters.push(
        { id: 'state:sale', label: 'Commandes Confirmées' },
        { id: 'state:draft', label: 'Devis & Brouillons' },
        { id: 'invoice_status:to invoice', label: 'À facturer' }
      );
    } else if (modelConfig.id === 'account.move') {
      filters.push(
        { id: 'payment_state:paid', label: 'Payées' },
        { id: 'payment_state:not_paid', label: 'Impayées' },
        { id: 'move_type:out_invoice', label: 'Factures Clients' }
      );
    } else if (modelConfig.id === 'res.partner') {
      filters.push(
        { id: 'is_company:true', label: 'Sociétés' },
        { id: 'customer:true', label: 'Avec facturation' }
      );
    } else if (modelConfig.id === 'purchase.order') {
      filters.push(
        { id: 'state:purchase', label: 'Bons de Commande' },
        { id: 'state:draft', label: 'Demandes de Prix' }
      );
    }
    return filters;
  }, [modelConfig.id]);

  // Filtered & Sorted Records
  const processedRecords = useMemo(() => {
    let list = [...records];

    // 1. Text Search across all visible columns
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(row => {
        return visibleColumns.some(col => {
          const val = row[col];
          if (val === null || val === undefined) return false;
          if (Array.isArray(val)) {
            return val.some(item => String(item).toLowerCase().includes(q));
          }
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    // 2. Quick Filter
    if (selectedQuickFilter !== 'all') {
      const [field, expected] = selectedQuickFilter.split(':');
      if (field && expected) {
        list = list.filter(row => {
          if (expected === 'true') return !!row[field];
          if (expected === 'false') return !row[field];
          return String(row[field]) === expected;
        });
      }
    }

    // 3. Custom Domain Filter Clauses
    if (customFilters.length > 0) {
      list = list.filter(row => {
        return customFilters.every(f => {
          const val = row[f.field];
          if (f.operator === '=') return String(val) === String(f.value);
          if (f.operator === '!=') return String(val) !== String(f.value);
          if (f.operator === 'ilike') return String(val || '').toLowerCase().includes(String(f.value).toLowerCase());
          if (f.operator === '>') return Number(val) > Number(f.value);
          if (f.operator === '>=') return Number(val) >= Number(f.value);
          if (f.operator === '<') return Number(val) < Number(f.value);
          if (f.operator === '<=') return Number(val) <= Number(f.value);
          return true;
        });
      });
    }

    // 4. Sorting
    if (sortState.field) {
      list.sort((a, b) => {
        let valA = a[sortState.field];
        let valB = b[sortState.field];
        if (Array.isArray(valA)) valA = valA[1];
        if (Array.isArray(valB)) valB = valB[1];
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortState.direction === 'asc' ? valA - valB : valB - valA;
        }
        return sortState.direction === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return list;
  }, [records, searchTerm, selectedQuickFilter, customFilters, sortState, visibleColumns]);

  // Paginated View Slice
  const totalPages = Math.ceil(processedRecords.length / pageSize) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedRecords.slice(start, start + pageSize);
  }, [processedRecords, currentPage, pageSize]);

  // Sorting Handler
  const handleSort = (field: string) => {
    setSortState(prev => {
      if (prev.field === field) {
        return { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { field, direction: 'asc' };
    });
  };

  // Selection handlers
  const handleSelectAllOnPage = () => {
    const pageIds = paginatedRecords.map(r => r.id);
    const allSelected = pageIds.every(id => selectedRowIds.includes(id));
    if (allSelected) {
      setSelectedRowIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedRowIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleToggleSelectRow = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRowIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Export handlers
  const handleExport = (format: 'csv' | 'excel' | 'json') => {
    const dataToExport = selectedRowIds.length > 0
      ? processedRecords.filter(r => selectedRowIds.includes(r.id))
      : processedRecords;

    const baseName = `odoo_${modelConfig.technicalName.replace('.', '_')}_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      exportToCSV(dataToExport, visibleColumns, fieldDefs, `${baseName}.csv`);
    } else if (format === 'excel') {
      exportToExcel(dataToExport, visibleColumns, fieldDefs, `${baseName}.xlsx`);
    } else if (format === 'json') {
      exportToJSON(dataToExport, `${baseName}.json`);
    }
    setShowExportMenu(false);
  };

  // Add Custom Filter
  const handleAddCustomFilter = () => {
    const firstField = visibleColumns[0] || 'name';
    setCustomFilters(prev => [
      ...prev,
      { id: String(Date.now()), field: firstField, operator: 'ilike', value: '' }
    ]);
  };

  const handleUpdateCustomFilter = (id: string, updates: Partial<FilterCondition>) => {
    setCustomFilters(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleRemoveCustomFilter = (id: string) => {
    setCustomFilters(prev => prev.filter(f => f.id !== id));
  };

  // Cell Renderer Helper
  const renderCellContent = (row: Record<string, any>, colKey: string) => {
    const val = row[colKey];
    const fieldDef = fieldDefs[colKey];
    const fieldType = fieldDef?.type || 'char';

    if (val === null || val === undefined || val === '') {
      return <span className="text-slate-300 dark:text-slate-700">—</span>;
    }

    // 1. Many2One field: [ID] Display Name
    if (Array.isArray(val) && val.length >= 2) {
      const { id, name } = getMany2OneDisplay(val);
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80 text-xs">
          <Building className="w-3 h-3 text-purple-400 shrink-0" />
          <span className="truncate max-w-[200px]" title={name}>{name}</span>
          <span className="text-[10px] text-purple-400 font-mono">#{id}</span>
        </span>
      );
    }

    // 2. Status / Selection Badges
    if (fieldType === 'selection' || colKey === 'state' || colKey === 'payment_state' || colKey === 'invoice_status') {
      const badgeConfig = modelConfig.stateBadgeMap?.[String(val)];
      const label = badgeConfig?.label || getSelectionDisplay(val, fieldDef);
      const variant = badgeConfig?.variant || 'default';

      const variantClasses = {
        success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        purple: 'bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800',
        default: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
      }[variant];

      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${variantClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-70"></span>
          {label}
        </span>
      );
    }

    // 3. Monetary / Amounts
    if (fieldType === 'monetary' || colKey.includes('amount') || colKey.includes('price') || colKey.includes('credit')) {
      const num = Number(val);
      return (
        <span className="font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
          {formatCurrency(num)}
        </span>
      );
    }

    // 4. Dates
    if (fieldType === 'date' || fieldType === 'datetime' || colKey.includes('date')) {
      return (
        <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap text-xs">
          {formatDate(String(val), fieldType === 'datetime')}
        </span>
      );
    }

    // 5. Booleans
    if (typeof val === 'boolean' || fieldType === 'boolean') {
      return val ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          OUI
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
          NON
        </span>
      );
    }

    // Default char
    return (
      <span className="text-slate-900 dark:text-slate-100 text-xs break-words" title={String(val)}>
        {String(val)}
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
      
      {/* Top Action Toolbar */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        
        {/* Left: Search input + Quick Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              id="datatable-search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={`Rechercher dans ${modelConfig.name.toLowerCase()}...`}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filter chips */}
          <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-1">
            {quickFilters.map((qf) => (
              <button
                key={qf.id}
                onClick={() => {
                  setSelectedQuickFilter(qf.id);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  selectedQuickFilter === qf.id
                    ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {qf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right Tools: Filter Drawer, Column Selector, Export, Refresh */}
        <div className="flex items-center space-x-2 shrink-0">
          
          {/* Custom Filter Drawer Trigger */}
          <button
            id="filter-drawer-btn"
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center space-x-1.5 transition-colors cursor-pointer ${
              customFilters.length > 0 || showFilterDrawer
                ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filtres</span>
            {customFilters.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-bold">
                {customFilters.length}
              </span>
            )}
          </button>

          {/* Column Visibility Selector */}
          <div className="relative">
            <button
              id="column-manager-btn"
              onClick={() => setShowColumnManager(!showColumnManager)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center space-x-1.5 transition-colors cursor-pointer ${
                isModelCustomized
                  ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title="Personnaliser et afficher/masquer les colonnes"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Colonnes ({visibleColumns.length})</span>
              {isModelCustomized && (
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" title="Configuration personnalisée active" />
              )}
            </button>

            {/* Column Manager Dropdown Menu */}
            {showColumnManager && (
              <>
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setShowColumnManager(false)} 
                />
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-3 z-40 space-y-2.5 animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>Colonnes</span>
                        <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400">
                          ({visibleColumns.length}/{allAvailableFields.length})
                        </span>
                      </span>
                      <p className="text-[10px] text-slate-400 truncate max-w-[170px]" title={`Profil : ${userIdentifier}`}>
                        Profil : {userIdentifier}
                      </p>
                    </div>
                    
                    <button
                      onClick={handleResetColumns}
                      className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline flex items-center space-x-1 cursor-pointer font-medium"
                      title="Restaurer les colonnes par défaut du modèle"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Défaut</span>
                    </button>
                  </div>

                  {/* List of available columns */}
                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                    {allAvailableFields.map(({ key, def }) => {
                      const isChecked = visibleColumns.includes(key);
                      const label = def?.string || key;
                      return (
                        <label
                          key={key}
                          className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                            isChecked
                              ? 'bg-purple-50/70 dark:bg-purple-950/40 text-purple-950 dark:text-purple-200'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  if (visibleColumns.length > 1) {
                                    handleUpdateColumns(visibleColumns.filter(c => c !== key));
                                  }
                                } else {
                                  handleUpdateColumns([...visibleColumns, key]);
                                }
                              }}
                              className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                            />
                            <span className="truncate font-medium">{label}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0 ml-1.5">
                            {def?.type || 'char'}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Open advanced modal button */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => {
                        setShowColumnManager(false);
                        setIsCustomizerModalOpen(true);
                      }}
                      className="w-full py-1.5 px-3 rounded-xl bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border border-purple-200/80 dark:border-purple-800/80"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      <span>Configurateur Avancé & Réorganisation...</span>
                    </button>
                  </div>

                </div>
              </>
            )}
          </div>

          {/* Export Menu */}
          <div className="relative">
            <button
              id="export-dropdown-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exporter</span>
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-40 animate-in fade-in zoom-in-95">
                <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Format d'export
                </div>
                <button
                  onClick={() => handleExport('excel')}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center space-x-2 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Excel (.xlsx)</span>
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center space-x-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>CSV (Virgule / Point-virgule)</span>
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center space-x-2 cursor-pointer"
                >
                  <Code className="w-4 h-4 text-purple-600" />
                  <span>JSON Structuré</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Advanced Custom Filter Drawer */}
      {showFilterDrawer && (
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-3 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
              <Filter className="w-3.5 h-3.5 text-purple-600" />
              <span>Constructeur de Filtres Personnalisés (Domaine Odoo)</span>
            </span>
            <button
              onClick={handleAddCustomFilter}
              className="text-xs text-purple-600 dark:text-purple-400 font-semibold hover:underline flex items-center space-x-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter une condition</span>
            </button>
          </div>

          {customFilters.length === 0 ? (
            <div className="text-xs text-slate-500 dark:text-slate-400 italic">
              Aucune condition personnalisée active. Cliquez sur "Ajouter une condition" pour filtrer par montant, date ou client.
            </div>
          ) : (
            <div className="space-y-2">
              {customFilters.map(filter => (
                <div key={filter.id} className="flex items-center space-x-2 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                  {/* Field Selector */}
                  <select
                    value={filter.field}
                    onChange={(e) => handleUpdateCustomFilter(filter.id, { field: e.target.value })}
                    className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:ring-purple-500"
                  >
                    {allFieldKeys.map(k => (
                      <option key={k} value={k} className="dark:bg-slate-800">
                        {fieldDefs[k]?.string || k}
                      </option>
                    ))}
                  </select>

                  {/* Operator */}
                  <select
                    value={filter.operator}
                    onChange={(e) => handleUpdateCustomFilter(filter.id, { operator: e.target.value as any })}
                    className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:ring-purple-500 font-mono"
                  >
                    <option value="ilike" className="dark:bg-slate-800">contient (ilike)</option>
                    <option value="=" className="dark:bg-slate-800">égal à (=)</option>
                    <option value="!=" className="dark:bg-slate-800">différent de (!=)</option>
                    <option value=">" className="dark:bg-slate-800">supérieur à (&gt;)</option>
                    <option value="<" className="dark:bg-slate-800">inférieur à (&lt;)</option>
                  </select>

                  {/* Value */}
                  <input
                    type="text"
                    value={filter.value}
                    onChange={(e) => handleUpdateCustomFilter(filter.id, { value: e.target.value })}
                    placeholder="Valeur recherchée..."
                    className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1.5 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />

                  {/* Delete Button */}
                  <button
                    onClick={() => handleRemoveCustomFilter(filter.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating Selection Bar */}
      {selectedRowIds.length > 0 && (
        <div className="bg-purple-600 text-white px-4 py-2 flex items-center justify-between text-xs font-semibold animate-in slide-in-from-top-1">
          <div className="flex items-center space-x-2">
            <CheckSquare className="w-4 h-4" />
            <span>{selectedRowIds.length} ligne(s) sélectionnée(s)</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleExport('excel')}
              className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs cursor-pointer flex items-center space-x-1"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Exporter la sélection (.xlsx)</span>
            </button>
            <button
              onClick={() => setSelectedRowIds([])}
              className="text-white/80 hover:text-white underline cursor-pointer ml-2"
            >
              Désélectionner tout
            </button>
          </div>
        </div>
      )}

      {/* The Main Table */}
      <div className="overflow-x-auto min-h-[350px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              
              {/* Checkbox Column */}
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={
                    paginatedRecords.length > 0 &&
                    paginatedRecords.every(r => selectedRowIds.includes(r.id))
                  }
                  onChange={handleSelectAllOnPage}
                  className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
              </th>

              {/* Dynamic Columns */}
              {visibleColumns.map((colKey) => {
                const fieldDef = fieldDefs[colKey];
                const label = fieldDef?.string || colKey;
                const isSorted = sortState.field === colKey;
                const isRightAligned = fieldDef?.type === 'monetary' || colKey.includes('amount') || colKey.includes('price');

                return (
                  <th
                    key={colKey}
                    onClick={() => handleSort(colKey)}
                    className={`p-3 whitespace-nowrap cursor-pointer select-none hover:text-purple-600 transition-colors ${
                      isRightAligned ? 'text-right' : 'text-left'
                    }`}
                  >
                    <div className={`inline-flex items-center space-x-1 ${isRightAligned ? 'justify-end' : 'justify-start'}`}>
                      <span>{label}</span>
                      {isSorted ? (
                        sortState.direction === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-purple-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-purple-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-50 group-hover:opacity-100" />
                      )}
                    </div>
                  </th>
                );
              })}

              {/* Actions Column */}
              <th className="p-3 w-12 text-center">
                <span className="sr-only">Actions</span>
              </th>

            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
            {isLoading ? (
              <tr>
                <td colSpan={visibleColumns.length + 2} className="p-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <RefreshCw className="w-6 h-6 text-purple-600 animate-spin" />
                    <span className="text-xs font-medium">Chargement des données Odoo en cours...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedRecords.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 2} className="p-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <SlidersHorizontal className="w-8 h-8 text-slate-300 dark:text-slate-700" />
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Aucun enregistrement trouvé</p>
                    <p className="text-xs text-slate-400">
                      Essayez de modifier votre recherche ou vos filtres.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedRecords.map((row, idx) => {
                const isSelected = selectedRowIds.includes(row.id);
                return (
                  <tr
                    key={row.id || idx}
                    onClick={() => setInspectingRecord(row)}
                    className={`group transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-purple-50/70 dark:bg-purple-950/40 hover:bg-purple-100/70 dark:hover:bg-purple-900/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Checkbox */}
                    <td 
                      className="p-3 text-center" 
                      onClick={(e) => handleToggleSelectRow(row.id, e)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                    </td>

                    {/* Columns */}
                    {visibleColumns.map((colKey) => {
                      const fieldDef = fieldDefs[colKey];
                      const isRightAligned = fieldDef?.type === 'monetary' || colKey.includes('amount') || colKey.includes('price');

                      return (
                        <td
                          key={colKey}
                          className={`p-3 ${isRightAligned ? 'text-right' : 'text-left'}`}
                        >
                          {renderCellContent(row, colKey)}
                        </td>
                      );
                    })}

                    {/* Inspection Eye Icon */}
                    <td className="p-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectingRecord(row);
                        }}
                        className="p-1 rounded-lg text-slate-400 group-hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors cursor-pointer"
                        title="Voir le détail de l'enregistrement"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
        
        {/* Left: Records info */}
        <div className="flex items-center space-x-2">
          <span>
            Affichage de <strong>{processedRecords.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> à{' '}
            <strong>{Math.min(currentPage * pageSize, processedRecords.length)}</strong> sur{' '}
            <strong>{processedRecords.length}</strong> résultats filtrés
          </span>
          {cacheInfo?.fromCache && (
            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              Cache Odoo
            </span>
          )}
        </div>

        {/* Right: Page controls & Page size */}
        <div className="flex items-center space-x-3">
          
          {/* Page size selector */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[11px]">Par page :</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-800 dark:text-slate-200 focus:ring-purple-500 cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Première page"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Page précédente"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="px-2 font-medium">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Page suivante"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Dernière page"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

      </div>

      {/* Column Customizer Modal */}
      <ColumnCustomizerModal
        isOpen={isCustomizerModalOpen}
        onClose={() => setIsCustomizerModalOpen(false)}
        modelConfig={modelConfig}
        allAvailableFields={allAvailableFields}
        visibleColumns={visibleColumns}
        onApplyColumns={handleUpdateColumns}
        onResetColumns={handleResetColumns}
        userIdentifier={userIdentifier}
        isCustomized={isModelCustomized}
      />

      {/* Record Inspector Modal */}
      <RecordDetailModal
        isOpen={!!inspectingRecord}
        onClose={() => setInspectingRecord(null)}
        record={inspectingRecord}
        modelName={modelConfig.technicalName}
        fieldDefs={fieldDefs}
      />

    </div>
  );
};
