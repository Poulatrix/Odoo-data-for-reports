import React, { useState } from 'react';
import { 
  X, 
  Database, 
  KeyRound, 
  Globe, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  HelpCircle, 
  ShieldCheck, 
  ExternalLink,
  ChevronRight,
  Server
} from 'lucide-react';
import { OdooConnectionCredentials, OdooConnectionState } from '../types/odoo';
import { odooClient } from '../services/odooClient';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionState: OdooConnectionState;
  onUpdateConnection: (newState: OdooConnectionState) => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  connectionState,
  onUpdateConnection
}) => {
  const [activeTab, setActiveTab] = useState<'real' | 'demo'>('real');
  const [url, setUrl] = useState(connectionState.credentials?.url || 'https://');
  const [db, setDb] = useState(connectionState.credentials?.db || '');
  const [username, setUsername] = useState(connectionState.credentials?.username || '');
  const [apiKey, setApiKey] = useState(connectionState.credentials?.apiKey || '');
  
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    uid?: number;
    serverVersion?: string;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  const [showGuide, setShowGuide] = useState(false);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    const creds: OdooConnectionCredentials = {
      url: url.trim(),
      db: db.trim(),
      username: username.trim(),
      apiKey: apiKey.trim()
    };

    const res = await odooClient.testConnection(creds, false);
    setIsTesting(false);
    setTestResult(res);
  };

  const handleSaveRealConnection = async () => {
    const creds: OdooConnectionCredentials = {
      url: url.trim(),
      db: db.trim(),
      username: username.trim(),
      apiKey: apiKey.trim()
    };

    setIsTesting(true);
    const res = await odooClient.testConnection(creds, false);
    setIsTesting(false);

    if (res.success) {
      odooClient.saveCredentials(creds);
      onUpdateConnection({
        isConnected: true,
        isDemoMode: false,
        credentials: creds,
        userInfo: {
          uid: res.uid || 1,
          name: username,
          serverVersion: res.serverVersion || 'Odoo Standard'
        },
        latencyMs: res.latencyMs,
        lastChecked: new Date().toISOString()
      });
      onClose();
    } else {
      setTestResult(res);
    }
  };

  const handleActivateDemoMode = () => {
    odooClient.setDemoMode(true);
    onUpdateConnection({
      isConnected: true,
      isDemoMode: true,
      userInfo: {
        uid: 2,
        name: 'Marc Demo (Sandbox)',
        serverVersion: 'Odoo 17.0 Enterprise (Sandbox)'
      },
      latencyMs: 12,
      lastChecked: new Date().toISOString()
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Configuration de l'instance Odoo
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connectez votre ERP Odoo via API sécurisée XML-RPC / JSON-RPC
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

        {/* Tab Selector */}
        <div className="px-6 pt-4 border-b border-slate-200 dark:border-slate-800 flex space-x-4">
          <button
            onClick={() => setActiveTab('real')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'real'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Mon Instance Odoo (Live API)</span>
          </button>

          <button
            onClick={() => setActiveTab('demo')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'demo'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Mode Démo Sandbox (Odoo v17)</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'real' ? (
            <div className="space-y-4">
              
              {/* Form inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Instance URL */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    URL de l'instance Odoo <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Globe className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      id="odoo-url-input"
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://mon-entreprise.odoo.com"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Prend en charge Odoo Online (SaaS), Odoo.sh et les serveurs On-Premises (v12 à v18).
                  </p>
                </div>

                {/* DB Name */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Nom de la Base de Données <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Database className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      id="odoo-db-input"
                      type="text"
                      value={db}
                      onChange={(e) => setDb(e.target.value)}
                      placeholder="ex: mon-entreprise-prod"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                {/* Email / Username */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Email / Nom d'utilisateur <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      id="odoo-username-input"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin@mon-entreprise.com"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                {/* API Key */}
                <div className="md:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Clé d'API Odoo (ou mot de passe) <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowGuide(!showGuide)}
                      className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline flex items-center space-x-1 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Où trouver ma clé d'API ?</span>
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      id="odoo-apikey-input"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Clé générée depuis votre profil Odoo (ex: a1b2c3d4e5f6...)"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

              </div>

              {/* Guide accordion */}
              {showGuide && (
                <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs space-y-2 text-slate-700 dark:text-slate-300 animate-in slide-in-from-top-2">
                  <div className="font-semibold text-purple-900 dark:text-purple-300 flex items-center space-x-1">
                    <ShieldCheck className="w-4 h-4 text-purple-600" />
                    <span>Comment générer votre clé API Odoo (recommandé) :</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300 text-[11px]">
                    <li>Connectez-vous à votre instance Odoo en tant qu'administrateur ou utilisateur.</li>
                    <li>Cliquez sur votre avatar en haut à droite &gt; <strong>Préférences</strong> (ou Mon Profil).</li>
                    <li>Ouvrez l'onglet <strong>Sécurité du compte</strong> &gt; section <strong>Clés d'API</strong>.</li>
                    <li>Cliquez sur <strong>Nouvelle clé API</strong>, donnez-lui une description (ex: <code>SaaS DataTable</code>) et copiez la clé générée.</li>
                  </ol>
                </div>
              )}

              {/* Test Result Message */}
              {testResult && (
                <div className={`p-3.5 rounded-xl text-xs flex items-start space-x-2.5 border ${
                  testResult.success 
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                }`}>
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {testResult.success ? 'Connexion à Odoo validée avec succès !' : 'Échec du test de connexion'}
                    </p>
                    <p className="text-[11px] opacity-90">
                      {testResult.success
                        ? `Version détectée : ${testResult.serverVersion || 'Odoo ERP'} • UID utilisateur : ${testResult.uid} • Temps de réponse : ${testResult.latencyMs}ms`
                        : testResult.error}
                    </p>
                  </div>
                </div>
              )}

              {/* Security Banner */}
              <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl">
                <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Les identifiants sont chiffrés et transmis directement à votre instance sans intermédiaire.</span>
              </div>

            </div>
          ) : (
            /* Demo Tab */
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 bg-amber-100 dark:bg-amber-950/50 rounded-2xl flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400 shadow-inner">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Sandbox Odoo v17 Enterprise pré-remplie
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Idéal pour explorer immédiatement l'application sans renseigner d'instance Odoo. Contient des données réalistes (Devis, Commandes de vente, Factures clients, Contacts et Articles).
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl text-left text-xs space-y-2 border border-slate-200 dark:border-slate-700">
                <div className="font-semibold text-slate-700 dark:text-slate-300">
                  Modèles inclus dans la démo :
                </div>
                <ul className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400 text-[11px]">
                  <li>• <code>sale.order</code> (Commandes & Devis)</li>
                  <li>• <code>account.move</code> (Factures & Avoirs)</li>
                  <li>• <code>res.partner</code> (Clients & Fournisseurs)</li>
                  <li>• <code>purchase.order</code> (Bons d'achat)</li>
                  <li>• <code>crm.lead</code> (Opportunités CRM)</li>
                  <li>• <code>product.template</code> (Articles & Stocks)</li>
                </ul>
              </div>

              <button
                id="start-demo-btn"
                onClick={handleActivateDemoMode}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Activer le Mode Démo Sandbox</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {activeTab === 'real' && (
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <button
              id="test-connection-btn"
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !url || !db || !username || !apiKey}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Tester la connexion</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                id="save-connection-btn"
                type="button"
                onClick={handleSaveRealConnection}
                disabled={isTesting || !url || !db || !username || !apiKey}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
              >
                {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Enregistrer & Connecter</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
