## Hi, I'm Bahuckel

A 👁️🐝Ⓜ️ engineer with 15 years across hardware and software. I got tired of expensive closed-source tools that rarely work properly, so I build the open alternatives myself — self-hosted, no telemetry, no accounts, no strings attached.

---

### Bahuckel-Hub — a self-hosted alternative to Discord and Slack

Text and voice for communities that would rather not hand their conversations to someone else's servers. Built around a simple rule: the server should learn as little as possible.

- **Nothing is collected.** No analytics, no profiling, no logs sold on. Not even an email address is required to sign up — there is no email field anywhere in the server.
- **End-to-end encrypted** — conversation keys are wrapped between clients and never reach the server in the clear, so it stores ciphertext it cannot read.
- **Post-quantum key exchange — beta, in testing.** On top of TLS, the client and server agree a session key with a *hybrid* handshake: **ML-KEM-768 alongside classical ECDH**, so it is only weaker than today's crypto if *both* are broken. The point is harvest-now-decrypt-later — traffic captured today should not become readable the day quantum hardware arrives. It needs a platform that provides ML-KEM: **OpenSSL 3.5+ on Linux, or Windows 11 24H2 / Server 2025 and newer**. Anywhere else the connection is plain TLS, exactly as before, and says so rather than pretending. Server owners can *require* it, which locks out clients that cannot do it — off by default, and deliberately awkward to turn on.
- **Designed so nobody outside your community learns anything about it** — not the members, not the chats, not the calls.
- **Run it on your own box**, or [get in touch](#contact) if you'd rather I host it for you on a managed VPS.

Currently a ground-up rewrite in **C# / .NET 10 / Avalonia**, with around 600 tests behind it. It was called *BahuckelChat* until September 2026. The original JS/TS Electron build never hit the performance targets I set for it, so it has been retired: [bahuckel-chat-electron-deprecated](https://github.com/bahuckel/bahuckel-chat-electron-deprecated).

- **Performance** — the C# rewrite is holding around 0.3% CPU and 160–185 MB of RAM while in a call.
- **Screen share** — any resolution and frame rate, including custom ones. You are limited only by how fast your GPU can encode frames and by your bandwidth; drop the resolution or the frame rate if you want the overhead lower.
- **Extras** — KLIPY GIF support (bring your own API key), plus live shared Kanban and whiteboard channel types.
- **Networking** — works out of the box on an open port. Behind NAT you will need port forwarding, a Cloudflare tunnel, ZeroTier or a similar VPN, unless you would rather pay for a VPS.
- **Long channels stay light** — a busy channel is not held in memory in one piece. Messages page in and out around you as you read, in both directions, and the client hands memory back on its own while you are idle.
- **It tells you when a certificate changes.** Self-hosted servers are pinned by fingerprint on first connection. If that fingerprint ever changes, you get the old one, the new one, and a password check before anything is re-trusted — not a login failure with no explanation.
- **Small comforts** — middle-click free-scroll, jump-to-latest, and a scrollbar you can actually hit.

**Plugins — features you don't want are features you don't pay for.** The owner of a community can upload a plugin and enable it, and it becomes a new channel type sitting alongside Text, Voice, Kanban and Whiteboard. Nothing ships enabled, and nothing you have not enabled is ever downloaded, loaded or drawn, so the parts you don't need cost you no disk, no memory and no CPU — which is the point. It is also how integrations with other software get in, enterprise or otherwise, without any of it being welded into the app for everybody else.

- **The server never runs plugin code.** It stores the package, validates it, and hands it out to members; it will not execute a DLL, spawn a process or evaluate a script from one. The *client* loads it, in its own isolated and unloadable context, and a plugin that throws gets an error panel rather than taking the app down with it.
- **A small, deliberate sandbox.** A plugin gets channel state it can read and write, a folder of its own, and outbound HTTPS — and that is the entire surface. No process spawn, no arbitrary filesystem, no native calls.
- **Coming, from me:** graphs and charts as a channel type, and a **BahuckelDiag** integration — so a channel can carry your fleet's health directly: which machine, when, where, and why it flagged something, in the same place your team is already talking.

### BahuckelDiag — predictive hardware diagnostics

Health monitoring for physical Windows and Linux servers that tells you something useful instead of drawing graphs at you.

It reads temperatures, SMART and NVMe attributes, ECC/WHEA machine-check errors, fan behaviour and system event logs, correlates them, and produces a plain-language diagnosis: **which component is probably failing, why it thinks so, and what to check** — with the evidence listed and conservative confidence, because "replace the DIMM" is not something you should say on a hunch. Runs as a single local dashboard or a small fleet reporting to one hub.

It also ships an **AskAI** agent, running on a local model, over your network, or through one of the big three APIs (Anthropic, Google, OpenAI). It can simulate incidents, read the live machine state, and propose diagnostic or recovery commands. How that is kept under control:

- **Nothing runs until you click Allow.** The model can only *propose* a command; you see the exact line before it executes, and the request expires if you leave it sitting.
- **Approval is re-checked at execution time**, against the current settings — not against whatever was in force when the command was proposed.
- **Commands are scoped to a folder you choose**, and any line naming a path outside it, or reaching for a system-changing verb, is refused.
- **Every run is written to an audit table**, so you can see afterwards exactly what was executed and when.
- **Web access is off by default.** With it on, the agent still refuses to fetch loopback, private-network, link-local and cloud-metadata addresses.
- **The local model runs in its own process**, so a model crash can't take the dashboard down with it.

`Python` · `FastAPI` · `SQLite` — in development, private for now.

### Elite Dangerous toolkit — EDEXO

A bundle of companion apps for **Exobiology**, **Travel**, **Trading** and **Colonization** — the tedious parts of the game, made quick, in a clean and deliberately simple interface. Most of these are coming to GitHub soon; an early colonization tracker is already up as [edct](https://github.com/bahuckel/edct).

- **EDEXO-Colonize** — a smarter way to track every open colonization project. Route planning that optimises for your actual cargo hold, plus commodity prices and availability. Auto-discovery of components through the Spansh API, and live journal following that records market values as you visit stations.
  - **Chrome extension** — a helper for [Inara](https://inara.cz), not a scraper. It never crawls and never fetches anything by itself. The app hands you a link to the commodity you are after; you open that page yourself, and the extension adds a couple of buttons to the top of it. Press one and it saves what is already rendered on your screen into your local database. Nothing runs in the background, no page you did not open is ever touched, and Inara serves exactly the one request your browser was going to make anyway.
- **EDEXO-Compare** — tired of flying to a planet, scanning it, and finding nothing worth a credit? This holds data from over 100,000 planets with biological life and compares them against the planet you just finished an FSS on. Not a deterministic answer — some species (the damn bacteria) share conditions with plants that actually pay — but far better than memorising the conditions for every species yourself.
- **EDEXO-Compare-Feeder** — an add-on for Compare that lets you feed in your own scans. Data stays local. Share it if you gather an impressive amount; credit appreciated, never required.

### Tools of the trade

`C#` · `Avalonia` · `Python` · `FastAPI` · `JavaScript` · `TypeScript` · `SQLite`

Also on here: [slick-tire-converter](https://github.com/bahuckel/slick-tire-converter) — converts street tire sizes to race slick sizes.

### Contact

Questions, VPS hosting, or just to say hello: **[support@bahuckel.com](mailto:support@bahuckel.com)**

If something here saved you a headache or some time, and you like the idea of software that will never collect, use or sell your data:

[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20me-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/bahuckel)

<sub>Self-hosted by default. If it collects, uses or sells your data, I didn't build it.</sub>

<sub>Opinions and projects here are my own, built in my own time outside working hours, and do not represent my employer or its values. Everything I build has one purpose: to give people a functional, free alternative to popular software, without turning them into the product.</sub>
