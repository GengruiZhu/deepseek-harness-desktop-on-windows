# DeepSeek Harness 桌面端 更新日志

桌面壳版本记录。0.9.1 起安装包名为 `dsh-<版本>-win-x64.exe`（官方 desktop 构建），0.8.x 及更早为 `DeepSeek Harness Setup <ver>.exe`（自研壳）。

## 0.9.1-alpha2 (2026-09-19)

**改用官方 [`apps/desktop`](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop) 桌面壳**（内核 **0.1.6-alpha.2**；本仓库从此只做 Windows 打包 + 补丁）。

- **构建路径换轨**：不再用自研薄壳，改为把官方仓库作为 submodule（`vendor/deepseek-harness`，钉 `dsh-v0.1.6-alpha.2` / `ddefc45`）+ `patches/` 补丁；`scripts/build-desktop.ps1` 一条命令走完「校验 lock → 依次应用补丁 → pnpm install → 官方 Windows 打包流程」
- **补丁清单**（4 个活跃，其余已 `.obsolete-alpha2` 退役）：
  - `desktop-branding.alpha2`：productName / artifactName / release label 走 env；`DSH_DESKTOP_ICON` 覆盖 exe 图标；unsigned 构建不写强制更新策略；`compression: 'maximum'`；afterPack 精简 Electron locale（只留 `en-US` + `zh-CN`，48.3 MB → 1.15 MB）
  - `desktop-first-party-plugins.alpha2`：新增 `bundled-plugins.ts`（按内容指纹刷新内置插件），上游只加 1 行 import + 1 行调用
  - `desktop-runtime-extract.alpha2`：改用系统 bsdtar 解 Node zip
  - `desktop-shell.alpha2`：托盘两项 + 关窗常驻、Chat webview（`persist:dsh-fenggu-chat`，只放行 `deepseek.com` 家族、普通 Chrome UA）、黑鲸鱼图标、失败诊断（运行时目录 / 配置目录 / 服务地址 / 退出码 / stderr 末尾）、`DSH_APP_VERSION` 注入
- **顶栏 / 侧栏 / 启动页交给官方**：alpha.2 官方已把当年我们自己补的那一层原生实现（自绘顶栏、跟随页面取色、隐藏原生菜单条、应用内插件管理），继续叠旧 CSS 只会互相打架
- **瘦身**：306,929,243 → **298,252,600 字节**（-8.7 MB / -2.83%），功能零改动；实测 `files` 负向 glob 剔 `.md` / `.d.ts` 无效，已从补丁里删掉、不留假动作
- **桌面插件块改走官方 API**：用内核自带 `pluginManager`（`listBundles` / `setBundleEnabled` / `removeBundle` / `installBundle`）+ `layout.selectPanel("plugins")` 打开官方插件页；旧外壳仍回落 `window.dshDesktop.plugins`
- **验收**（读产物 + 隔离 DSH_HOME 真机）：包身份与 `report.json` 一致；内核实测 `0.1.6-alpha.2`；`appId = com.gengruizhu.dsh`；无 `dshMandatoryUpdatePolicy`（离线不被官方策略服务挡住）；图标为黑鲸鱼且打包日志 0 条默认图标告警；关窗常驻（WM_CLOSE 后 8 秒进程仍存活）；设置页含「桌面插件」块、可跳官方插件页
- 已知遗留：官方插件页看不到随包发布的 `ds_zhuzhu_use`（它不是内核定义的「安装提供型 bundle」，但插件本身加载正常）；unsigned 构建不带官方更新源，「检查更新」按官方逻辑报「暂无可用更新」
- 交付报告：`work/alpha2-status.md`（构建日志 `werk/alpha2-build-*.log`、验收 `werk/alpha2-verify/*/report.json`，均不入库）
- ⚠️ alpha 预发布：内核为 alpha 档，追求稳定请用 0.7.0。

## 0.9.0-alpha1 (2026-09-17)

**内核升级 0.1.5-rc.1 → 0.1.6-alpha.1 + 官方仓库引用 + 插件更名 + 宠物改为按需下载**（壳仍是我们自己的）。

- **窗口顶栏重做**：去掉系统那条「淡蓝底 + 一长串标题」，改成自己画的一条 —— 隐藏系统标题栏、保留原生窗口按钮，底色**实时取界面侧栏的颜色**（浅色/深色主题都严丝合缝），左侧一个 18px 鲸鱼标记；侧栏里重复的「鲸鱼 + deepseek HARNESS」整行隐去（折叠按钮保留），工作区做成浮在灰底上的圆角白卡（Codex 那种观感）
  - 侧栏顶部重排：品牌行 + 折叠按钮 + 两行「工作区 / Chat」全部收掉，改成 **「工作区 ⌄」下拉**（切换工作区 / Chat，和 Claude 那种一致）+ 右侧一个「＋」小图标（新会话，只留图标）；**点顶栏的鲸鱼 = 收起/展开侧栏**（原折叠按钮的功能挪到这里）；下拉菜单挂在浮层上（不再被侧栏那行的 `overflow:hidden` 裁掉），配色走内核主题变量，浅色/深色都跟着变
- **可选子代理驱动改为按需下载**：设置里新增「**子代理**」块（就在「Agent 预设」下面）—— Codex CLI（377 MB）/ Claude Code SDK（221 MB）不进安装包，用到再下（下载 / 进度 / 取消 / 删除，断点不需要、6 秒下完），装到 `~/.dsh/profiles/web/node_modules/`（内核就在那儿解析这两个插件的依赖），并自动把插件的 profile bundle 行接上/摘掉。安装包 **316 MB → 157 MB**
- **Agent 预设维护**：内核升级会改插件名 —— 0.1.5 的 `dsh-workflow-worker-thread` 在 0.1.6 已被 `dsh-workflow-ptc` 取代，老预设里那行会让**整个预设加载失败**（就是「加载失败 / cannot be resolved」那条）。新增一键修复：改名前先备份 `.bak-<时间戳>`，只动该动的那几行；驱动没装时把对应行 `disabled: true`，装好了再启用
- **官方内核 0.1.6-alpha.1**（官方桌面版同档）；应用内「软件信息」显示的内核版本改为**运行时实读**，不再靠文案
- **官方仓库按标准方式引用**：仓库新增 `vendor/deepseek-harness` submodule（钉在 `dsh-v0.1.6-alpha.1`），内核版本只认 `vendor/kernel.lock.json` —— 升级内核 = 改 lock + 挪 submodule，不再手写版本号；`scripts/kernel-version.mjs --verify` 会校验 submodule 的 commit 与 lock 是否一致
- **自带插件更名 `dsh-fenggu` → `ds_zhuzhu_use`**（目录、包名、bundle 行、客户端 id、路由前缀 `/api/ds-zhuzhu-use/*`）。升级用户 profile 里的旧行由桌面壳自动清理，会话版本 / 平台用量令牌 / 内嵌 Chat 登录态**全部保留**（令牌文件自动迁移，Electron 分区名冻结）
- **宠物资源不再进安装包**：两只宠物解包 120 MB / 压缩后 123 MB，对不用宠物的人是白付。改为**设置 → 宠物 → 宠物资源**里按需下载（下载 / 进度 / 取消 / 删除，断点续传），资源放在本仓库 `pet-assets` 分支，装到 `~/.dsh/pets/resources/<id>/`，与手工放进去的宠物同一条读取路径
  - `pets/index.json` 是清单：**加新宠物只要传 zip + 加一行，不用发新版客户端**（拉不到清单时用内置表兜底，并会在界面上说明）
  - 下载的目录带 `_installed.json` 标记：同名的手工宠物不会被覆盖，删除也只删自己装的
- **官方 runtime 文件策略**：打包前去掉声明文件 / source map / 其它平台 prebuild（**-96.7 MB**，纯死重）；安装包 358 MB → **316 MB**
- ⚠️ alpha 预发布：内核为 alpha 档，追求稳定请用 0.7.0。

## 0.8.1-rc.1 (2026-09-10)

**内嵌网页版 DeepSeek + 会话版本管理**（内核仍为 dsh 0.1.5-rc.1；壳代码有改动）。

- **内嵌网页版 DeepSeek 面板**：左侧栏以 `<webview>` 加载 `chat.deepseek.com`（该站 `frame-ancestors 'none'`，普通 iframe 必被拒；`webview` 是独立顶层上下文不受此限），并按当前 Chromium 版本拼普通 Chrome UA，避免被判「使用环境异常」
- **网页会话本地归档**：面板打开期间定期把页面可见文字同步到 `~/.dsh/web-chat/`（按天 JSONL + `latest.json` + `index.json` 索引），并提供手动快照端点；主进程只允许读取 `chat.deepseek.com` 那个 guest 页面，其余页面一律拒绝
- **设置新增「会话版本」**：新增 `tools/dsh-session-version.mjs`，支持 list / probe / convert / hide / show，便于查看与处理 V3 会话
- **升级流程细化**：下载与安装拆开（`POST /api/dsh-about/download` 只下载、`POST /api/dsh-about/run-installer` 再安装），可按需先下载、稍后安装
- ⚠️ **声明：禁止任何形式的反向代理** —— 内嵌网页版仅为个人本机便利（免去另开浏览器挂着网页版）；不得利用本项目对外提供代理 / 转发 / 镜像 / 多用户共享服务，不得用于绕过官方访问控制、风控或地区限制。集成**无服务端转发**（嵌入的就是官方页面本身，直接访问官方站点），只在本机保存页面可见文字；请遵守 DeepSeek 官方服务条款。详见 README「声明：禁止反向代理」一节。
- ⚠️ rc 候选版：追求更保守的旧内核请用 0.7.0。

## 0.8.0-rc.1 (2026-09-10)

**官方内核大版本升级 0.1.2-rc.1 → 0.1.5-rc.1**（0.1.5 系列首个候选版，汇总自 0.1.2-rc.1 的全部变更；**壳代码无需改动**）。

- ⚠️ **会话数据格式升级至 V3**：旧日志经版本迁移生成新日志（原文件保留），升级后**不支持降级读取**
- 新模型 `DeepSeek-V41-Flash`（`deepseek-flash`）：支持文本 / 图片 / 会话历史中的系统提示词更新，新会话默认使用
- Web 支持上传任意类型文件（与图片同区混排、后台上传进度与取消、跨会话续显）
- **右侧 Sidebar 重构**：多标签 / 分栏 / 全屏，Markdown、代码、HTML、PDF、图片预览（原 Detail 面板移除）；模型可显式交付文件，支持默认应用打开 / 文件管理器定位
- 可继续子代理支持消息排队、编辑、删除、单条或全部 Steer 与停止
- 动态修改系统提示词不再破坏 KV Cache（模型需显式声明支持）；出站请求遵循 `HTTP_PROXY` 等代理配置
- Web 顶栏「在应用中打开」（编辑器 / IDE / 终端 / 文件管理器）；`/feedback` 支持独立提交
- Windows 修复：本地非终端子进程不再弹出控制台窗口、子进程清理改善、盘符根目录 Workspace、原生文件夹选择器遮挡、断线自动恢复、聊天自动滚动
- 开发者注意：插件 API 调整（移除 `ctx.agent`、`Inbox` 改为类型接口、Web 面板迁移到 `sidebar.panellist` / `main`）、persona 配置拆分为前缀与后缀、`str_replace_editor` 需显式启用

**同版本二次构建（2026-09-10 15:13）：应用内升级 / 回退强化**

- 「软件信息」的检查更新 / 一键升级 / 回退改为**流式下载**（336 MB 不再整包进内存），先写 `.part` 再原子替换，避免半包
- 新增 `GET /api/dsh-about/update-state`：下载 / 启动进度（idle / downloading / launching / done / error，含已下载字节与总大小），前端据此渲染进度条
- 同一时间只允许一个安装包在下载（重复请求直接拒绝）；下载超时 5 → 10 分钟
- `rollbackTo` 统一为 `installRelease`：升级与回退共用同一条下载路径，方向只影响界面文案

- ⚠️ rc 候选版：追求更保守的旧内核请用 0.7.0。

## 0.7.4-rc.1 (2026-09-09)

**`/usage` 富卡片**（壳代码无变化；内核仍为 dsh 0.1.2-rc.1）。

- `/usage` 输出从纯文本升级为**卡片**：账户余额（含币种）/ 今日花费 / 今日 Token / 当前计费时段进度
- 新增聚合端点 `/api/fenggu/usage-card`：并行取余额（API Key → `api.deepseek.com/user/balance`）
  与平台用量（网页会话令牌 → `platform.deepseek.com/api/v0/usage/by_api_key/{cost,amount}`）
- 平台用量令牌设置引导（登录 platform.deepseek.com/usage → F12 取 `localStorage.userToken` 粘贴保存，本地存储、重启自动读取）
- 用量查询失败时卡片内提示原因并可重设令牌（余额查询不受影响）
- ⚠️ rc 候选版：追求更保守的旧内核请用 0.7.0。

## 0.7.3-rc.1 (2026-09-07)

**内置插件增强**（内核仍为 dsh 0.1.2-rc.1）。

- 新增设置入口（dsh-fenggu）：**软件信息 / 外观 / 工作区**
- 启动服务时注入 `DSH_APP_VERSION`（桌面壳版本），插件在「软件信息」中展示
- 修复内置插件升级后旧拷贝不失效的问题：升级时**强制刷新** profile 中的内置插件
  （此前仅在缺失时拷贝，旧版本插件会一直生效），确保与安装 runtime 一致
- ⚠️ rc 候选版：追求更保守的旧内核请用 0.7.0。

## 0.7.2-rc.1 (2026-09-04)

**维护清理**（内核仍为 dsh 0.1.2-rc.1）。

- 移除启动期冗余的 BOM 清理逻辑（`readTextNoBom` / `ensureNoBomJson`）：profile manifest 已由
  0.7.1 的 `ensureProfileManifest` 规范创建（无 BOM、结构完整），无需每次启动再转换
- 简化 profile package.json 读取路径，保持与 0.7.1 相同的启动体验（启动页 / 单窗口 / 错误可复制 / 自动端口）
- ⚠️ rc 候选版：追求更保守的旧内核请用 0.7.0。

## 0.7.1-rc.1 (2026-09-04)

**启动体验重构**（内核仍为 dsh 0.1.2-rc.1）。

- **先弹窗口再拉起**：启动瞬间显示启动页（spinner + 状态文字：正在准备 → 启动 DSH 服务 → 建立安全连接），服务后台拉起；启动页直接复用为正式界面
- **根治双窗口**：整个生命周期只创建一个窗口；启动期间点托盘仅显示/聚焦同一窗口，不再另开
- **错误可见可复制**：服务提前退出立即报错（不再干等 120s），错误页展示失败原因、服务端 stderr 末尾、退出码、运行时目录与服务地址，可一键复制，带「重试 / 退出」
- **自动分配空闲端口**：dsh 以 `--port 0` 启动，从服务输出解析真实地址（兼容带 token / 不带 token 两种内核输出）；保留 `DSH_DESKTOP_PORT` 环境变量可固定端口
- 首次配置整合：无 API Key 时启动窗隐藏、配置窗显示，填完后同一窗口载入应用
- ⚠️ rc 候选版：追求更保守的旧内核请用 0.7.0。

## 0.7.0-rc.1 (2026-09-04)

**官方内核 0.1.2-rc.1 —— 0.1.2 系列首个候选版（汇总自 0.1.1-rc.2 的全部变更）**。

- 子代理：`send_message` 双向消息（取代单向 `report`）、模型选择支持授权范围与调用方指定、Claude Code / Codex 可配置模型
- 会话界面重构：回合导航（含未载入轮次预览与跳转）、回答末尾 token 用量与耗时、插件按会话/全局分组
- 一次性 token 鉴权、Remote 网关统一（旧版 APIProxy 已移除）、Code Mode → PTC mode、公网 WebFetch 默认开启
- 移除可选 SQLite 会话持久化后端（已有内容不删除，导出请用旧版）；DeepSeek 适配器默认随请求上报已启用插件清单（可配置关闭）
- 新增实验性 Inspector 工具与 Web Preview
- ⚠️ 官方安全声明：尚未接受安全审计，沙箱、审批与权限控制不保证隔离
- ⚠️ alpha.5 修复：从 0.1.1-rc.2 或 0.1.2-alpha.3 升级可能出现启动失败 / 会话标题丢失，已修复

## 0.7.0-alpha.4 (2026-09-02)

**官方内核 0.1.2-alpha.4（alpha 预发布，含 0.1.2-alpha.3 更新）**。

- 父 Agent 与可持续子 Agent 支持 `send_message` 双向消息（取代单向 `report` 工具）
- 模型目录支持搜索 / 筛选；自定义模型发现复用 Profile 请求头
- 超长会话渲染与轮次导航优化；运行中追加 / 排队的图片可靠回显投递；`read_image` 支持无扩展名路径
- 移除可选 SQLite 会话持久化后端（已有内容不删除；如需导出请用旧版本）
- Web PTC Mode 默认不再暴露通用 `workflow` 工具；插件 API：`Session.events` → `seq` / `eventAt()` / `snapshotEvents()`
- ⚠️ alpha 预发布：追求稳定请用 0.7.0。

## 0.7.0-alpha.2 (2026-08-31)

**官方内核升级 0.1.2-alpha.2（alpha 预发布）**。

- **适配 dsh 0.1.2+ 一次性 token 鉴权**：web 界面强制 `?token=` 鉴权，桌面壳解析服务端 stdout 的
  `dsh web: http://127.0.0.1:<port>/?token=...` 行，窗口与托盘「在浏览器中打开」均使用带 token 的 URL，避免 401。
- 内置 DSH runtime 升级 **0.1.1-rc.2 → 0.1.2-alpha.2**。
- 安装包体积增大（约 343 MB，含新 runtime）。
- ⚠️ alpha 预发布：功能未经充分验证，追求稳定请用 0.7.0。

## 0.7.0 (2026-08-26)

**极简主义重构**：移除宠物系统与右侧栏，回到最简状态。

- 移除全部桌宠功能（原生悬浮窗、网页内嵌宠物、宠物图库）与右侧栏插件；升级后自动清理 profile 中残留的旧插件，无需手动处理。
- **新增峰谷时段提示**：输入框上方显示当前计费时段徽章——「梁文峰 · 峰时段」（琥珀色）或「梁文谷 · 谷时段」（翡翠色），附距下次切换的倒计时；悬停可看完整规则。
  - 官方规则（2026-08-23 起生效）：工作日 08:30–次日 00:30 为高峰时段，00:30–08:30 为低谷时段；周六、周日全天按低谷时段价格计费。
- **新增命令**：`/usage` 查询账户余额（各币种总余额/赠金/充值）与当前时段；`/explain-usage` 查看峰谷计价规则说明。
- 内置 DSH runtime 升级 **0.1.1-rc.1 → 0.1.1-rc.2**（官方 2026-08-21 发布）。

## 0.6.0 (2026-08-21)

内置 DSH runtime 升级 **0.1.0-rc.8 → 0.1.1-rc.1**。

- 上游新增：DeepSeek 视觉模型正式进入模型目录、OAuth 登录 + 凭据服务抽象、Markdown 宽表格横向滚动、`ask_user_question` 多行回答、嵌套子代理导航、沙箱 bwrap procfs 逃逸安全修复。
- **兼容性适配**：
  - `.credentials.yaml` 新格式（`version: 1` / `refs:` 嵌套）解析与写入，保留已有 refs（如 QWEN_MAC_API_KEY）。
  - 移除 profile 中遗留的 `pet-gallery` / `pet-floater` 插件（旧 Python 桌宠进程会周期把宠物显示关掉，已清理）。
  - floater 窗口尺寸自愈（对比实际窗口尺寸，避免被外部改动后卡在大尺寸）。
- **拖动滑移根治**：拖动改由**主进程轮询光标**（`screen.getCursorScreenPoint()` 每 16ms 采样并移动窗口），不再依赖 renderer 的 `mousemove` 投递——`focusable:false` 小窗在快速拖动时光标离开窗口后 mousemove 会停止，导致宠物跟不上、松手差一大截。实测轮询精确到 ±1px；拖动期间完全屏蔽窗口自动缩放。
- 会话数据从 rc.8 平滑迁移。
- 内置 DSH runtime：`@deepseek-ai/dsh` 0.1.1-rc.1。

## 0.5.2 (2026-08-21)

原生 Electron 透明悬浮桌宠（免 Python/PySide6），完全由内置「桌宠」插件控制。

- 新增 `floater.html` + `floater-preload.js` + `createFloater()`：透明无边框置顶窗口渲染 Codex 桌宠。
- **单一 pet**：给 `dsh-codex-pet` 插件的 client 注释掉 `shell.overlay` 注入，网页内不再渲染第二个宠物；设置页「桌宠」与 `/api/codex-pet/*` 路由保留，原生宠物完全读这份配置（宠物/大小/气泡主题/透明度/显示开关/pin 初始位置）。
- **拖动**：`-webkit-app-region: drag` 在 `focusable:false` 窗口上不生效 → 改 document 级 mouse 事件绝对坐标拖动（固定按下起点 + `screenX/screenY`，杜绝漂移），实测跟手 ±1px；拖动结束自动回弹窗口尺寸。
- **气泡自适应**：`width:max-content` + `pre-wrap` + `word-break` 自动换行；窗口随气泡动态撑高（`floater-resize` IPC，保持底边/水平中心固定），文字完整显示，无气泡时缩回贴合宠物。
- **位置记忆**：拖动后的位置保存到 `~/.dsh/floater-pos.json`，重启恢复；无记录时按设置页 pin 放置。
- 修复「白框 / 偏移 / 不实时」：白框根因 = `transparent:true` 但未设 `backgroundColor`（Electron 默认白底）→ 补 `backgroundColor:'#00000000'`；窗口 400×460 → 贴合宠物；加 `backgroundThrottling:false` 防动画节流。
- 内置 DSH runtime：`@deepseek-ai/dsh` 0.1.0-rc.8。

## 0.5.1 (2026-08-20)

内置宠物系统 + 右侧面板。

- 4 个插件 bundle 进 runtime：`@signalight/dsh-codex-pet`、`pet-gallery`、`pet-floater`、`dsh-side-panel`。
- `ensureBuiltinPlugins()` 首次启动自动注册内置插件（幂等、无重复 loader id）。
- 右侧面板注入 `details` 插槽，显示进度/上下文/工作区。
- 内置 DSH runtime：0.1.0-rc.8。

## 0.5.0 (2026-08-20)

内置 DSH runtime 升级 0.1.0-rc.7 → 0.1.0-rc.8。

- rc.8 起 `dsh web` 会自动开浏览器，桌面壳加 `--no-open` 屏蔽。

## 0.4.0 (2026-08-19)

内置 DSH runtime 升级 0.1.0-rc.6 → 0.1.0-rc.7。

## 0.3.0 (2026-08-14)

系统托盘后台驻守。

- 点 X 隐藏到托盘（服务保持运行），托盘菜单 = 打开 / 在浏览器中打开 / 退出，左键/双击唤出窗口。
- 单实例。

## 0.2.1 (2026-08-14)

- 窗口标题去掉 gengruizhu（仅保留 exe 元数据 + 安装包描述）。
- 首次启动弹 API Key 输入窗（写入 `~/.dsh/.credentials.yaml`）。
- 官方黑鲸透明图标。
- 修复 PowerShell 写文件导致的中文 GBK 乱码。

## 0.2.0 (2026-08-14)

自包含版。

- 内置 portable Node v24 + 官方 npm `@deepseek-ai/dsh@0.1.0-rc.6`，收件人无需装 Node/pnpm/DSH。

## 0.1.0 (2026-08-14)

初始薄壳。依赖系统 Node/pnpm + `deepseek-harness` 源码。
