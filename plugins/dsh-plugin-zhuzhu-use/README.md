# dsh-plugin-zhuzhu-use —— dsh 插件

官方 `dsh` 插件格式的**自带插件**，发布在 `plugin-assets` 分支（不参与 `main` 的发布流程）。
**授权跟随 `main`**：与仓库根目录的 [LICENSE](../LICENSE)（MIT）一致。

> 软件本体已由 **DeepSeek 官方桌面版**提供（官方仓库 [`apps/desktop`](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop)）。
> 本仓库不再发布软件本体，只更新这个插件 —— 见置顶公告 [#2](https://github.com/GengruiZhu/deepseek-harness-desktop-on-windows/issues/2)。

**当前版本 `0.3.6`**（npm latest）—— 0.3.0 是**更名**（`ds_zhuzhu_use` → `dsh-plugin-zhuzhu-use`，对齐 `dsh-plugin-*` 惯例）；0.3.1–0.3.3 陆续加了：

- **子代理驱动管理**（设置 →「子代理」）：Codex CLI / Claude Code SDK 两个可选 provider 可单独装、单独删（自研 pnpm 驱动、NDJSON 事件流进度、可取消可重试、装完复核三项清单、删除含 `.pnpm` 真内容与孤儿清理）
- **插件更新管理**：检查更新 / 单个更新 / 全部更新
- **Agent 预设修复**：内核升级改名后一键修 profile 里的旧行
- **宠物按需安装/卸载**：下载进度、取消、卸载
- 路由注册迁到官方桌面壳的 `connection.fetch` exact route（桌面进程里没有 `ctx.webServer`）

**0.3.6 —— 走官方设置页同款的路读账户（`remote.account`），并解决实例没就绪的问题**：

- **余额优先走 Remote BFF**：官方设置页的账户页用的就是 `ctx.remote.account.getBalance()`（返回 `{ ok, value }` 包装），Host 侧同样可读。0.3.4 / 0.3.5 走的是 `deepseekAccount` **服务本体**，而 `reflect.get` 拿到的实例**没 start**，一调用就抛 `Cannot read properties of undefined`（它内部第一句就是 `this.detailsLifetime.signal`）—— 卡片上那行 `（账户：Cannot read properties of …）` 就是它
- **就绪实例改用 `ctx.inject` 拿**：`ctx.inject(['deepseekAccount'], …)` 在服务可用后回调、服务替换时重跑 —— 这是 cordis 给可选依赖的正路（写进 `export const inject` 会拖住整个插件：web / 自建壳没有这个服务就永远不加载）
- **失败原因完整可见**：卡片余额副行给结论，**悬停可看完整报错**，并注明是哪条读法失败（`ctx.inject` / `ctx.remote.account` / `ctx.get` / `reflect.get`）
- `account-probe` 路由同步扩展（RPC 与服务本体各自是否拿到、走哪条路、返回什么）
- 手工令牌仍是回退 —— **始终不需要用户自己搓**

**0.3.5 —— 修「官方账户那条路没读通」+ 把原因显示出来（不再引导手工搓令牌）**：

- **可选服务的读法改成多路尝试**：`ctx.get('deepseekAccount')` → **`ctx.reflect.get('deepseekAccount', false)`** → 属性代理，逐条独立 `try`。0.3.4 只用了第一条 —— 这是这套内核里「读没在 `inject` 里声明的服务」的已知坑（此前 `pluginManager` 也是换成 `reflect.get` 才读到的）
- **卡片余额副行会带上账户那条路的结论**：例如 `API Key（账户：账户服务不可用）` / `（账户：账户未登录）` / `（账户：账户查询失败）` —— 一眼看出是没登录、服务没读到、还是查询失败，不必再靠日志
- 新增只读诊断路由 `GET /api/ds-zhuzhu-use/account-probe`：返回 `ctx.get` / `reflect.get` 是否可用、哪条路读到了服务、`getBalance()` 与 `getPlatformSession()` 的结果
- **明确「不需要用户手工搓」**：官方账户已登录时用量自动复用其会话；手工令牌降为「进阶，一般用不到」，提示与失败文案都不再让用户去 F12 复制
- API Key 作为余额来源**保留**（账户那条路不可用时的兜底）

**0.3.4 —— 余额直读官方账户、用量免手工令牌、点徽章随时看卡片**：

- **余额直读官方账户**：改用官方账户服务（`ctx.get('deepseekAccount').getBalance()`，desktop profile 的 base bundle 提供 `@deepseek-ai/dsh-deepseek-account-platform` 这一行）—— 充值 + 赠金钱包按币种合并，**不再依赖 API Key，也不需要任何 platform 操作**；服务缺失 / 未登录 / 查询失败时回退原来的 API Key 路径（两条路各自独立，谁成功用谁）
- **platform 用量免手工令牌**：优先用官方 `getPlatformSession()`（Host-only 的 origin/token 快照，带 desktop 请求头）去查用量接口，origin 也以官方给的为准；手工粘贴的 `userToken` 降为回退（官方未登录时才需要）
- **点徽章即可看用量卡片**：时段徽章现在可点击，就地展开 `UsageCard`（走 `/api/ds-zhuzhu-use/usage-card` + 本地渲染，**不经过 composer 提交**）—— 会话跑着的时候也能随时看，不必等这一轮结束再敲 `/usage`；`⚙` 仍单独用于手工令牌
- 卡片余额区渲染新结构：`币种 总额`，副行 `赠金 x · 充值 y · 来源（官方账户直读 / API Key / 未登录账户）`

**0.3.4 —— 宠物三处「看起来像鬼畜」的 bug（全部有量化复现）**：

- **状态气泡会把整只宠物往下推**：气泡以前是列方向的第一个兄弟，而拖过之后容器按 `top/left` 钉住 —— 于是一冒泡整只宠物就下移 `bubbleH` 像素，状态每变一次（IDLE↔WORKING…）就上下跳一次。改成 `position:absolute` 挂在精灵上方，不再参与布局
- **注视基准点算错了**：`dy` 一直用「精灵高度的 33%」当脸的位置，而 576×624 的帧里眼睛在 y≈89（**14%**）—— 基准点掉到胸口，和眼睛齐平的光标会被判成在下方，越靠两边越偏成 down-left / down-right。改为 15%，并支持资源用 `gazeFaceY` 覆盖
- **资源侧**（见 `pets/README.md`）：`pet-assets` 分支上的帧做了一次**锚点重排** —— 原来每帧按自己的包围盒独立归一化，同一段里角色站的位置都不一样（`blink_double` 四帧整体横移 **97px**、`look` 右半边漂 **32px**、`running-*` 漂 **174~197px**），并剔掉了 `sleep/02`、`sleep/03` 上贯穿全高的 3px 邻帧竖条（就是「露出侧边动作的一部分」）。重排后所有段的段内锚点摆幅 ≤ 2px

> ⚠️ **更名说明**：旧包 [`ds_zhuzhu_use`](https://www.npmjs.com/package/ds_zhuzhu_use)（0.2.0）已弃用，新包为 [`dsh-plugin-zhuzhu-use`](https://www.npmjs.com/package/dsh-plugin-zhuzhu-use)。
> 两者**不能同时安装**（插件行 id 与模块名都变了，同时存在会在 profile 里留下悬空行）。

## 插件做什么

- **峰谷计费时段徽章**（输入框上方，含切换倒计时）+ `/usage` 余额卡片 + `/explain-usage` 计价说明
- **内嵌 DeepSeek 网页版**（Chat 面板）：走官方外壳的「侧栏浏览器租约」通道挂载（官方 0.1.7 起只放行带租约的 guest）
- 宠物系统、文档预览（Office → PDF）、会话版本管理、桌面插件管理、设置分区
- 每个设置分区**独立容错**：某一块渲染失败只影响那一块，不会把整张设置页带崩

## 子代理驱动（Codex CLI / Claude Code SDK）

设置 →「子代理」里可以单独装、单独删这两个可选 provider
（`@deepseek-ai/dsh-subagent-codex` / `@deepseek-ai/dsh-subagent-claude-code`，加起来约 590 MB，
所以不随安装包发布）。

**为什么不用官方插件管理器的安装入口**：它把 pnpm 整段黑箱跑完才回话，进度只能靠猜；
而且有「pnpm 静默 10 分钟就杀」的 idle 超时 —— 超时后它把清单回滚，可几百 MB 的文件已经落盘，
于是留下「有文件、没人认、删除删不掉」的半装状态。我们自己驱动内核自带的 pnpm：

- 进度是 **pnpm 的 NDJSON 事件流**：每个包开始下载时报它的字节数、下完再报一次，
  所以「已下 X MB / 共 Y MB（已公布的包合计）」是真的；解析数、下完数、落盘数也分别计数。
- **可取消**（Windows 上杀整棵进程树）、**可重试**（换安装源后重点一次，已下过的不会重下）、
  失败时把 pnpm 的原始输出留在「展开日志」里，可以直接复制。
- 装完**复核三项**：provider 目录 / profile 的依赖条目 / `dsh.profile.bundles` 里的 bundle 行。
  三样齐了内核才会挂载它 —— 这也解释了「插件页不认」：
  官方插件页是从 profile 清单（依赖 + bundle 行）列出来的，文件在磁盘上但清单里没有条目时，
  它**不可能**显示出来。装完我们会把「写了什么」列出来，方便和插件页对账。
- 删除**无条件执行**：先摘 bundle 行 → 官方侧卸一次 → `pnpm remove` → 直接删目录
  （`node_modules/<包>` **和** `.pnpm/<entry>` 里那份，后者才是几百 MB 的真内容）
  → 目录没了而依赖条目还在就把条目也摘掉 → 复核并如实报出「删了什么 / 还剩什么 / 哪一步失败」。
  `~/.dsh/profiles/node_modules`（所有 profile 共用的兜底目录）只报告、不删，免得把 web 那个
  profile 一起弄坏。

想离线确认「装没装、装在哪」：

```sh
node werk/driver-probe.mjs <插件目录> --profile %USERPROFILE%\.dsh\profiles\desktop
```

## 官方插件格式

```text
dsh-plugin-zhuzhu-use/
├── package.json        # name（必须等于目录名）/ version / type / main / exports / files
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

> ⚠️ 两条踩过的坑：
> 1. **不要声明 `react` / `react-dom`**（连 peer / optional 都不要）：官方 desktop 的 profile 校验会报
>    `resolves react outside its owned packages` 并**拒绝启动** —— 客户端拿 react 走的是内核自己的模块加载器。
> 2. **`cordis.patch.yml` 里那一行的 `name:` 必须等于 npm 包名**（Node 按它解析模块），目录名也要等于包名；
>    改名时这几处要一起动，否则启动即报找不到模块。

## 安装

### 用法一：官方安装器填包名（推荐，最简单）

官方桌面版 → **插件** 页 →「添加插件」→ 直接填：

```text
dsh-plugin-zhuzhu-use
```

已发布到 npm 官方源，安装器会自动从 registry 拉取。（`npm view dsh-plugin-zhuzhu-use version` 可校验线上版本。）

### 用法二：`.tgz` / 本地目录（不想走 npm 源时）

安装器接受 **包名 / Git 仓库地址 / 本地目录 / `.tgz`** 四类来源：

| 填法 | 填什么 |
| --- | --- |
| **`.tgz` 直链** | `https://raw.githubusercontent.com/GengruiZhu/deepseek-harness-desktop-on-windows/plugin-assets/dsh-plugin-zhuzhu-use-0.3.6.tgz` |
| **本地 `.tgz` 文件** | 本分支根目录 `dsh-plugin-zhuzhu-use-0.3.6.tgz` 的**绝对路径** |
| **本地插件目录** | 解包后的目录绝对路径（解包 tgz 得到 `package/`），或直接用 `dsh-plugin-zhuzhu-use/` 源码目录 |

> - 「GitHub 仓库地址」这条路**不适用**：本插件在仓库的**子目录**且不在默认分支，安装器会拿到仓库根的 `package.json`（`dsh-desktop`，没有 `dsh.bundle`）→ 报「这个包没有声明组合包」。
> - 安装器会先校验 `dsh.bundle`（本插件有）；装完状态是「已安装但未启用」，点**立即启用**或下次启动生效。

### 用法三：npm install / 源码目录

```powershell
npm install ".\dsh-plugin-zhuzhu-use-0.3.6.tgz"   # 本地 tgz（本分支根目录）
npm install dsh-plugin-zhuzhu-use                 # 或直接从 npm 官方源装
# 若你的安装带 CLI：
#   dsh plugin --profile desktop add dsh-plugin-zhuzhu-use
```

源码目录方式：把本分支的 `dsh-plugin-zhuzhu-use/` 整个放进
`%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-plugin-zhuzhu-use\`，
并在 profile `package.json` 的 `dsh.profile.bundles` 里加上 `dsh-plugin-zhuzhu-use`，然后重启。

> 包内容 = `src/` + `cordis.patch.yml` + `tools/` + `pets/`（见 `files` 字段）。
> **`tools/` 不能少**：Host 侧的会话版本工具与 Office 转换脚本都从 `../tools/` 解析；`pets/` 是内置宠物扫描目录。

### 从旧名 `ds_zhuzhu_use` 迁移

1. 在官方插件页**卸载** `ds_zhuzhu_use`（或手工移除 profile 里 `node_modules/ds_zhuzhu_use/` 与 `dsh.profile.bundles` 中那一行）
2. 按上面任一方式安装 `dsh-plugin-zhuzhu-use`
3. 重启应用。**数据不受影响**：平台令牌、宠物资源、会话版本工具的状态都在 `~/.dsh/` 下，与包名无关

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
- 卸载插件：从 profile 的 `node_modules` 移除 `dsh-plugin-zhuzhu-use/`，并在 `dsh.profile.bundles` 里去掉同名那一行，然后重启。

---

## English

Official `dsh`-format **first-party plugin**, published on the `plugin-assets` branch (it does not take part in `main`'s release flow). **Licensing follows `main`** — the repository's [LICENSE](../LICENSE) (MIT). The application itself now comes from the [official desktop app](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop); this repo only maintains the plugin.

**Current version `0.3.6`** (npm latest) — 0.3.0 was the rename (`ds_zhuzhu_use` → `dsh-plugin-zhuzhu-use`, matching the `dsh-plugin-*` convention); 0.3.1–0.3.3 added: **subagent driver management** (install/remove the Codex CLI and Claude Code SDK providers from Settings → Subagents — our own pnpm driver, NDJSON progress, cancel/retry, three-way post-install verification, removal that also cleans `.pnpm` and orphans), **plugin update management** (check / update one / update all), **agent-preset repair**, **pet install/uninstall on demand**, and route registration moved to the desktop shell's `connection.fetch` exact routes (the desktop process has no `ctx.webServer`).

**0.3.6 — reads the account through the same path the official settings page uses (`remote.account`), and fixes the not-yet-started instance:**

- **Balance prefers the Remote BFF**: the official account page calls `ctx.remote.account.getBalance()` (returning `{ ok, value }`), which is readable from the Host side too. 0.3.4 / 0.3.5 went through the `deepseekAccount` **service instance**, and the one returned by `reflect.get` was **not started** — calling it throws `Cannot read properties of undefined` (its first statement is `this.detailsLifetime.signal`). That is exactly the `(account: Cannot read properties of …)` line on the card.
- **The ready instance is obtained via `ctx.inject`**: `ctx.inject(['deepseekAccount'], …)` runs its callback once the service is available and re-runs when it is replaced — the sanctioned cordis path for an optional dependency (declaring it in `export const inject` would hold the whole plugin back: web and self-built shells have no such service and would never load it).
- **The failure reason is fully visible**: the card's balance sub-line shows the conclusion and its tooltip carries the complete error plus which read path failed (`ctx.inject` / `ctx.remote.account` / `ctx.get` / `reflect.get`).
- The `account-probe` route reports the RPC and service-instance outcomes separately.
- The manual token remains a fallback — **the user never has to hand-copy anything**.

**0.3.5 — fixes the official-account path and surfaces the reason (no more hand-copied tokens):**

- **Optional services are now read through several paths**: `ctx.get('deepseekAccount')` → **`ctx.reflect.get('deepseekAccount', false)`** → the property proxy, each in its own `try`. 0.3.4 tried only the first — a known trap in this kernel for services not declared in `inject` (the same fix that made `pluginManager` readable earlier).
- **The card's balance sub-line now carries the account outcome**: e.g. `API Key (account: service unavailable)`, `(account: signed out)`, `(account: query failed)` — no log digging needed.
- New read-only probe route `GET /api/ds-zhuzhu-use/account-probe` reports whether `ctx.get` / `reflect.get` work, which path reached the service, and what `getBalance()` / `getPlatformSession()` returned.
- **Nothing is hand-copied by the user**: usage reuses the official session automatically once the account is signed in; the manual token is now labelled "advanced, rarely needed" and neither the tooltip nor the failure text tells you to open F12.
- The API-key path stays as the balance fallback.

**0.3.4 — balance straight from the official account, no manual token, clickable badge (plus three pet fixes):**

- **Balance reads the official account directly**: `ctx.get('deepseekAccount').getBalance()` (the desktop base bundle provides `@deepseek-ai/dsh-deepseek-account-platform`) returns recharge and bonus wallets merged per currency — no API key, no platform step. The API-key path stays as a fallback when the service is missing, signed out, or the query fails; the two paths are independent.
- **Usage no longer needs a hand-pasted token**: the platform usage endpoint prefers the official `getPlatformSession()` Host-only origin/token snapshot (desktop headers included) and takes its origin; a pasted `userToken` is only a fallback now.
- **The period badge is clickable** and expands `UsageCard` in place through `/api/ds-zhuzhu-use/usage-card` with local rendering — **not through the composer** — so it works while a turn is running instead of waiting to type `/usage`. The gear still opens the manual token box.
- **Pet fixes** (details in the Chinese section above): the status bubble no longer pushes the sprite down (`position:absolute`), the gaze baseline moved from 33% to 15% of the sprite height (`gazeFaceY` override supported), and the `pet-assets` frames were re-anchored per clip (`look` right half 32px, `blink_double` 97px, `running-*` 174–197px) with neighbor-frame slivers removed — **re-download the pet zips to get the aligned frames**.

> ⚠️ **Rename notice**: the old package [`ds_zhuzhu_use`](https://www.npmjs.com/package/ds_zhuzhu_use) (0.2.0) is deprecated; the new one is [`dsh-plugin-zhuzhu-use`](https://www.npmjs.com/package/dsh-plugin-zhuzhu-use). Do not install both — the plugin row id and the module name both changed, and keeping both leaves a dangling row in the profile.

**Official plugin format.** `package.json` declares `dsh.bundle.patch` (→ `cordis.patch.yml`, one row mounting both the Host and Browser halves) and `dsh.client` (`inject` + `platform: web`). Two traps worth remembering: never declare `react` / `react-dom` (the official desktop profile check rejects it with `resolves react outside its owned packages` and refuses to start), and the row's `name:` in `cordis.patch.yml` **must equal the npm package name** — as must the directory name — because Node resolves the module by it.

**Install.**

**Way 1 — official plugin manager, by package name (recommended).** Official desktop → **Plugins** → "Add plugin" → enter:

```text
dsh-plugin-zhuzhu-use
```

It is published to the npm registry, so the installer fetches it automatically (`npm view dsh-plugin-zhuzhu-use version` confirms the published version).

**Way 2 — `.tgz` or a local directory.**

| Input | What to enter |
| --- | --- |
| **`.tgz` URL** | `https://raw.githubusercontent.com/GengruiZhu/deepseek-harness-desktop-on-windows/plugin-assets/dsh-plugin-zhuzhu-use-0.3.6.tgz` |
| **Local `.tgz` file** | absolute path to `dsh-plugin-zhuzhu-use-0.3.6.tgz` at the branch root |
| **Local plugin directory** | absolute path to the unpacked directory (unpacking the tarball yields `package/`), or the `dsh-plugin-zhuzhu-use/` source directory |

> A **GitHub repository address does not work here**: the plugin sits in a **subdirectory** of a branch that is not the default one, so the installer reads the repository root `package.json` (`dsh-desktop`, no `dsh.bundle`) and reports *This package declares no bundle*. The installer validates `dsh.bundle` (this plugin has it) and leaves the plugin **installed but not enabled** — click **Enable now** or restart.

**Way 3 — npm install / source directory.**

```powershell
npm install ".\dsh-plugin-zhuzhu-use-0.3.6.tgz"   # local tarball from this branch
npm install dsh-plugin-zhuzhu-use                 # or straight from the npm registry
# with a CLI-enabled install:
#   dsh plugin --profile desktop add dsh-plugin-zhuzhu-use
```

Source form: drop the whole `dsh-plugin-zhuzhu-use/` directory into
`%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-plugin-zhuzhu-use\`, add `dsh-plugin-zhuzhu-use`
to `dsh.profile.bundles` in the profile `package.json`, then restart.

The tarball ships `src/` + `cordis.patch.yml` + `tools/` + `pets/` (see `files`). **`tools/` is required** — the Host half resolves the session-version tool and the Office scripts from `../tools/`, and `pets/` is the built-in pet scan directory.

**Migrating from the old name `ds_zhuzhu_use`.** Uninstall `ds_zhuzhu_use` in the Plugins page (or remove `node_modules/ds_zhuzhu_use/` and its `dsh.profile.bundles` entry by hand), install `dsh-plugin-zhuzhu-use`, then restart. **No data is lost**: the platform token, pet resources, and session-version state live under `~/.dsh/` and are independent of the package name.

### ⚠️ Risks and notice

1. **This plugin modifies an official application file (`app.asar`).** The official desktop uses a per-launch random partition for its sidebar browser, so web logins do not persist. The plugin performs an **equal-length in-place overwrite** of that partition name (37 bytes → 37 bytes; file size and asar offsets unchanged), tracked in `~/.dsh/ds-zhuzhu-use/asar-patch.json`. Failure is non-fatal.
   Consequences you accept by using it: **the official signature no longer covers the modified file**; security software may flag the rewrite; an upstream change can invalidate the patch; and in the worst case an asar integrity check could prevent the app from starting — **keep the official installer so you can reinstall**. This is an unofficial modification of official software.
2. **Embedded web panel (`chat.deepseek.com`) — no reverse proxying of any kind.** Do not use this plugin (panel, lease channel, conversation archive) to provide a proxy, relay, mirror, or multi-user sharing service, and do not use it to bypass official access controls, risk controls, or regional restrictions. It is for local, single-user convenience only; there is no server-side forwarding — the page is the official site talking directly to the official service, and only visible text is stored locally. Follow DeepSeek's official terms of service; account-related consequences are yours.
3. **Rollback.** Delete `~/.dsh/ds-zhuzhu-use/asar-patch.json` and reinstall the official app to restore the original `app.asar`; remove the plugin directory and its `dsh.profile.bundles` entry to uninstall.
