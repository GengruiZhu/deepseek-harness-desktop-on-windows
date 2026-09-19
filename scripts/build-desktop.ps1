<#
.SYNOPSIS
    Build the Windows desktop installer from the vendored official DeepSeek Harness desktop shell.

.DESCRIPTION
    Reproduces the 0.9.1 pipeline: verify the vendored kernel, apply our vendor patches,
    make sure Electron is unpacked, then run the official unsigned Windows packaging flow and
    copy the resulting installer next to the repository.

    The script is deliberately ASCII-only so Windows PowerShell 5.1 reads it correctly without
    a byte-order mark.

.PARAMETER AppVersion
    Version label used in the artifact file name. The packaged application keeps the official
    kernel version internally; this label only names the installer we publish.

.PARAMETER ProductName
    Windows product name. Defaults to "dsh" so this build is distinguishable from the older
    self-made "DeepSeek Harness" shell.

.PARAMETER AppId
    Reverse-DNS application identifier required by the official packaging script.

.PARAMETER Icon
    Windows icon for the installer and the executable. Optional; defaults to assets/app-icon.png.

.PARAMETER PluginSource
    Directory holding the first-party plugin packages this build ships. Each plugin
    subdirectory is mirrored into plugins/ before packaging, which keeps that directory the
    single source of truth for plugin code.

.PARAMETER SkipInstall
    Skip "pnpm install" in the vendored kernel. Use when node_modules is already complete.

.PARAMETER SkipVerify
    Skip the kernel.lock.json / submodule verification step.

.EXAMPLE
    pwsh -NoProfile -File scripts/build-desktop.ps1

.EXAMPLE
    powershell -File scripts/build-desktop.ps1 -AppVersion 0.9.2 -SkipInstall
#>
[CmdletBinding()]
param(
    [string] $AppVersion = '0.9.1',
    [string] $ProductName = 'dsh',
    [string] $AppId = 'com.gengruizhu.dsh',
    [string] $Icon = '',
    # 插件唯一源（用户指定）：E:\ds\_tool\plugin。
    # 注意别指回老的 E:\ds_tool\plugin —— 那份 client.js 还是旧座位（宠物挂 sidebar.footer.action，
    # 不是官方的 shell.overlay），打进去就会出现「宠物时有时无」这种最难查的问题。
    [string] $PluginSource = 'E:\ds\_tool\plugin',
    [switch] $SkipInstall,
    [switch] $SkipVerify
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$VendorRoot = Join-Path $RepoRoot 'vendor\deepseek-harness'
$PatchesDir = Join-Path $RepoRoot 'patches'
$WorkDir = Join-Path $RepoRoot 'work'
$AssetsDir = Join-Path $RepoRoot 'assets'
$PluginsDir = Join-Path $RepoRoot 'plugins'
$LogPath = Join-Path $WorkDir ("package-{0}.build.log" -f $AppVersion)

function Write-Step {
    param([string] $Message)
    Write-Host ("==> {0}" -f $Message) -ForegroundColor Cyan
}

function Get-PatchFiles {
    if (-not (Test-Path -LiteralPath $PatchesDir)) { return @() }
    return @(Get-ChildItem -LiteralPath $PatchesDir -Filter '*.patch' -File | Sort-Object Name)
}

# Apply every vendor patch that is not applied yet. Reverse-applying a patch cleanly means the
# working tree already carries it, so re-running this script is safe. A patch that neither
# reverses nor applies is not a failure when a later patch in this same set touches the same
# files and is already applied: desktop-shell-final.patch supersedes desktop-shell-experience.patch
# over apps/desktop/src/{ipc,locale,main,preload-app,shell-ui}.ts, so once final is in the tree the
# experience hunks are unreachable from either side.
function Invoke-VendorPatches {
    $applied = 0
    $superseded = 0
    foreach ($patch in Get-PatchFiles) {
        $reversible = Invoke-GitPatch -Arguments @('apply', '--check', '--reverse', $patch.FullName)
        if ($reversible) {
            Write-Host ("    patch already applied: {0}" -f $patch.Name)
            continue
        }
        $applicable = Invoke-GitPatch -Arguments @('apply', '--check', $patch.FullName)
        if (-not $applicable) {
            $coveredBy = $null
            foreach ($later in Get-PatchFiles) {
                if ($later.Name -le $patch.Name) { continue }
                if (Invoke-GitPatch -Arguments @('apply', '--check', '--reverse', $later.FullName)) {
                    $coveredBy = $later.Name
                    break
                }
            }
            if ($coveredBy) {
                Write-Host ("    patch superseded by {0}: {1}" -f $coveredBy, $patch.Name) -ForegroundColor Yellow
                $superseded += 1
                continue
            }
        }
        $appliedNow = Invoke-GitPatch -Arguments @('apply', $patch.FullName)
        if (-not $appliedNow) { throw ("could not apply vendor patch {0}" -f $patch.Name) }
        Write-Host ("    applied patch: {0}" -f $patch.Name) -ForegroundColor Green
        $applied += 1
    }
    Write-Host ("    {0} patch(es) applied this run, {1} superseded" -f $applied, $superseded)
}

# Run one git command inside the vendored kernel and report whether it succeeded.
# stderr is folded into stdout and silenced so PowerShell 7's native-command error handling
# cannot turn an expected non-zero probe into a terminating error.
function Invoke-GitPatch {
    param([string[]] $Arguments)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & git -C $VendorRoot @Arguments 2>&1 | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $previous
    }
}

# pnpm blocks Electron's postinstall through the workspace build-script policy, so the Electron
# binary is not unpacked by "pnpm install" alone. Run the package's own installer when missing.
function Ensure-ElectronBinary {
    $candidates = @(Get-ChildItem -LiteralPath (Join-Path $VendorRoot 'node_modules\.pnpm') -Directory -Filter 'electron@*' -ErrorAction SilentlyContinue)
    if ($candidates.Count -eq 0) { throw 'electron package is not installed; run pnpm install first' }
    $unpacked = $false
    foreach ($candidate in $candidates) {
        $packageDir = Join-Path $candidate.FullName 'node_modules\electron'
        $installScript = Join-Path $packageDir 'install.js'
        if (-not (Test-Path -LiteralPath $installScript)) { continue }
        if (Test-Path -LiteralPath (Join-Path $packageDir 'dist\electron.exe')) {
            $unpacked = $true
            continue
        }
        Write-Host ("    downloading Electron into {0}" -f $candidate.Name)
        & node $installScript
        if ($LASTEXITCODE -ne 0) { throw 'Electron download failed' }
        $unpacked = $true
    }
    if (-not $unpacked) { throw 'no Electron package provided an install script' }
}

function Get-ArtifactDirectory {
    return Join-Path $VendorRoot 'apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts'
}

New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $VendorRoot 'package.json'))) {
    throw ("vendored kernel is missing at {0}; run: git submodule update --init --recursive" -f $VendorRoot)
}

Write-Step 'Verifying the vendored kernel against vendor/kernel.lock.json'
if ($SkipVerify) {
    Write-Host '    skipped (-SkipVerify)'
} else {
    & node (Join-Path $RepoRoot 'scripts\kernel-version.mjs') --verify
    if ($LASTEXITCODE -ne 0) { throw 'kernel lock verification failed' }
}

Write-Step 'Applying vendor patches'
Invoke-VendorPatches

Write-Step 'Syncing first-party plugins'
if (Test-Path -LiteralPath $PluginSource) {
    New-Item -ItemType Directory -Force -Path $PluginsDir | Out-Null
    $pluginsRoot = (Resolve-Path -LiteralPath $PluginsDir).Path
    foreach ($plugin in Get-ChildItem -LiteralPath $PluginSource -Directory) {
        $target = Join-Path $pluginsRoot $plugin.Name
        if (-not $target.StartsWith($pluginsRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw ("refusing to replace {0}: outside {1}" -f $target, $pluginsRoot)
        }
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
        Copy-Item -LiteralPath $plugin.FullName -Destination $target -Recurse -Force
        Write-Host ("    plugin: {0}" -f $plugin.Name)
    }
} else {
    Write-Host ("    plugin source not found, keeping plugins/ as is: {0}" -f $PluginSource)
}
if (-not (Test-Path -LiteralPath $PluginsDir)) {
    throw 'no plugins/ directory to package; check -PluginSource'
}
$env:DSH_DESKTOP_PLUGINS_DIR = $PluginsDir
if (Test-Path -LiteralPath (Join-Path $AssetsDir 'app-icon.png')) {
    $env:DSH_DESKTOP_EXTRA_ASSETS = $AssetsDir
} else {
    Write-Host ("    no shell assets in {0}; packaging without the window icon" -f $AssetsDir)
}

if (-not $Icon) {
    $defaultIcon = Join-Path $AssetsDir 'app-icon.png'
    if (Test-Path -LiteralPath $defaultIcon) { $Icon = $defaultIcon }
}

if (-not $SkipInstall) {
    Write-Step 'Installing kernel dependencies (low network concurrency)'
    # CI=true makes the repository's lefthook postinstall a no-op; lefthook tries to enable
    # extensions.worktreeConfig, which a submodule checkout cannot do.
    $env:CI = 'true'
    Push-Location $VendorRoot
    try {
        & pnpm install --network-concurrency=3 --child-concurrency=2 --fetch-retries=6
        if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed' }
    } finally {
        Pop-Location
    }
}

Write-Step 'Checking the Electron runtime binary'
Ensure-ElectronBinary

Write-Step ("Packaging {0} {1} for win-x64 (unsigned)" -f $ProductName, $AppVersion)
$env:CI = 'true'
$env:DSH_DESKTOP_APP_ID = $AppId
$env:DSH_DESKTOP_PRODUCT_NAME = $ProductName
# The packaged application keeps the bundled kernel's version; this label is what the shell
# reports to plugins as its own version, so it has to be the version we publish the installer under.
$env:DSH_DESKTOP_RELEASE_LABEL = $AppVersion
# electron-builder expands the ${os}/${arch}/${ext} placeholders itself, so they must survive
# string building untouched: "-f" would treat "{os}" as a format item and fail.
$env:DSH_DESKTOP_ARTIFACT_NAME = '{0}-{1}-${{os}}-${{arch}}.${{ext}}' -f $ProductName, $AppVersion
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
# The repository's electron-builder chain uses a node-gyp that predates Python 3.12 and cannot
# detect Visual Studio 2026; point it at the node-gyp bundled with Node.js instead.
$nodeGyp = 'C:\Program Files\nodejs\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js'
if (Test-Path -LiteralPath $nodeGyp) { $env:npm_config_node_gyp = $nodeGyp }
if ($Icon) {
    if (-not (Test-Path -LiteralPath $Icon)) { throw ("icon not found: {0}" -f $Icon) }
    # Not DSH_DESKTOP_WINDOWS_*: the packaging chain strips that prefix as signing input, which
    # would silently drop the icon and ship electron-builder's default artwork.
    $env:DSH_DESKTOP_ICON = (Resolve-Path -LiteralPath $Icon).Path
}

Push-Location $VendorRoot
try {
    & cmd /c ("pnpm run package:desktop:win:x64:unsigned 1> `"{0}`" 2>&1" -f $LogPath)
    $packageExit = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($packageExit -ne 0) {
    Write-Host ("packaging failed (exit {0}); last log lines:" -f $packageExit) -ForegroundColor Red
    Get-Content -LiteralPath $LogPath -Tail 30
    exit $packageExit
}

Write-Step 'Collecting the installer'
$artifactDir = Get-ArtifactDirectory
$installer = Get-ChildItem -LiteralPath $artifactDir -Filter '*.exe' -File |
    Where-Object { $_.Name -notlike '*.__uninstaller.exe' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $installer) { throw ("no installer found in {0}" -f $artifactDir) }

$releaseDir = Join-Path $RepoRoot 'release'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$destination = Join-Path $releaseDir $installer.Name
Copy-Item -LiteralPath $installer.FullName -Destination $destination -Force
$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash

Write-Host ''
Write-Host 'Build complete' -ForegroundColor Green
Write-Host ("  installer : {0}" -f $destination)
Write-Host ("  size      : {0:N0} bytes" -f (Get-Item -LiteralPath $destination).Length)
Write-Host ("  sha256    : {0}" -f $hash)
Write-Host ("  log       : {0}" -f $LogPath)
Write-Host ("  unpacked  : {0}" -f (Join-Path $artifactDir 'win-unpacked'))
