import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar, NavBadges } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { CalculationRulesModal } from './components/CalculationRulesModal';
import { HomeDashboardView } from './components/HomeDashboard/HomeDashboardView';
import { BillingReportView } from './components/BillingReport/BillingReportView';
import { WipPurchasesOutflowView } from './components/WipPurchasesOutflow/WipPurchasesOutflowView';
import { KpiSummaryCards } from './components/KpiSummaryCards';
import { DataTable } from './components/DataTable/DataTable';
import { UninvoicedOrdersReport } from './components/UninvoicedOrdersReport/UninvoicedOrdersReport';
import { TimesheetAuditView } from './components/TimesheetAudit/TimesheetAuditView';
import { MouldWeightCheckView } from './components/MouldWeightCheck/MouldWeightCheckView';
import { ConnectionModal } from './components/ConnectionModal';
import { CustomModelModal } from './components/CustomModelModal';
import { LoginPage } from './components/Auth/LoginPage';
import { SecurityModal } from './components/Auth/SecurityModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SUPPORTED_MODELS, MODEL_FIELD_DEFINITIONS } from './data/odooModels';
import { 
  getUserIdentifier, 
  getSavedColumnsForModel 
} from './utils/columnPreferences';
import { 
  OdooModelConfig, 
  OdooConnectionState, 
  OdooFieldDefinition 
} from './types/odoo';
import { odooClient } from './services/odooClient';
import { 
  AlertCircle, 
  CheckCircle2, 
  Sparkles, 
  Database, 
  RefreshCw,
  Server,
  Zap,
  FileSpreadsheet,
  Loader2
} from 'lucide-react';

function MainDashboard() {
  const { 
    currentUser, 
    loading: authLoading, 
    odooCredentials, 
    isConfigured, 
    isDemoMode, 
    setDemoMode, 
    logout 
  } = useAuth();

  // Theme state with localStorage persistence
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('ecomi_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
    } catch {}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    try {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.classList.add('dark');
        localStorage.setItem('ecomi_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.classList.remove('dark');
        localStorage.setItem('ecomi_theme', 'light');
      }
    } catch {}
  }, [isDarkMode]);

  // Active View State: 'home' (Accueil Dashboard), 'billing' (Bilan Facturation), 'wip-outflow' (Sorties d'Encours Achats), 'report' (Affaires à facturer), 'timesheets' (Contrôle des Pointages), 'moulds' (Vérification Poids), or 'explorer' (Data Table)
  const [activeView, setActiveView] = useState<'home' | 'report' | 'timesheets' | 'moulds' | 'billing' | 'wip-outflow' | 'explorer'>('home');

  // Active Odoo Model (when in explorer view)
  const [currentModel, setCurrentModel] = useState<OdooModelConfig>(SUPPORTED_MODELS[0]);

  // Connection State
  const [connectionState, setConnectionState] = useState<OdooConnectionState>(() => {
    if (odooCredentials) {
      return {
        isConnected: true,
        isDemoMode: false,
        credentials: odooCredentials,
        userInfo: {
          uid: 1,
          name: odooCredentials.username,
          serverVersion: 'Odoo ERP (Connecté)'
        }
      };
    }

    return {
      isConnected: true,
      isDemoMode: isDemoMode,
      userInfo: {
        uid: 2,
        name: 'Marc Demo (Sandbox)',
        serverVersion: 'Odoo 17.0 Enterprise (Sandbox)'
      },
      latencyMs: 14
    };
  });

  // Sync connectionState when odooCredentials from Firestore or demoMode changes
  useEffect(() => {
    if (odooCredentials) {
      odooClient.setRuntimeCredentials(odooCredentials, false);
      setConnectionState({
        isConnected: true,
        isDemoMode: false,
        credentials: odooCredentials,
        userInfo: {
          uid: 1,
          name: odooCredentials.username,
          serverVersion: 'Odoo ERP (Connecté)'
        }
      });
    } else if (isDemoMode) {
      odooClient.setDemoMode(true);
      setConnectionState({
        isConnected: true,
        isDemoMode: true,
        userInfo: {
          uid: 2,
          name: 'Marc Demo (Sandbox)',
          serverVersion: 'Odoo 17.0 Enterprise (Sandbox)'
        },
        latencyMs: 14
      });
    }
  }, [odooCredentials, isDemoMode]);

  // Data & Table State
  const [records, setRecords] = useState<Record<string, any>[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [fieldDefs, setFieldDefs] = useState<Record<string, OdooFieldDefinition>>(
    MODEL_FIELD_DEFINITIONS[SUPPORTED_MODELS[0].id] || {}
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<{ fromCache?: boolean; executionTimeMs?: number }>({
    fromCache: false,
    executionTimeMs: 12
  });

  // Modals & Navigation state
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState<boolean>(false);
  const [isCustomModelModalOpen, setIsCustomModelModalOpen] = useState<boolean>(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState<boolean>(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');

  // Dynamic Navigation Badges
  const [badges, setBadges] = useState<NavBadges>({
    uninvoicedOrdersCount: 82,
    timesheetAnomaliesCount: 8,
    mouldAnomaliesCount: 2
  });

  // Toast / Alert
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'success' | 'warning' } | null>(null);

  const showToast = (text: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch data from Odoo backend API
  const loadModelData = useCallback(async (forceRefresh: boolean = false) => {
    setIsLoading(true);
    setFetchError(null);

    try {
      const userKey = getUserIdentifier(connectionState.credentials?.username, connectionState.isDemoMode);
      const savedCols = getSavedColumnsForModel(userKey, currentModel.technicalName, currentModel.defaultFields || ['id', 'name']);
      const predefinedFields = Object.keys(MODEL_FIELD_DEFINITIONS[currentModel.technicalName] || MODEL_FIELD_DEFINITIONS[currentModel.id] || {});
      
      // Combine default, saved and predefined fields so all columns have data available
      const fieldsToFetch = Array.from(new Set([
        ...(currentModel.defaultFields || ['id', 'name']),
        ...predefinedFields,
        ...savedCols
      ]));

      const res = await odooClient.searchRead({
        model: currentModel.technicalName,
        fields: fieldsToFetch,
        limit: 150,
        order: currentModel.defaultSort ? `${currentModel.defaultSort.field} ${currentModel.defaultSort.direction}` : 'id desc',
        forceRefresh,
        credentials: connectionState.credentials,
        isDemo: connectionState.isDemoMode
      });

      if (res.success) {
        setRecords(res.records);
        setTotalCount(res.totalCount || res.records.length);
        if (res.fields && Object.keys(res.fields).length > 0) {
          setFieldDefs(res.fields);
        } else {
          setFieldDefs(MODEL_FIELD_DEFINITIONS[currentModel.technicalName] || {});
        }
        setCacheInfo({
          fromCache: res.fromCache,
          executionTimeMs: res.executionTimeMs
        });
      } else {
        setFetchError(res.error || 'Erreur lors du chargement des données.');
        setRecords([]);
      }
    } catch (err: any) {
      setFetchError(err.message || 'Impossible de joindre le serveur.');
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentModel, connectionState]);

  const isInitialAppMount = useRef(true);

  // Load data when model or connection changes (forces fresh Odoo reload on app open)
  useEffect(() => {
    if (isInitialAppMount.current) {
      isInitialAppMount.current = false;
      loadModelData(true);
    } else {
      loadModelData(false);
    }
  }, [loadModelData]);

  // Handle Model Change
  const handleSelectModel = (model: OdooModelConfig) => {
    setCurrentModel(model);
    setFieldDefs(MODEL_FIELD_DEFINITIONS[model.technicalName] || {});
  };

  // Handle Custom Model Selection
  const handleSelectCustomModel = (model: OdooModelConfig) => {
    setCurrentModel(model);
    setFieldDefs(MODEL_FIELD_DEFINITIONS[model.technicalName] || {});
    showToast(`Modèle "${model.technicalName}" sélectionné`, 'info');
  };

  // Refresh handler
  const handleRefresh = (forceRefresh: boolean = true) => {
    loadModelData(forceRefresh);
    showToast(
      forceRefresh ? 'Données Odoo rafraîchies (contournement du cache)' : 'Données synchronisées',
      'success'
    );
  };

  // If Firebase is checking authentication state
  if (authLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0b0f17] text-white space-y-4">
        <div className="w-44 h-[78px] rounded-2xl bg-white shadow-2xl shadow-sky-950/40 ring-1 ring-white/20 overflow-hidden flex items-center justify-center">
          <img
            src="/assets/aistudio/odoo-data-report_0b974500.png"
            alt="Logo Odoo Data Report"
            className="w-full h-full object-cover object-center"
          />
        </div>
        <div className="w-8 h-8 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
        <p className="text-xs text-slate-400 font-medium">Chargement de votre session sécurisée...</p>
      </div>
    );
  }

  // If user is not logged in and not in sandbox demo mode, display LoginPage
  if (!currentUser && !isDemoMode) {
    return <LoginPage onExploreDemo={() => setDemoMode(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 flex font-sans transition-colors">
      
      {/* Fixed Left Sidebar matching mockup */}
      <Sidebar
        activeView={activeView}
        onSelectView={(v) => {
          setActiveView(v);
          setIsMobileMenuOpen(false);
        }}
        connectionState={connectionState}
        badges={badges}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        userName={currentUser?.displayName || 'Nicolas Hubert'}
        userEmail={currentUser?.email || 'nhubert@ecomi.com'}
        onOpenRulesModal={() => setIsRulesModalOpen(true)}
        onOpenSettings={() => setIsConnectionModalOpen(true)}
        onOpenSecurity={() => setIsSecurityModalOpen(true)}
        onLogout={currentUser ? logout : undefined}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main App Container with Left Sidebar Margin on Desktop */}
      <div className="flex-1 min-w-0 lg:pl-64 flex flex-col min-h-screen">
        
        {/* Top Navbar */}
        <TopNav
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onRefreshData={() => handleRefresh(true)}
          isRefreshing={isLoading}
          onOpenSettings={() => setIsConnectionModalOpen(true)}
          onOpenRulesModal={() => setIsRulesModalOpen(true)}
          connectionState={connectionState}
          onSearchGlobal={(q) => setGlobalSearchQuery(q)}
          globalSearchQuery={globalSearchQuery}
        />

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          
          {/* Banner Alert for Demo Mode */}
          {connectionState.isDemoMode && (
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-blue-500/10 border border-sky-200/80 dark:border-sky-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-sky-500 text-white shrink-0 shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Vous explorez le SaaS en <strong>Mode Démo Sandbox</strong></span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-mono">
                      Odoo v17 Enterprise
                    </span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Toutes les fonctionnalités de recherche, calculs de rentabilité et exports sont actives avec des données d'exemple. Vous pouvez connecter votre propre instance Odoo à tout moment.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsConnectionModalOpen(true)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-sky-500 hover:bg-sky-600 text-white shadow-xs transition-all whitespace-nowrap cursor-pointer shrink-0"
                >
                  Connecter mon Odoo
                </button>
              </div>
            </div>
          )}

          {/* Dynamic View Rendering: Home vs Billing vs WipOutflow vs Report vs Timesheets vs Moulds vs Explorer */}
          {activeView === 'home' ? (
            <HomeDashboardView
              credentials={connectionState.credentials || null}
              isDemo={connectionState.isDemoMode}
              userName={currentUser?.displayName || 'Nicolas Hubert (Ecomi)'}
              onNavigate={(view) => setActiveView(view)}
              onUpdateBadges={(newBadges) => setBadges(prev => ({ ...prev, ...newBadges }))}
            />
          ) : activeView === 'billing' ? (
            <BillingReportView
              credentials={connectionState.credentials || null}
              isDemo={connectionState.isDemoMode}
              onNavigateHome={() => setActiveView('home')}
            />
          ) : activeView === 'wip-outflow' ? (
            <WipPurchasesOutflowView
              credentials={connectionState.credentials || null}
              isDemo={connectionState.isDemoMode}
              onNavigateHome={() => setActiveView('home')}
            />
          ) : activeView === 'report' ? (
            <UninvoicedOrdersReport
              credentials={connectionState.credentials || null}
              isDemo={connectionState.isDemoMode}
            />
          ) : activeView === 'timesheets' ? (
            <TimesheetAuditView
              credentials={connectionState.credentials || null}
              isDemo={connectionState.isDemoMode}
            />
          ) : activeView === 'moulds' ? (
            <MouldWeightCheckView
              credentials={connectionState.credentials || null}
              isDemo={connectionState.isDemoMode}
            />
          ) : (
            <>
              {/* Fetch Error Display */}
              {fetchError && (
                <div className="mb-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <h4 className="text-xs font-bold">Erreur de communication Odoo</h4>
                    <p className="text-xs">{fetchError}</p>
                    <div className="pt-2 flex space-x-2">
                      <button
                        onClick={() => loadModelData(true)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                      >
                        Réessayer
                      </button>
                      <button
                        onClick={() => setIsConnectionModalOpen(true)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-300 dark:border-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer"
                      >
                        Vérifier les identifiants
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Model Tabs Bar */}
              <div className="mb-6 flex items-center justify-between overflow-x-auto no-scrollbar gap-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-1">
                  {SUPPORTED_MODELS.map((m) => {
                    const isActive = currentModel.id === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleSelectModel(m)}
                        className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900'
                        }`}
                      >
                        <span>{m.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {m.technicalName}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setIsCustomModelModalOpen(true)}
                    className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
                  >
                    <span>+ Autre Modèle</span>
                  </button>
                </div>
              </div>

              {/* Model Title & Description Header */}
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                      {currentModel.name}
                    </h1>
                    <span className="px-2 py-0.5 text-xs font-mono rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                      {currentModel.technicalName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {currentModel.description}
                  </p>
                </div>
              </div>

              {/* KPI Cards Summary */}
              <KpiSummaryCards
                currentModel={currentModel}
                records={records}
                totalCount={totalCount}
              />

              {/* Interactive Data Table */}
              <DataTable
                modelConfig={currentModel}
                records={records}
                totalCount={totalCount}
                fieldDefs={fieldDefs}
                isLoading={isLoading}
                onRefresh={handleRefresh}
                cacheInfo={cacheInfo}
                currentUser={connectionState.credentials?.username}
                isDemo={connectionState.isDemoMode}
              />
            </>
          )}

        </main>
      </div>

      {/* Calculation Rules Modal */}
      <CalculationRulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
      />

      {/* Connection & Onboarding Modal */}
      <ConnectionModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        connectionState={connectionState}
        onUpdateConnection={(newState) => {
          setConnectionState(newState);
          showToast(
            newState.isDemoMode
              ? 'Mode Démo activé'
              : `Connecté avec succès à ${newState.credentials?.url}`,
            'success'
          );
        }}
      />

      {/* Custom Model Introspection Modal */}
      <CustomModelModal
        isOpen={isCustomModelModalOpen}
        onClose={() => setIsCustomModelModalOpen(false)}
        onSelectCustomModel={handleSelectCustomModel}
      />

      {/* User Security & Profile Modal */}
      <SecurityModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl text-xs font-semibold">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            ) : (
              <Zap className="w-4 h-4 text-sky-400 dark:text-sky-600" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainDashboard />
    </AuthProvider>
  );
}
