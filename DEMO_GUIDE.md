# College demonstration guide

## Problem

Teachers and researchers need to turn physics question papers into consistently labeled question datasets. AnnotateIQ reduces repetitive labeling while retaining human judgment.

## 3-minute sequence

| Time | Action | What to explain |
| --- | --- | --- |
| 0:00–0:25 | Upload an outside paper or select a folder with two text papers | The demo accepts new papers rather than selecting only preset examples. |
| 0:25–0:50 | Inspect detected questions and the editable source preview | Document parsing can make mistakes, so the uploader verifies the boundaries first. |
| 0:50–1:25 | Create jobs and run one paper | Five rule stages suggest topic, difficulty, math presence, language, and validation flags. |
| 1:25–2:15 | Edit a topic, accept another suggestion, reject one | Annotation is assisted; the reviewer controls what enters the dataset. |
| 2:15–2:40 | Download JSON or CSV | Only approved records are exported; provenance states that rules produced the suggestions. |
| 2:40–3:00 | Refresh and open the saved paper | Browser persistence makes the presentation repeatable without a database account. |

## Architecture actually running

| Component | Implementation |
| --- | --- |
| UI | Existing Next.js / React / Tailwind dashboard |
| Digital PDFs | PDF.js text items, line reconstruction, matching static worker and font assets |
| Scans | Optional Tesseract.js OCR on the device |
| Word documents | Mammoth raw-text extraction; no HTML rendering |
| Segmentation | Shared numbering parser with page and source-label preservation |
| Annotation | Deterministic rules against the existing 29 physics topics |
| Validation | Missing/ambiguous topic evidence; reviewer approval required |
| Persistence | IndexedDB, with serialized writes and Web Locks where available |
| Export | JSON, JSONL, CSV; rejected and unreviewed rows excluded |
| Deployment | Next.js on Vercel, with browser processing and no writable server database |

The Reference Architecture view describes the original server design. Its multi-agent sampling, gold-set evaluation, and server database are separate from the browser demo.

## Useful answers

**Is this AI?** The deployed demo uses a transparent rule baseline. The original repository includes a separate model-based design. Do not claim a trained or evaluated model is running.

**Does it work on unseen papers?** It processes new supported files. Topic quality depends on wording and extraction quality; manual review is mandatory. No unseen-paper accuracy figure has been measured.

**Why not SQLite on Vercel?** Local files are unsuitable for shared persistent serverless state. The browser demo stores data on the presenting device instead.

**Why does an unusual question show Unclassified?** There was insufficient supported topic evidence. The demo avoids inventing a confident topic. A reviewer can select a supported chapter or reject the question.

**Does it annotate the original PDF visually?** This version produces question annotations and a reviewed dataset. It does not draw highlights or labels onto the source PDF.

## Fix common problems

| Symptom | Action |
| --- | --- |
| No questions detected | In the preview, put each question on a separate line using Q1., Q2., etc. |
| Decimal values become boundaries | Decimal numbering is filtered; correct unusual layouts or numeric answer-option markers in the preview. |
| Scanned PDF asks for OCR | Enable OCR before choosing the paper again. |
| OCR is slow | Rehearse first to cache assets; use a clear print scan and a short physics section. |
| OCR misses a formula | Correct the extracted source text using the original paper. |
| Old data missing on a new URL | Browser data belongs to one origin. Import the paper again or keep the presentation URL fixed. |
| Chapter cannot be accepted | Edit Unclassified to one of the supported chapters or reject the question. |
| Export disabled | Accept or edit at least one suggestion first. |
| Windows start/build errors from the old template | Use this branch and Node 22. The revised npm scripts do not use tee, cp, Bun, or POSIX environment assignments. |

## Next engineering milestones

Prepare a separate expert-labeled evaluation set. Measure chapter precision/recall and disagreement by topic. Then add a configured model provider, hosted data storage, authenticated reviewers, and durable jobs before claiming a production multi-agent service.
