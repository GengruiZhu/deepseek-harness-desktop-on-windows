<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/%E4%B8%AD%E6%96%87-green?style=flat-square" alt="中文"></a>
  <a href="./README.en.md"><img src="https://img.shields.io/badge/English-blue?style=flat-square" alt="English"></a>
</p>

# DeepSeek Harness Desktop (Windows)

> 自用开源的 DeepSeek Harness 桌面客户端 —— Electron 薄壳 + 完全自包含运行环境，免装 Node.js / pnpm / DSH，安装即用。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows%2010%2F11-blue.svg)]()

## 简介

DeepSeek Harness 官方以命令行 / 浏览器方式分发。本项目用 Electron 将其包装成一个 **Windows 桌面应用**：

- 启动即弹出启动页（spinner + 状态文字）并在后台拉起内置 DSH 服务（**自动分配空闲端口**，`127.0.0.1:<随机端口>`），就绪后同一窗口直切正式界面，无需任何命令行操作
- 内置 portable Node.js + 官方 `@deepseek-ai/dsh` runtime，**安装包完全自包含**，零环境依赖
- 系统托盘驻守（关窗隐藏到托盘、单实例、单窗口），首次启动引导填写 DeepSeek API Key
- 附带自用定制插件：计费时段徽章 + `/usage` 余额查询
- 启动失败立即显示可复制的错误页（原因 / stderr / 退出码 / 地址 / 重试）

> ⚠️ 本项目是**非官方**的第三方包装器，与 DeepSeek 官方无关。DeepSeek 相关商标归其各自所有者所有。

## 功能特性

| 版本 | 特性 |
| --- | --- |
| **0.7.2-rc.1**（当前，Latest） | 启动体验重构（0.7.1 引入）+ 维护清理（精简 profile BOM 冗余处理）；内核 0.1.2-rc.1 |
| **0.7.0**（稳定版，旧内核） | 极简主义重构：移除桌宠与右侧栏；新增峰谷计费时段徽章（附切换倒计时）；新增 `/usage`、`/explain-usage` 命令 |
| 0.6.0 | DSH runtime 升级 0.1.1-rc.1；视觉模型、OAuth 登录；兼容 `.credentials.yaml` 新格式；拖动滑移根治 |
| 0.5.x | 原生透明悬浮桌宠 + 右侧面板（0.7.0 起已移除） |
| 0.3.0 | 系统托盘后台驻守、单实例 |

完整更新日志见 [CHANGELOG.md](CHANGELOG.md)。

## 安装

从 **GitHub Releases** 下载最新的 `DeepSeek Harness Setup <版本>.exe`（NSIS 安装器；约 343 MB，0.7.0 旧内核版约 150 MB）：

1. 双击安装，默认安装到用户目录，可自选路径
2. 首次启动弹出配置窗口：填入 DeepSeek API Key（`sk-...`，从 [platform.deepseek.com](https://platform.deepseek.com) 获取）
3. 保存后进入主界面；以后启动自动读取已保存的 Key

> 使用要点：右上角 **X = 隐藏到托盘**（服务不中断）；托盘菜单可打开窗口 / 在浏览器打开 / 退出。
> 无需预装 Node.js / pnpm / DSH 或任何其他环境。
> 0.7.1-rc.1 为候选版（Latest）；如需更保守的旧内核可改选 0.7.0。

## 项目结构

```text
.
├── main.js          # Electron 主进程：启动/停靠 DSH 服务、托盘、首次配置、内置插件引导
├── preload.js       # 首次配置窗口的 IPC 桥
├── package.json     # electron-builder 配置（NSIS + 自包含 extraResources）
├── assets/          # 托盘图标等运行时资源
├── build/           # 应用图标
└── scripts/         # 构建辅助脚本（prepare-runtime / publish-release）
```

## 从源码构建

前置条件：Node.js ≥ 20 与 npm。

```powershell
npm install                    # electron + electron-builder（仅 devDependencies）

# 准备自包含 runtime（portable Node + 官方 DSH runtime）
# runtime/ 不在本仓库内，两种获取方式：
#   1) 从 Releases 安装包解出：安装后位于安装目录 resources\runtime\
#   2) 运行 scripts\prepare-runtime.ps1 自动下载组装
.\scripts\prepare-runtime.ps1

npm run dist                   # 打包 NSIS 安装器，输出到 release\
```

## 许可证

- 本项目壳源码（`main.js` / `preload.js` / 构建配置等）：**MIT**（见 [LICENSE](LICENSE)）
- 内置 DSH runtime（`@deepseek-ai/dsh` 等）：**MIT**（npm 分发）
- 内置插件 `dsh-fenggu`：**MIT**
- 内置 portable Node.js：Node.js 许可证（详见 [nodejs.org](https://nodejs.org)）
