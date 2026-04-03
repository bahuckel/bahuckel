#!/usr/bin/env node
/**
 * Apply Windows workarounds for electron-builder:
 * 1. Skip chmod on 7za.exe (causes ENOENT on Windows in builder-util)
 * 2. Ensure app-builder.exe exists in builder-util's app-builder-bin
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, rmSync, symlinkSync } from "fs";
import { readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const nm = join(root, "node_modules");

// 1. builder-util 7za chmod patch (check both root and electron-builder's builder-util)
const sevenZaPaths = [
  join(nm, "builder-util", "out", "7za.js"),
  join(nm, "electron-builder", "node_modules", "builder-util", "out", "7za.js"),
];
const sevenZa = sevenZaPaths.find((p) => existsSync(p));
if (!sevenZa) {
  console.log("builder-util/7za.js not found, skipping chmod patch");
} else {
let content = readFileSync(sevenZa, "utf8");
if (!content.includes("process.platform !== 'win32'")) {
  content = content
    .replace(
      "async function getPath7za() {\n    await (0, fs_extra_1.chmod)(_7zip_bin_1.path7za, 0o755);\n    return",
      "async function getPath7za() {\n    if (process.platform !== 'win32') {\n        await (0, fs_extra_1.chmod)(_7zip_bin_1.path7za, 0o755);\n    }\n    return"
    )
    .replace(
      "async function getPath7x() {\n    await (0, fs_extra_1.chmod)(_7zip_bin_1.path7x, 0o755);\n    return",
      "async function getPath7x() {\n    if (process.platform !== 'win32') {\n        await (0, fs_extra_1.chmod)(_7zip_bin_1.path7x, 0o755);\n    }\n    return"
    );
  writeFileSync(sevenZa, content);
  console.log("Applied builder-util Windows chmod workaround");
} else {
  console.log("builder-util chmod patch already applied");
}
}

// 2. Ensure app-builder-bin is available at builder-util's nested path (junction on Windows, copy elsewhere)
const srcAb = join(nm, "app-builder-bin");
const srcExe = join(srcAb, "win", "x64", "app-builder.exe");
const destPaths = [
  join(nm, "builder-util", "node_modules", "app-builder-bin"),
  join(nm, "electron-builder", "node_modules", "builder-util", "node_modules", "app-builder-bin"),
];
const copyDir = (src, dest) => {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, name.name);
    const d = join(dest, name.name);
    if (name.isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
};
for (const destAb of destPaths) {
  const destExe = join(destAb, "win", "x64", "app-builder.exe");
  const destDir = join(destAb, "..");
  if (existsSync(srcExe) && !existsSync(destExe)) {
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    if (existsSync(destAb)) rmSync(destAb, { recursive: true });
    try {
      symlinkSync(srcAb, destAb, "junction");
      console.log("Linked app-builder-bin to builder-util (junction)");
    } catch (e) {
      copyDir(srcAb, destAb);
      console.log("Copied app-builder-bin to builder-util");
    }
    break;
  }
}
if (!existsSync(srcExe)) {
  console.warn("app-builder.exe not found at", srcExe, "- ensure app-builder-bin is installed");
}
