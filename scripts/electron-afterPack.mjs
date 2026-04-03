/**
 * AfterPack hook for electron-builder: force icon onto Windows exe via rcedit.
 * electron-builder's built-in icon embedding can fail; this ensures it's applied.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const iconPath = path.join(root, 'build', 'icon.ico');

export default async function afterPack(context) {
  if (process.platform !== 'win32') return;
  if (!context.appOutDir) return;
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  if (!fs.existsSync(exePath)) return;
  if (!fs.existsSync(iconPath)) {
    console.warn('electron-afterPack: build/icon.ico not found, skipping icon');
    return;
  }
  const rcedit = (await import('rcedit')).default;
  const doRcedit = () => rcedit(exePath, { icon: iconPath });
  try {
    await doRcedit();
    console.log('Applied icon to', exePath);
  } catch (err) {
    console.warn('electron-afterPack: rcedit failed (antivirus may be locking the file):', err.message);
    await new Promise((r) => setTimeout(r, 1500));
    try {
      await doRcedit();
      console.log('Applied icon to', exePath, '(retry succeeded)');
    } catch (retryErr) {
      console.warn('electron-afterPack: retry failed, exe will use default icon:', retryErr.message);
    }
  }
}
