/**
 * Post-build: apply icon to win-unpacked/Bahuckel.exe, then repack zip.
 * rcedit cannot modify the portable exe (self-extracting stub); it gets its icon from electron-builder.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { readdir } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const releaseDir = path.join(root, 'release');
const winUnpacked = path.join(releaseDir, 'builder-out', 'win-unpacked');
const iconPath = path.join(root, 'build', 'icon.ico');

if (!fs.existsSync(iconPath)) {
  console.warn('apply-icon: build/icon.ico not found');
  process.exit(0);
}
if (!fs.existsSync(releaseDir)) {
  console.warn('apply-icon: release dir not found');
  process.exit(0);
}

const rcedit = (await import('rcedit')).default;
// Only apply to win-unpacked exe; portable exe can't be modified by rcedit
const exePath = path.join(winUnpacked, 'Bahuckel.exe');
const exePaths = fs.existsSync(exePath) ? [exePath] : [];

for (const exeFile of exePaths) {
  const doRcedit = () => rcedit(exeFile, { icon: iconPath });
  try {
    await doRcedit();
    console.log('Applied icon to', path.relative(root, exeFile));
  } catch (err) {
    console.warn('apply-icon failed (antivirus may lock file), retrying in 2s...:', err.message);
    await new Promise((r) => setTimeout(r, 2000));
    try {
      await doRcedit();
      console.log('Applied icon to', path.relative(root, exeFile), '(retry succeeded)');
    } catch (retryErr) {
      console.warn('apply-icon retry failed, exe will use default icon:', retryErr.message);
    }
  }
}

// Repack zip so the exe inside has the correct icon
const builderOutDir = path.join(releaseDir, 'builder-out');
const zipFiles = fs.existsSync(builderOutDir) ? (await readdir(builderOutDir)).filter(f => f.endsWith('.zip') && f.includes('win')) : [];
for (const zipName of zipFiles) {
  const zipPath = path.join(builderOutDir, zipName);
  try {
    const archiver = (await import('archiver')).default;
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    await new Promise((resolve, reject) => {
      output.on('close', () => { console.log('Repacked', zipName); resolve(); });
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(winUnpacked, false);
      archive.finalize();
    });
  } catch (err) {
    console.warn('Repack zip failed:', err.message);
  }
}
