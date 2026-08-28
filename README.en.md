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

- Boots the bundled DSH server (`127.0.0.1:3080`) and opens a desktop window — zero command-line interaction
- Ships a portable Node.js plus the official `@deepseek-ai/dsh` runtime — **fully self-contained installer**
- Tray-resident (close-to-tray, single instance) with a first-run DeepSeek API key setup page
- Bundles a small personal plugin: billing peak/off-peak badge and `/usage` balance command

> ⚠️ This is an **unofficial** third-party wrapper, not affiliated with DeepSeek. All DeepSeek trademarks belong to their respective owners.

## Features

| Version | Features |
| --- | --- |
| **0.7.0** (latest) | Minimalist redesign: removed pet & side panel; added peak/off-peak billing badge (with countdown); added `/usage` and `/explain-usage` commands |
| 0.6.0 | DSH runtime 0.1.1-rc.1; vision models, OAuth login; new `.credentials.yaml` format support; drag-fix rework |
| 0.5.x | Native transparent floating pet + side panel (removed since 0.7.0) |
| 0.3.0 | System tray dwell, single instance |

Full changelog: [CHANGELOG.md](CHANGELOG.md) (Chinese)

## Installation

Download the latest `DeepSeek Harness Setup <version>.exe` (~150 MB, NSIS installer) from **GitHub Releases**:

1. Run the installer — default installs to your user directory, custom path allowed
2. On first launch a setup window appears: enter your DeepSeek API Key (`sk-...`, get one at [platform.deepseek.com](https://platform.deepseek.com))
3. Save and enter the main window; the key is reused on later launches

> Tips: clicking **X hides to tray** (server keeps running); use the tray menu to open / open-in-browser / quit.
> No Node.js / pnpm / DSH or any other environment needed.

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
