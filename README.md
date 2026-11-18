# ResumeIQ — AI-Powered Resume & Career Intelligence

A responsive full-stack web and mobile resume builder that pairs a live multi-template resume editor with deep AI-powered Applicant Tracking System (ATS) scoring, job description matching, Gmail authentication, and real-time Firestore cloud sync.

---

## 1. Key Features

- **Gmail Authentication & Cloud Sync (Firebase Auth + Firestore)**:
  - Dedicated **Login Page** with **Continue with Gmail (Google)** (`signInWithPopup`) and an optional **Local Browser Mode** fallback.
  - Real-time cloud synchronization per authenticated user (`users/{uid}/drafts`, `jobs`, `reports`, `settings`) backed by hardened `firestore.rules`.
  - Protected export and AI actions: attempting to **Export PDF**, **Export JSON**, **Run ATS Scan**, **Tailor Summary with AI**, or **Optimize Bullet with AI** while signed out prompts for Gmail sign-in and resumes cleanly once authenticated.

- **Structured Resume Builder & Live Document Preview**:
  - Edit Contact & Header, Professional Summary, Work Experience (bullet-by-bullet), Skills & Competencies (with per-skill **`Beginner` | `Intermediate` | `Expert`** proficiency levels), Projects, Education, and Certifications.
  - Instant **Saved** persistence indicator in the workspace toolbar whenever drafts update in `localStorage` and sync to Firestore.
  - Create, duplicate, import (`.json`), or **delete any draft** (with an in-app confirmation dialog, automatically resetting to a clean blank draft if the last draft is deleted).

- **Configurable ATS Scoring & High-Demand (`503`) Resilience**:
  - **ATS Check Configuration (`Settings`)**:
    - **Gemini 4 Hydrogen**: Server-side deep semantic ATS scoring, gap analysis, tailored summaries, and bullet rewrites.
    - **Gemini 3.1 Flash Lite**: Low-latency, high-availability server-side model option.
    - **Local Deterministic Engine**: Instant offline ATS scoring (keyword extraction, quantification density, action-verb openings, and parseability rules) with zero network calls.
  - **Auto-Fallback on High Demand (`503`)**: Express backend automatically retries transient capacity spikes with jittered backoff and fails over from `gemini-4-hydrogen` to `gemini-3.1-flash-lite` when enabled.
  - Customize scoring strictness (**Balanced**, **Strict**, **Startup**), max AI bullet upgrades (`2`, `4`, or `6`), and export/upload non-secret ATS configuration `.json` profiles.

- **Multi-Template Print-Ready PDF Studio**:
  - Live switcher across **Modern Precision**, **Classic Executive**, and **Compact Technical** templates, plus **Accent Ink**, **Type Density** (`Compact`, `Standard`, `Comfortable`), and **Paper Format** (`US Letter`, `A4`).
  - Vector text `@media print` sheet (`#resume-print-sheet`) so exported PDFs remain crisp and 100% text-selectable for real ATS parsers.

- **Daylight Studio & Dark Studio Themes**:
  - Toggle between high-contrast **Daylight Studio** (`#F8FAFC` / `#FFFFFF`) and **Dark Studio** (`#020617` / `#0F172A`) modes across both the login screen and workspace, persisted in `localStorage` with a pre-paint boot script to prevent flash of unstyled content.

---

## 2. Tech Stack & Architecture

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), `lucide-react`
- **Backend**: Express (`server.ts`, served on port `3000` with Vite middleware in dev and static `dist` in prod)
- **AI SDK**: `@google/genai` (server-side only via `GEMINI_API_KEY`)
- **Auth & Database**: Firebase Authentication (Google Provider) + Cloud Firestore (`firebase-applet-config.json`, `firebase-blueprint.json`, `firestore.rules`)

### Project Structure

```text
├── server.ts                         # Express API (/api/ats/status, analyze, rewrite-bullet, generate-summary)
├── firebase-applet-config.json       # Provisioned Firebase web config
├── firebase-blueprint.json           # Firestore entity & collection blueprint
├── firestore.rules                   # Hardened per-user Firestore security rules
├── eslint.config.js                  # @firebase/eslint-plugin-security-rules config
├── index.html                        # Fonts (Plus Jakarta Sans, DM Sans, JetBrains Mono) + pre-paint theme script
├── src/
│   ├── main.tsx                      # React root wrapped in ErrorBoundary
│   ├── App.tsx                       # Auth gate, Firestore sync, workspace state, modals
│   ├── firebase.ts                   # Firebase SDK init, connection check, Google sign-in, handleFirestoreError
│   ├── index.css                     # Tailwind v4 + @custom-variant dark + @media print vector PDF rules
│   ├── types/resume.ts               # TypeScript interfaces for drafts, jobs, ATS reports & settings
│   ├── data/defaultData.ts           # Pre-populated sample resume & target job descriptions
│   ├── services/firestoreSync.ts     # Defensive Firestore CRUD & real-time onSnapshot subscriptions
│   ├── utils/
│   │   ├── storage.ts                # localStorage persistence, normalization, JSON import/export
│   │   └── localAtsEngine.ts         # Deterministic offline ATS scoring engine
│   └── components/
│       ├── LoginPage.tsx             # Gmail Sign-In & Local Browser Mode entry screen
│       ├── AuthPromptModal.tsx       # Sign-in prompt when gated actions are triggered while signed out
│       ├── TopBar.tsx                # 3-zone desktop header & compact mobile header
│       ├── WorkspaceToolbar.tsx      # Draft/Job selectors, Delete/New/Duplicate, Settings, Theme, Account
│       ├── MobileBottomNav.tsx       # 4-tab mobile navigation bar
│       ├── ResumeEditor.tsx          # Collapsible resume editor with skill proficiency & inline AI rewrites
│       ├── ResumePreview.tsx         # Scaled live sheet preview & dedicated print sheet
│       ├── AtsDashboard.tsx          # Overall score ring, 5 sub-scores, keyword matrix & bullet upgrades
│       ├── JobTargetsView.tsx        # Saved job target library & JD editor
│       ├── TemplatesAndDraftsView.tsx# Template/typography switcher, draft manager & JSON/PDF export
│       ├── SettingsModal.tsx         # ATS engine, 503 failover, strictness & config export/upload modal
│       └── ErrorBoundary.tsx         # Graceful recovery boundary for runtime/Firestore errors
```

---

## 3. Running Locally

### Prerequisites
- Node.js `>= 20`
- A Gemini API key (`GEMINI_API_KEY`) for server-side AI ATS analysis
- A provisioned `firebase-applet-config.json` (with `localhost` / your domain added under **Firebase Console > Authentication > Settings > Authorized domains** if running outside AI Studio)

### Setup & Commands

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Create a `.env` file in the project root based on `.env.example`:
   ```env
   GEMINI_API_KEY="your_gemini_api_key_here"
   APP_URL="http://localhost:3000"
   ```

3. **Start the development server** (Express + Vite middleware on port `3000`):
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

4. **Typecheck & Production Build**:
   ```bash
   npm run lint
   npm run build
   npm start
   ```

5. **Audit Firestore Security Rules**:
   ```bash
   npx eslint firestore.rules
   ```

---

## 4. API Endpoints

- `GET /api/ats/status` — Returns `{ ok, geminiConfigured, availableModels }` without exposing secrets.
- `POST /api/ats/analyze` — Runs structured ATS analysis using the configured Gemini model (with optional automatic `503` retry/failover).
- `POST /api/ats/rewrite-bullet` — Rewrites a single experience bullet point with action verbs, metrics, and target JD keywords.
- `POST /api/ats/generate-summary` — Tailors the professional summary to the active target job description.
