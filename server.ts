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

function getStripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || key === 'MY_STRIPE_SECRET_KEY') {
    return null;
  }
  return key;
}

function isStripeConfigured(): boolean {
  return Boolean(getStripeSecretKey());
}

function signBillingReceipt(payload: {
  uid: string;
  plan: string;
  sessionId: string;
  expiresAt: string;
}): string {
  const secret =
    process.env.STRIPE_SECRET_KEY ||
    process.env.GEMINI_API_KEY ||
    'resumeiq-billing-receipt-secret';
  const message = `${payload.uid}|${payload.plan}|${payload.sessionId}|${payload.expiresAt}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function resolveAppOrigin(req: express.Request, clientReturnUrl?: string): string {
  if (clientReturnUrl) {
    try {
      const parsed = new URL(clientReturnUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
      }
    } catch {
      // Fallback to server env / request host
    }
  }
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl !== 'MY_APP_URL') {
    try {
      return new URL(envUrl).origin;
    } catch {
      // Ignore malformed APP_URL
    }
  }
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader)
    ? protoHeader[0]
    : protoHeader?.split(',')[0] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
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

  app.get('/api/billing/status', (_req, res) => {
    res.json({
      ok: true,
      stripeConfigured: isStripeConfigured(),
      trialDays: 3,
      currency: 'INR',
      plans: [
        {
          id: 'monthly',
          name: 'Monthly Pro',
          priceCents: 14900,
          currency: 'inr',
          interval: 'month',
          priceIdConfigured: Boolean(process.env.STRIPE_PRICE_MONTHLY?.trim()),
        },
        {
          id: 'annual',
          name: 'Annual Pro',
          priceCents: 119900,
          currency: 'inr',
          interval: 'year',
          priceIdConfigured: Boolean(process.env.STRIPE_PRICE_ANNUAL?.trim()),
        },
      ],
    });
  });

  app.post('/api/billing/create-checkout-session', async (req, res) => {
    try {
      const { plan, uid, email, returnUrl } = req.body as {
        plan?: string;
        uid?: string;
        email?: string;
        returnUrl?: string;
      };

      if (plan !== 'monthly' && plan !== 'annual') {
        res.status(400).json({ error: 'Plan must be "monthly" or "annual".' });
        return;
      }

      if (!uid || !uid.trim()) {
        res.status(400).json({ error: 'Authenticated user ID is required to start checkout.' });
        return;
      }

      const stripeKey = getStripeSecretKey();
      if (!stripeKey) {
        res.status(503).json({
          stripeConfigured: false,
          error:
            'Stripe payment gateway is not configured yet. Add STRIPE_SECRET_KEY in Settings > Secrets (or .env) to accept live Card, Apple Pay, and Google Pay subscriptions.',
        });
        return;
      }

      const baseOrigin = resolveAppOrigin(req, returnUrl);
      const cleanReturnBase = baseOrigin.split('?')[0].replace(/\/$/, '');
      const successUrl = `${cleanReturnBase}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${cleanReturnBase}/?checkout=cancelled`;

      const configuredPriceId =
        plan === 'annual'
          ? process.env.STRIPE_PRICE_ANNUAL?.trim()
          : process.env.STRIPE_PRICE_MONTHLY?.trim();

      const params = new URLSearchParams();
      params.set('mode', 'subscription');
      params.set('success_url', successUrl);
      params.set('cancel_url', cancelUrl);
      params.set('client_reference_id', uid.trim());
      params.set('metadata[uid]', uid.trim());
      params.set('metadata[plan]', plan);
      params.set('allow_promotion_codes', 'true');
      if (email && email.includes('@')) {
        params.set('customer_email', email.trim());
      }

      if (configuredPriceId) {
        params.set('line_items[0][price]', configuredPriceId);
        params.set('line_items[0][quantity]', '1');
      } else {
        params.set('line_items[0][price_data][currency]', 'inr');
        params.set(
          'line_items[0][price_data][product_data][name]',
          plan === 'annual' ? 'ResumeIQ Pro — Annual Plan' : 'ResumeIQ Pro — Monthly Plan'
        );
        params.set(
          'line_items[0][price_data][product_data][description]',
          'Unlimited Gemini ATS compatibility scans, AI bullet & summary rewrites, and print-ready PDF/JSON exports.'
        );
        params.set(
          'line_items[0][price_data][unit_amount]',
          plan === 'annual' ? '119900' : '14900'
        );
        params.set(
          'line_items[0][price_data][recurring][interval]',
          plan === 'annual' ? 'year' : 'month'
        );
        params.set('line_items[0][quantity]', '1');
      }

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const stripeData = (await stripeRes.json()) as {
        id?: string;
        url?: string;
        error?: { message?: string };
      };

      if (!stripeRes.ok || !stripeData.url) {
        res.status(stripeRes.status >= 400 ? stripeRes.status : 500).json({
          error: stripeData?.error?.message || 'Unable to create Stripe Checkout session.',
        });
        return;
      }

      res.json({
        ok: true,
        sessionId: stripeData.id,
        url: stripeData.url,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to initialize Stripe Checkout.',
      });
    }
  });

  app.post('/api/billing/verify-session', async (req, res) => {
    try {
      const { sessionId, uid } = req.body as { sessionId?: string; uid?: string };
      if (!sessionId || !uid) {
        res.status(400).json({ error: 'sessionId and uid are required.' });
        return;
      }

      const stripeKey = getStripeSecretKey();
      if (!stripeKey) {
        res.status(503).json({
          stripeConfigured: false,
          error: 'STRIPE_SECRET_KEY is not configured on the server.',
        });
        return;
      }

      const stripeRes = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId.trim())}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${stripeKey}`,
          },
        }
      );

      const session = (await stripeRes.json()) as {
        id?: string;
        status?: string;
        payment_status?: string;
        client_reference_id?: string | null;
        metadata?: { uid?: string; plan?: string };
        error?: { message?: string };
      };

      if (!stripeRes.ok || !session.id) {
        res.status(stripeRes.status >= 400 ? stripeRes.status : 400).json({
          error: session?.error?.message || 'Could not verify Stripe Checkout session.',
        });
        return;
      }

      const sessionOwner = session.client_reference_id || session.metadata?.uid;
      if (sessionOwner && sessionOwner !== uid) {
        res.status(403).json({ error: 'This checkout session belongs to a different user.' });
        return;
      }

      const isPaid =
        session.payment_status === 'paid' ||
        session.payment_status === 'no_payment_required' ||
        session.status === 'complete';

      if (!isPaid) {
        res.status(402).json({ error: 'Payment has not completed for this checkout session.' });
        return;
      }

      const plan = session.metadata?.plan === 'annual' ? 'annual' : 'monthly';
      const durationDays = plan === 'annual' ? 366 : 32;
      const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
      const receiptToken = signBillingReceipt({
        uid,
        plan,
        sessionId: session.id,
        expiresAt,
      });

      res.json({
        ok: true,
        subscription: {
          plan,
          status: 'active',
          stripeSessionId: session.id,
          receiptToken,
          expiresAt,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to verify Stripe payment.',
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
