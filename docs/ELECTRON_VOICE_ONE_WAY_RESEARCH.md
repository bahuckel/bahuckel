# Electron client: one-way voice (remote inaudible) — research handoff

This document is for **another engineer or agent** investigating why **voice works in a normal browser** but **incoming remote audio is not heard in the packaged Electron app**, while the remote user **can** hear the Electron user and **voice activity / names still light up** (so signaling and at least some WebRTC path appear alive).

---

## Symptoms (user report)

| Scenario | Outcome |
|----------|---------|
| User A: **Electron** (packaged `bahuckel`, loads `file://.../client/dist/index.html?server=...`) | **Cannot hear** remote user B’s voice |
| User A: **same machine / same account**, **browser** (Chrome/Edge) to **same server URL** | **Can hear** B |
| Remote user B | **Can hear** A (including when A is on Electron) |
| UI | Voice activity indicators / names for B still **work** (so some audio detection or signaling path is not dead) |

So the failure is **specific to playback of the remote peer’s audio in Electron**, not “no WebRTC at all.”

---

## Environment (from diagnostics dumps)

Typical values seen in exported WebRTC diagnostics JSON:

- **User agent**: `Mozilla/5.0 ... bahuckel/0.1.0 Chrome/144.x Electron/40.x Safari/537.36`
- **Page**: `file:///.../resources/app.asar/client/dist/index.html?server=http%3A%2F%2F...`
- **Server**: `ws://` or `http://` to host (e.g. `bahuckel.com`), not `localhost` only.
- **WebSocket / HTTP API origin** in dump: `electronGetServerUrl` matches the server the user selected.

---

## Architecture (relevant)

### Packaged app vs dev

- **Packaged**: `electron-main.cjs` → `createMainWindow(serverUrl)` loads **`loadFile(clientHtml, { query: { server: serverUrl } })`** so the app is **`file://`** with a `?server=` query string.
- **Dev (unpackaged)**: `loadURL(serverUrl)` — behaves like a normal browser page on the server origin.

### Preload (`preload-main.cjs`)

- Exposes `window.bahuckel.getServerUrl()` (sync IPC) so the client can call APIs/avatars when the page is `file://`.

### Voice (`client/src/components/VoicePanel.tsx`)

- Mesh-style **RTCPeerConnection** per remote peer; signaling via WebSocket messages (`webrtc_signal`, `voice_members`, etc.).
- **Initiator** (lexicographically smaller `clientId`) creates PC, adds local processed mic + optional screen-share tracks, sends offer.
- **Answerer** path waits for local mic (`waitForLocalAudioStream`) before `setRemoteDescription` + `addTrack` + `createAnswer` (avoids “recvonly with no sender” issues).
- **Remote audio playback**: `ontrack` for `kind === 'audio'` (non–screen-share) uses **`document.createElement('audio')`**, `audio.srcObject = stream`, `audio.play()`, `autoplay`, `playsinline` attribute. Elements are appended to `document.body`.

### Diagnostics export (`client/src/utils/webrtcDiagnostics.ts`)

- Registers PCs for admin export; includes `getStats()` snapshot, SDP, transceivers.

---

## Observations from WebRTC dumps (historical)

From JSON exports shared during debugging (e.g. `bahuckel-webrtc-diagnostics-*.json`):

- **`iceConnectionState` / `connectionState`**: often `connected`.
- **SDP**: audio `m=` line with **`sendrecv`** and Opus — not the classic “stuck recvonly” failure mode in some cases.
- **`inbound-rtp`**: `packetsReceived` / bytes can be **non-zero** (RTP arriving).
- **`media-playout`**: `totalSamplesCount` / `totalSamplesDuration` sometimes **0** or very low on the problematic side — suggests **decode/playout path** not feeding speakers even when RTP exists.
- **Transceiver snapshot**: sender `enabled: false` on **local** mic track can appear when **voice-activity gating** mutes the outgoing track; that is **expected** for transmit and **does not** explain “no incoming audio.”

Interpretation: **do not assume** the bug is only signaling; verify **decode + output** for Electron + `file://` + MediaStream on `<audio>`.

---

## What was already tried (and outcome)

1. **Electron-only Web Audio path** (remote: `AudioContext` → `MediaStreamSource` → `GainNode` → `destination`), browser kept `<audio>`  
   - **Reverted.** User still broken; Electron UA was always taking the branch when `window.bahuckel` exists.

2. **Reverted to universal `<audio>` for remote voice** (same as browser code path)  
   - **Still broken** in Electron per user.

3. **Autoplay policy**  
   - `app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')` before `app.ready` (in `electron-main.cjs` IIFE).  
   - `webPreferences.autoplayPolicy: 'no-user-gesture-required'` on the main `BrowserWindow`.  
   - **Still broken** per user.

So: **simple parity with browser playback + autoplay relaxations did not fix it.**

---

## Hypotheses worth investigating (next agent)

Ordered roughly by likelihood of “Electron + file:// + WebRTC MediaStream” issues:

1. **`audio.play()` rejection**  
   - Log `void audio.play().catch((e) => console.error)` with explicit error; check DevTools console in packaged app.

2. **Chromium / Electron bug with `HTMLMediaElement.srcObject` + remote MediaStream on `file://`**  
   - Try loading the **same client from `https://` server** (same bundle) in Electron via `loadURL(serverUrl)` in packaged mode to see if `file://` is the trigger.  
   - If voice works when not `file://`, the fix may be **serve client from server** or **custom `app://` protocol** instead of `file://`.

3. **Audio output device / routing**  
   - Electron on Windows: verify default output device; test `setSinkId` if supported (requires `experimentalFeatures` or Chromium version).  
   - Compare `navigator.mediaDevices.enumerateDevices()` in Electron vs browser.

4. **Duplicate `ontrack` / double attachment**  
   - Grep for all `ontrack` handlers; ensure remote audio isn’t attached twice or immediately removed.

5. **Track mute / `enabled` on receiver**  
   - In `ontrack`, log `e.track.muted`, `e.track.readyState`, `e.track.enabled` and `receiver.track` from `getTransceivers()`.

6. **Opus / decoder**  
   - If stats show `inbound-rtp` with `packetsReceived` but `audio` element silent, compare `codecId` and `inbound-rtp` `jitter` / `packetsLost` vs browser session.

7. **AEC / processing**  
   - Unlikely to affect *receive-only* path, but if Electron uses different audio stack, capture a trace with `chrome://webrtc-internals` equivalent in Electron if available.

---

## Key files (paths relative to repo root `bahuckel-app/`)

| File | Role |
|------|------|
| `electron-main.cjs` | Window creation, `loadFile` vs `loadURL`, `webPreferences`, autoplay switches, `unsafely-treat-insecure-origin-as-secure` |
| `preload-main.cjs` | `window.bahuckel` API |
| `client/src/components/VoicePanel.tsx` | WebRTC peer setup, `ontrack`, `<audio>` playback |
| `client/src/utils/webrtcDiagnostics.ts` | Stats export for debugging |
| `client/src/utils/serverOrigin.ts` | Server base URL for `file://` vs `http` |

---

## How to reproduce (for the next investigator)

1. Build/package the Electron app as the user does (same `builder-out` / `win-unpacked` flow).
2. Two users: **A = Electron**, **B = browser or second machine**.
3. Join **same voice channel**; both transmit mic.
4. Confirm: **B hears A**, **A does not hear B**; VAD/UI may still show B speaking.
5. Export WebRTC diagnostics from the app (admin path if available) or add temporary logging to `VoicePanel` `ontrack` and `audio.play()`.

---

## Minimal instrumentation suggestions (code)

Add **temporary** logging (remove before release):

```ts
// In VoicePanel ontrack (audio branch), after creating audio element:
void audio.play().catch((err) => {
  console.error('[VoicePanel] remote audio play failed', peerId, err);
});
audio.addEventListener('error', (e) => {
  console.error('[VoicePanel] audio element error', peerId, e);
});
```

Also log once per track:

```ts
console.log('[VoicePanel] remote track', {
  id: e.track.id,
  kind: e.track.kind,
  muted: e.track.muted,
  readyState: e.track.readyState,
  label: e.track.label,
});
```

---

## Success criteria

- **Electron user reliably hears** remote voice in the packaged app, **parity** with browser behavior on the same server.
- No regression: **browser still works**; **screen-share audio** still works if applicable.

---

## Meta

- User reports this **used to work** in early Electron builds; **no git bisect** was performed in this thread — a **historical diff** of `VoicePanel.tsx`, `electron-main.cjs`, and Electron version bumps could narrow the regression.
- If the repo is not under version control locally, **zip old known-good sources** and compare.

---

*Document generated for handoff — problem unresolved at time of writing.*
