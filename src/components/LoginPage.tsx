import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Moon,
  ScanSearch,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { StudioTheme } from '../utils/storage';

interface LoginPageProps {
  theme: StudioTheme;
  onToggleTheme: () => void;
  onSignInWithGmail: () => Promise<void>;
  onContinueLocal: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  theme,
  onToggleTheme,
  onSignInWithGmail,
  onContinueLocal,
}) => {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDark = theme === 'dark';

  const handleGmailClick = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await onSignInWithGmail();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      if (raw.includes('auth/popup-closed-by-user')) {
        setError('Sign-in popup was closed before completing Gmail authentication.');
      } else if (raw.includes('auth/popup-blocked')) {
        setError('Sign-in popup was blocked by your browser. Allow popups for this site and try again.');
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Minimal Top Bar */}
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              ResumeIQ
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to Daylight Studio theme' : 'Switch to Dark Studio theme'}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            {isDark ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>Daylight</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                <span>Dark Studio</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Centered Auth Split */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="max-w-[960px] w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Editorial Value Overview */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                AI-Powered Resume &amp; Career Intelligence
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                Craft ATS-ready resumes and tailor every application.
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Sign in with your Gmail account to sync drafts, saved job targets, ATS reports, and scoring settings across devices.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    Multi-template print studio:
                  </span>{' '}
                  Classic, Modern, and Technical layouts built for crisp vector PDF export.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <ScanSearch
                  className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    Configurable ATS engine:
                  </span>{' '}
                  Run Gemini semantic audits with automatic high-demand failover or offline rules.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    Private cloud workspace:
                  </span>{' '}
                  Resumes and job descriptions stay isolated to your authenticated Gmail profile.
                </p>
              </div>
            </div>
          </div>

          {/* Login Card */}
          <div className="lg:col-span-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="space-y-1.5">
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                  Sign in to ResumeIQ
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Authenticate securely with your Gmail (Google) account to unlock AI career intelligence and cloud sync.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-800 dark:text-red-200"
                >
                  <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleGmailClick}
                  disabled={signingIn}
                  className="w-full min-h-[48px] px-4 py-3 inline-flex items-center justify-center gap-3 text-sm font-semibold text-slate-900 dark:text-slate-950 bg-white dark:bg-slate-100 hover:bg-slate-50 dark:hover:bg-white border border-slate-300 dark:border-slate-200 rounded-xl shadow-xs transition-colors disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                >
                  {signingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-blue-700" aria-hidden="true" />
                      <span>Connecting Gmail Account...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-5 h-5 shrink-0"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
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

                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                  <span className="shrink mx-3 text-xs font-medium text-slate-400 dark:text-slate-500">
                    or
                  </span>
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                </div>

                <button
                  type="button"
                  onClick={onContinueLocal}
                  disabled={signingIn}
                  className="w-full min-h-[42px] px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  Continue in Local Browser Mode (No Cloud Sync)
                </button>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                You can switch between local mode and your Gmail account anytime from the workspace toolbar.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
