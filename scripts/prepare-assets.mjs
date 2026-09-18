import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Generate valid PNG buffer using pure Node.js zlib
function createPng(width, height, rgbaBuffer) {
  function crc32(buf) {
    let table = crc32.table;
    if (!table) {
      table = crc32.table = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
      }
    }
    let c = -1;
    for (let i = 0; i < buf.length; i++) {
      c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ -1) >>> 0;
  }

  function createChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const rawData = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    rawData[y * (stride + 1)] = 0; // filter None
    rgbaBuffer.copy(rawData, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const idatData = zlib.deflateSync(rawData);
  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', idatData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// Generate sleek emerald/teal icon with "中" glyph abstraction
function renderIconRgba(size) {
  const buf = Buffer.alloc(size * size * 4);
  const rCorner = size * 0.22;
  const center = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Rounded rectangle distance
      const dx = Math.max(0, Math.abs(x - center + 0.5) - (center - rCorner));
      const dy = Math.max(0, Math.abs(y - center + 0.5) - (center - rCorner));
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > rCorner) {
        // Outside rounded rect
        buf[idx] = 0; buf[idx + 1] = 0; buf[idx + 2] = 0; buf[idx + 3] = 0;
        continue;
      }

      // Background gradient: dark teal #0d2b24 to #123d32
      const grad = (x + y) / (size * 2);
      let r = Math.round(13 + grad * 5);
      let g = Math.round(43 + grad * 18);
      let b = Math.round(36 + grad * 14);
      let a = 255;

      // Border highlight around edge
      if (dist > rCorner - 1.2 || x < 1 || x >= size - 1 || y < 1 || y >= size - 1) {
        r = Math.round(r * 1.5 + 30);
        g = Math.round(g * 1.5 + 60);
        b = Math.round(b * 1.5 + 50);
      }

      // Stylized central emblem: Chinese "中" box + vertical bar
      const nx = (x - center) / size;
      const ny = (y - center) / size;

      // Vertical line: x in [-0.06, 0.06], y in [-0.34, 0.34]
      const inVBar = Math.abs(nx) <= 0.055 && Math.abs(ny) <= 0.34;
      // Outer box: x in [-0.28, 0.28], y in [-0.18, 0.18]
      const inBoxOuter = Math.abs(nx) <= 0.27 && Math.abs(ny) <= 0.17;
      const inBoxInner = Math.abs(nx) <= 0.18 && Math.abs(ny) <= 0.08;
      const inBox = inBoxOuter && !inBoxInner;

      // Badge accent "vi" dot in bottom right: x in [0.14, 0.32], y in [0.14, 0.32]
      const inDot = (nx - 0.2) * (nx - 0.2) + (ny - 0.2) * (ny - 0.2) <= 0.006;

      if (inVBar || inBox) {
        // Glowing cyan-emerald #00e5a3
        r = 0; g = 229; b = 163;
      } else if (inDot) {
        // Bright gold/amber #ffcf40 for VN accent
        r = 255; g = 207; b = 64;
      }

      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = a;
    }
  }
  return buf;
}

function generateIcons() {
  const iconDir = path.join(PUBLIC, 'icon');
  ensureDir(iconDir);
  const sizes = [16, 32, 48, 128];
  for (const size of sizes) {
    const outPath = path.join(iconDir, `${size}.png`);
    const rgba = renderIconRgba(size);
    const png = createPng(size, size, rgba);
    fs.writeFileSync(outPath, png);
    console.log(`✔ Generated icon: public/icon/${size}.png (${png.length} bytes)`);
  }
}

function copyTesseractAssets() {
  const tesseractDir = path.join(PUBLIC, 'vendor', 'tesseract');
  const coreDir = path.join(PUBLIC, 'vendor', 'tesseract-core');
  ensureDir(tesseractDir);
  ensureDir(coreDir);

  // 1. Worker
  const srcWorker = path.join(ROOT, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
  const dstWorker = path.join(tesseractDir, 'worker.min.js');
  if (fs.existsSync(srcWorker)) {
    fs.copyFileSync(srcWorker, dstWorker);
    console.log(`✔ Copied Tesseract worker to public/vendor/tesseract/worker.min.js`);
  } else {
    console.warn(`⚠ Warning: ${srcWorker} not found`);
  }

  // 2. Core
  const srcCoreDir = path.join(ROOT, 'node_modules', 'tesseract.js-core');
  if (fs.existsSync(srcCoreDir)) {
    const coreFiles = fs.readdirSync(srcCoreDir).filter(f => f.startsWith('tesseract-core') && (f.endsWith('.js') || f.endsWith('.wasm')));
    for (const file of coreFiles) {
      fs.copyFileSync(path.join(srcCoreDir, file), path.join(coreDir, file));
    }
    console.log(`✔ Copied ${coreFiles.length} Tesseract core files to public/vendor/tesseract-core/`);
  } else {
    console.warn(`⚠ Warning: ${srcCoreDir} not found`);
  }
}

async function downloadTessdata() {
  const tessdataDir = path.join(PUBLIC, 'vendor', 'tessdata');
  ensureDir(tessdataDir);

  const files = [
    { name: 'chi_sim.traineddata.gz', minSize: 1000000 },
    { name: 'chi_tra.traineddata.gz', minSize: 1000000 },
    { name: 'eng.traineddata.gz', minSize: 1000000 },
  ];

  for (const item of files) {
    const dest = path.join(tessdataDir, item.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size >= item.minSize) {
      console.log(`✔ Tessdata present: ${item.name} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(2)} MB)`);
      continue;
    }

    const url = `https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_fast/${item.name}`;
    console.log(`⬇ Downloading ${item.name} from ${url}...`);
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      fs.writeFileSync(dest, Buffer.from(arrayBuffer));
      console.log(`✔ Downloaded ${item.name} (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
    } catch (err) {
      console.error(`❌ Failed to download ${item.name}: ${err.message}`);
      throw err;
    }
  }
}

async function main() {
  console.log('--- Preparing TranslateChina Assets ---');
  generateIcons();
  copyTesseractAssets();
  await downloadTessdata();
  console.log('--- All Assets Prepared Successfully ---');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
