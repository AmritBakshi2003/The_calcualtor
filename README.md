# Calculator Suite

A responsive, accessible web calculator suite with basic, scientific, financial, and scanner modes. Built with React, TypeScript, and Vite. Works offline as a Progressive Web App (PWA).

## Features

- **Basic Calculator**: Digits, operators, memory keys, parentheses, keyboard support
- **Scientific Calculator**: Trigonometry, logarithms, powers, factorials, degree/radian modes
- **Financial Calculator**: EMI, amortization, compound interest, SIP, ROI, NPV, IRR, tax/GST
- **Scanner Mode**: Camera capture and image upload with local OCR (Tesseract.js)
- **Local History**: Persisted calculation history with search, export, and reuse
- **Offline Support**: PWA with service worker for offline operation
- **No Backend Required**: All calculations run in the browser

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Math**: math.js (expression parsing), decimal.js (financial calculations)
- **Storage**: IndexedDB (via idb)
- **OCR**: Tesseract.js (browser-side)
- **Testing**: Vitest (unit), Playwright (E2E)
- **CI**: GitHub Actions

## Prerequisites

- Node.js >= 18.0.0
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

# Linting
npm run lint

# Type checking
npm run typecheck
```

## Deployment

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
│       │   ├── components/
│       │   ├── hooks/
│       │   └── storage/
│       └── public/
├── packages/
│   └── math-core/        # Reusable math library
├── e2e/                  # Playwright E2E tests
└── .github/workflows/    # CI configuration
```

## Architecture

- **No Backend Required**: All calculations run in the browser
- **Math Engine**: Reusable TypeScript module in `packages/math-core`
- **Local Storage**: IndexedDB for history and settings
- **OCR**: Browser-side Tesseract.js for scanner mode
- **PWA**: Service worker for offline support

## License

MIT License - see [LICENSE](LICENSE) file

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Security

See [SECURITY.md](SECURITY.md) for security policy.
