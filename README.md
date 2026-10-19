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

# E2E tests
npm run test:e2e

# Linting
npm run lint

# Type checking
npm run typecheck
```

## Deployment

### Static Hosting

The app builds to a static site that can be deployed to any static hosting service:

- **Vercel**: Connect your repository and deploy
- **Netlify**: Drag and drop the `apps/web/dist` folder
- **GitHub Pages**: Use GitHub Actions to deploy from `dist`

No backend or database is required.

### Self-Hosting

Build the app and serve the `apps/web/dist` folder with any static file server (nginx, Apache, Caddy, etc.).

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

## License

MIT License - see [LICENSE](LICENSE) file

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Security

See [SECURITY.md](SECURITY.md) for security policy.
