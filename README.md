# Calculator Suite

A responsive, accessible web calculator suite with Samsung-style workflow, unit converter, and multiple calculation modes. Built with React, TypeScript, and Vite. Works offline as a Progressive Web App (PWA).

## Features

### Calculator Modes
- **Simple Calculator**: Digits, operators, parentheses, keyboard support with Samsung-style workflow
- **Expandable Scientific Functions**: Trigonometry, logarithms, powers, factorials, degree/radian modes (toggle in-app)
- **Financial Calculator**: EMI, amortization, compound interest, SIP, ROI, NPV, IRR, tax/GST
- **Scanner Mode**: Camera capture and image upload with local OCR (Tesseract.js),
  optionally cross-validated and corrected by Google Gemini (`apps/worker`)

### Additional Features
- **Tip Calculator**: Calculate tip amount, total bill, and split per head
- **Local History**: Persisted calculation history with search, export, and reuse
- **Offline Support**: PWA with service worker for offline operation
- **No Backend Required**: All calculations run in the browser
- **Mobile Optimized**: Fully responsive design for all screen sizes
- **Dark Mode**: Toggle between light and dark themes

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Math**: math.js (expression parsing, trig functions)
- **Storage**: IndexedDB (via idb)
- **OCR**: Tesseract.js (browser-side) with optional Gemini cross-validation (`apps/worker`)
- **Testing**: Vitest (unit), Playwright (E2E)
- **CI**: GitHub Actions

## Prerequisites

- Node.js >= 22.0.0
- npm >= 9.0.0

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

Build outputs to `apps/web/dist`

### Testing

```bash
# Unit tests
npm run test

# E2E tests (requires dev server running)
npm run install:e2e
npm run test:e2e

# OCR accuracy suite (renders a numeric image corpus and measures what the
# Scan tab actually reads; writes test-results/ocr-report.json)
npm run test:ocr

# Type checking
npm run typecheck
```

## Usage

### Simple Calculator
1. Use the number pad and operators for basic calculations
2. Click √x to expand scientific functions (sin, cos, tan, ln, log, sqrt, etc.)
3. Click 📜 to open history panel with operator access
4. Click 📏 to open unit converter
5. Click ✕ to backspace

### Unit Converter
1. Click 📏 to open unit converter
2. Select category (Length, Area, Temperature, Volume, Mass, Data, Speed, Time, Tip)
3. For regular conversions: Select From and To units, enter value, press =
4. For Tip calculator: Enter tip percentage and people count, enter bill amount, press =

### Scanner (OCR)
- Upload or capture an image of a printed expression, e.g. `12 + 34` or `2 x 45 = 90`
- Recognition runs locally with Tesseract.js; when the optional Gemini layer is
  configured, the same reading is cross-examined by **Google Gemini** against the
  actual glyph shapes and corrected automatically (misread `÷`, `×`, `O`→`0`, …).
  The scan shows which engine produced the text and warns when the two disagree.
- When the local OCR engine reads nothing, the Gemini layer reads the image on its own
- Local-only mode (no API configured, or offline): pure Tesseract, nothing leaves the browser
- Multiple passes are ranked (block segmentation, per-line re-read of the line that
  looks most like an expression, single-line fallback), so a date or a total on a
  neighbouring line is not mistaken for the calculation
- The recognized expression is editable — correct any misread digit before solving
- Supported: printed digits, `+ - * / ^ ( ) . , %`, `x`/`×`/`÷` as operators,
  calculator screens showing `expression = result`
- Word questions ("what is 15% of 350?") and long/deep expressions that the local
  evaluator declines are answered by Gemini (complexity-gated: simple taps never
  cost a model call)
- Known limitation (local-only mode): the English model frequently reads `÷` as `+`
  or `=`; type the operator manually when that happens — or enable Gemini, which
  reads the glyphs and corrects it

### Scientific Functions
- Toggle between DEG (degrees) and RAD (radians) mode in the scientific section
- DEG/RAD indicator only shows when scientific section is open
- All trig functions respect the current angle mode

### Expression Engine

Expressions are parsed by `@calculator-suite/math-core` and evaluated from a validated
syntax tree — never through a general-purpose evaluator.

- **Grammar**: numbers (including `1.5e3`), `+ - * / ^`, implicit multiplication (`2pi`),
  `!` for factorial, parentheses, the constants `pi`/`e`/`ans`, and the functions
  `sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, asinh, acosh, atanh,
  sqrt, cbrt, ln, log, log10, log2, exp, abs, round, floor, ceil, min, max, factorial, nCr`
- **`log` is base 10**, `ln` is natural log
- **Percent**: `200+10%` = 220, `200-10%` = 180, `200*10%` = 20, `50%` = 0.5;
  `17 % 5` (two numbers) is still modulo = 2
- **Angle mode**: `sin`/`cos`/`tan` take the selected angle mode; `asin`/`acos`/`atan`
  return a value in that mode (so `asin(1)` is `90` in DEG and `1.5708` in RAD)
- **Limits**: expressions are capped at 500 characters and 100 nesting levels
- **Numbers only**: complex results, units and matrices are rejected with a message;
  `sqrt(-1)`, `log(0)`, `factorial(-1)`, `tan(90°)` return domain errors
- **Blocked**: assignment, property access, indexing, arrays/objects, and any function
  outside the list above

### Gemini scanner API (optional)

The Scan tab talks to same-origin `/api/scan/*` routes served by `apps/worker`
alongside the static assets (see `wrangler.jsonc`). The Gemini key lives ONLY on the
server — never in the browser bundle:

- **Local dev**: `cp apps/worker/.dev.vars.example apps/worker/.dev.vars`, add your key
  from <https://aistudio.google.com/apikey>, run `npx wrangler dev --config wrangler.jsonc`
  and open the app in front of it (`/api/*` routes then answer).
- **Python CLI** (same pipeline, offline-friendly): see `apps/vision-backend/README.md`.
- **Production**: Cloudflare Workers → your Worker → *Settings* → *Secrets* → add
  `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`); the deploy itself emits the routes.
  Without the key the capability route reports `{ "gemini": false }` and the scanner
  silently stays local-only.

## Deployment

### Cloudflare Workers Builds (Recommended)

This project is configured for deployment to Cloudflare Workers Builds via Git integration.

#### Step 1: Create Cloudflare Workers Project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → **Create Application**
3. Select **Pages** → **Connect to Git**
4. Select your GitHub repository
5. Choose the branch (e.g., `main`)
6. Click **Save and Deploy**

Cloudflare will automatically build and deploy on every push to the connected branch, independent of GitHub Actions.

#### Important Notes

**IndexedDB Data:**
- IndexedDB data is tied to the origin (domain)
- Once users save history/settings, the production domain should not change
- If you need to change domains, users will lose their persisted data

**Running Production Build Locally:**
```bash
npm run build
npm run preview
```
The preview server will run at `http://localhost:4173`

#### CI/CD

GitHub Actions automatically runs tests on every PR and push:
- Type checking
- Linting
- Unit tests (Vitest)
- E2E tests (Playwright)

Tests must pass before Cloudflare Workers Builds will deploy the application.

### Alternative Deployment

The app is designed as a static site that requires no backend, database, or Docker. See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions for:
- Static hosting (Vercel, Netlify, GitHub Pages)
- Self-hosting (nginx, Apache, Caddy, or any static file server)
- PWA installation instructions

### PWA Installation

After deployment, the app can be installed as a PWA:
- Chrome/Edge: Click install icon in address bar
- Safari: Click Share → Add to Home Screen
- Firefox: Install from site information panel

## Project Structure

```
calculator-suite/
├── apps/
│   └── web/              # React app
│       ├── src/
│       │   ├── features/ # Calculator modes
│       │   │   ├── simple/     # Simple calculator with Samsung workflow
│       │   │   ├── scientific/ # Scientific calculator (separate tab)
│       │   │   ├── finance/    # Financial calculators
│       │   │   ├── scan/       # Scanner with OCR
│       │   │   ├── history/    # History panel
│       │   │   └── unitconverter/ # Unit converter component
│       │   ├── components/
│       │   ├── store/
│       │   └── storage/
│       └── public/
├── packages/
│   └── math-core/        # Reusable math library
├── apps/
│   └── vision-backend/   # Python CLI mirror of the same OCR+Gemini pipeline
├── apps/worker/          # Cloudflare Worker: same-origin /api/scan/* (/api/solve/*)
├── e2e/                  # Playwright E2E tests
└── .github/workflows/    # CI configuration
```

## Architecture

- **No Backend Required**: All calculations run in the browser
- **Math Engine**: Reusable TypeScript module in `packages/math-core`
- **Local Storage**: IndexedDB for history and settings
- **OCR**: Browser-side Tesseract.js for scanner mode
- **PWA**: Service worker for offline support
- **Samsung Workflow**: In-app expandable sections instead of mode tabs

## License

MIT License - see [LICENSE](LICENSE) file

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Security

See [SECURITY.md](SECURITY.md) for security policy.
