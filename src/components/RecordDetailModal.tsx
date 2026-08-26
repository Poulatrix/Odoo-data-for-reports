import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  ExternalLink, 
  Layers, 
  Code, 
  ListTree, 
  Calendar, 
  User, 
  Hash, 
  FileText 
} from 'lucide-react';
import { OdooFieldDefinition } from '../types/odoo';
import { formatCurrency, formatDate, getMany2OneDisplay } from '../utils/formatters';

interface RecordDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: Record<string, any> | null;
  modelName: string;
  fieldDefs: Record<string, OdooFieldDefinition>;
}

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({
  isOpen,
  onClose,
  record,
  modelName,
  fieldDefs
}) => {
  const [activeTab, setActiveTab] = useState<'formatted' | 'raw'>('formatted');
  const [copied, setCopied] = useState(false);

  if (!isOpen || !record) return null;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const recordEntries = Object.entries(record);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {record.name || record.display_name || `Enregistrement #${record.id}`}
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  ID: {record.id}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Modèle Odoo : {modelName}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyJson}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center space-x-1.5 cursor-pointer"
              title="Copier le JSON brut de l'enregistrement"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copié !' : 'Copier JSON'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab switch */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex space-x-4">
          <button
            onClick={() => setActiveTab('formatted')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'formatted'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <ListTree className="w-3.5 h-3.5" />
            <span>Vue Structurée des Champs</span>
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'raw'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Payload JSON Odoo</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'formatted' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recordEntries.map(([key, val]) => {
                const fieldDef = fieldDefs[key];
                const fieldLabel = fieldDef?.string || key;
                const fieldType = fieldDef?.type || typeof val;

                // Format display based on type
                let renderedVal = String(val ?? '—');
                if (val === null || val === undefined || val === false) {
                  renderedVal = '—';
                } else if (Array.isArray(val) && val.length >= 2) {
                  renderedVal = `[${val[0]}] ${val[1]}`;
                } else if (fieldType === 'monetary' || key.includes('amount') || key.includes('price')) {
                  renderedVal = typeof val === 'number' ? formatCurrency(val) : String(val);
                } else if (fieldType === 'datetime' || fieldType === 'date' || key.includes('date')) {
                  renderedVal = formatDate(String(val), fieldType === 'datetime');
                } else if (typeof val === 'boolean') {
                  renderedVal = val ? 'Oui (True)' : 'Non (False)';
                } else if (typeof val === 'object') {
                  renderedVal = JSON.stringify(val);
                }

                return (
                  <div 
                    key={key} 
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {fieldLabel}
                      </span>
                      <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-1.5 py-0.5 rounded">
                        {key}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-900 dark:text-white break-words">
                      {renderedVal}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 text-xs font-mono overflow-x-auto">
              {JSON.stringify(record, null, 2)}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-900/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
