import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Get installed versions from package.json
const packageJsonPath = join(__dirname, '../package.json');
const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
const packageJson = JSON.parse(packageJsonContent);
const tesseractVersion = packageJson.dependencies['tesseract.js'].replace('^', '');
const coreVersion = packageJson.dependencies['tesseract.js-core']?.replace('^', '') || tesseractVersion;

const PUBLIC_DIR = join(__dirname, '../public/tesseract');

async function ensureDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function downloadFile(url, dest) {
  console.log(`Downloading: ${url} -> ${dest}`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(dest, buffer);
    console.log(`Downloaded: ${dest}`);
  } catch (err) {
    console.error(`Error downloading ${url}:`, err.message);
    process.exit(1);
  }
}

async function main() {
  await ensureDir(PUBLIC_DIR);

  // Download worker from CDN (pinned to installed version)
  const workerUrl = `https://cdn.jsdelivr.net/npm/tesseract.js@${tesseractVersion}/dist/worker.min.js`;
  await downloadFile(workerUrl, join(PUBLIC_DIR, 'worker.min.js'));

  // Download all 4 core WASM files from CDN (pinned to installed version)
  const coreBaseUrl = `https://cdn.jsdelivr.net/npm/tesseract.js-core@${coreVersion}`;
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

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
