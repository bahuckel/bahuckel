# Bahuckel — acknowledgments

**Project license:** The Bahuckel application and its original source code are licensed under the terms in the root [`LICENSE`](LICENSE) file (MIT-style grant with additional terms for resale and third-party hosted services). Third-party libraries and assets remain under their own licenses as listed below.

Special thanks to everyone who made this project possible. Bahuckel builds on open tools, community assets, and services that deserve credit.

## Runtime & platform

- **Node.js** — server runtime and tooling for the WebSocket backend and packaging.
- **Electron** — desktop shell for the Bahuckel client when distributed as a Windows/Linux/macOS app.
- **Vite** — frontend build tooling and dev server.
- **React** — UI library for the web client.
- **TypeScript** — typed JavaScript across client and server code.

## Icons & UI artwork

- **Feather Icons** (MIT) — inline SVG paths used in the client for toolbar and control icons (e.g. microphone, volume, settings, Wi‑Fi-style latency, phone, power). See `client/src/components/UiIcons.tsx`.

## Emoji in chat

- **Twemoji** (CC-BY 4.0) — emoji graphics served from the same origin as the app (`/emoji/…`) for the emoji picker and inline emoji rendering. See `client/src/emoji.ts` and project documentation under `docs`.

## GIF search

- **Giphy** — GIF search and previews are loaded via the Giphy public API (see `client/src/utils/giphy.ts` and server routes under `/api/gifs/*`). API keys are server-side only; usage is subject to [Giphy’s developer terms](https://developers.giphy.com/).

## Voice & sound effects

- **ElevenLabs** — if you use sound effects generated with ElevenLabs (e.g. voice channel join/leave notifications), follow their license and terms for your tier and use case. Place exported files under `client/public/sounds/` (see `client/public/sounds/README.txt`) so they ship with the app.

## Optional / infrastructure

- **sql.js** — embedded SQLite in the Node server for persistence where used.
- **WebRTC** — built into browsers for voice and screen sharing; STUN may use public providers such as Google’s STUN servers (see `VoicePanel` / ICE configuration).
- **Cloudflare** (optional) — `cloudflared` can be bundled with the server GUI for tunnels; subject to Cloudflare’s terms.

## How to contribute credits

If you add a new asset, dependency, or service, add a short entry here with the name, license (if any), and where it appears in the repo. That keeps shipping and distribution clear for everyone.

---

*This file is maintained by the project authors and is not legal advice. Always verify licenses for your own distribution and commercial use.*
