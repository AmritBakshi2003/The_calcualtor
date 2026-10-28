# Calculator Suite — Revised Implementation Plan
## Zero-Cost-First, Open-Source, Offline-Capable

**Purpose:** Replace the original 12-phase plan with a simpler, testable architecture for a web-based calculator suite that supports basic calculations, scientific calculations, financial calculations, and a future camera/image-based math scanner.

**Guiding principle:** Keep the core product useful without an account, paid API, database subscription, or mandatory backend. Distinguish *open-source software* from *free hosting* and from *zero-cost operation*.

---

## 1. Goals and non-goals

### Goals

- Responsive, accessible web app for desktop and mobile.
- Basic, scientific, and financial calculators.
- Fast local calculation without network round trips.
- Local history and settings that persist across reloads.
- Installable Progressive Web App (PWA) with offline support for core features.
- Camera capture and image upload for a later scanner phase.
- Local OCR for an initial scanner, with editable recognition results.
- Public source repository and documented third-party licences.
- Static deployment and self-hosting options.
- Automated tests and reproducible builds.

### Non-goals for the first release

- Mandatory backend, authentication, or user accounts.
- Mandatory database service, Docker, or cloud infrastructure.
- Mandatory hosted AI service or paid API.
- Guaranteed handwriting, diagram, or advanced equation solving in the initial scanner.
- Currency conversion as a dependency of the core financial calculators.

---

## 2. Recommended architecture

### Core stack

| Concern | Recommended choice | Purpose |
|---|---|---|
| Frontend | React + Vite + TypeScript | Fast client-side app and development workflow |
| Styling | Tailwind CSS | Responsive styling and theming |
| UI components | Accessible components, e.g. shadcn/ui where useful | Consistent interface; review each component's dependencies/licence |
| Math expression engine | math.js | Parse and evaluate supported mathematical expressions |
| Decimal arithmetic | decimal.js where appropriate | Decimal-oriented financial calculations |
| Equation rendering | KaTeX, if formatted equation display is needed | Render mathematical notation |
| Local storage | IndexedDB | Calculation history and settings |
| OCR | Tesseract.js, optional scanner phase | Browser-side text recognition |
| Unit tests | Vitest | Test calculation modules and UI utilities |
| End-to-end tests | Playwright | Test key user journeys |
| CI | GitHub Actions or another compatible CI runner | Lint, type-check, test, and build |
| Deployment | Static hosting or self-hosting | Avoid requiring a paid server |

Use npm workspaces only if the reusable math package justifies the extra workspace configuration. Keep the architecture small and understandable.

### Architecture decisions

1. Basic, scientific, and financial calculations execute in the browser.
2. The math engine is a reusable TypeScript module independent of UI components.
3. Camera processing, OCR, and history do not require a server for the initial implementation.
4. No backend is required for the initial release.
5. Add an optional backend only if a future feature genuinely requires server-side processing, accounts, shared data, or a protected secret API key.
6. Any AI provider key must remain server-side; never bundle a secret key in client JavaScript.
7. The core app must remain useful if optional OCR, currency rates, or AI features are unavailable.

---

## 3. Proposed repository structure

```text
calculator-suite/
├── apps/
│   └── web/
│       ├── public/
│       │   ├── icons/
│       │   └── manifest.webmanifest
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── features/
│       │   │   ├── simple/
│       │   │   ├── scientific/
│       │   │   ├── finance/
│       │   │   ├── scan/          # add in scanner phase
│       │   │   └── history/
│       │   ├── hooks/
│       │   ├── storage/
│       │   ├── styles/
│       │   └── main.tsx
│       └── package.json
├── packages/
│   └── math-core/
│       ├── src/
│       │   ├── expression/
│       │   ├── scientific/
│       │   ├── finance/
│       │   ├── formatting/
│       │   └── index.ts
│       ├── tests/
│       └── package.json
├── e2e/
├── .github/
│   └── workflows/
├── LICENSE
├── NOTICE                     # where needed for third-party notices
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── package.json
├── package-lock.json
├── tsconfig.json
└── .gitignore
```

**Note:** This is a target structure, not a requirement to create every folder up front. Add the `scan/` feature and OCR dependency only when implementing that phase. An `apps/api/` workspace is deliberately omitted from the initial version.

---

## 4. Dependency and licence policy

Use established libraries, pin and review dependency versions, and audit the full direct and transitive dependency tree before each release. Do not assume every dependency uses the same licence.

| Dependency | Intended use | Licence/release check |
|---|---|---|
| React | UI | Verify the selected version's licence |
| Vite | Build tooling and dev server | Verify selected version and transitive dependencies |
| TypeScript | Type checking | Verify selected version |
| Tailwind CSS | Styling | Verify selected version and plugins |
| math.js | Expression parsing and math | Review its licence and security guidance |
| decimal.js | Decimal arithmetic | Verify selected version |
| KaTeX | Math rendering, if needed | Verify selected version and fonts/assets |
| IndexedDB browser APIs | Local persistence | Browser-native; no extra service |
| idb, if chosen | IndexedDB helper | Verify selected version |
| Tesseract.js, if chosen | Local OCR | Review Apache-2.0 terms and included assets |
| Vitest | Unit tests | Verify selected version |
| Playwright | E2E tests | Verify selected version and browser install requirements |
| ESLint / Prettier | Code quality and formatting | Verify selected versions |
| PWA plugin, if used | Service worker and PWA build | Verify plugin and generated asset licences |

### Open-source release requirements

- Choose MIT for original application code if a permissive licence is desired and the project owner has the right to license the code.
- Add the complete licence text and correct copyright holder to `LICENSE`.
- Preserve third-party copyright and licence notices.
- Add `NOTICE` where required or useful for attribution.
- Include `CONTRIBUTING.md`, `SECURITY.md`, and setup/deployment documentation.
- Generate a dependency licence inventory and review copyleft, attribution, font, and asset obligations.
- Do not label the entire dependency tree “MIT” unless that is verified.
- Do not commit API secrets, credentials, private datasets, or user-uploaded images.

Open source does not automatically mean that hosting, a domain name, API calls, or model inference will be free.

---

## 5. Phase-by-phase implementation plan

## Phase 1 — Scaffold and project hygiene

### Tasks

1. Create the Vite + React + TypeScript app.
2. Add Tailwind CSS and accessible UI primitives as needed.
3. Add linting, formatting, type-check scripts, and a consistent import strategy.
4. Set up Vitest.
5. Create the `math-core` package; use npm workspaces only if needed.
6. Add `.gitignore`, `LICENSE`, `README.md`, and `.env.example` only if environment configuration is actually needed.
7. Add a basic CI workflow that runs lint, type-check, tests, and build.

### Acceptance criteria

- A clean clone installs from the lockfile.
- Development server and production build succeed.
- Lint, type-check, and test commands work.
- No API keys or secrets are needed to run the initial app.

## Phase 2 — Safe reusable math core

### Tasks

1. Implement a controlled expression parser/evaluator using math.js.
2. Define the supported expression syntax and allowed functions.
3. Add numeric validation and result formatting.
4. Implement explicit handling for division by zero, invalid domains, overflow, and non-finite values.
5. Add scientific operations and constants required by the UI.
6. Implement financial formulas in separate, independently testable functions.
7. Add locale-aware formatting, including Indian lakh/crore grouping.
8. Keep display rounding separate from internal calculation precision.

### Security requirements

- Never use JavaScript `eval()` or `new Function()` for user-entered expressions.
- Do not blindly evaluate arbitrary input with unrestricted functions or scope.
- Restrict allowed functions, syntax, and scope.
- Limit expression length, nesting, and computation complexity.
- Reject assignments, property access, or operations not explicitly supported.
- Treat user input and OCR output as untrusted.
- Do not claim that a restricted parser is safe without tests for prohibited expressions and resource exhaustion.

### Acceptance criteria

- Unit tests cover normal cases, boundaries, invalid inputs, and hostile expressions.
- Operator precedence and associativity are documented.
- The app displays clear errors rather than crashing.
- Aim for at least 90% math-core coverage, but prioritize meaningful assertions over the percentage alone.

## Phase 3 — Basic and scientific calculator UI

### Basic calculator

- Digits, decimal point, addition, subtraction, multiplication, division, and defined percentage semantics.
- Clear, clear-entry if supported, backspace, parentheses, sign toggle.
- Memory keys: MC, MR, M+, M−.
- Expression and result display.
- Keyboard support and accessible labels.
- Clear invalid-input and divide-by-zero handling.
- Optional answer recall (Ans).

### Scientific calculator

- Trigonometric and inverse-trigonometric functions.
- Hyperbolic functions if supported by the math engine.
- `log10`, natural logarithm, exponent, powers, square root, nth root, factorial, absolute value, reciprocal, modulo, π, and e.
- Visible degree/radian setting.
- Scientific notation for very large or small results.
- Second-function toggle where appropriate.

### Required regression tests

- `2 + 3 × 4 = 14`.
- `sin(90°) ≈ 1` in degree mode.
- `sin(π/2) ≈ 1` in radian mode.
- `asin(1)` gives the expected result in the selected display mode.
- `2^3^2` follows the documented exponent associativity; conventional mathematical right-associativity gives 512.
- `0.1 + 0.2` displays without distracting floating-point artefacts.
- Factorial rejects unsupported negative and non-integer inputs unless a deliberately specified extension is implemented.
- `sqrt(-1)` has a documented result policy: supported complex result or a clear unsupported-domain error.
- `log(0)` and `tan(90°)` are handled according to a documented singularity policy.

### Acceptance criteria

- Core calculator use does not need a network connection.
- Mouse, touch, and keyboard input work.
- Angle mode affects calculation, not just the displayed label.
- No raw JavaScript evaluation is used.

## Phase 4 — Financial calculator

### Initial calculators

- EMI and amortization schedule.
- Simple and compound interest.
- SIP/recurring investment growth.
- Lump-sum growth and CAGR.
- ROI.
- NPV and IRR.
- Discount, tax, and GST, including inclusive/exclusive modes.

### Requirements

1. Document each formula, units, and assumptions.
2. Distinguish annual interest rates from per-period rates.
3. Define compounding frequency and payment timing.
4. Test zero interest, zero principal, zero tenure, and invalid negative inputs.
5. Specify SIP contribution timing: beginning or end of period.
6. Specify NPV period conventions.
7. Define IRR convergence criteria, maximum iterations, and failure behaviour.
8. Test amortization totals and final remaining balance.
9. Keep calculation precision separate from display rounding.
10. Use decimal.js where appropriate, but do not assume that using a decimal library alone guarantees financial correctness.
11. Add an estimate/not-financial-advice disclaimer.
12. Treat currency conversion as an optional extension using a documented source, caching, graceful failure, and clear data timestamps. Do not make it mandatory for offline finance calculations.

### Acceptance criteria

- Every supported formula has independently verified reference cases.
- Inputs, units, rounding rules, and assumptions are visible.
- Invalid values do not silently produce plausible-looking results.

## Phase 5 — Local history, PWA, and offline support

### Tasks

1. Store history and settings in IndexedDB.
2. Search, filter, reuse, delete individual entries, and clear all history.
3. Export history to CSV.
4. Persist theme, angle mode, number format, and last-used mode.
5. Add an installable PWA manifest and service worker.
6. Cache the application shell and required assets.
7. Load large optional features such as OCR only when needed.
8. Display an appropriate message when optional online features are unavailable.
9. Provide a way to clear locally stored history and settings.

### Privacy requirements

- Do not upload calculation history or images by default.
- Explain that browser-local history is device/browser-specific and may be removed by browser data clearing.
- Avoid collecting analytics or telemetry by default; if later added, document it and make it optional where appropriate.

### Acceptance criteria

- Core calculations work offline after the app and its required assets have been cached.
- History and settings persist across reloads.
- Offline behaviour is tested in a production build, not assumed from the development server.

## Phase 6 — Scanner and local OCR

### Scope for scanner v1

- Camera capture through the browser's media APIs, with permission denial and unsupported-device handling.
- Image upload, preview, crop, and rotation.
- Optional preprocessing such as grayscale, contrast adjustment, thresholding, and deskewing.
- Browser-side OCR through Tesseract.js.
- Editable recognition result.
- User confirmation before evaluating the expression.
- Clear errors for blurry images, missing text, or ambiguous symbols.
- No default image upload to a server and no persistent image storage.

### Recognition rules

- Do not automatically map `x` to multiplication in every context; it can be a variable.
- Do not automatically replace `O` with `0` or `l` with `1` without context and an ambiguity warning.
- Do not strip mathematical symbols merely because they are unfamiliar.
- Show an OCR confidence value only if the chosen OCR engine supplies a meaningful value; explain that confidence is not proof of mathematical correctness.
- Keep recognition, normalization, parsing, and calculation as distinct steps.

### Scope limits

The first version targets printed arithmetic and relatively simple expressions. Do not claim robust handwriting, fractions, integrals, matrices, or diagram understanding unless these capabilities are separately implemented and tested.

### Acceptance criteria

- Camera and upload workflows work where browser permissions and device support allow.
- OCR results can be edited before calculation.
- Low-quality or ambiguous recognition fails safely.
- Scanner failures do not affect basic, scientific, or financial modes.

## Phase 7 — Optional advanced problem solver

This phase is not required for the initial release.

### Options

1. Investigate a suitable open-source model that can run locally.
2. Document supported hardware, model size, latency, accuracy limits, and installation complexity.
3. Alternatively, add an optional hosted AI integration behind a server-side endpoint. Never expose provider API keys in browser code.
4. Keep this feature isolated behind a solver interface so it can be disabled without breaking the application.
5. Show the interpreted problem to the user and let them correct it before solving.
6. Distinguish an AI-generated explanation from a verified result; validate results independently where possible.

### Acceptance criteria

- The core calculator works when no model or AI service is configured.
- Any hosted service clearly documents usage limits, data handling, and potential charges.
- “Free” is not claimed until actual hosting/inference requirements have been tested.

## Phase 8 — Release readiness, CI, and deployment

### Automated checks

- Lint.
- Type-check.
- Unit tests.
- Financial reference tests.
- Component tests where useful.
- Playwright end-to-end tests for basic, scientific, finance, history, offline, and scanner workflows.
- Production build.
- Dependency and licence inventory review.

### Example E2E journeys

- Calculate `2 + 3 = 5`.
- Verify operator precedence.
- Switch degree/radian modes and verify trig results.
- Calculate EMI and inspect the amortization balance.
- Save, reload, reuse, and delete a history entry.
- Export history to CSV.
- Scan a sample image using mocked or controlled OCR in CI.
- Verify the app remains usable offline after initial caching.

### Deployment

- Provide local development instructions.
- Provide static hosting instructions for compatible platforms.
- Provide self-hosting instructions.
- Do not require Docker.
- Do not require a backend for the core application.
- Do not assume that any particular hosting plan is free forever or suitable for commercial use.
- Document optional environment variables only when a feature actually needs them.

### Performance and accessibility

- Measure the production build.
- Test keyboard navigation, focus visibility, screen-reader labels, contrast, and mobile layouts.
- Lazy-load OCR and other large optional modules.
- Set Lighthouse scores of 90+ as a target, not a substitute for functional testing.

---

## 6. Revised definition of done

The initial release is ready when:

- [ ] Basic calculator is functional and keyboard-accessible.
- [ ] Scientific functions and degree/radian modes pass regression tests.
- [ ] Financial formulas have documented assumptions and verified reference cases.
- [ ] Input evaluation is restricted and tested; no `eval()` or `new Function()` is used.
- [ ] History and settings persist locally and can be cleared.
- [ ] Core calculations work offline after initial caching.
- [ ] The application can be built and deployed as a static site.
- [ ] The repository includes licence, setup, contribution, security, and deployment documentation.
- [ ] Direct and transitive dependency licences have been reviewed.
- [ ] CI runs lint, type-check, tests, and production build.
- [ ] Accessibility and production performance have been checked.
- [ ] Scanner v1 is included only if its OCR workflow is implemented and tested; it is not represented as a full AI solver.
- [ ] No mandatory paid API, paid hosting feature, database subscription, or backend is required for the core app.

## 7. Required response before implementation

Before writing code, present:

1. The revised architecture and why each component is needed.
2. The proposed repository structure.
3. A direct dependency list with licences verified against the selected versions.
4. The phase-by-phase implementation sequence.
5. The test and security strategy.
6. Static deployment and self-hosting instructions.
7. Any unresolved trade-offs, especially for scanner accuracy and advanced solving.

Do not implement placeholder endpoints or claim unimplemented capabilities as complete. Keep the initial architecture as small as possible while preserving clean separation between UI, math logic, local storage, and optional future integrations.
