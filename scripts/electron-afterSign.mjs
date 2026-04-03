/**
 * AfterSign hook: apply icon to Bahuckel.exe in win-unpacked.
 * Runs AFTER electron-builder's signAndEditResources, ensuring our icon wins
 * before zip/portable are built. Fixes exe in win-unpacked and inside zip.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const iconPath = path.join(root, 'build', 'icon.ico');

export default async function afterSign(context) {
  if (process.platform !== 'win32') return;
  if (!context?.appOutDir) return;
  const exeName = `${context.packager?.appInfo?.productFilename || 'Bahuckel'}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  if (!fs.existsSync(exePath)) return;
  if (!fs.existsSync(iconPath)) {
    console.warn('electron-afterSign: build/icon.ico not found, skipping icon');
    return;
  }
  try {
    const rcedit = (await import('rcedit')).default;
    await rcedit(exePath, { icon: iconPath });
    console.log('Applied icon to', exePath);
  } catch (err) {
    console.warn('electron-afterSign: rcedit failed:', err.message);
  }
}
