export type TemplateId = 'classic' | 'modern' | 'technical';
export type PaperSize = 'letter' | 'a4';
export type AccentColorId = 'slate' | 'cobalt' | 'emerald' | 'indigo';
export type FontScale = 'compact' | 'standard' | 'comfortable';

export type WorkspaceTab = 'builder' | 'ats' | 'jobs' | 'templates';
export type MobileTab = 'builder' | 'preview' | 'ats' | 'jobs';

export interface PersonalInfo {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
}

export interface ExperienceItem {
  id: string;
  role: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: string[];
}

export interface EducationItem {
  id: string;
  degree: string;
  institution: string;
  location: string;
  graduationDate: string;
  details: string;
}

export type SkillProficiency = 'Beginner' | 'Intermediate' | 'Expert';

export interface SkillItem {
  name: string;
  proficiency: SkillProficiency;
}

export interface SkillGroup {
  id: string;
  category: string;
  skills: SkillItem[];
}

export interface ProjectItem {
  id: string;
  name: string;
  roleOrStack: string;
  link: string;
  description: string;
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  year: string;
}

export interface ResumeDraft {
  id: string;
  name: string;
  updatedAt: string;
  templateId: TemplateId;
  paperSize: PaperSize;
  accentColor: AccentColorId;
  fontScale: FontScale;
  personalInfo: PersonalInfo;
  summary: string;
  experiences: ExperienceItem[];
  education: EducationItem[];
  skillGroups: SkillGroup[];
  projects: ProjectItem[];
  certifications: CertificationItem[];
}

export interface JobTarget {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  updatedAt: string;
}

export interface AtsSubScores {
  keywordMatch: number;
  roleAlignment: number;
  impactMetrics: number;
  formattingParseability: number;
  sectionCompleteness: number;
}

export interface MissingKeyword {
  keyword: string;
  importance: 'critical' | 'recommended' | 'bonus';
  contextHint: string;
  targetSection: 'Skills' | 'Experience' | 'Summary';
}

export interface AtsCheckItem {
  id: string;
  label: string;
  category: string;
  passed: boolean;
  detail: string;
}

export interface SectionFeedback {
  section: string;
  score: number;
  status: 'strong' | 'needs_work' | 'critical';
  findings: string[];
}

export interface BulletUpgrade {
  experienceId: string;
  company: string;
  role: string;
  originalBullet: string;
  improvedBullet: string;
  rationale: string;
  addedKeywords: string[];
}

export interface AtsAnalysisReport {
  draftId: string;
  jobTargetId: string | null;
  jobTitleSnapshot: string;
  analyzedAt: string;
  engineUsed?: string;
  overallScore: number;
  verdict: string;
  subScores: AtsSubScores;
  matchedKeywords: string[];
  missingKeywords: MissingKeyword[];
  atsChecks: AtsCheckItem[];
  sectionFeedback: SectionFeedback[];
  tailoredSummary: string;
  bulletUpgrades: BulletUpgrade[];
}

export interface BulletRewriteResponse {
  improvedBullet: string;
  rationale: string;
  addedKeywords: string[];
}

export interface SummaryGenerateResponse {
  tailoredSummary: string;
  rationale: string;
  highlightedKeywords: string[];
}

export type AtsEngineMode =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'local-rules';

export type AtsStrictness = 'balanced' | 'strict' | 'startup';

export interface AtsSettings {
  engine: AtsEngineMode;
  autoFallback: boolean;
  strictness: AtsStrictness;
  maxBulletUpgrades: 2 | 4 | 6;
  includeTailoredSummary: boolean;
}

