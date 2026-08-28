# DeepSeek Harness Desktop (Windows)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows%2010%2F11-blue.svg)]()

> 自用的 DeepSeek Harness 桌面客户端 —— Electron 薄壳 + 完全自包含运行环境。
>
> A self-contained Windows desktop client for DeepSeek Harness, built as a thin Electron shell around the official DSH runtime.

**English intro:** This is a personal desktop wrapper for DeepSeek Harness on Windows. It bundles a portable
Node.js runtime plus the official `@deepseek-ai/dsh` runtime, so you do **not** need to install Node.js,
pnpm, or DSH separately — just download the installer and run it. Readme 以中文为主，English summary 见文末。

---

## 这是什么 / What is this

DeepSeek Harness 官方以命令行/浏览器形式分发。本项目用 Electron 把它包装成一个 **Windows 桌面应用**：

- 启动时自动拉起内置 DSH 服务（`127.0.0.1:3080`），打开桌面窗口，无需任何命令行操作
- 内置 portable Node.js v24 + 官方 `@deepseek-ai/dsh` runtime，**完全自包含**，收件人零安装依赖
- 系统托盘驻守（点 X 隐藏到托盘，服务不中断）、单实例
- 首次启动弹出 API Key 配置页，保存在 `~/.dsh/.credentials.yaml`
- 内置「峰谷」插件（`dsh-fenggu`）：计费时段徽章 + `/usage` 余额查询（自用定制插件）

> ⚠️ 本项目是**非官方**的第三方包装器，与 DeepSeek 官方无关。DeepSeek Harness 及 DeepSeek 相关商标归其
> 各自所有者所有。内置 `@deepseek-ai/dsh` runtime 以 MIT 协议在 npm 上分发（见 [LICENSES](#licenses)）。

## 安装 / Installation

从 **GitHub Releases** 下载最新的 `DeepSeek Harness Setup <版本>.exe`：

- 安装包为自包含 NSIS 安装器（约 150 MB），默认安装到用户目录，可选安装路径
- 首次启动后会显示配置窗口：填入 DeepSeek API Key（`sk-...`，从 [platform.deepseek.com](https://platform.deepseek.com) 获取），保存后即进入主界面
- 应用常驻系统托盘：点击窗口右上角 X 会**隐藏到托盘**而不是退出；托盘菜单可打开窗口 / 在浏览器打开 / 退出

> 无需预装 Node.js / pnpm / DSH / 其他任何环境。

## 功能特性 / Features

| 版本 | 特性 |
| --- | --- |
| 0.7.0 (当前) | **极简主义重构**：移除桌宠与右侧栏；新增峰谷计费时段徽章（峰时段琥珀色 / 谷时段翡翠色，含切换倒计时）；新增 `/usage`（账户余额与计费时段）与 `/explain-usage` 命令 |
| 0.6.0 | DSH runtime 升级 0.1.1-rc.1；兼容 `.credentials.yaml` 新格式；拖动滑移根治 |
| 0.5.x | 原生透明悬浮桌宠 + 右侧面板（0.7.0 已移除） |
| 0.3.0 | 系统托盘后台驻守 |

完整更新日志见 [CHANGELOG.md](CHANGELOG.md)。

## 项目结构 / Structure

```text
dsh-desktop/
├── main.js          # Electron 主进程：拉起/停靠 DSH 服务、托盘、首次配置窗口、内置插件引导
├── preload.js       # 首次配置窗口的 IPC 桥（contextBridge）
├── package.json     # electron-builder 配置（NSIS 目标，自包含 extraResources: runtime/）
├── build/icon.png   # 安装包/应用图标
├── assets/          # 托盘图标等运行时资源
├── runtime/         # （本地构建用，不入库）portable Node v24 + dsh runtime 安装产物
│   ├── node/        #   portable Node.js
│   └── dsh/         #   @deepseek-ai/dsh 运行时（npm 安装，含内置插件）
└── release/         # （构建输出，不入库）NSIS 安装包，经 GitHub Releases 分发
```

## 从源码构建 / Build from source

前置条件：本机已安装 Node.js（>= 20）与 npm。

```powershell
cd package/dsh-desktop

# 1. 安装构建依赖（electron + electron-builder，仅 devDependencies）
npm install

# 2. 准备自包含 runtime（portable Node v24 + 官方 DSH runtime 0.1.1-rc.2）
#    注意：runtime 不在本仓库内。请保证 runtime/ 目录存在，其布局：
#    runtime/node（portable Node.js v24.16.0）与 runtime/dsh（官方 DSH runtime 安装产物）
#    可从本仓库的 Release 安装包内解出（安装后位于安装目录的 resources/runtime/），
#    或对照 scripts/prepare-runtime.ps1 自行准备。

# 3. 打包 NSIS 安装器（输出到 release/）
npm run dist

# 4. 发布：将 release/DeepSeek Harness Setup <版本>.exe 上传到 GitHub Releases
```

自动化脚本：

- `scripts/prepare-runtime.ps1` — 准备 runtime（Node + DSH runtime）
- `scripts/publish-release.ps1` — 打包并把安装包 + 发布说明暂存到 `dist-upload/`，附带 `gh`/git 命令
- `.github/workflows/build.yml` — 手动触发 / tag 触发构建（需要 Secrets 提供 runtime 缓存，非必须）

## 工作原理 / How it works

1. `main.js` 在 `app.whenReady()` 后探测 `127.0.0.1:3080` 是否已有 DSH 服务；没有则用内置
   `runtime/node/node.exe` 启动 `@deepseek-ai/dsh` 的 `bin.js web --no-open`。
2. 服务就绪后，若 `~/.dsh/.credentials.yaml` 中已有 API Key 则直接开主窗口，否则弹出首次配置页。
3. 首次配置通过 preload 桥把 Key 写入 credentials 文件（兼容 `version: 1 / refs:` 新格式与旧扁平格式，
   且保留已有 refs）。
4. 内置插件（`dsh-fenggu`）在首次启动时拷贝进 `~/.dsh/profiles/web` 的 bundle 列表（幂等、无重复
   loader id 的 bug），并清理旧版本遗留插件（0.5.x/0.6.x 的宠物/侧栏）。
5. 窗口关闭 = 隐藏到托盘；托盘菜单「退出」才真正结束（同时 taskkill 掉服务进程）。

## Releases 发布指引 / Publishing a release

```powershell
# 打版本 tag 并推送（触发 CI 或本地构建后上传）
git tag v0.7.0
git push origin v0.7.0
```

然后在 GitHub 仓库页 **Releases → Draft a new release**，tag 选 `v0.7.0`，标题写 `v0.7.0`，
附上 CHANGELOG 内容（仓库内已有一份），并把 `DeepSeek Harness Setup 0.7.0.exe` 与
`.exe.blockmap` 拖进附件框。历史版本同理（每个 tag 一个 Release）。

## Licenses

- 本项目壳源码（`main.js` / `preload.js` / `package.json` / 构建配置）：**MIT**（见 [LICENSE](LICENSE)）
- 内置 DSH runtime（`@deepseek-ai/dsh`、`@deepseek-ai/dsh-web-frontend` 等）：**MIT**（npm 分发）
- 内置插件 `dsh-fenggu`：**MIT**
- 内置 portable Node.js：Node.js 许可证（详见 [nodejs.org](https://nodejs.org)）

## English summary

A minimalist, self-contained **Windows desktop client** for DeepSeek Harness:

- Thin Electron shell (~400 LOC) that boots the official DSH runtime on `127.0.0.1:3080`
- Ships a portable Node.js v24 + official `@deepseek-ai/dsh@0.1.1-rc.2` runtime — **no Node/pnpm/DSH needed**
- Tray-resident (close-to-tray), single-instance, first-run API key setup page
- Bundles a tiny `dsh-fenggu` plugin adding peak/off-peak billing badge and `/usage` balance command
- Installers (~150 MB, NSIS) are published on **GitHub Releases**; this repo holds the MIT-licensed
  wrapper source code only (the `runtime/` bundle is not tracked, see *Build from source*)

> Unofficial project. Not affiliated with DeepSeek. All trademarks belong to their owners.
