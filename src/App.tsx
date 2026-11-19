import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { CheckCircle2, Loader2, Printer, Trash2, X } from 'lucide-react';
import { AtsDashboard } from './components/AtsDashboard';
import { AuthPromptModal } from './components/AuthPromptModal';
import { BillingModal } from './components/BillingModal';
import { CareerChatDrawer } from './components/CareerChatDrawer';
import { JobTargetsView } from './components/JobTargetsView';
import { LoginPage } from './components/LoginPage';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ResumeEditor } from './components/ResumeEditor';
import { ResumePreview } from './components/ResumePreview';
import { SettingsModal } from './components/SettingsModal';
import { TemplatesAndDraftsView } from './components/TemplatesAndDraftsView';
import { TopBar } from './components/TopBar';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import { createEmptyDraft, createId } from './data/defaultData';
import { auth, signInWithGmail, signOutAccount } from './firebase';
import {
  deleteDraftFromFirestore,
  deleteJobFromFirestore,
  ensureUserProfile,
  saveBillingSubscriptionToFirestore,
  seedInitialWorkspaceIfEmpty,
  subscribeUserWorkspace,
  syncAtsSettingsToFirestore,
  syncDraftToFirestore,
  syncJobToFirestore,
  syncReportToFirestore,
} from './services/firestoreSync';
import {
  AtsAnalysisReport,
  AtsSettings,
  BillingSubscription,
  ChatMessage,
  JobTarget,
  MobileTab,
  ResumeDraft,
  SalaryEstimateResult,
  TemplateId,
  TrialStatusInfo,
  WorkspaceTab,
} from './types/resume';
import { runLocalDeterministicAtsCheck } from './utils/localAtsEngine';
import {
  exportDraftToJsonFile,
  getReportCacheKey,
  loadActiveSelections,
  loadAtsSettings,
  loadChatHistory,
  loadDrafts,
  loadJobs,
  loadReports,
  loadSalaryEstimates,
  loadTheme,
  parseImportedDraftJson,
  saveActiveSelections,
  saveAtsSettings,
  saveChatHistory,
  saveDrafts,
  saveJobs,
  saveReports,
  saveSalaryEstimates,
  saveTheme,
  StudioTheme,
} from './utils/storage';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export default function App() {
  const [theme, setTheme] = useState<StudioTheme>(() => loadTheme());
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [localGuestMode, setLocalGuestMode] = useState(false);
  const [profileCreatedAt, setProfileCreatedAt] = useState<string | null>(null);
  const [billingSubscription, setBillingSubscription] = useState<BillingSubscription | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [drafts, setDrafts] = useState<ResumeDraft[]>(() => loadDrafts());
  const [jobs, setJobs] = useState<JobTarget[]>(() => loadJobs());
  const [reports, setReports] = useState<Record<string, AtsAnalysisReport>>(() => loadReports());
  const [salaryEstimates, setSalaryEstimates] = useState<Record<string, SalaryEstimateResult>>(
    () => loadSalaryEstimates()
  );
  const [atsSettings, setAtsSettings] = useState<AtsSettings>(() => loadAtsSettings());

  const initialSelections = loadActiveSelections(drafts, jobs);
  const [activeDraftId, setActiveDraftId] = useState<string>(initialSelections.draftId);
  const [activeJobId, setActiveJobId] = useState<string | null>(initialSelections.jobId);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('builder');
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('builder');
  const [mobileTemplatesSheetOpen, setMobileTemplatesSheetOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => loadChatHistory());
  const [billingModal, setBillingModal] = useState<{ open: boolean; reason: string | null }>({
    open: false,
    reason: null,
  });
  const [pendingCheckoutSessionId, setPendingCheckoutSessionId] = useState<string | null>(null);
  const [verifyingCheckout, setVerifyingCheckout] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<{
    open: boolean;
    reason: string;
    pendingAction?: () => void;
  }>({ open: false, reason: '' });
  const [confirmDeleteDraftId, setConfirmDeleteDraftId] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasMountedDraftsRef = useRef(false);
  const savedTimerRef = useRef<number | null>(null);
  const cloudDraftSyncTimerRef = useRef<number | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const draftsRef = useRef<ResumeDraft[]>(drafts);
  const jobsRef = useRef<JobTarget[]>(jobs);
  const atsSettingsRef = useRef<AtsSettings>(atsSettings);
  const profileCreatedAtRef = useRef<string | null>(profileCreatedAt);
  const billingSubscriptionRef = useRef<BillingSubscription | null>(billingSubscription);

  const activeDraft = drafts.find((d) => d.id === activeDraftId) ?? drafts[0];
  const activeJob = activeJobId ? jobs.find((j) => j.id === activeJobId) ?? null : null;

  const reportCacheKey = getReportCacheKey(activeDraft.id, activeJob?.id ?? null);
  const cachedReport = reports[reportCacheKey] ?? null;

  const computeTrialStatus = (
    user: User | null,
    createdIso: string | null,
    sub: BillingSubscription | null,
    timestampMs: number
  ): TrialStatusInfo => {
    const hasPaidSubscription = Boolean(
      user &&
        sub &&
        sub.status === 'active' &&
        new Date(sub.expiresAt).getTime() > timestampMs
    );
    const effectiveTrialStart = user
      ? createdIso || user.metadata?.creationTime || new Date(timestampMs).toISOString()
      : null;
    const trialStartMs = effectiveTrialStart ? new Date(effectiveTrialStart).getTime() : 0;
    const trialEndMs =
      effectiveTrialStart && !Number.isNaN(trialStartMs) ? trialStartMs + THREE_DAYS_MS : 0;
    const msRemaining = user ? Math.max(0, trialEndMs - timestampMs) : 0;
    const isTrialActive = Boolean(user && msRemaining > 0);
    const daysRemaining = Math.floor(msRemaining / (24 * 60 * 60 * 1000));
    const hoursRemaining = Math.ceil(msRemaining / (60 * 60 * 1000));
    const hasActiveAccess = Boolean(user && (isTrialActive || hasPaidSubscription));

    return {
      trialStartedAt: effectiveTrialStart,
      trialEndsAt: trialEndMs ? new Date(trialEndMs).toISOString() : null,
      isTrialActive,
      msRemaining,
      daysRemaining,
      hoursRemaining,
      hasPaidSubscription,
      hasActiveAccess,
    };
  };

  const trialStatus = computeTrialStatus(
    currentUser,
    profileCreatedAt,
    billingSubscription,
    nowMs
  );

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    profileCreatedAtRef.current = profileCreatedAt;
  }, [profileCreatedAt]);

  useEffect(() => {
    billingSubscriptionRef.current = billingSubscription;
  }, [billingSubscription]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    atsSettingsRef.current = atsSettings;
  }, [atsSettings]);

  // Periodically refresh current clock for accurate 3-day trial countdown
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  // Capture Stripe Checkout return params (?checkout=success&session_id=... or ?checkout=cancelled)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutState = params.get('checkout');
    const sessionId = params.get('session_id');
    if (checkoutState === 'success' && sessionId) {
      setPendingCheckoutSessionId(sessionId);
      setBillingModal({ open: true, reason: null });
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
    } else if (checkoutState === 'cancelled') {
      setToastMessage('Stripe checkout was cancelled. You can subscribe anytime.');
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
    }
  }, []);

  // Verify completed Stripe Checkout session once authenticated user is available
  useEffect(() => {
    if (!currentUser || !pendingCheckoutSessionId) return;
    let active = true;
    setVerifyingCheckout(true);
    (async () => {
      try {
        const res = await fetch('/api/billing/verify-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: pendingCheckoutSessionId,
            uid: currentUser.uid,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.subscription) {
          throw new Error(data?.error || 'Could not verify Stripe payment.');
        }
        await saveBillingSubscriptionToFirestore(currentUser.uid, data.subscription);
        if (!active) return;
        setBillingSubscription({
          ownerId: currentUser.uid,
          ...data.subscription,
        });
        setPendingCheckoutSessionId(null);
        setBillingModal({ open: false, reason: null });
        setToastMessage('ResumeIQ Pro subscription activated!');
      } catch (err) {
        if (!active) return;
        setPendingCheckoutSessionId(null);
        setBillingModal({
          open: true,
          reason: err instanceof Error ? err.message : 'Unable to verify Stripe payment.',
        });
      } finally {
        if (active) {
          setVerifyingCheckout(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [currentUser, pendingCheckoutSessionId]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (user) {
        setLocalGuestMode(false);
      } else {
        setProfileCreatedAt(null);
        setBillingSubscription(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync authenticated user's profile and workspace with Firestore
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    let unsubscribeWorkspace: (() => void) | null = null;

    const uid = currentUser.uid;
    (async () => {
      await ensureUserProfile(currentUser);
      if (cancelled) return;
      await seedInitialWorkspaceIfEmpty(
        uid,
        draftsRef.current,
        jobsRef.current,
        atsSettingsRef.current
      );
      if (cancelled) return;

      unsubscribeWorkspace = subscribeUserWorkspace(uid, {
        onProfileTimestamp: (createdAtIso) => {
          setProfileCreatedAt(createdAtIso);
        },
        onBilling: (sub) => {
          setBillingSubscription(sub);
        },
        onDrafts: (cloudDrafts) => {
          if (cloudDrafts.length > 0) {
            setDrafts(cloudDrafts);
            setActiveDraftId((prevId) =>
              cloudDrafts.some((d) => d.id === prevId) ? prevId : cloudDrafts[0].id
            );
          }
        },
        onJobs: (cloudJobs) => {
          setJobs(cloudJobs);
          setActiveJobId((prevId) =>
            prevId && cloudJobs.some((j) => j.id === prevId) ? prevId : cloudJobs[0]?.id ?? null
          );
        },
        onReports: (cloudReports) => {
          setReports(cloudReports);
        },
        onSettings: (cloudSettings) => {
          if (cloudSettings) {
            setAtsSettings(cloudSettings);
          }
        },
      });
    })();

    return () => {
      cancelled = true;
      if (unsubscribeWorkspace) {
        unsubscribeWorkspace();
      }
      if (cloudDraftSyncTimerRef.current !== null) {
        window.clearTimeout(cloudDraftSyncTimerRef.current);
        cloudDraftSyncTimerRef.current = null;
      }
    };
  }, [currentUser]);

  // Apply Daylight / Dark Studio theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveTheme(theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Persist drafts, jobs, reports, settings, and selections to localStorage
  useEffect(() => {
    const persisted = saveDrafts(drafts);
    if (!hasMountedDraftsRef.current) {
      hasMountedDraftsRef.current = true;
      return;
    }
    if (persisted) {
      setShowSaved(true);
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
      savedTimerRef.current = window.setTimeout(() => {
        setShowSaved(false);
      }, 2400);
    }
  }, [drafts]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
      if (cloudDraftSyncTimerRef.current !== null) {
        window.clearTimeout(cloudDraftSyncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    saveJobs(jobs);
  }, [jobs]);

  useEffect(() => {
    saveReports(reports);
  }, [reports]);

  useEffect(() => {
    saveSalaryEstimates(salaryEstimates);
  }, [salaryEstimates]);

  useEffect(() => {
    saveChatHistory(chatMessages);
  }, [chatMessages]);

  useEffect(() => {
    saveAtsSettings(atsSettings);
  }, [atsSettings]);

  useEffect(() => {
    saveActiveSelections({ draftId: activeDraftId, jobId: activeJobId });
  }, [activeDraftId, activeJobId]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const notify = (msg: string) => {
    setToastMessage(msg);
  };

  const handleSignInWithGmail = async () => {
    const user = await signInWithGmail();
    currentUserRef.current = user;
    setLocalGuestMode(false);
    const pending = authPrompt.pendingAction;
    setAuthPrompt({ open: false, reason: '' });
    notify(`Signed in as ${user.email || user.displayName || 'Gmail user'}.`);
    if (pending) {
      window.setTimeout(() => pending(), 150);
    }
  };

  const requireAuth = (reason: string, pendingAction?: () => void): boolean => {
    if (currentUserRef.current) {
      return true;
    }
    setAuthPrompt({ open: true, reason, pendingAction });
    return false;
  };

  const requireEntitlement = (
    authReason: string,
    billingReason: string,
    pendingAction: () => void
  ): boolean => {
    if (
      !requireAuth(authReason, () => {
        const status = computeTrialStatus(
          currentUserRef.current,
          profileCreatedAtRef.current,
          billingSubscriptionRef.current,
          Date.now()
        );
        if (!status.hasActiveAccess) {
          setBillingModal({ open: true, reason: billingReason });
          return;
        }
        pendingAction();
      })
    ) {
      return false;
    }

    const status = computeTrialStatus(
      currentUserRef.current,
      profileCreatedAtRef.current,
      billingSubscriptionRef.current,
      Date.now()
    );
    if (!status.hasActiveAccess) {
      setBillingModal({ open: true, reason: billingReason });
      return false;
    }
    return true;
  };

  const handleSignOut = async () => {
    if (cloudDraftSyncTimerRef.current !== null) {
      window.clearTimeout(cloudDraftSyncTimerRef.current);
      cloudDraftSyncTimerRef.current = null;
    }
    await signOutAccount();
    setProfileCreatedAt(null);
    setBillingSubscription(null);
    setLocalGuestMode(false);
    notify('Signed out of Gmail workspace.');
  };

  const scheduleCloudDraftSync = (updatedDraft: ResumeDraft) => {
    const user = currentUserRef.current;
    if (!user) return;
    if (cloudDraftSyncTimerRef.current !== null) {
      window.clearTimeout(cloudDraftSyncTimerRef.current);
    }
    const uid = user.uid;
    cloudDraftSyncTimerRef.current = window.setTimeout(() => {
      void syncDraftToFirestore(uid, updatedDraft);
    }, 550);
  };

  const updateActiveDraft = (updater: (prev: ResumeDraft) => ResumeDraft) => {
    let nextDraftSnapshot: ResumeDraft | null = null;
    setDrafts((prevList) =>
      prevList.map((d) => {
        if (d.id !== activeDraft.id) return d;
        const updated = { ...updater(d), updatedAt: new Date().toISOString() };
        nextDraftSnapshot = updated;
        return updated;
      })
    );
    if (nextDraftSnapshot) {
      scheduleCloudDraftSync(nextDraftSnapshot);
    }
  };

  const handleUpdateAtsSettings = (next: AtsSettings) => {
    setAtsSettings(next);
    if (currentUserRef.current) {
      void syncAtsSettingsToFirestore(currentUserRef.current.uid, next);
    }
  };

  const handleSelectDesktopTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    if (tab === 'builder') setActiveMobileTab('builder');
    else if (tab === 'ats') setActiveMobileTab('ats');
    else if (tab === 'jobs') setActiveMobileTab('jobs');
    else if (tab === 'templates') setMobileTemplatesSheetOpen(true);
  };

  const handleSelectMobileTab = (tab: MobileTab) => {
    setActiveMobileTab(tab);
    if (tab === 'builder') setActiveTab('builder');
    else if (tab === 'ats') setActiveTab('ats');
    else if (tab === 'jobs') setActiveTab('jobs');
  };

  const handleNewBlankDraft = () => {
    const fresh = createEmptyDraft(`Resume Draft ${drafts.length + 1}`);
    setDrafts((prev) => [fresh, ...prev]);
    setActiveDraftId(fresh.id);
    setActiveTab('builder');
    setActiveMobileTab('builder');
    if (currentUserRef.current) {
      void syncDraftToFirestore(currentUserRef.current.uid, fresh);
    }
    notify('Created new blank resume draft.');
  };

  const handleDuplicateDraft = () => {
    const copy: ResumeDraft = {
      ...JSON.parse(JSON.stringify(activeDraft)),
      id: createId('draft'),
      name: `${activeDraft.name || 'Untitled'} (Copy)`,
      updatedAt: new Date().toISOString(),
    };
    setDrafts((prev) => [copy, ...prev]);
    setActiveDraftId(copy.id);
    if (currentUserRef.current) {
      void syncDraftToFirestore(currentUserRef.current.uid, copy);
    }
    notify('Duplicated active resume draft.');
  };

  const requestDeleteDraft = (draftId: string) => {
    setConfirmDeleteDraftId(draftId);
  };

  const handleConfirmDeleteDraft = () => {
    const draftId = confirmDeleteDraftId;
    if (!draftId) return;
    setConfirmDeleteDraftId(null);

    const remaining = drafts.filter((d) => d.id !== draftId);
    let replacementDraft: ResumeDraft | null = null;
    if (remaining.length === 0) {
      replacementDraft = createEmptyDraft('Untitled Resume');
      setDrafts([replacementDraft]);
      setActiveDraftId(replacementDraft.id);
    } else {
      setDrafts(remaining);
      if (activeDraftId === draftId) {
        setActiveDraftId(remaining[0].id);
      }
    }

    setReports((prev) => {
      const next: Record<string, AtsAnalysisReport> = {};
      for (const [key, val] of Object.entries(prev)) {
        if (val.draftId !== draftId) {
          next[key] = val;
        }
      }
      return next;
    });

    if (currentUserRef.current) {
      const uid = currentUserRef.current.uid;
      void deleteDraftFromFirestore(uid, draftId);
      if (replacementDraft) {
        void syncDraftToFirestore(uid, replacementDraft);
      }
    }

    notify(
      replacementDraft
        ? 'Deleted draft and started a blank resume.'
        : 'Deleted resume draft.'
    );
  };

  const handleExportPdf = () => {
    if (
      !requireEntitlement(
        'Sign in with your Gmail account to start your 3-day free trial and export print-ready PDFs.',
        'Your 3-day free trial has ended. Subscribe to ResumeIQ Pro to export print-ready PDFs.',
        () => window.print()
      )
    ) {
      return;
    }
    window.print();
  };

  const handleExportJson = () => {
    if (
      !requireEntitlement(
        'Sign in with your Gmail account to start your 3-day free trial and export JSON backups.',
        'Your 3-day free trial has ended. Subscribe to ResumeIQ Pro to export JSON backups.',
        () => exportDraftToJsonFile(activeDraft)
      )
    ) {
      return;
    }
    exportDraftToJsonFile(activeDraft);
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImportedDraftJson(text);
      setDrafts((prev) => [imported, ...prev]);
      setActiveDraftId(imported.id);
      if (currentUserRef.current) {
        void syncDraftToFirestore(currentUserRef.current.uid, imported);
      }
      notify(`Imported "${imported.name}".`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to import JSON file.');
    }
  };

  const runAtsAnalysis = async (overrideJobId?: string | null) => {
    if (
      !requireEntitlement(
        'Sign in with your Gmail account to start your 3-day free trial and run ATS compatibility scans.',
        'Your 3-day free trial has ended. Subscribe to ResumeIQ Pro to run unlimited ATS scans.',
        () => {
          void runAtsAnalysis(overrideJobId);
        }
      )
    ) {
      return;
    }

    const targetJobId = overrideJobId !== undefined ? overrideJobId : activeJobId;
    const targetJob = targetJobId ? jobs.find((j) => j.id === targetJobId) ?? null : null;

    setActiveTab('ats');
    setActiveMobileTab('ats');
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      if (atsSettings.engine === 'local-rules') {
        const localReport = runLocalDeterministicAtsCheck(activeDraft, targetJob, atsSettings);
        const cacheKey = getReportCacheKey(activeDraft.id, targetJob?.id ?? null);
        setReports((prev) => ({ ...prev, [cacheKey]: localReport }));
        if (currentUserRef.current) {
          void syncReportToFirestore(currentUserRef.current.uid, localReport);
        }
        return;
      }

      const res = await fetch('/api/ats/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: activeDraft,
          jobTitle: targetJob?.title || '',
          company: targetJob?.company || '',
          jobDescription: targetJob?.description || '',
          settings: atsSettings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'ATS analysis failed.');
      }

      const report: AtsAnalysisReport = {
        draftId: activeDraft.id,
        jobTargetId: targetJob?.id ?? null,
        jobTitleSnapshot: targetJob
          ? `${targetJob.title} · ${targetJob.company}`
          : 'General ATS Best Practices',
        analyzedAt: new Date().toISOString(),
        engineUsed: data.engineUsed || atsSettings.engine,
        overallScore: Number(data.overallScore) || 0,
        verdict: data.verdict || '',
        subScores: data.subScores,
        matchedKeywords: Array.isArray(data.matchedKeywords) ? data.matchedKeywords : [],
        missingKeywords: Array.isArray(data.missingKeywords) ? data.missingKeywords : [],
        atsChecks: Array.isArray(data.atsChecks) ? data.atsChecks : [],
        sectionFeedback: Array.isArray(data.sectionFeedback) ? data.sectionFeedback : [],
        tailoredSummary: data.tailoredSummary || '',
        bulletUpgrades: Array.isArray(data.bulletUpgrades) ? data.bulletUpgrades : [],
      };

      const cacheKey = getReportCacheKey(activeDraft.id, targetJob?.id ?? null);
      setReports((prev) => ({ ...prev, [cacheKey]: report }));
      if (currentUserRef.current) {
        void syncReportToFirestore(currentUserRef.current.uid, report);
      }
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : 'Unable to complete ATS analysis.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddKeywordToSkills = (keyword: string) => {
    updateActiveDraft((prev) => {
      const groups =
        prev.skillGroups.length > 0
          ? prev.skillGroups
          : [{ id: createId('sg'), category: 'Core Skills', skills: [] }];
      const alreadyExists = groups.some((g) =>
        g.skills.some((s) => s.name.toLowerCase() === keyword.toLowerCase())
      );
      if (alreadyExists) return prev;
      return {
        ...prev,
        skillGroups: groups.map((g, idx) =>
          idx === 0
            ? {
                ...g,
                skills: [...g.skills, { name: keyword, proficiency: 'Intermediate' }],
              }
            : g
        ),
      };
    });
    notify(`Added "${keyword}" to Skills.`);
  };

  const handleApplyBulletUpgrade = (
    experienceId: string,
    originalBullet: string,
    improvedBullet: string
  ) => {
    updateActiveDraft((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp) => {
        if (exp.id !== experienceId && !exp.bullets.includes(originalBullet)) {
          return exp;
        }
        const idx = exp.bullets.findIndex(
          (b) => b.trim() === originalBullet.trim()
        );
        if (idx === -1) return exp;
        const nextBullets = [...exp.bullets];
        nextBullets[idx] = improvedBullet;
        return { ...exp, bullets: nextBullets };
      }),
    }));
    notify('Applied AI bullet upgrade to resume.');
  };

  const handleApplyTailoredSummary = (tailoredSummary: string) => {
    updateActiveDraft((prev) => ({
      ...prev,
      summary: tailoredSummary,
    }));
    notify('Updated Professional Summary.');
  };

  const handleSaveJob = (job: JobTarget) => {
    setJobs((prev) => {
      const exists = prev.some((j) => j.id === job.id);
      if (exists) {
        return prev.map((j) => (j.id === job.id ? job : j));
      }
      return [job, ...prev];
    });
    if (currentUserRef.current) {
      void syncJobToFirestore(currentUserRef.current.uid, job);
    }
    notify(`Saved target job "${job.title}".`);
  };

  const handleDeleteJob = (jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    if (activeJobId === jobId) {
      setActiveJobId(null);
    }
    if (currentUserRef.current) {
      void deleteJobFromFirestore(currentUserRef.current.uid, jobId);
    }
    notify('Removed saved target job.');
  };

  // Auth loading gate
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4">
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600 dark:text-slate-300">
          <Loader2 className="w-4 h-4 animate-spin text-blue-700 dark:text-blue-400 shrink-0" />
          <span>Loading ResumeIQ...</span>
        </div>
      </div>
    );
  }

  // Login Page Gate when signed out and not explicitly in local browser mode
  if (!currentUser && !localGuestMode) {
    return (
      <LoginPage
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onSignInWithGmail={handleSignInWithGmail}
        onContinueLocal={() => {
          setLocalGuestMode(true);
          notify('Working in Local Browser Mode.');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportFileChange}
        className="hidden"
      />

      {/* Top Navigation */}
      <TopBar
        activeTab={activeTab}
        onSelectTab={handleSelectDesktopTab}
        onExportPdf={handleExportPdf}
      />

      {/* Workspace Toolbar */}
      <WorkspaceToolbar
        drafts={drafts}
        activeDraft={activeDraft}
        jobs={jobs}
        activeJob={activeJob}
        cachedReport={cachedReport}
        isAnalyzing={isAnalyzing}
        showSaved={showSaved}
        theme={theme}
        user={currentUser}
        trialStatus={trialStatus}
        onToggleTheme={handleToggleTheme}
        onSelectDraft={(id) => setActiveDraftId(id)}
        onSelectJob={(id) => setActiveJobId(id)}
        onNewBlankDraft={handleNewBlankDraft}
        onDuplicateDraft={handleDuplicateDraft}
        onRequestDeleteDraft={() => requestDeleteDraft(activeDraft.id)}
        onExportJson={handleExportJson}
        onTriggerImportJson={() => fileInputRef.current?.click()}
        onRunAnalysis={() => runAtsAnalysis()}
        onOpenTemplatesSheet={() => setMobileTemplatesSheetOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onOpenBilling={() => setBillingModal({ open: true, reason: null })}
        onOpenChat={() => setChatDrawerOpen(true)}
        onSignOut={handleSignOut}
        onOpenLogin={() => setLocalGuestMode(false)}
      />

      {/* Main Content Area */}
      <main className="no-print flex-1 max-w-[1440px] w-full mx-auto px-4 lg:px-6 py-5 pb-24 lg:pb-8">
        {/* Desktop Views (>= lg) */}
        <div className="hidden lg:block">
          {activeTab === 'builder' && (
            <div className="grid grid-cols-12 gap-6 items-start">
              <div className="col-span-6">
                <ResumeEditor
                  draft={activeDraft}
                  activeJob={activeJob}
                  atsSettings={atsSettings}
                  isAuthenticated={Boolean(currentUser)}
                  hasActiveAccess={trialStatus.hasActiveAccess}
                  onRequireAuth={(reason) => setAuthPrompt({ open: true, reason })}
                  onRequireBilling={(reason) => setBillingModal({ open: true, reason })}
                  onOpenSettings={() => setSettingsModalOpen(true)}
                  onChangeDraft={updateActiveDraft}
                  onNotify={notify}
                />
              </div>

              <div className="col-span-6 sticky top-[120px]">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      Live Document Preview
                    </span>
                    <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
                      {(['classic', 'modern', 'technical'] as TemplateId[]).map((tpl) => (
                        <button
                          key={tpl}
                          type="button"
                          onClick={() =>
                            updateActiveDraft((prev) => ({ ...prev, templateId: tpl }))
                          }
                          className={`inline-flex items-center justify-center min-h-[28px] px-2.5 py-1 text-xs font-medium rounded-md capitalize whitespace-nowrap transition-colors cursor-pointer ${
                            activeDraft.templateId === tpl
                              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {tpl}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-100/80 dark:bg-slate-950/90 max-h-[calc(100vh-190px)] overflow-y-auto studio-scroll">
                    <ResumePreview draft={activeDraft} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ats' && (
            <AtsDashboard
              draft={activeDraft}
              activeJob={activeJob}
              report={cachedReport}
              isAnalyzing={isAnalyzing}
              error={analysisError}
              onRunAnalysis={() => runAtsAnalysis()}
              onAddKeywordToSkills={handleAddKeywordToSkills}
              onApplyBulletUpgrade={handleApplyBulletUpgrade}
              onApplyTailoredSummary={handleApplyTailoredSummary}
              onGoToJobs={() => setActiveTab('jobs')}
              onOpenSettings={() => setSettingsModalOpen(true)}
            />
          )}

          {activeTab === 'jobs' && (
            <JobTargetsView
              jobs={jobs}
              activeJobId={activeJobId}
              atsSettings={atsSettings}
              isAuthenticated={Boolean(currentUser)}
              hasActiveAccess={trialStatus.hasActiveAccess}
              salaryEstimates={salaryEstimates}
              onSaveSalaryEstimate={(cacheKey, estimate) => {
                setSalaryEstimates((prev) => ({ ...prev, [cacheKey]: estimate }));
                notify(`Updated salary range for ${estimate.jobTitle}.`);
              }}
              onRequireAuth={(reason) => setAuthPrompt({ open: true, reason })}
              onRequireBilling={(reason) => setBillingModal({ open: true, reason })}
              onSelectJob={(id) => setActiveJobId(id)}
              onSaveJob={handleSaveJob}
              onDeleteJob={handleDeleteJob}
              onRunAtsForJob={(jobId) => {
                setActiveJobId(jobId);
                runAtsAnalysis(jobId);
              }}
            />
          )}

          {activeTab === 'templates' && (
            <div className="grid grid-cols-12 gap-6 items-start">
              <div className="col-span-6">
                <TemplatesAndDraftsView
                  drafts={drafts}
                  activeDraft={activeDraft}
                  onSelectDraft={(id) => setActiveDraftId(id)}
                  onChangeDraft={updateActiveDraft}
                  onNewBlankDraft={handleNewBlankDraft}
                  onDuplicateDraft={handleDuplicateDraft}
                  onDeleteDraft={requestDeleteDraft}
                  onExportJson={handleExportJson}
                  onTriggerImportJson={() => fileInputRef.current?.click()}
                  onExportPdf={handleExportPdf}
                />
              </div>

              <div className="col-span-6 sticky top-[120px]">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Print Sheet Preview · {activeDraft.paperSize.toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                      {activeDraft.templateId} template
                    </span>
                  </div>
                  <div className="bg-slate-100/80 dark:bg-slate-950/90 max-h-[calc(100vh-190px)] overflow-y-auto studio-scroll">
                    <ResumePreview draft={activeDraft} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Views (< lg) */}
        <div className="lg:hidden">
          {activeMobileTab === 'builder' && (
            <ResumeEditor
              draft={activeDraft}
              activeJob={activeJob}
              atsSettings={atsSettings}
              isAuthenticated={Boolean(currentUser)}
              hasActiveAccess={trialStatus.hasActiveAccess}
              onRequireAuth={(reason) => setAuthPrompt({ open: true, reason })}
              onRequireBilling={(reason) => setBillingModal({ open: true, reason })}
              onOpenSettings={() => setSettingsModalOpen(true)}
              onChangeDraft={updateActiveDraft}
              onNotify={notify}
            />
          )}

          {activeMobileTab === 'preview' && (
            <div className="space-y-3">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(['classic', 'modern', 'technical'] as TemplateId[]).map((tpl) => (
                    <button
                      key={tpl}
                      type="button"
                      onClick={() =>
                        updateActiveDraft((prev) => ({ ...prev, templateId: tpl }))
                      }
                      className={`inline-flex items-center justify-center min-h-[30px] px-3 py-1 text-xs font-medium rounded-md capitalize whitespace-nowrap cursor-pointer transition-colors ${
                        activeDraft.templateId === tpl
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {tpl}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Print PDF</span>
                </button>
              </div>
              <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <ResumePreview draft={activeDraft} />
              </div>
            </div>
          )}

          {activeMobileTab === 'ats' && (
            <AtsDashboard
              draft={activeDraft}
              activeJob={activeJob}
              report={cachedReport}
              isAnalyzing={isAnalyzing}
              error={analysisError}
              onRunAnalysis={() => runAtsAnalysis()}
              onAddKeywordToSkills={handleAddKeywordToSkills}
              onApplyBulletUpgrade={handleApplyBulletUpgrade}
              onApplyTailoredSummary={handleApplyTailoredSummary}
              onGoToJobs={() => setActiveMobileTab('jobs')}
              onOpenSettings={() => setSettingsModalOpen(true)}
            />
          )}

          {activeMobileTab === 'jobs' && (
            <JobTargetsView
              jobs={jobs}
              activeJobId={activeJobId}
              atsSettings={atsSettings}
              isAuthenticated={Boolean(currentUser)}
              hasActiveAccess={trialStatus.hasActiveAccess}
              salaryEstimates={salaryEstimates}
              onSaveSalaryEstimate={(cacheKey, estimate) => {
                setSalaryEstimates((prev) => ({ ...prev, [cacheKey]: estimate }));
                notify(`Updated salary range for ${estimate.jobTitle}.`);
              }}
              onRequireAuth={(reason) => setAuthPrompt({ open: true, reason })}
              onRequireBilling={(reason) => setBillingModal({ open: true, reason })}
              onSelectJob={(id) => setActiveJobId(id)}
              onSaveJob={handleSaveJob}
              onDeleteJob={handleDeleteJob}
              onRunAtsForJob={(jobId) => {
                setActiveJobId(jobId);
                runAtsAnalysis(jobId);
              }}
            />
          )}
        </div>
      </main>

      {/* Mobile Templates & Drafts Bottom Sheet */}
      {mobileTemplatesSheetOpen && (
        <div
          className="no-print lg:hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-end"
          role="dialog"
          aria-modal="true"
          aria-label="Templates and Drafts"
        >
          <div className="w-full max-h-[85vh] bg-slate-50 dark:bg-slate-950 rounded-t-3xl flex flex-col overflow-hidden border-t border-slate-200 dark:border-slate-800">
            <div className="pt-3 pb-2 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col items-center">
              <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mb-2" />
              <div className="w-full flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  Templates, Drafts &amp; Export
                </h2>
                <button
                  type="button"
                  onClick={() => setMobileTemplatesSheetOpen(false)}
                  aria-label="Close templates sheet"
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5 shrink-0" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-8">
              <TemplatesAndDraftsView
                drafts={drafts}
                activeDraft={activeDraft}
                onSelectDraft={(id) => {
                  setActiveDraftId(id);
                  setMobileTemplatesSheetOpen(false);
                }}
                onChangeDraft={updateActiveDraft}
                onNewBlankDraft={handleNewBlankDraft}
                onDuplicateDraft={handleDuplicateDraft}
                onDeleteDraft={requestDeleteDraft}
                onExportJson={handleExportJson}
                onTriggerImportJson={() => fileInputRef.current?.click()}
                onExportPdf={handleExportPdf}
              />
            </div>
          </div>
        </div>
      )}

      {/* ATS Check Configuration Modal */}
      <SettingsModal
        open={settingsModalOpen}
        settings={atsSettings}
        onUpdateSettings={handleUpdateAtsSettings}
        onClose={() => setSettingsModalOpen(false)}
        onNotify={notify}
      />

      {/* 3-Day Free Trial & Stripe Billing Modal */}
      <BillingModal
        open={billingModal.open}
        user={currentUser}
        trialStatus={trialStatus}
        subscription={billingSubscription}
        reason={billingModal.reason}
        verifyingCheckout={verifyingCheckout}
        onSignInWithGmail={handleSignInWithGmail}
        onClose={() => setBillingModal({ open: false, reason: null })}
      />

      {/* Career AI Coach Multi-Turn Drawer */}
      <CareerChatDrawer
        open={chatDrawerOpen}
        messages={chatMessages}
        activeDraft={activeDraft}
        activeJob={activeJob}
        autoFallback={atsSettings.autoFallback}
        isAuthenticated={Boolean(currentUser)}
        hasActiveAccess={trialStatus.hasActiveAccess}
        onUpdateMessages={setChatMessages}
        onRequireAuth={(reason) => setAuthPrompt({ open: true, reason })}
        onRequireBilling={(reason) => setBillingModal({ open: true, reason })}
        onClose={() => setChatDrawerOpen(false)}
      />

      {/* Gmail Sign-In Gate Modal */}
      <AuthPromptModal
        open={authPrompt.open}
        reason={authPrompt.reason}
        onSignInWithGmail={handleSignInWithGmail}
        onClose={() => setAuthPrompt({ open: false, reason: '' })}
      />

      {/* Delete Draft Confirmation Modal */}
      {confirmDeleteDraftId && (
        <div
          className="no-print fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm draft deletion"
        >
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Trash2 className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                  Delete Resume Draft?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteDraftId(null)}
                aria-label="Cancel deletion"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5 shrink-0" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                This will permanently remove{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {drafts.find((d) => d.id === confirmDeleteDraftId)?.name || 'this resume draft'}
                </span>
                {drafts.length === 1
                  ? ' and initialize a clean blank resume in its place.'
                  : ' and any cached ATS reports linked to it.'}
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteDraftId(null)}
                  className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteDraft}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-500 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Delete Draft</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Tab Bar */}
      <MobileBottomNav
        activeMobileTab={activeMobileTab}
        onSelectMobileTab={handleSelectMobileTab}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="no-print fixed bottom-16 lg:bottom-6 right-4 lg:right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-800 text-white border border-slate-700 text-xs font-medium rounded-lg shadow-lg"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Dedicated Hidden Print-Only Sheet */}
      <ResumePreview draft={activeDraft} forPrint />
    </div>
  );
}
