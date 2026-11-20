import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Users,
  Download,
  Play,
  Clock,
  Sparkles,
  Info,
  Trash2,
  Search,
  RotateCcw,
  CheckSquare,
  Square,
  Loader2
} from 'lucide-react';
import { ClockImportedRecord } from '../../types/clockAudit';
import { TimesheetAuditEmployeeItem } from '../../types/odoo';
import {
  parsePointeuseFile,
  ParsePointeuseResult,
  generateSamplePointeuseXlsxBlob
} from '../../utils/clockSpreadsheetParser';

interface ClockImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableEmployees: TimesheetAuditEmployeeItem[];
  onImportComplete: (records: ClockImportedRecord[]) => void;
  startDate?: string;
  endDate?: string;
}

export const ClockImportModal: React.FC<ClockImportModalProps> = ({
  isOpen,
  onClose,
  availableEmployees,
  onImportComplete,
  startDate,
  endDate
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseResult, setParseResult] = useState<ParsePointeuseResult | null>(null);

  // Active editable records (user can delete lines before finalizing)
  const [activeRecords, setActiveRecords] = useState<ClockImportedRecord[]>([]);
  const [initialRecords, setInitialRecords] = useState<ClockImportedRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const initRecordsFromParse = (res: ParsePointeuseResult, name: string) => {
    // Ensure every record has a unique ID for React keys and selection
    const sanitized = res.records.map((r, idx) => ({
      ...r,
      id: r.id || `row_${idx}_${r.date}_${r.employeeNameRaw}`
    }));
    setParseResult(res);
    setActiveRecords(sanitized);
    setInitialRecords(sanitized);
    setSelectedIds(new Set());
    setSearchFilter('');
    setFileName(name);
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const res = await parsePointeuseFile(file, availableEmployees, file.name);
      initRecordsFromParse(res, file.name);
    } catch (err) {
      console.error('Error parsing file:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Load realistic demo sample (.xlsx blob with exact 9 columns)
  const handleLoadSample = async () => {
    setIsProcessing(true);
    try {
      const blob = generateSamplePointeuseXlsxBlob(availableEmployees, 2026);
      const arrayBuffer = await blob.arrayBuffer();
      const res = await parsePointeuseFile(
        arrayBuffer,
        availableEmployees,
        'releve_pointeuse_exemple.xlsx',
        2026
      );
      initRecordsFromParse(res, 'releve_pointeuse_exemple.xlsx (Échantillon)');
    } catch (err) {
      console.error('Error loading sample:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Download exact Excel template
  const handleDownloadXlsxTemplate = () => {
    const blob = generateSamplePointeuseXlsxBlob(availableEmployees, 2026);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele_releve_pointeuse.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Row deletion actions
  const handleDeleteRow = (recordId: string) => {
    setActiveRecords(prev => prev.filter(r => r.id !== recordId));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(recordId);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setActiveRecords(prev => prev.filter(r => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
  };

  const handleToggleSelect = (recordId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  const handleToggleSelectAll = (visibleIds: string[]) => {
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleResetRecords = () => {
    setActiveRecords(initialRecords);
    setSelectedIds(new Set());
  };

  // Filtered rows for display
  const filteredRecords = useMemo(() => {
    if (!searchFilter.trim()) return activeRecords;
    const q = searchFilter.toLowerCase().trim();
    return activeRecords.filter(r =>
      r.employeeNameRaw.toLowerCase().includes(q) ||
      (r.matchedEmployeeName && r.matchedEmployeeName.toLowerCase().includes(q)) ||
      r.date.includes(q)
    );
  }, [activeRecords, searchFilter]);

  // Dynamic statistics computed from active non-deleted records
  const dynamicStats = useMemo(() => {
    const totalHours = activeRecords.reduce((acc, r) => acc + r.rawHours, 0);
    const uniqueEmployees = new Set(activeRecords.map(r => r.employeeNameRaw)).size;
    let minD = '';
    let maxD = '';
    activeRecords.forEach(r => {
      if (r.date) {
        if (!minD || r.date < minD) minD = r.date;
        if (!maxD || r.date > maxD) maxD = r.date;
      }
    });
    return {
      count: activeRecords.length,
      deletedCount: initialRecords.length - activeRecords.length,
      totalHours: totalHours.toFixed(2),
      uniqueEmployees,
      dateRange: minD && maxD ? `${minD} → ${maxD}` : 'Non détectée'
    };
  }, [activeRecords, initialRecords]);

  const handleConfirmImport = async () => {
    if (!activeRecords.length || isProcessing) return;
    setIsProcessing(true);
    try {
      await onImportComplete(activeRecords);
      onClose();
    } catch (err) {
      console.error('Erreur lors de la validation de l\'import:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const visibleIds = useMemo(() => filteredRecords.map(r => r.id), [filteredRecords]);
  const isAllVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Importer Relevé Pointeuse (Excel / CSV)
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                  .xlsx & .csv
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Supporte la structure : [Opérateur, Date, Entrée 1, Sortie 1, Entrée 2, Sortie 2, Entrée 3, Sortie 3, Temps Effectif]
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          
          {/* Top helper actions */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span>Priorité : Colonne <strong>Sortie_3</strong> (si valide) ou cumul <strong>(Sortie_1 - Entrée_1) + (Sortie_2 - Entrée_2)</strong></span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleDownloadXlsxTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 font-medium cursor-pointer shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Modèle Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={handleLoadSample}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 font-medium cursor-pointer shadow-xs transition-colors"
              >
                <Play className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                <span>Charger un exemple d'essai</span>
              </button>
            </div>
          </div>

          {/* Upload Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragActive
                ? 'border-slate-400 bg-slate-100/50 dark:bg-slate-800/40'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 bg-slate-50/50 dark:bg-slate-850/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              onChange={handleInputChange}
              className="hidden"
            />
            <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 shadow-xs">
              <UploadCloud className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Glissez-déposez votre relevé Excel (.xlsx) ou CSV ici
            </p>
            <p className="text-xs text-slate-400 mt-1">
              ou cliquez pour parcourir vos documents
            </p>
            {fileName && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                <span>Fichier : {fileName}</span>
              </div>
            )}
          </div>

          {/* Parse Results Preview */}
          {parseResult && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {parseResult.errors.length > 0 ? (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Erreur de lecture du fichier :</div>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      {parseResult.errors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <>
                  {/* Dynamic Summary Badges (reflects deletions in real-time) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Lignes Conservées</div>
                      <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white mt-1 flex items-baseline gap-1.5">
                        <span>{dynamicStats.count}</span>
                        {dynamicStats.deletedCount > 0 && (
                          <span className="text-xs font-normal text-rose-600 dark:text-rose-400">
                            (-{dynamicStats.deletedCount})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <span>Collaborateurs</span>
                      </div>
                      <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                        {dynamicStats.uniqueEmployees}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <span>Cumul Badgé</span>
                      </div>
                      <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                        {dynamicStats.totalHours} <span className="text-xs font-normal text-slate-400">h</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <span>Période</span>
                      </div>
                      <div className="text-xs font-medium font-mono tabular-nums text-slate-800 dark:text-slate-200 mt-1.5 truncate">
                        {dynamicStats.dateRange}
                      </div>
                    </div>
                  </div>

                  {/* Rows Table with Individual & Bulk Delete Controls */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs bg-white dark:bg-slate-900">
                    
                    {/* Table Toolbar */}
                    <div className="bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <div className="relative flex-1 max-w-xs">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                          <input
                            type="text"
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value)}
                            placeholder="Filtrer collaborateur, date..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                          />
                        </div>
                        <span className="text-[11px] text-slate-500 font-normal">
                          {filteredRecords.length} affichée(s) sur {activeRecords.length}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Selected delete button */}
                        {selectedIds.size > 0 && (
                          <button
                            type="button"
                            onClick={handleDeleteSelected}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-2xs cursor-pointer animate-in fade-in"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Supprimer la sélection ({selectedIds.size})</span>
                          </button>
                        )}

                        {/* Reset button if any rows deleted */}
                        {dynamicStats.deletedCount > 0 && (
                          <button
                            type="button"
                            onClick={handleResetRecords}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                            title="Rétablir toutes les lignes initialement détectées dans le fichier"
                          >
                            <RotateCcw className="w-3 h-3 text-slate-500" />
                            <span>Rétablir ({initialRecords.length})</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Scrollable Rows Table */}
                    <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-slate-50 dark:bg-slate-850 text-slate-600 dark:text-slate-400 text-[10px] uppercase font-medium sticky top-0 z-10 backdrop-blur-xs border-b border-slate-200/80 dark:border-slate-800">
                          <tr>
                            <th className="py-2 px-3 w-8 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleSelectAll(visibleIds)}
                                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                                title={isAllVisibleSelected ? "Tout désélectionner" : "Tout sélectionner"}
                              >
                                {isAllVisibleSelected ? (
                                  <CheckSquare className="w-4 h-4 text-slate-800 dark:text-slate-200" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            </th>
                            <th className="py-2 px-3">Collaborateur / Opérateur</th>
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3 text-center">Entrée 1 → Sortie 1</th>
                            <th className="py-2 px-3 text-center">Entrée 2 → Sortie 2</th>
                            <th className="py-2 px-3 text-center">Sortie 3 (Prioritaire)</th>
                            <th className="py-2 px-3 text-right">Temps Retenu</th>
                            <th className="py-2 px-3 text-center w-12">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredRecords.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-8 text-center text-xs text-slate-400">
                                Aucune ligne ne correspond au filtre ou toutes les lignes ont été supprimées.
                              </td>
                            </tr>
                          ) : (
                            filteredRecords.map((r, idx) => {
                              const isSelected = selectedIds.has(r.id);
                              return (
                                <tr
                                  key={r.id || idx}
                                  className={`transition-colors ${
                                    isSelected
                                      ? 'bg-slate-100/70 dark:bg-slate-800/60'
                                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                                  }`}
                                >
                                  <td className="py-2 px-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleToggleSelect(r.id)}
                                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-400 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                                    <div className="flex flex-col">
                                      <span>{r.employeeNameRaw}</span>
                                      {r.matchedEmployeeName && r.matchedEmployeeName !== r.employeeNameRaw && (
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                                          → {r.matchedEmployeeName}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                                    {r.date}
                                  </td>
                                  <td className="py-2 px-3 text-center text-slate-500 font-mono text-[11px]">
                                    {r.entree1 || r.sortie1 ? `${r.entree1 || '—'} → ${r.sortie1 || '—'}` : '—'}
                                  </td>
                                  <td className="py-2 px-3 text-center text-slate-500 font-mono text-[11px]">
                                    {r.entree2 || r.sortie2 ? `${r.entree2 || '—'} → ${r.sortie2 || '—'}` : '—'}
                                  </td>
                                  <td className="py-2 px-3 text-center font-mono text-[11px]">
                                    {r.sortie3 ? (
                                      <span className="text-slate-700 dark:text-slate-300 font-medium bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200/80 dark:border-slate-700">
                                        {r.sortie3}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">Non renseigné</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-right font-medium text-slate-900 dark:text-white font-mono tabular-nums">
                                    <span className="inline-flex items-center gap-1">
                                      <span>{r.rawHours.toFixed(2)} h</span>
                                      {r.calculationMethod === 'sortie_3' && (
                                        <span className="text-[9px] font-normal text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 rounded">
                                          Sortie_3
                                        </span>
                                      )}
                                      {r.calculationMethod === 'creneaux' && (
                                        <span className="text-[9px] font-normal text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 rounded">
                                          Créneaux
                                        </span>
                                      )}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRow(r.id)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                                      title="Supprimer cette ligne avant l'import"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Fermer
          </button>

          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={!activeRecords.length || isProcessing}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Enregistrement dans la base...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Valider et enregistrer ({activeRecords.length} lignes)</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
