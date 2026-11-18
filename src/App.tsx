import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { CheckCircle2, Loader2, Printer, Trash2, X } from 'lucide-react';
import { AtsDashboard } from './components/AtsDashboard';
import { AuthPromptModal } from './components/AuthPromptModal';
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
  JobTarget,
  MobileTab,
  ResumeDraft,
  TemplateId,
  WorkspaceTab,
} from './types/resume';
import { runLocalDeterministicAtsCheck } from './utils/localAtsEngine';
import {
  exportDraftToJsonFile,
  getReportCacheKey,
  loadActiveSelections,
  loadAtsSettings,
  loadDrafts,
  loadJobs,
  loadReports,
  loadTheme,
  parseImportedDraftJson,
  saveActiveSelections,
  saveAtsSettings,
  saveDrafts,
  saveJobs,
  saveReports,
  saveTheme,
  StudioTheme,
} from './utils/storage';

export default function App() {
  const [theme, setTheme] = useState<StudioTheme>(() => loadTheme());
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [localGuestMode, setLocalGuestMode] = useState(false);

  const [drafts, setDrafts] = useState<ResumeDraft[]>(() => loadDrafts());
  const [jobs, setJobs] = useState<JobTarget[]>(() => loadJobs());
  const [reports, setReports] = useState<Record<string, AtsAnalysisReport>>(() => loadReports());
  const [atsSettings, setAtsSettings] = useState<AtsSettings>(() => loadAtsSettings());

  const initialSelections = loadActiveSelections(drafts, jobs);
  const [activeDraftId, setActiveDraftId] = useState<string>(initialSelections.draftId);
  const [activeJobId, setActiveJobId] = useState<string | null>(initialSelections.jobId);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('builder');
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('builder');
  const [mobileTemplatesSheetOpen, setMobileTemplatesSheetOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
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

  const activeDraft = drafts.find((d) => d.id === activeDraftId) ?? drafts[0];
  const activeJob = activeJobId ? jobs.find((j) => j.id === activeJobId) ?? null : null;

  const reportCacheKey = getReportCacheKey(activeDraft.id, activeJob?.id ?? null);
  const cachedReport = reports[reportCacheKey] ?? null;

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    atsSettingsRef.current = atsSettings;
  }, [atsSettings]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (user) {
        setLocalGuestMode(false);
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

  const handleSignOut = async () => {
    if (cloudDraftSyncTimerRef.current !== null) {
      window.clearTimeout(cloudDraftSyncTimerRef.current);
      cloudDraftSyncTimerRef.current = null;
    }
    await signOutAccount();
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
      !requireAuth(
        'Sign in with your Gmail account to export your resume as a print-ready PDF.',
        () => window.print()
      )
    ) {
      return;
    }
    window.print();
  };

  const handleExportJson = () => {
    if (
      !requireAuth(
        'Sign in with your Gmail account to export your resume JSON backup.',
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
      !requireAuth(
        'Sign in with your Gmail account to run an ATS compatibility scan and generate keyword recommendations.',
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
          <Loader2 className="w-4 h-4 animate-spin text-blue-700 dark:text-blue-400" />
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
                  onRequireAuth={(reason) => setAuthPrompt({ open: true, reason })}
                  onOpenSettings={() => setSettingsModalOpen(true)}
                  onChangeDraft={updateActiveDraft}
                  onNotify={notify}
                />
              </div>

              <div className="col-span-6 sticky top-[120px]">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Live Document Preview
                    </span>
                    <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      {(['classic', 'modern', 'technical'] as TemplateId[]).map((tpl) => (
                        <button
                          key={tpl}
                          type="button"
                          onClick={() =>
                            updateActiveDraft((prev) => ({ ...prev, templateId: tpl }))
                          }
                          className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
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
              onRequireAuth={(reason) => setAuthPrompt({ open: true, reason })}
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
                      className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize ${
                        activeDraft.templateId === tpl
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tpl}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 rounded-lg"
                >
                  <Printer className="w-3.5 h-3.5" />
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
              <div className="w-full flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Templates, Drafts &amp; Export
                </h2>
                <button
                  type="button"
                  onClick={() => setMobileTemplatesSheetOpen(false)}
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
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
              <div className="flex items-center gap-2.5">
                <Trash2 className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Delete Resume Draft?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteDraftId(null)}
                aria-label="Cancel deletion"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
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
                  className="min-h-[40px] px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteDraft}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-500 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
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
