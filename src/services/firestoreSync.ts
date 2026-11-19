import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AtsAnalysisReport,
  AtsSettings,
  BillingPlanId,
  BillingSubscription,
  JobTarget,
  PaymentMethodType,
  ResumeDraft,
  SkillProficiency,
} from '../types/resume';
import { DEFAULT_ATS_SETTINGS, getReportCacheKey, normalizeAtsSettings } from '../utils/storage';

function truncate(val: unknown, max: number): string {
  const str = typeof val === 'string' ? val : String(val ?? '');
  return str.length > max ? str.slice(0, max) : str;
}

export function sanitizeFirestoreId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now().toString(36)}`;
}

export function toReportDocId(draftId: string, jobTargetId: string | null): string {
  const safeDraft = sanitizeFirestoreId(draftId).slice(0, 60);
  const safeJob = jobTargetId ? sanitizeFirestoreId(jobTargetId).slice(0, 60) : 'general';
  return `${safeDraft}__${safeJob}`;
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string' && value) {
    return value;
  }
  return new Date().toISOString();
}

function sanitizeDraftForFirestore(uid: string, draft: ResumeDraft) {
  const safeId = sanitizeFirestoreId(draft.id);
  const personal = draft.personalInfo || {
    fullName: '',
    headline: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    website: '',
  };

  return {
    id: safeId,
    ownerId: uid,
    name: truncate(draft.name || 'Untitled Resume', 160),
    templateId:
      draft.templateId === 'modern' || draft.templateId === 'technical'
        ? draft.templateId
        : 'classic',
    paperSize: draft.paperSize === 'a4' ? 'a4' : 'letter',
    summary: truncate(draft.summary || '', 4000),
    personalInfo: {
      fullName: truncate(personal.fullName || '', 140),
      headline: truncate(personal.headline || '', 220),
      email: truncate(personal.email || '', 254),
      phone: truncate(personal.phone || '', 64),
      location: truncate(personal.location || '', 140),
      linkedin: truncate(personal.linkedin || '', 260),
      website: truncate(personal.website || '', 260),
    },
    experiences: (Array.isArray(draft.experiences) ? draft.experiences : [])
      .slice(0, 30)
      .map((exp, idx) => ({
        id: sanitizeFirestoreId(exp.id || `exp_${idx}`),
        role: truncate(exp.role || '', 140),
        company: truncate(exp.company || '', 140),
        location: truncate(exp.location || '', 120),
        startDate: truncate(exp.startDate || '', 40),
        endDate: truncate(exp.endDate || '', 40),
        current: Boolean(exp.current),
        bullets: (Array.isArray(exp.bullets) ? exp.bullets : [])
          .slice(0, 15)
          .map((b) => truncate(b || '', 600)),
      })),
    skillGroups: (Array.isArray(draft.skillGroups) ? draft.skillGroups : [])
      .slice(0, 20)
      .map((group, idx) => ({
        id: sanitizeFirestoreId(group.id || `sg_${idx}`),
        category: truncate(group.category || 'Core Skills', 100),
        skills: (Array.isArray(group.skills) ? group.skills : [])
          .slice(0, 40)
          .map((skill) => ({
            name: truncate(skill.name || '', 80),
            proficiency: (skill.proficiency === 'Beginner' ||
            skill.proficiency === 'Intermediate' ||
            skill.proficiency === 'Expert'
              ? skill.proficiency
              : 'Intermediate') as SkillProficiency,
          }))
          .filter((s) => s.name.length > 0),
      })),
    projects: (Array.isArray(draft.projects) ? draft.projects : [])
      .slice(0, 20)
      .map((proj, idx) => ({
        id: sanitizeFirestoreId(proj.id || `proj_${idx}`),
        name: truncate(proj.name || '', 140),
        roleOrStack: truncate(proj.roleOrStack || '', 140),
        link: truncate(proj.link || '', 260),
        description: truncate(proj.description || '', 1000),
      })),
    education: (Array.isArray(draft.education) ? draft.education : [])
      .slice(0, 15)
      .map((edu, idx) => ({
        id: sanitizeFirestoreId(edu.id || `edu_${idx}`),
        degree: truncate(edu.degree || '', 160),
        institution: truncate(edu.institution || '', 160),
        location: truncate(edu.location || '', 120),
        graduationDate: truncate(edu.graduationDate || '', 40),
        details: truncate(edu.details || '', 400),
      })),
    certifications: (Array.isArray(draft.certifications) ? draft.certifications : [])
      .slice(0, 25)
      .map((cert) =>
        typeof cert === 'string'
          ? truncate(cert, 200)
          : truncate(`${cert.name}${cert.issuer ? ` — ${cert.issuer}` : ''}${cert.year ? ` (${cert.year})` : ''}`, 200)
      ),
  };
}

function sanitizeJobForFirestore(uid: string, job: JobTarget) {
  return {
    id: sanitizeFirestoreId(job.id),
    ownerId: uid,
    title: truncate(job.title || '', 160),
    company: truncate(job.company || '', 160),
    description: truncate(job.description || '', 20000),
  };
}

function sanitizeReportForFirestore(uid: string, report: AtsAnalysisReport) {
  const reportId = toReportDocId(report.draftId, report.jobTargetId);
  const sub = report.subScores || {
    keywordMatch: 0,
    roleAlignment: 0,
    impactMetrics: 0,
    formattingParseability: 0,
    sectionCompleteness: 0,
  };
  return {
    id: reportId,
    ownerId: uid,
    draftId: sanitizeFirestoreId(report.draftId),
    jobTargetId: report.jobTargetId ? sanitizeFirestoreId(report.jobTargetId) : '',
    jobTitleSnapshot: truncate(report.jobTitleSnapshot || 'General ATS Best Practices', 200),
    analyzedAt: truncate(report.analyzedAt || new Date().toISOString(), 64),
    overallScore: Math.min(100, Math.max(0, Math.round(Number(report.overallScore) || 0))),
    verdict: truncate(report.verdict || '', 600),
    engineUsed: truncate(report.engineUsed || 'Gemini', 120),
    subScores: {
      keywordMatch: Math.min(100, Math.max(0, Math.round(Number(sub.keywordMatch) || 0))),
      roleAlignment: Math.min(100, Math.max(0, Math.round(Number(sub.roleAlignment) || 0))),
      impactMetrics: Math.min(100, Math.max(0, Math.round(Number(sub.impactMetrics) || 0))),
      formattingParseability: Math.min(
        100,
        Math.max(0, Math.round(Number(sub.formattingParseability) || 0))
      ),
      sectionCompleteness: Math.min(
        100,
        Math.max(0, Math.round(Number(sub.sectionCompleteness) || 0))
      ),
    },
    matchedKeywords: (Array.isArray(report.matchedKeywords) ? report.matchedKeywords : [])
      .slice(0, 150)
      .map((kw) => truncate(kw, 80)),
    missingKeywords: (Array.isArray(report.missingKeywords) ? report.missingKeywords : [])
      .slice(0, 150)
      .map((mk) => ({
        keyword: truncate(mk.keyword, 80),
        importance: mk.importance,
        contextHint: truncate(mk.contextHint, 260),
        targetSection: mk.targetSection,
      })),
    atsChecks: (Array.isArray(report.atsChecks) ? report.atsChecks : [])
      .slice(0, 30)
      .map((chk) => ({
        id: truncate(chk.id, 64),
        label: truncate(chk.label, 120),
        category: truncate(chk.category, 80),
        passed: Boolean(chk.passed),
        detail: truncate(chk.detail, 300),
      })),
    sectionFeedback: (Array.isArray(report.sectionFeedback) ? report.sectionFeedback : [])
      .slice(0, 20)
      .map((sf) => ({
        section: truncate(sf.section, 80),
        score: Math.min(100, Math.max(0, Math.round(Number(sf.score) || 0))),
        status: sf.status,
        findings: (Array.isArray(sf.findings) ? sf.findings : [])
          .slice(0, 8)
          .map((f) => truncate(f, 300)),
      })),
    tailoredSummary: truncate(report.tailoredSummary || '', 4000),
    bulletUpgrades: (Array.isArray(report.bulletUpgrades) ? report.bulletUpgrades : [])
      .slice(0, 20)
      .map((upg) => ({
        experienceId: truncate(upg.experienceId, 128),
        company: truncate(upg.company, 140),
        role: truncate(upg.role, 140),
        originalBullet: truncate(upg.originalBullet, 600),
        improvedBullet: truncate(upg.improvedBullet, 600),
        rationale: truncate(upg.rationale, 360),
        addedKeywords: (Array.isArray(upg.addedKeywords) ? upg.addedKeywords : [])
          .slice(0, 12)
          .map((k) => truncate(k, 60)),
      })),
  };
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const email = truncate(user.email || 'user@gmail.com', 254);
  const displayName = truncate(user.displayName || email.split('@')[0] || 'Studio User', 120);
  const photoURL = truncate(user.photoURL || '', 500);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email,
        displayName,
        photoURL,
        provider: 'google.com',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = snap.data();
      if (
        existing.email !== email ||
        existing.displayName !== displayName ||
        existing.photoURL !== photoURL
      ) {
        await updateDoc(ref, {
          email,
          displayName,
          photoURL,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncDraftToFirestore(uid: string, draft: ResumeDraft): Promise<void> {
  const payload = sanitizeDraftForFirestore(uid, draft);
  const path = `users/${uid}/drafts/${payload.id}`;
  const ref = doc(db, 'users', uid, 'drafts', payload.id);

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        name: payload.name,
        templateId: payload.templateId,
        paperSize: payload.paperSize,
        summary: payload.summary,
        personalInfo: payload.personalInfo,
        experiences: payload.experiences,
        skillGroups: payload.skillGroups,
        projects: payload.projects,
        education: payload.education,
        certifications: payload.certifications,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteDraftFromFirestore(uid: string, draftId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(draftId);
  const path = `users/${uid}/drafts/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'drafts', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncJobToFirestore(uid: string, job: JobTarget): Promise<void> {
  const payload = sanitizeJobForFirestore(uid, job);
  const path = `users/${uid}/jobs/${payload.id}`;
  const ref = doc(db, 'users', uid, 'jobs', payload.id);

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        title: payload.title,
        company: payload.company,
        description: payload.description,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteJobFromFirestore(uid: string, jobId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(jobId);
  const path = `users/${uid}/jobs/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'jobs', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncReportToFirestore(
  uid: string,
  report: AtsAnalysisReport
): Promise<void> {
  const payload = sanitizeReportForFirestore(uid, report);
  const path = `users/${uid}/reports/${payload.id}`;
  const ref = doc(db, 'users', uid, 'reports', payload.id);

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        jobTargetId: payload.jobTargetId,
        jobTitleSnapshot: payload.jobTitleSnapshot,
        analyzedAt: payload.analyzedAt,
        overallScore: payload.overallScore,
        verdict: payload.verdict,
        engineUsed: payload.engineUsed,
        subScores: payload.subScores,
        matchedKeywords: payload.matchedKeywords,
        missingKeywords: payload.missingKeywords,
        atsChecks: payload.atsChecks,
        sectionFeedback: payload.sectionFeedback,
        tailoredSummary: payload.tailoredSummary,
        bulletUpgrades: payload.bulletUpgrades,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncAtsSettingsToFirestore(
  uid: string,
  settings: AtsSettings
): Promise<void> {
  const safe = normalizeAtsSettings(settings);
  const path = `users/${uid}/settings/ats`;
  const ref = doc(db, 'users', uid, 'settings', 'ats');

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        engine: safe.engine,
        autoFallback: safe.autoFallback,
        strictness: safe.strictness,
        maxBulletUpgrades: safe.maxBulletUpgrades,
        includeTailoredSummary: safe.includeTailoredSummary,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        engine: safe.engine,
        autoFallback: safe.autoFallback,
        strictness: safe.strictness,
        maxBulletUpgrades: safe.maxBulletUpgrades,
        includeTailoredSummary: safe.includeTailoredSummary,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveBillingSubscriptionToFirestore(
  uid: string,
  subscription: {
    plan: BillingPlanId;
    paymentMethod: PaymentMethodType;
    paymentReference: string;
    receiptToken: string;
    expiresAt: string;
  }
): Promise<void> {
  const path = `users/${uid}/billing/subscription`;
  const ref = doc(db, 'users', uid, 'billing', 'subscription');
  const plan: BillingPlanId = subscription.plan === 'annual' ? 'annual' : 'monthly';
  const paymentMethod: PaymentMethodType =
    subscription.paymentMethod === 'card' || subscription.paymentMethod === 'netbanking'
      ? subscription.paymentMethod
      : 'upi';
  const paymentReference = truncate(subscription.paymentReference, 255);
  const receiptToken = truncate(subscription.receiptToken, 256);
  const expiresAt = truncate(subscription.expiresAt, 64);

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        plan,
        status: 'active',
        paymentMethod,
        paymentReference,
        receiptToken,
        expiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        plan,
        status: 'active',
        paymentMethod,
        paymentReference,
        receiptToken,
        expiresAt,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface WorkspaceSubscriptionsCallbacks {
  onDrafts: (drafts: ResumeDraft[]) => void;
  onJobs: (jobs: JobTarget[]) => void;
  onReports: (reports: Record<string, AtsAnalysisReport>) => void;
  onSettings: (settings: AtsSettings | null) => void;
  onProfileTimestamp?: (createdAtIso: string) => void;
  onBilling?: (subscription: BillingSubscription | null) => void;
}

export function subscribeUserWorkspace(
  uid: string,
  callbacks: WorkspaceSubscriptionsCallbacks
): Unsubscribe {
  const draftsPath = `users/${uid}/drafts`;
  const jobsPath = `users/${uid}/jobs`;
  const reportsPath = `users/${uid}/reports`;
  const settingsPath = `users/${uid}/settings/ats`;
  const profilePath = `users/${uid}`;
  const billingPath = `users/${uid}/billing/subscription`;

  const unsubProfile = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data?.createdAt instanceof Timestamp) {
        callbacks.onProfileTimestamp?.(data.createdAt.toDate().toISOString());
      } else if (typeof data?.createdAt === 'string' && data.createdAt) {
        callbacks.onProfileTimestamp?.(data.createdAt);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, profilePath);
    }
  );

  const unsubBilling = onSnapshot(
    doc(db, 'users', uid, 'billing', 'subscription'),
    (snap) => {
      if (!snap.exists()) {
        callbacks.onBilling?.(null);
        return;
      }
      const data = snap.data();
      callbacks.onBilling?.({
        ownerId: String(data.ownerId || uid),
        plan: data.plan === 'annual' ? 'annual' : 'monthly',
        status: 'active',
        paymentMethod:
          data.paymentMethod === 'card' || data.paymentMethod === 'netbanking'
            ? data.paymentMethod
            : 'upi',
        paymentReference: String(data.paymentReference || data.stripeSessionId || ''),
        receiptToken: String(data.receiptToken || ''),
        expiresAt: String(data.expiresAt || ''),
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, billingPath);
    }
  );

  const unsubDrafts = onSnapshot(
    query(collection(db, 'users', uid, 'drafts'), where('ownerId', '==', uid)),
    (snapshot) => {
      const list: ResumeDraft[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          name: data.name || 'Untitled Resume',
          updatedAt: timestampToIso(data.updatedAt),
          templateId: data.templateId || 'classic',
          paperSize: data.paperSize || 'letter',
          accentColor: 'cobalt',
          fontScale: 'standard',
          personalInfo: data.personalInfo || {
            fullName: '',
            headline: '',
            email: '',
            phone: '',
            location: '',
            linkedin: '',
            website: '',
          },
          summary: data.summary || '',
          experiences: Array.isArray(data.experiences) ? data.experiences : [],
          skillGroups: Array.isArray(data.skillGroups) ? data.skillGroups : [],
          projects: Array.isArray(data.projects) ? data.projects : [],
          education: Array.isArray(data.education) ? data.education : [],
          certifications: Array.isArray(data.certifications)
            ? data.certifications.map((c: unknown, idx: number) =>
                typeof c === 'string'
                  ? { id: `cert_${idx}`, name: c, issuer: '', year: '' }
                  : (c as ResumeDraft['certifications'][number])
              )
            : [],
        };
      });
      callbacks.onDrafts(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, draftsPath);
    }
  );

  const unsubJobs = onSnapshot(
    query(collection(db, 'users', uid, 'jobs'), where('ownerId', '==', uid)),
    (snapshot) => {
      const list: JobTarget[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          title: data.title || '',
          company: data.company || '',
          location: '',
          description: data.description || '',
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
      callbacks.onJobs(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, jobsPath);
    }
  );

  const unsubReports = onSnapshot(
    query(collection(db, 'users', uid, 'reports'), where('ownerId', '==', uid)),
    (snapshot) => {
      const map: Record<string, AtsAnalysisReport> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data();
        const jobTargetId = data.jobTargetId ? String(data.jobTargetId) : null;
        const draftId = String(data.draftId || '');
        if (!draftId) return;
        const cacheKey = getReportCacheKey(draftId, jobTargetId);
        map[cacheKey] = {
          draftId,
          jobTargetId,
          jobTitleSnapshot: data.jobTitleSnapshot || 'General ATS Best Practices',
          analyzedAt: data.analyzedAt || new Date().toISOString(),
          engineUsed: data.engineUsed || 'Gemini',
          overallScore: Number(data.overallScore) || 0,
          verdict: data.verdict || '',
          subScores: data.subScores || {
            keywordMatch: 0,
            roleAlignment: 0,
            impactMetrics: 0,
            formattingParseability: 0,
            sectionCompleteness: 0,
          },
          matchedKeywords: Array.isArray(data.matchedKeywords) ? data.matchedKeywords : [],
          missingKeywords: Array.isArray(data.missingKeywords) ? data.missingKeywords : [],
          atsChecks: Array.isArray(data.atsChecks) ? data.atsChecks : [],
          sectionFeedback: Array.isArray(data.sectionFeedback) ? data.sectionFeedback : [],
          tailoredSummary: data.tailoredSummary || '',
          bulletUpgrades: Array.isArray(data.bulletUpgrades) ? data.bulletUpgrades : [],
        };
      });
      callbacks.onReports(map);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, reportsPath);
    }
  );

  const unsubSettings = onSnapshot(
    doc(db, 'users', uid, 'settings', 'ats'),
    (snap) => {
      if (!snap.exists()) {
        callbacks.onSettings(null);
        return;
      }
      callbacks.onSettings(normalizeAtsSettings(snap.data()));
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, settingsPath);
    }
  );

  return () => {
    unsubProfile();
    unsubBilling();
    unsubDrafts();
    unsubJobs();
    unsubReports();
    unsubSettings();
  };
}

export async function seedInitialWorkspaceIfEmpty(
  uid: string,
  localDrafts: ResumeDraft[],
  localJobs: JobTarget[],
  localSettings: AtsSettings
): Promise<void> {
  const settingsRef = doc(db, 'users', uid, 'settings', 'ats');
  try {
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await syncAtsSettingsToFirestore(uid, localSettings || DEFAULT_ATS_SETTINGS);
      for (const draft of localDrafts.slice(0, 5)) {
        await syncDraftToFirestore(uid, draft);
      }
      for (const job of localJobs.slice(0, 5)) {
        await syncJobToFirestore(uid, job);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}
