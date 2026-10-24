# Scan Tab Accuracy — Implementation & Test Plan

Status of this document: reflects the code on `fix/ocr-recovery` as of
2026-10-24. It merges (a) the state of the local scanner, (b) the
**OCR.space / Gemini cross-check integration** built this session from the
"End-to-End Basic Math OCR Implementation Guide" the user attached, and
(c) the plan for the remaining accuracy work (goal: reading printed and, over
time, handwritten digits/operators/letters reliably).

## 1. Where the scanner stands

The Scan tab runs a multi-pass local pipeline (Tesseract.js, no network):

1. Image preprocessing (grayscale, contrast stretch, size caps — `ocrPreprocess.ts`).
2. Up to four recognition passes (block whitelist, open block, per-line crop,
   single-line fallback), each producing **scored candidates**
   (`ocrScoring.ts`: digit/operator shape, parse success, confidence).
3. Postprocessing (`ocrPostprocess.ts`): glyph normalization (`x` → `*`,
   `%`-between-operands → `*`, date/clock guards), plus-divide glyph shape
   checks (`glyphCheck.ts`).
4. Recovery: a stuck engine is dropped and retried; a third failure surfaces a
   manual-entry message instead of a broken number.
5. Character whitelist (`useOCRWorker.ts`: `0123456789+-*/×÷().,=^%xX`) — the
   same strictness the guide's `tesseract_config.txt` applies to the CLI.

**Measured accuracy** (in-repo browser harness, 22 cases, 21 scoreable):
- baseline (master, before the OCR recovery work): **19/21** scored PASS
- current branch: **21/21** scored PASS, 100% of scoreable cases.
  The one `knownLimitation` case (`144 ÷ 12`) is still read as "+" by the
  eng model under every PSM/scale tried; it is reported as LIMIT, not FAIL.

## 2. What was missing and how the guide fills the gap

The guide's core idea: **a second, independent OCR engine + an LLM
adjudicator** so the app can tell which reading of an image is right instead
of betting on one engine. All of it is now implemented to match the app's
architecture (the guide's `index.html/script.js` snippets translate to the
scan feature; nothing was pasted verbatim because the app is a React app):

| Guide concept | Implementation |
| --- | --- |
| OCR.space upload with `scale=true`, `OCREngine=2`, `detectOrientation=true` | `features/scan/ocrSpace.ts` — `readEquationOcrSpace` posts a downscaled JPEG of the **preprocessed** image with exactly those parameters |
| `rawText.replace(/\s+/g, '')` sanitization | `sanitizeMathText` in the same module (unit tested) |
| API key not baked into the bundle | Keys live in `localStorage`, edited in the Scan tab's "⚙️ Remote OCR APIs (optional)" disclosure; scans run with **no** remote calls when keys are empty |
| Strict character limits | Local whitelist (existing) + Gemini adjudication prompt restricting to digits/operators |
| `tesseract_config.txt` CLI testing | Already covered by `useOCRWorker` params; CLI instructions kept in the guide |
| `equations_test_log.csv` cross-engine log | The e2e harness now writes `test-results/equations_test_log.csv` with `image_filename, expected_equation, tesseract_output, ocr_space_output, gemini_output, status` (the guide's 5 columns + our Gemini extension) |

### Adjudication rules (which reading wins)

`crossCheckMerge.ts` — pure and unit tested:

1. Local reading valid (parses): **it wins**, remote reads are shown only in a
   summary line (never silently replaced).
2. Local engine produced nothing usable: the **OCR.space** reading becomes the
   answer if it evaluates; otherwise Gemini's adjudicated reading.
3. Nothing usable anywhere: existing recovery/edit instructions remain.

Gemini output is always re-validated with the local evaluator + cleaned before
it can enter the box (`geminiOCR.ts`: `parseAdjudicationJson`, evaluator check
in `ScanCalculator`). The cross-check summary is rendered under the edit box:
`Cross-checks — OCR.space: agrees parses (…) · Gemini: reads "144/12" parses (90%)`.

## 3. Test scripts

One command each; all are wired to work in CI without keys.

| Script | Command | What it proves |
| --- | --- | --- |
| Core math | `npm run test:core` | evaluator/parser/finance correctness (124 tests) |
| UI + modules | `cd apps/web && npx vitest run` | 243 unit tests incl. the 21 new cross-check tests (`ocrSpace.test.ts`, `geminiOCR.test.ts`, `crossCheckMerge.test.ts`) |
| Accuracy harness | `npm run build:web` then `npx playwright test e2e/ocr-accuracy.spec.ts --project=chromium` | full corpus through the real Scan tab; emits `ocr-report.json` + `equations_test_log.csv`; guard: ≥90% |
| Remote columns | same as accuracy harness with `OCRSPACE_API_KEY=…` / `GEMINI_API_KEY=…` exported | fills the CSV's `ocr_space_output` / `gemini_output` columns |
| Production serving | `npx wrangler dev --config <prod-asset-dir>/wrangler.jsonc` + `node`/Playwright asset-hash smoke | byte-identical OCR assets (see §4) |

How to run the whole pipeline like CI does:
```bash
npm run typecheck && npm run build:web && npx playwright test e2e/ocr-accuracy.spec.ts --project=chromium
```

## 4. Dev-vs-production mismatch (the user's main issue)

Reproduced this session, not guessed:

- The production build served through **Wrangler's workerd asset pipeline was
  intermittently truncating the Tesseract runtime files**
  (`tesseract-core-*.wasm.js` lost 15–45 % of their bytes while
  `worker.min.js` and `eng.traineddata.gz` stayed intact). A truncated core
  file kills the OCR worker with
  `SyntaxError: … 'importScripts' … Invalid or unexpected token`, the scan
  box silently stays empty — exactly the "dev works, prod doesn't" symptom.
- Immediately after, the very same build served **byte-identical** assets and
  read `12 + 34` correctly through the same workerd server. The corruption
  is transient, which explains why the user sees it only sometimes.
- The dev server (Vite) never applies this transform, so dev always looks
  healthy.

Mitigations in place / planned:

1. The app already auto-retries with a recreated engine and then surfaces an
   error (done before this session); the new cross-checks give a second path
   to a correct reading via OCR.space when the local engine dies.
2. **Verify against the real deployed URL.** The user should share the
   production domain; the asset-hash smoke in §3 run against it will show
   whether Cloudflare's edge truncates too, or whether this is only the local
   workerd pipeline. If production is also affected, escalate to Cloudflare
   with the reproduction (poll `/tesseract/tesseract-core-simd-lstm.wasm.js`
   and compare content-length/SHA).
3. Deployment hygiene already in `_headers`: OCR files are `max-age=300,
   must-revalidate` (never a year-stale engine); the PWA update banner
   (`registerType: 'prompt'`) plus hourly `update()` checks keep browsers off
   stale bundles. On top of that, the service worker precache is large
   (~17.6 MB with the WASM files); a future improvement is to exclude the
   Tesseract runtime from precache and rely on the two-pass network fetch,
   shrinking installs on slow connections.

## 5. Roadmap to the accuracy goal (human-written content)

Current target = printed arithmetic; the user's goal extends to
handwritten numbers, operators and characters with multi-verification. Ordered:

1. **Cross-engine judging (done this session)** — OCR.space second reading +
   Gemini adjudication, local-first policy. Requires the user's keys to be
   filled in the Scan tab settings.
2. **Corpus expansion (planned)** — add handwritten-style cases to
   `e2e/ocr-accuracy.spec.ts` (skewed baselines, pen pressure/blur,
   handwriting-like fonts available as TTF) and human-generated samples the
   user captures on phone paper; keep every new case's `expected` fixed so
   regressions are measurable.
3. **Adjudication on disagreement (planned)** — currently Gemini runs once per
   scan when configured; once OCR.space keys are live, make Gemini also run
   when local and OCR.space *disagree* even if local parses, and only then
   change the box after a parse + plausibility check.
4. **Dataset work (planned, needs the user)** — the guide points at the
   Govindaram Sriram dataset on Kaggle; the user should export a few dozen
   labelled images into `e2e/fixtures/handwriting/` (CSV of filenames and
   expected equations), and the harness case list will read them. Do not
   commit labelled personal photos without the user's OK.
5. **Engine options (planned, evaluate only)** — a trained `digits`-style LSTM
   for handwriting is a much bigger change (custom traineddata); only pursue
   after the corpus shows the boundary of what eng can do.

## 6. What is intentionally NOT planned

- No server proxy for OCR.space/Gemini keys: production is a static Cloudflare
  site and keys-per-browser keeps the deployment stateless. Revisit only if
  key leaks into shared devices matter (then a Worker route is the fix).
- No OCR.space/Gemini call inside unit tests (network); they are opt-in via
  environment keys in the e2e harness and via user keys in the app.
