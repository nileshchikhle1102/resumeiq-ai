import React from 'react';
import { Check, Copy, Download, FilePlus2, Printer, Trash2, Upload } from 'lucide-react';
import {
  AccentColorId,
  FontScale,
  PaperSize,
  ResumeDraft,
  TemplateId,
} from '../types/resume';

interface TemplatesAndDraftsViewProps {
  drafts: ResumeDraft[];
  activeDraft: ResumeDraft;
  onSelectDraft: (draftId: string) => void;
  onChangeDraft: (updater: (prev: ResumeDraft) => ResumeDraft) => void;
  onNewBlankDraft: () => void;
  onDuplicateDraft: () => void;
  onDeleteDraft: (draftId: string) => void;
  onExportJson: () => void;
  onTriggerImportJson: () => void;
  onExportPdf: () => void;
}

const TEMPLATES: Array<{
  id: TemplateId;
  name: string;
  subtitle: string;
  description: string;
}> = [
  {
    id: 'modern',
    name: 'Modern Precision',
    subtitle: 'Left-aligned · Clean Sans',
    description:
      'Crisp hierarchy with bold accent rule, ideal for product, design, and software roles.',
  },
  {
    id: 'classic',
    name: 'Classic Executive',
    subtitle: 'Centered · Traditional Serif',
    description:
      'Authoritative editorial typography tailored for leadership, finance, and enterprise roles.',
  },
  {
    id: 'technical',
    name: 'Compact Technical',
    subtitle: 'High-Density · Monospace Dates',
    description:
      'Structured stack alignment and tabular dates to maximize single-page engineering density.',
  },
];

const ACCENT_COLORS: Array<{ id: AccentColorId; label: string; swatch: string }> = [
  { id: 'cobalt', label: 'Cobalt', swatch: 'bg-blue-700' },
  { id: 'slate', label: 'Slate', swatch: 'bg-slate-900 dark:bg-slate-200' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-700' },
  { id: 'indigo', label: 'Indigo', swatch: 'bg-indigo-700' },
];

export const TemplatesAndDraftsView: React.FC<TemplatesAndDraftsViewProps> = ({
  drafts,
  activeDraft,
  onSelectDraft,
  onChangeDraft,
  onNewBlankDraft,
  onDuplicateDraft,
  onDeleteDraft,
  onExportJson,
  onTriggerImportJson,
  onExportPdf,
}) => {
  return (
    <div className="space-y-5">
      {/* Template Switcher */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              ATS-Safe Resume Templates
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Single-column vector text layouts engineered for 100% ATS text extraction.
            </p>
          </div>
          <button
            type="button"
            onClick={onExportPdf}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 text-sm font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Export Print-Ready PDF</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TEMPLATES.map((tpl) => {
            const isSelected = activeDraft.templateId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() =>
                  onChangeDraft((prev) => ({ ...prev, templateId: tpl.id }))
                }
                className={`text-left p-4 rounded-xl border transition-colors cursor-pointer space-y-2 ${
                  isSelected
                    ? 'border-blue-700 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {tpl.name}
                  </span>
                  {isSelected && (
                    <Check className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                  )}
                </div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {tpl.subtitle}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {tpl.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Typography, Accent & Paper Size */}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="min-w-0">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              Accent Ink
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {ACCENT_COLORS.map((color) => {
                const active = activeDraft.accentColor === color.id;
                return (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() =>
                      onChangeDraft((prev) => ({ ...prev, accentColor: color.id }))
                    }
                    className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer whitespace-nowrap ${
                      active
                        ? 'border-slate-900 dark:border-slate-300 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color.swatch}`} />
                    <span>{color.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              Type Density
            </span>
            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg max-w-full">
              {(['compact', 'standard', 'comfortable'] as FontScale[]).map((scale) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() =>
                    onChangeDraft((prev) => ({ ...prev, fontScale: scale }))
                  }
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer whitespace-nowrap ${
                    activeDraft.fontScale === scale
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {scale}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              Paper Format
            </span>
            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg max-w-full">
              {([
                { id: 'letter', label: 'US Letter' },
                { id: 'a4', label: 'A4' },
              ] as Array<{ id: PaperSize; label: string }>).map((paper) => (
                <button
                  key={paper.id}
                  type="button"
                  onClick={() =>
                    onChangeDraft((prev) => ({ ...prev, paperSize: paper.id }))
                  }
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    activeDraft.paperSize === paper.id
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {paper.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Local Storage Drafts & JSON Portability */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Saved Local Drafts &amp; JSON Backup
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Stored automatically in your browser. Export JSON anytime to transfer across devices.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onNewBlankDraft}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>Blank Draft</span>
            </button>
            <button
              type="button"
              onClick={onDuplicateDraft}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate Active</span>
            </button>
            <button
              type="button"
              onClick={onExportJson}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={onTriggerImportJson}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import JSON</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
          {drafts.map((d) => {
            const isActive = d.id === activeDraft.id;
            return (
              <div
                key={d.id}
                className={`p-3.5 flex items-center justify-between gap-3 ${
                  isActive ? 'bg-blue-50/40 dark:bg-blue-950/30' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectDraft(d.id)}
                  className="text-left min-w-0 flex-1 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {d.name || 'Untitled Resume'}
                    </span>
                    {isActive && (
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 shrink-0">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    {d.templateId} · {d.paperSize.toUpperCase()} · Updated{' '}
                    {new Date(d.updatedAt).toLocaleDateString()}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => onDeleteDraft(d.id)}
                  title="Delete draft"
                  aria-label={`Delete ${d.name || 'draft'}`}
                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
