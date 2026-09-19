/**
 * ds_zhuzhu_use — 梁文峰/梁文谷：峰谷时段插件 + DeepSeek 账户用量。
 *
 * Host 半边：
 *   - GET  /api/ds-zhuzhu-use/period   当前峰谷时段（北京时间）
 *   - GET  /api/ds-zhuzhu-use/balance  DeepSeek 账户余额（用凭据服务里的 API Key）
 *   - POST /api/ds-zhuzhu-use/token    保存/清除平台用量会话令牌（首次登录用）
 *   - GET  /api/ds-zhuzhu-use/usage    平台用量（当日总额 + 按模型 + 近 7/30 天趋势）
 *   - /usage         当前时段 + 余额 + 当日总额 + 趋势 + 按模型消费
 *   - /explain-usage 峰谷计价规则说明
 *
 * 软件信息半边（升级/回退走同一条下载路径）：
 *   - GET  /api/dsh-about/info          软件版本 + 内核版本 + 联系方式
 *   - GET  /api/dsh-about/releases      GitHub Release 版本列表（含安装包地址）
 *   - POST /api/dsh-about/update        下载并启动指定版本安装包（升级）
 *   - POST /api/dsh-about/rollback      同上（回退，保留旧入口）
 *   - GET  /api/dsh-about/update-state  下载/启动进度
 *
 * 余额用开放 API（api.deepseek.com/user/balance，凭据 DEEPSEEK_API_KEY）。
 * 用量（每个模型当日消费/趋势）DeepSeek 开放 API 不提供，只在 platform 登录态
 * 暴露（platform.deepseek.com/api/v0/usage/by_api_key/{cost,amount}），且必须用
 * 网页控制台会话令牌（localStorage.userToken），不是 sk- API Key。因此 "首次登录"
 * 的实现是：让用户粘贴一次平台会话令牌并存到本地（~/.dsh/ds-zhuzhu-use-token），
 * 之后重启自动读取，无需再次登录。
 */
import { readFileSync, writeFileSync, appendFileSync, rmSync, mkdirSync, createWriteStream, renameSync, statSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export const name = 'ds_zhuzhu_use'
// 官方桌面壳在 apps/desktop-host/config/desktop.cordis.patch.yml 里把 webserver 整行
// disabled 了 —— 桌面进程里没有 ctx.webServer。官方留的等价扩展点是 connection 的
// exact Fetch route：apps/desktop-host/src/index.ts 用
// connection.createSharedFetchHandler('/api') 分流 /api，先查 exact Fetch route 表，
// 再落到 Typert gateway。Web 组合把同一条 handler 挂在 webServer 的 /api 前缀上
// (packages/client/connection/src/index.ts)，所以这一份写法 Web 与 Desktop 通吃。
// 约束：路径必须 exact（不支持前缀/参数段），重复路径会直接抛错。
export const inject = ['commands', 'credentials', 'connection']

// ---- 软件信息 / 回退 / 工作目录 ----
const APP_REPO = 'https://github.com/GengruiZhu/deepseek-harness-desktop-on-windows'
const APP_CONTACT = 'gengruizhu@outlook.com'
const APP_OWNER = 'GengruiZhu'
const APP_REPO_NAME = 'deepseek-harness-desktop-on-windows'
const GH_API = `https://api.github.com/repos/${APP_OWNER}/${APP_REPO_NAME}`
const requestRequire = createRequire(import.meta.url)
let releaseCache = { at: 0, data: [] }

// 安装包下载进度：更新与回退共用一条下载路径，前端轮询它渲染进度条。
// phase: idle | downloading | launching | done | error
const updateState = {
  active: false,
  phase: 'idle',
  tag: '',
  received: 0,
  total: 0,
  path: '',
  error: '',
  startedAt: 0,
  finishedAt: 0,
}

function dshHome() {
  return process.env.DSH_HOME || join(process.env.USERPROFILE || homedir(), '.dsh')
}

function appVersion() {
  return process.env.DSH_APP_VERSION || 'unknown'
}

function kernelVersion() {
  try {
    const pkgPath = requestRequire.resolve('@deepseek-ai/dsh/package.json')
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version
  } catch (_) {
    return 'unknown'
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

async function listReleases(force) {
  if (!force && releaseCache.data.length > 0 && Date.now() - releaseCache.at < 5 * 60 * 1000) {
    return releaseCache.data
  }
  const items = []
  try {
    const r = await fetchWithTimeout(`${GH_API}/releases?per_page=100`, { headers: { Accept: 'application/vnd.github+json' } })
    if (!r.ok) throw new Error('GitHub API HTTP ' + r.status)
    const list = await r.json()
    for (const rel of list) {
      const exe = (rel.assets || []).filter(a => /\.exe$/i.test(a.name)).sort((a, b) => b.size - a.size)[0]
      items.push({
        tag: rel.tag_name,
        name: rel.name || rel.tag_name,
        publishedAt: rel.published_at || null,
        prerelease: !!rel.prerelease,
        body: rel.body || '',
        htmlUrl: rel.html_url || null,
        asset: exe ? { name: exe.name, url: exe.browser_download_url, size: exe.size } : null,
      })
    }
  } catch (_) {
    // API 限流时退回抓 release 页面 + expanded_assets（无 token 也能读）。
    try {
      const page = await (await fetchWithTimeout(APP_REPO + '/releases')).text()
      const tags = [...new Set([...page.matchAll(/\/releases\/tag\/(v[0-9][^"\/]+)/g)].map(m => m[1]))]
      for (const tag of tags.slice(0, 20)) {
        try {
          const html = await (await fetchWithTimeout(`${APP_REPO}/releases/expanded_assets/${encodeURIComponent(tag)}`, {}, 10000)).text()
          const m = html.match(/href="([^"]*\/releases\/download\/[^"]*\.exe)"/)
          items.push({
            tag,
            name: tag,
            publishedAt: null,
            prerelease: /-alpha|-rc|beta/i.test(tag),
            body: '',
            htmlUrl: `${APP_REPO}/releases/tag/${encodeURIComponent(tag)}`,
            asset: m ? { name: decodeURIComponent(m[1].split('/').pop()), url: 'https://github.com' + m[1], size: 0 } : null,
          })
        } catch (_) {}
      }
    } catch (_) {}
  }
  if (items.length > 0) releaseCache = { at: Date.now(), data: items }
  return items.length > 0 ? items : releaseCache.data
}

/**
 * 下载指定版本的安装包并启动安装程序。
 *
 * 升级和回退走的是同一条路：都是 GitHub Release 里那个 exe，下载到
 * ~/Downloads 后交给 Windows 安装程序。方向只影响界面文案，不在这里判断。
 * 下载流式落盘（336MB 不进内存），进度写进 updateState 供 /api/dsh-about/update-state 轮询。
 */
/** 已下载安装包的落盘位置（tag 已过白名单校验，不含路径分隔符）。 */
function installerPath(tag) {
  return join(resolveInstallerDir(), 'DeepSeek Harness Setup ' + tag.replace(/^v/, '') + '.exe')
}

/**
 * 安装包放哪。优先 ~/Downloads（用户熟悉），但它可能被挪到别的盘甚至不存在 ——
 * 目录建不出来的话退回 <dsh home>/updates，免得下载一上来就 ENOENT。
 */
function resolveInstallerDir() {
  const preferred = join(homedir(), 'Downloads')
  try {
    mkdirSync(preferred, { recursive: true })
    return preferred
  } catch (_) {}
  const fallback = join(dshHome(), 'updates')
  mkdirSync(fallback, { recursive: true })
  return fallback
}

function fileSize(p) {
  try { return statSync(p).size } catch (_) { return 0 }
}

/**
 * 下载状态机。状态活在宿主进程里，不依赖任何前端窗口 —— 弹窗关掉、面板切走，
 * 下载照样跑，前端回来时照样能看到真实进度。
 * phase: idle | downloading | paused | ready | installing | error
 */
const dl = {
  phase: 'idle',
  tag: '',
  url: '',
  path: '',
  received: 0,
  total: 0,
  speed: 0,
  error: '',
  helper: '',
  startedAt: 0,
  updatedAt: 0,
  autoInstall: false,
  pausedByUser: false,
  installStarted: false,
  installNote: '',
}
let dlAbort = null

function dlError(e) {
  if (!e) return '未知错误'
  if (e.name === 'AbortError') return '下载被中断'
  return e.message ? e.message : String(e)
}

function dlSnapshot() {
  const part = dl.path ? fileSize(dl.path + '.part') : 0
  const done = dl.path ? fileSize(dl.path) : 0
  return {
    phase: dl.phase,
    tag: dl.tag,
    received: dl.received,
    total: dl.total,
    speed: dl.speed,
    path: dl.path,
    error: dl.error,
    startedAt: dl.startedAt,
    updatedAt: dl.updatedAt,
    partBytes: part,
    fileBytes: done,
    ready: done > 1000000,
    installStarted: dl.installStarted,
    installNote: dl.installNote,
  }
}

async function dlRun() {
  const part = dl.path + '.part'
  let offset = fileSize(part)
  dlAbort = new AbortController()
  const headers = offset > 0 ? { Range: 'bytes=' + offset + '-' } : {}
  const res = await fetch(dl.url, { redirect: 'follow', headers, signal: dlAbort.signal })
  if (!res.ok && res.status !== 206) throw new Error('下载失败 HTTP ' + res.status)
  if (res.status !== 206 && offset > 0) offset = 0
  const len = Number(res.headers.get('content-length')) || 0
  if (len) dl.total = len + offset
  if (!res.body) throw new Error('下载响应为空')

  const file = createWriteStream(part, { flags: offset > 0 ? 'a' : 'w' })
  // 写流必须挂 error 监听：不然磁盘满/权限问题会让 'error' 变成未捕获异常，
  // 直接把整个宿主进程带崩（前端表现就是「自动重连中 + Failed to fetch」）。
  let streamErr = null
  file.on('error', (e) => { streamErr = e })
  let received = offset
  const t0 = Date.now()
  for await (const chunk of Readable.fromWeb(res.body)) {
    if (streamErr) throw streamErr
    received += chunk.length
    dl.received = received
    dl.updatedAt = Date.now()
    const secs = (dl.updatedAt - t0) / 1000
    if (secs > 0.3) dl.speed = Math.round((received - offset) / secs)
    if (!file.write(chunk)) await once(file, 'drain')
  }
  await new Promise((resolve, reject) => file.end((err) => (err ? reject(err) : resolve())))
  if (streamErr) throw streamErr

  const size = fileSize(part)
  if (size < 1000000) throw new Error('下载文件异常，只有 ' + size + ' 字节')
  rmSync(dl.path, { force: true })
  renameSync(part, dl.path)
  dl.received = size
  dl.total = size
  dl.speed = 0
  dl.phase = 'ready'
  dl.updatedAt = Date.now()
  if (dl.autoInstall) {
    try { dlInstall() } catch (_) {}
  }
}

function dlTrack() {
  dlRun().catch((e) => {
    if (dl.pausedByUser) {
      dl.phase = 'paused'
      dl.error = ''
    } else {
      dl.phase = 'error'
      dl.error = dlError(e)
    }
    dl.speed = 0
    dl.updatedAt = Date.now()
  }).finally(() => { dlAbort = null })
}

function dlStart(tag, assetUrl, opts) {
  if (!tag || !/^[A-Za-z0-9._-]+$/.test(tag)) throw new Error('版本号无效')
  if (dl.phase === 'downloading') throw new Error('已经在下载了，先暂停或等它结束')
  const url = String(assetUrl || '').trim()
  if (!url) throw new Error('缺少安装包地址')
  dl.tag = tag
  dl.url = url
  dl.path = installerPath(tag)
  dl.error = ''
  dl.received = fileSize(dl.path + '.part')
  dl.total = 0
  dl.speed = 0
  dl.startedAt = Date.now()
  dl.updatedAt = Date.now()
  dl.phase = 'downloading'
  dl.autoInstall = !!(opts && opts.install)
  dl.pausedByUser = false
  dlTrack()
  return dlSnapshot()
}

function dlPause() {
  if (dl.phase !== 'downloading') throw new Error('当前没有正在进行的下载')
  dl.pausedByUser = true
  try { if (dlAbort) dlAbort.abort() } catch (_) {}
  dl.phase = 'paused'
  dl.speed = 0
  dl.updatedAt = Date.now()
  return dlSnapshot()
}

function dlResume() {
  if (dl.phase !== 'paused' && dl.phase !== 'error') throw new Error('当前没有可继续的下载')
  if (!dl.url) throw new Error('不知道要下载哪个版本')
  dl.pausedByUser = false
  dl.error = ''
  dl.phase = 'downloading'
  dl.updatedAt = Date.now()
  dlTrack()
  return dlSnapshot()
}

function dlDelete() {
  if (dl.phase === 'downloading') {
    dl.pausedByUser = true
    try { if (dlAbort) dlAbort.abort() } catch (_) {}
  }
  for (const p of [dl.path, dl.path ? dl.path + '.part' : '']) {
    if (p) rmSync(p, { force: true })
  }
  dl.phase = 'idle'
  dl.received = 0
  dl.total = 0
  dl.speed = 0
  dl.error = ''
  dl.updatedAt = Date.now()
  return dlSnapshot()
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms))

/** 在资源管理器里定位到安装包（安装程序起不来时的兜底：用户可以自己双击）。 */
function revealInstaller() {
  const file = dl.path || installerPath(dl.tag)
  if (!existsSync(file)) throw new Error('安装包不见了：' + file)
  try {
    spawn('explorer.exe', ['/select,' + file], { stdio: 'ignore', windowsHide: false }).unref()
  } catch (e) {
    throw new Error('打不开资源管理器：' + (e && e.message ? e.message : String(e)))
  }
  return { ok: true, path: file }
}

/** 跑一条命令并把输出收回来（用来问 tasklist）。 */
function runCapture(cmd, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let out = ''
    let child
    try {
      child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      resolve({ ok: false, out: '', error: String(e) })
      return
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch (_) {}
      resolve({ ok: false, out, error: 'timeout' })
    }, timeoutMs)
    child.stdout.on('data', (c) => { out += c })
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, out, error: String(e) }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, out, code }) })
  })
}

/** 某个映像名现在有没有在跑。 */
async function isRunning(imageName) {
  const r = await runCapture('tasklist', ['/FI', 'IMAGENAME eq ' + imageName, '/NH'])
  return r.out.toLowerCase().indexOf(imageName.toLowerCase()) !== -1
}

/**
 * 安装。这里不先杀自己：electron-builder 的 NSIS 自带 CHECK_APP_RUNNING（installSection.nsh），
 * 会在真正开始装的时候用 taskkill /f 干掉正在运行的我们（升级场景直接杀、不弹框）。
 * 提前自杀只会让「安装被取消」变成「app 没了、也没装上」。
 * 要补的是「到底起没起来」——启动后做一次进程探测，把结果如实报给界面。
 */
function dlInstall() {
  const file = dl.path || installerPath(dl.tag)
  if (!existsSync(file)) throw new Error('安装包不见了：' + file)
  const size = fileSize(file)
  if (size < 1000000) throw new Error('安装包还没下载完（当前 ' + size + ' 字节）')

  // 去掉「来自互联网」标记：未签名的安装包带着它容易静默撞上 SmartScreen。
  try {
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Unblock-File -LiteralPath ' + JSON.stringify(file)], { windowsHide: true, stdio: 'ignore' })
  } catch (_) {}

  const image = file.split(/[\\/]/).pop()
  try {
    const child = spawn('cmd.exe', ['/c', 'start', '""', '/d', file.replace(/[\\/][^\\/]*$/, ''), file], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
  } catch (e) {
    dl.phase = 'error'
    dl.error = '启动安装程序失败：' + (e && e.message ? e.message : String(e))
    dl.updatedAt = Date.now()
    throw new Error(dl.error)
  }

  dl.phase = 'installing'
  dl.helper = file
  dl.installStarted = false
  dl.installNote = ''
  dl.updatedAt = Date.now()

  ;(async () => {
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      await sleepMs(700)
      if (await isRunning(image)) {
        dl.installStarted = true
        dl.installNote = ''
        dl.updatedAt = Date.now()
        return
      }
    }
    dl.installStarted = false
    dl.installNote = '没检测到安装程序进程（' + image + '）'
    dl.updatedAt = Date.now()
  })()

  return { ok: true, path: file, size, image, verified: 'pending' }
}
// ---- 会话版本（随插件发布的工具：读/切换会话文件的格式代）----
// 官方说回退后旧内核读不了新格式会话；这个工具用「隐藏新代 + 原文件不删」的方式
// 让旧内核回落到它认得的旧代，是可逆的。
const SESSION_TOOL = fileURLToPath(new URL('../tools/dsh-session-version.mjs', import.meta.url))
const SESSION_ACTIONS = new Set(['list', 'probe', 'convert', 'hide', 'show'])

function runSessionTool(toolArgs, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SESSION_TOOL, ...toolArgs], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      try { child.kill() } catch (_) {}
      reject(new Error('会话工具超时（' + Math.round(timeoutMs / 1000) + 's）'))
    }, timeoutMs)
    child.stdout.on('data', (c) => { out += c })
    child.stderr.on('data', (c) => { err += c })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }) })
  })
}

async function sessionInventory() {
  const r = await runSessionTool(['list', '--json'])
  const line = String(r.out || '').split(/\r?\n/).filter(Boolean).pop()
  if (!line) throw new Error('会话工具没有输出' + (r.err ? '：' + r.err.trim().split(/\r?\n/).pop() : ''))
  let parsed
  try { parsed = JSON.parse(line) } catch (_) { throw new Error('会话工具输出无法解析') }
  if (!parsed || !parsed.ok) throw new Error('会话盘点失败')
  return parsed.sessions || []
}

async function sessionAction(body) {
  const action = String((body && body.action) || '')
  if (!SESSION_ACTIONS.has(action) || action === 'list') throw new Error('不支持的操作：' + action)
  const id = String((body && body.id) || '')
  if (!/^(session-)?[0-9a-fA-F-]{36}$/.test(id)) throw new Error('会话 id 无效')
  const gen = Number(body && body.gen)
  if (!Number.isInteger(gen) || gen < 0 || gen > 8) throw new Error('代次无效')
  const args = [action, '--id', id, '--gen', String(gen)]
  if (body && body.write) args.push('--write')
  const r = await runSessionTool(args)
  const text = (String(r.out || '') + String(r.err || '')).trim()
  if (r.code !== 0 && !text) throw new Error('会话工具退出码 ' + r.code)
  return { ok: r.code === 0, code: r.code, output: text }
}

// ---- 网页版 Chat 的本地存档（按会话存 Markdown）----
// 内嵌面板把整段会话读出来交给这里：按会话 id 写 <会话>.md，另维护一份 index.json
// 方便枚举。与内核会话一样只落本地，内容不经过任何第三方。
const CHAT_URL_PREFIX = 'https://chat.deepseek.com'
const CHAT_TEXT_MAX = 800000
const chatLast = { hash: '', key: '', at: 0 }

const webChatDir = () => join(dshHome(), 'web-chat')
const webChatIndexFile = () => join(webChatDir(), 'index.json')

/** 会话标识：优先用 URL 里的会话 id，页面标题兜底。 */
function chatSessionKey(url) {
  const u = String(url || '')
  const m = /\/s\/([A-Za-z0-9_-]{6,})/.exec(u) || /\/([0-9a-fA-F-]{16,})(?:[/?#]|$)/.exec(u)
  if (m) return m[1]
  if (u.indexOf('/sign_in') !== -1) return '_sign-in'
  return '_page-' + createHash('sha1').update(u).digest('hex').slice(0, 10)
}

function chatMarkdown(rec) {
  const out = []
  out.push('---')
  out.push('title: ' + JSON.stringify(rec.title || ''))
  out.push('session: ' + rec.key)
  out.push('url: ' + rec.url)
  out.push('updated: ' + new Date(rec.at).toISOString())
  out.push('messages: ' + (rec.messages ? rec.messages.length : 0))
  out.push('---')
  out.push('')
  out.push('# ' + (rec.title || rec.key))
  out.push('')
  if (rec.messages && rec.messages.length >= 2) {
    out.push('> 角色是按页面结构判断的，正文为页面原文。')
    out.push('')
    rec.messages.forEach((m, i) => {
      out.push('## ' + (m.role === 'assistant' ? '助手' : '用户') + ' #' + (i + 1))
      out.push('')
      out.push(m.text)
      out.push('')
    })
  } else {
    out.push(rec.text)
    out.push('')
  }
  return out.join('\n')
}

function saveChatSnapshot(input) {
  const url = String((input && input.url) || '')
  if (url.indexOf(CHAT_URL_PREFIX) !== 0) throw new Error('只接受 chat.deepseek.com 的页面内容')
  // 登录页不是对话内容，别往存档里塞噪音。
  if (url.indexOf('/sign_in') !== -1) {
    return { ok: true, stored: false, skipped: true, reason: 'sign-in page', at: Date.now(), key: '_sign-in', chars: 0, rows: 0, file: '' }
  }
  const text = String((input && input.text) || '').slice(0, CHAT_TEXT_MAX)
  const messages = Array.isArray(input && input.messages)
    ? input.messages.slice(0, 5000)
        .map((m) => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', text: String((m && m.text) || '').slice(0, 200000) }))
        .filter((m) => m.text.trim())
    : []
  if (!text.trim() && messages.length === 0) throw new Error('页面内容为空')
  const title = String((input && input.title) || '')
  const key = chatSessionKey(url)
  const now = Date.now()
  const hash = createHash('sha1').update(key + '\u0000' + text).digest('hex')
  const file = join(webChatDir(), key + '.md')

  // 长会话在页面上是分页拉取的：翻页前 DOM 里没有更早的消息。所以存档只允许
  // 变长，不允许被一个更短的快照覆盖，否则一边翻一边同步会把历史越写越少。
  let prevIndex = {}
  try { prevIndex = JSON.parse(readFileSync(webChatIndexFile(), 'utf8')) || {} } catch (_) {}
  const prev = prevIndex[key]
  if (prev && messages.length > 0 && messages.length < (prev.messages || 0)) {
    return {
      ok: true, stored: false, changed: false, at: now, key,
      chars: text.length, rows: messages.length, file,
      reason: 'snapshot shorter than the archived one; kept the longer copy',
    }
  }

  if (hash === chatLast.hash && chatLast.key === key) {
    return { ok: true, stored: false, changed: false, at: now, key, chars: text.length, rows: messages.length, file }
  }
  const rec = { at: now, key, url, title, text, messages }
  try {
    mkdirSync(webChatDir(), { recursive: true })
    writeFileSync(file, chatMarkdown(rec), 'utf8')
    prevIndex[key] = { id: key, title, url, updatedAt: now, chars: text.length, messages: messages.length, file: key + '.md' }
    writeFileSync(webChatIndexFile(), JSON.stringify(prevIndex, null, 2), 'utf8')
  } catch (e) {
    throw new Error('存档写入失败：' + (e && e.message ? e.message : String(e)))
  }
  chatLast.hash = hash
  chatLast.key = key
  chatLast.at = now
  return { ok: true, stored: true, changed: true, at: now, key, chars: text.length, rows: messages.length, file }
}

function listChatSessions() {
  try {
    const index = JSON.parse(readFileSync(webChatIndexFile(), 'utf8')) || {}
    return Object.keys(index).map((k) => index[k]).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  } catch (_) {
    return []
  }
}

/** 读某个会话的 Markdown；不传 id 就取最近更新的那个。支持 id 前缀匹配。 */
function readChatSession(id) {
  const list = listChatSessions()
  if (!list.length) return null
  const want = String(id || '').trim()
  const hit = want ? (list.find((s) => s.id === want) || list.find((s) => s.id.indexOf(want) === 0)) : list[0]
  if (!hit) return null
  try {
    return { meta: hit, markdown: readFileSync(join(webChatDir(), hit.file), 'utf8') }
  } catch (_) {
    return null
  }
}


// ---- Office 原生渲染：把 docx/xlsx/pptx 交给本机 Office 转成 PDF 再预览 ----
// 为什么不自己解析：Office 的字体、版式、列宽、图表是排版引擎算出来的，
// 拿 XML 拼近似永远是「一坨」——用户看得出来的东西不能糊弄。
// 按内容哈希缓存：同一个文件只转一次。
const OFFICE_KIND = { docx: 'word', doc: 'word', rtf: 'word', xlsx: 'excel', xlsm: 'excel', xls: 'excel', pptx: 'ppt', ppt: 'ppt' }
const OFFICE_MAX_BYTES = 48 * 1024 * 1024
const officeJobs = new Map()

// Office 可用性：进程内探一次（查注册表，不启动 Office），之后没装的机器直接快失败。
const officeAvail = { checked: false, word: false, excel: false, ppt: false }
let officeProbeJob = null

function probeOffice() {
  if (officeProbeJob) return officeProbeJob
  if (officeAvail.checked) return Promise.resolve(officeAvail)
  const tool = fileURLToPath(new URL('../tools/office-probe.ps1', import.meta.url))
  officeProbeJob = runCapture('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tool], 30000)
    .then((r) => {
      const out = String(r.out || '')
      officeAvail.word = /word=1/.test(out)
      officeAvail.excel = /excel=1/.test(out)
      officeAvail.ppt = /ppt=1/.test(out)
      officeAvail.checked = true
      return officeAvail
    })
    .catch(() => { officeAvail.checked = true; return officeAvail })
    .finally(() => { officeProbeJob = null })
  return officeProbeJob
}
const officeDir = () => join(dshHome(), 'office-preview')

/** 把本机 Office 转出来的 PDF 取回来；命中缓存直接返回。 */
async function officeToPdf(name, base64) {
  const ext = String(name || '').split('.').pop().toLowerCase()
  const kind = OFFICE_KIND[ext]
  if (!kind) throw new Error('只支持 docx / xlsx / pptx 这些格式')
  const buf = Buffer.from(String(base64 || ''), 'base64')
  if (buf.length === 0) throw new Error('文件内容为空')
  if (buf.length > OFFICE_MAX_BYTES) throw new Error('文件太大（' + Math.round(buf.length / 1048576) + ' MB），超过 ' + Math.round(OFFICE_MAX_BYTES / 1048576) + ' MB 上限')

  const avail = await probeOffice()
  if (avail.checked && !avail[kind]) {
    throw new Error('这台机器没有装 Microsoft Office（' + kind + '），已退回简化预览')
  }

  const hash = createHash('sha1').update(buf).digest('hex')
  const dir = officeDir()
  const pdfPath = join(dir, hash + '.pdf')
  if (existsSync(pdfPath) && fileSize(pdfPath) > 1000) {
    return { pdf: readFileSync(pdfPath).toString('base64'), cached: true, kind, bytes: fileSize(pdfPath) }
  }
  if (officeJobs.has(hash)) return officeJobs.get(hash)

  const job = (async () => {
    mkdirSync(dir, { recursive: true })
    const srcPath = join(dir, hash + '.' + ext)
    writeFileSync(srcPath, buf)
    const tool = fileURLToPath(new URL('../tools/office-to-pdf.ps1', import.meta.url))
    const r = await runCapture('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', tool, '-In', srcPath, '-Out', pdfPath, '-Kind', kind,
    ], 120000)
    if (!existsSync(pdfPath) || fileSize(pdfPath) <= 1000) {
      const why = String(r.out || '').trim().split(/\r?\n/).filter(Boolean).pop() || ('退出码 ' + r.code)
      throw new Error('Office 转换失败：' + why)
    }
    return { pdf: readFileSync(pdfPath).toString('base64'), cached: false, kind, bytes: fileSize(pdfPath) }
  })().finally(() => { officeJobs.delete(hash) })

  officeJobs.set(hash, job)
  return job
}

// ---- 宠物插件开关（默认不启用）----
// 宠物插件是用户自己装的东西，我们只读写 profile 的 bundles 列表，不动任何文件。
const PET_PLUGINS = [
  'dsh-pet',
  '@signalight/dsh-codex-pet',
  'pet-gallery',
  'pet-floater',
  'whale-girl',
  'whale-girl-settings',
  'dsh-dafeiyu',
]

const petsManifestPath = () => join(dshHome(), 'profiles', 'web', 'package.json')

function petsReport() {
  const manifestPath = petsManifestPath()
  let pkg = null
  try { pkg = JSON.parse(readFileSync(manifestPath, 'utf8')) } catch (_) { return { items: [], manifestPath, missing: true } }
  const bundles = (pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles)) ? pkg.dsh.profile.bundles : []
  const nm = join(dshHome(), 'profiles', 'web', 'node_modules')
  const items = PET_PLUGINS.map((name) => ({
    name,
    present: existsSync(join(nm, ...name.split('/'))),
    enabled: bundles.indexOf(name) !== -1,
  })).filter((x) => x.present || x.enabled)
  return { items, manifestPath }
}

function setPetEnabled(name, enabled) {
  if (PET_PLUGINS.indexOf(name) === -1) throw new Error('不认识的宠物插件：' + name)
  const manifestPath = petsManifestPath()
  let pkg = null
  try { pkg = JSON.parse(readFileSync(manifestPath, 'utf8')) } catch (_) { throw new Error('读不到 profile 清单：' + manifestPath) }
  pkg.dsh = pkg.dsh || {}
  pkg.dsh.profile = pkg.dsh.profile || {}
  const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : []
  const idx = bundles.indexOf(name)
  if (enabled && idx === -1) bundles.push(name)
  if (!enabled && idx !== -1) bundles.splice(idx, 1)
  pkg.dsh.profile.bundles = bundles
  writeFileSync(manifestPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  return { name, enabled }
}

// ---- 宠物系统（系统层；外观/动画交给用户资源）----
// 设计见 work/pet-system.md。要点：
//   · 默认关：关着不启定时器、不扫资源；
//   · 状态住磁盘（~/.dsh/pets），60s 低频推进，不靠渲染帧驱动；
//   · 子代理派生 mini 分身：agent 一多就多几只，agent 走了自动回收；
//   · 本层只出状态与选项，渲染由客户端投影，外观由用户资源决定。
const PET_DEFAULTS = {
  enabled: false,
  resourceId: '',
  size: 'medium',
  corner: 'bottom-right',
  miniMax: 2,
  notify: { period: true, usage: true, longRun: true },
}
const petDir = () => join(dshHome(), 'pets')
const petOptionsPath = () => join(petDir(), 'options.json')
const pet = { options: null, instances: [], lastTickAt: 0, timer: null, error: "", agentsSeen: 0 }

function petReadOptions() {
  try {
    const raw = JSON.parse(readFileSync(petOptionsPath(), 'utf8')) || {}
    return { ...PET_DEFAULTS, ...raw, notify: { ...PET_DEFAULTS.notify, ...(raw.notify || {}) } }
  } catch (_) {
    return { ...PET_DEFAULTS, notify: { ...PET_DEFAULTS.notify } }
  }
}

function petWriteOptions(patch) {
  const next = { ...petReadOptions(), ...(patch || {}) }
  if (patch && patch.notify) next.notify = { ...petReadOptions().notify, ...patch.notify }
  try {
    mkdirSync(petDir(), { recursive: true })
    writeFileSync(petOptionsPath(), JSON.stringify(next, null, 2) + '\n', 'utf8')
  } catch (e) {
    throw new Error('选项写入失败：' + (e && e.message ? e.message : String(e)))
  }
  pet.options = next
  return next
}

/**
 * 从活的 agent 集合推导宠物实例：顶层一只，每个子代理一只 mini（上限可配）。
 * 纯函数，方便单测。
 */
function petDeriveInstances(agents, roots, options) {
  const list = Array.isArray(agents) ? agents : []
  const rootIds = new Set((Array.isArray(roots) ? roots : []).map((a) => String((a && a.id) || a || '')))
  const minis = []
  let rootOwner = ''
  for (const a of list) {
    const id = String((a && a.id) || a || '')
    if (!id) continue
    if (rootIds.has(id)) { if (!rootOwner) rootOwner = id; continue }
    minis.push(id)
  }
  const cap = Math.max(0, Number(options && options.miniMax) || 0)
  const out = []
  if (rootOwner) out.push({ id: 'root', kind: 'root', owner: rootOwner })
  for (const owner of minis.slice(0, cap)) out.push({ id: 'mini-' + owner, kind: 'mini', owner })
  return out
}

/** 开着宠物就保证至少有一只 root —— agent 只在一轮对话活着时出现在注册表里，
 *  空闲时列表为空，原来会导致「开关开着却什么都没有」。子代理来了再挂 mini。 */
function petRootStub() {
  return { id: 'root', kind: 'root', owner: 'local' }
}

function petSync(ctx) {
  const options = pet.options || petReadOptions()
  pet.options = options
  if (!options.enabled) { pet.instances = []; pet.error = ''; return [] }
  let derived = []
  try {
    // 软查找 agents 服务：不写进 inject 是因为「依赖不到就整个插件不加载」，
    // 那比「拿不到 agent 就没有宠物」严重得多。
    const reg = (typeof ctx.get === 'function' ? ctx.get('agents') : null) || ctx.agents || null
    if (!reg || typeof reg.list !== 'function') {
      pet.agentsSeen = 0
      pet.error = '拿不到 agents 服务（只显示常驻宠物，不跟随 agent）'
    } else {
      const all = reg.list()
      pet.agentsSeen = Array.isArray(all) ? all.length : 0
      derived = petDeriveInstances(all, typeof reg.roots === 'function' ? reg.roots() : [], options)
      pet.error = ''
    }
  } catch (e) {
    // 以前这里静默吞错，导致「开关开了、资源也在、就是没有宠物」这种哑巴故障。
    pet.error = '读 agent 列表失败：' + (e && e.message ? e.message : String(e))
    derived = []
  }
  pet.instances = derived.length ? derived : [petRootStub()]
  return pet.instances
}
function petEnsureTimer(ctx) {
  const options = pet.options || petReadOptions()
  pet.options = options
  if (!options.enabled) {
    if (pet.timer) { clearInterval(pet.timer); pet.timer = null }
    pet.instances = []
    return
  }
  petSync(ctx)
  if (!pet.timer) {
    pet.timer = setInterval(() => {
      if (!pet.options || !pet.options.enabled) return
      pet.lastTickAt = Date.now()
      petSync(ctx)
    }, 60000)
    if (pet.timer.unref) pet.timer.unref()
  }
}

// ---- 宠物资源扫描：内置 pets/ + 用户 ~/.dsh/pets/resources/ ----
// 用户丢一个文件夹进来就能用；这里是唯一的解析入口，没有缓存（目录很小，扫一次毫秒级）。
const petBuiltinDir = () => fileURLToPath(new URL('../pets/', import.meta.url))
const petUserDir = () => join(petDir(), 'resources')

/**
 * 资源内容版本号 —— 拼进资产 URL 的 `&v=`，内容一变 URL 就变，浏览器自然重取。
 *
 * 为什么需要：帧的 URL 只有 `id + kind`，换掉图片文件后 URL 一字不变，而浏览器
 * 把这些 <img> 的解码结果一直攥在内存里 —— 不刷新页面就永远看旧图（踩过：
 * 新帧已经发给浏览器了，屏幕上还是上一版，被当成「新做的还是糊」）。
 *
 * 取 manifest + 各状态目录里文件的 (数量, 总字节, 最大 mtime) 摘要。每只宠物 70 多个
 * 文件，全量 stat 有点贵，所以按 id 缓存 5 秒。
 */
const petRevCache = new Map()
function petRev(id, dir) {
  const hit = petRevCache.get(id)
  const now = Date.now()
  if (hit && now - hit.at < 5000) return hit.rev
  let n = 0, bytes = 0, mt = 0
  const bump = (p) => {
    try {
      const st = statSync(p)
      n += 1; bytes += st.size; if (st.mtimeMs > mt) mt = st.mtimeMs
    } catch (_) {}
  }
  bump(join(dir, 'manifest.json'))
  try {
    for (const st of readdirSync(dir, { withFileTypes: true })) {
      if (!st.isDirectory()) { if (/\.(png|webp|jpe?g)$/i.test(st.name)) bump(join(dir, st.name)); continue }
      const sub = join(dir, st.name)
      for (const f of readdirSync(sub)) if (/\.(png|webp|jpe?g)$/i.test(f)) bump(join(sub, f))
    }
  } catch (_) {}
  const rev = n + '-' + bytes + '-' + Math.round(mt)
  petRevCache.set(id, { at: now, rev })
  return rev
}

// Codex 宠物图集（spriteVersionNumber: 2）：8 列 × N 行，格子 192×208。
// 行序是 Codex 的固定约定 —— 行号就是「第几段动画」，不是我们定的。
const CODEX_ATLAS = {
  cellW: 192,
  cellH: 208,
  cols: 8,
  rows: {
    idle: 0,
    'running-right': 1,
    'running-left': 2,
    waving: 3,
    jumping: 4,
    failed: 5,
    waiting: 6,
    running: 7,
    review: 8,
  },
  lookRows: [9, 10],   // 9 行版没有这两行；11 行版它们就是 16 个朝向
}

/**
 * 认出一个 Codex 宠物包：`pet.json` + 图集文件（原样丢进来就能用）。
 * 这是「直接用 Codex 的」那条路 —— 不再离线切图、不再重采样，
 * 客户端用 CSS sprite 精确裁格，一格不多一格不少。
 */
function petCodexPackage(dir, m) {
  let pj = null
  try { pj = JSON.parse(readFileSync(join(dir, 'pet.json'), 'utf8')) || {} } catch (_) { pj = null }
  if (!pj) return null
  const ver = Number(pj.spriteVersionNumber) || Number(m.spriteVersionNumber) || 0
  const sprite = String(pj.spritesheetPath || m.sprite || '')
  if (!sprite) return null
  if (!existsSync(join(dir, sprite))) return null
  return { pj, ver, sprite }
}

function petScanDir(root, builtin) {
  const out = []
  let entries = []
  try { entries = readdirSync(root, { withFileTypes: true }) } catch (_) { return out }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    try {
      const m = JSON.parse(readFileSync(join(root, e.name, 'manifest.json'), 'utf8')) || {}
      const portrait = String(m.portrait || 'portrait.png')
      const pkg = petCodexPackage(join(root, e.name), m)
      // 图集是权威产物，我们只负责「怎么裁格」。
      const sprite = pkg ? pkg.sprite : (m.sprite ? String(m.sprite) : '')
      const declared = (m.format === 'clips' && m.clips && typeof m.clips === 'object') ? m.clips : null
      // **帧目录优先于图集**：图集格子只有 192x208，拉到 350px 就是放大 1.8 倍、必糊。
      // 同目录里若同时有帧目录（为这块屏幕分辨率专门做的），就用帧目录；
      // 只有「纯 Codex 包」（没有帧目录）才走图集 —— 这样原样丢进来的 Codex 宠物照样能用。
      const discovered = petDiscoverFrames(join(root, e.name), declared)
      let atlas = null
      let clips = null
      if (discovered) {
        clips = declared ? { ...declared, ...discovered } : discovered
      } else if (pkg) {
        // 每段动画 = 一行。帧数不写死：客户端加载图集后数「前导非空格」，
        // 因为每行的实际帧数各不相同（idle 是 7 帧、waving 只有 4 帧，其余补空格）。
        const rows = {}
        for (const name of Object.keys(CODEX_ATLAS.rows)) {
          const base = (declared && declared[name]) || {}
          rows[name] = { row: CODEX_ATLAS.rows[name], frameMs: base.frameMs || 160, loop: base.loop !== false }
        }
        clips = rows
        atlas = {
          file: sprite,
          cellW: Number(m.cellW) || CODEX_ATLAS.cellW,
          cellH: Number(m.cellH) || CODEX_ATLAS.cellH,
          cols: Number(m.cols) || CODEX_ATLAS.cols,
          lookRows: CODEX_ATLAS.lookRows,
        }
      } else {
        clips = declared
      }
      out.push({
        id: String(m.id || (pkg && pkg.pj.id) || e.name),
        name: String(m.name || (pkg && pkg.pj.displayName) || e.name),
        builtin: !!builtin,
        // 资源格式：'clips'（状态 -> 帧序列，能跟着 agent 演出）或 'portrait'（单张立绘）
        format: clips ? 'clips' : 'portrait',
        clips,
        atlas,
        stateMap: (m.stateMap && typeof m.stateMap === 'object') ? m.stateMap : null,
        // 空闲/思考时的随机小动作池。**必须在这里透出去** —— 客户端读的就是它，
        // 早前漏了这一行，随机动作静默失效（池子永远是空的）。
        idleMicroClips: Array.isArray(m.idleMicroClips) ? m.idleMicroClips.map(String) : [],
        // 眨眼段名。**同样必须在这里透出去** —— 客户端读的就是它，漏掉就静默不眨眼
        // （和 idleMicroClips 当初那个坑同源，现在有 _contract.mjs 兜着）。
        blinkClip: typeof m.blinkClip === 'string' ? m.blinkClip : '',
        // 单击 / 长按 的互动反应段名。客户端只读得到宿主这一层吐出来的东西，
        // 所以每加一个字段都得在这里补一行（_contract.mjs 会盯着）。
        pokeClip: typeof m.pokeClip === 'string' ? m.pokeClip : '',
        pressClip: typeof m.pressClip === 'string' ? m.pressClip : '',
        // 其余互动段名。客户端只读得到宿主这一层吐出来的东西 —— 每加一个字段都要在这里补一行，
        // 漏掉就是「静默不生效」（_contract.mjs 会盯着客户端读了哪些字段）。
        blinkDoubleClip: typeof m.blinkDoubleClip === 'string' ? m.blinkDoubleClip : '',
        angryClip: typeof m.angryClip === 'string' ? m.angryClip : '',
        startleClip: typeof m.startleClip === 'string' ? m.startleClip : '',
        fallClip: typeof m.fallClip === 'string' ? m.fallClip : '',
        dropClip: typeof m.dropClip === 'string' ? m.dropClip : '',
        sleepClip: typeof m.sleepClip === 'string' ? m.sleepClip : '',
        wakeClip: typeof m.wakeClip === 'string' ? m.wakeClip : '',
        walkClip: typeof m.walkClip === 'string' ? m.walkClip : '',
        // 溜达用的带方向段。注意客户端是用 `resource[kind + "Clip"]` **算出来的键**读的，
        // 所以 _contract.mjs 那种「扫客户端读了哪些字段」的办法扫不到它们 ——
        // 加字段时得手动往这里补，否则就是静默拿到空串。
        strollLeftClip: typeof m.strollLeftClip === 'string' ? m.strollLeftClip : '',
        strollRightClip: typeof m.strollRightClip === 'string' ? m.strollRightClip : '',
        framesDir: String(m.framesDir || '.'),
        baseSize: Number(m.baseSize) || 0,
        portrait,
        sprite,
        spriteVersionNumber: Number(m.spriteVersionNumber) || 0,
        scale: Number(m.scale) || 1,
        anchor: String(m.anchor || 'bottom-right'),
        dir: join(root, e.name),
        rev: petRev(String(m.id || e.name), join(root, e.name)),
        hasPortrait: existsSync(join(root, e.name, portrait)),
        hasSprite: !!sprite && existsSync(join(root, e.name, sprite)),
      })
    } catch (_) { /* 清单坏了就跳过这一只，不影响别人 */ }
  }
  return out
}

/**
 * 状态帧自动发现：pets/<id>/<state>/*.png 按名字排序就是该状态的帧序列。
 * 这样加动画不用改清单 —— 丢图进文件夹即可（缺帧就退回清单里的定义）。
 */
function petDiscoverFrames(dir, clips) {
  const out = {}
  for (const state of ['idle', 'thinking', 'working', 'waiting', 'success', 'error']) {
    try {
      const sub = join(dir, state)
      const files = readdirSync(sub).filter((n) => /\.(png|webp|jpg|jpeg)$/i.test(n)).sort()
      if (files.length) {
        const base = (clips && clips[state]) || {}
        out[state] = { frames: files.map((n) => join(state, n)), frameMs: base.frameMs || 160, loop: base.loop !== false }
        if (base.motion) out[state].motion = base.motion
      }
    } catch (_) { /* 没有这个状态目录就跳过 */ }
  }
  return Object.keys(out).length ? out : null
}
function petResources() {
  const builtin = petScanDir(petBuiltinDir(), true)
  const user = petScanDir(petUserDir(), false)
  const seen = new Set(builtin.map((r) => r.id))
  return builtin.concat(user.filter((r) => !seen.has(r.id)))
}

function petResourceById(id) {
  return petResources().find((r) => r.id === String(id || '')) || null
}

// ---- 宠物资源：按需下载（安装包不再内置宠物）----
// 宠物帧图有 120 MB 上下，塞进安装包对所有人都是净负担：不用宠物的人白下，
// 用的人也只想要自己喜欢的那一只。所以外观层改成「资源在仓库的 pet-assets 分支，
// 要哪只下哪只」，装到用户宠物目录（和手工丢进去的文件夹同一个位置）。
const PET_ASSETS = {
  repo: 'GengruiZhu/deepseek-harness-desktop-on-windows',
  branch: 'pet-assets',
  dir: 'pets',
  // 仓库里的 index.json 是权威清单；拿不到（离线 / 限流）就用这份内置表，
  // 保证「有网就能下」不会因为一次接口失败而变成不可用。
  fallback: [
    { id: 'flash-honey', name: 'Flash Honey', file: 'flash-honey.zip', size: 70507814, note: 'Q 版小鲸鱼' },
    { id: 'pro-honey', name: 'Pro Honey', file: 'pro-honey.zip', size: 58724516, note: '高挑优雅' },
  ],
}
const petAssetUrl = (file) =>
  'https://raw.githubusercontent.com/' + PET_ASSETS.repo + '/' + PET_ASSETS.branch + '/' + PET_ASSETS.dir + '/' + file
const petIndexUrl = () =>
  'https://raw.githubusercontent.com/' + PET_ASSETS.repo + '/' + PET_ASSETS.branch + '/' + PET_ASSETS.dir + '/index.json'
const petDownloadDir = () => join(petDir(), 'downloads')
const petInstallMarker = '_installed.json'

let petRegistryCache = { at: 0, list: null, source: '' }

function petNormalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || '').trim()
  const file = String(raw.file || '').trim()
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id) || !file || !/^[A-Za-z0-9._-]+\.zip$/i.test(file)) return null
  return {
    id,
    name: String(raw.name || id),
    file,
    size: Number(raw.size) || 0,
    note: String(raw.note || ''),
  }
}

/**
 * 可用宠物清单。仓库 index.json 优先，失败退回内置表 —— 但**失败会被记下来**，
 * 界面上要能看见「清单没拉全」，而不是静默少几只。
 */
async function petRegistry(refresh) {
  const now = Date.now()
  if (!refresh && petRegistryCache.list && now - petRegistryCache.at < 600000) return petRegistryCache
  let list = null
  let source = 'builtin'
  let error = ''
  try {
    const res = await fetch(petIndexUrl(), { redirect: 'follow' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const body = await res.json()
    const raw = Array.isArray(body) ? body : (body && Array.isArray(body.pets) ? body.pets : null)
    const parsed = (raw || []).map(petNormalizeEntry).filter(Boolean)
    if (!parsed.length) throw new Error('清单为空')
    list = parsed
    source = 'remote'
  } catch (e) {
    error = e && e.message ? e.message : String(e)
    list = PET_ASSETS.fallback.map(petNormalizeEntry).filter(Boolean)
  }
  petRegistryCache = { at: now, list, source, error }
  return petRegistryCache
}

function petInstalledMap() {
  const out = {}
  for (const res of petResources()) {
    if (res.builtin) continue
    out[res.id] = { id: res.id, name: res.name, dir: res.dir }
  }
  return out
}

async function petRegistryPayload(refresh) {
  const reg = await petRegistry(refresh)
  const installed = petInstalledMap()
  return {
    source: reg.source,
    error: reg.error || '',
    repo: PET_ASSETS.repo,
    branch: PET_ASSETS.branch,
    installDir: petUserDir(),
    downloads: petDownloadState(),
    items: reg.list.map((e) => ({
      ...e,
      installed: !!installed[e.id],
      url: petAssetUrl(e.file),
    })),
  }
}

/**
 * 下载状态机（一次只跑一只，和安装包下载同样的取舍：状态住宿主，
 * 弹窗关掉、页面切走都照样跑完）。phase: idle | downloading | unpacking | done | error
 */
const petDl = {
  id: '', file: '', url: '', zip: '',
  phase: 'idle', received: 0, total: 0, speed: 0,
  error: '', startedAt: 0, updatedAt: 0,
}
let petDlAbort = null

function petDownloadState() {
  return {
    id: petDl.id,
    phase: petDl.phase,
    received: petDl.received,
    total: petDl.total,
    speed: petDl.speed,
    error: petDl.error,
    startedAt: petDl.startedAt,
    updatedAt: petDl.updatedAt,
  }
}

function petDownloadReset(id) {
  petDl.id = id || ''
  petDl.phase = 'idle'
  petDl.received = 0
  petDl.total = 0
  petDl.speed = 0
  petDl.error = ''
  petDl.updatedAt = Date.now()
}

/** Expand-Archive 是 Windows 自带能力；比自带一套 zip 解析器靠谱。 */
function petUnzip(zip, dest) {
  return new Promise((resolve, reject) => {
    const script =
      '$ErrorActionPreference="Stop";' +
      'Expand-Archive -LiteralPath ' + JSON.stringify(zip) + ' -DestinationPath ' + JSON.stringify(dest) + ' -Force'
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })
    let err = ''
    p.stderr.on('data', (b) => { err += String(b) })
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0) resolve(true)
      else reject(new Error('解压失败（退出码 ' + code + '）' + (err ? '：' + err.trim().slice(0, 300) : '')))
    })
  })
}

/** 装好之后写一个标记：区分「本应用装的」和「用户自己丢进来的同名文件夹」。 */
function petMarkInstalled(id, entry, bytes) {
  try {
    writeFileSync(join(petUserDir(), id, petInstallMarker),
      JSON.stringify({ id, file: entry.file, bytes, at: new Date().toISOString(), source: petAssetUrl(entry.file) }, null, 2) + '\n',
      'utf8')
  } catch (_) {}
}

async function petInstall(id) {
  const reg = await petRegistry(false)
  const entry = reg.list.find((e) => e.id === id)
  if (!entry) throw new Error('清单里没有这只宠物：' + id)

  const target = join(petUserDir(), id)
  if (existsSync(target) && !existsSync(join(target, petInstallMarker))) {
    throw new Error('已存在同名目录（不是本应用装的）：' + target + '，请先改个名再下')
  }

  mkdirSync(petDownloadDir(), { recursive: true })
  const zip = join(petDownloadDir(), entry.file)
  const part = zip + '.part'
  // 断点续传：和安装包下载同一条路 —— 网络断了不用从 0 再来 70 MB。
  let offset = fileSize(part)
  petDlAbort = new AbortController()
  const res = await fetch(petAssetUrl(entry.file), {
    redirect: 'follow',
    headers: offset > 0 ? { Range: 'bytes=' + offset + '-' } : {},
    signal: petDlAbort.signal,
  })
  if (!res.ok && res.status !== 206) throw new Error('下载失败 HTTP ' + res.status)
  if (res.status !== 206 && offset > 0) offset = 0
  if (!res.body) throw new Error('下载响应为空')
  const len = Number(res.headers.get('content-length')) || 0
  petDl.total = len ? len + offset : (entry.size || 0)

  const file = createWriteStream(part, { flags: offset > 0 ? 'a' : 'w' })
  let streamErr = null
  file.on('error', (e) => { streamErr = e })
  let received = offset
  const t0 = Date.now()
  for await (const chunk of Readable.fromWeb(res.body)) {
    if (streamErr) throw streamErr
    received += chunk.length
    petDl.received = received
    petDl.updatedAt = Date.now()
    const secs = (petDl.updatedAt - t0) / 1000
    if (secs > 0.3) petDl.speed = Math.round((received - offset) / secs)
    if (!file.write(chunk)) await once(file, 'drain')
  }
  await new Promise((resolve, reject) => file.end((err) => (err ? reject(err) : resolve())))
  if (streamErr) throw streamErr

  const bytes = fileSize(part)
  if (bytes < 1000000) throw new Error('下载文件异常，只有 ' + bytes + ' 字节')
  if (entry.size && bytes !== entry.size) throw new Error('大小对不上：期望 ' + entry.size + '，实际 ' + bytes)
  rmSync(zip, { force: true })
  renameSync(part, zip)
  petDl.received = bytes
  petDl.total = bytes
  petDl.speed = 0

  petDl.phase = 'unpacking'
  petDl.updatedAt = Date.now()
  const staging = join(petDownloadDir(), '.staging-' + id)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  await petUnzip(zip, staging)

  // 压缩包内已带顶层目录（<id>/…）；万一没有，就把解出来的内容当成资源本体。
  let from = join(staging, id)
  if (!existsSync(join(from, 'manifest.json'))) {
    const inner = readdirSync(staging, { withFileTypes: true }).filter((e) => e.isDirectory())
    const pick = inner.length === 1 ? join(staging, inner[0].name) : staging
    from = pick
  }
  if (!existsSync(join(from, 'manifest.json'))) {
    throw new Error('压缩包里没有 manifest.json，资源不完整')
  }

  mkdirSync(petUserDir(), { recursive: true })
  rmSync(target, { recursive: true, force: true })
  renameSync(from, target)
  rmSync(staging, { recursive: true, force: true })
  petMarkInstalled(id, entry, bytes)
  petRevCache.delete(id)

  petDl.phase = 'done'
  petDl.updatedAt = Date.now()
}

function petInstallStart(id) {
  const clean = String(id || '').trim()
  if (!clean) throw new Error('缺少宠物 id')
  if (petDl.phase === 'downloading' || petDl.phase === 'unpacking') throw new Error('正在处理另一只宠物，先等它结束')
  petDownloadReset(clean)
  petDl.id = clean
  petDl.phase = 'downloading'
  petDl.startedAt = Date.now()
  petDl.updatedAt = Date.now()
  petInstall(clean).catch((e) => {
    if (e && e.name === 'AbortError') petDownloadReset(clean)
    else {
      petDl.phase = 'error'
      petDl.error = e && e.message ? e.message : String(e)
      petDl.speed = 0
      petDl.updatedAt = Date.now()
    }
  }).finally(() => { petDlAbort = null })
  return petDownloadState()
}

function petInstallCancel() {
  if (petDl.phase !== 'downloading' && petDl.phase !== 'unpacking') throw new Error('当前没有正在进行的下载')
  try { if (petDlAbort) petDlAbort.abort() } catch (_) {}
  const id = petDl.id
  petDownloadReset(id)
  petDl.phase = 'idle'
  return petDownloadState()
}

function petUninstall(id) {
  const clean = String(id || '').trim()
  const target = join(petUserDir(), clean)
  if (!existsSync(target)) throw new Error('没装这只宠物')
  if (!existsSync(join(target, petInstallMarker))) {
    throw new Error('这不是本应用装的宠物（自己放进去的），要删请手动删：' + target)
  }
  if (petDl.id === clean && (petDl.phase === 'downloading' || petDl.phase === 'unpacking')) petInstallCancel()
  rmSync(target, { recursive: true, force: true })
  petRevCache.delete(clean)
  // 删掉的正好是当前使用的那只：清掉选择，客户端会自动挑一个还在的。
  const options = pet.options || petReadOptions()
  if (options.resourceId === clean) petWriteOptions({ resourceId: '' })
  return { id: clean, removed: true }
}

// ---- 子代理可选驱动（Codex CLI / Claude Code SDK）----
// 这两个驱动是 profile 插件（@deepseek-ai/dsh-subagent-codex / -claude-code）的**硬依赖**，
// 加起来约 590 MB（codex.exe 377 MB + claude 平台包 216 MB）。装进安装包意味着所有人
// 都得先下这 590 MB，哪怕他一次都不用子代理。所以：不放包里，用到了再从 npm 拉，
// 装到 **profile 的 node_modules**（`~/.dsh/profiles/web/node_modules/<scope>/<name>`）——
// 那是内核解析这两个插件依赖的地方（它们就在那儿），用户目录可写、不需要管理员。
const NPM_REGISTRY = 'https://registry.npmjs.org'
const profileWebModules = () => join(dshHome(), 'profiles', 'web', 'node_modules')
const profileRootModules = () => join(dshHome(), 'profiles', 'node_modules')
/** 内核自带的 node_modules：从解析到的 @deepseek-ai/dsh 位置推出来（不靠猜路径）。 */
const runtimeModules = () => {
  try {
    const pkg = requestRequire.resolve('@deepseek-ai/dsh/package.json')
    return join(dirname(pkg), '..', '..')
  } catch (_) { return '' }
}

const SUBAGENT_DRIVERS = [
  {
    id: 'codex',
    name: 'Codex CLI',
    note: 'subagent_codex 用（自己的 Codex 账号与额度）',
    plugin: '@deepseek-ai/dsh-subagent-codex',
    row: 'tool-subagent-codex',
    packages: [
      // 注意 @openai/codex 的写法：平台包是**同一个包名的另一个版本**
      // （`0.153.4-win32-x64`，npm 里通过 alias 装成 `@openai/codex-win32-x64`），
      // 所以下载地址用 registry 的包名 + 版本，落盘目录用 alias 名。
      { installAs: '@openai/codex', registry: '@openai/codex', version: '0.153.4', approx: 13 * 1024 },
      { installAs: '@openai/codex-win32-x64', registry: '@openai/codex', version: '0.153.4-win32-x64', approx: 129 * 1024 * 1024 },
    ],
  },
  {
    id: 'claude',
    name: 'Claude Code SDK',
    note: 'subagent_claude_code 用（自己的 Claude 账号与额度）',
    plugin: '@deepseek-ai/dsh-subagent-claude-code',
    row: 'tool-subagent-claude-code',
    packages: [
      { installAs: '@anthropic-ai/claude-agent-sdk', registry: '@anthropic-ai/claude-agent-sdk', version: '0.3.263', approx: 4.8 * 1024 * 1024 },
      { installAs: '@anthropic-ai/claude-agent-sdk-win32-x64', registry: '@anthropic-ai/claude-agent-sdk-win32-x64', version: '0.3.263', approx: 208.6 * 1024 * 1024 },
    ],
  },
]

const driverById = (id) => SUBAGENT_DRIVERS.find((d) => d.id === String(id || '')) || null

/** 按 Node 的解析顺序看这个包能不能找到（profile → profiles 根 → runtime）。 */
function resolvePackageDir(name) {
  const rel = name.split('/')
  for (const root of [profileWebModules(), profileRootModules(), runtimeModules()]) {
    const p = join(root, ...rel)
    if (existsSync(join(p, 'package.json'))) return p
  }
  return null
}

function driverInstalled(driver) {
  return driver.packages.every((p) => !!resolvePackageDir(p.installAs))
}

function driverReport() {
  return SUBAGENT_DRIVERS.map((d) => ({
    id: d.id,
    name: d.name,
    note: d.note,
    plugin: d.plugin,
    pluginPresent: !!resolvePackageDir(d.plugin),
    installed: driverInstalled(d),
    packages: d.packages.map((p) => ({
      name: p.installAs,
      version: p.version,
      approx: p.approx,
      present: !!resolvePackageDir(p.installAs),
    })),
    installDir: profileWebModules(),
  }))
}

/** 下载状态：一次只跑一个驱动（和宠物、安装包同样的取舍）。 */
const drvDl = { id: '', phase: 'idle', part: '', index: 0, totalParts: 0, received: 0, total: 0, speed: 0, error: '', updatedAt: 0 }
let drvAbort = null

function drvState() {
  const d = driverById(drvDl.id)
  return {
    id: drvDl.id,
    name: d ? d.name : '',
    phase: drvDl.phase,
    index: drvDl.index,
    totalParts: drvDl.totalParts,
    part: drvDl.part,
    received: drvDl.received,
    total: drvDl.total,
    speed: drvDl.speed,
    error: drvDl.error,
    updatedAt: drvDl.updatedAt,
  }
}

function drvReset(id) {
  drvDl.id = id || ''
  drvDl.phase = 'idle'
  drvDl.part = ''
  drvDl.index = 0
  drvDl.totalParts = 0
  drvDl.received = 0
  drvDl.total = 0
  drvDl.speed = 0
  drvDl.error = ''
  drvDl.updatedAt = Date.now()
}

const npmTarballUrl = (name, version) =>
  NPM_REGISTRY + '/' + name.replace('/', '%2f') + '/-/' + name.split('/').pop() + '-' + version + '.tgz'

function runToolCapture(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { try { p.kill() } catch (_) {} ; reject(new Error(cmd + ' 超时')) }, timeoutMs || 300000)
    p.stdout.on('data', (b) => { out += String(b) })
    p.stderr.on('data', (b) => { err += String(b) })
    p.on('error', (e) => { clearTimeout(timer); reject(e) })
    p.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ out, err })
      else reject(new Error(cmd + ' 退出码 ' + code + (err ? '：' + err.trim().slice(0, 300) : '')))
    })
  })
}

/**
 * 解 tgz。npm 包就是 tar.gz，Windows 10+ 自带 bsdtar —— 比起自己写一个 tar 解析器，
 * 用它更不容易出错（长路径、符号链接它都处理）。
 */
async function extractTarball(tgz, dest) {
  mkdirSync(dest, { recursive: true })
  const tarExe = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  const tool = existsSync(tarExe) ? tarExe : 'tar'
  await runToolCapture(tool, ['-xzf', tgz, '-C', dest], 300000)
  return join(dest, 'package')
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true })
  for (const e of readdirSync(from, { withFileTypes: true })) {
    const s = join(from, e.name)
    const d = join(to, e.name)
    if (e.isDirectory()) copyTree(s, d)
    else { try { renameSync(s, d) } catch (_) { writeFileSync(d, readFileSync(s)) } }
  }
}

async function drvDownloadOne(driver, pkg, tmpRoot) {
  const registryName = pkg.registry || pkg.installAs
  const url = npmTarballUrl(registryName, pkg.version)
  const tgz = join(tmpRoot, pkg.installAs.replace('/', '__') + '-' + pkg.version + '.tgz')
  drvAbort = new AbortController()
  const res = await fetch(url, { redirect: 'follow', signal: drvAbort.signal })
  if (!res.ok) throw new Error(pkg.installAs + ' 下载失败 HTTP ' + res.status)
  if (!res.body) throw new Error(pkg.installAs + ' 响应为空')
  drvDl.total = Number(res.headers.get('content-length')) || pkg.approx || 0
  const file = createWriteStream(tgz)
  let streamErr = null
  file.on('error', (e) => { streamErr = e })
  let received = 0
  const t0 = Date.now()
  for await (const chunk of Readable.fromWeb(res.body)) {
    if (streamErr) throw streamErr
    received += chunk.length
    drvDl.received = received
    drvDl.updatedAt = Date.now()
    const secs = (drvDl.updatedAt - t0) / 1000
    if (secs > 0.3) drvDl.speed = Math.round(received / secs)
    if (!file.write(chunk)) await once(file, 'drain')
  }
  await new Promise((resolve, reject) => file.end((err) => (err ? reject(err) : resolve())))
  if (streamErr) throw streamErr
  if (fileSize(tgz) < 1024) throw new Error(pkg.installAs + ' 下载文件异常')

  // 解到临时目录，再把 package/ 里的内容搬到 profile 的 node_modules 里，
  // 中途失败不会留下半个包（最后一步是 rename，原子）。
  const unpack = join(tmpRoot, 'x-' + pkg.installAs.replace('/', '__'))
  rmSync(unpack, { recursive: true, force: true })
  const inner = await extractTarball(tgz, unpack)
  const target = join(profileWebModules(), ...pkg.installAs.split('/'))
  rmSync(target, { recursive: true, force: true })
  mkdirSync(join(target, '..'), { recursive: true })
  copyTree(inner, target)
  rmSync(unpack, { recursive: true, force: true })
  rmSync(tgz, { force: true })
  return target
}

async function drvInstall(id) {
  const driver = driverById(id)
  if (!driver) throw new Error('不认识的驱动：' + id)
  const tmpRoot = join(petDownloadDir(), 'drivers')
  rmSync(tmpRoot, { recursive: true, force: true })
  mkdirSync(tmpRoot, { recursive: true })
  drvDl.index = 0
  drvDl.totalParts = driver.packages.length
  for (let i = 0; i < driver.packages.length; i++) {
    const pkg = driver.packages[i]
    drvDl.index = i + 1
    drvDl.part = pkg.installAs
    drvDl.received = 0
    drvDl.total = pkg.approx || 0
    drvDl.updatedAt = Date.now()
    await drvDownloadOne(driver, pkg, tmpRoot)
  }
  rmSync(tmpRoot, { recursive: true, force: true })
  drvDl.part = ''
  drvDl.phase = 'done'
  drvDl.speed = 0
  drvDl.updatedAt = Date.now()
  try { drvSyncProfile(driver) } catch (_) {}
}

function drvInstallStart(id) {
  const driver = driverById(id)
  if (!driver) throw new Error('不认识的驱动：' + id)
  if (drvDl.phase === 'downloading') throw new Error('正在装另一个驱动，先等它结束')
  drvReset(driver.id)
  drvDl.phase = 'downloading'
  drvDl.updatedAt = Date.now()
  drvInstall(driver.id).catch((e) => {
    if (e && e.name === 'AbortError') drvReset(driver.id)
    else {
      drvDl.phase = 'error'
      drvDl.error = e && e.message ? e.message : String(e)
      drvDl.speed = 0
      drvDl.updatedAt = Date.now()
    }
  }).finally(() => { drvAbort = null })
  return drvState()
}

function drvCancel() {
  if (drvDl.phase !== 'downloading') throw new Error('当前没有正在进行的下载')
  try { if (drvAbort) drvAbort.abort() } catch (_) {}
  const id = drvDl.id
  drvReset(id)
  return drvState()
}

function drvRemove(id) {
  const driver = driverById(id)
  if (!driver) throw new Error('不认识的驱动：' + id)
  if (drvDl.id === driver.id && drvDl.phase === 'downloading') drvCancel()
  const removed = []
  for (const pkg of driver.packages) {
    // 只删装在我们自己目录里的那份；runtime 里如果自带（老版本），那是内核的东西，不动。
    const p = join(profileWebModules(), ...pkg.installAs.split('/'))
    if (existsSync(p)) { rmSync(p, { recursive: true, force: true }); removed.push(pkg.installAs) }
  }
  try { drvSyncProfile(driver) } catch (_) {}
  return { id: driver.id, removed }
}

/**
 * 驱动装好/删掉之后，把 profile 的 bundle 行对齐：
 *   · 装了  -> 把插件包放进 profile 的 node_modules（真目录；和用户现在那份一样），
 *             并把 bundle 行加回去 —— provider 由这个插件注册，没有它就没人认识 codex/claude；
 *   · 删了  -> 把 bundle 行摘掉。**这一步是保命的**：行还在、依赖没了，
 *             Cordis 加载插件会失败，那种失败会把整个 profile 拖下水
 *             （0.8.0 那次 dsh-pet 就是这么把人挡在门外的）。
 */
function drvSyncProfile(driver) {
  const manifestPath = petsManifestPath()
  if (!existsSync(manifestPath)) return { synced: false, reason: 'no-profile' }
  let pkg = null
  try { pkg = JSON.parse(readFileSync(manifestPath, 'utf8')) } catch (_) { return { synced: false, reason: 'bad-manifest' } }
  pkg.dsh = pkg.dsh || {}
  pkg.dsh.profile = pkg.dsh.profile || {}
  const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : []
  const name = driver.plugin
  const want = driverInstalled(driver)
  const idx = bundles.indexOf(name)
  let changed = false

  if (want) {
    // 插件本体从 runtime 复制到 profile（runtime 里那份是内核自带的，不能被 pnpm 动）
    const src = join(runtimeModules(), ...name.split('/'))
    const dst = join(profileWebModules(), ...name.split('/'))
    if (existsSync(src) && !existsSync(dst)) {
      try { copyTree(src, dst) } catch (e) { return { synced: false, reason: 'copy-failed: ' + (e && e.message) } }
    }
    if (idx === -1) {
      bundles.push(name)
      pkg.dependencies = pkg.dependencies || {}
      pkg.dependencies[name] = 'file:' + dst.replace(/\\/g, '/')
      changed = true
    }
  } else if (idx !== -1) {
    bundles.splice(idx, 1)
    if (pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, name)) delete pkg.dependencies[name]
    changed = true
  }
  if (changed) {
    pkg.dsh.profile.bundles = bundles
    writeFileSync(manifestPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  }
  return { synced: true, bundle: want, changed }
}

// ---- agent 预设维护 ----
// 预设是**用户自己的文件**（`~/.dsh/.agent-presets/<id>/agent.cordis.yml`），
// 我们不替人做决定 —— 只做两件必然正确的事：
//   1) 内核改了名的行：0.1.6 把 workflow 的 worker-thread 实现换成了 workflow-ptc，
//      老预设里那行会「names a plugin that cannot be resolved」，整个预设加载失败；
//   2) 需要可选驱动的行（codex / claude）：驱动没装时 disable，装了再 enable，
//      否则预设会去挂一个不存在的 provider。
// 改之前一定先写一份 `.bak-<时间戳>`，并且只在真有变化时落盘。
const PRESET_ROW_RENAMES = [
  // 0.1.5 → 0.1.6：worker-thread 那套被 ptc 取代（官方模板里就是这么换的）
  { from: '@deepseek-ai/dsh-workflow-worker-thread', to: '@deepseek-ai/dsh-workflow-ptc', toId: 'workflow-ptc' },
]
const presetsDir = () => join(dshHome(), '.agent-presets')

function presetFiles() {
  const out = []
  let entries = []
  try { entries = readdirSync(presetsDir(), { withFileTypes: true }) } catch (_) { return out }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const file = join(presetsDir(), e.name, 'agent.cordis.yml')
    if (existsSync(file)) out.push({ id: e.name, file })
  }
  return out
}

/** 行块：从 `- id: xxx` 开始，到下一个同级或更外层的 `- ` 为止。缩进必须按列算。 */
function presetRows(text) {
  const lines = text.split('\n')
  const rows = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)-\s*id:\s*(\S+)\s*$/.exec(lines[i])
    if (!m) continue
    const indent = m[1].length
    let end = lines.length
    for (let j = i + 1; j < lines.length; j++) {
      const next = /^(\s*)-\s+/.exec(lines[j])
      if (next && next[1].length <= indent) { end = j; break }
      if (lines[j].trim() !== '' && !/^\s/.test(lines[j])) { end = j; break }
    }
    rows.push({ id: m[2], indent, start: i, end })
    // 注意**不要**跳到 end：预设是树状的，config 里还有嵌套行（那些才是真正要改的，
    // 比如 delegation 组里的 workflow-worker-thread）。跳过去就等于把它们漏掉。
  }
  return rows
}

function presetRowInfo(text, row) {
  const lines = text.split('\n')
  let name = ''
  let disabled = false
  let nameLine = -1
  let disabledLine = -1
  for (let i = row.start; i < row.end; i++) {
    const nm = /^(\s*)name:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(lines[i])
    if (nm && nameLine === -1) { name = nm[2]; nameLine = i; continue }
    const dm = /^(\s*)disabled:\s*(.+?)\s*$/.exec(lines[i])
    if (dm && disabledLine === -1) { disabled = /^true$/i.test(dm[2]); disabledLine = i }
  }
  return { ...row, name, disabled, nameLine, disabledLine }
}

function presetReport() {
  const drivers = driverReport()
  return presetFiles().map((p) => {
    let text = ''
    let error = ''
    try { text = readFileSync(p.file, 'utf8') } catch (e) { error = e && e.message ? e.message : String(e) }
    if (error) return { id: p.id, file: p.file, error, rows: [], issues: [] }
    const rows = presetRows(text).map((r) => {
      const info = presetRowInfo(text, r)
      const rename = PRESET_ROW_RENAMES.find((x) => x.from === info.name)
      const drv = SUBAGENT_DRIVERS.find((d) => d.row === info.id)
      const driver = drv ? drivers.find((x) => x.id === drv.id) : null
      const resolvable = rename ? false : !!resolvePackageDir(info.name)
      let action = ''
      if (rename) action = 'rename'
      else if (drv && !driver.installed && !info.disabled) action = 'disable'
      else if (drv && driver.installed && info.disabled) action = 'enable'
      return {
        id: info.id,
        name: info.name,
        disabled: info.disabled,
        resolvable,
        action,
        renameTo: rename ? rename.to : '',
        driver: drv ? drv.id : '',
      }
    })
    return {
      id: p.id,
      file: p.file,
      rows,
      issues: rows.filter((r) => r.action),
    }
  })
}

/**
 * 应用维护动作：**返回新的整份文本**，纯函数（单测就测它）。
 * 从后往前改，行号不会错位。
 */
function applyPresetFix(text) {
  const drivers = driverReport()
  const edits = []
  for (const row of presetRows(text)) {
    const info = presetRowInfo(text, row)
    const rename = PRESET_ROW_RENAMES.find((x) => x.from === info.name)
    const drv = SUBAGENT_DRIVERS.find((d) => d.row === info.id)
    const driver = drv ? drivers.find((x) => x.id === drv.id) : null
    if (rename && info.nameLine >= 0) {
      edits.push({ line: info.nameLine, kind: 'replace', text: "name: '" + rename.to + "'" })
      // 行 id 也一起改：只剩 id 叫 worker-thread 会让下一次体检又以为是坏的（也难读）。
      if (rename.toId) edits.push({ line: info.start, kind: 'replace', text: '- id: ' + rename.toId })
    }
    if (drv && driver) {
      const want = driver.installed
      if (info.disabledLine >= 0) {
        if (!want) edits.push({ line: info.disabledLine, kind: 'replace', text: 'disabled: true' })
        else if (/^\s*disabled:\s*true\s*$/i.test(text.split('\n')[info.disabledLine])) {
          edits.push({ line: info.disabledLine, kind: 'replace', text: 'disabled: false' })
        }
      } else if (!want && info.nameLine >= 0) {
        edits.push({ line: info.nameLine + 1, kind: 'insert', text: 'disabled: true' })
      }
    }
  }
  if (!edits.length) return { text, changed: false }

  const lines = text.split('\n')
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  edits.sort((a, b) => b.line - a.line)
  for (const e of edits) {
    if (e.kind === 'replace') {
      const indent = /^(\s*)/.exec(lines[e.line])[1]
      lines[e.line] = indent + e.text
    } else {
      const indent = /^(\s*)/.exec(lines[e.line - 1])[1]
      lines.splice(e.line, 0, indent + e.text)
    }
  }
  return { text: lines.join(nl), changed: true }
}

function presetFix(id) {
  const want = String(id || '').trim()
  const targets = want ? presetFiles().filter((p) => p.id === want) : presetFiles()
  if (!targets.length) throw new Error('没找到这个预设：' + (want || '(任意)'))
  const done = []
  for (const p of targets) {
    const before = readFileSync(p.file, 'utf8')
    const res = applyPresetFix(before)
    if (!res.changed) { done.push({ id: p.id, changed: false }); continue }
    // 备份先写、再落盘：改坏了还能自己换回来。
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = p.file + '.bak-' + stamp
    writeFileSync(backup, before, 'utf8')
    writeFileSync(p.file, res.text, 'utf8')
    done.push({ id: p.id, changed: true, backup })
  }
  return { fixed: done, presets: presetReport() }
}

/** 资源里的图片资产（立绘或图集）。没有二进制接口就会变成 base64，太占带宽。 */
function petAsset(id, kind) {
  const res = petResourceById(id)
  if (!res) return null
  let name = kind === 'sprite' ? (res.hasSprite ? res.sprite : res.portrait) : res.portrait
  // clips 格式：按 clip 名 + 帧序号取具体那一帧
  if (kind && kind.indexOf('clip:') === 0 && res.clips) {
    const rest = kind.slice(5)
    const cut = rest.lastIndexOf(':')
    const clipName = cut > 0 ? rest.slice(0, cut) : rest
    const frameIdx = cut > 0 ? Number(rest.slice(cut + 1)) || 0 : 0
    const clip = res.clips[clipName]
    const frames = clip && Array.isArray(clip.frames) ? clip.frames : null
    if (!frames || !frames.length) return null
    name = join(res.framesDir, frames[Math.max(0, Math.min(frames.length - 1, frameIdx))])
  }
  const file = join(res.dir, name)
  const ext = name.split('.').pop().toLowerCase()
  const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png'
  try {
    return { data: readFileSync(file), type }
  } catch (_) {
    return null
  }
}

function petState(ctx) {
  let options = pet.options || petReadOptions()
  pet.options = options
  // 开了宠物却没选外观：自动挑第一个可用资源，别让用户对着空气发呆
  if (options.enabled && !options.resourceId) {
    const first = petResources()[0]
    if (first) options = petWriteOptions({ resourceId: first.id })
  }
  if (options.enabled) petSync(ctx)
  return {
    enabled: !!options.enabled,
    options,
    instances: options.enabled ? pet.instances : [],
    resourceId: options.resourceId || '',
    lastTickAt: pet.lastTickAt,
    error: pet.error || '',
    agentsSeen: pet.agentsSeen || 0,
    resourcesDir: petUserDir(),
    resources: petResources(),
  }
}

function petAction(ctx, action) {
  const verb = String(action || '')
  if (verb === 'status') return { ok: true, text: JSON.stringify(petState(ctx), null, 2) }
  if (verb === 'feed') return { ok: true, text: '已投喂（状态交给宿主，不靠动画）' }
  if (verb === 'mute') {
    const next = petWriteOptions({ notify: { period: false, usage: false, longRun: false } })
    return { ok: true, text: '已静音：' + JSON.stringify(next.notify) }
  }
  if (verb === 'on' || verb === 'off') {
    petWriteOptions({ enabled: verb === 'on' })
    petEnsureTimer(ctx)
    return { ok: true, text: verb === 'on' ? '宠物已开启' : '宠物已关闭' }
  }
  throw new Error('不认识的宠物动作：' + verb)
}

function readWorkspaceData() {
  try {
    return JSON.parse(readFileSync(join(dshHome(), 'storages', 'workspace.json'), 'utf8'))
  } catch (_) {
    return null
  }
}

function workspaceList(data) {
  if (!data) return []
  const globalTable = data.global || {}
  const tables = (data.tables && data.tables.workspaces) || {}
  return (globalTable.workspaceIds || []).map((id) => {
    const w = tables[id]
    if (!w) return null
    return { id, path: w.path, title: w.title || w.path, sessionCount: (w.sessionIds || []).length }
  }).filter(Boolean)
}

function workspaceCurrent(data) {
  if (!data) return null
  const globalTable = data.global || {}
  const tables = (data.tables && data.tables.workspaces) || {}
  const id = globalTable.currentWorkspaceId || (globalTable.workspaceIds || [])[0]
  const w = id && tables[id]
  return w ? { id, path: w.path, title: w.title || w.path } : null
}

function forgetWorkspace(id) {
  if (!id || !/^[A-Za-z0-9-]+$/.test(id)) throw new Error('工作区 id 无效')
  const file = join(dshHome(), 'storages', 'workspace.json')
  const data = readWorkspaceData()
  if (!data) throw new Error('工作区文件不可读')
  const list = data.global.workspaceIds || []
  data.global.workspaceIds = list.filter(x => x !== id)
  if (data.tables && data.tables.workspaces && data.tables.workspaces[id]) {
    delete data.tables.workspaces[id]
  }
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  return { ok: true }
}

function openInExplorer(targetPath) {
  if (!targetPath || typeof targetPath !== 'string' || targetPath.length > 512) throw new Error('路径无效')
  spawn('explorer.exe', [targetPath], { stdio: 'ignore' }).unref()
  return { ok: true }
}

// ---- Usage 富卡片数据（供客户端 commandview 渲染）----
async function usageCardPayload(ctx) {
  const token = readToken()
  const scope = readScope()
  const [period, balance, usage, progress] = await Promise.all([
    Promise.resolve(periodPayload()),
    fetchBalance(ctx).catch(() => ({ ok: false, error: 'balance-failed', message: '余额查询失败' })),
    (async () => {
      if (!token) return null
      try {
        return await usageReport(token, scope)
      } catch (e) {
        return { error: e && e.message ? e.message : String(e) }
      }
    })(),
    Promise.resolve(periodProgress()),
  ])
  return { period, balance, usage, progress, hasToken: !!token, scope }
}

// 范围下拉的选项：真实存在的 API Key 名与模型 id。10 分钟内复用一次抓取结果。
let scopeOptionsCache = { at: 0, data: null }

async function scopePayload() {
  const scope = readScope()
  if (scopeOptionsCache.data && Date.now() - scopeOptionsCache.at < 10 * 60 * 1000) {
    return { scope, options: scopeOptionsCache.data }
  }
  const token = readToken()
  if (!token) return { scope, options: { keys: [], models: [] }, error: '未配置平台令牌' }
  try {
    const now = new Date()
    const tzSec = -now.getTimezoneOffset() * 60
    const endSec = localMidnightSec(fmtDate(now)) + 86400
    const start30 = localMidnightSec(fmtDate(new Date(now.getTime() - 29 * 86400000)))
    const u = await platformUsage(token, start30, endSec, tzSec, SCOPE_ALL)
    const data = { keys: u.keys, models: u.allModels }
    scopeOptionsCache = { at: Date.now(), data }
    return { scope, options: data }
  } catch (e) {
    return { scope, options: { keys: [], models: [] }, error: e && e.message ? e.message : String(e) }
  }
}

// ---- 峰谷时段（北京时间，UTC+8，无夏令时）----
// 规则：周一至周五 09:00–12:00 与 14:00–18:00 为高峰时段；
//       其余时段（含周末全天、午间 12:00–14:00、早晚）均为低谷时段。
// 「梁文峰/梁文谷」= DeepSeek 峰/谷定价时段的戏称（创始人梁文峰）。

const BJ_OFFSET_MS = 8 * 3600 * 1000

function beijingWall(ms) {
  const d = new Date(ms + BJ_OFFSET_MS)
  return { day: d.getUTCDay(), hours: d.getUTCHours(), minutes: d.getUTCMinutes() }
}

function periodAt(ms) {
  const w = beijingWall(ms)
  if (w.day === 0 || w.day === 6) return 'valley' // 周末全天低谷
  const t = w.hours + w.minutes / 60
  const isPeak = (t >= 9 && t < 12) || (t >= 14 && t < 18)
  return isPeak ? 'peak' : 'valley'
}

const PERIOD_VIEW = {
  peak: { name: '梁文峰', kind: '峰', note: '高峰时段：周一至周五 09:00–12:00 与 14:00–18:00' },
  valley: { name: '梁文谷', kind: '谷', note: '低谷时段：其余时间（含周末全天、午间 12:00–14:00、早晚）' },
}

function periodView(period) {
  return PERIOD_VIEW[period] || PERIOD_VIEW.valley
}

// 距下一次切换：1 分钟步进向前扫（周末谷最长 48 小时，扫 3 天绰绰有余）。
function nextSwitch(now) {
  const current = periodAt(now)
  const step = 60 * 1000
  for (let i = 1; i <= 3 * 24 * 60; i++) {
    const at = now + i * step
    const p = periodAt(at)
    if (p !== current) return { at, period: p }
  }
  return null
}

function periodPayload(now = Date.now()) {
  const period = periodAt(now)
  const w = beijingWall(now)
  const sw = nextSwitch(now)
  return {
    period,
    name: periodView(period).name,
    kind: periodView(period).kind,
    note: periodView(period).note,
    weekend: w.day === 0 || w.day === 6,
    now,
    nextSwitchMs: sw ? sw.at : null,
    nextPeriod: sw ? sw.period : null,
    nextName: sw ? periodView(sw.period).name : null,
    nextKind: sw ? periodView(sw.period).kind : null,
  }
}

// ---- 余额 ----
async function getApiKey(ctx) {
  try {
    const credentials = ctx.get('credentials')
    if (!credentials || typeof credentials.resolve !== 'function') return null
    const hit = await credentials.resolve('DEEPSEEK_API_KEY')
    return hit && hit.value ? String(hit.value).trim() : null
  } catch (_) { return null }
}

async function fetchBalance(ctx) {
  const key = await getApiKey(ctx)
  if (!key) return { ok: false, error: 'no-key', message: '未找到 DeepSeek API Key' }
  try {
    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: { authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data && data.error && data.error.message ? data.error.message : 'HTTP ' + res.status
      return { ok: false, error: 'http-' + res.status, message: msg }
    }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: 'fetch-failed', message: String((err && err.message) || err) }
  }
}

function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  const n = parseFloat(String(v))
  return Number.isFinite(n) ? n : NaN
}

function fmtMoney(n) {
  const x = toNum(n)
  if (!Number.isFinite(x)) return '–'
  return x.toFixed(2)
}

function balanceLines(data) {
  const infos = (data && data.balance_infos) || []
  if (!infos.length) return ['账户暂无余额信息']
  const lines = []
  for (const b of infos) {
    const currency = b.currency || 'CNY'
    lines.push(currency + ' 总余额: ' + fmtMoney(b.total_balance))
    const granted = toNum(b.granted_balance)
    const topped = toNum(b.topped_up_balance)
    if (Number.isFinite(granted)) lines.push('  赠金: ' + fmtMoney(granted))
    if (Number.isFinite(topped)) lines.push('  充值: ' + fmtMoney(topped))
  }
  return lines
}

function switchLines(p) {
  if (!p.nextSwitchMs) return []
  const mins = Math.max(0, Math.round((p.nextSwitchMs - p.now) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const when = h > 0 ? h + ' 小时 ' + m + ' 分钟' : m + ' 分钟'
  return ['距下次切换（转' + p.nextName + '·' + p.nextKind + '）约 ' + when]
}

// ---- 平台用量（DeepSeek 开放 API 不提供，只在 platform 登录态）----
const TOKEN_FILE = () => join(process.env.DSH_HOME || join(process.env.USERPROFILE || homedir(), '.dsh'), 'ds-zhuzhu-use-token')

function readToken() {
  try { const t = readFileSync(TOKEN_FILE(), 'utf8').trim(); return t || null } catch { return null }
}
function writeToken(token) {
  try { writeFileSync(TOKEN_FILE(), token, 'utf8'); return true } catch (e) { return false }
}
function clearToken() {
  try { rmSync(TOKEN_FILE(), { force: true }); return true } catch (e) { return false }
}

// usage 的显示范围（按 API Key / 按模型过滤）。存本地，卡片和 /usage 共用一份。
const SCOPE_FILE = () => join(process.env.DSH_HOME || join(process.env.USERPROFILE || homedir(), '.dsh'), 'ds-zhuzhu-use-scope.json')
const SCOPE_ALL = { key: 'all', model: 'all' }

function readScope() {
  try {
    const raw = JSON.parse(readFileSync(SCOPE_FILE(), 'utf8'))
    return { key: String(raw.key || 'all'), model: String(raw.model || 'all') }
  } catch (_) {
    return { ...SCOPE_ALL }
  }
}

function writeScope(scope) {
  const next = {
    key: String((scope && scope.key) || 'all'),
    model: String((scope && scope.model) || 'all'),
  }
  try { writeFileSync(SCOPE_FILE(), JSON.stringify(next, null, 2), 'utf8') } catch (_) {}
  return next
}

const PLATFORM_BASE = 'https://platform.deepseek.com/api/v0/usage'
const PLATFORM_HEADERS = [
  'Referer: https://platform.deepseek.com/usage',
  'Origin: https://platform.deepseek.com',
]
const NO_TOKEN_MSG =
  '平台用量（每个模型当日消费）需要网页控制台会话令牌。首次使用：登录 https://platform.deepseek.com/usage → 按 F12 → 控制台执行 JSON.parse(localStorage.getItem("userToken")).value 并复制结果 → 在 input 上方「设为平台令牌」入口粘贴保存（存本地，重启自动读取）。余额不受影响。'

function fmtDate(d) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}
function localMidnightSec(dateStr) {
  const p = String(dateStr).split('-'); const y = parseInt(p[0], 10); const m = parseInt(p[1], 10); const d = parseInt(p[2], 10)
  if (!y || !m || !d) return 0
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000)
}
function bucketTime(t, tzSec, bucket) {
  const isHourly = bucket === '1h' || bucket === 'hour' || bucket === 'hourly'
  if (typeof t === 'number') {
    const dt = new Date((t + tzSec) * 1000); const y = dt.getUTCFullYear(); const mo = String(dt.getUTCMonth() + 1).padStart(2, '0'); const day = String(dt.getUTCDate()).padStart(2, '0')
    return isHourly ? y + '-' + mo + '-' + day + ' ' + String(dt.getUTCHours()).padStart(2, '0') + ':00' : y + '-' + mo + '-' + day
  }
  return String(t)
}
const num = (v) => { if (v === null || v === undefined) return 0; if (typeof v === 'number') return v; const n = parseFloat(String(v)); return Number.isFinite(n) ? n : 0 }

async function platformFetch(url, token, extraHeaders) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(extraHeaders || {}),
      },
      signal: ctrl.signal,
    })
    if (res.status === 401) throw new Error('平台令牌无效或已过期，请重新获取')
    if (res.status === 429) throw new Error('请求过于频繁，请稍后再试')
    if (!res.ok) throw new Error('用量接口 HTTP ' + res.status)
    const data = await res.json()
    // platform deepseek 用 HTTP 200 + code != 0 报业务错误（40003 = 无效令牌）
    if (data && typeof data.code === 'number' && data.code !== 0) {
      if (data.code === 40003) throw new Error('平台令牌无效或已过期，请重新获取')
      throw new Error('平台用量接口错误: ' + (data.msg || ('code ' + data.code)))
    }
    return data
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('请求超时')
    throw e
  } finally { clearTimeout(t) }
}

// 抓平台用量（start/end 为秒）。series 的真实维度是 (api_key × model)，过去只按
// model 聚合把 api key 那层丢了；现在两个维度都聚，并支持 scope 过滤。
async function platformUsage(token, startSec, endSec, tzSec, scope) {
  const q = 'start=' + startSec + '&end=' + endSec + '&tz=' + tzSec
  const amountR = await platformFetch(PLATFORM_BASE + '/by_api_key/amount?' + q, token, PLATFORM_HEADERS)
  const costR = await platformFetch(PLATFORM_BASE + '/by_api_key/cost?' + q, token, PLATFORM_HEADERS)
  const bizAmount = amountR && amountR.data ? amountR.data.biz_data : null
  const bizCost = costR && costR.data ? costR.data.biz_data : null
  if (!bizAmount) throw new Error('amount 响应结构异常')
  const bucket = String(bizAmount.bucket || '')

  const wantKey = scope && scope.key && scope.key !== 'all' ? String(scope.key) : null
  const wantModel = scope && scope.model && scope.model !== 'all' ? String(scope.model) : null
  const keyNameOf = (apiKey) => {
    const k = apiKey && typeof apiKey === 'object' ? apiKey : {}
    return String(k.name || '（未命名 Key）')
  }
  const keyMaskOf = (apiKey) => {
    const k = apiKey && typeof apiKey === 'object' ? apiKey : {}
    return String(k.sensitive_id || '')
  }
  const accept = (name, model) => (!wantKey || name === wantKey) && (!wantModel || model === wantModel)

  const allKeys = new Map()
  const allModels = new Set()
  const perModel = new Map()
  const perKey = new Map()
  const perCombo = new Map()

  const recOf = (model) => {
    let rec = perModel.get(model)
    if (!rec) {
      rec = { model, cost: 0, tokens: 0, cacheHit: 0, cacheMiss: 0, output: 0, requests: 0, byDay: new Map() }
      perModel.set(model, rec)
    }
    return rec
  }
  const keyRecOf = (name, masked) => {
    let rec = perKey.get(name)
    if (!rec) {
      rec = { key: name, masked, cost: 0, tokens: 0, cacheHit: 0, cacheMiss: 0, output: 0, requests: 0, models: new Set() }
      perKey.set(name, rec)
    }
    if (masked) rec.masked = masked
    return rec
  }
  const comboRecOf = (name, model) => {
    const id = name + '\u0000' + model
    let rec = perCombo.get(id)
    if (!rec) {
      rec = { key: name, model, cost: 0, tokens: 0, cacheHit: 0, cacheMiss: 0, output: 0, requests: 0 }
      perCombo.set(id, rec)
    }
    return rec
  }
  const dayOf = (rec, keyT) => {
    let d = rec.byDay.get(keyT)
    if (!d) {
      d = { time: keyT, cost: 0, tokens: 0, cacheHit: 0, cacheMiss: 0, output: 0, requests: 0 }
      rec.byDay.set(keyT, d)
    }
    return d
  }

  for (const s of (Array.isArray(bizAmount.series) ? bizAmount.series : [])) {
    const name = keyNameOf(s.api_key)
    const masked = keyMaskOf(s.api_key)
    const model = String(s.model || '未知模型')
    allKeys.set(name, masked)
    allModels.add(model)
    if (!accept(name, model)) continue
    const rec = recOf(model)
    const krec = keyRecOf(name, masked)
    const crec = comboRecOf(name, model)
    krec.models.add(model)
    for (const b of (Array.isArray(s.buckets) ? s.buckets : [])) {
      const keyT = bucketTime(b.time, tzSec, bucket)
      const u = b.usage || {}
      const hit = num(u.PROMPT_CACHE_HIT_TOKEN)
      const miss = num(u.PROMPT_CACHE_MISS_TOKEN)
      const out = num(u.RESPONSE_TOKEN)
      const req = num(u.REQUEST)
      const toks = hit + miss + out + req
      rec.cacheHit += hit; rec.cacheMiss += miss; rec.output += out; rec.requests += req; rec.tokens += toks
      krec.cacheHit += hit; krec.cacheMiss += miss; krec.output += out; krec.requests += req; krec.tokens += toks
      crec.cacheHit += hit; crec.cacheMiss += miss; crec.output += out; crec.requests += req; crec.tokens += toks
      const d = dayOf(rec, keyT)
      d.cacheHit += hit; d.cacheMiss += miss; d.output += out; d.requests += req; d.tokens += toks
    }
  }

  let currency = ''
  if (bizCost && Array.isArray(bizCost.data)) {
    for (const c of bizCost.data) {
      if (!currency && c.currency) currency = String(c.currency)
      for (const s of (Array.isArray(c.series) ? c.series : [])) {
        const name = keyNameOf(s.api_key)
        const masked = keyMaskOf(s.api_key)
        const model = String(s.model || '未知模型')
        allKeys.set(name, masked)
        allModels.add(model)
        if (!accept(name, model)) continue
        const rec = recOf(model)
        const krec = keyRecOf(name, masked)
        const crec = comboRecOf(name, model)
        krec.models.add(model)
        for (const b of (Array.isArray(s.buckets) ? s.buckets : [])) {
          const keyT = bucketTime(b.time, tzSec, bucket)
          const v = num(b.cost)
          rec.cost += v; krec.cost += v; crec.cost += v
          const d = dayOf(rec, keyT)
          d.cost += v
        }
      }
    }
  }

  const items = []
  const itemsMap = new Map()
  let totalCost = 0, totalIn = 0, totalOut = 0, totalHit = 0, totalMiss = 0
  const modelDetail = []
  for (const rec of perModel.values()) {
    totalCost += rec.cost
    totalIn += rec.cacheHit + rec.cacheMiss + rec.requests
    totalOut += rec.output
    totalHit += rec.cacheHit
    totalMiss += rec.cacheMiss
    if (rec.cost > 0.0001 || rec.tokens > 0) {
      modelDetail.push({
        model: rec.model,
        cost: rec.cost,
        tokens: rec.tokens,
        cacheHit: rec.cacheHit,
        cacheMiss: rec.cacheMiss,
        outputTokens: rec.output,
        requests: rec.requests,
      })
    }
    for (const d of rec.byDay.values()) {
      let it = itemsMap.get(d.time)
      if (!it) {
        it = { time: d.time, cost: 0, tokens: 0, cacheHit: 0, cacheMiss: 0, output: 0, requests: 0 }
        itemsMap.set(d.time, it)
      }
      it.cost += d.cost; it.tokens += d.tokens; it.cacheHit += d.cacheHit
      it.cacheMiss += d.cacheMiss; it.output += d.output; it.requests += d.requests
    }
  }
  for (const t of itemsMap.keys()) items.push(itemsMap.get(t))
  items.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
  modelDetail.sort((a, b) => b.cost - a.cost)
  const cacheHitRate = (totalHit + totalMiss) > 0 ? totalHit / (totalHit + totalMiss) : null

  const keyDetail = [...perKey.values()]
    .filter((x) => x.cost > 0.0001 || x.tokens > 0)
    .map((x) => ({ key: x.key, masked: x.masked, cost: x.cost, tokens: x.tokens, requests: x.requests, models: [...x.models] }))
    .sort((a, b) => b.cost - a.cost)
  const comboDetail = [...perCombo.values()]
    .filter((x) => x.cost > 0.0001 || x.tokens > 0)
    .sort((a, b) => b.cost - a.cost)
  const keys = [...allKeys.entries()].map(([name, masked]) => ({ name, masked })).sort((a, b) => (a.name < b.name ? -1 : 1))

  return {
    bucket, currency, items, modelDetail, keyDetail, comboDetail, keys,
    allModels: [...allModels].sort(),
    totalCost, totalIn, totalOut, totalHit, totalMiss, cacheHitRate,
    models: modelDetail.map((x) => x.model),
  }
}

// 聚合近 7/30 天趋势 + 当日总额 + 按模型/按 API Key 明细 + 缓存命中率。
// scope = { key: 'all' | <api key 名>, model: 'all' | <模型 id> }
async function usageReport(token, scope) {
  const now = new Date()
  const tzSec = -now.getTimezoneOffset() * 60
  const endSec = localMidnightSec(fmtDate(now)) + 86400
  const start30 = localMidnightSec(fmtDate(new Date(now.getTime() - 29 * 86400000)))
  const usage = await platformUsage(token, start30, endSec, tzSec, scope)
  const today = fmtDate(now)
  const dayCost = {}
  const dayToken = {}
  for (const it of usage.items) {
    const d = it.time.length === 10 ? it.time : it.time.slice(0, 10)
    if (d.length !== 10) continue
    dayCost[d] = (dayCost[d] || 0) + it.cost
    dayToken[d] = (dayToken[d] || 0) + it.tokens
  }
  const trend7 = Object.keys(dayCost).sort().slice(-7).map((d) => ({ date: d, cost: dayCost[d], tokens: dayToken[d] || 0 }))
  const trend30 = Object.keys(dayCost).sort().map((d) => ({ date: d, cost: dayCost[d], tokens: dayToken[d] || 0 }))
  const todayRec = dayCost[today] != null ? { cost: dayCost[today], tokens: dayToken[today] || 0 } : { cost: 0, tokens: 0 }
  return {
    currency: usage.currency,
    today: todayRec,
    trend7,
    trend30,
    total7: trend7.reduce((s, d) => s + d.cost, 0),
    total30: trend30.reduce((s, d) => s + d.cost, 0),
    modelDetail: usage.modelDetail,
    keyDetail: usage.keyDetail,
    comboDetail: usage.comboDetail,
    keys: usage.keys,
    allModels: usage.allModels,
    cacheHitRate: usage.cacheHitRate,
    models: usage.models,
    scope: {
      key: (scope && scope.key) || 'all',
      model: (scope && scope.model) || 'all',
    },
  }
}


// 当前时段起点/终点/进度（供转换进度条）
function periodProgress(now = Date.now()) {
  const current = periodAt(now)
  const sw = nextSwitch(now)
  if (!sw) return { current, next: null, percent: 100, nextAt: null }
  const step = 60 * 1000
  let start = now
  let guard = 0
  while (periodAt(start) === current && guard < 3 * 24 * 60) {
    start -= step
    guard++
  }
  start += step
  const total = Math.max(1, sw.at - start)
  const elapsed = Math.max(0, Math.min(total, now - start))
  return { current, next: sw.period, percent: Math.round((elapsed / total) * 100), nextAt: sw.at }
}

// ---- HTTP 路由（裸 Node ServerResponse，与 codex-pet 同款）----
/** 统一 JSON 响应：content-length 由 Response 自己算。 */
function jsonResponse(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

// GET JSON 路由：run() 返回 { ok, ... }，抛错走 500。
// 非 GET 由 carrier 处理（未声明的方法不归这条路由，落到后续 dispatch）。
function jsonRoute(path, run) {
  return {
    path,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => {
      try {
        return jsonResponse(200, await run())
      } catch (error) {
        return jsonResponse(500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  }
}

// POST JSON body 路由：body = { action, ... }，handler 返回 { ok, ... } 或抛错。
function postRoute(path, handler, maxBytes) {
  const bodyLimit = maxBytes || 1024 * 1024
  return {
    path,
    methods: ['POST'],
    // buffered：carrier 按 connection 自己的上限(默认 300MiB)先收满 body，
    // 再交给我们 JSON.parse —— office-pdf 那种 64MiB 上传因此不受影响。
    requestBody: 'buffered',
    fetch: async (request) => {
      let body = {}
      try {
        const text = await request.text()
        if (Buffer.byteLength(text) > bodyLimit) throw new Error('request body too large')
        if (text) body = JSON.parse(text)
      } catch (e) { return jsonResponse(400, { ok: false, error: 'bad body: ' + e.message }) }
      try {
        return jsonResponse(200, await handler(body))
      } catch (e) { return jsonResponse(500, { ok: false, error: e instanceof Error ? e.message : String(e) }) }
    },
  }
}

/**
 * 注册命令，但绝不因为重名把启动搞挂。
 * 内核在重名时会抛错，而这个抛错发生在插件 apply 期间 —— 直接导致整个 profile
 * 起不来（朋友的 dsh-pet 就撞了 chat 这个名字）。命令是锦上添花，不值得搭上启动。
 */
function safeRegisterCommand(ctx, definition) {
  try {
    return ctx.commands.register(definition)
  } catch (e) {
    const why = e && e.message ? e.message : String(e)
    console.error('[ds_zhuzhu_use] 命令 "' + definition.name + '" 注册失败，已跳过：' + why)
    return null
  }
}
// ---- 命令 ----
async function usageText(ctx) {
  const p = periodPayload()
  const lines = []
  lines.push('【当前时段】' + p.name + '（' + p.kind + '时段）')
  lines.push(p.note)
  lines.push(...switchLines(p))
  lines.push('')
  lines.push('【DeepSeek 余额】')
  const bal = await fetchBalance(ctx)
  if (bal.ok) lines.push(...balanceLines(bal.data))
  else lines.push('查询失败：' + (bal.message || bal.error))
  lines.push('')
  lines.push('【今日用量】')
  const token = readToken()
  if (!token) {
    lines.push('未配置平台用量令牌，无法显示每个模型当日消费。')
    lines.push(NO_TOKEN_MSG)
    lines.push('（余额查询不受影响。）')
  } else {
    try {
      const scope = readScope()
      const u = await usageReport(token, scope)
      const scopeLabel = []
      if (scope.key !== 'all') scopeLabel.push('API Key ' + scope.key)
      if (scope.model !== 'all') scopeLabel.push('模型 ' + scope.model)
      if (scopeLabel.length) lines.push('（范围：' + scopeLabel.join(' · ') + '）')
      lines.push('今日消费：' + (u.currency || 'CNY') + ' ' + u.today.cost.toFixed(2) + '，token ' + u.today.tokens.toLocaleString())
      lines.push('近 7 天：' + (u.currency || 'CNY') + ' ' + u.total7.toFixed(2) + '；近 30 天：' + (u.currency || 'CNY') + ' ' + u.total30.toFixed(2))
      if (u.models && u.models.length) lines.push('涉及模型：' + u.models.join('、'))
      if (u.keyDetail && u.keyDetail.length > 1) {
        lines.push('按 API Key：')
        for (const k of u.keyDetail) lines.push('  ' + k.key + ': ' + (u.currency || 'CNY') + ' ' + k.cost.toFixed(2) + '（' + k.tokens.toLocaleString() + ' tokens）')
      }
      if (u.trend7.length) {
        lines.push('近 7 天逐日：')
        for (const d of u.trend7) lines.push('  ' + d.date + ': ' + (u.currency || 'CNY') + ' ' + d.cost.toFixed(2))
      }
    } catch (e) {
      lines.push('用量查询失败：' + (e && e.message ? e.message : String(e)))
      lines.push('（可重新粘贴平台令牌，或稍后再试。）')
    }
  }
  return lines.join('\n')
}

function explainText() {
  const p = periodPayload()
  const lines = []
  lines.push('【峰谷计价时段（北京时间）】')
  lines.push('· 周一至周五 09:00–12:00、14:00–18:00 为高峰时段（梁文峰）；')
  lines.push('· 其余时段（周末全天、午间 12:00–14:00、早晚）为低谷时段（梁文谷）。')
  lines.push('')
  lines.push('当前：' + p.name + '（' + p.kind + '时段）')
  lines.push(...switchLines(p))
  lines.push('')
  lines.push('输入 /usage 可查询账户余额与当前时段。')
  return lines.join('\n')
}

export function apply(ctx, config = {}) {
  ctx.effect(() => {
    petEnsureTimer(ctx)
    const disposers = [
      ctx.connection.fetch.register(jsonRoute('/api/ds-zhuzhu-use/period', () => periodPayload())),
      ctx.connection.fetch.register(jsonRoute('/api/ds-zhuzhu-use/balance', () => fetchBalance(ctx))),
      ctx.connection.fetch.register(jsonRoute('/api/ds-zhuzhu-use/usage', () => {
        const token = readToken()
        if (!token) return { ok: false, error: 'no-token', message: NO_TOKEN_MSG }
        return usageReport(token, readScope()).then((data) => ({ ok: true, data }))
      })),
      ctx.connection.fetch.register({
        path: '/api/ds-zhuzhu-use/pets/asset',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (request) => {
          try {
            const q = new URL(request.url)
            const kind = q.searchParams.get('kind')
            const id = q.searchParams.get('id')
            const asset = petAsset(id, kind)
            if (!asset) return new Response(null, { status: 404 })
            // 缓存策略：
            //   以前是 no-store —— 每播一帧都要重新请求 + 重新解码，帧率高时肉眼可见地卡。
            //   后来改成 max-age=60，但 URL 里没有版本号，换图之后浏览器仍然攥着旧解码结果
            //   （新帧明明已经发过去了，屏幕上还是上一版）。
            //   现在客户端会在 URL 上带 &v=<资源内容版本号>，内容一变 URL 就变，
            //   所以可以放心 immutable 长缓存 —— 既彻底解决卡顿，也彻底解决「看到旧图」。
            const res_ = petResourceById(id)
            const want = q.searchParams.get('v')
            const cur = res_ ? res_.rev : ''
            const versioned = !!want && !!cur && want === cur
            return new Response(asset.data, {
              status: 200,
              headers: {
                'content-type': asset.type,
                'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'no-store',
              },
            })
          } catch (_) { return new Response(null, { status: 500 }) }
        },
      }),      ctx.connection.fetch.register(jsonRoute('/api/ds-zhuzhu-use/pets/state', () => ({ ok: true, data: petState(ctx) }))),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/pets/options', (body) => {
        const saved = petWriteOptions(body && body.options ? body.options : body)
        petEnsureTimer(ctx)
        return { ok: true, data: { options: saved, state: petState(ctx) } }
      })),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/pets/action', (body) => {
        const r = petAction(ctx, body && body.action)
        return { ok: true, data: { result: r, state: petState(ctx) } }
      })),      ctx.connection.fetch.register(jsonRoute('/api/ds-zhuzhu-use/pets', () => ({ ok: true, data: petsReport() }))),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/pets/set', (body) =>
        ({ ok: true, data: setPetEnabled(String((body && body.name) || ''), !!(body && body.enabled)) }))),
      // 宠物资源：清单 / 下载 / 进度 / 删除（安装包里不带宠物，按需拉）
      ctx.connection.fetch.register({
        path: '/api/ds-zhuzhu-use/pets/registry',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const q = new URL(request.url)
          try {
            const data = await petRegistryPayload(q.searchParams.get('refresh') === '1')
            return jsonResponse(200, { ok: true, data })
          } catch (error) {
            return jsonResponse(500, { ok: false, error: error && error.message ? error.message : String(error) })
          }
        },
      }),
      ctx.connection.fetch.register(jsonRoute('/api/ds-zhuzhu-use/pets/install-state', () => ({ ok: true, data: petDownloadState() }))),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/pets/install', (body) =>
        ({ ok: true, data: petInstallStart(String((body && body.id) || '')) }))),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/pets/install/cancel', () =>
        ({ ok: true, data: petInstallCancel() }))),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/pets/uninstall', (body) =>
        ({ ok: true, data: petUninstall(String((body && body.id) || '')) }))),
      // 子代理可选驱动 + agent 预设维护（设置里“agent 预设”旁边那一块）
      ctx.connection.fetch.register(jsonRoute('/api/ds-zhuzhu-use/drivers', () => ({
        ok: true,
        data: { items: driverReport(), state: drvState() },
      }))),
      ctx.connection.fetch.register(jsonRoute('/api/ds-zhuzhu-use/drivers/state', () => ({ ok: true, data: drvState() }))),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/drivers/install', (body) =>
        ({ ok: true, data: drvInstallStart(String((body && body.id) || '')) }))),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/drivers/cancel', () => ({ ok: true, data: drvCancel() }))),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/drivers/remove', (body) =>
        ({ ok: true, data: drvRemove(String((body && body.id) || '')) }))),
      ctx.connection.fetch.register(jsonRoute('/api/ds-zhuzhu-use/presets', () => ({ ok: true, data: presetReport() }))),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/presets/fix', (body) =>
        ({ ok: true, data: presetFix(String((body && body.id) || '')) }))),
      ctx.connection.fetch.register(jsonRoute('/api/ds-zhuzhu-use/scope', () => scopePayload().then((data) => ({ ok: true, data })))),
      ctx.connection.fetch.register(jsonRoute('/api/ds-zhuzhu-use/chat', () => ({
        ok: true,
        data: { sessions: listChatSessions(), dir: webChatDir(), last: { key: chatLast.key, at: chatLast.at } },
      }))),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/chat-snapshot', (body) => saveChatSnapshot(body))),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/scope/set', (body) => {
        const saved = writeScope(body && body.scope ? body.scope : body)
        scopeOptionsCache = { at: 0, data: null }
        return { ok: true, scope: saved }
      })),
      ctx.connection.fetch.register(jsonRoute('/api/ds-zhuzhu-use/usage-card', () =>
        usageCardPayload(ctx).then((data) => ({ ok: true, data }))
      )),
      ctx.connection.fetch.register(postRoute('/api/ds-zhuzhu-use/token', (body) => {
        if (body && body.action === 'set') {
          const t = body && typeof body.token === 'string' ? body.token.trim() : ''
          if (!t) return { ok: false, error: 'token 为空' }
          writeToken(t)
          return { ok: true, hasToken: true }
        }
        if (body && body.action === 'clear') {
          clearToken()
          return { ok: true, hasToken: false }
        }
        return { ok: false, error: 'unknown action' }
      })),
      // ---- 软件信息 / 版本回退 / 工作目录 ----
      ctx.connection.fetch.register(jsonRoute('/api/dsh-about/info', () => ({
        ok: true,
        data: {
          appVersion: appVersion(),
          kernelVersion: kernelVersion(),
          contact: APP_CONTACT,
          repo: APP_REPO,
        },
      }))),
      ctx.connection.fetch.register(jsonRoute('/api/dsh-about/releases', async () => ({
        ok: true,
        data: await listReleases(),
      }))),
      ctx.connection.fetch.register(jsonRoute('/api/dsh-about/update-state', () => ({
        ok: true,
        data: dlSnapshot(),
      }))),
      ctx.connection.fetch.register(postRoute('/api/dsh-about/download', (body) => ({ ok: true, data: dlStart(body && body.tag, body && body.url, { install: false }) }))),
      ctx.connection.fetch.register(postRoute('/api/dsh-about/update', (body) => ({ ok: true, data: dlStart(body && body.tag, body && body.url, { install: true }) }))),
      ctx.connection.fetch.register(postRoute('/api/dsh-about/rollback', (body) => ({ ok: true, data: dlStart(body && body.tag, body && body.url, { install: true }) }))),
      ctx.connection.fetch.register(postRoute('/api/dsh-about/pause', () => ({ ok: true, data: dlPause() }))),
      ctx.connection.fetch.register(postRoute('/api/dsh-about/resume', () => ({ ok: true, data: dlResume() }))),
      ctx.connection.fetch.register(postRoute('/api/dsh-about/delete', () => ({ ok: true, data: dlDelete() }))),
      ctx.connection.fetch.register(postRoute('/api/dsh-about/install', () => ({ ok: true, data: dlInstall() }))),
      ctx.connection.fetch.register(postRoute('/api/dsh-about/reveal', () => ({ ok: true, data: revealInstaller() }))),
      // Office 预览：客户端把文件字节发过来，这里交给本机 Office 转 PDF（按内容哈希缓存）
      ctx.connection.fetch.register(postRoute('/api/dsh-about/office-pdf', (body) =>
        officeToPdf(body && body.name, body && body.data).then((d) => ({ ok: true, data: d })), 64 * 1024 * 1024)),
      ctx.connection.fetch.register(postRoute('/api/dsh-about/run-installer', () => ({ ok: true, data: dlInstall() }))),
      // 强制刷新：绕开 5 分钟缓存；拿不到新数据就明说，前端好报红。
      ctx.connection.fetch.register(postRoute('/api/dsh-about/releases/refresh', async () => {
        const before = releaseCache.at
        const list = await listReleases(true)
        const fresh = releaseCache.at !== before
        return {
          ok: true,
          data: list,
          fresh,
          warning: fresh ? '' : (releaseCache.data.length ? '没能连上 GitHub，显示的是上次结果' : '没能连上 GitHub'),
        }
      })),
      ctx.connection.fetch.register(jsonRoute('/api/dsh-about/workspace', () => {
        const data = readWorkspaceData()
        return {
          ok: true,
          data: {
            current: workspaceCurrent(data),
            list: workspaceList(data),
          },
        }
      })),
      ctx.connection.fetch.register(postRoute('/api/dsh-about/workspace/forget', (body) => forgetWorkspace(body && body.id))),
      ctx.connection.fetch.register(postRoute('/api/dsh-about/workspace/open', (body) => openInExplorer(body && body.path))),
      ctx.connection.fetch.register(jsonRoute('/api/dsh-about/sessions', () => sessionInventory().then((list) => ({ ok: true, data: list })))),
      ctx.connection.fetch.register(postRoute('/api/dsh-about/sessions/action', (body) => sessionAction(body))),
    ]
    return () => disposers.forEach((dispose) => dispose())
  }, 'ds_zhuzhu_use: http routes')

  // handler 抛错时 DSH 自动按 kind:'error' 结算，无需手动 try/catch。
  safeRegisterCommand(ctx, {
    name: 'usage',
    description: '查询 DeepSeek 账户余额、今日/近期用量与当前峰谷时段',
    handler: () => usageText(ctx).then((text) => ({ kind: 'success', text })),
  })

  // 宠物系统命令：agent 也能读它的状态（系统层，外观与动画不在这里）。
  safeRegisterCommand(ctx, {
    name: 'pet',
    description: '宠物系统：status / feed / mute / on / off',
    handler: (invocation) => {
      const arg = String((invocation && invocation.rawInput) || '').trim().split(/\s+/)[0] || 'status'
      try {
        const r = petAction(ctx, arg)
        return { kind: 'success', text: r.text }
      } catch (e) {
        return { kind: 'error', text: e && e.message ? e.message : String(e) }
      }
    },
  })
  // 让 agent 能读网页版 Chat：读的是本地 Markdown 存档（按会话分文件）。
  // 命令名必须独特：叫 chat 会和别的插件（如 dsh-pet）撞车，内核拒绝重名会让整个 profile 起不来。
  safeRegisterCommand(ctx, {
    name: 'webchat',
    description: '读取内嵌网页版 Chat 的本地存档（默认最近一个会话，可 /webchat <会话id前缀>）',
    handler: (invocation) => {
      const arg = String((invocation && invocation.rawInput) || '').trim()
      const list = listChatSessions()
      if (!list.length) {
        return {
          kind: 'success',
          text: '还没有网页版 Chat 的本地存档。到左侧栏的 Chat 面板打开一次，页面内容会自动同步到 ' + webChatDir() + '。',
        }
      }
      const hit = readChatSession(arg)
      if (!hit) {
        return {
          kind: 'error',
          text: '没找到会话 ' + arg + '。现有会话：\n' + list.map((s) => '  ' + s.id + '　' + (s.title || '') + '　' + (s.messages || 0) + ' 条').join('\n'),
        }
      }
      const md = hit.markdown
      const clipped = md.length > 20000 ? md.slice(0, 20000) + '\n\n…（已截断，完整内容：' + join(webChatDir(), hit.meta.file) + '）' : md
      const head = (!arg && list.length > 1)
        ? '（共 ' + list.length + ' 个会话，这里是最新的；要指定用 /webchat <id前缀>）\n\n'
        : ''
      return { kind: 'success', text: head + clipped }
    },
  })
  safeRegisterCommand(ctx, {
    name: 'explain-usage',
    description: '解释 DeepSeek 峰谷计价时段规则',
    handler: () => ({ kind: 'success', text: explainText() }),
  })
}
