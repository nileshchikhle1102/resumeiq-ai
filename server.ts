import 'dotenv/config';
import crypto from 'crypto';
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

function isClaudeConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return Boolean(key && key !== 'MY_ANTHROPIC_API_KEY');
}

function isOpenAiConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_OPENAI_API_KEY');
}

function signBillingReceipt(payload: {
  uid: string;
  plan: string;
  paymentReference: string;
  expiresAt: string;
}): string {
  const secret =
    process.env.BILLING_RECEIPT_SECRET ||
    process.env.GEMINI_API_KEY ||
    'resumeiq-billing-receipt-secret';
  const message = `${payload.uid}|${payload.plan}|${payload.paymentReference}|${payload.expiresAt}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
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
    useGoogleSearch?: boolean;
  }
) {
  const primaryModel =
    options.requestedEngine === FALLBACK_MODEL ? FALLBACK_MODEL : PRIMARY_MODEL;
  const allowFallback = options.autoFallback !== false && primaryModel !== FALLBACK_MODEL;
  const modelsToTry = allowFallback ? [primaryModel, FALLBACK_MODEL] : [primaryModel];

  let lastError: unknown;
  let trySearch = Boolean(options.useGoogleSearch);

  for (const modelName of modelsToTry) {
    const maxAttempts = 2;
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
            ...(trySearch ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });
        return {
          response,
          modelUsed:
            modelName === FALLBACK_MODEL ? 'Gemini 3.1 Flash Lite' : 'Gemini 4 Hydrogen',
        };
      } catch (err) {
        lastError = err;
        const rawMsg = err instanceof Error ? err.message : String(err);
        // If Google Search tool + JSON schema combination is unsupported on a model variant, retry without search tool
        if (
          trySearch &&
          (rawMsg.includes('400') ||
            rawMsg.toLowerCase().includes('tool') ||
            rawMsg.toLowerCase().includes('invalid_argument'))
        ) {
          trySearch = false;
          continue;
        }
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

function extractJsonObject(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error('AI provider returned an invalid JSON payload.');
  }
}

async function runExternalStructuredAts(options: {
  engine: 'anthropic-claude' | 'openai-gpt';
  systemInstruction: string;
  prompt: string;
  jsonSchemaDescription: string;
}): Promise<{ parsed: Record<string, unknown>; modelUsed: string }> {
  const fullSystem = `${options.systemInstruction}\n\nReturn ONLY valid JSON matching this structure (no markdown fences, no commentary):\n${options.jsonSchemaDescription}`;

  if (options.engine === 'anthropic-claude') {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_ANTHROPIC_API_KEY') {
      throw new Error(
        'ANTHROPIC_API_KEY is not configured in server Secrets. Configure it in Settings > Secrets or connect Google Gemini / Local Engine.'
      );
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 3000,
        system: fullSystem,
        messages: [{ role: 'user', content: options.prompt }],
      }),
    });
    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(data?.error?.message || `Anthropic Claude API error (${res.status}).`);
    }
    const text = (data.content || [])
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');
    return { parsed: extractJsonObject(text), modelUsed: 'Anthropic Claude' };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_OPENAI_API_KEY') {
    throw new Error(
      'OPENAI_API_KEY is not configured in server Secrets. Configure it in Settings > Secrets or connect Google Gemini / Local Engine.'
    );
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: fullSystem },
        { role: 'user', content: options.prompt },
      ],
    }),
  });
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI API error (${res.status}).`);
  }
  const text = data.choices?.[0]?.message?.content || '{}';
  return { parsed: extractJsonObject(text), modelUsed: 'OpenAI GPT-4o mini' };
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
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/ats/status', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: isGeminiConfigured(),
      providers: {
        gemini: isGeminiConfigured(),
        claude: isClaudeConfigured(),
        openai: isOpenAiConfigured(),
      },
      availableModels: [
        { id: PRIMARY_MODEL, label: 'Gemini 4 Hydrogen', provider: 'gemini' },
        { id: FALLBACK_MODEL, label: 'Gemini 3.1 Flash Lite', provider: 'gemini' },
        { id: 'anthropic-claude', label: 'Anthropic Claude', provider: 'claude' },
        { id: 'openai-gpt', label: 'OpenAI GPT-4o mini', provider: 'openai' },
      ],
    });
  });

  app.get('/api/billing/status', (_req, res) => {
    res.json({
      ok: true,
      subscriptionMode: 'direct',
      trialDays: 3,
      currency: 'INR',
      plans: [
        {
          id: 'monthly',
          name: 'Monthly Pro',
          priceCents: 14900,
          currency: 'inr',
          interval: 'month',
        },
        {
          id: 'annual',
          name: 'Annual Pro',
          priceCents: 119900,
          currency: 'inr',
          interval: 'year',
        },
      ],
    });
  });

  app.post('/api/billing/subscribe', (req, res) => {
    try {
      const { plan, uid, paymentMethod, paymentDetail } = req.body as {
        plan?: string;
        uid?: string;
        paymentMethod?: string;
        paymentDetail?: string;
      };

      if (plan !== 'monthly' && plan !== 'annual') {
        res.status(400).json({ error: 'Plan must be "monthly" or "annual".' });
        return;
      }

      if (!uid || !uid.trim()) {
        res.status(400).json({ error: 'Authenticated user ID is required to activate a subscription.' });
        return;
      }

      const method =
        paymentMethod === 'card' || paymentMethod === 'netbanking' ? paymentMethod : 'upi';

      const detail = (paymentDetail || '').trim();
      if (method === 'upi' && (!detail || !/^[^\s@]+@[^\s@]{2,}$/.test(detail))) {
        res.status(400).json({ error: 'Please enter a valid UPI ID (e.g. name@okaxis).' });
        return;
      }
      if (method === 'card' && detail.length < 4) {
        res.status(400).json({ error: 'Please enter the cardholder name or last 4 card digits.' });
        return;
      }
      if (method === 'netbanking' && detail.length < 2) {
        res.status(400).json({ error: 'Please select your bank to continue.' });
        return;
      }

      const durationDays = plan === 'annual' ? 366 : 32;
      const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
      const paymentReference = `sub_${crypto.randomBytes(8).toString('hex')}`;
      const receiptToken = signBillingReceipt({
        uid: uid.trim(),
        plan,
        paymentReference,
        expiresAt,
      });

      res.json({
        ok: true,
        subscription: {
          plan,
          status: 'active',
          paymentMethod: method,
          paymentReference,
          receiptToken,
          expiresAt,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to activate subscription.',
      });
    }
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
      const requestedEngine = settings?.engine;
      const ai =
        requestedEngine === 'anthropic-claude' || requestedEngine === 'openai-gpt'
          ? null
          : getAiClient();

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

      if (requestedEngine === 'anthropic-claude' || requestedEngine === 'openai-gpt') {
        const { parsed, modelUsed } = await runExternalStructuredAts({
          engine: requestedEngine,
          systemInstruction:
            'You are a senior technical recruiter and Enterprise ATS parsing specialist. Evaluate resumes objectively with structured, honest scoring and concrete, truthful optimization advice.',
          prompt,
          jsonSchemaDescription:
            '{"overallScore": number, "verdict": string, "subScores": {"keywordMatch": number, "roleAlignment": number, "impactMetrics": number, "formattingParseability": number, "sectionCompleteness": number}, "matchedKeywords": string[], "missingKeywords": [{"keyword": string, "importance": "critical"|"recommended"|"bonus", "contextHint": string, "targetSection": "Skills"|"Experience"|"Summary"}], "atsChecks": [{"id": string, "label": string, "category": string, "passed": boolean, "detail": string}], "sectionFeedback": [{"section": string, "score": number, "status": "strong"|"needs_work"|"critical", "findings": string[]}], "tailoredSummary": string, "bulletUpgrades": [{"experienceId": string, "company": string, "role": string, "originalBullet": string, "improvedBullet": string, "rationale": string, "addedKeywords": string[]}]}',
        });
        res.json({ ...parsed, engineUsed: modelUsed });
        return;
      }

      const { response, modelUsed } = await generateWithRetryAndFallback(ai!, {
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

      if (settings?.engine === 'anthropic-claude' || settings?.engine === 'openai-gpt') {
        const { parsed } = await runExternalStructuredAts({
          engine: settings.engine,
          systemInstruction:
            'You are an expert executive resume writer. Return one crisp, punchy, single-sentence ATS bullet point under 32 words.',
          prompt,
          jsonSchemaDescription:
            '{"improvedBullet": string, "rationale": string, "addedKeywords": string[]}',
        });
        res.json(parsed);
        return;
      }

      const ai = getAiClient();
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

      const prompt = [
        'Write a sharp, ATS-optimized 2–3 sentence professional summary tailored to the candidate background and target role.',
        jobDescription
          ? `Target Role: ${jobTitle || 'Role'} at ${company || 'Company'}\nJob Description:\n${jobDescription.slice(0, 3000)}`
          : 'Tailor to the candidate headline and strongest experience.',
        '',
        serializeResumeForPrompt(resume),
      ].join('\n');

      if (settings?.engine === 'anthropic-claude' || settings?.engine === 'openai-gpt') {
        const { parsed } = await runExternalStructuredAts({
          engine: settings.engine,
          systemInstruction:
            'You are an executive resume strategist. Write concise, metric-grounded summaries with zero fluff or buzzword clichés.',
          prompt,
          jsonSchemaDescription:
            '{"tailoredSummary": string, "rationale": string, "highlightedKeywords": string[]}',
        });
        res.json(parsed);
        return;
      }

      const ai = getAiClient();
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

  app.post('/api/jobs/salary-estimate', async (req, res) => {
    try {
      const { jobTitle, location, company, jobDescription, settings } = req.body as {
        jobTitle?: string;
        location?: string;
        company?: string;
        jobDescription?: string;
        settings?: { engine?: string; autoFallback?: boolean };
      };

      const cleanTitle = (jobTitle || '').trim();
      if (!cleanTitle) {
        res.status(400).json({ error: 'Job title is required to fetch salary benchmarks.' });
        return;
      }

      const cleanLocation = (location || '').trim() || 'Remote / National Market';
      const ai = getAiClient();

      const prompt = [
        'Provide an accurate, current market compensation range estimate for the following role and location.',
        `Job Title: ${cleanTitle}`,
        `Location / Work Mode: ${cleanLocation}`,
        company ? `Target Company Context: ${company.trim()}` : '',
        jobDescription
          ? `Role Scope Excerpt:\n${jobDescription.trim().slice(0, 1800)}`
          : '',
        '',
        'GUIDELINES:',
        '1. Use the appropriate local currency for the target location (e.g., INR / ₹ for India cities like Bengaluru, Mumbai, Hyderabad, Delhi NCR, Pune; USD / $ for US cities or US Remote; GBP / £ for UK; EUR / € for Eurozone; SGD / S$ for Singapore; CAD / CA$ for Canada).',
        '2. Express lowSalary (25th percentile), medianSalary (50th percentile), and highSalary (75th–90th percentile) as realistic numeric annual base compensation figures in that currency (e.g. 2400000 for ₹24 LPA, 165000 for $165k). Ensure lowSalary <= medianSalary <= highSalary.',
        '3. Summarize expected bonus, equity/RSU, or variable pay context in totalCompNote.',
        '4. Classify marketDemand as High, Moderate, Competitive, or Niche with a concise 1–2 sentence demandSummary.',
        '5. List 3–4 concrete skills or experience factors (keyCompDrivers) that unlock top-quartile offers for this role and market.',
        '6. Provide one practical, role-specific negotiationTip.',
      ]
        .filter(Boolean)
        .join('\n');

      const { response, modelUsed } = await generateWithRetryAndFallback(ai, {
        requestedEngine: settings?.engine,
        autoFallback: settings?.autoFallback,
        useGoogleSearch: true,
        contents: prompt,
        systemInstruction:
          'You are a senior compensation analyst and technical recruiting market researcher. Provide grounded, realistic, location-adjusted salary bands without exaggeration.',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            currency: {
              type: Type.STRING,
              description: 'ISO 4217 currency code such as INR, USD, GBP, EUR, CAD, SGD.',
            },
            currencySymbol: {
              type: Type.STRING,
              description: 'Currency symbol such as ₹, $, £, €.',
            },
            payPeriod: {
              type: Type.STRING,
              enum: ['annual', 'monthly', 'hourly'],
            },
            lowSalary: {
              type: Type.INTEGER,
              description: '25th percentile annual base salary as a whole number.',
            },
            medianSalary: {
              type: Type.INTEGER,
              description: '50th percentile (median) annual base salary as a whole number.',
            },
            highSalary: {
              type: Type.INTEGER,
              description: '75th-90th percentile annual base salary as a whole number.',
            },
            totalCompNote: {
              type: Type.STRING,
              description: 'Concise summary of typical bonus, stock/RSU, or variable pay.',
            },
            marketDemand: {
              type: Type.STRING,
              enum: ['High', 'Moderate', 'Competitive', 'Niche'],
            },
            demandSummary: {
              type: Type.STRING,
              description: '1-2 sentence overview of hiring demand and supply for this location.',
            },
            keyCompDrivers: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            negotiationTip: {
              type: Type.STRING,
            },
          },
          required: [
            'currency',
            'currencySymbol',
            'payPeriod',
            'lowSalary',
            'medianSalary',
            'highSalary',
            'totalCompNote',
            'marketDemand',
            'demandSummary',
            'keyCompDrivers',
            'negotiationTip',
          ],
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim()) as Record<string, unknown>;

      // Extract grounded search citations if returned by Gemini Search Grounding
      const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const seenUrls = new Set<string>();
      const sources: Array<{ title: string; url: string }> = [];
      if (Array.isArray(rawChunks)) {
        for (const chunk of rawChunks) {
          const web = (chunk as { web?: { uri?: string; title?: string } })?.web;
          if (web?.uri && /^https?:\/\//i.test(web.uri) && !seenUrls.has(web.uri)) {
            seenUrls.add(web.uri);
            sources.push({
              title: (web.title || web.uri).slice(0, 100),
              url: web.uri,
            });
            if (sources.length >= 5) break;
          }
        }
      }

      res.json({
        jobTitle: cleanTitle,
        location: cleanLocation,
        currency: String(parsed.currency || 'USD').toUpperCase(),
        currencySymbol: String(parsed.currencySymbol || '$'),
        payPeriod:
          parsed.payPeriod === 'monthly' || parsed.payPeriod === 'hourly'
            ? parsed.payPeriod
            : 'annual',
        lowSalary: Number(parsed.lowSalary) || 0,
        medianSalary: Number(parsed.medianSalary) || 0,
        highSalary: Number(parsed.highSalary) || 0,
        totalCompNote: String(parsed.totalCompNote || ''),
        marketDemand:
          parsed.marketDemand === 'High' ||
          parsed.marketDemand === 'Competitive' ||
          parsed.marketDemand === 'Niche'
            ? parsed.marketDemand
            : 'Moderate',
        demandSummary: String(parsed.demandSummary || ''),
        keyCompDrivers: Array.isArray(parsed.keyCompDrivers)
          ? parsed.keyCompDrivers.map((d) => String(d)).slice(0, 5)
          : [],
        negotiationTip: String(parsed.negotiationTip || ''),
        sources,
        fetchedAt: new Date().toISOString(),
        engineUsed: sources.length > 0 ? `${modelUsed} · Web Grounded` : modelUsed,
      });
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/chat/message', async (req, res) => {
    try {
      const {
        message,
        history,
        persona,
        model,
        autoFallback,
        resume,
        jobTitle,
        company,
        location,
        jobDescription,
      } = req.body as {
        message?: string;
        history?: Array<{ role?: string; text?: string }>;
        persona?: string;
        model?: string;
        autoFallback?: boolean;
        resume?: ResumePayload | null;
        jobTitle?: string;
        company?: string;
        location?: string;
        jobDescription?: string;
      };

      const cleanMessage = (message || '').trim();
      if (!cleanMessage) {
        res.status(400).json({ error: 'Message text is required.' });
        return;
      }

      const ai = getAiClient();

      const roleDirective =
        persona === 'interview_coach'
          ? 'You are ResumeIQ Interview Coach — a demanding yet supportive hiring manager and technical/behavioral interviewer. Ask one targeted interview question at a time or evaluate the candidate’s answer using the STAR framework, referencing their real resume projects and experience without inventing fake credentials.'
          : persona === 'salary_negotiator'
          ? 'You are ResumeIQ Salary & Compensation Advisor — a sharp career negotiation strategist. Help the candidate benchmark total compensation, frame counter-offers, handle recruiter anchoring, and tie compensation asks to verifiable impact from their resume.'
          : 'You are ResumeIQ ATS Strategist — a senior technical recruiter and resume architect. Give concrete, honest, hallucination-free advice to tighten resume bullets, surface missing job keywords, quantify outcomes, and improve ATS readability.';

      const contextBlocks: string[] = [
        roleDirective,
        'Always remain grounded in the candidate’s actual resume facts. Never fabricate employers, metrics, or degrees. Keep responses crisp, structured, and actionable.',
      ];

      if (resume) {
        contextBlocks.push('', 'ACTIVE CANDIDATE RESUME CONTEXT:', serializeResumeForPrompt(resume));
      }
      if (jobTitle || jobDescription) {
        contextBlocks.push(
          '',
          `ACTIVE TARGET JOB: ${jobTitle || 'Role'} at ${company || 'Target Company'}${location ? ` (${location})` : ''}`,
          jobDescription ? `JOB DESCRIPTION EXCERPT:\n${jobDescription.slice(0, 2500)}` : ''
        );
      }

      const systemInstruction = contextBlocks.filter((line) => line !== undefined).join('\n');

      const normalizedHistory = (Array.isArray(history) ? history : [])
        .slice(-24)
        .filter((item) => item && (item.role === 'user' || item.role === 'model') && item.text?.trim())
        .map((item) => ({
          role: item.role as 'user' | 'model',
          parts: [{ text: String(item.text).trim() }],
        }));

      const requestedModel = model === FALLBACK_MODEL ? FALLBACK_MODEL : PRIMARY_MODEL;
      const allowFallback = autoFallback !== false && requestedModel !== FALLBACK_MODEL;
      const modelsToTry = allowFallback ? [requestedModel, FALLBACK_MODEL] : [requestedModel];

      let lastError: unknown;
      for (const modelName of modelsToTry) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const chat = ai.chats.create({
              model: modelName,
              history: normalizedHistory,
              config: {
                systemInstruction,
                thinkingConfig: {
                  thinkingLevel:
                    modelName === FALLBACK_MODEL ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
                },
              },
            });
            const response = await chat.sendMessage({ message: cleanMessage });
            const replyText = (response.text || '').trim();
            if (!replyText) {
              throw new Error('Model returned an empty response.');
            }
            res.json({
              reply: replyText,
              modelUsed:
                modelName === FALLBACK_MODEL ? 'Gemini 3.1 Flash Lite' : 'Gemini 4 Hydrogen',
            });
            return;
          } catch (err) {
            lastError = err;
            if (!isTransientHighDemandError(err)) {
              throw err;
            }
            if (attempt < 2) {
              await sleep(650 * attempt + Math.floor(Math.random() * 250));
            }
          }
        }
      }

      throw lastError;
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
