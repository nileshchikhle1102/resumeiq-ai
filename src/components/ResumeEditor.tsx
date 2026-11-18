import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { createId } from '../data/defaultData';
import {
  AtsSettings,
  BulletRewriteResponse,
  JobTarget,
  ResumeDraft,
  SkillProficiency,
  SummaryGenerateResponse,
} from '../types/resume';

interface ResumeEditorProps {
  draft: ResumeDraft;
  activeJob: JobTarget | null;
  atsSettings?: AtsSettings;
  isAuthenticated?: boolean;
  hasActiveAccess?: boolean;
  onRequireAuth?: (reason: string) => void;
  onRequireBilling?: (reason: string) => void;
  onOpenSettings?: () => void;
  onChangeDraft: (updater: (prev: ResumeDraft) => ResumeDraft) => void;
  onNotify: (message: string) => void;
}

type SectionKey =
  | 'personal'
  | 'summary'
  | 'experience'
  | 'skills'
  | 'projects'
  | 'education'
  | 'certifications';

interface BulletSuggestionState {
  key: string;
  loading: boolean;
  error: string | null;
  result: BulletRewriteResponse | null;
}

const INPUT_CLASS =
  'w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600';

const COMPACT_INPUT_CLASS =
  'w-full min-h-[40px] px-3 py-1.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600';

export const ResumeEditor: React.FC<ResumeEditorProps> = ({
  draft,
  activeJob,
  atsSettings,
  isAuthenticated = true,
  hasActiveAccess = true,
  onRequireAuth,
  onRequireBilling,
  onOpenSettings,
  onChangeDraft,
  onNotify,
}) => {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    personal: true,
    summary: true,
    experience: true,
    skills: true,
    projects: false,
    education: false,
    certifications: false,
  });

  const [bulletSuggestion, setBulletSuggestion] = useState<BulletSuggestionState | null>(null);
  const [summarySuggestion, setSummarySuggestion] = useState<{
    loading: boolean;
    error: string | null;
    result: SummaryGenerateResponse | null;
  }>({ loading: false, error: null, result: null });

  const [skillInputs, setSkillInputs] = useState<Record<string, string>>({});
  const [skillProficiencies, setSkillProficiencies] = useState<Record<string, SkillProficiency>>({});

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRewriteBullet = async (
    expId: string,
    bulletIdx: number,
    role: string,
    company: string,
    bullet: string
  ) => {
    if (!isAuthenticated && onRequireAuth) {
      onRequireAuth('Sign in with your Gmail account to optimize resume bullets with AI.');
      return;
    }
    if (!hasActiveAccess && onRequireBilling) {
      onRequireBilling('Your 3-day free trial has ended. Subscribe to ResumeIQ Pro to continue optimizing bullets with AI.');
      return;
    }
    const key = `${expId}:${bulletIdx}`;
    if (atsSettings?.engine === 'local-rules') {
      setBulletSuggestion({
        key,
        loading: false,
        error:
          'AI bullet rewrites require a Gemini engine. Switch from Local Deterministic Engine in ATS Settings.',
        result: null,
      });
      return;
    }
    setBulletSuggestion({ key, loading: true, error: null, result: null });
    try {
      const res = await fetch('/api/ats/rewrite-bullet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          company,
          bullet,
          jobDescription: activeJob?.description || '',
          settings: atsSettings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to optimize bullet point.');
      }
      setBulletSuggestion({ key, loading: false, error: null, result: data });
    } catch (err) {
      setBulletSuggestion({
        key,
        loading: false,
        error: err instanceof Error ? err.message : 'Request failed.',
        result: null,
      });
    }
  };

  const handleGenerateSummary = async () => {
    if (!isAuthenticated && onRequireAuth) {
      onRequireAuth('Sign in with your Gmail account to tailor your summary with AI.');
      return;
    }
    if (!hasActiveAccess && onRequireBilling) {
      onRequireBilling('Your 3-day free trial has ended. Subscribe to ResumeIQ Pro to continue tailoring summaries with AI.');
      return;
    }
    if (atsSettings?.engine === 'local-rules') {
      setSummarySuggestion({
        loading: false,
        error:
          'AI summary tailoring requires a Gemini engine. Switch from Local Deterministic Engine in ATS Settings.',
        result: null,
      });
      return;
    }
    setSummarySuggestion({ loading: true, error: null, result: null });
    try {
      const res = await fetch('/api/ats/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: draft,
          jobTitle: activeJob?.title,
          company: activeJob?.company,
          jobDescription: activeJob?.description || '',
          settings: atsSettings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to tailor summary.');
      }
      setSummarySuggestion({ loading: false, error: null, result: data });
    } catch (err) {
      setSummarySuggestion({
        loading: false,
        error: err instanceof Error ? err.message : 'Request failed.',
        result: null,
      });
    }
  };

  const handleAddSkillToGroup = (groupId: string) => {
    const raw = (skillInputs[groupId] || '').trim();
    if (!raw) return;
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    const chosenProficiency: SkillProficiency = skillProficiencies[groupId] ?? 'Intermediate';

    onChangeDraft((prev) => ({
      ...prev,
      skillGroups: prev.skillGroups.map((g) => {
        if (g.id !== groupId) return g;
        const existingLower = new Set(g.skills.map((s) => s.name.toLowerCase()));
        const additions = parts
          .filter((p) => !existingLower.has(p.toLowerCase()))
          .map((name) => ({ name, proficiency: chosenProficiency }));
        return { ...g, skills: [...g.skills, ...additions] };
      }),
    }));
    setSkillInputs((prev) => ({ ...prev, [groupId]: '' }));
  };

  return (
    <div className="space-y-4">
      {/* Draft Title Row */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <label
          htmlFor="draft-name-input"
          className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
        >
          Resume Draft Title
        </label>
        <input
          id="draft-name-input"
          type="text"
          value={draft.name}
          onChange={(e) =>
            onChangeDraft((prev) => ({ ...prev, name: e.target.value }))
          }
          placeholder="e.g., Senior Frontend Engineer — Stripe"
          className="w-full min-h-[42px] px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        />
      </div>

      {/* 1. Personal Information */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('personal')}
          className="w-full flex items-center justify-between px-4 py-3.5 min-h-[48px] text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Contact &amp; Header
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {draft.personalInfo.fullName || 'Add name and contact details'}
            </p>
          </div>
          {openSections.personal ? (
            <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          )}
        </button>

        {openSections.personal && (
          <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={draft.personalInfo.fullName}
                onChange={(e) =>
                  onChangeDraft((prev) => ({
                    ...prev,
                    personalInfo: { ...prev.personalInfo, fullName: e.target.value },
                  }))
                }
                placeholder="Elena Vance"
                className={INPUT_CLASS}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Target Headline
              </label>
              <input
                type="text"
                value={draft.personalInfo.headline}
                onChange={(e) =>
                  onChangeDraft((prev) => ({
                    ...prev,
                    personalInfo: { ...prev.personalInfo, headline: e.target.value },
                  }))
                }
                placeholder="Senior Product & Full-Stack Software Engineer"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={draft.personalInfo.email}
                onChange={(e) =>
                  onChangeDraft((prev) => ({
                    ...prev,
                    personalInfo: { ...prev.personalInfo, email: e.target.value },
                  }))
                }
                placeholder="name@example.com"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={draft.personalInfo.phone}
                onChange={(e) =>
                  onChangeDraft((prev) => ({
                    ...prev,
                    personalInfo: { ...prev.personalInfo, phone: e.target.value },
                  }))
                }
                placeholder="+1 (415) 555-0192"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Location
              </label>
              <input
                type="text"
                value={draft.personalInfo.location}
                onChange={(e) =>
                  onChangeDraft((prev) => ({
                    ...prev,
                    personalInfo: { ...prev.personalInfo, location: e.target.value },
                  }))
                }
                placeholder="San Francisco, CA"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                LinkedIn
              </label>
              <input
                type="text"
                value={draft.personalInfo.linkedin}
                onChange={(e) =>
                  onChangeDraft((prev) => ({
                    ...prev,
                    personalInfo: { ...prev.personalInfo, linkedin: e.target.value },
                  }))
                }
                placeholder="linkedin.com/in/username"
                className={INPUT_CLASS}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Portfolio / Website
              </label>
              <input
                type="text"
                value={draft.personalInfo.website}
                onChange={(e) =>
                  onChangeDraft((prev) => ({
                    ...prev,
                    personalInfo: { ...prev.personalInfo, website: e.target.value },
                  }))
                }
                placeholder="yourdomain.dev"
                className={INPUT_CLASS}
              />
            </div>
          </div>
        )}
      </section>

      {/* 2. Professional Summary */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('summary')}
          className="w-full flex items-center justify-between px-4 py-3.5 min-h-[48px] text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Professional Summary
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {draft.summary.trim() ? `${draft.summary.trim().split(/\s+/).length} words` : 'Empty'}
            </p>
          </div>
          {openSections.summary ? (
            <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          )}
        </button>

        {openSections.summary && (
          <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                2–3 impact-focused sentences calibrated to the target role.
              </span>
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={summarySuggestion.loading}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                {summarySuggestion.loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Tailor Summary with AI</span>
              </button>
            </div>

            <textarea
              rows={4}
              value={draft.summary}
              onChange={(e) =>
                onChangeDraft((prev) => ({ ...prev, summary: e.target.value }))
              }
              placeholder="Summarize your years of experience, core domain strengths, and measurable outcomes..."
              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />

            {summarySuggestion.error && (
              <div className="flex items-center justify-between gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                <span>{summarySuggestion.error}</span>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="shrink-0 font-semibold underline cursor-pointer"
                  >
                    ATS Settings
                  </button>
                )}
              </div>
            )}

            {summarySuggestion.result && (
              <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Suggested Tailored Summary
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onChangeDraft((prev) => ({
                          ...prev,
                          summary: summarySuggestion.result!.tailoredSummary,
                        }));
                        setSummarySuggestion({ loading: false, error: null, result: null });
                        onNotify('Tailored summary applied.');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 rounded-md cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Apply</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSummarySuggestion({ loading: false, error: null, result: null })
                      }
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-md cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Dismiss</span>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                  {summarySuggestion.result.tailoredSummary}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {summarySuggestion.result.rationale}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. Work Experience */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('experience')}
          className="w-full flex items-center justify-between px-4 py-3.5 min-h-[48px] text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Work Experience
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {draft.experiences.length} {draft.experiences.length === 1 ? 'role' : 'roles'}
            </p>
          </div>
          {openSections.experience ? (
            <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          )}
        </button>

        {openSections.experience && (
          <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
            {draft.experiences.map((exp, expIdx) => (
              <div key={exp.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                    Role {expIdx + 1}
                    {exp.company ? ` · ${exp.company}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        experiences: prev.experiences.filter((e) => e.id !== exp.id),
                      }))
                    }
                    className="inline-flex items-center gap-1 min-h-[34px] px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-md transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Role Title
                    </label>
                    <input
                      type="text"
                      value={exp.role}
                      onChange={(e) =>
                        onChangeDraft((prev) => ({
                          ...prev,
                          experiences: prev.experiences.map((item) =>
                            item.id === exp.id ? { ...item, role: e.target.value } : item
                          ),
                        }))
                      }
                      placeholder="Senior Software Engineer"
                      className={COMPACT_INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Company
                    </label>
                    <input
                      type="text"
                      value={exp.company}
                      onChange={(e) =>
                        onChangeDraft((prev) => ({
                          ...prev,
                          experiences: prev.experiences.map((item) =>
                            item.id === exp.id ? { ...item, company: e.target.value } : item
                          ),
                        }))
                      }
                      placeholder="Northstar Financial"
                      className={COMPACT_INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={exp.location}
                      onChange={(e) =>
                        onChangeDraft((prev) => ({
                          ...prev,
                          experiences: prev.experiences.map((item) =>
                            item.id === exp.id ? { ...item, location: e.target.value } : item
                          ),
                        }))
                      }
                      placeholder="San Francisco, CA"
                      className={COMPACT_INPUT_CLASS}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Start Date
                      </label>
                      <input
                        type="text"
                        value={exp.startDate}
                        onChange={(e) =>
                          onChangeDraft((prev) => ({
                            ...prev,
                            experiences: prev.experiences.map((item) =>
                              item.id === exp.id ? { ...item, startDate: e.target.value } : item
                            ),
                          }))
                        }
                        placeholder="Mar 2023"
                        className={COMPACT_INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        End Date
                      </label>
                      <input
                        type="text"
                        disabled={exp.current}
                        value={exp.current ? 'Present' : exp.endDate}
                        onChange={(e) =>
                          onChangeDraft((prev) => ({
                            ...prev,
                            experiences: prev.experiences.map((item) =>
                              item.id === exp.id ? { ...item, endDate: e.target.value } : item
                            ),
                          }))
                        }
                        placeholder="Feb 2025"
                        className="w-full min-h-[40px] px-3 py-1.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      />
                    </div>
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={exp.current}
                    onChange={(e) =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        experiences: prev.experiences.map((item) =>
                          item.id === exp.id ? { ...item, current: e.target.checked } : item
                        ),
                      }))
                    }
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600"
                  />
                  <span>Currently working in this role</span>
                </label>

                {/* Bullets */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Achievement Bullets
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeDraft((prev) => ({
                          ...prev,
                          experiences: prev.experiences.map((item) =>
                            item.id === exp.id
                              ? { ...item, bullets: [...item.bullets, ''] }
                              : item
                          ),
                        }))
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Bullet</span>
                    </button>
                  </div>

                  {exp.bullets.map((bullet, bIdx) => {
                    const suggestionKey = `${exp.id}:${bIdx}`;
                    const activeSug =
                      bulletSuggestion?.key === suggestionKey ? bulletSuggestion : null;

                    return (
                      <div key={bIdx} className="space-y-1.5">
                        <div className="flex items-start gap-2">
                          <textarea
                            rows={2}
                            value={bullet}
                            onChange={(e) =>
                              onChangeDraft((prev) => ({
                                ...prev,
                                experiences: prev.experiences.map((item) => {
                                  if (item.id !== exp.id) return item;
                                  const nextBullets = [...item.bullets];
                                  nextBullets[bIdx] = e.target.value;
                                  return { ...item, bullets: nextBullets };
                                }),
                              }))
                            }
                            placeholder="Action verb + measurable outcome + technology/method..."
                            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          />
                          <div className="flex flex-col gap-1 shrink-0">
                            <button
                              type="button"
                              title="Optimize bullet with AI"
                              disabled={!bullet.trim() || activeSug?.loading}
                              onClick={() =>
                                handleRewriteBullet(
                                  exp.id,
                                  bIdx,
                                  exp.role,
                                  exp.company,
                                  bullet
                                )
                              }
                              className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] px-2 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                            >
                              {activeSug?.loading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                            </button>
                            {exp.bullets.length > 1 && (
                              <button
                                type="button"
                                title="Delete bullet"
                                onClick={() =>
                                  onChangeDraft((prev) => ({
                                    ...prev,
                                    experiences: prev.experiences.map((item) => {
                                      if (item.id !== exp.id) return item;
                                      return {
                                        ...item,
                                        bullets: item.bullets.filter((_, i) => i !== bIdx),
                                      };
                                    }),
                                  }))
                                }
                                className="inline-flex items-center justify-center min-h-[34px] min-w-[36px] text-slate-400 dark:text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {activeSug?.error && (
                          <div className="flex items-center justify-between gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                            <span>{activeSug.error}</span>
                            {onOpenSettings && (
                              <button
                                type="button"
                                onClick={onOpenSettings}
                                className="shrink-0 font-semibold underline cursor-pointer"
                              >
                                ATS Settings
                              </button>
                            )}
                          </div>
                        )}

                        {activeSug?.result && (
                          <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                                AI Optimized Bullet
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onChangeDraft((prev) => ({
                                      ...prev,
                                      experiences: prev.experiences.map((item) => {
                                        if (item.id !== exp.id) return item;
                                        const nextBullets = [...item.bullets];
                                        nextBullets[bIdx] = activeSug.result!.improvedBullet;
                                        return { ...item, bullets: nextBullets };
                                      }),
                                    }));
                                    setBulletSuggestion(null);
                                    onNotify('Optimized bullet applied.');
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 rounded-md cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Apply</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setBulletSuggestion(null)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-md cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Dismiss</span>
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-slate-900 dark:text-slate-100 font-medium">
                              {activeSug.result.improvedBullet}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {activeSug.result.rationale}
                              {activeSug.result.addedKeywords.length > 0
                                ? ` · Keywords: ${activeSug.result.addedKeywords.join(', ')}`
                                : ''}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="p-4">
              <button
                type="button"
                onClick={() =>
                  onChangeDraft((prev) => ({
                    ...prev,
                    experiences: [
                      ...prev.experiences,
                      {
                        id: createId('exp'),
                        role: '',
                        company: '',
                        location: '',
                        startDate: '',
                        endDate: '',
                        current: false,
                        bullets: [''],
                      },
                    ],
                  }))
                }
                className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Work Experience</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 4. Skills */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('skills')}
          className="w-full flex items-center justify-between px-4 py-3.5 min-h-[48px] text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Skills &amp; Competencies
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {draft.skillGroups.reduce((acc, g) => acc + g.skills.length, 0)} skills across{' '}
              {draft.skillGroups.length} groups
            </p>
          </div>
          {openSections.skills ? (
            <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          )}
        </button>

        {openSections.skills && (
          <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
            {draft.skillGroups.map((group) => (
              <div key={group.id} className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={group.category}
                    onChange={(e) =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        skillGroups: prev.skillGroups.map((g) =>
                          g.id === group.id ? { ...g, category: e.target.value } : g
                        ),
                      }))
                    }
                    placeholder="Skill Category"
                    className="flex-1 min-h-[38px] px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  />
                  {draft.skillGroups.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        onChangeDraft((prev) => ({
                          ...prev,
                          skillGroups: prev.skillGroups.filter((g) => g.id !== group.id),
                        }))
                      }
                      className="min-h-[38px] px-2.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {group.skills.length > 0 && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {group.skills.map((skill, sIdx) => (
                      <div
                        key={`${skill.name}-${sIdx}`}
                        className="px-3 py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2"
                      >
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {skill.name}
                        </span>

                        <div className="flex items-center gap-2 shrink-0 ml-auto">
                          <div
                            role="group"
                            aria-label={`Proficiency for ${skill.name}`}
                            className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg"
                          >
                            {(['Beginner', 'Intermediate', 'Expert'] as SkillProficiency[]).map(
                              (level) => {
                                const isActive = skill.proficiency === level;
                                return (
                                  <button
                                    key={level}
                                    type="button"
                                    onClick={() =>
                                      onChangeDraft((prev) => ({
                                        ...prev,
                                        skillGroups: prev.skillGroups.map((g) => {
                                          if (g.id !== group.id) return g;
                                          return {
                                            ...g,
                                            skills: g.skills.map((item, idx) =>
                                              idx === sIdx ? { ...item, proficiency: level } : item
                                            ),
                                          };
                                        }),
                                      }))
                                    }
                                    className={`px-2 py-1 min-h-[28px] text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                                      isActive
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                  >
                                    {level}
                                  </button>
                                );
                              }
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              onChangeDraft((prev) => ({
                                ...prev,
                                skillGroups: prev.skillGroups.map((g) =>
                                  g.id === group.id
                                    ? { ...g, skills: g.skills.filter((_, idx) => idx !== sIdx) }
                                    : g
                                ),
                              }))
                            }
                            title={`Remove ${skill.name}`}
                            aria-label={`Remove ${skill.name}`}
                            className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60 rounded-md transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={skillInputs[group.id] || ''}
                    onChange={(e) =>
                      setSkillInputs((prev) => ({ ...prev, [group.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSkillToGroup(group.id);
                      }
                    }}
                    placeholder="Add skill or comma-separated list (Enter)"
                    className="flex-1 min-h-[40px] px-3 py-1.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="New skill proficiency level"
                      value={skillProficiencies[group.id] ?? 'Intermediate'}
                      onChange={(e) =>
                        setSkillProficiencies((prev) => ({
                          ...prev,
                          [group.id]: e.target.value as SkillProficiency,
                        }))
                      }
                      className="min-h-[40px] px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Expert">Expert</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleAddSkillToGroup(group.id)}
                      className="min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div className="p-4">
              <button
                type="button"
                onClick={() =>
                  onChangeDraft((prev) => ({
                    ...prev,
                    skillGroups: [
                      ...prev.skillGroups,
                      { id: createId('sg'), category: 'Additional Skills', skills: [] },
                    ],
                  }))
                }
                className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Skill Category</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 5. Projects */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('projects')}
          className="w-full flex items-center justify-between px-4 py-3.5 min-h-[48px] text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Projects</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {draft.projects.length} {draft.projects.length === 1 ? 'project' : 'projects'}
            </p>
          </div>
          {openSections.projects ? (
            <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          )}
        </button>

        {openSections.projects && (
          <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
            {draft.projects.map((proj) => (
              <div key={proj.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {proj.name || 'Project'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        projects: prev.projects.filter((p) => p.id !== proj.id),
                      }))
                    }
                    className="text-xs font-medium text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={proj.name}
                    onChange={(e) =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        projects: prev.projects.map((p) =>
                          p.id === proj.id ? { ...p, name: e.target.value } : p
                        ),
                      }))
                    }
                    placeholder="Project Name"
                    className={COMPACT_INPUT_CLASS}
                  />
                  <input
                    type="text"
                    value={proj.roleOrStack}
                    onChange={(e) =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        projects: prev.projects.map((p) =>
                          p.id === proj.id ? { ...p, roleOrStack: e.target.value } : p
                        ),
                      }))
                    }
                    placeholder="Stack (e.g. TypeScript, React)"
                    className={COMPACT_INPUT_CLASS}
                  />
                </div>
                <input
                  type="text"
                  value={proj.link}
                  onChange={(e) =>
                    onChangeDraft((prev) => ({
                      ...prev,
                      projects: prev.projects.map((p) =>
                        p.id === proj.id ? { ...p, link: e.target.value } : p
                      ),
                    }))
                  }
                  placeholder="Link (e.g. github.com/user/repo)"
                  className={COMPACT_INPUT_CLASS}
                />
                <textarea
                  rows={2}
                  value={proj.description}
                  onChange={(e) =>
                    onChangeDraft((prev) => ({
                      ...prev,
                      projects: prev.projects.map((p) =>
                        p.id === proj.id ? { ...p, description: e.target.value } : p
                      ),
                    }))
                  }
                  placeholder="Brief scope and technical outcome..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                />
              </div>
            ))}
            <div className="p-4">
              <button
                type="button"
                onClick={() =>
                  onChangeDraft((prev) => ({
                    ...prev,
                    projects: [
                      ...prev.projects,
                      {
                        id: createId('proj'),
                        name: '',
                        roleOrStack: '',
                        link: '',
                        description: '',
                      },
                    ],
                  }))
                }
                className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Project</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 6. Education */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('education')}
          className="w-full flex items-center justify-between px-4 py-3.5 min-h-[48px] text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Education</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {draft.education.length} {draft.education.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
          {openSections.education ? (
            <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          )}
        </button>

        {openSections.education && (
          <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
            {draft.education.map((edu) => (
              <div key={edu.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {edu.institution || 'Education Entry'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        education: prev.education.filter((e) => e.id !== edu.id),
                      }))
                    }
                    className="text-xs font-medium text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={edu.degree}
                    onChange={(e) =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        education: prev.education.map((item) =>
                          item.id === edu.id ? { ...item, degree: e.target.value } : item
                        ),
                      }))
                    }
                    placeholder="Degree (e.g. B.S. Computer Science)"
                    className={COMPACT_INPUT_CLASS}
                  />
                  <input
                    type="text"
                    value={edu.institution}
                    onChange={(e) =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        education: prev.education.map((item) =>
                          item.id === edu.id ? { ...item, institution: e.target.value } : item
                        ),
                      }))
                    }
                    placeholder="University / School"
                    className={COMPACT_INPUT_CLASS}
                  />
                  <input
                    type="text"
                    value={edu.location}
                    onChange={(e) =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        education: prev.education.map((item) =>
                          item.id === edu.id ? { ...item, location: e.target.value } : item
                        ),
                      }))
                    }
                    placeholder="City, State"
                    className={COMPACT_INPUT_CLASS}
                  />
                  <input
                    type="text"
                    value={edu.graduationDate}
                    onChange={(e) =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        education: prev.education.map((item) =>
                          item.id === edu.id
                            ? { ...item, graduationDate: e.target.value }
                            : item
                        ),
                      }))
                    }
                    placeholder="Graduation Year (e.g. 2019)"
                    className={COMPACT_INPUT_CLASS}
                  />
                </div>
                <input
                  type="text"
                  value={edu.details}
                  onChange={(e) =>
                    onChangeDraft((prev) => ({
                      ...prev,
                      education: prev.education.map((item) =>
                        item.id === edu.id ? { ...item, details: e.target.value } : item
                      ),
                    }))
                  }
                  placeholder="Honors, GPA, relevant coursework (optional)"
                  className={COMPACT_INPUT_CLASS}
                />
              </div>
            ))}
            <div className="p-4">
              <button
                type="button"
                onClick={() =>
                  onChangeDraft((prev) => ({
                    ...prev,
                    education: [
                      ...prev.education,
                      {
                        id: createId('edu'),
                        degree: '',
                        institution: '',
                        location: '',
                        graduationDate: '',
                        details: '',
                      },
                    ],
                  }))
                }
                className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Education</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 7. Certifications */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('certifications')}
          className="w-full flex items-center justify-between px-4 py-3.5 min-h-[48px] text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Certifications
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {draft.certifications.length} listed
            </p>
          </div>
          {openSections.certifications ? (
            <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          )}
        </button>

        {openSections.certifications && (
          <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
            {draft.certifications.map((cert) => (
              <div key={cert.id} className="p-4 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={cert.name}
                    onChange={(e) =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        certifications: prev.certifications.map((c) =>
                          c.id === cert.id ? { ...c, name: e.target.value } : c
                        ),
                      }))
                    }
                    placeholder="Certification Name"
                    className={`sm:col-span-2 ${COMPACT_INPUT_CLASS}`}
                  />
                  <input
                    type="text"
                    value={cert.year}
                    onChange={(e) =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        certifications: prev.certifications.map((c) =>
                          c.id === cert.id ? { ...c, year: e.target.value } : c
                        ),
                      }))
                    }
                    placeholder="Year"
                    className={COMPACT_INPUT_CLASS}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={cert.issuer}
                    onChange={(e) =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        certifications: prev.certifications.map((c) =>
                          c.id === cert.id ? { ...c, issuer: e.target.value } : c
                        ),
                      }))
                    }
                    placeholder="Issuing Organization"
                    className={`flex-1 ${COMPACT_INPUT_CLASS}`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        certifications: prev.certifications.filter((c) => c.id !== cert.id),
                      }))
                    }
                    className="min-h-[40px] px-3 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div className="p-4">
              <button
                type="button"
                onClick={() =>
                  onChangeDraft((prev) => ({
                    ...prev,
                    certifications: [
                      ...prev.certifications,
                      { id: createId('cert'), name: '', issuer: '', year: '' },
                    ],
                  }))
                }
                className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Certification</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
