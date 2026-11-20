import React from 'react';
import { 
  Database, 
  Settings, 
  RefreshCw, 
  Sun, 
  Moon, 
  FileSpreadsheet,
  Clock,
  Scale,
  BarChart3,
  LayoutDashboard,
  PackageMinus,
  Plus,
  User,
  LogOut,
  Sparkles
} from 'lucide-react';
import { EcomiLogo } from './EcomiLogo';
import { OdooModelConfig, OdooConnectionState } from '../types/odoo';
import { SUPPORTED_MODELS } from '../data/odooModels';

interface HeaderProps {
  currentModel: OdooModelConfig;
  onSelectModel: (model: OdooModelConfig) => void;
  activeView: 'home' | 'report' | 'timesheets' | 'moulds' | 'billing' | 'wip-outflow' | 'explorer';
  onSelectView: (view: 'home' | 'report' | 'timesheets' | 'moulds' | 'billing' | 'wip-outflow' | 'explorer') => void;
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
          
          {/* Logo & Brand & Easter Egg */}
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => onSelectView('home')}>
            <EcomiLogo size="md" showSubtitle={true} />
            <div className="h-7 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block"></div>
            <div className="hidden sm:flex flex-col justify-center">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-bold tracking-tight text-[#0B2559] dark:text-blue-300">
                  Portail Odoo
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#0B2559]/10 text-[#0B2559] dark:bg-blue-950/60 dark:text-blue-300 border border-[#0B2559]/20">
                  Live
                </span>
              </div>
              {/* RESTORED EASTER EGG TAGLINE */}
              <p 
                className="text-[10px] text-indigo-600 dark:text-indigo-300 font-semibold tracking-tight italic flex items-center gap-1 group-hover:text-blue-700 transition-colors"
                title="« Accroche-toi à ta culotte, c'est moi qui pilote ! »"
              >
                <span>🚀</span>
                <span>« Accroche-toi à ta culotte, c'est moi qui pilote ! »</span>
              </p>
            </div>
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
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#0B2559] dark:text-blue-400' : ''}`} />
            </button>

            {/* Bascule Mode Jour / Mode Nuit avec indicateur clair */}
            <div 
              className="flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
              title={isDarkMode ? 'Mode Nuit actif (cliquer pour Mode Jour)' : 'Mode Jour actif (cliquer pour Mode Nuit)'}
            >
              <button
                type="button"
                id="toggle-light-mode-btn"
                onClick={() => isDarkMode && onToggleDarkMode()}
                className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  !isDarkMode 
                    ? 'bg-white text-amber-600 shadow-2xs font-semibold' 
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
                title="Passer en Mode Jour"
              >
                <Sun className={`w-3.5 h-3.5 ${!isDarkMode ? 'text-amber-500' : 'text-slate-400'}`} />
                <span className="hidden md:inline text-[11px]">Jour</span>
              </button>
              <button
                type="button"
                id="toggle-dark-mode-btn"
                onClick={() => !isDarkMode && onToggleDarkMode()}
                className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  isDarkMode 
                    ? 'bg-slate-900 text-indigo-300 shadow-2xs font-semibold' 
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
                title="Passer en Mode Nuit"
              >
                <Moon className={`w-3.5 h-3.5 ${isDarkMode ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span className="hidden md:inline text-[11px]">Nuit</span>
              </button>
            </div>

            {/* Bouton Paramètres Odoo avec indicateur discret de statut */}
            <button
              id="open-settings-btn"
              onClick={onOpenSettings}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-[#0B2559] hover:bg-[#07193D] dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-all cursor-pointer"
              title={`Paramètres Odoo (${connectionState.isDemoMode ? 'Mode Démo Sandbox' : connectionState.isConnected ? 'Connecté' : 'Non connecté'})`}
            >
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  connectionState.isDemoMode ? 'bg-amber-400' : connectionState.isConnected ? 'bg-emerald-400' : 'bg-rose-400'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  connectionState.isDemoMode ? 'bg-amber-500' : connectionState.isConnected ? 'bg-emerald-500' : 'bg-rose-500'
                }`}></span>
              </span>
              <Settings className="w-3.5 h-3.5" />
              <span>Paramètres Odoo</span>
            </button>

            {userEmail && (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onOpenSecurity}
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs transition-colors cursor-pointer"
                  title={`Connecté en tant que ${userEmail} • Cliquer pour modifier le mot de passe`}
                >
                  <User className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  <span className="font-medium max-w-[150px] truncate">
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
            
            {/* Left: Modules & Views */}
            <div className="flex items-center space-x-1">
              
              {/* Home / Dashboard Tab Button */}
              <button
                id="header-tab-home"
                onClick={() => onSelectView('home')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeView === 'home'
                    ? 'bg-[#0B2559] text-white dark:bg-blue-600 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Accueil / Dashboard</span>
              </button>

              {/* Bilan Facturation Tab Button */}
              <button
                id="header-tab-billing"
                onClick={() => onSelectView('billing')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeView === 'billing'
                    ? 'bg-[#0B2559] text-white dark:bg-blue-600 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Bilan Facturation</span>
              </button>

              {/* Sorties d'Encours Achats Tab Button */}
              <button
                id="header-tab-wip-outflow"
                onClick={() => onSelectView('wip-outflow')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeView === 'wip-outflow'
                    ? 'bg-[#0B2559] text-white dark:bg-blue-600 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Achats et sous-traitances rattachés aux ventes facturées par mois"
              >
                <PackageMinus className="w-3.5 h-3.5 text-amber-400" />
                <span>Sorties d'Encours Achats</span>
              </button>

              {/* Report Tab Button: Affaires à Facturer */}
              <button
                id="header-tab-report"
                onClick={() => onSelectView('report')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeView === 'report'
                    ? 'bg-[#0B2559] text-white dark:bg-blue-600 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Affaires à Facturer</span>
              </button>

              {/* Timesheets Tab Button */}
              <button
                id="header-tab-timesheets"
                onClick={() => onSelectView('timesheets')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeView === 'timesheets'
                    ? 'bg-[#0B2559] text-white dark:bg-blue-600 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Contrôle des Pointages</span>
              </button>

              {/* Moulds Weight Check Tab Button */}
              <button
                id="header-tab-moulds"
                onClick={() => onSelectView('moulds')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeView === 'moulds'
                    ? 'bg-[#0B2559] text-white dark:bg-blue-600 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Poids Moules Neufs</span>
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
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs border border-slate-200 dark:border-slate-700'
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
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
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


