import React from 'react';
import { Printer } from 'lucide-react';
import { WorkspaceTab } from '../types/resume';
import { BrandLogo } from './BrandLogo';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onExportPdf: () => void;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'builder', label: 'Builder' },
  { id: 'ats', label: 'ATS Score' },
  { id: 'jobs', label: 'Job Match' },
  { id: 'templates', label: 'Templates' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onExportPdf,
}) => {
  return (
    <header className="no-print sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* Desktop 3-Zone Top Bar Contract */}
      <div className="hidden lg:flex items-center justify-between gap-8 max-w-[1440px] mx-auto px-6 h-14">
        <a
          href="#builder"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('builder');
          }}
          className="whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
        >
          <BrandLogo size="md" />
        </a>

        <nav className="flex items-center gap-7" aria-label="Workspace sections">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded ${
                  isActive
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 right-0 bottom-0 h-0.5 bg-blue-700 dark:bg-blue-500 rounded-full"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onExportPdf}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            <Printer className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Mobile Compact Header (44px height to stay strictly within 15% mobile sticky cap) */}
      <div className="flex lg:hidden items-center justify-between gap-4 px-4 h-11">
        <BrandLogo size="sm" />
        <button
          type="button"
          onClick={onExportPdf}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-semibold text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 active:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Export PDF</span>
        </button>
      </div>
    </header>
  );
};
