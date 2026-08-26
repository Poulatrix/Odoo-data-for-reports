import React from 'react';
import { 
  Database, 
  Settings, 
  RefreshCw, 
  Sun, 
  Moon, 
  Layers, 
  ExternalLink, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Plus,
  FileSpreadsheet,
  Table,
  User,
  LogOut
} from 'lucide-react';
import { OdooModelConfig, OdooConnectionState } from '../types/odoo';
import { SUPPORTED_MODELS } from '../data/odooModels';

interface HeaderProps {
  currentModel: OdooModelConfig;
  onSelectModel: (model: OdooModelConfig) => void;
  activeView: 'explorer' | 'report';
  onSelectView: (view: 'explorer' | 'report') => void;
  connectionState: OdooConnectionState;
  onOpenSettings: () => void;
  onOpenCustomModel: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onRefreshData: () => void;
  isRefreshing: boolean;
  cacheInfo?: { fromCache?: boolean; executionTimeMs?: number };
  userEmail?: string | null;
  userName?: string | null;
  onOpenSecurity?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentModel,
  onSelectModel,
  activeView,
  onSelectView,
  connectionState,
  onOpenSettings,
  onOpenCustomModel,
  isDarkMode,
  onToggleDarkMode,
  onRefreshData,
  isRefreshing,
  cacheInfo,
  userEmail,
  userName,
  onOpenSecurity,
  onLogout
}) => {
  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 transition-colors">
      {/* Top Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand & Main Mode Switcher */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onSelectView('explorer')}>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white font-bold text-lg">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                    Odoo<span className="text-purple-600 dark:text-purple-400">DataTable</span>
                  </span>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                    SaaS Pro
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                  Explorateur et Tableaux de Bord Odoo XML-RPC / JSON-RPC
                </p>
              </div>
            </div>

            {/* Main Tabs: Données vs Rapport */}
            <nav className="hidden lg:flex items-center space-x-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60">
              <button
                id="main-tab-explorer"
                onClick={() => onSelectView('explorer')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeView === 'explorer'
                    ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                <span>Explorateur de Données</span>
              </button>

              <button
                id="main-tab-report"
                onClick={() => onSelectView('report')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeView === 'report'
                    ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Rapport : Affaires à facturer</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold uppercase">
                  Nouveau
                </span>
              </button>
            </nav>
          </div>

          {/* Center: Connection Status Pill */}
          <div className="hidden md:flex items-center">
            <button
              id="connection-status-badge"
              onClick={onOpenSettings}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                connectionState.isDemoMode
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                  : connectionState.isConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                  : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50'
              }`}
              title="Cliquer pour configurer l'instance Odoo"
            >
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  connectionState.isDemoMode ? 'bg-amber-400' : connectionState.isConnected ? 'bg-emerald-400' : 'bg-rose-400'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  connectionState.isDemoMode ? 'bg-amber-500' : connectionState.isConnected ? 'bg-emerald-500' : 'bg-rose-500'
                }`}></span>
              </span>

              <span>
                {connectionState.isDemoMode ? (
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <strong>Mode Démo</strong> (Odoo v17 Enterprise)
                  </span>
                ) : connectionState.isConnected ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <strong>Connecté :</strong> {connectionState.credentials?.url.replace(/^https?:\/\//, '')} ({connectionState.credentials?.db})
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-rose-500" />
                    Non connecté
                  </span>
                )}
              </span>

              {cacheInfo?.executionTimeMs !== undefined && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 border-l border-slate-300 dark:border-slate-700 pl-1.5">
                  {cacheInfo.fromCache ? 'Cache' : `${cacheInfo.executionTimeMs}ms`}
                </span>
              )}
            </button>
          </div>

          {/* Right Action Tools */}
          <div className="flex items-center space-x-2">
            <button
              id="refresh-data-btn"
              onClick={onRefreshData}
              disabled={isRefreshing}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-50"
              title="Rafraîchir les données (contourne le cache)"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-purple-600' : ''}`} />
            </button>

            <button
              id="toggle-dark-mode-btn"
              onClick={onToggleDarkMode}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
              title={isDarkMode ? 'Passer en thème clair' : 'Passer en thème sombre'}
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>

            <button
              id="open-settings-btn"
              onClick={onOpenSettings}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-medium text-xs shadow-sm transition-all cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Paramètres Odoo</span>
            </button>

            {userEmail && (
              <div className="hidden lg:flex items-center space-x-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onOpenSecurity}
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs transition-colors cursor-pointer"
                  title={`Connecté en tant que ${userEmail} • Cliquer pour modifier le mot de passe`}
                >
                  <User className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span className="font-medium max-w-[130px] truncate">
                    {userName || userEmail.split('@')[0]}
                  </span>
                </button>
              </div>
            )}

            {onLogout && (
              <button
                id="logout-btn"
                onClick={onLogout}
                className="p-2 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors border border-rose-200 dark:border-rose-900/50 cursor-pointer"
                title="Se déconnecter"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Navigation Sub-Bar */}
      <div className="bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-2 overflow-x-auto no-scrollbar gap-2">
            
            {/* Left: Model Tabs or Report Switcher */}
            <div className="flex items-center space-x-1">
              
              {/* Report Tab Button (Always visible on all screen sizes) */}
              <button
                id="header-tab-report"
                onClick={() => onSelectView('report')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  activeView === 'report'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800/80'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Rapport : Affaires à Facturer</span>
              </button>

              <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>

              {/* Models Tabs */}
              {SUPPORTED_MODELS.map((m) => {
                const isActive = activeView === 'explorer' && currentModel.id === m.id;
                return (
                  <button
                    key={m.id}
                    id={`model-tab-${m.id.replace('.', '-')}`}
                    onClick={() => {
                      onSelectView('explorer');
                      onSelectModel(m);
                    }}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 shadow-xs border border-purple-200 dark:border-purple-700/50 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900'
                    }`}
                  >
                    <span>{m.name}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                      {m.technicalName}
                    </span>
                  </button>
                );
              })}

              <button
                id="custom-model-tab"
                onClick={() => {
                  onSelectView('explorer');
                  onOpenCustomModel();
                }}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/50 border border-dashed border-purple-300 dark:border-purple-800 transition-colors cursor-pointer"
                title="Interroger un autre modèle technique Odoo (ex: stock.picking, mrp.production)"
              >
                <Plus className="w-3 h-3" />
                <span>Autre Modèle Odoo</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    </header>
  );
};

