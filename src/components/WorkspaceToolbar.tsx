import React from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  Copy,
  CreditCard,
  Download,
  FilePlus2,
  Loader2,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  ScanSearch,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import { AtsAnalysisReport, JobTarget, ResumeDraft, TrialStatusInfo } from '../types/resume';
import { StudioTheme } from '../utils/storage';

interface WorkspaceToolbarProps {
  drafts: ResumeDraft[];
  activeDraft: ResumeDraft;
  jobs: JobTarget[];
  activeJob: JobTarget | null;
  cachedReport: AtsAnalysisReport | null;
  isAnalyzing: boolean;
  showSaved: boolean;
  theme: StudioTheme;
  user: User | null;
  trialStatus: TrialStatusInfo;
  onToggleTheme: () => void;
  onSelectDraft: (draftId: string) => void;
  onSelectJob: (jobId: string | null) => void;
  onNewBlankDraft: () => void;
  onDuplicateDraft: () => void;
  onRequestDeleteDraft: () => void;
  onExportJson: () => void;
  onTriggerImportJson: () => void;
  onRunAnalysis: () => void;
  onOpenTemplatesSheet: () => void;
  onOpenSettings: () => void;
  onOpenBilling: () => void;
  onOpenChat: () => void;
  onSignOut: () => void;
  onOpenLogin: () => void;
}

export const WorkspaceToolbar: React.FC<WorkspaceToolbarProps> = ({
  drafts,
  activeDraft,
  jobs,
  activeJob,
  cachedReport,
  isAnalyzing,
  showSaved,
  theme,
  user,
  trialStatus,
  onToggleTheme,
  onSelectDraft,
  onSelectJob,
  onNewBlankDraft,
  onDuplicateDraft,
  onRequestDeleteDraft,
  onExportJson,
  onTriggerImportJson,
  onRunAnalysis,
  onOpenTemplatesSheet,
  onOpenSettings,
  onOpenBilling,
  onOpenChat,
  onSignOut,
  onOpenLogin,
}) => {
  const isDark = theme === 'dark';

  const billingLabel = !user
    ? '3-Day Trial'
    : trialStatus.hasPaidSubscription
    ? 'Pro'
    : trialStatus.isTrialActive
    ? `Trial · ${
        trialStatus.daysRemaining > 0
          ? `${trialStatus.daysRemaining}d left`
          : `${Math.max(1, trialStatus.hoursRemaining)}h left`
      }`
    : 'Trial Ended';

  const isExpired = Boolean(user && !trialStatus.hasActiveAccess);

  return (
    <div className="no-print bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-2.5 space-y-2">
        {/* Row 1: Draft Management (Left) + Workspace & Account Utilities (Right) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <label
              htmlFor="draft-selector"
              className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0"
            >
              Draft
            </label>
            <select
              id="draft-selector"
              value={activeDraft.id}
              onChange={(e) => onSelectDraft(e.target.value)}
              className="h-[38px] w-[170px] sm:w-[220px] truncate rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || 'Untitled Resume'}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={onNewBlankDraft}
                title="Create blank resume draft"
                className="inline-flex items-center justify-center gap-1.5 h-[38px] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FilePlus2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">New</span>
              </button>
              <button
                type="button"
                onClick={onDuplicateDraft}
                title="Duplicate current draft"
                className="inline-flex items-center justify-center gap-1.5 h-[38px] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Duplicate</span>
              </button>
              <button
                type="button"
                onClick={onRequestDeleteDraft}
                title="Delete current draft"
                className="inline-flex items-center justify-center gap-1.5 h-[38px] px-2.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Delete</span>
              </button>
              <button
                type="button"
                onClick={onExportJson}
                title="Export JSON backup"
                className="inline-flex items-center justify-center gap-1.5 h-[38px] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden md:inline">Export JSON</span>
              </button>
              <button
                type="button"
                onClick={onTriggerImportJson}
                title="Import JSON backup"
                className="inline-flex items-center justify-center gap-1.5 h-[38px] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden md:inline">Import</span>
              </button>
              <button
                type="button"
                onClick={onOpenTemplatesSheet}
                className="lg:hidden inline-flex items-center justify-center h-[38px] px-2.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Templates
              </button>
            </div>

            <span
              aria-live="polite"
              className={`items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap select-none ${
                showSaved ? 'inline-flex' : 'hidden'
              }`}
            >
              <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              <span>Saved</span>
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Career AI Coach Drawer Trigger */}
            <button
              type="button"
              onClick={onOpenChat}
              aria-label="Open Career AI Coach"
              title="Open multi-turn Gemini Career Coach"
              className="inline-flex items-center justify-center gap-1.5 h-[38px] px-3 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">AI Coach</span>
            </button>

            {/* Trial & Pro Billing */}
            <button
              type="button"
              onClick={onOpenBilling}
              aria-label="Open Trial and Pro Billing"
              title="View 3-Day Free Trial & Pro Plan"
              className={`inline-flex items-center justify-center gap-1.5 h-[38px] px-3 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 tabular-nums ${
                isExpired
                  ? 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                  : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{billingLabel}</span>
            </button>

            {/* ATS Check Configuration */}
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Open ATS Check Configuration"
              title="ATS Check Configuration"
              className="inline-flex items-center justify-center gap-1.5 h-[38px] px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Settings</span>
            </button>

            {/* Daylight Studio / Dark Studio Theme Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to Daylight Studio theme' : 'Switch to Dark Studio theme'}
              title={isDark ? 'Switch to Daylight Studio' : 'Switch to Dark Studio'}
              className="inline-flex items-center justify-center gap-1.5 h-[38px] px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                  <span className="hidden md:inline">Daylight</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />
                  <span className="hidden md:inline">Dark Studio</span>
                </>
              )}
            </button>

            {/* Gmail Account Status / Sign In or Sign Out */}
            {user ? (
              <div className="inline-flex items-center gap-1.5 h-[38px] pl-1.5 pr-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shrink-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || user.email || 'Account avatar'}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-md object-cover shrink-0"
                  />
                ) : (
                  <span className="w-6 h-6 rounded-md bg-blue-700 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    {(user.email || 'G')[0].toUpperCase()}
                  </span>
                )}
                <span className="hidden xl:inline max-w-[140px] truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                  {user.email || user.displayName}
                </span>
                <button
                  type="button"
                  onClick={onSignOut}
                  title={`Sign out (${user.email || 'Gmail'})`}
                  aria-label="Sign out"
                  className="inline-flex items-center justify-center gap-1 h-[28px] px-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenLogin}
                title="Sign in with Gmail to sync workspace"
                className="inline-flex items-center justify-center gap-1.5 h-[38px] px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Sign in</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Active Target Job + Cached ATS Score + Primary Scan CTA */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <label
                htmlFor="job-selector"
                className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0"
              >
                Target Job
              </label>
              <select
                id="job-selector"
                value={activeJob?.id ?? ''}
                onChange={(e) => onSelectJob(e.target.value || null)}
                className="h-[38px] w-[190px] sm:w-[280px] truncate rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <option value="">General ATS Audit (No JD)</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} · {job.company}
                  </option>
                ))}
              </select>
            </div>

            {cachedReport && (
              <div className="inline-flex items-center gap-1.5 h-[38px] px-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap tabular-nums shrink-0">
                <span>ATS Score</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {cachedReport.overallScore}/100
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onRunAnalysis}
            disabled={isAnalyzing}
            className="inline-flex items-center justify-center gap-2 h-[38px] px-4 text-sm font-medium text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 disabled:bg-blue-400 dark:disabled:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <ScanSearch className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Run ATS Scan</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
