import { mkdir, copyFile, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const TESSERACT_VERSION = '5.0.0';
const PUBLIC_DIR = join(__dirname, '../public/tesseract');
const NODE_MODULES_ROOT = join(__dirname, '../../../node_modules');
const NODE_MODULES_TESSERACT = join(NODE_MODULES_ROOT, 'tesseract.js/dist');
const NODE_MODULES_CORE = join(NODE_MODULES_ROOT, 'tesseract.js-core/dist');

async function ensureDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function downloadFile(url, dest) {
  console.log(`Downloading: ${url} -> ${dest}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(dest, buffer);
  console.log(`Downloaded: ${dest}`);
}

async function main() {
  await ensureDir(PUBLIC_DIR);

  // Download worker from CDN
  const workerUrl = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js`;
  await downloadFile(workerUrl, join(PUBLIC_DIR, 'worker.min.js'));

  // Download all 4 core WASM files from CDN
  const coreBaseUrl = `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_VERSION}`;
  const coreFiles = [
    'tesseract-core.wasm.js',
    'tesseract-core-simd.wasm.js',
    'tesseract-core-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm.js',
  ];

  for (const file of coreFiles) {
    await downloadFile(`${coreBaseUrl}/${file}`, join(PUBLIC_DIR, file));
  }

  // Download eng.traineddata.gz (only ~4.1 MB, well under 25MB limit)
  const langDataUrl = `https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz`;
  const langDataDest = join(PUBLIC_DIR, 'eng.traineddata.gz');
  
  await downloadFile(langDataUrl, langDataDest);

  console.log('Tesseract assets prepared successfully!');
}

main().catch(console.error);
