#!/usr/bin/env node
/**
 * Run Bahuckel.exe loading from Vite dev server (localhost:5173).
 * Prerequisite: run "npm run dev:client" in another terminal.
 * This gives hot-reload when using the exe.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const exePath = path.join(root, 'release', 'win-unpacked', 'Bahuckel.exe');

const env = { ...process.env, BAHUCKEL_SERVER_URL: 'http://localhost:5173' };
const proc = spawn(exePath, [], { env, stdio: 'inherit', cwd: root });
proc.on('exit', (code) => process.exit(code ?? 0));
