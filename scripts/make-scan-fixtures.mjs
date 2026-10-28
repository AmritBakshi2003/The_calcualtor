#!/usr/bin/env node
/**
 * Generate printed-text fixtures for the scanner accuracy harness — no
 * browser, no fonts: glyphs are drawn as thick 7-segment-style strokes on a
 * raster and encoded as PNG (node:zlib only).
 *
 *     node scripts/make-scan-fixtures.mjs [outdir]     # default tests/scan-fixtures
 *
 * Fixture name == the expected normalized result ("/" names division ÷).
 * These are clean digital-style digits (calculator-screen look); drop real
 * photos of your handwriting into the same directory to grade true
 * handwriting, and the harness will grade those too.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const outDir = process.argv[2] ?? 'tests/scan-fixtures';
const CASES = ['12+34', '189+82', '99+99÷9', '8+8*5', '147-3'];

// ---------- raster ----------
const W = 560, H = 140;
const PAPER = [246, 245, 242], INK = [25, 25, 25];

function newRaster() {
  return { data: Buffer.alloc(W * H * 3) };
}
function put(r, x, y, rgb) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  r.data[i] = rgb[0]; r.data[i + 1] = rgb[1]; r.data[i + 2] = rgb[2];
}
function stamp(r, cx, cy, radius) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) put(r, x, y, INK);
    }
  }
}
function stroke(r, x1, y1, x2, y2, width) {
  const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
  for (let s = 0; s <= steps; s++) {
    stamp(r, x1 + ((x2 - x1) * s) / steps, y1 + ((y2 - y1) * s) / steps, width / 2);
  }
}

// ---------- glyphs (7-segment, thick marker strokes) ----------
const DIGIT_SEGS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

/** Draw one glyph into the raster at x, with cell height h, centered vertically. */
function drawDigit(r, digit, x, h) {
  const w = h * 0.58, gap = h * 0.08;
  const y0 = 20;
  const seg = {
    a: [x, y0, x + w, y0],
    b: [x + w, y0, x + w, y0 + h / 2],
    c: [x + w, y0 + h / 2, x + w, y0 + h],
    d: [x, y0 + h, x + w, y0 + h],
    e: [x, y0 + h / 2, x, y0 + h],
    f: [x, y0, x, y0 + h / 2],
    g: [x, y0 + h / 2, x + w, y0 + h / 2],
  };
  for (const s of DIGIT_SEGS[digit] ?? '') {
    // Inset each segment so corners stay open — classic segmented look.
    const [sx1, sy1, sx2, sy2] = seg[s];
    const mx = (sx1 + sx2) / 2, my = (sy1 + sy2) / 2;
    const inset = 0.68;
    stroke(
      r,
      mx + (sx1 - mx) * inset, my + (sy1 - my) * inset,
      mx + (sx2 - mx) * inset, my + (sy2 - my) * inset,
      h * 0.11
    );
  }
  return w + gap;
}

function drawPlus(r, x, h) {
  const cy = 20 + h / 2, half = h * 0.28;
  stroke(r, x, cy - half, x, cy + half, h * 0.11);
  stroke(r, x - half / 2, cy, x + half * 1.5, cy, h * 0.11);
  return half * 2 + h * 0.25;
}

function drawSlash(r, x, h) {
  const y0 = 20, arm = h * 0.16;
  stroke(r, x + arm / 2, y0 + h, x, y0 + h * 0.28, h * 0.1);
  stroke(r, x, y0 + h * 0.5, x + arm, y0 + h * 0.5, h * 0.1);
  return Math.max(arm * 2, h * 0.4) + h * 0.25;
}

function drawMul(r, x, h) {
  const cy = 20 + h / 2, half = h * 0.24;
  stroke(r, x, cy - half, x + half * 2, cy + half, h * 0.11);
  stroke(r, x + half * 2, cy - half, x, cy + half, h * 0.11);
  return half * 2 + h * 0.25;
}

function drawMinus(r, x, h) {
  const cy = 20 + h / 2, half = h * 0.3;
  stroke(r, x, cy, x + half * 2, cy, h * 0.11);
  return half * 2 + h * 0.25;
}

/** Render an expression string to a raster. */
function render(expression) {
  const r = newRaster();
  for (let i = 0; i < r.data.length; i += 3) {
    r.data[i] = PAPER[0]; r.data[i + 1] = PAPER[1]; r.data[i + 2] = PAPER[2];
  }
  const h = 84;
  let widths = [];
  for (const ch of expression) {
    widths.push(
      /[0-9]/.test(ch) ? h * 0.58 + h * 0.08 :
      ch === '+' ? h * 0.81 : ch === '/' ? h * 0.65 :
      ch === '*' ? h * 0.73 : ch === '-' ? h * 0.85 : h * 0.4
    );
  }
  const total = widths.reduce((a, b) => a + b, 0);
  let x = Math.max(8, (W - total) / 2);
  expression.split('').forEach((ch, idx) => {
    if (/[0-9]/.test(ch)) x += drawDigit(r, ch, x, h);
    else if (ch === '+') x += drawPlus(r, x, h);
    else if (ch === '/') x += drawSlash(r, x, h);
    else if (ch === '*') x += drawMul(r, x, h);
    else if (ch === '-') x += drawMinus(r, x, h);
    else x += widths[idx];
  });
  return r;
}

// ---------- PNG encoder (RGB, 8-bit) ----------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(r) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    r.data.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- main ----------
mkdirSync(outDir, { recursive: true });
for (const expression of CASES) {
  const file = join(outDir, `${expression}.png`);
  writeFileSync(file, encodePng(render(expression)));
  console.log(`wrote ${file}`);
}
