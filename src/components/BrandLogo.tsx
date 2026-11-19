import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md' }) => {
  const wrapperClass =
    size === 'sm'
      ? 'inline-flex items-center shrink-0 rounded-md bg-slate-950 dark:bg-transparent px-2 py-1 dark:px-0 dark:py-0'
      : 'inline-flex items-center shrink-0 rounded-lg bg-slate-950 dark:bg-transparent px-2.5 py-1 dark:px-0 dark:py-0';

  const imgClass =
    size === 'sm'
      ? 'h-6 w-auto max-w-[148px] object-contain object-left shrink-0'
      : 'h-7 sm:h-8 w-auto max-w-[190px] object-contain object-left shrink-0';

  return (
    <span className={wrapperClass}>
      <img
        src="/assets/aistudio/image_2cd15568.png"
        alt="ResumeIQ AI"
        className={imgClass}
      />
    </span>
  );
};
