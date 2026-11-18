import { JobTarget, ResumeDraft } from '../types/resume';

export function createId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

export function createSampleDraft(): ResumeDraft {
  return {
    id: 'draft_sample_elena',
    name: 'Senior Product Engineer — Primary',
    updatedAt: new Date().toISOString(),
    templateId: 'modern',
    paperSize: 'letter',
    accentColor: 'cobalt',
    fontScale: 'standard',
    personalInfo: {
      fullName: 'Elena Vance',
      headline: 'Senior Product & Full-Stack Software Engineer',
      email: 'elena.vance@example.com',
      phone: '+1 (415) 890-4312',
      location: 'San Francisco, CA',
      linkedin: 'linkedin.com/in/elenavance',
      website: 'elenavance.dev',
    },
    summary:
      'Product-focused software engineer with 7+ years of experience architecting high-throughput web applications, design systems, and real-time analytics dashboards in TypeScript, React, and Node.js. Proven track record shipping revenue-critical checkout and billing workflows serving 2M+ monthly active users.',
    experiences: [
      {
        id: 'exp_1',
        role: 'Senior Software Engineer, Growth Platform',
        company: 'Northstar Financial',
        location: 'San Francisco, CA',
        startDate: 'Mar 2023',
        endDate: '',
        current: true,
        bullets: [
          'Architected a multi-step merchant onboarding and verification workflow in React and TypeScript, increasing completion conversion by 24% across 45,000 quarterly signups.',
          'Reduced p95 API latency from 480ms to 135ms by introducing Redis read-through caching and query batching across Node.js microservices.',
          'Led accessibility and WCAG AA remediation across 38 shared UI primitives, eliminating 100% of critical keyboard-navigation regressions.',
        ],
      },
      {
        id: 'exp_2',
        role: 'Software Engineer II, Core Product',
        company: 'Beacon Analytics',
        location: 'Seattle, WA',
        startDate: 'Jun 2020',
        endDate: 'Feb 2023',
        current: false,
        bullets: [
          'Built real-time cohort segmentation charts and CSV export pipelines handling 1.2M+ event rows with virtualized rendering.',
          'Collaborated with product designers to standardize design tokens and automated visual regression checks in CI/CD.',
          'Mentored 4 junior engineers through architecture reviews, pair programming, and quarterly technical growth plans.',
        ],
      },
    ],
    education: [
      {
        id: 'edu_1',
        degree: 'B.S. in Computer Science',
        institution: 'University of Washington',
        location: 'Seattle, WA',
        graduationDate: '2019',
        details: 'Magna Cum Laude · Distributed Systems & Human-Computer Interaction',
      },
    ],
    skillGroups: [
      {
        id: 'sg_1',
        category: 'Languages & Frameworks',
        skills: [
          { name: 'TypeScript', proficiency: 'Expert' },
          { name: 'React', proficiency: 'Expert' },
          { name: 'Next.js', proficiency: 'Intermediate' },
          { name: 'Node.js', proficiency: 'Expert' },
          { name: 'PostgreSQL', proficiency: 'Intermediate' },
          { name: 'Tailwind CSS', proficiency: 'Expert' },
        ],
      },
      {
        id: 'sg_2',
        category: 'Architecture & Tooling',
        skills: [
          { name: 'REST & GraphQL APIs', proficiency: 'Expert' },
          { name: 'Redis', proficiency: 'Intermediate' },
          { name: 'Docker', proficiency: 'Intermediate' },
          { name: 'CI/CD', proficiency: 'Intermediate' },
          { name: 'Playwright', proficiency: 'Intermediate' },
          { name: 'WCAG AA', proficiency: 'Expert' },
        ],
      },
    ],
    projects: [
      {
        id: 'proj_1',
        name: 'PulseDiff Telemetry Viewer',
        roleOrStack: 'Open Source · TypeScript, Canvas, WebSockets',
        link: 'github.com/elenavance/pulsediff',
        description:
          'Zero-dependency browser profiler visualizing frame timings and React commit phases at 60fps for distributed frontend teams.',
      },
    ],
    certifications: [
      {
        id: 'cert_1',
        name: 'AWS Certified Developer – Associate',
        issuer: 'Amazon Web Services',
        year: '2024',
      },
    ],
  };
}

export function createEmptyDraft(name = 'Untitled Resume'): ResumeDraft {
  return {
    id: createId('draft'),
    name,
    updatedAt: new Date().toISOString(),
    templateId: 'modern',
    paperSize: 'letter',
    accentColor: 'cobalt',
    fontScale: 'standard',
    personalInfo: {
      fullName: '',
      headline: '',
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      website: '',
    },
    summary: '',
    experiences: [
      {
        id: createId('exp'),
        role: '',
        company: '',
        location: '',
        startDate: '',
        endDate: '',
        current: false,
        bullets: [''],
      },
    ],
    education: [
      {
        id: createId('edu'),
        degree: '',
        institution: '',
        location: '',
        graduationDate: '',
        details: '',
      },
    ],
    skillGroups: [
      {
        id: createId('sg'),
        category: 'Core Skills',
        skills: [],
      },
    ],
    projects: [],
    certifications: [],
  };
}

export function createDefaultJobTargets(): JobTarget[] {
  return [
    {
      id: 'job_stripe_spe',
      title: 'Senior Product Engineer, Checkout & Billing',
      company: 'Stripe',
      location: 'San Francisco, CA / Hybrid',
      updatedAt: new Date().toISOString(),
      description: `We are looking for a Senior Product Engineer to build intuitive, reliable financial interfaces for millions of global businesses.

Responsibilities:
- Design, build, and maintain high-conversion payment and subscription checkout flows using TypeScript, React, and scalable backend services.
- Partner closely with Product Management and Design to run A/B experiments, analyze funnel drop-off telemetry, and ship iterative UX improvements.
- Optimize web performance, Core Web Vitals, accessibility (WCAG AA), and error resilience across global network conditions.
- Drive end-to-end technical architecture, observability, automated integration testing, and incident prevention.

Requirements:
- 5+ years of full-stack or frontend-heavy product engineering experience with TypeScript, React, and modern API design (REST/GraphQL).
- Track record of owning customer-facing metrics, experimentation, and latency optimization.
- Experience with distributed systems, PostgreSQL, caching strategies, and CI/CD test automation (Playwright/Cypress).
- Strong written communication and cross-functional leadership skills.`,
    },
    {
      id: 'job_linear_staff',
      title: 'Staff Frontend Architect, Design Systems',
      company: 'Linear',
      location: 'Remote (US / EU)',
      updatedAt: new Date().toISOString(),
      description: `Join our product engineering team to shape ultra-fast, keyboard-first desktop and web workflows.

Responsibilities:
- Architect local-first sync engines, optimistic UI state updates, and sub-50ms interaction responsiveness in React and TypeScript.
- Evolve our accessible component library, keyboard shortcut architecture, and virtualization pipelines for dense data tables.
- Profile memory consumption, layout thrashing, and bundle budgets to keep client performance instantaneous.

Requirements:
- 6+ years building complex web applications with deep mastery of TypeScript, DOM rendering, and state synchronization.
- Experience building design systems, ARIA-compliant controls, and high-frequency data visualization.
- Familiarity with WebSockets, IndexedDB, and strict automated end-to-end testing.`,
    },
  ];
}
