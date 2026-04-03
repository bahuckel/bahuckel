# v0 / Vercel — Bahuckel frontend brief

Paste sections below into **v0** (or any UI generator) to align the output with this product. Edit the **Product goals** and **Copy** sections to match what you want; keep **Design system** and **Layout** if you want Discord-like dark chat.

---

## One-shot prompt (copy this first)

```
Build a dark-mode web app UI for "Bahuckel" — a self-hosted voice + text chat client (Discord-inspired but independent branding).

Stack: Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui. Use semantic HTML and accessible patterns.

Layout: full viewport height, no page scroll on the shell — only inner panels scroll.

Structure:
- Left rail 72px: vertical server icons (squircles 48px, rounded-2xl), draggable order, active state with shadow.
- Next column 240px: server name header, text/voice channel list with # and speaker icons, nested voice participants, friends section at top when on home server.
- Main area: chat header (48px) with channel title + optional action buttons; message list with avatars, username, timestamp, grouped replies; composer with attach, emoji, contenteditable-style input, send button.
- Optional right panel 240px: member list with role groups, search, status dots.

Modals: login/register, settings (tabs), invite code, roles editor — all use the same surface tokens.

Do not use Discord’s logo or name in UI copy. Product name is Bahuckel.

Implement the exact color tokens from the design system below as CSS variables in :root and map Tailwind theme to them.
```

---

## Product goals (customize)

- **What it is:** Real-time community chat: servers, channels, DMs, voice presence, optional screen share (UI placeholders OK in v0).
- **Tone:** Calm, professional, gaming-adjacent but not childish.
- **Primary user actions:** Pick server → pick channel → read/send messages → manage account in settings.
- **Non-goals for a first v0 pass:** Real WebRTC wiring, real backend; use mock data and `console.log` handlers.

---

## Design system (source of truth)

Map these to Tailwind `theme.extend.colors` or keep as CSS variables.

| Token | Value | Usage |
|--------|--------|--------|
| `--bg-primary` | `#313338` | Main chat background |
| `--bg-secondary` | `#2b2d31` | Sidebars, headers |
| `--bg-tertiary` | `#1e1f22` | Deepest surfaces, inputs |
| `--bg-hover` | `#3f4147` | Row hover, subtle highlights |
| `--text-primary` | `#f2f3f5` | Primary text |
| `--text-secondary` | `#b5bac1` | Muted labels, timestamps |
| `--accent` | `#5865f2` | Primary buttons, links, active nav |
| `--accent-hover` | `#4752c4` | Button hover |
| `--border-subtle` | `rgba(255,255,255,0.06)` | Dividers, borders |
| Destructive | `#f23f43` / `#ed4245` | Mute/deafen active, errors |
| Success / speaking ring | `#43b581` / `#57f287` | Optional status |

**Typography:** `font-sans` — prefer **gg sans** if available, else **Noto Sans**, else system UI stack.

**Radius:** sm `8px`, md `12px`, lg `16px`. Server icons: **squircle** ~`16px` radius on `48px` box.

**Motion:** Micro-interactions only — `transition` ~150ms on hovers; server icon click `scale(0.92)`.

---

## Layout (ASCII)

```
┌────┬────────────────────────────┬──────────────────────────┬──────────────┐
│ S  │  Server / channels         │  #channel-name    [btns] │  Members     │
│ e  │  ─────────────────────     │  ─────────────────────── │  (optional)  │
│ r  │  Friends / DMs             │                          │              │
│ v  │  # general                 │  messages scroll         │  Online      │
│ e  │  # dev                     │                          │  — user      │
│ r  │  🔊 Lounge                 │                          │  — user      │
│ s  │    └ voice users           │  ─────────────────────── │              │
│    │                            │  [📎][😊] input [Send]   │              │
├────┴────────────────────────────┴──────────────────────────┴──────────────┤
│  [avatar] username    [mic][deaf][screen][settings]                         │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Shell:** `flex` row; **user bar** is fixed height at bottom of left column (`min-height` ~56px), not under the whole window unless you prefer Discord’s bottom bar globally.
- **Chat:** Messages area `flex-1 min-h-0 overflow-y-auto`; input **never** scrolls away.

---

## Components to generate

1. **AppShell** — three-column + optional fourth; responsive: collapse sidebars to drawers on small screens if requested.
2. **ServerRail** — icon buttons, tooltip on hover, drag placeholder (can be stub).
3. **ChannelSidebar** — collapsible category labels, channel rows, voice sub-rows with avatars and speaking outline.
4. **ChatHeader** — title + icon; secondary actions (pins, users toggle, etc.) as ghost buttons.
5. **MessageList** — message row: avatar | (username + time + body + attachments + reactions). Reply quote with left accent border.
6. **Composer** — file stub, emoji button (picker can be placeholder), multiline input, primary Send.
7. **UserBar** — avatar, name, control cluster (mic/deafen/screen/settings).
8. **Modal primitives** — overlay `bg-black/70`, panel `bg-[--bg-secondary] rounded-xl shadow-xl max-w-md`.

---

## v0 tips

- Ask v0 to **export one page** (e.g. `/chat`) with **mock servers/channels/messages** in a `lib/mock-data.ts` file.
- If output uses **light theme**, reply: “Force dark theme only; use the tokens above.”
- To iterate: “Tighten spacing to 8px grid” / “Increase touch targets on mobile” / “Add empty states for no messages.”

---

## File location

This brief lives in the Bahuckel repo as `docs/v0-vercel-frontend-brief.md`. Update the **One-shot prompt** when your priorities change.
