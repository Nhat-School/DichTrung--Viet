import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

const requiredFiles = [
  'icon/16.png',
  'icon/32.png',
  'icon/48.png',
  'icon/128.png',
  'vendor/tesseract/worker.min.js',
  'vendor/tesseract-core/tesseract-core.wasm',
  'vendor/tessdata/chi_sim.traineddata.gz',
  'vendor/tessdata/chi_tra.traineddata.gz',
  'vendor/tessdata/eng.traineddata.gz',
];

const missing = requiredFiles.filter(rel => {
  const p = path.join(PUBLIC, rel);
  return !fs.existsSync(p) || fs.statSync(p).size === 0;
});

if (missing.length > 0) {
  console.log(`Missing assets detected (${missing.join(', ')}). Running prepare-assets.mjs...`);
  execFileSync(process.execPath, [path.join(__dirname, 'prepare-assets.mjs')], {
    stdio: 'inherit',
    cwd: ROOT,
  });
} else {
  console.log('✔ All required extension assets are present.');
}
