# Google Gemini OCR Implementation Plan

**Goal:** Turn the Scan tab into a Google-Lens-style math scanner: point at an image, get
recognized numbers/operators back, and get the answer — with Google Gemini powering the
hard parts while Tesseract stays as the fast, offline fallback. The Gemini key never
leaves the server.

---

## 1. Current state (analysis result)

### What exists today

| Piece | Status |
|---|---|
| Browser scanner (`apps/web/src/features/scan/`) | Tesseract.js only, multi-pass ranking, glyph-level ÷/plus disambiguation, editable result |
| Python backend (`apps/vision-backend/`, new OCR) | CLI only: OpenCV preprocess → PyTesseract → **Gemini 3.8 Flash cross-examination** of the OCR payload against the image → AST-whitelisted evaluator |
| Production hosting | Cloudflare Workers Builds via Git integration (`wrangler.jsonc` serves static assets only); push to `master` deploys |
| `apps/api` (Express) | Optional local calculation endpoint; **not** deployed, not needed |

### Is Gemini actually helping Tesseract? (verdict)

Yes — measurably, in exactly the places Tesseract is weakest:

1. **Operator confusion.** Tesseract's known limitation (`÷` read as `+`/`=` on real
   photos, documented in `e2e/ocr-accuracy.spec.ts`) silently changes the value
   (`144÷12` → `156` instead of `12`). The glyph-pixel heuristic catches the ÷ case only
   in the winning pass; Gemini cross-examines *every* glyph against the image. It also
   fixes handwritten edge cases (t/f→+, 7→/, O→0, S→5, l/I→1) the whitelist can never
   express.
2. **Structural errors.** Neighbouring receipt text, dates, and totals make Tesseract
   read fragments that then fail structural match; Gemini treats the OCR text as a hint
   and answers with one normalized expression (or `UNREADABLE`).
3. **Blank reads.** The Python pipeline's `[Blank/Unreadable Text]` fallback flag lets
   Gemini act as the recognizer when Tesseract reads nothing — the browser app today
   just fails in that case.
4. **Cost/benefit:** one image + one short text payload per scan, `temperature 0`,
   ~1 image call + optionally 1 solve call. Acceptable per-scan cost, and the local
   path remains fully offline-capable when Gemini is unavailable.

What Gemini should **not** be trusted for: evaluation. OCR → recognition → validation
→ evaluation stay separate steps; the result arithmetic is computed by the deterministic
engines (math-core in the browser / AST evaluator in the Python backend), *not* the
model, except when a question is too hard for the local engines (see §4).

### Issues found in the new OCR during this analysis (to fix)

| # | Issue | Where | Fix |
|---|---|---|---|
| A1 | Backend is CLI-only — the web app cannot reach it; `evaluate` happens miles from the user's edit box | `vision-backend` | Add a same-origin HTTP API consumed by the Scan tab (§3) |
| A2 | Model pinned to `gemini-3.8-flash` in code; pins like this rot (2.5-flash already retired) | `gemini_layer.py` + new worker | Read `GEMINI_MODEL` from env with `gemini-3.8-flash` default (documented) |
| A3 | No production server-side path for Gemini at all; the key would have to ship in the browser bundle if we naively called Gemini from the client | hosting | New Worker API in the deploy (§3), key as a Cloudflare secret |
| A4 | Scanner UI has no notion of *which* engine produced the text the user is about to edit | `ScanCalculator.tsx` | Source badge + disagreement warning (§5) |
| A5 | Complex questions (word problems, long expressions) simply error out locally | scan solve path | Complexity-activated Gemini solve (§4) |
| A6 | `e2e/ocr-network.spec.ts` ("no external requests") predates the server-side API; must keep passing with the API present, and the capability check must not break offline behavior | e2e | The API is same-origin, so the test keeps passing; capability probe fails gracefully offline |

---

## 2. Principles

- **Lens-like UX:** capture → recognize → result. One tap; no mode switch.
- **Tesseract never leaves.** It is the instant engine, the offline engine, and the
  source of the OCR hint that makes Gemini faster and more accurate.
- **Key stays server-side.** Browser talks only to same-origin `/api/*`; the Worker
  injects `GEMINI_API_KEY` (Cloudflare secret; `apps/vision-backend/.dev.vars` / `.env`
  for local runs). Nothing changes for Python CLI runs.
- **Fail soft, always.** Any Gemini failure (missing key, rate limit, 4xx/5xx, timeout)
  degrades to the current local behavior with a clear message — never a broken scan.
- **Untrusted input everywhere.** Image payloads are size/mime-limited; Gemini output
  passes the same structural regex the Python pipeline uses; expressions are evaluated
  only by the whitelisted AST engine or math-core.

## 3. Server API — `apps/worker` (deployed for real)

A minimal Cloudflare Worker fetch handler (`apps/worker/src/index.ts`), bundled by
Wrangler and declared in `wrangler.jsonc` (`main` + assets, API routes first). It
mirrors the Python pipeline's contract one-to-one.

| Route | Behavior |
|---|---|
| `GET /api/scan/capabilities` | `{ "gemini": true\|false }` — public. Lets the UI show "Gemini-powered" vs "local facts only". |
| `POST /api/scan/recognize` | Body: `{ image: base64 (≤ 5 MB decoded), mime: "image/png"\|"image/jpeg"\|"image/webp", hint: string \| null }`. Runs the Gemini validation step (image + Tesseract hint payload, fallback flag contract) → `{ expression, source: "gemini", unreadable?: boolean }`. Structural-matched; `400` on junk. |
| `POST /api/solve/complex` | Body: `{ expression: string (≤ 500 chars) }`. Classic arithmetic is rejected with `400 { reason: "client_evaluable" }` so simple questions never cost tokens; complex questions go to Gemini with a strict answer contract → `{ answer, explanation?, source: "gemini" }` (answer validated: numeric or math string). |

Cross-cutting: 5 s timeout budget leftover is irrelevant at Workers+Gemini scale, so
recognition and solving each get their own `AbortConfig` (~20 s), CORS disabled
(same-origin only), body-size + rate limiting (simple token bucket per IP), no
logging of image bytes.

**Env:** `GEMINI_API_KEY` (required for Gemini routes; absent ⇒ capabilities reports
`false` and both POST routes return `503 { error: "gemini_not_configured" }`),
`GEMINI_MODEL` (default `gemini-3.8-flash`).

**Local dev:** `wrangler dev` with `.dev.vars` (git-ignored) providing
`GEMINI_API_KEY`.

## 4. Gemini as calculator, activated by complexity

Trigger happens **in the browser**, evaluated locally when the user presses Solve:

- Run `evaluateExpression` (math-core) first — always deterministic, free, offline.
- Compute a **complexity score** from the (user-edited or recognized) text:
  length > ~60 chars, nesting depth ≥ 4, unsupported constructs (functions math-core
  rejects), or non-numeric "question words" (a photographed word problem). 
- Scan the complexity gate only when local evaluation **fails or** the gate fires →
  `POST /api/solve/complex`. Show the answer with a computed-by-Google-Gemini badge and
  keep the local error visible if Gemini declines.

Simple taps never hit the network for answers.

## 5. Scanner UI changes (`ScanCalculator.tsx`)

1. On mount: probe `/api/scan/capabilities` (cached, 10 min). Shows a small badge:
   "Powered by Google Gemini" when enabled, "Local recognition only" otherwise.
2. **Recognize Text** stays one button (Lens flow). Under the hood: local Tesseract
   passes run unchanged → best candidate; when Gemini is enabled, the preprocessed
   image + Tesseract hint go to `/api/scan/recognize`.
   - Gemini wins when it returns a valid expression *or* when local reading is empty.
   - A "Gemini and local OCR disagree" warning + confidence display when both read and
     differ (the edit box remains the arbiter — Lens-like but correctable).
   - `used_fallback` (blank local read) is surfaced, not hidden.
3. **Solve**: local eval → Gemini solve for gated questions (§4).
4. Offline: capabilities probe fails ⇒ local-only; recognition still works as today;
   the solve path simply never asks Gemini.

## 6. Test strategy (end-to-end)

| Layer | What is covered |
|---|---|
| Python unit (offline) | pipeline steps 1–6 + key handling (existing suite keeps passing) |
| JS unit (vitest) | new worker pure logic: prompt building, the structural gate, unwrap (`UNREADABLE`, code fences), complexity scoring, capability/response schemas |
| E2E (Playwright, real build) | existing suites (lens-like flow must not regress); new: `page.route` mocks for `/api/*` exercising capability → recognize (Gemini corrects `÷`) → disagree warning → local-eval-first solve → complexity gate → Gemini solve → offline degradation when Gemini is down; plus `e2e/ocr-network.spec.ts` still green (all `/api/*` calls are same-origin) |
| Wrangler | `wrangler deploy --dry-run` proves the packaged build bundles clean; `wrangler dev` smoke-check of 404-capability, 503-when-key-missing |
| CI | updated to include the worker in typecheck/lint/build; e2e included |

Accuracy expectations: the ÷ misread becomes correctable in-browser (Gemini result);
accuracy baseline from `test:ocr` must stay ≥ 0.9 locally.

## 7. Shipping plan

1. Branch `feat/gemini-ocr` → push to GitHub (CI runs lint/typecheck/tests/build/e2e on the PR).
2. All checks green → merge `/push` to `master`; Cloudflare Git integration deploys production.
3. Secrets handled by the repo owner (never in chat/repo):
   - Cloudflare dashboard → the deployed Worker → Settings → Secrets → `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`).
4. Post-deploy verification on the real URL: capabilities shows `{"gemini": true}`;
   one real scan; one real Gemini solve. Sign-off documented in this plan file.

## 8. Risks / non-goals

- Gemini latency (~1–3 s) makes recognition slower than today; mitigation: cancel
  handling, local text already shown in the edit box meanwhile.
- Costs: rates limiting + client-gating simple solves; per-image bounding.
- Handwriting: Gemini makes it *workable* for simple handwritten arithmetic, but this
  remains best-effort — no claim of full handwriting OCR.
- Non-goals: multi-expression images, equations with variables, matrices, diagram
  understanding.

---

## 9. Implementation status (recorded at build time)

Delivered in the `feat/gemini-ocr` branch:

- `apps/worker/src/*` — the Worker API (§3): capabilities probe, recognize
  (structural regex + `UNREADABLE` contract), gated solve, same-origin guard,
  per-isolate rate limiter, 49 unit tests.
- `apps/web` — `geminiClient.ts`, `complexity.ts` (§4), Scanner UI (§5): engine
  badge, cross-validation, disagreement warning, degradation notices,
  complexity-gated + manual "Ask Gemini" solving; 16 new unit tests.
- `e2e/gemini-scan.spec.ts` — the Lens-style journey (§6) against a real build with
  real local Tesseract: agree case, word-problem solve, manual ask, disagreement,
  503 degradation, local-only mode; 6 tests × 2 device projects.
- `apps/vision-backend/math_vision/gemini_layer.py` — model id now configurable via
  `GEMINI_MODEL` (issue A2); 47 offline tests pass.
- `wrangler.jsonc` — `main` worker + `run_worker_first: ["/api/*"]`; `npm run
  build:worker` proves the bundle; `wrangler dev` smoke-tested live in the runtime
  (health 200, capabilities `{gemini:false}` without a key, 503 recognize, 404
  unknown route, assets served).

Verified suites (all green locally): python 47 · math-core 124 · API 20 · web 272 ·
worker 49 · Playwright E2E 52 (incl. the 21-case OCR accuracy corpus, 21/21) ·
typecheck + lint clean across all workspaces.

Pending on the repo owner (§7): `GEMINI_API_KEY` as a Cloudflare secret, then one
live scan and one live Gemini solve on the production URL.
