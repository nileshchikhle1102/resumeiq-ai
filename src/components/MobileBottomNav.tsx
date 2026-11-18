import React from 'react';
import { Briefcase, FileEdit, FileText, Gauge } from 'lucide-react';
import { MobileTab } from '../types/resume';

interface MobileBottomNavProps {
  activeMobileTab: MobileTab;
  onSelectMobileTab: (tab: MobileTab) => void;
}

const MOBILE_TABS: Array<{
  id: MobileTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'builder', label: 'Builder', icon: FileEdit },
  { id: 'preview', label: 'Preview', icon: FileText },
  { id: 'ats', label: 'ATS Score', icon: Gauge },
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeMobileTab,
  onSelectMobileTab,
}) => {
  return (
    <nav
      aria-label="Mobile navigation"
      className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe transition-colors"
    >
      <div className="grid grid-cols-4 h-[52px]">
        {MOBILE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeMobileTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectMobileTab(tab.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] transition-colors cursor-pointer ${
                isActive
                  ? 'text-blue-700 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[11px] font-medium leading-none mt-1 whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
