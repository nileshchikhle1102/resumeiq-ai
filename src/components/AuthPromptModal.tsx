import React, { useState } from 'react';
import { AlertCircle, Loader2, Lock, X } from 'lucide-react';

interface AuthPromptModalProps {
  open: boolean;
  reason: string;
  onSignInWithGmail: () => Promise<void>;
  onClose: () => void;
}

export const AuthPromptModal: React.FC<AuthPromptModalProps> = ({
  open,
  reason,
  onSignInWithGmail,
  onClose,
}) => {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await onSignInWithGmail();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      if (raw.includes('auth/popup-closed-by-user')) {
        setError('Sign-in popup was closed before completing Gmail authentication.');
      } else if (raw.includes('auth/popup-blocked')) {
        setError('Sign-in popup was blocked by your browser. Allow popups and try again.');
      } else if (raw.includes('auth/unauthorized-domain')) {
        setError('This preview domain is not yet authorized in Firebase Authentication settings.');
      } else {
        setError(raw);
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in required"
    >
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Sign in with Gmail Required
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in prompt"
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {reason || 'Please sign in with your Gmail account to use this feature.'}
          </p>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-800 dark:text-red-200"
            >
              <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={signingIn}
              className="w-full min-h-[46px] px-4 py-2.5 inline-flex items-center justify-center gap-3 text-sm font-semibold text-slate-900 dark:text-slate-950 bg-white dark:bg-slate-100 hover:bg-slate-50 dark:hover:bg-white border border-slate-300 dark:border-slate-200 rounded-xl shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
            >
              {signingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-blue-700" aria-hidden="true" />
                  <span>Connecting Gmail Account...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>Continue with Gmail (Google)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={signingIn}
              className="w-full min-h-[40px] px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl transition-colors cursor-pointer"
            >
              Stay in Local Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
