# ds_zhuzhu_use —— dsh 插件

官方 `dsh` 插件格式的**自带插件**，发布在 `plugin-assets` 分支（不参与 `main` 的发布流程）。
**授权跟随 `main`**：与仓库根目录的 [LICENSE](../LICENSE)（MIT）一致。

> 软件本体已由 **DeepSeek 官方桌面版**提供（官方仓库 [`apps/desktop`](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop)）。
> 本仓库不再发布软件本体，只更新这个插件 —— 见置顶公告 [#2](https://github.com/GengruiZhu/deepseek-harness-desktop-on-windows/issues/2)。

**当前版本 `0.2.0`** —— 适配官方 0.1.7 桌面壳：侧栏浏览器**租约桥**、`app.asar` **分区持久化补丁**、设置分区独立容错、UA 处理。

## 插件做什么

- **峰谷计费时段徽章**（输入框上方，含切换倒计时）+ `/usage` 余额卡片 + `/explain-usage` 计价说明
- **内嵌 DeepSeek 网页版**（Chat 面板）：走官方外壳的「侧栏浏览器租约」通道挂载（官方 0.1.7 起只放行带租约的 guest）
- 宠物系统、文档预览（Office → PDF）、会话版本管理、桌面插件管理、设置分区
- 每个设置分区**独立容错**：某一块渲染失败只影响那一块，不会把整张设置页带崩

## 官方插件格式

```text
ds_zhuzhu_use/
├── package.json        # name / version / type: module / main / exports / files
├── cordis.patch.yml    # 即 dsh.bundle.patch：注册插件行（一行同时挂 Host 与 Browser 两侧）
├── src/index.js        # Host 侧：/api/ds-zhuzhu-use/* JSON 路由 + 命令 + asar 分区补丁
├── src/client.js       # Browser 侧：徽章 / Chat 面板 / 设置分区 / 宠物
├── pets/               # 宠物资源说明（资源本体在 pet-assets 分支）
└── tools/              # 会话版本工具（list/probe/convert/hide/show）、Office 转换脚本
```

`package.json` 里与 harness 相关的字段：

```json
{
  "type": "module",
  "main": "src/index.js",
  "exports": { ".": "./src/index.js", "./client": "./src/client.js", "./package.json": "./package.json" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": ["@deepseek-ai/dsh-client-ui-renderer"], "platform": "web" }
  }
}
```

> ⚠️ **不要声明 `react` / `react-dom`**（连 peer / optional 都不要）：官方 desktop 的 profile 校验会报
> `resolves react outside its owned packages` 并**拒绝启动** —— 客户端拿 react 走的是内核自己的模块加载器，
> 内核自身的 client 包同样不声明它。这条坑写在 `package.json` 的 `$comment` 里。

## 安装

**方式一：npm 包（推荐）**

本分支根目录的 `ds_zhuzhu_use-0.2.0.tgz` 就是 `npm pack` 产物（8 个文件，约 103 KB）：

```powershell
npm install ".\ds_zhuzhu_use-0.2.0.tgz"          # 装进当前 profile 的 node_modules
# 若你的安装带 CLI：
#   dsh plugin --profile desktop add .\ds_zhuzhu_use-0.2.0.tgz
```

**方式二：源码目录**

1. 取本分支的 `ds_zhuzhu_use/` 目录
2. 放进目标 profile 的 `node_modules/`：
   `%USERPROFILE%\.dsh\profiles\desktop\node_modules\ds_zhuzhu_use\`
3. 在 profile `package.json` 的 `dsh.profile.bundles` 里加上 `ds_zhuzhu_use`（bundle patch 负责注册插件行）
4. 重启应用

> 包内容 = `src/` + `cordis.patch.yml` + `tools/` + `pets/`（见 `files` 字段）。
> **`tools/` 不能少**：Host 侧的会话版本工具与 Office 转换脚本都从 `../tools/` 解析；`pets/` 是内置宠物扫描目录。

---

## ⚠️ 风险提示与声明（务必阅读）

### 1. 本插件会修改官方应用文件（`app.asar`）

官方桌面版给侧栏浏览器用的是**每次启动随机的临时分区**，登录态留不住（每次都要重新登录网页版）。
本插件为解决这一点，会在**你本机的 `app.asar` 上做一次「等长原地覆写」**，把那行分区名换成持久分区
（`persist:dsh-desktop-browser-profile`）：

- 覆写**等长**（37 字节 → 37 字节），不改变文件大小，因此 asar 的偏移表与结构不受影响；
- 补丁状态记录在 `~/.dsh/ds-zhuzhu-use/asar-patch.json`（大小 / 修改时间 / 偏移），官方升级后 asar 变化会自动重新检查；
- **补丁失败不抛错**，插件其余功能照常；找不到目标行时只提示「官方可能改了实现」。

**由此带来的风险请自行评估：**

| 风险 | 说明 |
| --- | --- |
| **官方签名失效** | `app.asar` 被改写后，官方对安装包的**数字签名不再覆盖被修改的文件** |
| 安全软件告警 | 改写已安装程序文件的行为可能被杀软 / 终端安全策略拦截或告警 |
| 官方升级后失效 | 官方若改了实现，补丁会报「app.asar 里没有那一行」，需等插件跟进 |
| 极端情况 | 若 Electron 启用 asar 完整性校验，改写可能导致应用**无法启动** —— 请保留官方安装包以便随时重装 |
| 非官方修改 | 这是对官方软件的非官方修改，是否接受由你决定 |

### 2. 内嵌网页版（`chat.deepseek.com`）的声明

- **禁止任何形式的反向代理**：不得利用本插件（含内嵌面板、租约通道、会话归档）对外提供代理、转发、镜像、多用户共享服务，不得用于绕过官方访问控制、风控或地区限制。
- **仅限个人本机使用**：目的在于免去另外开一个浏览器标签挂着网页版。
- **不存在服务端转发**：页面就是官方站点本身，直接与官方通信；插件只在本机读取页面可见文字并保存到本地。
- 使用须遵守 **DeepSeek 官方服务条款**；登录态、账号风控等后果由使用者自行承担。

### 3. 回滚 / 卸载

- 删掉 `~/.dsh/ds-zhuzhu-use/asar-patch.json`，并**重装官方应用**，即可恢复原始 `app.asar`；
- 卸载插件：从 profile 的 `node_modules` 移除 `ds_zhuzhu_use/`，并在 `dsh.profile.bundles` 里去掉 `ds_zhuzhu_use` 那一行，然后重启。

---

## English

Official `dsh`-format **first-party plugin**, published on the `plugin-assets` branch (it does not take part in `main`'s release flow). **Licensing follows `main`** — the repository's [LICENSE](../LICENSE) (MIT). The application itself now comes from the [official desktop app](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop); this repo only maintains the plugin.

**Official plugin format.** `package.json` declares `dsh.bundle.patch` (→ `cordis.patch.yml`, one row mounting both the Host and Browser halves) and `dsh.client` (`inject` + `platform: web`). Never declare `react` / `react-dom` — the official desktop profile check rejects it with `resolves react outside its owned packages` and refuses to start.

**Install.** Use the packed tarball in this branch — `ds_zhuzhu_use-0.2.0.tgz`, produced by `npm pack` (8 files, ~103 KB): `npm install ".\ds_zhuzhu_use-0.2.0.tgz"`, or `dsh plugin --profile desktop add` it. Alternatively drop the `ds_zhuzhu_use/` directory into `%USERPROFILE%\.dsh\profiles\desktop\node_modules\`, add `ds_zhuzhu_use` to `dsh.profile.bundles` in the profile `package.json`, then restart. The tarball ships `src/` + `cordis.patch.yml` + `tools/` + `pets/`; **`tools/` is required** — the Host half resolves the session-version tool and the Office scripts from `../tools/`, and `pets/` is the built-in pet scan directory.

### ⚠️ Risks and notice

1. **This plugin modifies an official application file (`app.asar`).** The official desktop uses a per-launch random partition for its sidebar browser, so web logins do not persist. The plugin performs an **equal-length in-place overwrite** of that partition name (37 bytes → 37 bytes; file size and asar offsets unchanged), tracked in `~/.dsh/ds-zhuzhu-use/asar-patch.json`. Failure is non-fatal.
   Consequences you accept by using it: **the official signature no longer covers the modified file**; security software may flag the rewrite; an upstream change can invalidate the patch; and in the worst case an asar integrity check could prevent the app from starting — **keep the official installer so you can reinstall**. This is an unofficial modification of official software.
2. **Embedded web panel (`chat.deepseek.com`) — no reverse proxying of any kind.** Do not use this plugin (panel, lease channel, conversation archive) to provide a proxy, relay, mirror, or multi-user sharing service, and do not use it to bypass official access controls, risk controls, or regional restrictions. It is for local, single-user convenience only; there is no server-side forwarding — the page is the official site talking directly to the official service, and only visible text is stored locally. Follow DeepSeek's official terms of service; account-related consequences are yours.
3. **Rollback.** Delete `~/.dsh/ds-zhuzhu-use/asar-patch.json` and reinstall the official app to restore the original `app.asar`; remove the plugin directory and its `dsh.profile.bundles` entry to uninstall.
