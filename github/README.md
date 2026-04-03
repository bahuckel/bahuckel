# Publishing Bahuckel source to GitHub

This folder holds instructions and a **generated copy** of the project source (see `source/` after you run the export script). The export **excludes** `node_modules`, build outputs (`dist`, `release`, etc.), secrets, and local data so you only upload what is needed to **install dependencies and build**.

## 1. Generate a clean source tree

From the **repository root** (`bahuckel-app/`):

```bash
node scripts/export-github-source.mjs
```

This creates or refreshes **`github/source/`** with the same layout as the project, minus generated and third-party folders.

## 2. Choose how to upload

### Option A — Git from the export folder (simple for a new repo)

1. Create an **empty** repository on GitHub (no README/license if you already have them locally).
2. Open a terminal in **`github/source/`** and run **in this order** (do not skip `git commit`):

   ```bash
   cd github/source
   git init
   git add .
   git commit -m "Initial import: Bahuckel source"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

3. Replace `YOUR_USERNAME/YOUR_REPO` with your real GitHub URL.

   **Important:** `git commit` must run **before** `git push`. If you see `error: src refspec main does not match any`, you have no commits yet—run `git commit` first, then push again.

### If GitHub already has a README (e.g. you created the repo with “Add a README”)

Your first push may be **rejected** (unrelated histories). Either:

**Replace GitHub with your local export** (overwrites remote history—only if you’re sure):

```bash
git push -u origin main --force-with-lease
```

**Or merge** the remote README into your local repo:

```bash
git pull origin main --allow-unrelated-histories
# resolve conflicts if any, then:
git commit -m "Merge GitHub README"
git push -u origin main
```

### Option B — Git from the full project root (recommended long-term)

If the whole project folder **is** your git repo, you do **not** need `github/source/` for daily work:

1. Add a root `.gitignore` so you never commit `node_modules/`, `dist/`, `release/`, etc. (the repo already ignores common paths; adjust if needed.)
2. From the **project root**:

   ```bash
   git init
   git add .
   git status   # review
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

Use **`export-github-source.mjs`** only when you want a **clean zip** or a **one-off folder** to upload without your local `node_modules`.

### Option C — Upload a ZIP (no Git on your machine)

1. Run the export script (step 1).
2. Zip the contents of **`github/source/`** (everything inside `source` should be the repo root when unpacked).
3. On GitHub: **Add file → Upload files**, or create the repo first and upload.

## 3. After cloning (for anyone)

Anyone who clones the repo should:

```bash
npm install
npm run build
```

Adjust commands if your documented workflow differs (e.g. client-only builds).

## 4. What the export includes / excludes

**Includes:** application source (`client`, `server`, `shared`, `server-gui`, …), `scripts/`, `LICENSE`, `package.json`, `package-lock.json`, configs, `build/` icons, `patches/`, etc.

**Excludes:** the marketing `website/` workspace (not part of the OSS upload), `node_modules`, `dist`, `release`, `server/data`, `server/certs`, API key files, `.env`, and the `github/` export itself (to avoid nesting).

---

*Regenerate `source/` whenever you want a fresh snapshot for upload.*
