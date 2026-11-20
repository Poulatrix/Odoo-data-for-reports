import React from 'react';
import { 
  LayoutDashboard, 
  BarChart3, 
  PackageMinus, 
  FileSpreadsheet, 
  Clock, 
  Scale, 
  Info, 
  Sun, 
  Moon, 
  LogOut, 
  Layers, 
  Settings, 
  Database,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  X
} from 'lucide-react';
import { OdooConnectionState } from '../types/odoo';

export interface NavBadges {
  uninvoicedOrdersCount?: number;
  timesheetAnomaliesCount?: number;
  mouldAnomaliesCount?: number;
}

interface SidebarProps {
  activeView: 'home' | 'report' | 'timesheets' | 'moulds' | 'billing' | 'wip-outflow' | 'explorer';
  onSelectView: (view: 'home' | 'report' | 'timesheets' | 'moulds' | 'billing' | 'wip-outflow' | 'explorer') => void;
  connectionState: OdooConnectionState;
  badges?: NavBadges;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  userName?: string | null;
  userEmail?: string | null;
  onOpenRulesModal: () => void;
  onOpenSettings: () => void;
  onOpenSecurity?: () => void;
  onLogout?: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  connectionState,
  badges = {} as NavBadges,
  isDarkMode,
  onToggleDarkMode,
  userName = 'Nicolas Hubert',
  userEmail = 'nhubert@ecomi.com',
  onOpenRulesModal,
  onOpenSettings,
  onOpenSecurity,
  onLogout,
  isOpenMobile = false,
  onCloseMobile
}) => {
  const navItems = [
    {
      id: 'home' as const,
      label: 'Accueil / Dashboard',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'billing' as const,
      label: 'Bilan Facturation',
      icon: BarChart3,
      badge: null
    },
    {
      id: 'wip-outflow' as const,
      label: "Sorties d'Encours",
      icon: PackageMinus,
      badge: null
    },
    {
      id: 'report' as const,
      label: 'Affaires à Facturer',
      icon: FileSpreadsheet,
      badge: badges.uninvoicedOrdersCount !== undefined && badges.uninvoicedOrdersCount > 0 ? (
        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
          {badges.uninvoicedOrdersCount}
        </span>
      ) : null
    },
    {
      id: 'timesheets' as const,
      label: 'Contrôle Pointages',
      icon: Clock,
      badge: badges.timesheetAnomaliesCount !== undefined && badges.timesheetAnomaliesCount > 0 ? (
        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/10 text-rose-500 dark:bg-rose-500/20 dark:text-rose-400 font-mono">
          {badges.timesheetAnomaliesCount} NOK
        </span>
      ) : null
    },
    {
      id: 'moulds' as const,
      label: 'Poids Moules Neufs',
      icon: Scale,
      badge: badges.mouldAnomaliesCount !== undefined && badges.mouldAnomaliesCount > 0 ? (
        <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full bg-rose-500/10 text-rose-500 dark:bg-rose-500/20 dark:text-rose-400 font-mono">
          {badges.mouldAnomaliesCount}
        </span>
      ) : null
    }
  ];

  // User initials for avatar circle
  const initials = userName
    ? userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'NH';

  const sidebarContent = (
    <aside className="w-64 h-full flex flex-col justify-between bg-white dark:bg-[#0b0f17] border-r border-slate-200 dark:border-slate-800/80 select-none transition-colors">
      
      {/* Top Part: Logo & Navigation */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar p-4">
        
        {/* Brand Header */}
        <div className="flex items-center justify-between pb-6 pt-1 gap-2">
          <div 
            onClick={() => {
              onSelectView('home');
              onCloseMobile?.();
            }}
            className="flex items-center space-x-2.5 cursor-pointer group min-w-0"
          >
            {/* SaaS Logo */}
            <div className="w-[104px] h-[44px] rounded-xl bg-white border border-slate-200/90 dark:border-slate-700/80 shadow-xs overflow-hidden shrink-0 flex items-center justify-center group-hover:scale-[1.03] transition-transform">
              <img
                src="/assets/aistudio/odoo-data-report_0b974500.png"
                alt="Odoo Data Report Logo"
                className="w-full h-full object-cover object-center"
              />
            </div>
            
            <div className="flex flex-col min-w-0">
              <div className="flex items-center space-x-1">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 uppercase tracking-wider font-mono">
                  DRIVE
                </span>
              </div>
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 tracking-wide truncate mt-1">
                Ecomi ERP
              </span>
            </div>
          </div>

          {/* Close button on mobile */}
          {onCloseMobile && (
            <button 
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Section Label */}
        <div className="px-2 pb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-sans">
            Menu Principal
          </span>
        </div>

        {/* Nav Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectView(item.id);
                  onCloseMobile?.();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-slate-800/90 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${
                    isActive 
                      ? 'text-sky-400' 
                      : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                  }`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && <div className="ml-2 shrink-0">{item.badge}</div>}
              </button>
            );
          })}
        </nav>

        {/* Discreet Secondary Link to Odoo Technical Explorer */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <button
            onClick={() => {
              onSelectView('explorer');
              onCloseMobile?.();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
              activeView === 'explorer'
                ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-900/40'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Database className="w-3.5 h-3.5 text-slate-400" />
              <span>Explorateur Odoo</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">v17</span>
          </button>
        </div>

      </div>

      {/* Bottom Part: Portail Odoo Live Card & User Profile */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3 shrink-0">
        
        {/* Portail Odoo Live Card (As featured in mockup) */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 space-y-2">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                connectionState.isDemoMode ? 'bg-amber-400' : connectionState.isConnected ? 'bg-emerald-400' : 'bg-rose-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                connectionState.isDemoMode ? 'bg-amber-500' : connectionState.isConnected ? 'bg-emerald-500' : 'bg-rose-500'
              }`}></span>
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Portail Odoo Live
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
            {connectionState.isDemoMode 
              ? 'Mode Sandbox (Données d\'exemple Odoo 17).'
              : 'Connecté en direct au serveur ERP d\'usine.'}
          </p>

          <button
            type="button"
            onClick={onOpenRulesModal}
            className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Info className="w-3.5 h-3.5 text-sky-500" />
            <span>Règles de calcul</span>
          </button>
        </div>

        {/* User Profile Bar with Dark Mode Toggle */}
        <div className="flex items-center justify-between pt-1">
          <div 
            onClick={onOpenSecurity}
            className="flex items-center space-x-2.5 min-w-0 cursor-pointer group flex-1"
            title="Profil utilisateur • Modifier mot de passe"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-sky-500 transition-colors">
                {userName}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                Ecomi Admin
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            {/* Dark mode switcher toggle */}
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={isDarkMode ? 'Passer en Mode Jour' : 'Passer en Mode Nuit'}
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            {/* Logout button */}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                title="Se déconnecter"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

      </div>

    </aside>
  );

  return (
    <>
      {/* Desktop Fixed Left Sidebar */}
      <div className="hidden lg:block fixed inset-y-0 left-0 z-40 w-64 shadow-xs">
        {sidebarContent}
      </div>

      {/* Mobile Drawer Backdrop & Sidebar */}
      {isOpenMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
