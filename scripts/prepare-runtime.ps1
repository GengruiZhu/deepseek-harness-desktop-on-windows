# prepare-runtime.ps1
# 组装自包含 runtime（portable Node + 官方 DSH 内核 + 本仓库自带插件），供 electron-builder 打包。
#
# 用法：
#   .\scripts\prepare-runtime.ps1                 # 内核版本读 vendor/kernel.lock.json
#   .\scripts\prepare-runtime.ps1 -DshVersion 0.1.6-alpha.1
#
# 产出布局（对应 package.json 的 extraResources）：
#   runtime\node\   portable Node.js
#   runtime\dsh\    @deepseek-ai/dsh 运行时 + node_modules\ds_zhuzhu_use（本仓库插件）
#
# 内核版本不再手写：它是 vendor/kernel.lock.json 里那一行，submodule 钉在同一个 commit。
# 升级内核 = 改 lock + 挪 submodule，然后照常跑这个脚本。

param(
  [string]$NodeVersion = '24.16.0',
  [string]$DshVersion = '',
  [string]$RuntimeDir = (Join-Path $PSScriptRoot '..' 'runtime')
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$RuntimeDir = [System.IO.Path]::GetFullPath($RuntimeDir)

if (-not $DshVersion) {
  $nodeForLock = (Get-Command node -ErrorAction SilentlyContinue)
  if (-not $nodeForLock) { throw '需要 Node.js ≥ 20（用来读内核版本）' }
  $DshVersion = (& node (Join-Path $PSScriptRoot 'kernel-version.mjs')).Trim()
  if (-not $DshVersion) { throw 'kernel-version.mjs 没有输出内核版本' }
}
Write-Host "[prepare-runtime] kernel = $DshVersion" -ForegroundColor Cyan

function Test-RuntimeReady {
  param([string]$Dir)
  return (Test-Path (Join-Path $Dir 'node\node.exe')) -and
         (Test-Path (Join-Path $Dir 'dsh\node_modules\@deepseek-ai\dsh\lib\bin.js'))
}

if (Test-RuntimeReady -Dir $RuntimeDir) {
  Write-Host "[prepare-runtime] runtime already ready at $RuntimeDir, skip." -ForegroundColor Green
  exit 0
}
if (Test-Path $RuntimeDir) { Remove-Item $RuntimeDir -Recurse -Force }
New-Item -ItemType Directory -Force $RuntimeDir | Out-Null

# --- 1) portable Node.js ---
$nodeDir = Join-Path $RuntimeDir 'node'
$nodeZip = Join-Path $env:TEMP "node-v$NodeVersion-win-x64.zip"
Write-Host "[prepare-runtime] downloading Node $NodeVersion ..."
if (-not (Test-Path $nodeZip)) {
  Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" -OutFile $nodeZip
}
$extract = Join-Path $env:TEMP "node-extract-$NodeVersion"
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $nodeZip -DestinationPath $extract -Force
Copy-Item -Recurse -Force (Join-Path $extract "node-v$NodeVersion-win-x64") $nodeDir
Remove-Item $extract -Recurse -Force

# --- 2) 官方 DSH 内核（npm 安装完整包树） ---
Write-Host "[prepare-runtime] installing @deepseek-ai/dsh@$DshVersion ..."
$dshDir = Join-Path $RuntimeDir 'dsh'
New-Item -ItemType Directory -Force $dshDir | Out-Null
$nodeExe = Join-Path $nodeDir 'node.exe'
$npmCli = Join-Path $nodeDir 'node_modules\npm\bin\npm-cli.js'
# 必须先把 dsh 目录变成一个 npm 项目根，否则 npm 会沿着目录往上找到本仓库的
# package.json，把内核装进仓库自己的 node_modules 里（并且污染 package.json）。
if (-not (Test-Path (Join-Path $dshDir 'package.json'))) {
  [System.IO.File]::WriteAllText((Join-Path $dshDir 'package.json'),
    (@{ name = 'dsh-runtime'; private = $true; version = $DshVersion } | ConvertTo-Json) + "`n",
    (New-Object System.Text.UTF8Encoding($false)))
}
# --prefix 不能省：npm 认的是「当前目录」，不是脚本的目录。少了它就会装到
# 调用者的目录里去（第一次就装进了外层目录，runtime 里一个包都没有）。
& $nodeExe $npmCli install "@deepseek-ai/dsh@$DshVersion" --prefix $dshDir --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { throw "npm install @deepseek-ai/dsh@$DshVersion 失败" }

# --- 3) 本仓库自带插件（源码即产物，不再走 npm 包） ---
$pluginSrc = Join-Path $repoRoot 'plugins\ds_zhuzhu_use'
$pluginDst = Join-Path $dshDir 'node_modules\ds_zhuzhu_use'
if (Test-Path $pluginSrc) {
  if (Test-Path $pluginDst) { Remove-Item $pluginDst -Recurse -Force }
  Copy-Item -LiteralPath $pluginSrc -Destination $pluginDst -Recurse -Force
  Write-Host "[prepare-runtime] plugin -> $pluginDst"
} else {
  Write-Warning "找不到插件源码：$pluginSrc"
}

# --- 4) 官方 runtime 文件策略（声明文件 / source map / 其它平台 prebuild） ---
$trim = Join-Path $PSScriptRoot 'trim-runtime.mjs'
if (Test-Path $trim) { & $nodeExe $trim $RuntimeDir }

# --- 5) 校验 ---
if (-not (Test-RuntimeReady -Dir $RuntimeDir)) {
  Write-Error "[prepare-runtime] runtime verification failed: $RuntimeDir"
  exit 1
}
$installed = & $nodeExe -p "require('$($dshDir.Replace('\','/'))/node_modules/@deepseek-ai/dsh/package.json').version"
Write-Host "[prepare-runtime] done: $RuntimeDir (kernel $installed)" -ForegroundColor Green
