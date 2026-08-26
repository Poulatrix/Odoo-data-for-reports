import React, { useState } from 'react';
import { 
  X, 
  KeyRound, 
  Lock, 
  User as UserIcon, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Shield, 
  Send
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, updateUserPassword, updateProfileName, resetPassword } = useAuth();

  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setDisplayName(currentUser?.displayName || '');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (displayName.trim() && displayName.trim() !== currentUser?.displayName) {
        await updateProfileName(displayName.trim());
      }

      if (newPassword) {
        if (newPassword.length < 6) {
          setErrorMsg('Le nouveau mot de passe doit comporter au moins 6 caractères.');
          setLoading(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setErrorMsg('Les deux mots de passe ne correspondent pas.');
          setLoading(false);
          return;
        }
        await updateUserPassword(newPassword);
        setNewPassword('');
        setConfirmPassword('');
      }

      setSuccessMsg('Vos informations de sécurité ont été mises à jour avec succès !');
    } catch (err: any) {
      console.error('Erreur mise à jour sécurité:', err);
      let msg = 'Impossible de mettre à jour le mot de passe.';
      if (err.code === 'auth/requires-recent-login') {
        msg = 'Cette action nécessite une reconnexion récente pour des raisons de sécurité. Veuillez vous reconnecter puis réessayer.';
      } else if (err.message) {
        msg = err.message;
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetLink = async () => {
    if (!currentUser?.email) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await resetPassword(currentUser.email);
      setSuccessMsg(`Un lien de réinitialisation sécurisé a été envoyé à ${currentUser.email}.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de l\'envoi du lien de réinitialisation.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden text-slate-900 dark:text-white transition-all">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Sécurité & Profil Utilisateur</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Gérez vos identifiants et votre mot de passe d'accès
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          
          {/* Email Info Badge */}
          <div className="p-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between">
            <div className="flex items-center space-x-2.5 min-w-0">
              <Mail className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <div className="truncate">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Email de référence</span>
                <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate block">
                  {currentUser?.email || 'hubert.n@ecomi.eu'}
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-full shrink-0">
              Actif
            </span>
          </div>

          {/* Alerts */}
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 text-xs flex items-start gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleUpdateProfile} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nom d'affichage
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Nicolas Hubert"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-1.5 mb-2">
                <KeyRound className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Modifier le mot de passe
                </span>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                    Nouveau mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 caractères"
                      className="w-full pl-9 pr-9 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                    Confirmer le mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Retapez le nouveau mot de passe"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleSendResetLink}
                className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>M'envoyer un lien de réinitialisation</span>
              </button>

              <button
                type="submit"
                disabled={loading || (!newPassword && displayName === currentUser?.displayName)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
              >
                {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </button>
            </div>
          </form>

        </div>

      </div>
    </div>
  );
};
