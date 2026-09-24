<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/%E4%B8%AD%E6%96%87-green?style=flat-square" alt="中文"></a>
  <a href="./README.en.md"><img src="https://img.shields.io/badge/English-blue?style=flat-square" alt="English"></a>
</p>

# DeepSeek Harness Desktop (Windows)

> A self-contained Windows desktop client for DeepSeek Harness — a thin Electron shell around the official DSH runtime. No Node.js / pnpm / DSH installation required.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows%2010%2F11-blue.svg)]()

## Overview

DeepSeek Harness ships as a CLI / browser app — **and now with a desktop app of its own**. This project turns it into a **ready-to-run Windows installer**:

- **Since 0.9.1 the build is based directly on the official [`apps/desktop`](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop)** (the official Electron shell); this repo only adds Windows packaging plus a handful of patches (see [`patches/`](patches)). The 0.7–0.8 self-made thin shell stays in git history
- The official repo is vendored as a **submodule** (`vendor/deepseek-harness`); the kernel version comes solely from `vendor/kernel.lock.json` — upgrade = edit the lock + move the submodule
- **Fully self-contained installer** (portable Node.js + official `@deepseek-ai/dsh` runtime) — no environment setup, no command line
- Tray-resident (close-to-tray); on failure it shows copyable diagnostics (runtime dir / config dir / service URL / exit code / stderr tail)
- Bundles the first-party plugin `ds_zhuzhu_use`: peak/off-peak badge, `/usage` balance card, embedded **DeepSeek web** panel, pets, document previews …

> ⚠️ This is **unofficial** third-party packaging, not affiliated with DeepSeek. All DeepSeek trademarks belong to their respective owners.
> The desktop shell itself comes from the official [`apps/desktop`](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop); this repo's contribution is the packaging and patch layer only.

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
| **0.9.2-rc1** (current, Latest) | Kernel upgraded to **dsh 0.1.7-rc.1**; **Office conversion fixed** (engine 0.1.0: docx/xlsx/pptx all succeed, incl. real Excel/PPT files); **"installs but won't start" fixed** (dependency-closure collector restores link-ed first-party deps; patches now **7**); **no more zombie processes on repeated launches**, **tray quit kills the whole process tree**; **window shows before the backend is ready** (visible at 2.77 s → **0.55 s**); installer now asks the app to quit (`--dsh-quit`) with taskkill as fallback. ⚠️ RC |
| **0.9.1-alpha2** | **Switched to the official [`apps/desktop`](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop) shell** (this repo only adds Windows packaging + 4 patches); kernel **0.1.6-alpha.2**; patches add what upstream lacks: two tray entries + close-to-tray, Chat webview (`deepseek.com` family only), black-whale icon, failure diagnostics, `DSH_APP_VERSION`; trimmed Electron locales + maximum 7z compression (**-8.7 MB** → 284 MB) |
| **0.9.0-alpha1** | Last of the self-made shell: kernel **0.1.6-alpha.1**; hand-drawn titlebar; on-demand subagent drivers (installer 316 → 157 MB); plugin renamed **`ds_zhuzhu_use`**; pet assets moved out of the installer into "Settings → Pets → Pet resources" (from the `pet-assets` branch) |
| **0.8.1-rc.1** | Embedded **DeepSeek web panel** (`chat.deepseek.com`, no browser tab needed) with per-day local archiving to `~/.dsh/web-chat/`; "Session versions" management in Settings; download-then-install upgrade flow; see **Notice: No Reverse Proxying**. Kernel 0.1.5-rc.1 |
| **0.8.0-rc.1** | Major kernel upgrade to **dsh 0.1.5-rc.1**: session format V3 (⚠️ no downgrade reads), `DeepSeek-V41-Flash` model, reworked right Sidebar, arbitrary file uploads, subagent queue/steer; in-app **check updates / one-click upgrade / rollback** (streamed download with progress) |
| **0.7.0** (stable, old kernel) | Minimalist redesign: removed pet & side panel; added peak/off-peak billing badge (with countdown); added `/usage` and `/explain-usage` commands |
| 0.6.0 | DSH runtime 0.1.1-rc.1; vision models, OAuth login; new `.credentials.yaml` format support; drag-fix rework |
| 0.5.x | Native transparent floating pet + side panel (removed since 0.7.0) |
| 0.3.0 | System tray dwell, single instance |

Full changelog: [CHANGELOG.md](CHANGELOG.md) (Chinese)

## Installation

Download the latest installer from **GitHub Releases** (NSIS installer; ~302 MB for 0.9.2-rc1):

| Line | File name | Notes |
| --- | --- | --- |
| **0.9.2-rc1** (current) | `dsh-0.9.2-rc1-win-x64.exe` | official `apps/desktop` shell (product name **dsh**) |
| 0.9.0 / 0.9.1 | `dsh-0.9.*-win-x64.exe` | same line, kernel 0.1.6 |
| 0.8.x / 0.7.x | `DeepSeek Harness Setup <version>.exe` | older self-made shell (product name `DeepSeek Harness`) |

1. Run the installer — default installs to your user directory, custom path allowed
2. On first launch a setup window appears: enter your DeepSeek API Key (`sk-...`, get one at [platform.deepseek.com](https://platform.deepseek.com))
3. Save and enter the main window; the key is reused on later launches

> Tips: **X = close to tray** (the server keeps running); the tray menu opens the window / quits — **quitting takes down the whole process tree** (since 0.9.2).
> If the app is running during installation, the installer first asks it to quit and force-kills as a fallback (retryable).
> No Node.js / pnpm / DSH or any other environment needed.
> 0.9.2-rc1 is a release candidate; pick 0.7.0 for the more conservative older kernel (self-made shell).

## Project layout

```text
.
├── patches/                # patches applied on top of the official apps/desktop (core since 0.9.1)
├── plugins/ds_zhuzhu_use/  # first-party plugin (badge / usage / web panel / pets / previews …)
├── vendor/
│   ├── deepseek-harness/   # official repo (submodule, pinned to the commit in kernel.lock.json)
│   └── kernel.lock.json    # kernel reference: repo / tag / commit / version — the single source of truth
├── scripts/                # build-desktop / prepare-runtime / kernel-version / trim-runtime / publish-release
├── assets/                 # packaging assets (app icon …)
├── main.js                 # older self-made shell (0.7–0.8 line), kept for historical builds
├── preload.js              # ditto: IPC bridge of the old shell
├── package.json            # ditto: electron-builder config of the old shell
└── build/                  # app icon
```

## Build from source

Prerequisites: Node.js ≥ 20, pnpm, git.

**Since 0.9.1 (recommended: official `apps/desktop` + this repo's patches)**

```powershell
git submodule update --init --depth 1          # fetch the official repo (pinned by kernel.lock.json)
pwsh -NoProfile -File scripts\build-desktop.ps1 -AppVersion 0.9.1-alpha2
# The script: verifies lock <-> submodule commit -> applies patches\*.alpha2.patch in order
#             -> pnpm install -> runs the official Windows packaging flow -> drops the installer into release\
```

- Patches are applied in file-name order and **already-applied ones are skipped**; each can be re-checked with `git apply --check --reverse`
- The kernel version is never hand-written: `node scripts/kernel-version.mjs --verify` checks the submodule commit against the lock
- Upgrading the kernel = edit `vendor/kernel.lock.json` + move the submodule to the new tag, then build as usual

**0.7–0.8 (older self-made shell, still in the repo)**

```powershell
npm install
.\scripts\prepare-runtime.ps1   # assemble portable Node + official DSH runtime (runtime/ is not tracked)
npm run dist                    # build the NSIS installer into release\
```

> **Pet assets are not shipped in the installer**: they live on the `pet-assets` branch
> (`pets/*.zip` + `pets/index.json`) and are downloaded on demand via Settings → Pets →
> Pet resources into `~/.dsh/pets/resources/<id>/`. Adding a pet = upload a zip + one line
> in `index.json`, no client release needed.

## License

- Everything owned by this repo (`patches/` / `scripts/` / build config / the `ds_zhuzhu_use` plugin): **MIT** (see [LICENSE](LICENSE))
- Official desktop shell and kernel (`vendor/deepseek-harness`, i.e. [`apps/desktop`](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop) and `@deepseek-ai/dsh`): **MIT** (official repo)
- Bundled portable Node.js: Node.js license (see [nodejs.org](https://nodejs.org))
- Pet assets (`pet-assets` branch): **MIT**, following this repo
