# prepare-runtime.ps1
# 准备自包含 runtime（portable Node v24 + 官方 DSH runtime），供 electron-builder 打包。
#
# 用法：
#   .\scripts\prepare-runtime.ps1            # 使用仓库根目录的 runtime/（已有则跳过）
#   .\scripts\prepare-runtime.ps1 -NodeVersion 24.16.0 -DshVersion 0.1.1-rc.2
#
# 产出目录布局（与 package.json 的 extraResources 对应）：
#   runtime\node\    portable Node.js（node.exe + 完整 npm/corepack）
#   runtime\dsh\     @deepseek-ai/dsh 运行时（npm 安装，含 dsh-web-frontend、dsh-fenggu 等）
#
# 如果你是从本仓库 Release 安装包（解包后 resources\runtime\）拿到的 runtime，
# 直接把它放到仓库根目录的 runtime\ 即可，脚本会检测到并跳过。

param(
  [string]$NodeVersion = '24.16.0',
  [string]$DshVersion = '0.1.1-rc.2',
  [string]$RuntimeDir = (Join-Path $PSScriptRoot '..' 'runtime')
)

$ErrorActionPreference = 'Stop'
$RuntimeDir = [System.IO.Path]::GetFullPath($RuntimeDir)

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

# --- 1) portable Node.js（官方 zip，解压出 node.exe + node_modules） ---
$nodeZip = Join-Path $env:TEMP "node-v$NodeVersion-win-x64.zip"
$nodeDir = Join-Path $RuntimeDir 'node'
Write-Host "[prepare-runtime] downloading Node $NodeVersion ..."
Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" -OutFile $nodeZip
Expand-Archive -Path $nodeZip -DestinationPath (Join-Path $env:TEMP 'node-extract') -Force
Copy-Item -Recurse -Force (Join-Path $env:TEMP "node-extract\node-v$NodeVersion-win-x64") $nodeDir
Remove-Item (Join-Path $env:TEMP 'node-extract') -Recurse -Force

# --- 2) 官方 DSH runtime（npm 安装完整 @deepseek-ai/dsh 包树） ---
Write-Host "[prepare-runtime] installing @deepseek-ai/dsh@$DshVersion ..."
$dshDir = Join-Path $RuntimeDir 'dsh'
New-Item -ItemType Directory -Force $dshDir | Out-Null
Push-Location $dshDir
try {
  & (Join-Path $nodeDir 'node.exe') (Join-Path $nodeDir 'node_modules\npm\bin\npm-cli.js') install "@deepseek-ai/dsh@$DshVersion" --no-audit --no-fund
  & (Join-Path $nodeDir 'node.exe') (Join-Path $nodeDir 'node_modules\npm\bin\npm-cli.js') install "dsh-fenggu@latest" --no-audit --no-fund
} finally {
  Pop-Location
}

# --- 3) 校验 ---
if (-not (Test-RuntimeReady -Dir $RuntimeDir)) {
  Write-Error "[prepare-runtime] runtime verification failed: $RuntimeDir"
  exit 1
}
Write-Host "[prepare-runtime] done: $RuntimeDir" -ForegroundColor Green
