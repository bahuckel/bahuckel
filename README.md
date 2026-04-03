# Bahuckel

**Self-hosted voice and text chat** with a modern desktop and web client. Run your own server, keep your community’s data on your hardware, and use optional **E2EE** where the project supports it.

Bahuckel is built with **Electron** (desktop), **React** (web UI), and a **Node.js** server with WebSockets and WebRTC for voice and screen sharing.

---

## Features

- **Servers & channels** — organize communities the way you expect.
- **Direct messages & DM voice** — chat and voice outside public channels.
- **Voice channels & screen share** — WebRTC-based voice; share your screen when you need it.
- **Self-hosted** — you control the deployment, backups, and policies.
- **Dark UI** with optional **neon** accents in the app styling.
- **Open source** — inspect and extend the code; see [LICENSE](LICENSE) for terms.

---

## Repository layout

This repo is an **npm workspace** monorepo:

| Path | Role |
|------|------|
| `client/` | Web/Electron UI (React + Vite) |
| `server/` | Node.js API, WebSocket server, static app hosting |
| `shared/` | Shared types/utilities |
| `server-gui/` | Optional Electron wrapper around the server + Cloudflare tunnel helpers |
| `scripts/` | Build, packaging, and maintenance scripts |

The **marketing / landing site** is maintained in a separate private tree and is **not** included in this repository.

Third-party libraries and assets are summarized in [LICENSES.md](LICENSES.md).

---

## Requirements

- **Node.js** 20+ (recommended for development and for building the server single-executable on Windows).
- **npm** (ships with Node).

---

## Quick start (development)

From the **repository root** (required so npm workspaces install server and client dependencies):

```bash
npm install
```

Run pieces as needed (in separate terminals):

```bash
# Web client dev server (Vite)
npm run dev:client

# Backend (TypeScript / watch)
npm run dev:server
```

The client and server default to common local ports (see server and client configs). Use the **Server GUI** (`npm run dev:server-gui`) if you use that workflow.

Build everything that the main pipeline expects:

```bash
npm run build
```

---

## Desktop & server executables (Windows-focused scripts)

Examples (see `package.json` for the full list):

```bash
# Portable Windows client (Electron)
npm run dist:win:zip

# Server GUI installer / unpacked output (includes server exe build steps)
npm run build:server-gui
```

Output paths are under `release/` and related build directories after a successful run.

---

## License

The Bahuckel **application source** is released under the custom terms in [**LICENSE**](LICENSE) (permissive use with extra rules for **resale** and **third-party hosted “Bahuckel as a service”** — read the file before redistributing or offering hosting).

This is **not** SPDX “MIT” or “Apache-2.0”; GitHub may show a generic or custom license badge.

---

## Contributing

Issues and pull requests are welcome. For larger changes, opening an issue first helps align on direction.

---

## Links

- **Repository:** [github.com/bahuckel/bahuckel](https://github.com/bahuckel/bahuckel)

---

*Bahuckel is provided “as is”; see the license for limitations of liability.*
