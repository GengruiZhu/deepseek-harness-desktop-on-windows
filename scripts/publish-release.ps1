# publish-release.ps1
# 打包 NSIS 安装器并暂存到 dist-upload/，同时打印 GitHub Releases 发布命令。
#
# 用法：
#   .\scripts\publish-release.ps1            # npm run dist，然后把安装包复制到 dist-upload/
#   .\scripts\publish-release.ps1 -Version 0.8.0 -Tag v0.8.0
#
# 前置：runtime/ 已就绪（见 prepare-runtime.ps1）、本机已 npm install。

param(
  [string]$Version = $null,
  [string]$Tag = $null
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location $root

# 打包（electron-builder --win nsis，输出 release/）
Write-Host "[publish] npm run dist ..." -ForegroundColor Cyan
npm run dist
if ($LASTEXITCODE -ne 0) { Write-Error "[publish] dist failed (exit $LASTEXITCODE)"; exit 1 }

# 定位最新安装包
$exe = Get-ChildItem "$root\release\*.exe" | Where-Object { $_.Name -notlike '*.bak-*' } |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) { Write-Error "[publish] no installer found under release\"; exit 1 }

if (-not $Version) {
  $Version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
}
if (-not $Tag) { $Tag = "v$Version" }

# 暂存区（git 不入库）
$staging = Join-Path $root 'dist-upload'
New-Item -ItemType Directory -Force $staging | Out-Null
Copy-Item $exe.FullName $staging -Force
$blockmap = Get-ChildItem "$root\release" -Filter "$($exe.BaseName).blockmap" -ErrorAction SilentlyContinue
if ($blockmap) { Copy-Item $blockmap.FullName $staging -Force }

Write-Host ""
Write-Host "[publish] staged: $($exe.Name) -> dist-upload" -ForegroundColor Green
Write-Host ""
Write-Host "[publish] 下一步（二选一）：" -ForegroundColor Cyan
Write-Host "  A) 网页上传：GitHub 仓库页 -> Releases -> Draft a new release" -ForegroundColor White
Write-Host "     tag: $Tag   标题: $Version"
Write-Host "     把 dist-upload\ 里的安装包 (.exe) 拖进附件框，正文粘贴 CHANGELOG 对应片段。"
Write-Host "  B) gh CLI（已安装时）："
Write-Host "     gh release create $Tag \"$staging\$($exe.Name)\" --title \"$Version\" --notes-file CHANGELOG.md"
Write-Host ""
Write-Host "[publish] 记得先给 tag 打上： git tag $Tag`ngit push origin $Tag" -ForegroundColor Yellow
Write-Host "    （若 CI workflow 存在，推送 tag 会自动构建）"
