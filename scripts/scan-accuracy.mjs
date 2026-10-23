#!/usr/bin/env node
/**
 * Scanner accuracy harness.
 *
 * Every test photo must be named after the ONE expression written on it:
 *
 *     tests/scan-fixtures/189+82.png
 *     tests/scan-fixtures/99+99÷9.jpg
 *
 * (spaces in names are avoided; use x for ×, and / for ÷ — the name IS the
 * expected result; division is written with the slash, e.g. "99+99+99-9"
 * style naming would be wrong, so write 99+99/9.)
 *
 * The photo is POSTed to a running Worker (local `wrangler dev` with
 * GEMINI_API_KEY in apps/worker/.dev.vars, or the deployed URL) EXACTLY like
 * the browser does — same request shape, no hint, fresh image — and an image
 * ONLY counts as a pass when the normalized result equals the expected
 * expression AND (with --strict) the response carries verified: true.
 *
 * Usage:
 *   node scripts/scan-accuracy.mjs [baseUrl] [fixturesDir]
 *   node scripts/scan-accuracy.mjs http://127.0.0.1:8787 tests/scan-fixtures --strict
 *
 * Exit code 0 only if every image matched.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const strict = process.argv.includes('--strict');

// Default: local wrangler dev (wrangler dev --config wrangler.jsonc).
const base = args[0] ?? 'http://127.0.0.1:8787';
const dir = args[1] ?? 'tests/scan-fixtures';

/** Normalize exactly like the server + solve path do. */
function normalize(text) {
  return String(text)
    .replace(/\s+/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/[^0-9+*/().-]/g, '');
}

const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const files = readdirSync(dir).filter((f) => MIME_BY_EXT[extname(f).toLowerCase()]);
if (files.length === 0) {
  console.error(`No image fixtures found in ${dir}/`);
  console.error('Name each photo after the expression it contains, e.g. "189+82.png".');
  process.exit(2);
}

let pass = 0;
const failures = [];

/** Free-tier friendliness: spacing between images, one retry on transient 429/504. */
const SPACING_MS = process.env.SCAN_SPACING_MS ? parseInt(process.env.SCAN_SPACING_MS, 10) : 8000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const file of files) {
  const expected = normalize(basename(file, extname(file)));
  const bytes = readFileSync(join(dir, file));
  const body = {
    image: bytes.toString('base64'),
    mime: MIME_BY_EXT[extname(file).toLowerCase()],
    hint: null,
  };
  const label = `${file}  →  expected ${expected}`;
  try {
    let response = await fetch(`${base}/api/scan/recognize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if ((response.status === 429 || response.status === 504) && !process.env.SCAN_NO_RETRY) {
      console.log(`  … ${file}: HTTP ${response.status}, retrying once after a cool-down`);
      await sleep(SPACING_MS);
      response = await fetch(`${base}/api/scan/recognize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    const payload = await response.json();
    if (!response.ok) {
      failures.push(`${label}\n      HTTP ${response.status}: ${JSON.stringify(payload)}`);
      continue;
    }
    const got = normalize(payload.expression ?? '');
    const verified = payload.verified === true;
    const ok = got === expected && (!strict || verified);
    if (ok) {
      pass += 1;
      console.log(`  ✔ ${label}`);
    } else {
      failures.push(
        `${label}\n      got: ${payload.expression ?? '(empty)'}${verified ? '' : '  [NOT verified]'}` +
          (!verified && strict ? ' (strict mode requires verified: true)' : '')
      );
    }
  } catch (error) {
    failures.push(`${label}\n      request failed: ${error.message}`);
  }
  if (SPACING_MS > 0) await sleep(SPACING_MS);
}

console.log(`\n${pass}/${files.length} exact matches`);
failures.forEach((f) => console.log(`  ✘ ${f}`));
process.exit(failures.length === 0 ? 0 : 1);
