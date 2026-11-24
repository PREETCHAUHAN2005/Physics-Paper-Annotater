# AnnotateIQ — Physics Paper Annotation

A college demo for importing outside physics papers, generating topic suggestions within the existing 29-topic taxonomy, reviewing labels, and exporting approved annotations.

The default demo runs in the browser. It needs **no API key, database service, Python installation, Bun, or paid model**. The existing Next.js dashboard is retained.

## Run locally (Windows, macOS, Linux)

Install Node.js **22 LTS**. Then, in this repository:

~~~powershell
npm install
npm run dev
~~~

Open http://localhost:3000. No environment file is required for browser mode.

Production check:

~~~powershell
npm test
npm run typecheck
npm run lint
npm run build
npm start
~~~

Run the browser checks after a production build:

~~~powershell
npx playwright install chromium
npm run test:e2e
~~~

## Present the demo

1. Start in **Jobs & Upload → Upload papers**.
2. Select 1–3 PDF, TXT, MD, DOCX, PNG, JPG, or WEBP files. Alternatively choose a folder containing up to three supported papers.
3. For scans, enable **OCR** before selecting files. Choose English or English + Hindi.
4. Inspect the editable extraction preview and the detected question count. Correct OCR mistakes or numbering. Start each question on a new line as Q1., Q2., 1., 1), or Question 1:.
5. Create the paper jobs. Select a paper and open **Live Pipeline → Run pipeline → Run now**.
6. Open **Review Queue**. Accept, edit, or reject labels. Unclassified questions must be assigned one of the supported chapters before approval.
7. Download JSON, JSONL, or CSV under **Export**. Rejected, unreviewed, and evaluation rows are excluded.
8. Refresh the page to demonstrate that papers and reviews remain available in the same browser.

Use the text files in public/demo-papers/ for a repeatable rehearsal, then import your own physics paper. Built-in samples are illustrative examples; their filenames are not evidence of official exam provenance.

## Deploy on Vercel

Use the GitHub branch **codex/vercel-browser-demo**, or merge its pull request before importing the main branch.

1. Import this repository in Vercel. For an unmerged branch, use the branch-aware Deploy Button below or create a preview deployment from that branch.
2. Framework: **Next.js**. Root directory: repository root.
3. Node.js version: **22.x**.
4. Install command: **npm install --no-audit --no-fund**. Build command: **npm run build**. The repository's vercel.json sets these commands.
5. Leave output directory at the Next.js default. Browser mode is the default. Optionally set NEXT_PUBLIC_DEMO_MODE=1 before building.
6. Deploy. Check the same upload → run → review → export flow on the actual Vercel URL.

[Deploy this branch to Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPREETCHAUHAN2005%2FPhysics-Paper-Annotater%2Ftree%2Fcodex%2Fvercel-browser-demo&project-name=annotateiq-physics-demo&repository-name=annotateiq-physics-demo)

A Vercel login and project authorization are still necessary to create a real deployment. A branch link or deploy button is not itself a deployed application.

## What the demo does

- Extracts text from digital PDFs with a matching locally served PDF.js worker and fonts.
- Offers browser OCR for scanned PDF pages and page images. The first OCR run downloads engine and language assets.
- Handles common single-column and two-column digital layouts. Two-column reconstruction is inferred from repeated question-marker positions.
- Preserves every parsed source question, source label, and PDF page; restarted numbering does not discard questions.
- Produces deterministic chapter, concept, provisional difficulty/Bloom, math-presence, and language suggestions.
- Retains human decisions and exports explicit rule-engine provenance.
- Saves state in IndexedDB per browser and site origin. Deployment does not need writable server files.
- Keeps the previous server pipeline available for local development as an optional separate mode.

## Limits to explain honestly

- The default engine uses **keyword rules**, not an LLM. Evidence scores are uncalibrated strengths, not probabilities. Repeating the rules is not independent self-consistency sampling.
- Every rule suggestion goes to human review. No benchmark accuracy, kappa, time savings, or honeypot score is claimed.
- Inputs: 10 MB per file, 20 PDF pages, 200 questions, and 250,000 text characters per paper. OCR is limited to 10 scanned pages per paper.
- Handwriting, diagrams, mixed subjects, complex equations, numeric answer-option markers, and unusual layouts can require editing the preview. There is no diagram understanding or solution generation.
- Text extraction is not PDF highlighting. Outputs are annotation datasets; the original PDF is not rewritten.
- Data is local to this browser and origin. Another device or deployment URL has a different dataset. Export before clearing site data. This is not a shared, authenticated production annotation service.
- The default site serves static application assets; paper contents are not uploaded to a server. OCR asset downloads require network access initially.

## Optional original server mode (local machine)

Copy .env.example to .env.local and set NEXT_PUBLIC_DEMO_MODE=0. Keep SKIP_LLM=1 for local heuristic operation. Set DATABASE_URL to file:../db/custom.db, run npm run db:push, then restart Next.js. This uses the existing Prisma/SQLite routes.

The original provider-specific AI SDK needs its own valid server-side configuration to use real model calls. That integration has not been silently enabled.

Do not deploy the local SQLite server mode as if it were persistent Vercel storage. Shared production use needs a hosted database, durable job execution, authentication, and an event transport that works across server instances.

## Verification

The included CI workflow runs unit tests, TypeScript checks, focused lint, a production build, and Chromium tests. Browser checks cover a new outside text paper, review/export/persistence, a generated two-page PDF, and file-count validation.

Implementation notes and presentation guidance are in DEMO_GUIDE.md.
