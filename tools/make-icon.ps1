<#
.SYNOPSIS
    Generates app.ico for the Industrial Digital Twin Simulator desktop shell.

.DESCRIPTION
    Draws a clean, code-only industrial "hexagon + network" icon with
    System.Drawing (no external assets or dependencies) and writes a
    multi-resolution PNG-compressed ICO file (16/32/48/256 px).

    The icon is rendered on a 1024x1024 canvas and down-sampled with
    high-quality bicubic filtering so every size stays crisp.

.PARAMETER OutputPath
    Destination .ico file. Defaults to <repo root>\app.ico.

.PARAMETER PreviewPath
    Optional PNG preview (512 px) written for visual inspection.
#>
[CmdletBinding()]
param(
    [string]$OutputPath,
    [string]$PreviewPath
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) { $OutputPath = Join-Path $repoRoot 'app.ico' }

$CanvasSize = 1024
$Center = [single]($CanvasSize / 2.0)

function New-RoundedRectanglePath {
    param(
        [single]$X, [single]$Y, [single]$Width, [single]$Height, [single]$Radius
    )
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $Radius * 2.0
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $Width - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $Width - $d, $Y + $Height - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $Height - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $path
}

function New-HexagonPoints {
    param([single]$CX, [single]$CY, [single]$Radius, [single]$RotationDegrees = -90)
    $points = New-Object 'System.Drawing.PointF[]' 6
    for ($i = 0; $i -lt 6; $i++) {
        $angle = ($RotationDegrees + $i * 60.0) * [Math]::PI / 180.0
        $points[$i] = New-Object System.Drawing.PointF(
            [single]($CX + $Radius * [Math]::Cos($angle)),
            [single]($CY + $Radius * [Math]::Sin($angle)))
    }
    $points
}

function New-HexagonPath {
    param([single]$CX, [single]$CY, [single]$Radius, [single]$RotationDegrees = -90)
    $points = [System.Drawing.PointF[]](New-HexagonPoints -CX $CX -CY $CY -Radius $Radius -RotationDegrees $RotationDegrees)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddPolygon($points)
    $path
}

function Format-Color {
    param([int]$A, [int]$R, [int]$G, [int]$B)
    [System.Drawing.Color]::FromArgb($A, $R, $G, $B)
}

# ---------------------------------------------------------------------------
# Draw the master canvas.
# ---------------------------------------------------------------------------
$bitmap = New-Object System.Drawing.Bitmap($CanvasSize, $CanvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

$margin = [single]36
$plateSize = [single]($CanvasSize - (2 * $margin))
$plateRect = New-Object System.Drawing.RectangleF($margin, $margin, $plateSize, $plateSize)
$plate = New-RoundedRectanglePath -X $plateRect.X -Y $plateRect.Y -Width $plateRect.Width -Height $plateRect.Height -Radius 188

# Base plate: deep industrial navy with a soft vertical gradient.
$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $plateRect,
    (Format-Color 255 10 18 32),
    (Format-Color 255 20 34 56),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
$g.FillPath($gradient, $plate)
$gradient.Dispose()

# Subtle engineering grid, clipped to the plate.
$state = $g.Save()
$g.SetClip($plate)
$gridPen = New-Object System.Drawing.Pen((Format-Color 46 96 165 250), [single]2.0)
for ($x = 112; $x -lt $CanvasSize - 48; $x += 96) {
    $g.DrawLine($gridPen, [single]$x, [single]72, [single]$x, [single]($CanvasSize - 72))
}
for ($y = 112; $y -lt $CanvasSize - 48; $y += 96) {
    $g.DrawLine($gridPen, [single]72, [single]$y, [single]($CanvasSize - 72), [single]$y)
}
$gridPen.Dispose()

# Faint corner brackets for an industrial HUD feel.
$bracketPen = New-Object System.Drawing.Pen((Format-Color 120 34 211 238), [single]6.0)
foreach ($corner in @(
        @{ X = 92; Y = 92; DX = 1; DY = 1 },
        @{ X = $CanvasSize - 92; Y = 92; DX = -1; DY = 1 },
        @{ X = 92; Y = $CanvasSize - 92; DX = 1; DY = -1 },
        @{ X = $CanvasSize - 92; Y = $CanvasSize - 92; DX = -1; DY = -1 })) {
    $len = 74.0
    $g.DrawLine($bracketPen, [single]$corner.X, [single]$corner.Y, [single]($corner.X + $corner.DX * $len), [single]$corner.Y)
    $g.DrawLine($bracketPen, [single]$corner.X, [single]$corner.Y, [single]$corner.X, [single]($corner.Y + $corner.DY * $len))
}
$bracketPen.Dispose()
$g.Restore($state)

# Plate rim.
$rimPen = New-Object System.Drawing.Pen((Format-Color 150 56 189 248), [single]5.0)
$g.DrawPath($rimPen, $plate)
$rimPen.Dispose()

# ---------------------------------------------------------------------------
# Hexagonal "digital twin" network mark.
# ---------------------------------------------------------------------------
$hexRadius = [single]352
$hex = New-HexagonPath -CX $Center -CY $Center -Radius $hexRadius

# Outer glow (three passes) + dark fill so the mark reads on any background.
foreach ($glow in @(
        @{ W = 74.0; A = 30 },
        @{ W = 48.0; A = 48 },
        @{ W = 28.0; A = 74 })) {
    $pen = New-Object System.Drawing.Pen((Format-Color $glow.A 34 211 238), [single]$glow.W)
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($pen, $hex)
    $pen.Dispose()
}
$hexFill = New-Object System.Drawing.SolidBrush((Format-Color 235 9 18 34))
$g.FillPath($hexFill, $hex)
$hexFill.Dispose()

# Crisp cyan rim.
$hexPen = New-Object System.Drawing.Pen((Format-Color 255 103 232 249), [single]16.0)
$hexPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawPath($hexPen, $hex)
$hexPen.Dispose()

# Inner hexagon.
$innerHex = New-HexagonPath -CX $Center -CY $Center -Radius 196 -RotationDegrees -60
$innerPen = New-Object System.Drawing.Pen((Format-Color 190 56 189 248), [single]9.0)
$innerPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawPath($innerPen, $innerHex)
$innerPen.Dispose()

# Spokes from centre to the outer vertices + mid-spoke nodes.
$vertices = [System.Drawing.PointF[]](New-HexagonPoints -CX $Center -CY $Center -Radius $hexRadius)
$spokePen = New-Object System.Drawing.Pen((Format-Color 215 71 105 142), [single]16.0)
$spokePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$spokePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$midBrush = New-Object System.Drawing.SolidBrush((Format-Color 255 125 211 252))
foreach ($v in $vertices) {
    $g.DrawLine($spokePen, [single]$Center, [single]$Center, $v.X, $v.Y)
    $mx = [single]($Center + ($v.X - $Center) * 0.62)
    $my = [single]($Center + ($v.Y - $Center) * 0.62)
    $g.FillEllipse($midBrush, [single]($mx - 17), [single]($my - 17), [single]34, [single]34)
}
$spokePen.Dispose()
$midBrush.Dispose()

# Outer vertex nodes.
$nodeShadow = New-Object System.Drawing.SolidBrush((Format-Color 200 8 15 30))
$nodeBrush = New-Object System.Drawing.SolidBrush((Format-Color 255 14 165 233))
$nodeRing = New-Object System.Drawing.Pen((Format-Color 255 186 230 253), [single]6.0)
foreach ($v in $vertices) {
    $g.FillEllipse($nodeShadow, [single]($v.X - 46), [single]($v.Y - 46), [single]92, [single]92)
    $g.FillEllipse($nodeBrush, [single]($v.X - 38), [single]($v.Y - 38), [single]76, [single]76)
    $g.DrawEllipse($nodeRing, [single]($v.X - 38), [single]($v.Y - 38), [single]76, [single]76)
}
$nodeShadow.Dispose()
$nodeBrush.Dispose()
$nodeRing.Dispose()

# Core node.
$coreGlow = New-Object System.Drawing.SolidBrush((Format-Color 70 34 211 238))
$g.FillEllipse($coreGlow, [single]($Center - 108), [single]($Center - 108), [single]216, [single]216)
$coreGlow.Dispose()
$coreBrush = New-Object System.Drawing.SolidBrush((Format-Color 255 224 242 254))
$coreRing = New-Object System.Drawing.Pen((Format-Color 255 34 211 238), [single]16.0)
$g.FillEllipse($coreBrush, [single]($Center - 62), [single]($Center - 62), [single]124, [single]124)
$g.DrawEllipse($coreRing, [single]($Center - 62), [single]($Center - 62), [single]124, [single]124)
$coreBrush.Dispose()
$coreRing.Dispose()

$hex.Dispose()
$innerHex.Dispose()
$plate.Dispose()
$g.Dispose()

# ---------------------------------------------------------------------------
# Down-sample to each icon size and pack a PNG-compressed ICO.
# ---------------------------------------------------------------------------
$iconSizes = @(16, 32, 48, 256)
$frames = @()
foreach ($size in $iconSizes) {
    $small = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $sg = [System.Drawing.Graphics]::FromImage($small)
    $sg.Clear([System.Drawing.Color]::Transparent)
    $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $sg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $sg.DrawImage($bitmap, $destRect, 0, 0, $bitmap.Width, $bitmap.Height, [System.Drawing.GraphicsUnit]::Pixel)
    $sg.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $small.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $frames += , @($size, $ms.ToArray())
    $small.Dispose()
    $ms.Dispose()
}

$outDir = Split-Path -Parent $OutputPath
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$stream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
$writer = New-Object System.IO.BinaryWriter($stream)
try {
    $writer.Write([uint16]0)                 # reserved
    $writer.Write([uint16]1)                 # type: icon
    $writer.Write([uint16]$frames.Count)     # image count
    $offset = 6 + 16 * $frames.Count
    foreach ($frame in $frames) {
        $size = [int]$frame[0]
        $data = [byte[]]$frame[1]
        $dim = if ($size -ge 256) { [byte]0 } else { [byte]$size }
        $writer.Write($dim)                  # width
        $writer.Write($dim)                  # height
        $writer.Write([byte]0)               # palette count
        $writer.Write([byte]0)               # reserved
        $writer.Write([uint16]1)             # colour planes
        $writer.Write([uint16]32)            # bits per pixel
        $writer.Write([uint32]$data.Length)  # bytes in resource
        $writer.Write([uint32]$offset)       # offset
        $offset += $data.Length
    }
    foreach ($frame in $frames) {
        $writer.Write([byte[]]$frame[1])
    }
} finally {
    $writer.Dispose()
    $stream.Dispose()
}

# Preview PNG (useful for reviewing the icon without opening the ICO).
if ($PreviewPath) {
    $previewDir = Split-Path -Parent $PreviewPath
    if ($previewDir -and -not (Test-Path -LiteralPath $previewDir)) {
        New-Item -ItemType Directory -Path $previewDir -Force | Out-Null
    }
    $previewSize = 512
    $preview = New-Object System.Drawing.Bitmap($previewSize, $previewSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $pg = [System.Drawing.Graphics]::FromImage($preview)
    $pg.Clear([System.Drawing.Color]::FromArgb(255, 7, 11, 20))
    $pg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $pg.DrawImage($bitmap, (New-Object System.Drawing.Rectangle(0, 0, $previewSize, $previewSize)), 0, 0, $bitmap.Width, $bitmap.Height, [System.Drawing.GraphicsUnit]::Pixel)
    $pg.Dispose()
    $preview.Save($PreviewPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $preview.Dispose()
}

$bitmap.Dispose()

Write-Host ("Icon written: {0} ({1:N0} bytes, sizes: {2})" -f $OutputPath, (Get-Item -LiteralPath $OutputPath).Length, ($iconSizes -join '/'))
if ($PreviewPath) { Write-Host "Preview written: $PreviewPath" }
