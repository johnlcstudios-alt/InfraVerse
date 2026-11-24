<#
.SYNOPSIS
    Builds and packages the standalone TWIN OPS game executable for Windows.

.DESCRIPTION
    Builds desktop-game\TwinOps.csproj (the game-branded WebView2 shell that
    boots web\game.html directly) and stages a clean portable layout under:

        dist\TwinOps\

    The game exe shares the simulator's %LOCALAPPDATA% config store, so
    shifts played in TWIN OPS flow into the Industrial Digital Twin
    Simulator and back.

.PARAMETER Configuration
    Build configuration (default: Release).

.EXAMPLE
    pwsh -File tools/build-game.ps1
#>
[CmdletBinding()]
param(
    [ValidateSet('Release', 'Debug')]
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$GameProject = Join-Path $RepoRoot 'desktop-game\TwinOps.csproj'
$WebDir = Join-Path $RepoRoot 'web'
$DistRoot = Join-Path $RepoRoot 'dist'
$StageDir = Join-Path $DistRoot 'TwinOps'
$IconPath = Join-Path $RepoRoot 'app.ico'
$BinDir = Join-Path $RepoRoot "desktop-game\bin\{0}\net48" -f $Configuration
$BinDir = Join-Path $RepoRoot "desktop-game\bin\$Configuration\net48"

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw 'The .NET SDK was not found on PATH. Install the .NET 8 SDK (build-time only) and retry.'
}

Write-Host 'TWIN OPS: Field Engineer - standalone packaging'
Write-Host "Repository: $RepoRoot"
Write-Host "Configuration: $Configuration"

# ---------------------------------------------------------------------------
# 0. Pre-flight
# ---------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $GameProject)) {
    throw "Game project not found: $GameProject"
}
$GameIndex = Join-Path $WebDir 'game.html'
if (-not (Test-Path -LiteralPath $GameIndex)) {
    Write-Warning "web\game.html was not found. The packaged game will show a 'missing assets' page until the web game entry is added to web\."
}

# ---------------------------------------------------------------------------
# 1. Build
# ---------------------------------------------------------------------------
Write-Step 'Building TWIN OPS shell (Release)'
& dotnet build $GameProject -c $Configuration --nologo
if ($LASTEXITCODE -ne 0) {
    throw "dotnet build failed with exit code $LASTEXITCODE."
}

# The Digital Twin Simulator ships beside the game so the in-game deployment
# menu can open the matching control room in a second window (live-synced
# through the shared config store and the idt-twinbus channel).
$MainProject = Join-Path $RepoRoot 'desktop\IndustrialDigitalTwinSimulator.csproj'
$MainBinDir = Join-Path $RepoRoot "desktop\bin\$Configuration\net48"
Write-Step 'Building Digital Twin Simulator shell (Release)'
& dotnet build $MainProject -c $Configuration --nologo
if ($LASTEXITCODE -ne 0) {
    throw "dotnet build (simulator) failed with exit code $LASTEXITCODE."
}

# ---------------------------------------------------------------------------
# 2. Stage the portable layout (always from scratch)
# ---------------------------------------------------------------------------
Write-Step 'Staging portable layout'
if (Test-Path -LiteralPath $StageDir) {
    Remove-Item -LiteralPath $StageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $StageDir -Force | Out-Null

Get-ChildItem -Path $BinDir -File |
    Where-Object { $_.Extension -ne '.pdb' -and $_.Name -ne 'Microsoft.Web.WebView2.Wpf.dll' } |
    Copy-Item -Destination $StageDir -Force

# the simulator executable rides along (shared DLLs + web assets)
$MainExe = Join-Path $MainBinDir 'IndustrialDigitalTwinSimulator.exe'
if (Test-Path -LiteralPath $MainExe) {
    Copy-Item -LiteralPath $MainExe -Destination $StageDir -Force
} else {
    Write-Warning "Simulator executable not found at $MainExe - the deployment menu will not be able to open twin control rooms."
}

$RuntimeDir = Join-Path $BinDir 'runtimes'
if (Test-Path -LiteralPath $RuntimeDir) {
    Copy-Item -LiteralPath $RuntimeDir -Destination $StageDir -Recurse -Force
}

if (Test-Path -LiteralPath $WebDir) {
    Write-Host 'Copying web application assets...'
    $WebTarget = Join-Path $StageDir 'web'
    New-Item -ItemType Directory -Path $WebTarget -Force | Out-Null
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
    $RobocopyArguments = @($WebDir, $WebTarget, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:1', '/XD') +
        $DevDirectoryExclusions + @('/XF') + $DevFileExclusions
    & robocopy @RobocopyArguments | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw ("Unable to copy web assets (robocopy exit code {0})." -f $LASTEXITCODE)
    }
}

foreach ($docName in @('README.md', 'THIRD_PARTY_NOTICES.md')) {
    $docPath = Join-Path $RepoRoot $docName
    if (Test-Path -LiteralPath $docPath) {
        Copy-Item -LiteralPath $docPath -Destination $StageDir -Force
    }
}
if (Test-Path -LiteralPath $IconPath) {
    Copy-Item -LiteralPath $IconPath -Destination $StageDir -Force
}

$RunBat = @'
@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%TwinOps.exe" (
    start "" "%SCRIPT_DIR%TwinOps.exe"
) else (
    echo TWIN OPS executable not found. Keep this launcher next to TwinOps.exe.
    pause
)
'@
Set-Content -LiteralPath (Join-Path $StageDir 'run.bat') -Value $RunBat -Encoding ASCII

# ---------------------------------------------------------------------------
# 3. Validate the staged layout
# ---------------------------------------------------------------------------
Write-Step 'Validating portable layout'
$required = @(
    'TwinOps.exe',
    'WebView2Loader.dll',
    'web\game.html',
    'web\index.html',
    'web\js\game\twinops.js',
    'web\js\game\twinlink.js',
    'web\js\game\world.js',
    'web\vendor\three.module.js',
    'run.bat'
)
$missing = @()
foreach ($rel in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $StageDir $rel))) {
        $missing += $rel
    }
}
if ($missing.Count -gt 0) {
    throw ("Staged layout is incomplete. Missing: {0}" -f ($missing -join ', '))
}

# ---------------------------------------------------------------------------
# 4. Report
# ---------------------------------------------------------------------------
$exePath = Join-Path $StageDir 'TwinOps.exe'
$hash = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash
$allFiles = Get-ChildItem -LiteralPath $StageDir -Recurse -File
$totalMb = [Math]::Round(($allFiles | Measure-Object Length -Sum).Sum / 1MB, 1)

Write-Step 'Build complete'
Write-Host "Portable folder : $StageDir"
Write-Host "Launcher        : $(Join-Path $StageDir 'run.bat')"
Write-Host ("Executable      : {0} ({1} KB)" -f $exePath, [Math]::Round((Get-Item -LiteralPath $exePath).Length / 1KB, 1))
Write-Host ("Staged files    : {0} ({1} MB total)" -f $allFiles.Count, $totalMb)
Write-Host "SHA256          : $hash"
Write-Host ''
Write-Host 'Run it with:  .\dist\TwinOps\run.bat'
