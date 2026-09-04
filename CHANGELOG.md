# DeepSeek Harness 桌面端 更新日志

桌面壳（Electron 包装器）版本记录。安装包：`DeepSeek Harness Setup <ver>.exe`。

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
