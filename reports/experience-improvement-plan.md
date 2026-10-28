# Experience Improvement Plan — Calculator Suite

**Date:** October 28, 2026 · **Base:** `master` @ `86f0386`
**Scope chosen:** six high-value UX defects/missing features, all testable without new dependencies.

---

## 1. Findings (investigation, October 28 2026)

| # | Issue | Impact | Where |
|---|---|---|---|
| F1 | **History "reuse" is a stub** — tapping a history entry runs `console.log` (a `TODO` in the code). README advertises "persisted calculation history with … reuse". | Advertised feature does not exist for the user | `components/Layout.tsx` (`handleHistorySelect`) |
| F2 | **History list ordering is wrong** — `loadHistory()` calls `entries.reverse()` twice, so the shown list is oldest-first (and search results use an arbitrary order). | Newest calculations are hidden at the bottom | `features/history/HistoryPanel.tsx` |
| F3 | **Keyboard input hijacks every input on the page** — a global `keydown` listener appends digits/operators to the calculator expression even while the user types in the Tip % input, Scan expression box, or Finance fields. | Typing a tip percentage silently corrupts the calculator | `features/simple/useCalculator.ts` |
| F4 | **No smart input** — buttons append blindly: `5++`, `×÷`, `()`, `.` in one number, operators before `)` are trivially reachable; typing `2 3` after a `)` produces cryptic evaluator errors. | Frustrating typo-and-backspace loops | `useCalculator.ts` |
| F5 | **Memory (M+, M−, MR, MC) is implemented but unreachable** — the hook exposes all four functions; no button in any UI calls them. | Dead feature | `useCalculator.ts` vs `SimpleCalculator.tsx` |
| F6 | **No way to copy the result** — users retype long decimals by hand. | Friction | `SimpleCalculator.tsx` |

Deferred (documented, not in scope): PWA install prompt polish, finance tab search, paid Gemini tier for guaranteed scan capacity, PostHog telemetry keys, real-phone camera spot-check, OCR accuracy harness with real handwriting photos (see `reports/production-diagnosis-report.md` §4).

---

## 2. Implementation plan

1. **History reuse** — add `pendingExpression` (+ setter) to the zustand store. Tapping a history entry sets it and switches to the Simple tab; a `useEffect` in `SimpleCalculator` picks it up through a new `loadExpression(expr, result?)` on `useCalculator` and clears it.
2. **History ordering** — sort newest-first exactly once in `loadHistory`, reuse the same array for search results.
3. **Keyboard guard** — ignore `keydown` when the event target is an `INPUT`/`TEXTAREA`/`SELECT`/content-editable element or when Ctrl/Meta/Alt is held (so app shortcuts survive).
4. **Smart input** — new pure function `appendSmart(prev, value)` in `features/simple/smartAppend.ts`: duplicate binary operators replace the last one; `-` starts an expression or floors a negation but never doubles; `.` is refused inside an existing number and fills as `0.`; `)` is refused after `(`/operator; a digit after `)` becomes implicit multiplication (`)` + `3` → `)*3`). Multi-char inserts (functions, memory recall) pass through untouched. Wire it into `appendToExpression` and the keyboard path.
5. **Memory buttons** — MR / M+ / M− / MC row above the keypad, wired to the existing hook functions.
6. **Copy result** — clipboard button next to the result line with a transient "Copied ✓" state and a `document.execCommand` fallback.

## 3. Verification plan

- Unit tests for `appendSmart` (+ the existing displayFormat tests)
- Updated `HistoryPanel` + store interaction covered by updated component tests where jsdom allows (IndexedDB is mocked upstream)
- Full web unit suite (`npx vitest run`), web typecheck (`tsc --noEmit`), web lint
- Dev-server smoke check in the preview panel

## 4. Shipment

- Branch `feat/ux-improvements`, PR opened against `master` for review before production push.
