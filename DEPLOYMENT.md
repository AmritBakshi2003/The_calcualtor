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

The application does not require any environment variables for basic operation. All features work client-side.

Optional environment variables (for future enhancements):
- None currently required

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

## CI/CD

The project includes GitHub Actions CI workflow that:
- Runs lint and type-check on every push and PR
- Runs unit tests
- Runs E2E tests
- Builds the application

To enable automatic deployment, add a deployment step to `.github/workflows/ci.yml` for your chosen hosting platform.