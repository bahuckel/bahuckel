#!/usr/bin/env node
/**
 * Kills Bahuckel/Electron processes and clears output so electron-builder can overwrite app.asar.
 * /T = kill process tree (child processes). File locks can persist after exit.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const winUnpacked = path.join(root, 'release', 'builder-out', 'win-unpacked');

const names = ['Bahuckel.exe', 'Bahuckel Server.exe', 'electron.exe'];
for (const name of names) {
  try {
    execSync(`taskkill /IM "${name}" /F /T 2>nul`, { stdio: 'ignore', windowsHide: true });
  } catch {
    /* ignore */
  }
}
await new Promise((r) => setTimeout(r, 1500));

// Remove win-unpacked so electron-builder creates it fresh (avoids app.asar lock)
if (fs.existsSync(winUnpacked)) {
  for (let i = 0; i < 4; i++) {
    try {
      fs.rmSync(winUnpacked, { recursive: true });
      console.log('Cleared win-unpacked for fresh build');
      break;
    } catch (err) {
      if (i === 3) {
        console.error('Could not clear win-unpacked. Close Cursor, Explorer, and any Bahuckel windows, then retry.');
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
