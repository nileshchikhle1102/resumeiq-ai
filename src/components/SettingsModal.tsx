import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Download,
  Link2,
  RotateCcw,
  ShieldCheck,
  Unplug,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { AtsEngineMode, AtsSettings, AtsStrictness } from '../types/resume';
import {
  DEFAULT_ATS_SETTINGS,
  exportAtsSettingsJson,
  parseImportedAtsSettingsJson,
} from '../utils/storage';

interface SettingsModalProps {
  open: boolean;
  settings: AtsSettings;
  isAuthenticated: boolean;
  userEmail?: string | null;
  onUpdateSettings: (next: AtsSettings) => void;
  onRequireAuth: (reason: string) => void;
  onClose: () => void;
  onNotify: (message: string) => void;
}

interface ProviderStatus {
  loading: boolean;
  gemini: boolean;
  claude: boolean;
  openai: boolean;
}

const GEMINI_VARIANTS: Array<{
  id: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  name: string;
  subtitle: string;
  description: string;
}> = [
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    subtitle: 'Primary · Deep Semantic ATS',
    description:
      'High-accuracy job matching, keyword gap context, tailored summaries, and bullet rewrites.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    subtitle: 'Fast · High Availability',
    description:
      'Low-latency scanning optimized for peak demand periods while keeping structured AI feedback.',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  isAuthenticated,
  userEmail,
  onUpdateSettings,
  onRequireAuth,
  onClose,
  onNotify,
}) => {
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>({
    loading: false,
    gemini: false,
    claude: false,
    openai: false,
  });
  const configFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setProviderStatus((prev) => ({ ...prev, loading: true }));
    fetch('/api/ats/status')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setProviderStatus({
          loading: false,
          gemini: Boolean(data?.providers?.gemini ?? data?.geminiConfigured),
          claude: Boolean(data?.providers?.claude),
          openai: Boolean(data?.providers?.openai),
        });
      })
      .catch(() => {
        if (!active) return;
        setProviderStatus({
          loading: false,
          gemini: false,
          claude: false,
          openai: false,
        });
      });
    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  const isGeminiActive =
    settings.engine === 'gemini-4-hydrogen' || settings.engine === 'gemini-3.1-flash-lite';
  const isClaudeActive = settings.engine === 'anthropic-claude';
  const isOpenAiActive = settings.engine === 'openai-gpt';
  const isLocalActive = settings.engine === 'local-rules';

  const handleConnectProvider = (targetEngine: AtsEngineMode, label: string) => {
    if (!isAuthenticated) {
      onRequireAuth(`Sign in with your Google account to connect ${label} for ATS checks.`);
      return;
    }
    onUpdateSettings({ ...settings, engine: targetEngine });
    onNotify(`Connected ${label} for ATS checks.`);
  };

  const handleDisconnectProvider = (label: string) => {
    onUpdateSettings({ ...settings, engine: 'local-rules' });
    onNotify(`Disconnected ${label}. Switched to Local Deterministic Engine.`);
  };

  const handleImportConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImportedAtsSettingsJson(text);
      onUpdateSettings(imported);
      onNotify('Imported ATS configuration profile.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Invalid configuration file.');
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ATS Engine and Scoring Settings"
    >
      <input
        ref={configFileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportConfig}
        className="hidden"
      />

      <div className="w-full sm:max-w-2xl max-h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Cpu className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                ATS Check &amp; AI Provider Configuration
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connect or disconnect your preferred AI engine and tune ATS scoring behavior.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5 shrink-0" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 studio-scroll">
          {/* Authentication & Security Notice */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5 sm:mt-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {isAuthenticated
                    ? `Signed in as ${userEmail || 'Google Account'}`
                    : 'Google Session Required for Cloud AI'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Provider credentials are stored safely in server Secrets (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)—never exposed in the browser.
                </p>
              </div>
            </div>
            <div className="shrink-0 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap">
              {isAuthenticated ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span className="text-emerald-700 dark:text-emerald-400">Authenticated</span>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onRequireAuth('Sign in with Google to connect cloud AI engines for ATS scans.')
                  }
                  className="inline-flex items-center justify-center min-h-[32px] px-3 py-1 text-xs font-semibold text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>

          {/* AI Providers: Connect / Disconnect */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              AI Tools &amp; Connections
            </h3>
            <div className="space-y-2.5">
              {/* Google Gemini */}
              <div
                className={`p-3.5 rounded-xl border space-y-3 transition-colors ${
                  isGeminiActive
                    ? 'border-blue-700 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Google Gemini
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {providerStatus.loading
                          ? 'Checking server...'
                          : providerStatus.gemini
                          ? 'Server key ready'
                          : 'Set GEMINI_API_KEY in Secrets'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Deep semantic ATS matching, tailored summaries, bullet rewrites, and market salary grounding.
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {isGeminiActive && isAuthenticated ? (
                      <button
                        type="button"
                        onClick={() => handleDisconnectProvider('Google Gemini')}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/70 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Unplug className="w-3.5 h-3.5 shrink-0" />
                        <span>Disconnect</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!providerStatus.loading && !providerStatus.gemini}
                        onClick={() => handleConnectProvider('gemini-4-hydrogen', 'Google Gemini')}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-500 rounded-lg whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Connect</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Gemini Model Sub-selector when connected */}
                {isGeminiActive && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                    {GEMINI_VARIANTS.map((variant) => {
                      const active = settings.engine === variant.id;
                      return (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => onUpdateSettings({ ...settings, engine: variant.id })}
                          className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer space-y-0.5 ${
                            active
                              ? 'border-blue-600 dark:border-blue-400 bg-white dark:bg-slate-900'
                              : 'border-slate-200 dark:border-slate-800 hover:bg-white/70 dark:hover:bg-slate-900/60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {variant.name}
                            </span>
                            {active && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {variant.subtitle}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Anthropic Claude */}
              <div
                className={`p-3.5 rounded-xl border transition-colors ${
                  isClaudeActive
                    ? 'border-blue-700 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Anthropic Claude
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {providerStatus.claude ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-700 dark:text-emerald-400 shrink-0" />
                            <span className="text-emerald-700 dark:text-emerald-400">Server key ready</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-amber-700 dark:text-amber-400 shrink-0" />
                            <span>Set ANTHROPIC_API_KEY in Secrets</span>
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Nuanced executive summary rewriting and strict ATS evaluation via Claude 3.5 Sonnet.
                    </p>
                  </div>

                  <div className="shrink-0">
                    {isClaudeActive && isAuthenticated ? (
                      <button
                        type="button"
                        onClick={() => handleDisconnectProvider('Anthropic Claude')}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/70 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Unplug className="w-3.5 h-3.5 shrink-0" />
                        <span>Disconnect</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!providerStatus.loading && !providerStatus.claude}
                        onClick={() => handleConnectProvider('anthropic-claude', 'Anthropic Claude')}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-500 rounded-lg whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Connect</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* OpenAI GPT */}
              <div
                className={`p-3.5 rounded-xl border transition-colors ${
                  isOpenAiActive
                    ? 'border-blue-700 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        OpenAI GPT
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {providerStatus.openai ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-700 dark:text-emerald-400 shrink-0" />
                            <span className="text-emerald-700 dark:text-emerald-400">Server key ready</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-amber-700 dark:text-amber-400 shrink-0" />
                            <span>Set OPENAI_API_KEY in Secrets</span>
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Structured keyword extraction and bullet optimization powered by GPT-4o mini.
                    </p>
                  </div>

                  <div className="shrink-0">
                    {isOpenAiActive && isAuthenticated ? (
                      <button
                        type="button"
                        onClick={() => handleDisconnectProvider('OpenAI GPT')}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/70 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Unplug className="w-3.5 h-3.5 shrink-0" />
                        <span>Disconnect</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!providerStatus.loading && !providerStatus.openai}
                        onClick={() => handleConnectProvider('openai-gpt', 'OpenAI GPT')}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-500 rounded-lg whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Connect</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Local Deterministic Engine */}
              <button
                type="button"
                onClick={() => {
                  onUpdateSettings({ ...settings, engine: 'local-rules' });
                  onNotify('Switched to Local Deterministic Engine.');
                }}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer space-y-1 ${
                  isLocalActive
                    ? 'border-blue-700 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between gap-x-3 gap-y-0.5 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Local Deterministic Engine
                  </span>
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    In-Browser · No API Key Needed
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Zero-latency keyword extraction, impact metric density, and parseability rules completely offline.
                </p>
              </button>
            </div>
          </div>

          {/* Reliability & Strictness */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Scoring Strictness
              </span>
              <div className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(
                  [
                    { id: 'balanced', label: 'Balanced' },
                    { id: 'strict', label: 'Strict' },
                    { id: 'startup', label: 'Startup' },
                  ] as Array<{ id: AtsStrictness; label: string }>
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onUpdateSettings({ ...settings, strictness: mode.id })}
                    className={`inline-flex items-center justify-center px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      settings.strictness === mode.id
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Max AI Bullet Upgrades
              </span>
              <div className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {([2, 4, 6] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => onUpdateSettings({ ...settings, maxBulletUpgrades: count })}
                    className={`inline-flex items-center justify-center px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md tabular-nums transition-colors whitespace-nowrap cursor-pointer ${
                      settings.maxBulletUpgrades === count
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {count} bullets
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                  Auto-Fallback on High Demand (503)
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Automatically retry and switch to Gemini 3.1 Flash Lite if the primary model experiences capacity spikes.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.autoFallback}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, autoFallback: e.target.checked })
                }
                className="mt-0.5 shrink-0 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600"
              />
            </label>

            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                  Generate Tailored Executive Summary
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Include a one-click AI summary rewrite during full ATS scans.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.includeTailoredSummary}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    includeTailoredSummary: e.target.checked,
                  })
                }
                className="mt-0.5 shrink-0 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                exportAtsSettingsJson(settings);
                onNotify('Exported ATS configuration JSON.');
              }}
              className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Export Config</span>
            </button>
            <button
              type="button"
              onClick={() => configFileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span>Upload Config</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdateSettings({ ...DEFAULT_ATS_SETTINGS });
                onNotify('Reset ATS settings to defaults.');
              }}
              className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Reset</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center min-h-[38px] px-4 py-1.5 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
