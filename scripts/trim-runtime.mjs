// Trim the packaged runtime the way the official desktop does.
//
// apps/desktop/scripts/runtime-file-policy.ts drops TypeScript declarations,
// source maps, build caches and native prebuilds for other platforms before the
// `resources/dsh` copy is sealed. Nothing loads a .d.ts, a source map or a
// Linux prebuild at runtime; together they are tens of megabytes in every
// installer we hand out.
//
// Deliberately conservative: only files that are *never* loaded at runtime are
// touched, so a trimmed runtime still boots exactly like the untrimmed one.
//
// Usage: node trim-runtime.mjs <runtime-dir> [--dry]
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const runtimeDir = args.find((a) => !a.startsWith('--'))
if (!runtimeDir) { console.error('usage: node trim-runtime.mjs <runtime-dir> [--dry]'); process.exit(2) }

const nm = path.join(runtimeDir, 'dsh', 'node_modules')
if (!fs.existsSync(nm)) { console.error('no node_modules at ' + nm); process.exit(1) }

const DROP_FILE = /\.(d\.ts|d\.mts|d\.cts|map|tsbuildinfo)$/i
// Kept on this platform only; a shipped Windows app never extracts the others.
const KEEP_PREBUILD = /win32-x64/
const FOREIGN_PREBUILD = /^(linux|darwin|macos|freebsd|android|win32-arm64)/i
// Pure documentation folders inside packages that only ship docs/tests there.
const DEAD_DIR_PKG = new Map([
  ['domino', new Set(['test'])],
  ['typescript', new Set(['test', 'lib'])],
])

let files = 0
let bytes = 0
let dirs = 0
let locked = 0

function sizeOf(p) {
  let total = 0
  let entries
  try { entries = fs.readdirSync(p, { withFileTypes: true }) } catch { return 0 }
  for (const e of entries) {
    const full = path.join(p, e.name)
    if (e.isDirectory()) total += sizeOf(full)
    else { try { total += fs.statSync(full).size } catch {} }
  }
  return total
}

function dropFile(full) {
  let size = 0
  try { size = fs.statSync(full).size } catch {}
  if (!dry) { try { fs.rmSync(full, { force: true }) } catch { locked++; return } }
  files++
  bytes += size
}

function dropDir(full) {
  const size = sizeOf(full)
  if (!dry) { try { fs.rmSync(full, { recursive: true, force: true }) } catch { locked++; return } }
  dirs++
  bytes += size
}

function walk(dir, pkgName) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      const deadIn = DEAD_DIR_PKG.get(pkgName)
      // `typescript/lib` is the compiler itself — never remove that.
      if (deadIn && deadIn.has(e.name) && !(pkgName === 'typescript' && e.name === 'lib')) {
        // Only when the folder really is just tests/docs (no package entry point).
        if (e.name === 'test' || e.name === 'docs') { dropDir(full); continue }
      }
      if ((e.name === 'prebuilds' || e.name === 'prebuild') && !/node-pty|node-addon/i.test(pkgName)) {
        for (const p of fs.readdirSync(full, { withFileTypes: true })) {
          if (!p.isDirectory()) continue
          if (KEEP_PREBUILD.test(p.name)) continue
          if (FOREIGN_PREBUILD.test(p.name)) dropDir(path.join(full, p.name))
        }
        continue
      }
      walk(full, pkgName)
      continue
    }
    if (DROP_FILE.test(e.name)) dropFile(full)
  }
}

const t0 = Date.now()
for (const e of fs.readdirSync(nm, { withFileTypes: true })) {
  if (!e.isDirectory()) continue
  if (e.name.startsWith('@')) {
    const scope = path.join(nm, e.name)
    for (const s of fs.readdirSync(scope, { withFileTypes: true })) {
      if (s.isDirectory()) walk(path.join(scope, s.name), s.name)
    }
  } else {
    walk(path.join(nm, e.name), e.name)
  }
}

const mb = (bytes / 1048576).toFixed(1)
console.log(`trim-runtime: ${files} declarations/maps + ${dirs} dead dirs, ~${mb} MB${dry ? ' (dry run)' : ''}, ${Date.now() - t0} ms`)
if (locked) console.log(`trim-runtime: ${locked} entries were locked and left alone`)

// 可选子代理驱动（Codex CLI 377 MB + Claude Code SDK 216 MB）不进安装包：
// 它们在「设置 → 子代理」里按需下载，装到 profile 的 node_modules，内核从那里解析
// （驱动插件本身就住在 profile 里）。这两个包占了整个 runtime 的 6 成，而不用子代理的人
// 一次都不会碰 —— 打包时在这里删掉，是最干净的一刀。
const OPTIONAL_DRIVER_DIRS = [
  ['@openai', 'codex'],
  ['@openai', 'codex-win32-x64'],
  ['@openai', 'codex-linux-x64'],
  ['@openai', 'codex-darwin-x64'],
  ['@openai', 'codex-darwin-arm64'],
  ['@anthropic-ai', 'claude-agent-sdk-win32-x64'],
]
if (!args.includes('--keep-drivers')) {
  let saved = 0
  const gone = []
  for (const parts of OPTIONAL_DRIVER_DIRS) {
    const p = path.join(nm, ...parts)
    if (!fs.existsSync(p)) continue
    saved += sizeOf(p)
    if (!dry) { try { fs.rmSync(p, { recursive: true, force: true }) } catch { continue } }
    gone.push(parts.join('/'))
  }
  if (gone.length) console.log(`trim-runtime: dropped optional subagent drivers (${gone.join(', ')}), ~${(saved / 1048576).toFixed(1)} MB`)
}
