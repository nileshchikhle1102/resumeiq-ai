import React, { useId } from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md' }) => {
  const uid = useId().replace(/:/g, '');
  const loopGradId = `riq-loop-${uid}`;
  const legGradId = `riq-leg-${uid}`;
  const glowGradId = `riq-glow-${uid}`;

  const iconSize = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const wordmarkSize = size === 'sm' ? 'text-[17px]' : 'text-[20px]';
  const badgeSize = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]';

  return (
    <span
      className="inline-flex items-center gap-2 shrink-0 bg-transparent select-none"
      aria-label="ResumeIQ AI"
    >
      {/* Transparent Vector R + Sparkle Mark */}
      <svg
        viewBox="0 0 64 64"
        fill="none"
        className={`${iconSize} shrink-0`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={loopGradId} x1="10" y1="12" x2="54" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00E5FF" />
            <stop offset="52%" stopColor="#25A3FF" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
          <linearGradient id={legGradId} x1="33" y1="36" x2="52" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00E5FF" />
            <stop offset="50%" stopColor="#22A7FF" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
          <radialGradient id={glowGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#38BDF8" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="31" cy="28" r="10.5" fill={`url(#${glowGradId})`} />

        <path
          d="M12 14.5H36.5C45 14.5 51 20.2 51 28C51 35.8 45 41.5 36.5 41.5H12"
          stroke={`url(#${loopGradId})`}
          strokeWidth="5.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M34 39L50 55.5"
          stroke={`url(#${legGradId})`}
          strokeWidth="5.8"
          strokeLinecap="round"
        />

        <path
          d="M31 23.4L32.3 26.7L35.6 28L32.3 29.3L31 32.6L29.7 29.3L26.4 28L29.7 26.7L31 23.4Z"
          className="fill-sky-100 dark:fill-white"
        />
        <circle cx="31" cy="28" r="1.8" fill="#0EA5E9" />
      </svg>

      {/* Theme-Adaptive Transparent Wordmark */}
      <span className={`inline-flex items-center gap-1.5 font-display font-bold tracking-tight leading-none ${wordmarkSize}`}>
        <span className="text-slate-900 dark:text-white">Resume</span>
        <span className="bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 dark:from-cyan-400 dark:via-sky-400 dark:to-indigo-400 bg-clip-text text-transparent">
          IQ
        </span>
        <span
          className={`inline-flex items-center justify-center rounded-full border border-indigo-500/75 dark:border-indigo-400/80 bg-indigo-500/10 dark:bg-indigo-400/15 font-semibold tracking-wide text-indigo-700 dark:text-indigo-200 leading-none ${badgeSize}`}
        >
          AI
        </span>
      </span>
    </span>
  );
};
