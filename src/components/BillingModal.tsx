import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { saveBillingSubscriptionToFirestore } from '../services/firestoreSync';
import {
  BillingPlanId,
  BillingSubscription,
  PaymentMethodType,
  TrialStatusInfo,
} from '../types/resume';

interface BillingModalProps {
  open: boolean;
  user: User | null;
  trialStatus: TrialStatusInfo;
  subscription: BillingSubscription | null;
  reason?: string | null;
  onSignInWithGmail: () => Promise<void>;
  onSubscriptionActivated: (subscription: BillingSubscription) => void;
  onClose: () => void;
}

const PLAN_OPTIONS: Array<{
  id: BillingPlanId;
  name: string;
  price: string;
  period: string;
  note: string;
  savingsLabel?: string;
}> = [
  {
    id: 'monthly',
    name: 'Monthly Pro',
    price: '₹149',
    period: '/ month',
    note: 'Flexible month-to-month access while actively interviewing.',
  },
  {
    id: 'annual',
    name: 'Annual Pro',
    price: '₹1,199',
    period: '/ year',
    note: 'Best value for ongoing career tracking & role tailoring.',
    savingsLabel: 'Save 33% (~₹100/mo)',
  },
];

const PAYMENT_METHODS: Array<{
  id: PaymentMethodType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'upi', label: 'UPI', icon: Smartphone },
  { id: 'card', label: 'Card', icon: CreditCard },
  { id: 'netbanking', label: 'NetBanking', icon: Building2 },
];

const NETBANKING_BANKS = [
  'HDFC Bank',
  'ICICI Bank',
  'State Bank of India',
  'Axis Bank',
  'Kotak Mahindra Bank',
];

const PRO_BENEFITS = [
  'Unlimited Gemini ATS compatibility scans & keyword gap breakdowns',
  'One-click AI bullet point optimization & role-tailored summaries',
  'Unlimited ATS-parseable vector PDF & JSON resume exports',
  'Multi-device cloud sync for drafts, job targets & reports',
];

function formatDateLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPaymentMethodLabel(method: PaymentMethodType | undefined): string {
  if (method === 'card') return 'Card';
  if (method === 'netbanking') return 'NetBanking';
  return 'UPI';
}

export const BillingModal: React.FC<BillingModalProps> = ({
  open,
  user,
  trialStatus,
  subscription,
  reason,
  onSignInWithGmail,
  onSubscriptionActivated,
  onClose,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanId>('annual');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('upi');
  const [upiId, setUpiId] = useState('');
  const [cardLabel, setCardLabel] = useState('');
  const [bankName, setBankName] = useState(NETBANKING_BANKS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    if (subscription?.plan) {
      setSelectedPlan(subscription.plan);
    }
    if (subscription?.paymentMethod) {
      setPaymentMethod(subscription.paymentMethod);
    }
  }, [open, subscription]);

  if (!open) return null;

  const handleSubscribe = async () => {
    if (!user) return;
    setErrorMsg(null);

    const detail =
      paymentMethod === 'upi'
        ? upiId.trim()
        : paymentMethod === 'card'
        ? cardLabel.trim()
        : bankName.trim();

    if (paymentMethod === 'upi' && !/^[^\s@]+@[^\s@]{2,}$/.test(detail)) {
      setErrorMsg('Please enter a valid UPI ID (for example, name@okaxis).');
      return;
    }
    if (paymentMethod === 'card' && detail.length < 4) {
      setErrorMsg('Please enter the cardholder name or last 4 card digits.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: selectedPlan,
          uid: user.uid,
          paymentMethod,
          paymentDetail: detail,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.subscription) {
        throw new Error(data?.error || 'Could not activate subscription.');
      }

      await saveBillingSubscriptionToFirestore(user.uid, data.subscription);
      onSubscriptionActivated({
        ownerId: user.uid,
        ...data.subscription,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to activate subscription.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignInClick = async () => {
    setErrorMsg(null);
    setSigningIn(true);
    try {
      await onSignInWithGmail();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in with Gmail.');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ResumeIQ 3-Day Trial and Pro Subscription"
    >
      <div className="w-full sm:max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <CreditCard className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                ResumeIQ Trial &amp; Pro Plan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                3-day full-access free trial for every Gmail account, then simple INR subscription billing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close billing modal"
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5 shrink-0" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 studio-scroll">
          {reason && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/70 rounded-xl text-xs text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
              <span>{reason}</span>
            </div>
          )}

          {/* Entitlement Status Summary */}
          <div className="px-4 py-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
            {!user ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    3-Day Free Trial Ready
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Sign in with Gmail to activate your 72-hour free trial with full AI ATS scans and PDF exports.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignInClick}
                  disabled={signingIn}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  {signingIn && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  <span>Sign in with Gmail</span>
                </button>
              </div>
            ) : trialStatus.hasPaidSubscription && subscription ? (
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ResumeIQ Pro Active ({subscription.plan === 'annual' ? 'Annual' : 'Monthly'} ·{' '}
                      {formatPaymentMethodLabel(subscription.paymentMethod)})
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Signed in as {user.email || user.displayName} · Valid through{' '}
                      <span className="font-mono">{formatDateLabel(subscription.expiresAt)}</span>
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
                  Active
                </span>
              </div>
            ) : trialStatus.isTrialActive ? (
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <Clock className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      3-Day Free Trial Active ·{' '}
                      {trialStatus.daysRemaining > 0
                        ? `${trialStatus.daysRemaining}d ${trialStatus.hoursRemaining % 24}h remaining`
                        : `${trialStatus.hoursRemaining}h remaining`}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Trial ends on <span className="font-mono">{formatDateLabel(trialStatus.trialEndsAt)}</span>.
                      Subscribe anytime to keep uninterrupted AI scans &amp; PDF exports.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Your 3-Day Free Trial Has Ended
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    You can still view and edit your resume drafts anytime. Subscribe to ResumeIQ Pro below to unlock ATS scans, AI rewrites, and PDF/JSON exports.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Plan Cards */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Choose Subscription Plan
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLAN_OPTIONS.map((plan) => {
                const selected = selectedPlan === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`flex flex-col justify-between h-full text-left p-4 rounded-xl border transition-colors cursor-pointer space-y-2 ${
                      selected
                        ? 'border-blue-700 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="space-y-2 w-full">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {plan.name}
                        </span>
                        {plan.savingsLabel && (
                          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                            {plan.savingsLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1 tabular-nums">
                        <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                          {plan.price}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{plan.period}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {plan.note}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Standard Payment Method Selection */}
          {user && (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Payment Method
                </h3>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>Instant account activation</span>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((pm) => {
                  const Icon = pm.icon;
                  const active = paymentMethod === pm.id;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(pm.id);
                        setErrorMsg(null);
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'border-blue-700 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{pm.label}</span>
                    </button>
                  );
                })}
              </div>

              {paymentMethod === 'upi' && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="billing-upi-input"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    UPI ID (GPay, PhonePe, Paytm, BHIM)
                  </label>
                  <input
                    id="billing-upi-input"
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="yourname@okaxis"
                    className="w-full h-[38px] px-3 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="billing-card-input"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Cardholder Name or Card Reference
                  </label>
                  <input
                    id="billing-card-input"
                    type="text"
                    value={cardLabel}
                    onChange={(e) => setCardLabel(e.target.value)}
                    placeholder="Name on card (e.g. Nilesh Chikhle)"
                    className="w-full h-[38px] px-3 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}

              {paymentMethod === 'netbanking' && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="billing-bank-select"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Select Bank
                  </label>
                  <select
                    id="billing-bank-select"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full h-[38px] px-3 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    {NETBANKING_BANKS.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Included Features */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 shrink-0" />
              <span>Included in 3-Day Free Trial &amp; Pro</span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRO_BENEFITS.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {errorMsg && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center min-h-[38px] px-4 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            Close
          </button>

          {user && (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 dark:disabled:text-slate-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Activating Plan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {trialStatus.hasPaidSubscription
                      ? selectedPlan === 'annual'
                        ? 'Switch / Renew Annual · ₹1,199/yr'
                        : 'Switch / Renew Monthly · ₹149/mo'
                      : selectedPlan === 'annual'
                      ? 'Subscribe Now · ₹1,199/yr'
                      : 'Subscribe Now · ₹149/mo'}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
