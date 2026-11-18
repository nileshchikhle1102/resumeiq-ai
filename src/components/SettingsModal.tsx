import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Download,
  RotateCcw,
  ShieldCheck,
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
  onUpdateSettings: (next: AtsSettings) => void;
  onClose: () => void;
  onNotify: (message: string) => void;
}

const ENGINES: Array<{
  id: AtsEngineMode;
  name: string;
  subtitle: string;
  description: string;
}> = [
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    subtitle: 'Server-Side AI · Deep Semantic ATS',
    description:
      'High-accuracy job matching, keyword gap context, tailored summaries, and bullet rewrites.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    subtitle: 'Server-Side AI · High Availability',
    description:
      'Low-latency scanning optimized for peak demand periods while keeping structured AI feedback.',
  },
  {
    id: 'local-rules',
    name: 'Local Deterministic Engine',
    subtitle: 'In-Browser · Instant Offline Check',
    description:
      'Zero-latency keyword extraction, impact metric density, and parseability rules without network calls.',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  onUpdateSettings,
  onClose,
  onNotify,
}) => {
  const [serverStatus, setServerStatus] = useState<{
    loading: boolean;
    geminiConfigured: boolean | null;
  }>({ loading: false, geminiConfigured: null });
  const configFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setServerStatus({ loading: true, geminiConfigured: null });
    fetch('/api/ats/status')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setServerStatus({
          loading: false,
          geminiConfigured: Boolean(data?.geminiConfigured),
        });
      })
      .catch(() => {
        if (!active) return;
        setServerStatus({ loading: false, geminiConfigured: null });
      });
    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

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
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                ATS Check Configuration
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select analysis engine, failover behavior, and scoring strictness.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 studio-scroll">
          {/* Server Connection Status */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="flex items-center gap-2.5 min-w-0">
              <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Server-Side Gemini Connection
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Credentials are managed securely in the platform Secrets environment.
                </p>
              </div>
            </div>
            <div className="shrink-0 text-xs font-medium flex items-center gap-1.5">
              {serverStatus.loading ? (
                <span className="text-slate-500 dark:text-slate-400">Checking...</span>
              ) : serverStatus.geminiConfigured ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-400">Connected</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                  <span className="text-amber-700 dark:text-amber-400">Not Configured</span>
                </>
              )}
            </div>
          </div>

          {/* Engine Selector */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              ATS Analysis Engine
            </h3>
            <div className="space-y-2">
              {ENGINES.map((eng) => {
                const selected = settings.engine === eng.id;
                return (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => onUpdateSettings({ ...settings, engine: eng.id })}
                    className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer space-y-1 ${
                      selected
                        ? 'border-blue-700 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {eng.name}
                      </span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {eng.subtitle}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{eng.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reliability & Strictness */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Scoring Strictness
              </span>
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
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
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
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
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {([2, 4, 6] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => onUpdateSettings({ ...settings, maxBulletUpgrades: count })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md tabular-nums transition-colors cursor-pointer ${
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
              <div>
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
                className="mt-1 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600"
              />
            </label>

            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div>
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
                className="mt-1 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600"
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
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Config</span>
            </button>
            <button
              type="button"
              onClick={() => configFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Config</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdateSettings({ ...DEFAULT_ATS_SETTINGS });
                onNotify('Reset ATS settings to defaults.');
              }}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
