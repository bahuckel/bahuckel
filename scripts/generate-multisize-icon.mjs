/**
 * Generate a multi-size icon.ico from a single source image (PNG or ICO).
 * Windows uses different icon sizes for different contexts; a 256-only ico
 * can show the default Electron icon at larger sizes.
 *
 * Usage: node scripts/generate-multisize-icon.mjs
 *
 * Input: build/icon.ico or build/icon.png or build/icon-256.png
 * Output: build/icon.ico (overwrites)
 *
 * Requires: npm install --save-dev sharp sharp-ico
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, '..', 'build');
const sizes = [16, 32, 48, 256];

async function main() {
  const icoPath = path.join(buildDir, 'icon.ico');
  const pngPath = path.join(buildDir, 'icon.png');
  const png256Path = path.join(buildDir, 'icon-256.png');

  let inputSharp = null;

  if (fs.existsSync(png256Path)) {
    const sharp = (await import('sharp')).default;
    inputSharp = sharp(png256Path);
  } else if (fs.existsSync(pngPath)) {
    const sharp = (await import('sharp')).default;
    inputSharp = sharp(pngPath);
  } else if (fs.existsSync(icoPath)) {
    const sharpIco = (await import('sharp-ico')).default;
    const sharps = sharpIco.sharpsFromIco(icoPath);
    if (sharps.length === 0) {
      console.warn('icon.ico exists but has no usable images');
      process.exit(0);
    }
    const metas = await Promise.all(sharps.map((s) => s.metadata()));
    let bestIdx = 0;
    let bestSize = 0;
    for (let i = 0; i < metas.length; i++) {
      const w = metas[i].width || 0;
      const h = metas[i].height || 0;
      if (w * h > bestSize) {
        bestSize = w * h;
        bestIdx = i;
      }
    }
    inputSharp = sharps[bestIdx];
  }

  if (!inputSharp) {
    console.warn('No source icon found. Place icon.png, icon-256.png, or icon.ico in build/');
    process.exit(0);
  }

  const sharpIco = (await import('sharp-ico')).default;
  await sharpIco.sharpsToIco([inputSharp], icoPath, { sizes });
  console.log('Generated', icoPath, 'with sizes:', sizes.join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
