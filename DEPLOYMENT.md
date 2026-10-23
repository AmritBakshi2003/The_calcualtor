# Deployment Guide

This guide covers deploying the Calculator Suite web application without Docker.

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git (for cloning the repository)

## Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd The_Calculator
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Building for Production

1. Build the application:
```bash
npm run build
```

This creates an optimized production build in `apps/web/dist` with:
- Minified JavaScript and CSS
- Service worker for PWA functionality
- Asset fingerprinting for caching

## Cloudflare Workers (recommended — required for the Gemini scanner API)

Production is a **Cloudflare Worker with static assets**, not a plain static site:
`wrangler.jsonc` declares `main: ./apps/worker/src/index.ts` and serves `apps/web/dist`
as assets with `run_worker_first: ["/api/*"]`, so the same-origin scanner API
(`/api/scan/*`, `/api/solve/complex`) runs next to the static app. The Gemini API key
lives only in the Worker environment — never in the browser bundle.

### Deploy

```bash
npm ci
npm run deploy:worker     # builds the web app, then wrangler deploy --config wrangler.jsonc
```

This is the ONLY correct way to deploy the server component. Do **not** replace
`wrangler.jsonc` with a dashboard-generated config (`main: "worker.js"`, `assets
directory: "./dist"`, or a `functions/` folder): those paths do not exist in this
repository, and dashboard-managed assets cannot have `run_worker_first` applied —
`/api/*` requests would be swallowed by the static asset router and the scanner API
would 404.

Other options:

- **Cloudflare Git integration** (see README): pushes to `master` build and deploy
  with the same `wrangler.jsonc`.
- **GitHub Actions** (`.github/workflows/deploy.yml`): deploys on every `master` push
  when `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` are valid repository secrets.
  The workflow validates the token with `wrangler whoami` and skips (with a warning)
  when the token is missing or revoked — an invalid token never fails the push red.

### Scanner secrets and variables

In the Worker dashboard (*Settings → Variables and Secrets*) or via
`npx wrangler secret put GEMINI_API_KEY`:

| Name | Type | Required | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | encrypted secret | yes (for Gemini mode) | Google AI Studio key; without it `/api/scan/capabilities` reports `{"gemini":false}` and the scanner stays local-only |
| `GEMINI_MODEL` | plain variable | no | overrides `gemini-3.8-flash` |

### Verify after deploying

```bash
curl https://<your-worker-domain>/api/health            # -> {"ok":true}
curl https://<your-worker-domain>/api/scan/capabilities # -> {"gemini":true} when the key is live
```

Or run the built-in check, which also tells you explicitly when the Worker is serving
HTML instead of JSON (the `/api/*` routing bug) and when the key is missing from the
**deployed** environment (the silent local-only scanner):

```bash
npm run test:deploy-check -- https://<your-worker-domain>
```

### Scanner accuracy ground truth (photos → expected expressions)

```bash
# 1. Start the environment you want to grade:
npx wrangler dev --config wrangler.jsonc          # local, needs apps/worker/.dev.vars GEMINI_API_KEY
# 2. Photograph handwritten expressions and name each file after its answer:
#      tests/scan-fixtures/189+82.png
#      tests/scan-fixtures/99+99/9.jpg        (slash names division ÷)
# 3. Run the harness (with --strict, only server-verified readings count as pass):
npm run test:scan -- http://127.0.0.1:8787 tests/scan-fixtures --strict
```

A photo passes only when the returned expression is an exact normalized match
(spacing/×/÷ normalized); with `--strict`, additionally when the Server's second
verification pass confirmed the reading against the ink.

Both must return JSON. HTML means the `/api/*` routing is not active (see the warning
above). With `gemini: true`, the Scan tab shows the "✨ Powered by Google Gemini"
badge and recognition is cross-validated by Gemini.

## Static Hosting Deployment

### Vercel

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Click "Add New Project"
4. Import your GitHub repository
5. Vercel will automatically detect it as a Vite project and deploy

### Netlify

1. Build the app locally: `npm run build`
2. Go to [Netlify](https://netlify.com)
3. Drag and drop the `apps/web/dist` folder
4. Netlify will deploy it as a static site

### GitHub Pages

1. Build the app: `npm run build`
2. Create a `gh-pages` branch: `git checkout --orphan gh-pages`
3. Copy contents of `apps/web/dist` to root
4. Commit and push
5. Enable GitHub Pages in repository settings

### Other Static Hosting

Any static hosting service that serves HTML/CSS/JS files will work:
- AWS S3 + CloudFront
- Cloudflare Pages
- Firebase Hosting
- DigitalOcean App Platform
- Any VPS with nginx/Apache

## Self-Hosting with Node.js

While the app is designed to be a static site, you can also run it with a simple Node.js server:

### Option 1: Using serve (simplest)

```bash
npm install -g serve
cd apps/web/dist
serve -s
```

### Option 2: Using http-server

```bash
npm install -g http-server
cd apps/web/dist
http-server -p 8080
```

### Option 3: Using nginx

Install nginx on your server and configure:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/The_Calculator/apps/web/dist;
    index index.html;

    # Enable gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml+rss text/javascript image/svg+xml;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # PWA service worker
    location /sw.js {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Option 4: Using Caddy

Create a `Caddyfile` in the `apps/web/dist` directory:

```
your-domain.com {
    root * /path/to/apps/web/dist
    file_server
    try_files {path} {path}/
    encode gzip
    encode zstd
}
```

Run Caddy:
```bash
caddy
```

## Environment Variables

The web app itself requires no environment variables for basic operation. The
Cloudflare Worker serving the optional Gemini scanner API reads `GEMINI_API_KEY`
(encrypted secret) and `GEMINI_MODEL` (optional) — see the Workers section above.

## PWA Installation

After deployment, users can install the app as a PWA:

- **Chrome/Edge**: Click the install icon in the address bar
- **Safari**: Click Share → Add to Home Screen
- **Firefox**: Site Information → Install PWA

## Performance Optimization

The build is already optimized with:
- Code splitting
- Tree shaking
- Minification
- Asset hashing for long-term caching
- Service worker for offline support

For additional optimization:
- Enable CDN for static assets (optional)
- Use Cloudflare or similar for CDN and caching
- Enable HTTP/2 or HTTP/3 on your server

## Troubleshooting

### Build Fails

- Ensure Node.js version is >= 18.0.0
- Delete `node_modules` and `package-lock.json` and run `npm install` again
- Check for any syntax errors in your code

### PWA Not Installing

- Ensure HTTPS is enabled (PWA requires HTTPS)
- Check that the service worker is properly registered
- Verify the manifest.webmanifest is accessible

### Offline Mode Not Working

- Clear the service worker cache and reload
- Check browser console for service worker errors
- Ensure the service worker is caching the app shell

### Production Shows Old Version / Scanner Behaves Differently From Dev

- Deployed tabs can keep running the previous bundle after the service worker
  updates silently. The app now shows a "new version is ready" banner with a
  Reload button as soon as an update is waiting; users should also get the
  latest code by hard-reloading once after a deploy.
- The scanner recovers from a stuck OCR engine (stale cached Tesseract worker
  or half-downloaded language data) by terminating and recreating it on a
  second attempt; a third attempt surfaces the error for manual entry.

Note: the root-level `npm run test` script still launches `test:unit` in Vitest
watch mode and does not exit by itself; use `npm run test:core`,
`npx vitest run` (in apps/web), and `npm run test:api` for one-off CI-style runs.

## CI/CD

The project includes GitHub Actions CI workflow that:
- Runs lint and type-check on every push and PR
- Runs unit tests
- Runs E2E tests
- Builds the application

To enable automatic deployment, add a deployment step to `.github/workflows/ci.yml` for your chosen hosting platform.