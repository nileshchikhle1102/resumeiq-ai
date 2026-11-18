import {
  AtsAnalysisReport,
  AtsCheckItem,
  AtsSettings,
  JobTarget,
  MissingKeyword,
  ResumeDraft,
  SectionFeedback,
} from '../types/resume';

const TECH_AND_DOMAIN_DICTIONARY = [
  'TypeScript',
  'JavaScript',
  'React',
  'Next.js',
  'Node.js',
  'Python',
  'Go',
  'Java',
  'PostgreSQL',
  'SQL',
  'Redis',
  'GraphQL',
  'REST',
  'Docker',
  'Kubernetes',
  'AWS',
  'GCP',
  'Azure',
  'CI/CD',
  'Playwright',
  'Cypress',
  'Jest',
  'Tailwind CSS',
  'Accessibility',
  'WCAG',
  'WebSockets',
  'IndexedDB',
  'A/B Testing',
  'Experimentation',
  'Observability',
  'Microservices',
  'Distributed Systems',
  'Design Systems',
  'Core Web Vitals',
  'Performance',
  'Latency',
  'Security',
  'OAuth',
  'Agile',
  'Product Management',
  'Leadership',
  'Mentorship',
  'Architecture',
  'Testing',
];

const STOPWORDS = new Set([
  'with', 'that', 'this', 'from', 'have', 'will', 'your', 'about', 'work', 'team',
  'experience', 'years', 'using', 'build', 'building', 'skills', 'strong', 'role',
  'company', 'including', 'across', 'their', 'they', 'them', 'into', 'more', 'most',
  'high', 'such', 'well', 'both', 'each', 'make', 'help', 'join', 'looking', 'seeking',
  'ability', 'knowledge', 'understanding', 'preferred', 'required', 'requirements',
  'responsibilities', 'qualifications', 'plus', 'bonus', 'minimum', 'degree',
]);

function extractResumeText(draft: ResumeDraft): string {
  const parts: string[] = [
    draft.personalInfo.fullName,
    draft.personalInfo.headline,
    draft.summary,
    ...draft.experiences.flatMap((e) => [e.role, e.company, ...e.bullets]),
    ...draft.skillGroups.flatMap((g) => [g.category, ...g.skills.map((s) => s.name)]),
    ...draft.projects.flatMap((p) => [p.name, p.roleOrStack, p.description]),
    ...draft.education.flatMap((e) => [e.degree, e.institution, e.details]),
    ...draft.certifications.flatMap((c) => [c.name, c.issuer]),
  ];
  return parts.filter(Boolean).join(' ');
}

function extractTargetKeywords(jdText: string): string[] {
  const found = new Set<string>();
  const lowerJd = jdText.toLowerCase();

  for (const term of TECH_AND_DOMAIN_DICTIONARY) {
    if (lowerJd.includes(term.toLowerCase())) {
      found.add(term);
    }
  }

  // Extract capitalized multi-word or technical tokens from JD
  const tokens = jdText.match(/\b[A-Za-z][A-Za-z0-9.+#/-]{2,}\b/g) || [];
  const freq = new Map<string, number>();
  for (const raw of tokens) {
    const clean = raw.replace(/[.,;:!?()]+$/, '');
    const lower = clean.toLowerCase();
    if (clean.length < 3 || STOPWORDS.has(lower)) continue;
    if (/^\d+$/.test(clean)) continue;
    freq.set(clean, (freq.get(clean) || 0) + 1);
  }

  const sortedTokens = Array.from(freq.entries())
    .filter(([word, count]) => count >= 2 || /^[A-Z]/.test(word) || /[.#+/]/.test(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18);

  for (const [word] of sortedTokens) {
    const already = Array.from(found).some((f) => f.toLowerCase() === word.toLowerCase());
    if (!already) {
      found.add(word);
    }
  }

  return Array.from(found).slice(0, 22);
}

export function runLocalDeterministicAtsCheck(
  draft: ResumeDraft,
  job: JobTarget | null,
  settings: AtsSettings
): AtsAnalysisReport {
  const resumeText = extractResumeText(draft);
  const resumeLower = resumeText.toLowerCase();
  const jdText = (job?.description || '').trim();
  const hasJd = jdText.length >= 25;

  const targetKeywords = hasJd
    ? extractTargetKeywords(jdText)
    : ['TypeScript', 'React', 'Leadership', 'Architecture', 'Testing', 'Performance', 'SQL', 'CI/CD'];

  const matchedKeywords: string[] = [];
  const missingKeywords: MissingKeyword[] = [];

  targetKeywords.forEach((kw, idx) => {
    if (resumeLower.includes(kw.toLowerCase())) {
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push({
        keyword: kw,
        importance: idx < 4 ? 'critical' : idx < 9 ? 'recommended' : 'bonus',
        contextHint: hasJd
          ? `Mentioned in ${job?.title || 'target job'} requirements — add where truthful.`
          : 'High-signal competency commonly screened by ATS parsers.',
        targetSection: idx % 2 === 0 ? 'Skills' : 'Experience',
      });
    }
  });

  const allBullets = draft.experiences.flatMap((e) =>
    e.bullets.map((b) => b.trim()).filter(Boolean)
  );
  const quantifiedBullets = allBullets.filter((b) =>
    /(\d+%|\$\d+|\d+\+|\d+x|\d+\s*(ms|s|users|customers|engineers|million|k\b))/i.test(b)
  );
  const actionVerbRegex =
    /^(architected|built|led|designed|developed|implemented|improved|reduced|increased|launched|scaled|optimized|delivered|drove|automated|collaborated|mentored|created|managed|spearheaded)/i;
  const strongVerbBullets = allBullets.filter((b) => actionVerbRegex.test(b));

  const hasEmail = Boolean(draft.personalInfo.email.trim());
  const hasPhone = Boolean(draft.personalInfo.phone.trim());
  const hasSummary = draft.summary.trim().split(/\s+/).filter(Boolean).length >= 20;
  const totalSkills = draft.skillGroups.reduce((sum, g) => sum + g.skills.length, 0);
  const hasExperience = draft.experiences.length > 0 && allBullets.length > 0;
  const hasEducation = draft.education.length > 0 && Boolean(draft.education[0]?.degree.trim());

  const keywordMatchScore =
    targetKeywords.length > 0
      ? Math.round((matchedKeywords.length / targetKeywords.length) * 100)
      : 70;

  const impactScore =
    allBullets.length > 0
      ? Math.min(100, Math.round((quantifiedBullets.length / allBullets.length) * 100 + 25))
      : 20;

  const parseabilityChecksCount = [
    hasEmail && hasPhone,
    Boolean(draft.personalInfo.fullName.trim()),
    hasSummary,
    hasExperience,
    totalSkills >= 5,
    hasEducation,
  ].filter(Boolean).length;
  const formattingScore = Math.round((parseabilityChecksCount / 6) * 100);

  const completenessScore = Math.round(
    (([hasEmail, hasPhone, hasSummary, hasExperience, totalSkills >= 4, hasEducation].filter(
      Boolean
    ).length /
      6) *
      100)
  );

  const roleAlignmentScore = Math.round(
    keywordMatchScore * 0.65 + (strongVerbBullets.length > 0 ? 35 : 15)
  );

  let overallScore = Math.round(
    keywordMatchScore * 0.35 +
      roleAlignmentScore * 0.2 +
      impactScore * 0.2 +
      formattingScore * 0.15 +
      completenessScore * 0.1
  );

  if (settings.strictness === 'strict') {
    overallScore = Math.max(0, overallScore - 6);
  } else if (settings.strictness === 'startup') {
    overallScore = Math.min(100, overallScore + 3);
  }

  const atsChecks: AtsCheckItem[] = [
    {
      id: 'contact',
      label: 'Contact & Header Completeness',
      category: 'Structure',
      passed: hasEmail && hasPhone && Boolean(draft.personalInfo.fullName.trim()),
      detail:
        hasEmail && hasPhone
          ? 'Full name, email, and phone number are present in the ATS header.'
          : 'Add full name, email, and phone number so recruiters and ATS parsers can contact you.',
    },
    {
      id: 'quantification',
      label: 'Quantified Impact Density',
      category: 'Impact',
      passed: allBullets.length > 0 && quantifiedBullets.length / allBullets.length >= 0.4,
      detail: `${quantifiedBullets.length} of ${allBullets.length} bullets contain concrete numbers, percentages, or scale metrics.`,
    },
    {
      id: 'verbs',
      label: 'Action-Verb Bullet Openings',
      category: 'Clarity',
      passed: allBullets.length > 0 && strongVerbBullets.length / allBullets.length >= 0.6,
      detail: `${strongVerbBullets.length} of ${allBullets.length} experience bullets open with strong action verbs.`,
    },
    {
      id: 'summary',
      label: 'Executive Summary Length',
      category: 'Sections',
      passed: hasSummary,
      detail: hasSummary
        ? 'Professional summary provides sufficient role context for ATS indexing.'
        : 'Expand your professional summary to at least 20 words highlighting core domain strengths.',
    },
    {
      id: 'skills',
      label: 'Indexed Skills Coverage',
      category: 'Keywords',
      passed: totalSkills >= 6,
      detail: `${totalSkills} structured skills listed across ${draft.skillGroups.length} categories.`,
    },
    {
      id: 'education',
      label: 'Education Section Parseability',
      category: 'Sections',
      passed: hasEducation,
      detail: hasEducation
        ? 'Education credentials are cleanly structured.'
        : 'Add at least one degree or educational credential.',
    },
  ];

  const sectionFeedback: SectionFeedback[] = [
    {
      section: 'Professional Summary',
      score: hasSummary ? 85 : 40,
      status: hasSummary ? 'strong' : 'critical',
      findings: [
        hasSummary
          ? 'Summary length is concise and well-structured.'
          : 'Add a 2–3 sentence summary aligned to the target role.',
      ],
    },
    {
      section: 'Work Experience',
      score: impactScore,
      status: impactScore >= 75 ? 'strong' : impactScore >= 50 ? 'needs_work' : 'critical',
      findings: [
        `${quantifiedBullets.length}/${allBullets.length} bullets include measurable metrics.`,
        'Switch to Gemini 4 Hydrogen or Flash Lite in Settings for AI bullet rewrites.',
      ],
    },
    {
      section: 'Skills',
      score: keywordMatchScore,
      status: keywordMatchScore >= 75 ? 'strong' : keywordMatchScore >= 50 ? 'needs_work' : 'critical',
      findings: [
        `${matchedKeywords.length} target keywords detected; ${missingKeywords.length} missing.`,
      ],
    },
    {
      section: 'Education',
      score: hasEducation ? 90 : 35,
      status: hasEducation ? 'strong' : 'needs_work',
      findings: [
        hasEducation ? 'Degree and institution parsed cleanly.' : 'Add degree and graduation year.',
      ],
    },
  ];

  const verdict =
    overallScore >= 80
      ? 'Strong local keyword & structural alignment. Verify nuanced phrasing with Gemini AI when ready.'
      : overallScore >= 60
      ? 'Solid structure with missing target keywords or unquantified bullets.'
      : 'Significant keyword gaps or missing resume sections detected.';

  return {
    draftId: draft.id,
    jobTargetId: job?.id ?? null,
    jobTitleSnapshot: job
      ? `${job.title} · ${job.company}`
      : 'General ATS Best Practices',
    analyzedAt: new Date().toISOString(),
    engineUsed: 'Local Deterministic Engine',
    overallScore,
    verdict,
    subScores: {
      keywordMatch: keywordMatchScore,
      roleAlignment: roleAlignmentScore,
      impactMetrics: impactScore,
      formattingParseability: formattingScore,
      sectionCompleteness: completenessScore,
    },
    matchedKeywords,
    missingKeywords,
    atsChecks,
    sectionFeedback,
    tailoredSummary: '',
    bulletUpgrades: [],
  };
}
