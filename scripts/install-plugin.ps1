<#
.SYNOPSIS
    Install (or refresh) the first-party ds_zhuzhu_use plugin into a DSH desktop profile.

.DESCRIPTION
    Wires the plugin the way the official desktop shell expects to find one:

      1. a PHYSICAL package directory inside the profile
             <home>/profiles/desktop/node_modules/ds_zhuzhu_use
      2. one entry appended to the profile's package.json
             dsh.profile.bundles  +=  "ds_zhuzhu_use"
      3. desktop.cordis.yml is left untouched on purpose

    Why physical and not a junction: apps/desktop-host/src/index.ts checks every
    profile bundle layer with realpath() and refuses a package that resolves
    outside the profile/runtime (isProjectPath). A junction into the build tree
    would be rejected; apps/desktop/src/profile-packages.ts rejects linked
    private packages for the same reason.

    Why bundles and not dependencies: profile-packages.ts requires every entry of
    `dependencies` to be an exact registry version (a file: spec is rejected
    outright), and it inspects each of them as an installed plugin record. The
    official first-party route (project-manager.installBundledPlugins) also adds
    to bundles only -- that list is what actually activates a plugin.

    Why desktop.cordis.yml is not written here: it is the Electron desktop
    composition root, owned exclusively by the app's package transactions.

    Idempotent: a re-run with the same source reports ALREADY CURRENT and
    rewrites nothing. Content is compared, not timestamps.

.PARAMETER DshHome
    Harness home. Defaults to $env:DSH_HOME, else <user home>\.dsh.

.PARAMETER ProfileName
    Desktop profile directory name under <home>\profiles. Defaults to desktop.

.PARAMETER PluginSource
    Directory of the plugin package to install. Defaults to the canonical
    first-party source tree.

.PARAMETER PluginName
    Expected package name. Defaults to ds_zhuzhu_use.

.PARAMETER AppDir
    Optional: an unpacked application directory (the one holding dsh.exe). When
    given, the plugin is ALSO staged into <AppDir>\resources\plugins\<name>,
    which is the app's own "carried first-party plugin" slot -- the app copies
    from there into the profile on every boot. Use it to make an installation
    self-healing; without it the profile copy is the only copy.

.PARAMETER Uninstall
    Remove the bundle entry and the profile package directory instead.

.PARAMETER DryRun
    Report the actions without touching anything.

.EXAMPLE
    powershell -NoProfile -File scripts/install-plugin.ps1 -DshHome E:\tmp\dsh-home

.EXAMPLE
    powershell -NoProfile -File scripts/install-plugin.ps1 -Uninstall

    This file is deliberately ASCII-only: Windows PowerShell 5.1 reads .ps1 as
    ANSI unless it carries a byte-order mark.
#>
[CmdletBinding()]
param(
    [string] $DshHome = '',
    [string] $ProfileName = 'desktop',
    [string] $PluginSource = 'E:\ds\_tool\plugin\ds_zhuzhu_use',
    [string] $PluginName = 'ds_zhuzhu_use',
    [string] $AppDir = '',
    [switch] $Uninstall,
    [switch] $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string] $Message)
    Write-Host ("==> {0}" -f $Message)
}

function Write-Note {
    param([string] $Message)
    Write-Host ("    {0}" -f $Message)
}

# Read a UTF-8 JSON file regardless of BOM: PS 5.1's Get-Content -Raw decodes
# UTF-8-without-BOM as ANSI, which turns non-ASCII text into invalid JSON.
function Read-JsonFile {
    param([string] $Path)
    return ([System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json)
}

function Resolve-Home {
    param([string] $Requested)
    if ($Requested -ne '') { return (Resolve-Path -LiteralPath $Requested).Path }
    if ($env:DSH_HOME) { return (Resolve-Path -LiteralPath $env:DSH_HOME).Path }
    return (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh')
}

function Get-TreeFingerprint {
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    $root = (Resolve-Path -LiteralPath $Path).Path
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($file in (Get-ChildItem -LiteralPath $root -Recurse -File -Force | Sort-Object FullName)) {
        $relative = $file.FullName.Substring($root.Length).Replace('\', '/')
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        $lines.Add(("{0}:{1}:{2}" -f $relative, $file.Length, $hash))
    }
    $joined = [string]::Join("`n", $lines)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($joined))
    } finally {
        $sha.Dispose()
    }
    return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

# Rewrite only the bundle list, through the same JSON.stringify(2-space) the app uses.
function Add-BundleEntry {
    param(
        [string] $ManifestPath,
        [string] $Name,
        [string] $NodeExe
    )
    $script = @'
import { readFileSync, writeFileSync } from 'node:fs'
const [path, name] = process.argv.slice(2)
const value = JSON.parse(readFileSync(path, 'utf8'))
if (typeof value.name !== 'string' || value.private !== true) throw new Error('not a profile manifest')
const profile = value.dsh?.profile
if (profile === undefined || !Array.isArray(profile.bundles)) throw new Error('manifest has no dsh.profile.bundles array')
if (profile.bundles.includes(name)) {
  process.stdout.write('unchanged')
  process.exit(0)
}
profile.bundles = [...profile.bundles, name]
writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`)
process.stdout.write('added')
'@
    $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-add-bundle-{0}.mjs" -f ([guid]::NewGuid().ToString('N')))
    [System.IO.File]::WriteAllText($temp, $script, [System.Text.UTF8Encoding]::new($false))
    try {
        $result = & $NodeExe $temp $ManifestPath $Name
        if ($LASTEXITCODE -ne 0) { throw ("adding the bundle entry failed (exit {0})" -f $LASTEXITCODE) }
        return ([string]$result).Trim()
    } finally {
        Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
    }
}

function Remove-BundleEntry {
    param(
        [string] $ManifestPath,
        [string] $Name,
        [string] $NodeExe
    )
    $script = @'
import { readFileSync, writeFileSync } from 'node:fs'
const [path, name] = process.argv.slice(2)
const value = JSON.parse(readFileSync(path, 'utf8'))
const profile = value.dsh?.profile
if (profile === undefined || !Array.isArray(profile.bundles) || !profile.bundles.includes(name)) {
  process.stdout.write('unchanged')
  process.exit(0)
}
profile.bundles = profile.bundles.filter(bundle => bundle !== name)
writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`)
process.stdout.write('removed')
'@
    $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-remove-bundle-{0}.mjs" -f ([guid]::NewGuid().ToString('N')))
    [System.IO.File]::WriteAllText($temp, $script, [System.Text.UTF8Encoding]::new($false))
    try {
        $result = & $NodeExe $temp $ManifestPath $Name
        if ($LASTEXITCODE -ne 0) { throw ("removing the bundle entry failed (exit {0})" -f $LASTEXITCODE) }
        return ([string]$result).Trim()
    } finally {
        Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
    }
}

# The application directory carries its own Node.js; fall back to the one on PATH.
function Resolve-Node {
    param([string] $AppRoot)
    if ($AppRoot -ne '') {
        $bundled = Join-Path $AppRoot 'resources\runtime\node\node.exe'
        if (Test-Path -LiteralPath $bundled) { return $bundled }
    }
    $onPath = Get-Command node -ErrorAction SilentlyContinue
    if ($null -ne $onPath) { return $onPath.Source }
    throw 'no node executable found; pass -AppDir so the bundled runtime can be used'
}

$harnessHome = Resolve-Home -Requested $DshHome
$profile = Join-Path $harnessHome ("profiles\{0}" -f $ProfileName)
$manifestPath = Join-Path $profile 'package.json'
$nodeModules = Join-Path $profile 'node_modules'
$target = Join-Path $nodeModules $PluginName
$nodeExe = Resolve-Node -AppRoot $AppDir

Write-Step 'Resolved paths'
Write-Note ("home      : {0}" -f $harnessHome)
Write-Note ("profile   : {0}" -f $profile)
Write-Note ("plugin dir: {0}" -f $target)
Write-Note ("node      : {0}" -f $nodeExe)
if ($DryRun) { Write-Note 'mode      : DRY RUN (nothing is written)' }

if (-not (Test-Path -LiteralPath $profile)) {
    throw ("desktop profile not found at {0}; boot the desktop app once so it creates the profile, then re-run" -f $profile)
}
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw ("profile manifest not found at {0}" -f $manifestPath)
}

if ($Uninstall) {
    Write-Step 'Removing the bundle entry'
    $outcome = Remove-BundleEntry -ManifestPath $manifestPath -Name $PluginName -NodeExe $nodeExe
    Write-Note ("dsh.profile.bundles: {0}" -f $outcome)
    if (Test-Path -LiteralPath $target) {
        Write-Step 'Removing the package directory'
        if ($DryRun) {
            Write-Note ("would remove {0}" -f $target)
        } else {
            Remove-Item -LiteralPath $target -Recurse -Force
            Write-Note ("removed {0}" -f $target)
        }
    } else {
        Write-Note 'package directory already absent'
    }
    Write-Host 'UNINSTALL OK'
    exit 0
}

Write-Step 'Validating the plugin source'
if (-not (Test-Path -LiteralPath (Join-Path $PluginSource 'package.json'))) {
    throw ("plugin source has no package.json: {0}" -f $PluginSource)
}
$sourceManifest = Read-JsonFile -Path (Join-Path $PluginSource 'package.json')
if ($sourceManifest.name -ne $PluginName) {
    throw ("plugin source is {0}, expected {1}" -f $sourceManifest.name, $PluginName)
}
$patchRelative = $sourceManifest.dsh.bundle.patch
if (-not $patchRelative) { throw 'plugin source does not declare dsh.bundle.patch' }
if (-not (Test-Path -LiteralPath (Join-Path $PluginSource $patchRelative))) {
    throw ("bundle patch {0} does not exist" -f $patchRelative)
}
Write-Note ("name/version : {0}@{1}" -f $sourceManifest.name, $sourceManifest.version)
Write-Note ("bundle patch : {0}" -f $patchRelative)
Write-Note ("client half  : platform={0}" -f $sourceManifest.dsh.client.platform)

$sourceFingerprint = Get-TreeFingerprint -Path $PluginSource
$targetFingerprint = Get-TreeFingerprint -Path $target
Write-Note ("source sha256: {0}" -f $sourceFingerprint)
Write-Note ("target sha256: {0}" -f $targetFingerprint)

Write-Step 'Materializing the package directory'
if ($targetFingerprint -eq $sourceFingerprint) {
    Write-Note 'already current; package directory untouched'
} elseif ($DryRun) {
    Write-Note ("would copy {0} -> {1}" -f $PluginSource, $target)
} else {
    if (Test-Path -LiteralPath $target) {
        # Guard: only ever remove the plugin's own directory inside node_modules.
        $resolvedModules = (Resolve-Path -LiteralPath $nodeModules).Path
        $resolvedTarget = (Resolve-Path -LiteralPath $target).Path
        if (-not $resolvedTarget.StartsWith($resolvedModules + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw ("refusing to replace {0}: outside {1}" -f $resolvedTarget, $resolvedModules)
        }
        Remove-Item -LiteralPath $target -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath $PluginSource -Destination $target -Recurse -Force
    Write-Note ("copied {0} -> {1}" -f $PluginSource, $target)
    Write-Note ("target sha256: {0}" -f (Get-TreeFingerprint -Path $target))
}

Write-Step 'Wiring dsh.profile.bundles'
if ($DryRun) {
    $current = Read-JsonFile -Path $manifestPath
    if (@($current.dsh.profile.bundles) -contains $PluginName) {
        Write-Note 'already listed; no write'
    } else {
        Write-Note ("would append {0} to dsh.profile.bundles" -f $PluginName)
    }
} else {
    $outcome = Add-BundleEntry -ManifestPath $manifestPath -Name $PluginName -NodeExe $nodeExe
    Write-Note ("dsh.profile.bundles: {0}" -f $outcome)
}
$bundles = @((Read-JsonFile -Path $manifestPath).dsh.profile.bundles)
Write-Note ("bundles now  : {0}" -f ($bundles -join ', '))
Write-Note 'desktop.cordis.yml left untouched (owned by the app package transactions)'

if ($AppDir -ne '') {
    Write-Step 'Staging into the application first-party plugin slot'
    $staged = Join-Path $AppDir ("resources\plugins\{0}" -f $PluginName)
    if ((Get-TreeFingerprint -Path $staged) -eq $sourceFingerprint) {
        Write-Note 'already current; staged copy untouched'
    } elseif ($DryRun) {
        Write-Note ("would copy {0} -> {1}" -f $PluginSource, $staged)
    } else {
        if (Test-Path -LiteralPath $staged) { Remove-Item -LiteralPath $staged -Recurse -Force }
        New-Item -ItemType Directory -Path (Split-Path -Parent $staged) -Force | Out-Null
        Copy-Item -LiteralPath $PluginSource -Destination $staged -Recurse -Force
        Write-Note ("staged {0}" -f $staged)
        Write-Note 'the app re-materializes this into the profile on every boot'
    }
}

Write-Host ''
Write-Host ("INSTALL OK  {0}@{1}  profile={2}" -f $PluginName, $sourceManifest.version, $profile)
