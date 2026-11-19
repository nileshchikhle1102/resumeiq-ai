import { createDefaultJobTargets, createSampleDraft } from '../data/defaultData';
import {
  AtsAnalysisReport,
  AtsEngineMode,
  AtsSettings,
  AtsStrictness,
  ChatMessage,
  JobTarget,
  ResumeDraft,
  SalaryEstimateResult,
  SkillGroup,
  SkillItem,
  SkillProficiency,
} from '../types/resume';

const STORAGE_KEYS = {
  DRAFTS: 'ats_studio_drafts_v1',
  JOBS: 'ats_studio_jobs_v1',
  REPORTS: 'ats_studio_reports_v1',
  ACTIVE: 'ats_studio_active_v1',
  THEME: 'ats_studio_theme_v1',
  ATS_SETTINGS: 'ats_studio_settings_v1',
  SALARY_CACHE: 'ats_studio_salary_cache_v1',
  CHAT_HISTORY: 'ats_studio_chat_history_v1',
} as const;

export const DEFAULT_ATS_SETTINGS: AtsSettings = {
  engine: 'gemini-4-hydrogen',
  autoFallback: true,
  strictness: 'balanced',
  maxBulletUpgrades: 4,
  includeTailoredSummary: true,
};

export type StudioTheme = 'light' | 'dark';

export function loadTheme(): StudioTheme {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.THEME);
    if (val === 'dark' || val === 'light') {
      return val;
    }
  } catch {
    // Ignore
  }
  return 'light';
}

export function saveTheme(theme: StudioTheme): void {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  } catch {
    // Ignore
  }
}

export interface ActiveSelections {
  draftId: string;
  jobId: string | null;
}

function normalizeProficiency(value: unknown): SkillProficiency {
  if (value === 'Beginner' || value === 'Intermediate' || value === 'Expert') {
    return value;
  }
  return 'Intermediate';
}

function normalizeSkillGroups(groups: unknown): SkillGroup[] {
  if (!Array.isArray(groups)) return [];
  return groups.map((group, idx) => {
    const rawGroup = (group && typeof group === 'object' ? group : {}) as {
      id?: unknown;
      category?: unknown;
      skills?: unknown;
    };
    const rawSkills = Array.isArray(rawGroup.skills) ? rawGroup.skills : [];
    const normalizedSkills: SkillItem[] = rawSkills
      .map((item): SkillItem | null => {
        if (typeof item === 'string') {
          const trimmed = item.trim();
          return trimmed ? { name: trimmed, proficiency: 'Intermediate' } : null;
        }
        if (item && typeof item === 'object') {
          const obj = item as { name?: unknown; proficiency?: unknown };
          const name = typeof obj.name === 'string' ? obj.name.trim() : '';
          if (!name) return null;
          return {
            name,
            proficiency: normalizeProficiency(obj.proficiency),
          };
        }
        return null;
      })
      .filter((item): item is SkillItem => item !== null);

    return {
      id: typeof rawGroup.id === 'string' && rawGroup.id ? rawGroup.id : `sg_norm_${idx}`,
      category: typeof rawGroup.category === 'string' ? rawGroup.category : 'Core Skills',
      skills: normalizedSkills,
    };
  });
}

function normalizeDraft(draft: ResumeDraft): ResumeDraft {
  return {
    ...draft,
    skillGroups: normalizeSkillGroups(draft.skillGroups),
  };
}

export function loadDrafts(): ResumeDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DRAFTS);
    if (!raw) {
      const initial = [createSampleDraft()];
      localStorage.setItem(STORAGE_KEYS.DRAFTS, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((d) => normalizeDraft(d as ResumeDraft));
    }
  } catch {
    // Fall back to sample draft
  }
  return [createSampleDraft()];
}

export function saveDrafts(drafts: ResumeDraft[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

export function loadJobs(): JobTarget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.JOBS);
    if (!raw) {
      const initial = createDefaultJobTargets();
      localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fall back
  }
  return createDefaultJobTargets();
}

export function saveJobs(jobs: JobTarget[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(jobs));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadReports(): Record<string, AtsAnalysisReport> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REPORTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch {
    // Ignore
  }
  return {};
}

export function saveReports(reports: Record<string, AtsAnalysisReport>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
  } catch {
    // Ignore
  }
}

export function loadActiveSelections(drafts: ResumeDraft[], jobs: JobTarget[]): ActiveSelections {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ActiveSelections>;
      const validDraft = drafts.some((d) => d.id === parsed.draftId)
        ? (parsed.draftId as string)
        : drafts[0].id;
      const validJob =
        parsed.jobId && jobs.some((j) => j.id === parsed.jobId)
          ? parsed.jobId
          : jobs[0]?.id ?? null;
      return { draftId: validDraft, jobId: validJob };
    }
  } catch {
    // Ignore
  }
  return {
    draftId: drafts[0].id,
    jobId: jobs[0]?.id ?? null,
  };
}

export function saveActiveSelections(active: ActiveSelections): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE, JSON.stringify(active));
  } catch {
    // Ignore
  }
}

export function getReportCacheKey(draftId: string, jobId: string | null): string {
  return `${draftId}::${jobId ?? 'general'}`;
}

export function exportDraftToJsonFile(draft: ResumeDraft): void {
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    draft,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (draft.personalInfo.fullName || draft.name || 'resume')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  a.href = url;
  a.download = `${safeName || 'resume'}-ats-studio.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseImportedDraftJson(rawText: string): ResumeDraft {
  const parsed = JSON.parse(rawText);
  const candidate = parsed?.draft ?? parsed;
  if (!candidate || typeof candidate !== 'object' || !candidate.personalInfo) {
    throw new Error('Invalid resume JSON file. Expected an ATS Resume Studio backup.');
  }
  return normalizeDraft({
    ...createSampleDraft(),
    ...candidate,
    id: `draft_imp_${Date.now().toString(36)}`,
    name: `${candidate.name || candidate.personalInfo.fullName || 'Imported'} (Imported)`,
    updatedAt: new Date().toISOString(),
  });
}

function sanitizeEngine(val: unknown): AtsEngineMode {
  if (
    val === 'gemini-4-hydrogen' ||
    val === 'gemini-3.1-flash-lite' ||
    val === 'local-rules'
  ) {
    return val;
  }
  return DEFAULT_ATS_SETTINGS.engine;
}

function sanitizeStrictness(val: unknown): AtsStrictness {
  if (val === 'balanced' || val === 'strict' || val === 'startup') {
    return val;
  }
  return DEFAULT_ATS_SETTINGS.strictness;
}

export function normalizeAtsSettings(raw: unknown): AtsSettings {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<AtsSettings>;
  const maxUpgrades =
    obj.maxBulletUpgrades === 2 || obj.maxBulletUpgrades === 4 || obj.maxBulletUpgrades === 6
      ? obj.maxBulletUpgrades
      : DEFAULT_ATS_SETTINGS.maxBulletUpgrades;
  return {
    engine: sanitizeEngine(obj.engine),
    autoFallback:
      typeof obj.autoFallback === 'boolean'
        ? obj.autoFallback
        : DEFAULT_ATS_SETTINGS.autoFallback,
    strictness: sanitizeStrictness(obj.strictness),
    maxBulletUpgrades: maxUpgrades,
    includeTailoredSummary:
      typeof obj.includeTailoredSummary === 'boolean'
        ? obj.includeTailoredSummary
        : DEFAULT_ATS_SETTINGS.includeTailoredSummary,
  };
}

export function loadAtsSettings(): AtsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ATS_SETTINGS);
    if (raw) {
      return normalizeAtsSettings(JSON.parse(raw));
    }
  } catch {
    // Ignore
  }
  return { ...DEFAULT_ATS_SETTINGS };
}

export function saveAtsSettings(settings: AtsSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ATS_SETTINGS, JSON.stringify(settings));
  } catch {
    // Ignore
  }
}

export function exportAtsSettingsJson(settings: AtsSettings): void {
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    atsSettings: settings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ats-studio-config.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseImportedAtsSettingsJson(rawText: string): AtsSettings {
  const parsed = JSON.parse(rawText);
  const candidate = parsed?.atsSettings ?? parsed;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Invalid ATS settings configuration file.');
  }
  return normalizeAtsSettings(candidate);
}

export function getSalaryCacheKey(jobTitle: string, location: string): string {
  const normTitle = jobTitle.trim().toLowerCase().replace(/\s+/g, ' ');
  const normLoc = (location.trim() || 'remote').toLowerCase().replace(/\s+/g, ' ');
  return `${normTitle}::${normLoc}`;
}

export function loadSalaryEstimates(): Record<string, SalaryEstimateResult> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SALARY_CACHE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, SalaryEstimateResult>;
      }
    }
  } catch {
    // Ignore
  }
  return {};
}

export function saveSalaryEstimates(cache: Record<string, SalaryEstimateResult>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SALARY_CACHE, JSON.stringify(cache));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadChatHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.slice(-40);
      }
    }
  } catch {
    // Ignore
  }
  return [];
}

export function saveChatHistory(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(messages.slice(-40)));
  } catch {
    // Ignore
  }
}


