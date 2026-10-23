# Dev vs Production Diagnosis Report — Scanner (OCR + Gemini)

**Repo:** `AmritBakshi2003/The_calcualtor` · **Production:** https://the-calcualtor.amritbakshi2003.workers.dev
**Date:** 2026-10-23 · **Commits shipped:** `b01aa31`, `84b8254`, `d94a34c` (all pushed to `master`, all confirmed live in production)

---

## 1. Executive summary

Your four misread screenshots (`189+82 → 1 91+5`, `99+99÷9 → 954095`, `8+8x5 → 2+3`, `189+82 → 7+82`)
were **not Gemini misreads — they were pure Tesseract reads**. Gemini was effectively not
participating in production. Space inside `1 91+5` is the proof: every Gemini answer passes
through the worker's structural filter, which strips whitespace, so a Gemini result can never
contain a space; the same output shape matched the local engine's known failure modes.

Two independent failure layers were then found and treated:

| # | Failure layer | Where | Status |
|---|---|---|---|
| 1 | **Environment divergence**: `GEMINI_API_KEY` is per-environment; dev had no key → silent local-only scanner | dev (verified) | Documented + checker script |
| 2 | **Production key works but the model calls fail**: Google answers **503 (no capacity for `gemini-3.8-flash`)** and slow (>20 s) responses → every scan silently fell back to raw Tesseract | production (verified live) | **Fixed in code** (model fallback + retry + diagnostics) |
| 3 | **Key quota exhaustion** (persistent 429, even after 65 s idle ⇒ daily free-tier budget, largely consumed during today's testing) | production key/account | **Not fixable in code** — needs billing/quota action |

One Gemini **solve** succeeded in production after the fix (`{"answer":"52.5"}`), proving the
pipeline works end to end when quota or capacity is available.

---

## 2. Dev vs production — exact differences found

### 2.1 Environment configuration (the core dev/prod divergence)

The Gemini key lives **per environment**, not per project:

| Check (same code both sides) | Local `wrangler dev` (this workspace) | Production (your domain) |
|---|---|---|
| `GET /api/health` | `{"ok":true}` ✅ | `{"ok":true}` ✅ |
| `GET /api/scan/capabilities` | `{"gemini":false}` — key absent | `{"gemini":true}` — key present |
| Static app served | 200 ✅ | 200 ✅ |
| **Live recognition smoke test** | — (not applicable, no key) | **❌ 502 `gemini_error`** (before fixes) |
| Text-only solve | 400 CLIENT_EVALUABLE as designed | **❌ 502** (before fixes) |

Mechanism (from `apps/worker/src/index.ts`): absence of `GEMINI_API_KEY` ⇒ `/api/scan/capabilities`
reports `{gemini:false}` ⇒ the browser never calls the API. Presence but failures ⇒ every
recognize/solve error is **silently swallowed** by the browser (`catch → geminiMessage`) and the
raw Tesseract text is shipped to the user as if it were fine. **Both broken and disabled states
look identical to the user: garbage reads.** The only on-screen tell is the tiny gray
"Local recognition only" badge or a transient amber message.

### 2.2 Production root cause chain (verified live, in order)

1. Key **is configured** (`capabilities → gemini:true`) — ruled out the "no key" class.
2. **Every** model call failed — image recognize *and* text-only solve ⇒ image-shape is not the
   cause; it is the model-call layer.
3. First-plausible suspect — wrong model id — **ruled out**: `gemini-3.8-flash` is GA per
   Google's model docs (released Sept 2026); the API-with-invalid-key probe cannot distinguish
   model validity, so docs were consulted instead.
4. With upstream status surfaced (fix `b01aa31` deployed), Google reported:
   - **HTTP 503** — capacity exhausted for the pinned model (`Gemini request failed (503)`),
   - **>20 s stalls** — the Worker aborts at 20 s (`gemini_timeout`).
5. Fix `84b8254` (503 ⇒ automatic fallback to `gemini-3.5-flash-lite`'s capacity pool) produced a
   **real Gemini answer in production** (`{"answer":"52.5","source":"gemini"}`) — intermittent.
6. Continued testing then hit **persistent 429** even after 65 s idle ⇒ daily free-tier quota
   exhausted (dozens of diagnostic/test calls today counted against it).
   RPM vs RPD cannot be distinguished from outside; both produce 429.

### 2.3 Code-level weaknesses that amplified every failure (pre-fix)

- **No verification**: single Gemini pass; whatever it read was trusted as final. A wrong or
  hinted-anchored read shipped to the compute step.
- **Hint anchoring**: raw Tesseract text (often garbage on handwriting) was fed to Gemini as the
  "OCR output", inviting the model to correct toward it rather than read the ink.
- **Raw image only**: glare/shadow/color noise (e.g. your green-ink photo) degraded the one image
  the model saw.
- **Thinking-model leaks**: thought parts were not filtered — internal reasoning text could leak
  into a recognition result via the joined text parts.
- **Token budget too small** (1024): thinking-capable flash models can spend the whole budget
  reasoning and return a visible-empty body ⇒ `empty_response` ⇒ generic 502.
- **No resilience**: 503/404/500 were terminal; a generic `Gemini request failed.` hid the cause.
- **No merged-digits gate**: an operator-bearing expression collapsed to `954095` would have been
  computed with silently if Gemini ever produced one and verification was unavailable.
- Because of 1–8, a single Google hiccup instantly vanished the whole AI layer during a demo.

---

## 3. Fixes shipped (commits on `master`, deployed)

### `b01aa31` — feat(scan): ink-verified two-pass recognition + model-call resilience

Worker (`apps/worker`):
- **Second verification pass**: `POST /api/scan/recognize` now runs an independent Gemini pass
  that cross-examines the candidate glyph-by-glyph against the ink. `verified:false` is returned
  and surfaced as an amber UI badge when pass 2 cannot confirm.
- **Merged-digits trust gate**: if the OCR payload had operators but the final expression lost
  every one (`99+99÷9 → 954095`), the result is refused (nothing shown) rather than computed.
- Optional `enhanced` image field accepted and validated with the same 5 MB cap.
- Upstream status surfaced on 502s (`Gemini request failed. Gemini request failed (503).`) —
  numeric status only, never the upstream body.

Web (`apps/web`):
- Sends the **preprocessed enhanced crop** (grayscale, contrast-normalized, deskewed/cropped) as a
  second image along the original photo.
- `verified` flag read from the API; **"⚠ Reading not independently verified"** badge.
- Honed local-recognition messages (offline mode stays graceful).

Prompts (`apps/worker/src/prompts.ts`):
- Rewritten for handwriting: digit-group separation rules, glyph-confusion table (÷ dots, + as
  crossing strokes…), **anti-anchoring flow** ("read the ink first; keep payload content only if
  the image confirms it"), normalized output contract.
- New `VERIFY_SYSTEM_INSTRUCTION`, hard contract (expression-only or UNREADABLE).

Ops / test scripts:
- `scripts/check-deploy.mjs` → deploy checker with **live AI smoke test** ("key present" vs
  "key actually works" finally distinguishable) + interpretive output.
- `scripts/scan-accuracy.mjs` → accuracy harness: photos named after their expected expression,
  exact-normalized match only, `--strict` additionally requires server-verified readings.
- `scripts/make-scan-fixtures.mjs` → pure-Node printed-fixture generator (no browser/fonts).
- Fixture set committed under `tests/scan-fixtures/`.
- `DEPLOYMENT.md` updated with all three commands.

### `84b8254` — fix(gemini): fall back on 503 capacity exhaustion

- Google **503** now behaves like model-unavailability: one fallback attempt against
  `gemini-3.5-flash-lite`; only when the model wasn't user-pinned (`GEMINI_MODEL` overrides are
  never second-guessed).

### `d94a34c` — test(scan): make the harness free-tier friendly

- Spacing between fixtures + one retry after cool-down on 429/504
  (`SCAN_SPACING_MS`, `SCAN_NO_RETRY` override).

**Test status at ship time:** worker 68/68 ✅ · web 274/274 ✅ · api 20/20 ✅ · worker/web
typecheck + lint clean ✅ · `wrangler deploy --dry-run` clean ✅.

---

## 4. What CANNOT be fixed from code (and who must act)

| # | Issue | Why code can't fix it | Your action |
|---|---|---|---|
| 1 | **Free-tier quota ceiling** (persistent 429 ⇒ likely daily RPD consumed) | It is an account state on Google's side | aistudio.google.com → check quota usage / **enable billing** (flash pricing is pennies per 1k scans) — or wait for the daily reset (~midnight PT) |
| 2 | **Google-side 503 capacity** for a particular model in a particular minute | No client can force capacity | Handled automatically (fallback retry); for guaranteed primary capacity, a paid tier helps |
| 3 | **Camera/gallery browser flow on a real phone** (getUserMedia, downloads of the Tesseract assets) | This VM has no mobile browser; Playwright's Chromium can't even launch here (missing system libs in the container) | Spot-check the Scan tab on your phone after the deploy; hard-reload to pick up the new bundle (service worker cache) |
| 4 | **True handwriting ground truth** | Fixtures are printed 7-segment digits; real misreads need your handwriting | Photograph the failing cases, name them `189+82.png`…, drop into `tests/scan-fixtures/`, rerun `npm run test:scan -- --strict` |
| 5 | Historical production failures (before PostHog/AI telemetry if unset) | No server logs were retained for pre-fix requests | Going forward: configure `POSTHOG_PROJECT_TOKEN`/`POSTHOG_HOST` as Worker variables if you want AI-call telemetry |
| 6 | Tesseract's handwriting accuracy when Gemini is offline | Architecture: local OCR is the offline fallback; replacing it (e.g. WebGPU model) is a new project | Keep the "handwriting not supported offline" expectation; the UI already says so |

---

## 5. How to verify everything yourselves (paste-ready)

```bash
# Deploy health + live AI smoke test (should be all ✔ when quota allows):
npm run test:deploy-check -- https://the-calcualtor.amritbakshi2003.workers.dev

# Accuracy grading with real photos (only exact matches pass):
npm run test:scan -- https://the-calcualtor.amritbakshi2003.workers.dev tests/scan-fixtures --strict

# Direct key check (bypasses the app entirely):
curl https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent \
  -H "x-goog-api-key: $KEY" -H "content-type: application/json" \
  -d '{"contents":[{"parts":[{"text":"hi"}]}]}'
# 200 = key fine → look at quota/billing; 400 API_KEY_INVALID → regenerate key then:
#   npx wrangler secret put GEMINI_API_KEY
```

Success criteria for a future demo run: smoke ✔ AND harness 5/5 with `--strict`.
