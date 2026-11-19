import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Plus,
  RefreshCw,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { AtsAnalysisReport, JobTarget, ResumeDraft } from '../types/resume';

interface AtsDashboardProps {
  draft: ResumeDraft;
  activeJob: JobTarget | null;
  report: AtsAnalysisReport | null;
  isAnalyzing: boolean;
  error: string | null;
  onRunAnalysis: () => void;
  onAddKeywordToSkills: (keyword: string) => void;
  onApplyBulletUpgrade: (experienceId: string, originalBullet: string, improvedBullet: string) => void;
  onApplyTailoredSummary: (tailoredSummary: string) => void;
  onGoToJobs: () => void;
  onOpenSettings: () => void;
}

function getScoreVisuals(score: number): {
  label: string;
  stroke: string;
  textClass: string;
  barClass: string;
} {
  if (score >= 80) {
    return {
      label: 'Strong Match',
      stroke: '#16a34a',
      textClass: 'text-emerald-700 dark:text-emerald-400',
      barClass: 'bg-emerald-600 dark:bg-emerald-500',
    };
  }
  if (score >= 60) {
    return {
      label: 'Needs Optimization',
      stroke: '#d97706',
      textClass: 'text-amber-700 dark:text-amber-400',
      barClass: 'bg-amber-600 dark:bg-amber-500',
    };
  }
  return {
    label: 'Critical Gaps',
    stroke: '#dc2626',
    textClass: 'text-red-700 dark:text-red-400',
    barClass: 'bg-red-600 dark:bg-red-500',
  };
}

export const AtsDashboard: React.FC<AtsDashboardProps> = ({
  draft,
  activeJob,
  report,
  isAnalyzing,
  error,
  onRunAnalysis,
  onAddKeywordToSkills,
  onApplyBulletUpgrade,
  onApplyTailoredSummary,
  onGoToJobs,
  onOpenSettings,
}) => {
  const [appliedBullets, setAppliedBullets] = useState<Record<string, boolean>>({});
  const [summaryApplied, setSummaryApplied] = useState(false);

  const existingSkillsLower = new Set(
    draft.skillGroups.flatMap((g) => g.skills.map((s) => s.name.toLowerCase()))
  );

  // Loading Skeleton State
  if (isAnalyzing) {
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              <div className="h-3 w-full max-w-md bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
          <div className="h-4 w-40 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-24 bg-slate-50 dark:bg-slate-800/70 rounded-lg animate-pulse" />
          <div className="h-24 bg-slate-50 dark:bg-slate-800/70 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/70 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              ATS Analysis Interrupted
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-300">{error}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onRunAnalysis}
            className="inline-flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 shrink-0" />
            <span>Retry ATS Scan</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 shrink-0" />
            <span>ATS Settings</span>
          </button>
          <button
            type="button"
            onClick={onGoToJobs}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Edit Target Job</span>
          </button>
        </div>
      </div>
    );
  }

  // Empty State (No Scan Yet)
  if (!report) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 flex items-center justify-center mx-auto">
          <ScanSearch className="w-6 h-6" />
        </div>
        <div className="max-w-md mx-auto space-y-1.5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Ready for Deep ATS Analysis
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {activeJob
              ? `Benchmark "${draft.name}" against ${activeJob.title} at ${activeJob.company} to uncover keyword gaps, parseability issues, and AI bullet upgrades.`
              : `Run a general ATS audit on "${draft.name}", or paste a target job description in Jobs for tailored keyword scoring.`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={onRunAnalysis}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 text-sm font-medium text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <ScanSearch className="w-4 h-4 shrink-0" />
            <span>Run ATS Analysis</span>
          </button>
          <button
            type="button"
            onClick={onGoToJobs}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>{activeJob ? 'Change Target Job' : 'Paste Job Description'}</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 shrink-0" />
            <span>ATS Settings</span>
          </button>
        </div>
      </div>
    );
  }

  const visuals = getScoreVisuals(report.overallScore);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dashOffset =
    circumference - (Math.min(100, Math.max(0, report.overallScore)) / 100) * circumference;

  const subScoreList = [
    { label: 'Keyword Match', value: report.subScores.keywordMatch },
    { label: 'Role Alignment', value: report.subScores.roleAlignment },
    { label: 'Impact & Metrics', value: report.subScores.impactMetrics },
    { label: 'ATS Parseability', value: report.subScores.formattingParseability },
    { label: 'Section Completeness', value: report.subScores.sectionCompleteness },
  ];

  const criticalMissing = report.missingKeywords.filter((k) => k.importance === 'critical');
  const otherMissing = report.missingKeywords.filter((k) => k.importance !== 'critical');

  return (
    <div className="space-y-4">
      {/* 1. Overall Score Summary Panel */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  fill="none"
                  className="stroke-slate-200 dark:stroke-slate-800"
                  strokeWidth="6"
                />
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  fill="none"
                  stroke={visuals.stroke}
                  strokeWidth="6"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-none">
                  {report.overallScore}
                </span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                  / 100
                </span>
              </div>
            </div>

            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className={`font-semibold ${visuals.textClass}`}>{visuals.label}</span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                  ·
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {report.jobTitleSnapshot}
                </span>
                {report.engineUsed && (
                  <>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                      ·
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      {report.engineUsed}
                    </span>
                  </>
                )}
              </div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                {report.verdict}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Analyzed{' '}
                {new Date(report.analyzedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span>Settings</span>
            </button>
            <button
              type="button"
              onClick={onRunAnalysis}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>Re-run Scan</span>
            </button>
          </div>
        </div>

        {/* 5 Sub-Score Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-4">
          {subScoreList.map((metric) => {
            const metricVis = getScoreVisuals(metric.value);
            return (
              <div key={metric.label} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                    {metric.label}
                  </span>
                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {metric.value}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${metricVis.barClass}`}
                    style={{ width: `${Math.min(100, Math.max(0, metric.value))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Keyword Match & Gap Matrix */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Keyword Coverage Matrix
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {report.matchedKeywords.length} matched · {report.missingKeywords.length} missing from resume
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Click + Add to insert a missing skill directly into your Skills section
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-1">
          {/* Missing Keywords */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Missing &amp; High-Impact Keywords ({report.missingKeywords.length})
            </h4>

            {report.missingKeywords.length === 0 ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 py-2">
                Strong keyword alignment — no major gaps detected.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {[...criticalMissing, ...otherMissing].map((item, idx) => {
                  const alreadyInSkills = existingSkillsLower.has(item.keyword.toLowerCase());
                  return (
                    <div
                      key={`${item.keyword}-${idx}`}
                      className="p-3 flex items-start justify-between gap-3"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {item.keyword}
                          </span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                            ·
                          </span>
                          <span
                            className={`text-[11px] font-medium ${
                              item.importance === 'critical'
                                ? 'text-red-700 dark:text-red-400'
                                : item.importance === 'recommended'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {item.importance === 'critical'
                              ? 'Critical gap'
                              : item.importance === 'recommended'
                              ? 'Recommended'
                              : 'Bonus'}
                          </span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                            ·
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {item.targetSection}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {item.contextHint}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={alreadyInSkills}
                        onClick={() => onAddKeywordToSkills(item.keyword)}
                        className={`inline-flex items-center justify-center gap-1 min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          alreadyInSkills
                            ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 cursor-default'
                            : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60'
                        }`}
                      >
                        {alreadyInSkills ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5 shrink-0" />
                            <span>Add</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Matched Keywords */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Matched Keywords Detected ({report.matchedKeywords.length})
            </h4>
            {report.matchedKeywords.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No target keywords matched yet.
              </p>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {report.matchedKeywords.map((kw, idx) => (
                  <div
                    key={`${kw}-${idx}`}
                    className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span className="font-mono truncate">{kw}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. AI Tailored Summary & Bullet Upgrades */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            One-Click AI Content Upgrades
          </h3>
        </div>

        {/* Tailored Summary */}
        {report.tailoredSummary && (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5 bg-slate-50/60 dark:bg-slate-800/50">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Tailored Executive Summary
              </span>
              <button
                type="button"
                disabled={summaryApplied}
                onClick={() => {
                  onApplyTailoredSummary(report.tailoredSummary);
                  setSummaryApplied(true);
                }}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  summaryApplied
                    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60'
                    : 'text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500'
                }`}
              >
                {summaryApplied ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Applied to Summary</span>
                  </>
                ) : (
                  <span>Apply to Summary</span>
                )}
              </button>
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
              {report.tailoredSummary}
            </p>
          </div>
        )}

        {/* Bullet Upgrades */}
        {report.bulletUpgrades.length > 0 && (
          <div className="space-y-3">
            {report.bulletUpgrades.map((upg, idx) => {
              const upgradeKey = `${upg.experienceId}::${upg.originalBullet}`;
              const isApplied = appliedBullets[upgradeKey];
              return (
                <div
                  key={idx}
                  className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {upg.role}
                      </span>
                      {upg.company ? ` · ${upg.company}` : ''}
                    </div>
                    <button
                      type="button"
                      disabled={isApplied}
                      onClick={() => {
                        onApplyBulletUpgrade(
                          upg.experienceId,
                          upg.originalBullet,
                          upg.improvedBullet
                        );
                        setAppliedBullets((prev) => ({ ...prev, [upgradeKey]: true }));
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        isApplied
                          ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60'
                          : 'text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white'
                      }`}
                    >
                      {isApplied ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Applied</span>
                        </>
                      ) : (
                        <span>Apply Upgrade</span>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 space-y-1">
                      <span className="font-semibold text-slate-500 dark:text-slate-400">
                        Current Bullet
                      </span>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                        {upg.originalBullet}
                      </p>
                    </div>
                    <div className="bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 rounded-lg p-3 space-y-1">
                      <span className="font-semibold text-blue-800 dark:text-blue-300 inline-flex items-center gap-1">
                        <ArrowRight className="w-3 h-3 shrink-0" />
                        <span>Optimized Bullet</span>
                      </span>
                      <p className="text-slate-900 dark:text-slate-100 font-medium leading-relaxed">
                        {upg.improvedBullet}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {upg.rationale}
                    {upg.addedKeywords.length > 0
                      ? ` · Added keywords: ${upg.addedKeywords.join(', ')}`
                      : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. ATS Parseability Checks & Section Feedback */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            ATS Parseability Audit
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {report.atsChecks.map((check) => (
              <div key={check.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-2.5">
                {check.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {check.label}
                    </span>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                      ·
                    </span>
                    <span
                      className={
                        check.passed
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-700 dark:text-red-400'
                      }
                    >
                      {check.passed ? 'Passed' : 'Action Needed'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{check.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Section-by-Section Scoring
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {report.sectionFeedback.map((sec, idx) => (
              <div key={`${sec.section}-${idx}`} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {sec.status === 'strong' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    ) : sec.status === 'needs_work' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {sec.section}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap shrink-0">
                    {sec.score}/100
                  </span>
                </div>
                <ul className="pl-6 space-y-0.5 text-xs text-slate-600 dark:text-slate-300 list-disc">
                  {sec.findings.map((finding, fIdx) => (
                    <li key={fIdx}>{finding}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
