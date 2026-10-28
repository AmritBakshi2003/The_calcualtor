#!/usr/bin/env node
/**
 * Dev-vs-production divergence check.
 *
 * Verifies, against ANY origin (local `wrangler dev` or the deployed
 * workers.dev URL):
 *   1. /api/health returns Worker JSON (proves the Worker + /api routing is live);
 *   2. /api/scan/capabilities returns {"gemini":true|false} (proves whether
 *      GEMINI_API_KEY is actually configured there);
 *   3. the static app bundle is served (asset router attached).
 *
 * Usage:
 *   node scripts/check-deploy.mjs <baseUrl>
 *   node scripts/check-deploy.mjs https://the-calculaltor.amritbakshi2003.workers.dev
 */

const base = process.argv[2];
if (!base) {
  console.error('Usage: node scripts/check-deploy.mjs <baseUrl>');
  process.exit(2);
}

const url = base.replace(/\/+$/, '');
const results = [];
let gemini = null;

async function probe(path, { json = false } = {}) {
  const response = await fetch(`${url}${path}`, { headers: { accept: json ? 'application/json' : '*/*' } });
  const text = await response.text();
  return { response, text };
}

function report(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// 1. Worker liveness + API routing.
try {
  const { response, text } = await probe('/api/health');
  if (response.ok && text.includes('"ok"')) {
    report('Worker /api/health', true, `${response.status}`);
  } else if (text.toLowerCase().includes('<!doctype') || text.toLowerCase().includes('<html')) {
    report('Worker /api/health', false, 'got HTML — /api/* is NOT reaching the Worker (run_worker_first missing / wrong deploy).');
  } else {
    report('Worker /api/health', false, `HTTP ${response.status}: ${text.slice(0, 120)}`);
  }
} catch (error) {
  report('Worker /api/health', false, `unreachable: ${error.message}`);
}

// 2. Gemini configured on THIS environment (local dev with .dev.vars vs prod secret).
try {
  const { response, text } = await probe('/api/scan/capabilities', { json: true });
  const payload = JSON.parse(text);
  gemini = payload.gemini === true;
  report(
    'Gemini configured',
    true,
    gemini
      ? 'yes — the scanner will cross-validate with Gemini'
      : 'NO — the scanner silently stays local-only. GEMINI_API_KEY is missing from this environment.'
  );
} catch (error) {
  report('Gemini configured', false, `capabilities probe failed: ${error.message}`);
}

// 2.5. Live AI smoke test — "key configured" (gemini:true) is NOT "Gemini works".
// This POSTs a tiny image exactly like the scanner does; a passing production
// environment answers 200 with JSON. 502/503/504 here means the model calls
// are failing IN THIS environment even though the key is set — every scan
// will silently fall back to local Tesseract.
try {
  // 1x1 gray PNG.
  const PNG_1PX =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const response = await fetch(`${url}/api/scan/recognize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: PNG_1PX, mime: 'image/png', hint: null }),
  });
  const text = await response.text();
  if (response.ok) {
    report('Live Gemini smoke test', true, `recognition API answered ${response.status}`);
  } else {
    let message = `HTTP ${response.status}: ${text.slice(0, 120)}`;
    report('Live Gemini smoke test', false, message);
  }
} catch (error) {
  report('Live Gemini smoke test', false, `unreachable: ${error.message}`);
}

// 3. Static app served.
try {
  const { response, text } = await probe('/');
  const looksLikeApp = response.ok && /<div id="root"|<title|assets\//i.test(text);
  report('Static app served', looksLikeApp, response.ok ? `${response.status}` : `HTTP ${response.status}`);
} catch (error) {
  report('Static app served', false, error.message);
}

console.log('');
console.log('Interpretation:');
console.log('- configured NO  → the scanner silently runs local-only (plain Tesseract) here.');
console.log('- configured YES + smoke FAILED → the key exists but every model call fails — the browser still falls back to local Tesseract. Check the key directly:');
console.log('  curl https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent \\');
console.log('    -H "x-goog-api-key: $KEY" -H "content-type: application/json" \\');
console.log('    -d \'{"contents":[{"parts":[{"text":"hi"}]}]}\'   # 200 = key fine, look elsewhere');
console.log('- both YES → the full Gemini pipeline works in this environment; run the accuracy harness with your photos.');
process.exit(results?.every((r) => r.ok) ? 0 : 1);
