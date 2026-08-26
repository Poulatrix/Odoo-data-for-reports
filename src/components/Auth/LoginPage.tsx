import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  User, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  Database, 
  KeyRound, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Server
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface LoginPageProps {
  onExploreDemo?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onExploreDemo }) => {
  const { signIn, signUp, resetPassword, setDemoMode } = useAuth();

  const [isRegister, setIsRegister] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  
  // Default SaaS reference credentials as requested
  const [email, setEmail] = useState('hubert.n@ecomi.eu');
  const [password, setPassword] = useState('Ecomi123*');
  const [displayName, setDisplayName] = useState('Nicolas Hubert (Ecomi)');
  const [showPassword, setShowPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (isForgotPassword) {
        if (!email.trim()) {
          setErrorMsg('Veuillez renseigner votre adresse email.');
          setLoading(false);
          return;
        }
        await resetPassword(email.trim());
        setSuccessMsg('Un lien de réinitialisation a été envoyé à votre adresse email.');
        setLoading(false);
        return;
      }

      if (isRegister) {
        if (!email.trim() || !password) {
          setErrorMsg('Veuillez remplir tous les champs obligatoires.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setErrorMsg('Le mot de passe doit comporter au moins 6 caractères.');
          setLoading(false);
          return;
        }
        await signUp(email.trim(), password, displayName.trim());
        setSuccessMsg('Compte créé avec succès ! Chargement de votre espace...');
      } else {
        if (!email.trim() || !password) {
          setErrorMsg('Veuillez saisir votre email et votre mot de passe.');
          setLoading(false);
          return;
        }
        
        try {
          await signIn(email.trim(), password);
        } catch (signInErr: any) {
          const code = signInErr.code || '';
          // If the account does not exist yet on initial run, automatically provision/register it
          if (
            (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') &&
            email.trim().toLowerCase() === 'hubert.n@ecomi.eu'
          ) {
            try {
              await signUp(email.trim(), password, displayName.trim() || 'Nicolas Hubert (Ecomi)');
              setSuccessMsg('Compte initialisé et connecté avec succès !');
              return;
            } catch (signUpErr: any) {
              throw signUpErr;
            }
          } else {
            throw signInErr;
          }
        }
      }
    } catch (err: any) {
      console.error('Erreur authentification:', err);
      let message = 'Une erreur est survenue lors de la connexion.';
      const code = err.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
        message = 'Email ou mot de passe incorrect.';
      } else if (code === 'auth/email-already-in-use') {
        message = 'Cette adresse email est déjà associée à un compte. Veuillez vous connecter.';
      } else if (code === 'auth/invalid-email') {
        message = 'Format d\'adresse email invalide.';
      } else if (code === 'auth/weak-password') {
        message = 'Le mot de passe doit comporter au moins 6 caractères.';
      } else if (err.message) {
        message = err.message;
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoAccess = () => {
    setDemoMode(true);
    if (onExploreDemo) {
      onExploreDemo();
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 text-slate-100 relative overflow-hidden selection:bg-purple-500 selection:text-white">
      
      {/* Background radial glow accents */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-slate-900/50 rounded-full blur-2xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        
        {/* Brand Header */}
        <div className="text-center mb-6 space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white shadow-xl shadow-purple-900/30 ring-1 ring-white/20">
            <Database className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Odoo Business Intelligence
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Plateforme d'analyse et de pilotage décisionnel Odoo sécurisée avec chiffrement et persistance cloud.
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60 relative">
          
          {/* Header switch Login / Register */}
          {!isForgotPassword && (
            <div className="flex items-center p-1 bg-slate-950/80 rounded-2xl border border-slate-800 mb-6">
              <button
                type="button"
                onClick={() => {
                  setIsRegister(false);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  !isRegister
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Se connecter
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRegister(true);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  isRegister
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Créer un compte
              </button>
            </div>
          )}

          {isForgotPassword && (
            <div className="mb-6 flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <KeyRound className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-white">Réinitialiser le mot de passe</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(false);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className="text-xs text-purple-400 hover:underline cursor-pointer"
              >
                Retour
              </button>
            </div>
          )}

          {/* Notifications */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs flex items-start gap-2 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {isRegister && !isForgotPassword && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Nom complet / Collaborateur
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex: Nicolas Hubert"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Adresse Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@entreprise.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {!isForgotPassword && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Mot de passe
                  </label>
                  {!isRegister && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(true);
                        setErrorMsg(null);
                        setSuccessMsg(null);
                      }}
                      className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                    >
                      Mot de passe oublié ?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-900/40 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>
                    {isForgotPassword
                      ? 'Envoyer le lien de réinitialisation'
                      : isRegister
                      ? 'Créer mon compte sécurisé'
                      : 'Accéder à mon espace Odoo'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

          </form>

          {/* Sandbox Demo Quick Access */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-400 mb-2">
              Vous souhaitez tester l'application sans identifiant ?
            </p>
            <button
              type="button"
              onClick={handleDemoAccess}
              className="w-full py-2 px-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Tester en Mode Sandbox Démonstration</span>
            </button>
          </div>

          {/* Security Guarantee Badges */}
          <div className="mt-6 pt-4 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
            <div className="flex items-center space-x-1.5 bg-slate-950/40 p-2 rounded-lg border border-slate-800/50">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Row-Level Security (RLS)</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-slate-950/40 p-2 rounded-lg border border-slate-800/50">
              <Server className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>Exécution XML-RPC Serveur</span>
            </div>
          </div>

        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-500 mt-4">
          Vos identifiants d'API Odoo sont isolés dans la base de données et ne sont jamais stockés en clair dans le localStorage.
        </p>

      </div>
    </div>
  );
};
