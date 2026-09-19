#!/usr/bin/env node
// 内核版本的唯一来源。
//
// 以前内核版本是手写在好几处的（package.json 的描述、README、prepare-runtime
// 的参数默认值、发布说明），一处忘了改就会出现「装的是 0.1.5、写的是 0.1.6」
// 这种事。现在只认 vendor/kernel.lock.json，并且能在 submodule 已检出时校验
// 记录的 commit 与实际检出的是否一致。
//
//   node scripts/kernel-version.mjs            # 打印内核版本
//   node scripts/kernel-version.mjs --verify    # 顺便校验 submodule 的 commit
//   node scripts/kernel-version.mjs --json      # 打印整份锁定信息
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const lockPath = path.join(root, 'vendor', 'kernel.lock.json')
if (!fs.existsSync(lockPath)) {
  console.error('缺少 ' + lockPath)
  process.exit(2)
}
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
const args = process.argv.slice(2)

if (args.includes('--json')) {
  console.log(JSON.stringify(lock, null, 2))
  process.exit(0)
}

function submoduleHead() {
  const dir = path.join(root, 'vendor', 'deepseek-harness')
  if (!fs.existsSync(path.join(dir, '.git'))) return null
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch { return null }
}

if (args.includes('--verify')) {
  const head = submoduleHead()
  if (!head) {
    console.log('kernel ' + lock.kernel + '（submodule 未检出，跳过 commit 校验）')
    console.log('检出：git submodule update --init --depth 1')
    process.exit(0)
  }
  if (head !== lock.commit) {
    console.error('内核引用对不上：')
    console.error('  vendor/kernel.lock.json = ' + lock.commit + ' (' + lock.tag + ')')
    console.error('  vendor/deepseek-harness  = ' + head)
    console.error('要么把 submodule 挪回锁定的 commit，要么更新 lock 文件（升级内核时是后者）。')
    process.exit(1)
  }
  console.log('kernel ' + lock.kernel + ' @ ' + lock.tag + ' (' + head.slice(0, 12) + ') OK')
  process.exit(0)
}

console.log(lock.kernel)
