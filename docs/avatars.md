# Bahuckel avatars — how they work (reference)

Use this if avatar images disappear, show wrong initials, or load from the wrong host.

---

## Overview

1. **Server** stores each user’s avatar as a file under `data/avatars/` and a filename in the user record.
2. **HTTP** exposes them at `GET /api/avatar/:username` (no long cache — browser should revalidate).
3. **Client** builds that URL with the correct **API base** (same server as the WebSocket), shows an `<img>`, and falls back to the **first letter** of the username if the image fails.
4. **Cache busting** (`?v=timestamp`) forces reloads after avatar changes or when server data refreshes.

---

## Server (`server/src`)

### Storage

- **Directory:** `{DATA_DIR}/avatars/` (see `auth.ts`, `AVATARS_DIR`).
- **On disk filename:** `sanitizeAvatarFilename(username) + .png` or `.jpeg`  
  Example: user `Alice` → `Alice.png` or sanitized characters only, e.g. `a_b.png`.
- **User record** (`users.json` / loaded users): `avatarUrl` holds the **filename** (e.g. `Alice.jpeg`), not a full URL.
- **Legacy:** `avatarUrl` starting with `data:image/` is treated as legacy; `nukeAllAvatarsIfNeeded()` can clear bad states on startup.

### Security

- `avatarFilenameMatchesUser(filename, username)` must pass: file must be exactly  
  `{sanitizeAvatarFilename(username)}.png` or `.jpeg`.  
  This blocks serving the wrong file if the DB is corrupted.

### Setting an avatar

- WebSocket message: `set_my_avatar` with `dataUrl` (PNG/JPEG/WebP base64).
- `setUserAvatar()` in `auth.ts` decodes, writes the file, sets `user.avatarUrl` to the filename, saves users.

### Serving the image

- Route: `GET /api/avatar/:username` in `server/src/index.ts`.
- Resolves path via `getAvatarPath(username)` → `res.sendFile(path)`.
- Headers: `Cache-Control: no-store, no-cache, must-revalidate`.

### Broadcast

- After a successful save, server broadcasts `{ type: 'user_avatars_update', userHasAvatar: [...] }` so clients bump cache bust and refetch.

---

## Client (`client/src`)

### URL construction — `utils/avatarUrl.ts`

- **Path:** `/api/avatar/${encodeURIComponent(username)}`
- **Full URL:** `new URL(path, base).href` where **base** comes from `getApiBase()`:

| Priority | Source |
|----------|--------|
| 1 | Electron: `window.bahuckel.getServerUrl()` (must be `http://` or `https://`) |
| 2 | Query: `?server=https://...` |
| 3 | `sessionStorage` key `bahuckel-server-base` (saved from `?server=` via `persistServerBaseFromUrl()`) |
| 4 | `window.location.origin` (SPA served from same host as API) |

- **Cache bust:** optional `cacheBust` number → append `?v=<number>` (or `&v=` if query already exists).

**Typical failure:** avatars request `http://localhost:3001` but the app is opened from another origin without `?server=` or Electron URL — then base is wrong and images 404 or hit the wrong host.

### `persistServerBaseFromUrl()`

- Called on app load (`App.tsx`).
- Reads `?server=` from the URL and stores it in `sessionStorage` so **after** `history.replaceState` removes the query, avatar URLs still point at the real API.

### `<Avatar />` — `components/Avatar.tsx`

- Props: `username`, optional `cacheBust`, class names for img / initial.
- `src={getAvatarImageUrl(username, cacheBust)}`.
- **`key` on `<img>`** includes `cacheBust` so React remounts the image when bust changes.
- **`onLoad`:** hides the letter fallback `<span>` (display none) so you don’t see both.
- **`onError`:** hides the `<img>`, shows the `<span>` with the first character of `username` (uppercase).

### Cache bust state — `App.tsx`

- `avatarCacheBust` state, initialized with `Date.now()`.
- Bumped to `Date.now()` when:
  - `servers_and_channels` is received (reconnect / full sync),
  - `user_avatars_update` is received (anyone’s avatar changed).
- Passed down as `avatarCacheBust` to `Avatar` usages (chat, channel list, user bar, settings, users panel, voice, etc.).
- After saving avatar in settings, parent typically bumps bust via the same mechanism (update flow + `user_avatars_update`).

### Local preview in settings

- Settings may still use a **data URL** for preview before save; `getAvatarImgSrc()` in `avatarUrl.ts` is for that legacy path only — **live** avatars in the app use the HTTP URL above.

---

## Quick debugging checklist

1. **Network tab:** request `GET /api/avatar/<username>` — status 200? URL host matches your server?
2. **Wrong host:** set `?server=https://your-server:port` once or fix Electron `getServerUrl`.
3. **404:** user has no avatar file or `avatarUrl` / filename mismatch — check `data/avatars/` and user record in server data.
4. **Stale image:** confirm `user_avatars_update` fires and `avatarCacheBust` changes (check React devtools or log `getAvatarImageUrl` URLs for `?v=`).
5. **Only initials:** image failed — check CORS, 404, mixed content (HTTPS page vs HTTP avatar).

---

## Primary files

| Area | File |
|------|------|
| URL + session | `client/src/utils/avatarUrl.ts` |
| UI | `client/src/components/Avatar.tsx` |
| Bust + subscribe | `client/src/App.tsx` |
| HTTP route | `server/src/index.ts` |
| Files + WS save | `server/src/auth.ts` |

---

*Last aligned with the Bahuckel client/server layout in-repo; if paths change, update this doc in the same commit.*
