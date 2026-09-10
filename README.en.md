<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/%E4%B8%AD%E6%96%87-green?style=flat-square" alt="中文"></a>
  <a href="./README.en.md"><img src="https://img.shields.io/badge/English-blue?style=flat-square" alt="English"></a>
</p>

# DeepSeek Harness Desktop (Windows)

> A self-contained Windows desktop client for DeepSeek Harness — a thin Electron shell around the official DSH runtime. No Node.js / pnpm / DSH installation required.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows%2010%2F11-blue.svg)]()

## Overview

DeepSeek Harness is officially distributed as a CLI / browser app. This project wraps it into a **Windows desktop application**:

- Shows a startup page instantly (spinner + status text) while the bundled DSH server boots in the background (**auto-assigned free port**, `127.0.0.1:<random>`), then swaps to the app in the same window — zero command-line interaction
- Ships a portable Node.js plus the official `@deepseek-ai/dsh` runtime — **fully self-contained installer**
- Tray-resident (close-to-tray, single instance, single window) with a first-run DeepSeek API key setup page
- Bundles a small personal plugin: billing peak/off-peak badge and `/usage` balance command
- Startup failures show a copyable error page (reason / stderr / exit code / URL / retry) immediately
- An embedded **DeepSeek web panel** (`chat.deepseek.com`) in the left sidebar, with web conversations archived locally per day (see the notice below)

> ⚠️ This is an **unofficial** third-party wrapper, not affiliated with DeepSeek. All DeepSeek trademarks belong to their respective owners.

## ⚠️ Notice: No Reverse Proxying

Since 0.8.1 the app embeds the DeepSeek web app (`chat.deepseek.com`) in the left sidebar as a convenience panel. Please read before use:

- **Reverse proxying of any kind is prohibited**: do not use this project (including its embedded panel, text-extraction bridge, or conversation archive) to provide a proxy, relay, mirror, or multi-user sharing service, and do not use it to bypass official access controls, risk controls, or regional restrictions.
- The integration exists **solely for local, single-user convenience** — no more keeping a browser tab open next to the desktop app.
- **There is no server-side forwarding**: what is embedded is the official page itself, talking directly to the official site; the app only reads that page's **visible text** on this machine and stores it locally (`~/.dsh/web-chat/`). Nothing is uploaded or relayed to any third party.
- Use of this app is subject to DeepSeek's official terms of service; any consequences are the user's own.

> If the official side objects to this integration, stop using the related features.

## Features

| Version | Features |
| --- | --- |
| **0.8.1-rc.1** (current, Latest) | Embedded **DeepSeek web panel** (`chat.deepseek.com`, no browser tab needed) with per-day local archiving to `~/.dsh/web-chat/`; new "Session versions" management in Settings (list / probe / convert / hide / show); download-then-install upgrade flow; see **Notice: No Reverse Proxying**. Kernel 0.1.5-rc.1 |
| **0.8.0-rc.1** | Major kernel upgrade to **dsh 0.1.5-rc.1**: session format V3 (⚠️ no downgrade reads), `DeepSeek-V41-Flash` model, reworked right Sidebar, arbitrary file uploads, subagent queue/steer; in-app **check updates / one-click upgrade / rollback** (streamed download with progress) |
| **0.7.0** (stable, old kernel) | Minimalist redesign: removed pet & side panel; added peak/off-peak billing badge (with countdown); added `/usage` and `/explain-usage` commands |
| 0.6.0 | DSH runtime 0.1.1-rc.1; vision models, OAuth login; new `.credentials.yaml` format support; drag-fix rework |
| 0.5.x | Native transparent floating pet + side panel (removed since 0.7.0) |
| 0.3.0 | System tray dwell, single instance |

Full changelog: [CHANGELOG.md](CHANGELOG.md) (Chinese)

## Installation

Download the latest `DeepSeek Harness Setup <version>.exe` (NSIS installer; ~343 MB, ~150 MB for the old-kernel 0.7.0) from **GitHub Releases**:

1. Run the installer — default installs to your user directory, custom path allowed
2. On first launch a setup window appears: enter your DeepSeek API Key (`sk-...`, get one at [platform.deepseek.com](https://platform.deepseek.com))
3. Save and enter the main window; the key is reused on later launches

> Tips: clicking **X hides to tray** (server keeps running); use the tray menu to open / open-in-browser / quit.
> No Node.js / pnpm / DSH or any other environment needed.
> 0.7.1-rc.1 is a candidate release (Latest); pick 0.7.0 for the older, more conservative kernel.

## Project layout

```text
.
├── main.js          # Electron main process: DSH server lifecycle, tray, setup window, builtin plugin bootstrap
├── preload.js       # IPC bridge for the setup window
├── package.json     # electron-builder config (NSIS + self-contained extraResources)
├── assets/          # tray icon and other runtime assets
├── build/           # app icon
└── scripts/         # build helpers (prepare-runtime / publish-release)
```

## Build from source

Prerequisites: Node.js ≥ 20 and npm.

```powershell
npm install                    # electron + electron-builder (devDependencies only)

# Prepare the self-contained runtime (portable Node + official DSH runtime).
# The runtime/ folder is NOT tracked in this repo; either:
#   1) extract it from an installer: installed copy lives at resources\runtime\
#   2) run scripts\prepare-runtime.ps1 to download and assemble it
.\scripts\prepare-runtime.ps1

npm run dist                   # build NSIS installer into release\
```

## License

- This wrapper's source (`main.js` / `preload.js` / build config, etc.): **MIT** (see [LICENSE](LICENSE))
- Bundled DSH runtime (`@deepseek-ai/dsh` and friends): **MIT** (distributed via npm)
- Bundled plugin `dsh-fenggu`: **MIT**
- Bundled portable Node.js: Node.js license (see [nodejs.org](https://nodejs.org))
