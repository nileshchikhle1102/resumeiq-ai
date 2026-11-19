import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Loader2,
  MessageSquare,
  Send,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { createId } from '../data/defaultData';
import {
  ChatMessage,
  ChatModelId,
  ChatRolePersona,
  JobTarget,
  ResumeDraft,
} from '../types/resume';

interface CareerChatDrawerProps {
  open: boolean;
  messages: ChatMessage[];
  activeDraft: ResumeDraft;
  activeJob: JobTarget | null;
  autoFallback: boolean;
  isAuthenticated: boolean;
  hasActiveAccess: boolean;
  onUpdateMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  onRequireAuth: (reason: string) => void;
  onRequireBilling: (reason: string) => void;
  onClose: () => void;
}

const PERSONAS: Array<{
  id: ChatRolePersona;
  label: string;
  description: string;
  starters: string[];
}> = [
  {
    id: 'ats_strategist',
    label: 'ATS Strategist',
    description: 'Tighten bullets, audit keyword gaps, and keep claims factual.',
    starters: [
      'Which 3 bullets in my active draft need stronger quantification?',
      'What critical skills from my target job are missing or buried?',
      'Review my professional summary for recruiter clarity in 20 seconds.',
    ],
  },
  {
    id: 'interview_coach',
    label: 'Interview Coach',
    description: 'Practice tailored behavioral & technical questions with STAR critique.',
    starters: [
      'Ask me a realistic system-design or impact question based on my top role.',
      'Challenge me on a likely weakness or gap between my resume and target job.',
      'Run a 3-question mock screening interview one question at a time.',
    ],
  },
  {
    id: 'salary_negotiator',
    label: 'Salary Advisor',
    description: 'Plan counter-offers, total-comp trade-offs, and recruiter scripts.',
    starters: [
      'Draft a polite email delaying salary expectations until after interviews.',
      'How should I frame my experience to justify the top quartile compensation band?',
      'Write a counter-offer script emphasizing equity + base flexibility.',
    ],
  },
];

const CHAT_MODELS: Array<{ id: ChatModelId; label: string; hint: string }> = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    hint: 'Balanced reasoning & career strategy',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    hint: 'Ultra-fast responses',
  },
];

export const CareerChatDrawer: React.FC<CareerChatDrawerProps> = ({
  open,
  messages,
  activeDraft,
  activeJob,
  autoFallback,
  isAuthenticated,
  hasActiveAccess,
  onUpdateMessages,
  onRequireAuth,
  onRequireBilling,
  onClose,
}) => {
  const [persona, setPersona] = useState<ChatRolePersona>('ats_strategist');
  const [model, setModel] = useState<ChatModelId>('gemini-4-hydrogen');
  const [shareContext, setShareContext] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, messages.length, sending]);

  if (!open) return null;

  const activePersona = PERSONAS.find((p) => p.id === persona) ?? PERSONAS[0];

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;

    if (!isAuthenticated) {
      onRequireAuth('Sign in with your Gmail account to chat with the ResumeIQ Career Coach.');
      return;
    }
    if (!hasActiveAccess) {
      onRequireBilling(
        'Your 3-day free trial has ended. Subscribe to ResumeIQ Pro to continue using the AI Career Coach.'
      );
      return;
    }

    setErrorMsg(null);
    if (!textOverride) {
      setInput('');
    }

    const userMsg: ChatMessage = {
      id: createId('msg'),
      role: 'user',
      text,
      createdAt: new Date().toISOString(),
    };

    const historySnapshot = messages.slice(-24).map((m) => ({ role: m.role, text: m.text }));
    onUpdateMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historySnapshot,
          persona,
          model,
          autoFallback,
          resume: shareContext ? activeDraft : null,
          jobTitle: shareContext ? activeJob?.title : undefined,
          company: shareContext ? activeJob?.company : undefined,
          location: shareContext ? activeJob?.location : undefined,
          jobDescription: shareContext ? activeJob?.description : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.reply) {
        throw new Error(data?.error || 'Unable to generate chat response.');
      }

      const modelMsg: ChatMessage = {
        id: createId('msg'),
        role: 'model',
        text: String(data.reply),
        createdAt: new Date().toISOString(),
        modelUsed: String(data.modelUsed || model),
      };
      onUpdateMessages((prev) => [...prev, modelMsg]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Chat request failed.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="ResumeIQ Career AI Coach"
    >
      <div className="w-full sm:w-[460px] lg:w-[500px] h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <MessageSquare className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                Career AI Coach
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {activePersona.label} · Multi-turn Gemini session
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onUpdateMessages(() => []);
                  setErrorMsg(null);
                }}
                title="Clear conversation history"
                className="inline-flex items-center justify-center gap-1 min-h-[34px] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-700 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Clear</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Career AI Coach"
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>
          </div>
        </div>

        {/* Role Persona & Model Controls */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
            {PERSONAS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPersona(item.id)}
                className={`inline-flex items-center justify-center min-h-[32px] px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  persona === item.id
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="chat-model-select"
                className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
              >
                Model
              </label>
              <select
                id="chat-model-select"
                value={model}
                onChange={(e) => setModel(e.target.value as ChatModelId)}
                className="min-h-[32px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-medium text-slate-800 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {CHAT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="inline-flex items-center gap-1.5 min-h-[32px] text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={shareContext}
                onChange={(e) => setShareContext(e.target.checked)}
                className="w-3.5 h-3.5 shrink-0 rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600"
              />
              <span>Include active draft &amp; job</span>
            </label>
          </div>
        </div>

        {/* Scrollable Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 studio-scroll">
          {messages.length === 0 ? (
            <div className="space-y-4 py-2">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Role: {activePersona.label}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {activePersona.description}
                </p>
                {shareContext && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                    Context attached: <span className="font-medium">{activeDraft.name}</span>
                    {activeJob ? ` · Target: ${activeJob.title}` : ''}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Suggested Prompts
                </p>
                {activePersona.starters.map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    onClick={() => void sendMessage(promptText)}
                    className="w-full text-left px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl transition-colors cursor-pointer"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isUser
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950'
                        : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                    }`}
                  >
                    {isUser ? (
                      <UserIcon className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Bot className="w-3.5 h-3.5 shrink-0" />
                    )}
                  </div>

                  <div
                    className={`max-w-[82%] flex flex-col space-y-1 ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`px-3.5 py-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap text-left ${
                        isUser
                          ? 'bg-blue-700 dark:bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {msg.text}
                    </div>
                    {msg.modelUsed && (
                      <span className="block text-[10px] text-slate-400 dark:text-slate-500 px-1">
                        {msg.modelUsed}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {sending && (
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
              <div className="px-3.5 py-2.5 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                Thinking...
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="px-3.5 py-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {/* Sticky Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
          className="p-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-2"
        >
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={`Ask ${activePersona.label} anything...`}
              className="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-xl resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-4 h-4 shrink-0" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Press Enter to send · Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
};
