import React, { useEffect, useRef, useState } from 'react';
import { AccentColorId, FontScale, ResumeDraft } from '../types/resume';

interface ResumePreviewProps {
  draft: ResumeDraft;
  forPrint?: boolean;
}

const ACCENT_HEX: Record<AccentColorId, { primary: string; subtle: string }> = {
  slate: { primary: '#0f172a', subtle: '#475569' },
  cobalt: { primary: '#1d4ed8', subtle: '#1e40af' },
  emerald: { primary: '#047857', subtle: '#065f46' },
  indigo: { primary: '#4338ca', subtle: '#3730a3' },
};

const SCALE_CLASSES: Record<FontScale, { body: string; heading: string; name: string }> = {
  compact: { body: 'text-[10.5px] leading-[1.42]', heading: 'text-[11px]', name: 'text-[22px]' },
  standard: { body: 'text-[11.5px] leading-[1.48]', heading: 'text-[12px]', name: 'text-[25px]' },
  comfortable: { body: 'text-[12.5px] leading-[1.52]', heading: 'text-[13px]', name: 'text-[27px]' },
};

export const ResumePreview: React.FC<ResumePreviewProps> = ({ draft, forPrint = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const pageWidthPx = draft.paperSize === 'a4' ? 794 : 816;
  const pageMinHeightPx = draft.paperSize === 'a4' ? 1123 : 1056;
  const [sheetHeightPx, setSheetHeightPx] = useState(pageMinHeightPx);

  useEffect(() => {
    if (forPrint) {
      setScale(1);
      return;
    }

    const updateMeasurements = () => {
      if (containerRef.current) {
        const availableWidth = containerRef.current.clientWidth - 24;
        if (availableWidth > 0) {
          const nextScale = Math.min(1, availableWidth / pageWidthPx);
          setScale(nextScale);
        }
      }
      if (sheetRef.current) {
        const measured = Math.max(pageMinHeightPx, sheetRef.current.scrollHeight);
        setSheetHeightPx(measured);
      }
    };

    updateMeasurements();
    const observer = new ResizeObserver(updateMeasurements);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    if (sheetRef.current) {
      observer.observe(sheetRef.current);
    }
    window.addEventListener('resize', updateMeasurements);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateMeasurements);
    };
  }, [pageWidthPx, pageMinHeightPx, forPrint, draft]);

  const accent = ACCENT_HEX[draft.accentColor] ?? ACCENT_HEX.cobalt;
  const typo = SCALE_CLASSES[draft.fontScale] ?? SCALE_CLASSES.standard;
  const info = draft.personalInfo;

  const contactParts = [
    info.email,
    info.phone,
    info.location,
    info.linkedin,
    info.website,
  ].filter((v) => v && v.trim().length > 0);

  const isClassic = draft.templateId === 'classic';
  const isTechnical = draft.templateId === 'technical';

  const sheetContent = (
    <div
      ref={forPrint ? undefined : sheetRef}
      id={forPrint ? 'resume-print-sheet' : undefined}
      style={{
        width: `${pageWidthPx}px`,
        minHeight: `${pageMinHeightPx}px`,
        fontFamily: isClassic
          ? 'Georgia, Cambria, "Times New Roman", Times, serif'
          : 'var(--font-sans)',
      }}
      className={`bg-white text-slate-900 px-12 py-10 ${typo.body} ${
        forPrint ? '' : 'shadow-sm border border-slate-200 dark:border-slate-700'
      }`}
    >
      {/* Header Block */}
      <header
        className={
          isClassic
            ? 'text-center pb-4 border-b border-slate-300'
            : 'pb-4 border-b-2'
        }
        style={!isClassic ? { borderColor: accent.primary } : undefined}
      >
        <h1
          className={`${typo.name} font-bold tracking-tight text-slate-950 leading-tight`}
          style={
            !isClassic
              ? { fontFamily: 'var(--font-display)', color: '#0f172a' }
              : undefined
          }
        >
          {info.fullName || 'Your Name'}
        </h1>
        {info.headline && (
          <p
            className="mt-1 font-medium text-[13px]"
            style={{ color: isClassic ? '#334155' : accent.primary }}
          >
            {info.headline}
          </p>
        )}
        {contactParts.length > 0 && (
          <p
            className={`mt-2 text-[11px] text-slate-600 flex flex-wrap gap-x-2 gap-y-0.5 ${
              isClassic ? 'justify-center' : 'justify-start'
            } ${isTechnical ? 'font-mono text-[10.5px]' : ''}`}
          >
            {contactParts.map((part, idx) => (
              <React.Fragment key={`${part}-${idx}`}>
                {idx > 0 && <span aria-hidden="true">·</span>}
                <span>{part}</span>
              </React.Fragment>
            ))}
          </p>
        )}
      </header>

      {/* Summary */}
      {draft.summary.trim() && (
        <section className="mt-4">
          <h2
            className={`${typo.heading} font-bold tracking-wider uppercase pb-1 border-b border-slate-200`}
            style={{ color: isClassic ? '#0f172a' : accent.primary }}
          >
            Professional Summary
          </h2>
          <p className="mt-2 text-slate-800 whitespace-pre-line">{draft.summary}</p>
        </section>
      )}

      {/* Experience */}
      {draft.experiences.length > 0 && (
        <section className="mt-4">
          <h2
            className={`${typo.heading} font-bold tracking-wider uppercase pb-1 border-b border-slate-200`}
            style={{ color: isClassic ? '#0f172a' : accent.primary }}
          >
            Experience
          </h2>
          <div className="mt-2.5 space-y-3.5">
            {draft.experiences.map((exp) => {
              const dateRange = [exp.startDate, exp.current ? 'Present' : exp.endDate]
                .filter(Boolean)
                .join(' – ');
              return (
                <div key={exp.id}>
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="font-bold text-slate-950">
                      {exp.role || 'Role Title'}
                      {exp.company ? (
                        <span className="font-semibold text-slate-700"> · {exp.company}</span>
                      ) : null}
                    </div>
                    <div
                      className={`text-slate-600 whitespace-nowrap shrink-0 tabular-nums ${
                        isTechnical ? 'font-mono text-[10.5px]' : 'text-[11px]'
                      }`}
                    >
                      {dateRange}
                    </div>
                  </div>
                  {exp.location && (
                    <div className="text-[11px] text-slate-500 mt-0.5">{exp.location}</div>
                  )}
                  {exp.bullets.filter((b) => b.trim()).length > 0 && (
                    <ul className="mt-1.5 space-y-1 list-disc pl-4 text-slate-800">
                      {exp.bullets
                        .filter((b) => b.trim())
                        .map((bullet, idx) => (
                          <li key={idx} className="pl-0.5">
                            {bullet}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Skills */}
      {draft.skillGroups.some((g) => g.skills.length > 0) && (
        <section className="mt-4">
          <h2
            className={`${typo.heading} font-bold tracking-wider uppercase pb-1 border-b border-slate-200`}
            style={{ color: isClassic ? '#0f172a' : accent.primary }}
          >
            Skills
          </h2>
          <div className="mt-2 space-y-1">
            {draft.skillGroups
              .filter((g) => g.skills.length > 0)
              .map((group) => (
                <div key={group.id} className="text-slate-800">
                  <span className="font-semibold text-slate-950">{group.category}: </span>
                  <span className={isTechnical ? 'font-mono text-[10.5px]' : ''}>
                    {group.skills.map((s) => `${s.name} (${s.proficiency})`).join(', ')}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Projects */}
      {draft.projects.length > 0 && (
        <section className="mt-4">
          <h2
            className={`${typo.heading} font-bold tracking-wider uppercase pb-1 border-b border-slate-200`}
            style={{ color: isClassic ? '#0f172a' : accent.primary }}
          >
            Projects
          </h2>
          <div className="mt-2 space-y-2">
            {draft.projects.map((proj) => (
              <div key={proj.id}>
                <div className="flex items-baseline justify-between gap-4">
                  <div className="font-bold text-slate-950">
                    {proj.name || 'Project Name'}
                    {proj.roleOrStack ? (
                      <span
                        className={`font-normal text-slate-600 ${
                          isTechnical ? 'font-mono text-[10.5px]' : ''
                        }`}
                      >
                        {' '}
                        · {proj.roleOrStack}
                      </span>
                    ) : null}
                  </div>
                  {proj.link && (
                    <span className="text-[10.5px] text-slate-500 whitespace-nowrap">
                      {proj.link}
                    </span>
                  )}
                </div>
                {proj.description && (
                  <p className="mt-0.5 text-slate-800">{proj.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education */}
      {draft.education.length > 0 && (
        <section className="mt-4">
          <h2
            className={`${typo.heading} font-bold tracking-wider uppercase pb-1 border-b border-slate-200`}
            style={{ color: isClassic ? '#0f172a' : accent.primary }}
          >
            Education
          </h2>
          <div className="mt-2 space-y-2">
            {draft.education.map((edu) => (
              <div key={edu.id} className="flex items-baseline justify-between gap-4">
                <div>
                  <span className="font-bold text-slate-950">{edu.degree || 'Degree'}</span>
                  {edu.institution && (
                    <span className="text-slate-700"> · {edu.institution}</span>
                  )}
                  {edu.details && (
                    <div className="text-[11px] text-slate-600 mt-0.5">{edu.details}</div>
                  )}
                </div>
                <div
                  className={`text-slate-600 whitespace-nowrap shrink-0 tabular-nums ${
                    isTechnical ? 'font-mono text-[10.5px]' : 'text-[11px]'
                  }`}
                >
                  {[edu.location, edu.graduationDate].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Certifications */}
      {draft.certifications.length > 0 && (
        <section className="mt-4">
          <h2
            className={`${typo.heading} font-bold tracking-wider uppercase pb-1 border-b border-slate-200`}
            style={{ color: isClassic ? '#0f172a' : accent.primary }}
          >
            Certifications
          </h2>
          <div className="mt-2 space-y-1">
            {draft.certifications.map((cert) => (
              <div key={cert.id} className="flex items-baseline justify-between gap-4">
                <div>
                  <span className="font-semibold text-slate-950">{cert.name}</span>
                  {cert.issuer && <span className="text-slate-700"> · {cert.issuer}</span>}
                </div>
                {cert.year && (
                  <span className="text-[11px] text-slate-600 tabular-nums">{cert.year}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  if (forPrint) {
    return <div className="print-only-container hidden print:block">{sheetContent}</div>;
  }

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center py-3 px-3">
      <div
        style={{
          width: `${pageWidthPx * scale}px`,
          height: `${sheetHeightPx * scale}px`,
        }}
        className="relative overflow-hidden transition-[height] duration-150 mx-auto"
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: `${pageWidthPx}px`,
          }}
        >
          {sheetContent}
        </div>
      </div>
    </div>
  );
};
