import React, { useState } from 'react';
import { 
  Search, 
  RefreshCw, 
  Bell, 
  Settings, 
  Menu, 
  X,
  Database,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { OdooConnectionState } from '../types/odoo';

interface TopNavProps {
  onOpenMobileMenu: () => void;
  onRefreshData: () => void;
  isRefreshing: boolean;
  onOpenSettings: () => void;
  onOpenRulesModal: () => void;
  connectionState: OdooConnectionState;
  onSearchGlobal?: (query: string) => void;
  globalSearchQuery?: string;
}

export const TopNav: React.FC<TopNavProps> = ({
  onOpenMobileMenu,
  onRefreshData,
  isRefreshing,
  onOpenSettings,
  onOpenRulesModal,
  connectionState,
  onSearchGlobal,
  globalSearchQuery = ''
}) => {
  const [searchValue, setSearchValue] = useState(globalSearchQuery);
  const [showNotifications, setShowNotifications] = useState(false);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchValue(val);
    onSearchGlobal?.(val);
  };

  const handleClearSearch = () => {
    setSearchValue('');
    onSearchGlobal?.('');
  };

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-[#0b0f17]/80 backdrop-blur-md sticky top-0 z-30 transition-colors">
      <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        
        {/* Left: Mobile Menu Trigger + Brand on Mobile */}
        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Ouvrir le menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Compact Logo visible on mobile/tablet when sidebar is collapsed */}
          <div className="lg:hidden w-[78px] h-[34px] rounded-lg bg-white border border-slate-200/90 dark:border-slate-700/80 shadow-2xs overflow-hidden shrink-0 flex items-center justify-center">
            <img
              src="/assets/aistudio/odoo-data-report_0b974500.png"
              alt="Odoo Data Report Logo"
              className="w-full h-full object-cover object-center"
            />
          </div>

          {/* Quick breadcrumb or easter egg text on large screens */}
          <div className="hidden xl:flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 tracking-tight">
              Odoo ERP Connecté
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
              « Accroche-toi à ta culotte, c'est moi qui pilote ! » 🚀
            </span>
          </div>
        </div>

        {/* Center / Search: Large Sleek Search Pill matching mockup */}
        <div className="flex-1 max-w-xl mx-auto">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchValue}
              onChange={handleSearchChange}
              placeholder="Recherche globale (N° affaire, moule, client)..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all shadow-2xs"
            />
            {searchValue && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Tools: Synchro Odoo, Notifications, Settings */}
        <div className="flex items-center space-x-2 shrink-0">
          
          {/* Synchro Odoo Button */}
          <button
            type="button"
            onClick={onRefreshData}
            disabled={isRefreshing}
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            title="Forcer la synchronisation avec les tables Odoo"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Synchro Odoo</span>
          </button>

          {/* Notifications / Alerts Bell Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-full text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-800 transition-colors relative cursor-pointer"
              title="Centre de notifications & alertes"
            >
              <Bell className="w-4 h-4" />
              {/* Alert red dot */}
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#0b0f17]" />
            </button>

            {/* Notification Dropdown Popover */}
            {showNotifications && (
              <div 
                className="absolute right-0 mt-2 w-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Alertes Odoo Live</span>
                  <button 
                    onClick={() => setShowNotifications(false)}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="py-3 space-y-2.5">
                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-1" />
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">2 anomalies de poids moules</p>
                      <p className="text-[11px] text-slate-400">Poids à 0 kg sur commandes récentes.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1" />
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">Pointages RH à valider</p>
                      <p className="text-[11px] text-slate-400">8 collaborateurs avec heures incomplètes.</p>
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotifications(false);
                      onOpenRulesModal();
                    }}
                    className="w-full text-center text-xs text-sky-500 hover:text-sky-600 font-medium py-1"
                  >
                    Consulter les règles de calcul →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Odoo Settings Gear */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 rounded-full text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-800 transition-colors cursor-pointer"
            title="Paramètres de connexion Odoo"
          >
            <Settings className="w-4 h-4" />
          </button>

        </div>

      </div>
    </header>
  );
};
