import React, { useState } from 'react';
import {
  Banknote,
  Briefcase,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  ScanSearch,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { createId } from '../data/defaultData';
import { AtsSettings, JobTarget, SalaryEstimateResult } from '../types/resume';
import { getSalaryCacheKey } from '../utils/storage';

interface JobTargetsViewProps {
  jobs: JobTarget[];
  activeJobId: string | null;
  atsSettings?: AtsSettings;
  isAuthenticated?: boolean;
  hasActiveAccess?: boolean;
  salaryEstimates?: Record<string, SalaryEstimateResult>;
  onSaveSalaryEstimate?: (cacheKey: string, estimate: SalaryEstimateResult) => void;
  onRequireAuth?: (reason: string) => void;
  onRequireBilling?: (reason: string) => void;
  onSelectJob: (jobId: string | null) => void;
  onSaveJob: (job: JobTarget) => void;
  onDeleteJob: (jobId: string) => void;
  onRunAtsForJob: (jobId: string) => void;
}

function formatSalaryValue(amount: number, currency: string, symbol: string): string {
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  const upperCurrency = (currency || 'USD').toUpperCase();
  try {
    const locale = upperCurrency === 'INR' ? 'en-IN' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: upperCurrency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${symbol || '$'}${Math.round(amount).toLocaleString()}`;
  }
}

function formatPaySuffix(period: SalaryEstimateResult['payPeriod']): string {
  if (period === 'monthly') return '/mo';
  if (period === 'hourly') return '/hr';
  return '/yr';
}

export const JobTargetsView: React.FC<JobTargetsViewProps> = ({
  jobs,
  activeJobId,
  atsSettings,
  isAuthenticated = true,
  hasActiveAccess = true,
  salaryEstimates = {},
  onSaveSalaryEstimate,
  onRequireAuth,
  onRequireBilling,
  onSelectJob,
  onSaveJob,
  onDeleteJob,
  onRunAtsForJob,
}) => {
  const activeJob = jobs.find((j) => j.id === activeJobId) || null;
  const [editingId, setEditingId] = useState<string | null>(activeJob?.id ?? null);
  const [title, setTitle] = useState(activeJob?.title ?? '');
  const [company, setCompany] = useState(activeJob?.company ?? '');
  const [location, setLocation] = useState(activeJob?.location ?? '');
  const [description, setDescription] = useState(activeJob?.description ?? '');

  const [fetchingSalary, setFetchingSalary] = useState(false);
  const [salaryError, setSalaryError] = useState<string | null>(null);

  const loadIntoForm = (job: JobTarget | null) => {
    setSalaryError(null);
    if (!job) {
      setEditingId(null);
      setTitle('');
      setCompany('');
      setLocation('');
      setDescription('');
      return;
    }
    setEditingId(job.id);
    setTitle(job.title);
    setCompany(job.company);
    setLocation(job.location);
    setDescription(job.description);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    const saved: JobTarget = {
      id: editingId || createId('job'),
      title: title.trim(),
      company: company.trim() || 'Target Company',
      location: location.trim(),
      description: description.trim(),
      updatedAt: new Date().toISOString(),
    };
    onSaveJob(saved);
    onSelectJob(saved.id);
    setEditingId(saved.id);
  };

  const currentCacheKey = title.trim() ? getSalaryCacheKey(title, location) : '';
  const activeSalaryEstimate = currentCacheKey ? salaryEstimates[currentCacheKey] ?? null : null;

  const handleFetchSalary = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setSalaryError('Enter a Job Title above before fetching salary benchmarks.');
      return;
    }

    if (!isAuthenticated && onRequireAuth) {
      onRequireAuth('Sign in with your Gmail account to fetch live market salary benchmarks.');
      return;
    }
    if (!hasActiveAccess && onRequireBilling) {
      onRequireBilling(
        'Your 3-day free trial has ended. Subscribe to ResumeIQ Pro to access market salary intelligence.'
      );
      return;
    }

    setSalaryError(null);
    setFetchingSalary(true);
    try {
      const effectiveEngine =
        atsSettings?.engine === 'local-rules' ? 'gemini-4-hydrogen' : atsSettings?.engine;
      const res = await fetch('/api/jobs/salary-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: cleanTitle,
          location: location.trim() || 'Remote / National Market',
          company: company.trim(),
          jobDescription: description.trim(),
          settings: {
            engine: effectiveEngine,
            autoFallback: atsSettings?.autoFallback ?? true,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to retrieve salary benchmark.');
      }
      onSaveSalaryEstimate?.(getSalaryCacheKey(cleanTitle, location), data as SalaryEstimateResult);
    } catch (err) {
      setSalaryError(err instanceof Error ? err.message : 'Unable to fetch salary estimate.');
    } finally {
      setFetchingSalary(false);
    }
  };

  const medianPositionPct = (() => {
    if (!activeSalaryEstimate) return 50;
    const { lowSalary, medianSalary, highSalary } = activeSalaryEstimate;
    const span = highSalary - lowSalary;
    if (span <= 0) return 50;
    return Math.min(88, Math.max(12, Math.round(((medianSalary - lowSalary) / span) * 100)));
  })();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Saved Jobs List */}
      <div className="lg:col-span-5 space-y-3">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Saved Target Jobs
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select a role to benchmark keyword alignment and compensation bands.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadIntoForm(null)}
            className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>New Job</span>
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
          {jobs.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No saved job descriptions yet. Paste a job description on the right to start optimizing.
            </div>
          ) : (
            jobs.map((job) => {
              const isActive = job.id === activeJobId;
              const jobSalary = salaryEstimates[getSalaryCacheKey(job.title, job.location)];
              return (
                <div
                  key={job.id}
                  className={`p-4 transition-colors ${
                    isActive
                      ? 'bg-blue-50/50 dark:bg-blue-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectJob(job.id);
                        loadIntoForm(job);
                      }}
                      className="text-left flex-1 min-w-0 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {job.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 pl-6">
                        {job.company}
                        {job.location ? ` · ${job.location}` : ''}
                      </p>
                      {jobSalary && (
                        <p className="text-xs font-mono font-medium text-emerald-700 dark:text-emerald-400 mt-1 pl-6 tabular-nums">
                          Est. {formatSalaryValue(jobSalary.lowSalary, jobSalary.currency, jobSalary.currencySymbol)} –{' '}
                          {formatSalaryValue(jobSalary.highSalary, jobSalary.currency, jobSalary.currencySymbol)}
                          {formatPaySuffix(jobSalary.payPeriod)}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 pl-6 line-clamp-2">
                        {job.description}
                      </p>
                    </button>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isActive ? (
                        <span className="inline-flex items-center justify-end gap-1 min-h-[28px] px-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectJob(job.id);
                            loadIntoForm(job);
                          }}
                          className="inline-flex items-center justify-end min-h-[28px] px-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap cursor-pointer"
                        >
                          Select
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteJob(job.id)}
                        title="Delete saved job"
                        aria-label={`Delete ${job.title}`}
                        className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-md transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Paste / Edit Job Form + Salary Market Benchmark */}
      <div className="lg:col-span-7 space-y-5">
        <form
          onSubmit={handleSave}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {editingId ? 'Edit Target Job Description' : 'Paste New Target Job Description'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Include responsibilities and requirements for accurate AI keyword scoring.
              </p>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={() => onRunAtsForJob(editingId)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <ScanSearch className="w-3.5 h-3.5 shrink-0" />
                <span>Analyze Match</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Job Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Senior Product Engineer"
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Company
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g., Stripe"
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Location / Work Mode
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Bengaluru, India / San Francisco, CA / Hybrid"
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Full Job Description *
              </label>
              <textarea
                required
                rows={9}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Paste the full job posting (responsibilities, qualifications, tech stack)..."
                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="submit"
              className="inline-flex items-center justify-center min-h-[42px] px-5 py-2 text-sm font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {editingId ? 'Save Changes' : 'Save Target Job'}
            </button>
          </div>
        </form>

        {/* Market Compensation & Salary Range Tool */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <TrendingUp className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Market Compensation &amp; Salary Range
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {title.trim()
                    ? `${title.trim()} · ${location.trim() || 'Remote / National Market'}`
                    : 'Enter a job title and location above to benchmark market compensation.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFetchSalary}
              disabled={fetchingSalary || !title.trim()}
              className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-50 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
            >
              {fetchingSalary ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Fetching Market Data...</span>
                </>
              ) : activeSalaryEstimate ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span>Refresh Estimate</span>
                </>
              ) : (
                <>
                  <Banknote className="w-3.5 h-3.5 shrink-0" />
                  <span>Fetch Salary Range</span>
                </>
              )}
            </button>
          </div>

          {salaryError && (
            <div className="px-3.5 py-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
              {salaryError}
            </div>
          )}

          {!activeSalaryEstimate && !fetchingSalary && !salaryError && (
            <div className="py-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Click <span className="font-semibold text-slate-700 dark:text-slate-200">Fetch Salary Range</span> to retrieve localized 25th / 50th / 75th+ percentile base pay, total compensation context, hiring demand, and negotiation leverage using Gemini market research.
            </div>
          )}

          {activeSalaryEstimate && (
            <div className="space-y-4">
              {/* 3-Point Salary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col justify-between">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    25th Percentile (Low)
                  </span>
                  <span className="block text-base font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                    {formatSalaryValue(
                      activeSalaryEstimate.lowSalary,
                      activeSalaryEstimate.currency,
                      activeSalaryEstimate.currencySymbol
                    )}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      {formatPaySuffix(activeSalaryEstimate.payPeriod)}
                    </span>
                  </span>
                </div>

                <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg flex flex-col justify-between">
                  <span className="block text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                    Market Median (50th)
                  </span>
                  <span className="block text-base font-mono font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {formatSalaryValue(
                      activeSalaryEstimate.medianSalary,
                      activeSalaryEstimate.currency,
                      activeSalaryEstimate.currencySymbol
                    )}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      {formatPaySuffix(activeSalaryEstimate.payPeriod)}
                    </span>
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col justify-between">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Top Band (75th–90th)
                  </span>
                  <span className="block text-base font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                    {formatSalaryValue(
                      activeSalaryEstimate.highSalary,
                      activeSalaryEstimate.currency,
                      activeSalaryEstimate.currencySymbol
                    )}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      {formatPaySuffix(activeSalaryEstimate.payPeriod)}
                    </span>
                  </span>
                </div>
              </div>

              {/* Range Bar */}
              <div className="space-y-1.5">
                <div className="relative h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-[8%] right-[8%] bg-blue-600/25 dark:bg-blue-500/30 rounded-full"
                  />
                  <div
                    style={{ left: `${medianPositionPct}%` }}
                    className="absolute top-0 bottom-0 w-1.5 -translate-x-1/2 bg-blue-700 dark:bg-blue-400 rounded-full"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Currency: {activeSalaryEstimate.currency}</span>
                  <span>Engine: {activeSalaryEstimate.engineUsed}</span>
                </div>
              </div>

              {/* Demand & Total Comp Context */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Market Demand
                    </span>
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                      {activeSalaryEstimate.marketDemand}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {activeSalaryEstimate.demandSummary}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1">
                  <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Total Comp &amp; Equity Context
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {activeSalaryEstimate.totalCompNote}
                  </p>
                </div>
              </div>

              {/* Comp Drivers + Negotiation Tip */}
              {activeSalaryEstimate.keyCompDrivers.length > 0 && (
                <div className="space-y-1.5">
                  <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Skills &amp; Scope Driving Top-Quartile Offers
                  </span>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {activeSalaryEstimate.keyCompDrivers.map((driver, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <span>{driver}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeSalaryEstimate.negotiationTip && (
                <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    Negotiation Leverage:{' '}
                  </span>
                  {activeSalaryEstimate.negotiationTip}
                </div>
              )}

              {/* Grounded Web Sources */}
              {activeSalaryEstimate.sources.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                  <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Market Data References
                  </span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {activeSalaryEstimate.sources.map((src, idx) => (
                      <a
                        key={`${src.url}-${idx}`}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400 hover:underline max-w-full sm:max-w-[260px] truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{src.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Estimates reflect localized market compensation context and may vary by company stage, equity structure, and exact seniority band.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
