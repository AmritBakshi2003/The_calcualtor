import { mkdir, writeFile, readFile, copyFile } from 'fs/promises';
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
const NODE_MODULES_ROOT = join(__dirname, '../../../node_modules');
const TESSERACT_NODE_MODULES = join(NODE_MODULES_ROOT, 'tesseract.js');
const CORE_NODE_MODULES = join(NODE_MODULES_ROOT, 'tesseract.js-core');

async function ensureDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function copyFileIfExists(src, dest) {
  if (existsSync(src)) {
    await copyFile(src, dest);
    console.log(`Copied: ${src} -> ${dest}`);
    return true;
  }
  return false;
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
    throw new Error(`Failed to download ${url}: ${err.message}`);
  }
}

async function main() {
  await ensureDir(PUBLIC_DIR);

  // Copy worker from node_modules if available, otherwise download
  const workerSrc = join(TESSERACT_NODE_MODULES, 'dist/worker.min.js');
  const workerDest = join(PUBLIC_DIR, 'worker.min.js');
  if (!await copyFileIfExists(workerSrc, workerDest)) {
    const workerUrl = `https://cdn.jsdelivr.net/npm/tesseract.js@${tesseractVersion}/dist/worker.min.js`;
    await downloadFile(workerUrl, workerDest);
  }

  // Copy core WASM files from node_modules if available, otherwise download
  const coreFiles = [
    'tesseract-core.wasm.js',
    'tesseract-core-simd.wasm.js',
    'tesseract-core-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm.js',
  ];

  for (const file of coreFiles) {
    const coreSrc = join(CORE_NODE_MODULES, file);
    const coreDest = join(PUBLIC_DIR, file);
    if (!await copyFileIfExists(coreSrc, coreDest)) {
      const coreBaseUrl = `https://cdn.jsdelivr.net/npm/tesseract.js-core@${coreVersion}`;
      await downloadFile(`${coreBaseUrl}/${file}`, coreDest);
    }
  }

  // Download eng.traineddata.gz (not in node_modules, must download)
  const langDataUrl = `https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz`;
  const langDataDest = join(PUBLIC_DIR, 'eng.traineddata.gz');
  
  await downloadFile(langDataUrl, langDataDest);

  console.log('Tesseract assets prepared successfully!');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
