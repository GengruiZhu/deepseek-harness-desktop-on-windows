<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/%E4%B8%AD%E6%96%87-green?style=flat-square" alt="中文"></a>
  <a href="./README.en.md"><img src="https://img.shields.io/badge/English-blue?style=flat-square" alt="English"></a>
</p>

# DeepSeek Harness Desktop (Windows)

> 自用开源的 DeepSeek Harness 桌面客户端 —— Electron 薄壳 + 完全自包含运行环境，免装 Node.js / pnpm / DSH，安装即用。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows%2010%2F11-blue.svg)]()

## 简介

DeepSeek Harness 官方以命令行 / 浏览器方式分发，**并且自带桌面端**。本项目把它做成**开箱即用的 Windows 安装包**：

- **0.9.1 起直接基于官方仓库的 [`apps/desktop`](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop) 构建**（官方 Electron 桌面壳），本仓库只做 Windows 打包 + 少量补丁（见 [`patches/`](patches)）；0.7–0.8 的自研薄壳保留在 git 历史里
- 官方仓库以 **submodule** 引入（`vendor/deepseek-harness`），内核版本只认 `vendor/kernel.lock.json` —— 升级内核 = 改 lock + 挪 submodule，不手写版本号
- 安装包**完全自包含**（portable Node.js + 官方 `@deepseek-ai/dsh` runtime），零环境依赖、无需任何命令行操作
- 系统托盘驻守（关窗常驻）；启动失败时给出可复制的诊断（运行时目录 / 配置目录 / 服务地址 / 退出码 / stderr 末尾）
- 内置自用插件 `ds_zhuzhu_use`：峰谷计费徽章 / `/usage` 余额卡片 / 内嵌**网页版 DeepSeek** 面板 / 宠物系统 / 文档预览 …

> ⚠️ 本项目是**非官方**的第三方打包，与 DeepSeek 官方无关。DeepSeek 相关商标归其各自所有者所有。
> 桌面壳本身来自官方 [`apps/desktop`](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop)；本仓库的贡献只在打包与补丁层。

## ⚠️ 声明：禁止反向代理

0.8.1 起，本应用在左侧栏内嵌 DeepSeek 网页版（`chat.deepseek.com`）作为便利面板。使用前请务必阅读：

- **禁止任何形式的反向代理**：不得利用本项目（含内嵌面板、文字提取桥、会话归档能力）对外提供代理、转发、镜像、多用户共享等服务，不得用于绕过官方访问控制、风控或地区限制。
- **集成目的仅为个人本机便利**：免去在使用桌面端时另开浏览器标签挂着网页版。
- **不存在服务端转发**：嵌在应用里的是官方页面本身，它直接访问官方站点；应用只在本机读取该页面的**可见文字**并保存到本地（`~/.dsh/web-chat/`），不上传、不转发给任何第三方。
- 使用本应用须遵守 DeepSeek 官方服务条款，由此产生的后果由使用者自行承担。

> 如官方对上述集成方式有异议，请停止使用相关功能。

## 功能特性

| 版本 | 特性 |
| --- | --- |
| **0.9.2-rc1**（当前，Latest） | 内核升级 **dsh 0.1.7-rc.1**；**Office 转换修好**（引擎换 0.1.0：docx/xlsx/pptx 全部成功，含真实 Excel/PPT）；**修复「装完打不开」**（依赖闭包收集器补齐 link 进来的第一方包依赖，补丁增至 **7 个**）；**重复启动不再留僵尸进程**、**托盘退出杀干净整棵进程树**；**启动时窗口先出来**（窗口可见 2.77 s → **0.55 s**）；安装器遇到「正在运行」改为先 `--dsh-quit` 再 taskkill 兜底。⚠️ rc 候选版 |
| **0.9.1-alpha2** | **改用官方 [`apps/desktop`](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop) 桌面壳**（本仓库只做 Windows 打包 + 4 个补丁）；内核 **0.1.6-alpha.2**；补丁补官方没有的：托盘两项 + 关窗常驻、Chat webview（只放行 `deepseek.com` 家族）、黑鲸鱼图标、失败诊断、`DSH_APP_VERSION`；Electron locale 精简 + 7z 最高压缩（**-8.7 MB** → 284 MB） |
| **0.9.0-alpha1** | 自研壳末代：内核 **0.1.6-alpha.1**；自绘窗口顶栏；子代理驱动改为按需下载（安装包 316 → 157 MB）；自带插件更名 **`ds_zhuzhu_use`**；**宠物资源移出安装包**，改为「设置 → 宠物 → 宠物资源」按需下载（来自 `pet-assets` 分支）；按官方 runtime 文件策略瘦身 |
| **0.8.1-rc.1** | 内嵌 **DeepSeek 网页版面板**（`chat.deepseek.com`，免开浏览器）+ 会话内容按天归档到 `~/.dsh/web-chat/`；设置新增「会话版本」管理（list / probe / convert / hide / show）；升级可先下载后安装；见**声明：禁止反向代理**。内核 0.1.5-rc.1 |
| **0.8.0-rc.1** | 内核大版本升级 **dsh 0.1.5-rc.1**：会话格式 V3（⚠️ 不支持降级读取）、`DeepSeek-V41-Flash` 新模型、右侧 Sidebar 重构、任意类型文件上传、可继续子代理排队/Steer；「软件信息」支持**检查更新 / 一键升级 / 回退**（流式下载 + 进度条） |
| **0.7.0**（稳定版，旧内核） | 极简主义重构：移除桌宠与右侧栏；新增峰谷计费时段徽章（附切换倒计时）；新增 `/usage`、`/explain-usage` 命令 |
| 0.6.0 | DSH runtime 升级 0.1.1-rc.1；视觉模型、OAuth 登录；兼容 `.credentials.yaml` 新格式；拖动滑移根治 |
| 0.5.x | 原生透明悬浮桌宠 + 右侧面板（0.7.0 起已移除） |
| 0.3.0 | 系统托盘后台驻守、单实例 |

完整更新日志见 [CHANGELOG.md](CHANGELOG.md)。

## 安装

从 **GitHub Releases** 下载最新的安装包（NSIS 安装器；0.9.2-rc1 约 302 MB）：

| 版本线 | 文件名 | 说明 |
| --- | --- | --- |
| **0.9.2-rc1**（当前） | `dsh-0.9.2-rc1-win-x64.exe` | 官方 `apps/desktop` 桌面壳（product name **dsh**） |
| 0.9.0 / 0.9.1 | `dsh-0.9.*-win-x64.exe` | 同一条线，内核 0.1.6 |
| 0.8.x / 0.7.x | `DeepSeek Harness Setup <版本>.exe` | 旧自研壳（product name `DeepSeek Harness`） |

1. 双击安装，默认安装到用户目录，可自选路径
2. 首次启动弹出配置窗口：填入 DeepSeek API Key（`sk-...`，从 [platform.deepseek.com](https://platform.deepseek.com) 获取）
3. 保存后进入主界面；以后启动自动读取已保存的 Key

> 使用要点：右上角 **X = 关窗常驻**（服务不中断）；托盘菜单可打开窗口 / 退出（**退出会带走整棵进程树**，0.9.2 起）。
> 安装时若应用正在运行，安装器会先请它自己退出，失败再强制结束（可重试）。
> 无需预装 Node.js / pnpm / DSH 或任何其他环境。
> 0.9.2-rc1 为候选版；追求更保守的旧内核可改选 0.7.0（旧自研壳）。

## 项目结构

```text
.
├── patches/                # 打在官方 apps/desktop 上的补丁（0.9.1 起的构建核心）
├── plugins/ds_zhuzhu_use/  # 自带插件（峰谷徽章 / usage / 网页版面板 / 宠物系统 / 文档预览…）
├── vendor/
│   ├── deepseek-harness/   # 官方仓库（submodule，钉在 kernel.lock.json 的 commit）
│   └── kernel.lock.json    # 内核引用：repo / tag / commit / 版本 —— 唯一的版本来源
├── scripts/                # build-desktop / prepare-runtime / kernel-version / trim-runtime / publish-release
├── assets/                 # 应用图标等打包资源
├── main.js                 # 旧自研壳（0.7–0.8 线）的主进程，保留供历史版本构建
├── preload.js              # 同上：旧壳的 IPC 桥
├── package.json            # 同上：旧壳的 electron-builder 配置
└── build/                  # 应用图标
```

## 从源码构建

前置条件：Node.js ≥ 20、pnpm、git。

**0.9.1 起（推荐路径：官方 `apps/desktop` + 本仓库补丁）**

```powershell
git submodule update --init --depth 1          # 拉官方仓库（钉在 kernel.lock.json 的 commit）
pwsh -NoProfile -File scripts\build-desktop.ps1 -AppVersion 0.9.1-alpha2
# 脚本会：校验 lock ↔ submodule commit → 依次应用 patches\*.alpha2.patch
#        → pnpm install → 跑官方 Windows 打包流程 → 产物落到 release\
```

- 补丁按文件名顺序应用，**已应用过的自动跳过**；每个补丁都可 `git apply --check --reverse` 复核
- 内核版本不手写：`node scripts/kernel-version.mjs --verify` 校验 submodule 的 commit 与 lock 是否一致
- 升级内核 = 改 `vendor/kernel.lock.json` + 把 submodule 挪到新 tag，然后照常打包

**0.7–0.8（旧自研壳，代码保留在仓库里）**

```powershell
npm install
.\scripts\prepare-runtime.ps1   # 组装 portable Node + 官方 DSH runtime（runtime/ 不入库）
npm run dist                    # 打包 NSIS 安装器到 release\
```

> **宠物资源不随包发布**：放在 `pet-assets` 分支（`pets/*.zip` + `pets/index.json`），
> 由客户端「设置 → 宠物 → 宠物资源」按需下载到 `~/.dsh/pets/resources/<id>/`。
> 加新宠物只要传 zip + 在 `index.json` 加一行，不用发新版客户端。

## 许可证

- 本仓库自有部分（`patches/` / `scripts/` / 构建配置 / 自带插件 `ds_zhuzhu_use`）：**MIT**（见 [LICENSE](LICENSE)）
- 官方桌面壳与内核（`vendor/deepseek-harness`，即 [`apps/desktop`](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop) 与 `@deepseek-ai/dsh`）：**MIT**（官方仓库）
- 内置 portable Node.js：Node.js 许可证（详见 [nodejs.org](https://nodejs.org)）
- 宠物资源（`pet-assets` 分支）：随本仓库 **MIT**
