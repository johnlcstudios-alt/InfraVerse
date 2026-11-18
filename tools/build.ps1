<#
.SYNOPSIS
    Builds and packages the Industrial Digital Twin Simulator for Windows.

.DESCRIPTION
    Restores NuGet packages, builds the .NET Framework 4.8 WinForms/WebView2 shell
    in Release, runs the storage/bridge self-test, and stages a clean portable
    layout under:

        dist\IndustrialDigitalTwinSimulator\

    The staged folder is fully self-contained apart from the Microsoft Edge
    WebView2 Runtime, which is a machine-level Windows component.

.PARAMETER Configuration
    Build configuration (default: Release).

.PARAMETER SkipTests
    Skip the storage/bridge self-test.

.PARAMETER SkipRestore
    Skip the dotnet restore step (only when packages are already restored).

.EXAMPLE
    pwsh -File tools/build.ps1

.EXAMPLE
    pwsh -File tools/build.ps1 -Configuration Debug -SkipTests
#>
[CmdletBinding()]
param(
    [ValidateSet('Release', 'Debug')]
    [string]$Configuration = 'Release',

    [switch]$SkipTests,

    [switch]$SkipRestore
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$DesktopDir = Join-Path $RepoRoot 'desktop'
$DesktopProject = Join-Path $DesktopDir 'IndustrialDigitalTwinSimulator.csproj'
$SelfTestProject = Join-Path $RepoRoot 'tools\selftest\StorageBridgeSelfTest.csproj'
$WebDir = Join-Path $RepoRoot 'web'
$DistRoot = Join-Path $RepoRoot 'dist'
$StageDir = Join-Path $DistRoot 'IndustrialDigitalTwinSimulator'
$IconPath = Join-Path $RepoRoot 'app.ico'
$BinDir = Join-Path $DesktopDir ("bin\{0}\net48" -f $Configuration)

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Dotnet {
    param([string[]]$Arguments, [string]$Description)
    & dotnet @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw ("dotnet {0} failed with exit code {1}." -f $Description, $LASTEXITCODE)
    }
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw 'The .NET SDK was not found on PATH. Install the .NET 8 SDK (build-time only) from https://dotnet.microsoft.com/download and retry.'
}

Write-Host 'Industrial Digital Twin Simulator - desktop packaging'
Write-Host "Repository: $RepoRoot"
Write-Host "Configuration: $Configuration"

# ---------------------------------------------------------------------------
# 0. Pre-flight
# ---------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $DesktopProject)) {
    throw "Desktop project not found: $DesktopProject"
}

if (-not (Test-Path -LiteralPath $IconPath)) {
    Write-Step 'Generating application icon'
    & (Join-Path $PSScriptRoot 'make-icon.ps1')
    if (-not (Test-Path -LiteralPath $IconPath)) {
        throw 'Unable to generate app.ico.'
    }
}

$WebIndex = Join-Path $WebDir 'index.html'
if (-not (Test-Path -LiteralPath $WebIndex)) {
    Write-Warning "web\index.html was not found. The packaged app will start and show a friendly 'missing assets' page until the web application is added to web\."
}

# ---------------------------------------------------------------------------
# 1. Restore + build
# ---------------------------------------------------------------------------
if (-not $SkipRestore) {
    Write-Step 'Restoring NuGet packages'
    Invoke-Dotnet -Arguments @('restore', $DesktopProject) -Description 'restore (desktop)'
    if (-not $SkipTests) {
        Invoke-Dotnet -Arguments @('restore', $SelfTestProject) -Description 'restore (self-test)'
    }
}

Write-Step "Building desktop shell ($Configuration)"
Invoke-Dotnet -Arguments @('build', $DesktopProject, '-c', $Configuration, '--no-restore', '-nologo') -Description 'build (desktop)'

$ExePath = Join-Path $BinDir 'IndustrialDigitalTwinSimulator.exe'
if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "Build finished but the executable was not produced: $ExePath"
}

# ---------------------------------------------------------------------------
# 2. Storage bridge self-test (compiles the shipping sources directly)
# ---------------------------------------------------------------------------
if (-not $SkipTests) {
    Write-Step 'Running storage/bridge self-test'
    Invoke-Dotnet -Arguments @('build', $SelfTestProject, '-c', $Configuration, '--no-restore', '-nologo') -Description 'build (self-test)'
    $SelfTestExe = Join-Path $RepoRoot ("tools\selftest\bin\{0}\net48\StorageBridgeSelfTest.exe" -f $Configuration)
    & $SelfTestExe
    if ($LASTEXITCODE -ne 0) {
        throw 'Storage/bridge self-test failed. Packaging aborted.'
    }
}

# ---------------------------------------------------------------------------
# 3. Stage the portable layout (always from scratch)
# ---------------------------------------------------------------------------
Write-Step 'Staging portable layout'
if (Test-Path -LiteralPath $StageDir) {
    Remove-Item -LiteralPath $StageDir -Recurse -Force
}

New-Item -ItemType Directory -Path $StageDir -Force | Out-Null

# Runtime binaries: everything the build produced except symbols and the unused
# WPF flavour of the WebView2 wrapper.
Get-ChildItem -LiteralPath $BinDir -File |
    Where-Object { $_.Extension -ne '.pdb' -and $_.Name -ne 'Microsoft.Web.WebView2.Wpf.dll' } |
    Copy-Item -Destination $StageDir -Force

$RuntimeDir = Join-Path $BinDir 'runtimes'
if (Test-Path -LiteralPath $RuntimeDir) {
    Copy-Item -LiteralPath $RuntimeDir -Destination $StageDir -Recurse -Force
}

# Web application assets (read-only input; never modified by this script).
# Development-only files are excluded so screenshots, Playwright scripts and
# editor/OS junk can never leak into the portable distribution.
$DevDirectoryExclusions = @(
    'node_modules', '.git', '.github', '.cache', '.vscode', '.idea',
    'test-results', 'playwright-report', 'coverage', 'screenshots', 'screenshot',
    'tests', 'tests-e2e', 'dev-tools'
)
$DevFileExclusions = @(
    'Thumbs.db', '.DS_Store', 'desktop.ini',
    '*.log', '*.tmp', '*.bak', '*.orig', '*.rej', '*.swp',
    '*.mjs', '*.cjs', '*.test.js', '*.spec.js',
    '*.ps1', '*.psd', '*.xcf', '*.zip', '*.7z',
    'screenshot*.png', 'screenshot*.jpg', 'screenshot*.jpeg',
    '*-screenshot*.png', '*-screenshot*.jpg', '*-screenshot*.jpeg'
)

if (Test-Path -LiteralPath $WebDir) {
    Write-Host 'Copying web application assets...'
    $WebTarget = Join-Path $StageDir 'web'
    New-Item -ItemType Directory -Path $WebTarget -Force | Out-Null
    $RobocopyArguments = @($WebDir, $WebTarget, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:1', '/XD') +
        $DevDirectoryExclusions + @('/XF') + $DevFileExclusions
    & robocopy @RobocopyArguments | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw ("Unable to copy web assets (robocopy exit code {0})." -f $LASTEXITCODE)
    }
}

# Documentation and launcher.
foreach ($doc in @('README.md', 'THIRD_PARTY_NOTICES.md')) {
    $docPath = Join-Path $RepoRoot $doc
    if (-not (Test-Path -LiteralPath $docPath)) {
        throw "Required distribution document is missing: $docPath"
    }

    Copy-Item -LiteralPath $docPath -Destination $StageDir -Force
}

Copy-Item -LiteralPath $IconPath -Destination $StageDir -Force
$RunBat = @'
@echo off
rem Industrial Digital Twin Simulator - portable launcher
setlocal
cd /d "%~dp0"
if not exist "IndustrialDigitalTwinSimulator.exe" (
    echo IndustrialDigitalTwinSimulator.exe was not found next to this script.
    pause
    exit /b 1
)
start "" "IndustrialDigitalTwinSimulator.exe"
exit /b 0
'@
Set-Content -LiteralPath (Join-Path $StageDir 'run.bat') -Value $RunBat -Encoding ASCII

# ---------------------------------------------------------------------------
# 4. Validate the staged layout
# ---------------------------------------------------------------------------
Write-Step 'Validating portable layout'
$RequiredFiles = @(
    'IndustrialDigitalTwinSimulator.exe',
    'IndustrialDigitalTwinSimulator.exe.config',
    'Microsoft.Web.WebView2.Core.dll',
    'Microsoft.Web.WebView2.WinForms.dll',
    'WebView2Loader.dll',
    'run.bat',
    'app.ico',
    'README.md',
    'THIRD_PARTY_NOTICES.md'
)
foreach ($required in $RequiredFiles) {
    $path = Join-Path $StageDir $required
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Staged layout is missing a required file: $path"
    }
}

if (Test-Path -LiteralPath $WebIndex) {
    foreach ($webRequired in @('web\index.html', 'web\vendor\three.module.js')) {
        $path = Join-Path $StageDir $webRequired
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Staged web assets are incomplete: $path"
        }
    }

    # Guard: development artifacts must never ship inside the portable web folder.
    $StagedWeb = Join-Path $StageDir 'web'
    $forbiddenWebFiles = Get-ChildItem -LiteralPath $StagedWeb -Recurse -File |
        Where-Object {
            $_.Extension -in @('.mjs', '.cjs', '.ps1', '.log', '.tmp', '.bak', '.orig', '.rej', '.xcf', '.psd') -or
            $_.Name -in @('Thumbs.db', '.DS_Store', 'desktop.ini') -or
            $_.Name -match 'screenshot'
        }

    if ($forbiddenWebFiles) {
        $list = ($forbiddenWebFiles | ForEach-Object { $_.FullName.Substring($StagedWeb.Length + 1) }) -join ', '
        throw "Development artifacts were staged inside web\: $list"
    }
}
else {
    Write-Warning 'Skipping web asset validation because web\index.html does not exist yet.'
}

# ---------------------------------------------------------------------------
# 5. Summary
# ---------------------------------------------------------------------------
$stagedFiles = Get-ChildItem -LiteralPath $StageDir -Recurse -File
$distBytes = ($stagedFiles | Measure-Object -Property Length -Sum).Sum
$exeBytes = (Get-Item -LiteralPath (Join-Path $StageDir 'IndustrialDigitalTwinSimulator.exe')).Length
$exeHash = (Get-FileHash -LiteralPath (Join-Path $StageDir 'IndustrialDigitalTwinSimulator.exe') -Algorithm SHA256).Hash

Write-Step 'Build complete'
Write-Host ("Portable folder : {0}" -f $StageDir)
Write-Host ("Launcher        : {0}" -f (Join-Path $StageDir 'run.bat'))
Write-Host ("Executable      : {0} ({1:N1} KB)" -f (Join-Path $StageDir 'IndustrialDigitalTwinSimulator.exe'), ($exeBytes / 1KB))
Write-Host ("Staged files    : {0} ({1:N1} MB total)" -f $stagedFiles.Count, ($distBytes / 1MB))
Write-Host ("SHA256          : {0}" -f $exeHash)
Write-Host ''
Write-Host 'Run it with:  .\dist\IndustrialDigitalTwinSimulator\run.bat'
