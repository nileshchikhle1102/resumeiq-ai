import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Please set it in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractReadableErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return String(parsed.error.message);
    if (parsed?.message) return String(parsed.message);
  } catch {
    // Check if JSON is embedded inside string
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const inner = JSON.parse(match[0]);
        if (inner?.error?.message) return String(inner.error.message);
        if (inner?.message) return String(inner.message);
      } catch {
        // Ignore
      }
    }
  }
  return raw;
}

function isTransientHighDemandError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return (
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.toLowerCase().includes('high demand') ||
    raw.includes('502') ||
    raw.includes('504') ||
    raw.includes('ECONNRESET') ||
    raw.includes('ETIMEDOUT')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetryAndFallback(
  ai: GoogleGenAI,
  options: {
    requestedEngine?: string;
    autoFallback?: boolean;
    contents: string;
    systemInstruction: string;
    responseSchema: Record<string, unknown>;
  }
) {
  const primaryModel =
    options.requestedEngine === FALLBACK_MODEL ? FALLBACK_MODEL : PRIMARY_MODEL;
  const allowFallback = options.autoFallback !== false && primaryModel !== FALLBACK_MODEL;
  const modelsToTry = allowFallback ? [primaryModel, FALLBACK_MODEL] : [primaryModel];

  let lastError: unknown;

  for (const modelName of modelsToTry) {
    const maxAttempts = modelName === primaryModel ? 2 : 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: options.contents,
          config: {
            systemInstruction: options.systemInstruction,
            thinkingConfig: {
              thinkingLevel:
                modelName === FALLBACK_MODEL ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: options.responseSchema,
          },
        });
        return {
          response,
          modelUsed:
            modelName === FALLBACK_MODEL ? 'Gemini 3.1 Flash Lite' : 'Gemini 4 Hydrogen',
        };
      } catch (err) {
        lastError = err;
        if (!isTransientHighDemandError(err)) {
          throw err;
        }
        if (attempt < maxAttempts) {
          const jitter = Math.floor(Math.random() * 250);
          await sleep(650 * attempt + jitter);
        }
      }
    }
  }

  throw lastError;
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const readable = extractReadableErrorMessage(raw);
  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return { status: 400, message: raw };
  }
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED')) {
    return {
      status: 403,
      message: 'API key permission denied. Check your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('400') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 400,
      message: 'Invalid API key. Please verify your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.toLowerCase().includes('high demand')) {
    return {
      status: 503,
      message:
        'The AI model is temporarily experiencing high demand. Enable Auto-Fallback or switch to Local Deterministic Engine in ATS Settings, or retry in a few seconds.',
    };
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'Rate limit or quota reached. Please wait a moment and try again.',
    };
  }
  if (raw.includes('404') || raw.includes('NOT_FOUND')) {
    return {
      status: 404,
      message: 'Requested Gemini model was not found or is unavailable.',
    };
  }
  return {
    status: 500,
    message: readable || 'Failed to complete AI analysis request.',
  };
}

interface ExperiencePayload {
  id?: string;
  role?: string;
  company?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  bullets?: string[];
}

interface ResumePayload {
  id?: string;
  personalInfo?: {
    fullName?: string;
    headline?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    website?: string;
  };
  summary?: string;
  experiences?: ExperiencePayload[];
  education?: Array<{
    degree?: string;
    institution?: string;
    graduationDate?: string;
    details?: string;
  }>;
  skillGroups?: Array<{
    category?: string;
    skills?: Array<string | { name?: string; proficiency?: string }>;
  }>;
  projects?: Array<{
    name?: string;
    roleOrStack?: string;
    description?: string;
  }>;
  certifications?: Array<{
    name?: string;
    issuer?: string;
    year?: string;
  }>;
}

function serializeResumeForPrompt(resume: ResumePayload): string {
  const info = resume.personalInfo || {};
  const lines: string[] = [
    `CANDIDATE: ${info.fullName || 'Unnamed Candidate'}`,
    `HEADLINE: ${info.headline || ''}`,
    `CONTACT: email=${info.email || 'missing'} | phone=${info.phone || 'missing'} | location=${info.location || 'missing'} | linkedin=${info.linkedin || 'none'} | website=${info.website || 'none'}`,
    '',
    'PROFESSIONAL SUMMARY:',
    resume.summary || '(Empty)',
    '',
    'WORK EXPERIENCE:',
  ];

  for (const exp of resume.experiences || []) {
    lines.push(
      `[experienceId: ${exp.id || 'unknown'}] ${exp.role || ''} at ${exp.company || ''} (${exp.startDate || ''} - ${exp.current ? 'Present' : exp.endDate || ''}) | ${exp.location || ''}`
    );
    for (const bullet of exp.bullets || []) {
      lines.push(`  - ${bullet}`);
    }
  }

  lines.push('', 'EDUCATION:');
  for (const edu of resume.education || []) {
    lines.push(`- ${edu.degree || ''}, ${edu.institution || ''} (${edu.graduationDate || ''}) ${edu.details ? `— ${edu.details}` : ''}`);
  }

  lines.push('', 'SKILLS:');
  for (const group of resume.skillGroups || []) {
    const formattedSkills = (group.skills || [])
      .map((item) => {
        if (typeof item === 'string') return item;
        if (!item?.name) return '';
        return item.proficiency ? `${item.name} (${item.proficiency})` : item.name;
      })
      .filter(Boolean);
    lines.push(`- ${group.category || 'General'}: ${formattedSkills.join(', ')}`);
  }

  if (resume.projects && resume.projects.length > 0) {
    lines.push('', 'PROJECTS:');
    for (const proj of resume.projects) {
      lines.push(`- ${proj.name || ''} (${proj.roleOrStack || ''}): ${proj.description || ''}`);
    }
  }

  if (resume.certifications && resume.certifications.length > 0) {
    lines.push('', 'CERTIFICATIONS:');
    for (const cert of resume.certifications) {
      lines.push(`- ${cert.name || ''} — ${cert.issuer || ''} (${cert.year || ''})`);
    }
  }

  return lines.join('\n');
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/ats/status', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: isGeminiConfigured(),
      availableModels: [
        { id: PRIMARY_MODEL, label: 'Gemini 4 Hydrogen' },
        { id: FALLBACK_MODEL, label: 'Gemini 3.1 Flash Lite' },
      ],
    });
  });

  app.post('/api/ats/analyze', async (req, res) => {
    try {
      const { resume, jobTitle, company, jobDescription, settings } = req.body as {
        resume?: ResumePayload;
        jobTitle?: string;
        company?: string;
        jobDescription?: string;
        settings?: {
          engine?: string;
          autoFallback?: boolean;
          strictness?: 'balanced' | 'strict' | 'startup';
          maxBulletUpgrades?: number;
          includeTailoredSummary?: boolean;
        };
      };

      if (!resume) {
        res.status(400).json({ error: 'Resume payload is required.' });
        return;
      }

      const jdText = (jobDescription || '').trim();
      const hasJobDescription = jdText.length >= 25;
      const ai = getAiClient();

      const maxUpgrades =
        settings?.maxBulletUpgrades === 2 || settings?.maxBulletUpgrades === 6
          ? settings.maxBulletUpgrades
          : 4;
      const strictnessInstruction =
        settings?.strictness === 'strict'
          ? 'Apply strict enterprise Fortune-500 ATS screening standards. Penalize missing quantified impact or missing required terms heavily.'
          : settings?.strictness === 'startup'
          ? 'Apply startup/growth-team evaluation weighing builder ownership, shipping velocity, and transferable stack depth.'
          : 'Apply balanced, realistic technical recruiter ATS screening standards.';

      const prompt = [
        'Analyze the following candidate resume for Applicant Tracking System (ATS) compatibility and job optimization.',
        strictnessInstruction,
        hasJobDescription
          ? `TARGET ROLE: ${jobTitle || 'Target Position'} at ${company || 'Target Company'}\n\nTARGET JOB DESCRIPTION:\n${jdText}`
          : 'NO SPECIFIC JOB DESCRIPTION PROVIDED: Perform a rigorous general industry ATS parseability, quantification, impact verb, and completeness audit based on the candidate headline and target seniority.',
        '',
        'CANDIDATE RESUME:',
        serializeResumeForPrompt(resume),
        '',
        'INSTRUCTIONS:',
        '1. Score strictly and realistically on 0-100 scales. Do not inflate scores if metrics, keywords, or sections are weak.',
        '2. Extract matchedKeywords actually present in the resume and missingKeywords present in the job description (or high-value role skills if no JD is provided).',
        '3. Provide 6 concrete atsChecks covering contact completeness, standard section headers, quantified impact metrics, action-verb strength, chronological clarity, and keyword density.',
        '4. Provide sectionFeedback for Summary, Experience, Skills, and Education.',
        settings?.includeTailoredSummary === false
          ? '5. Return an empty string for tailoredSummary.'
          : '5. Write a concise, high-impact tailoredSummary (2-3 sentences) aligned to the target role.',
        `6. Select up to ${maxUpgrades} real bullet points from the candidate WORK EXPERIENCE (using their exact experienceId, company, role, and originalBullet text verbatim) and rewrite them into stronger, quantified, ATS-optimized improvedBullet versions without fabricating fake employers or degrees.`,
      ].join('\n');

      const { response, modelUsed } = await generateWithRetryAndFallback(ai, {
        requestedEngine: settings?.engine,
        autoFallback: settings?.autoFallback,
        contents: prompt,
        systemInstruction:
          'You are a senior technical recruiter and Enterprise ATS parsing specialist. Evaluate resumes objectively with structured, honest scoring and concrete, truthful optimization advice.',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallScore: { type: Type.INTEGER, description: 'Overall ATS match score 0-100.' },
              verdict: {
                type: Type.STRING,
                description: 'One concise sentence summarizing readiness and top gap.',
              },
              subScores: {
                type: Type.OBJECT,
                properties: {
                  keywordMatch: { type: Type.INTEGER },
                  roleAlignment: { type: Type.INTEGER },
                  impactMetrics: { type: Type.INTEGER },
                  formattingParseability: { type: Type.INTEGER },
                  sectionCompleteness: { type: Type.INTEGER },
                },
                required: [
                  'keywordMatch',
                  'roleAlignment',
                  'impactMetrics',
                  'formattingParseability',
                  'sectionCompleteness',
                ],
              },
              matchedKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              missingKeywords: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    keyword: { type: Type.STRING },
                    importance: {
                      type: Type.STRING,
                      enum: ['critical', 'recommended', 'bonus'],
                    },
                    contextHint: { type: Type.STRING },
                    targetSection: {
                      type: Type.STRING,
                      enum: ['Skills', 'Experience', 'Summary'],
                    },
                  },
                  required: ['keyword', 'importance', 'contextHint', 'targetSection'],
                },
              },
              atsChecks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    label: { type: Type.STRING },
                    category: { type: Type.STRING },
                    passed: { type: Type.BOOLEAN },
                    detail: { type: Type.STRING },
                  },
                  required: ['id', 'label', 'category', 'passed', 'detail'],
                },
              },
              sectionFeedback: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    section: { type: Type.STRING },
                    score: { type: Type.INTEGER },
                    status: {
                      type: Type.STRING,
                      enum: ['strong', 'needs_work', 'critical'],
                    },
                    findings: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['section', 'score', 'status', 'findings'],
                },
              },
              tailoredSummary: { type: Type.STRING },
              bulletUpgrades: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    experienceId: { type: Type.STRING },
                    company: { type: Type.STRING },
                    role: { type: Type.STRING },
                    originalBullet: { type: Type.STRING },
                    improvedBullet: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    addedKeywords: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: [
                    'experienceId',
                    'company',
                    'role',
                    'originalBullet',
                    'improvedBullet',
                    'rationale',
                    'addedKeywords',
                  ],
                },
              },
          },
          required: [
            'overallScore',
            'verdict',
            'subScores',
            'matchedKeywords',
            'missingKeywords',
            'atsChecks',
            'sectionFeedback',
            'tailoredSummary',
            'bulletUpgrades',
          ],
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      res.json({ ...parsed, engineUsed: modelUsed });
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/ats/rewrite-bullet', async (req, res) => {
    try {
      const { role, company, bullet, jobDescription, targetKeywords, settings } = req.body as {
        role?: string;
        company?: string;
        bullet?: string;
        jobDescription?: string;
        targetKeywords?: string[];
        settings?: { engine?: string; autoFallback?: boolean };
      };

      if (!bullet || !bullet.trim()) {
        res.status(400).json({ error: 'Bullet text is required to optimize.' });
        return;
      }

      const ai = getAiClient();
      const prompt = [
        `Rewrite the following resume bullet point for maximum ATS relevance, strong action verb opening, and clear measurable impact (keep claims truthful to the original scope; use realistic placeholders like [X%] only if the original lacks numbers, or sharpen existing metrics).`,
        `Role: ${role || 'Professional'} at ${company || 'Company'}`,
        `Original Bullet: ${bullet}`,
        targetKeywords && targetKeywords.length > 0
          ? `Helpful Target Keywords: ${targetKeywords.join(', ')}`
          : '',
        jobDescription ? `Target Job Context:\n${jobDescription.slice(0, 2500)}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const { response } = await generateWithRetryAndFallback(ai, {
        requestedEngine: settings?.engine,
        autoFallback: settings?.autoFallback,
        contents: prompt,
        systemInstruction:
          'You are an expert executive resume writer. Return one crisp, punchy, single-sentence ATS bullet point under 32 words.',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            improvedBullet: { type: Type.STRING },
            rationale: { type: Type.STRING },
            addedKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['improvedBullet', 'rationale', 'addedKeywords'],
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      res.json(parsed);
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/ats/generate-summary', async (req, res) => {
    try {
      const { resume, jobTitle, company, jobDescription, settings } = req.body as {
        resume?: ResumePayload;
        jobTitle?: string;
        company?: string;
        jobDescription?: string;
        settings?: { engine?: string; autoFallback?: boolean };
      };

      if (!resume) {
        res.status(400).json({ error: 'Resume content is required.' });
        return;
      }

      const ai = getAiClient();
      const prompt = [
        'Write a sharp, ATS-optimized 2–3 sentence professional summary tailored to the candidate background and target role.',
        jobDescription
          ? `Target Role: ${jobTitle || 'Role'} at ${company || 'Company'}\nJob Description:\n${jobDescription.slice(0, 3000)}`
          : 'Tailor to the candidate headline and strongest experience.',
        '',
        serializeResumeForPrompt(resume),
      ].join('\n');

      const { response } = await generateWithRetryAndFallback(ai, {
        requestedEngine: settings?.engine,
        autoFallback: settings?.autoFallback,
        contents: prompt,
        systemInstruction:
          'You are an executive resume strategist. Write concise, metric-grounded summaries with zero fluff or buzzword clichés.',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tailoredSummary: { type: Type.STRING },
            rationale: { type: Type.STRING },
            highlightedKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['tailoredSummary', 'rationale', 'highlightedKeywords'],
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      res.json(parsed);
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  const distPath = path.resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production' || !fs.existsSync(path.resolve(__dirname, 'src'));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ATS Resume Studio server running at http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
