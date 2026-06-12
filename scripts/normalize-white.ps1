# normalize-white.ps1 — автокалибровка белой точки кадра «техника на белом»
#
# Зачем: mix-blend-mode multiply смешивает картинку со страницей — фон кадра
# обязан быть честным (255,255,255), иначе виден прямоугольник-призрак.
# Как: сэмплируем рамку фона по краям кадра, по каждому каналу находим
# минимум фона, усиливаем каналы gain = 255/min через ColorMatrix (кламп
# до 255 встроен в GDI+). Предохранитель: gain > MaxGain — кадр бракуется,
# нормализация начала бы выжигать тень и светлые детали оправы.
#
# Применять ко ВСЕМ будущим кадрам техники, включая собственную съёмку.
#
# Пример:
#   .\scripts\normalize-white.ps1 -In orig.jpg -Out out.jpg -TargetWidth 2400
#   .\scripts\normalize-white.ps1 -In orig.jpg -Out out.jpg -CropRect 0.1,0.05,0.85,0.5

param(
    [Parameter(Mandatory)] [string]$In,
    [Parameter(Mandatory)] [string]$Out,
    [int]$TargetWidth = 0,          # 0 — не масштабировать
    [double[]]$CropRect = $null,    # x,y,w,h в долях кадра (0..1), до масштабирования
    [double]$MaxGain = 1.085,       # предохранитель выжигания
    [int]$Quality = 92,
    [switch]$VerifyOnly             # только сэмплирование, без записи
)

Add-Type -AssemblyName System.Drawing

# Сэмплирование рамки фона: полосы вдоль верхнего, нижнего и обоих боковых
# краёв. Каждый сэмпл — среднее 3x3 (гасим шум JPEG). Тень и задетые краем
# детали оправы отсекаются фильтром похожести на фон: канал не ниже
# (медиана канала − 30).
function Get-FrameStats([System.Drawing.Bitmap]$bmp) {
    $w = $bmp.Width; $h = $bmp.Height
    $samples = New-Object System.Collections.Generic.List[object]
    $step = 20

    $rows = @([int]($h*0.01), [int]($h*0.025), [int]($h*0.04),
              [int]($h*0.96), [int]($h*0.975), [int]($h*0.99))
    $cols = @([int]($w*0.01), [int]($w*0.025), [int]($w*0.04),
              [int]($w*0.96), [int]($w*0.975), [int]($w*0.99))

    foreach ($y in $rows) {
        for ($x = [int]($w*0.01); $x -lt [int]($w*0.99); $x += $step) {
            $samples.Add((Get-BoxMean $bmp $x $y))
        }
    }
    foreach ($x in $cols) {
        for ($y = [int]($h*0.01); $y -lt [int]($h*0.99); $y += $step) {
            $samples.Add((Get-BoxMean $bmp $x $y))
        }
    }

    $medR = Get-Median ($samples | ForEach-Object { $_.R })
    $medG = Get-Median ($samples | ForEach-Object { $_.G })
    $medB = Get-Median ($samples | ForEach-Object { $_.B })

    $bg = $samples | Where-Object {
        $_.R -ge ($medR - 30) -and $_.G -ge ($medG - 30) -and $_.B -ge ($medB - 30)
    }

    [pscustomobject]@{
        MinR = ($bg | Measure-Object R -Minimum).Minimum
        MinG = ($bg | Measure-Object G -Minimum).Minimum
        MinB = ($bg | Measure-Object B -Minimum).Minimum
        Total = $samples.Count
        Accepted = $bg.Count
    }
}

function Get-BoxMean([System.Drawing.Bitmap]$bmp, [int]$cx, [int]$cy) {
    $r = 0; $g = 0; $b = 0; $n = 0
    for ($dy = -1; $dy -le 1; $dy++) {
        for ($dx = -1; $dx -le 1; $dx++) {
            $x = $cx + $dx; $y = $cy + $dy
            if ($x -lt 0 -or $y -lt 0 -or $x -ge $bmp.Width -or $y -ge $bmp.Height) { continue }
            $p = $bmp.GetPixel($x, $y)
            $r += $p.R; $g += $p.G; $b += $p.B; $n++
        }
    }
    [pscustomobject]@{ R = $r/$n; G = $g/$n; B = $b/$n }
}

function Get-Median($values) {
    $sorted = $values | Sort-Object
    $sorted[[int]($sorted.Count/2)]
}

$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $In))

# Зона интереса (кроп или весь кадр)
if ($CropRect) {
    $cropPx = [System.Drawing.Rectangle]::new(
        [int]($CropRect[0]*$src.Width),  [int]($CropRect[1]*$src.Height),
        [int]($CropRect[2]*$src.Width),  [int]($CropRect[3]*$src.Height))
} else {
    $cropPx = [System.Drawing.Rectangle]::new(0, 0, $src.Width, $src.Height)
}

# Калибровка считается по зоне интереса — поэтому сначала вырезаем её
$roi = $src.Clone($cropPx, $src.PixelFormat)
$stats = Get-FrameStats $roi

$gainR = [math]::Round(255.0 / $stats.MinR, 4)
$gainG = [math]::Round(255.0 / $stats.MinG, 4)
$gainB = [math]::Round(255.0 / $stats.MinB, 4)

"IN: $In  roi=$($cropPx.Width)x$($cropPx.Height)  samples=$($stats.Accepted)/$($stats.Total)"
"  min(bg) R=$($stats.MinR.ToString('F1')) G=$($stats.MinG.ToString('F1')) B=$($stats.MinB.ToString('F1'))"
"  gain    R=$gainR G=$gainG B=$gainB  (MaxGain=$MaxGain)"

if ($VerifyOnly) { $roi.Dispose(); $src.Dispose(); exit 0 }

if ($gainR -gt $MaxGain -or $gainG -gt $MaxGain -or $gainB -gt $MaxGain) {
    "  БРАК: gain выше предохранителя — нормализация выжгла бы тень. Кадр отклонён."
    $roi.Dispose(); $src.Dispose(); exit 1
}

# Рендер: кроп + поканальное усиление + масштабирование одним проходом
$outW = if ($TargetWidth -gt 0 -and $TargetWidth -lt $cropPx.Width) { $TargetWidth } else { $cropPx.Width }
$outH = [int][math]::Round($cropPx.Height * ($outW / $cropPx.Width))

$cm = New-Object System.Drawing.Imaging.ColorMatrix
$cm.Matrix00 = $gainR; $cm.Matrix11 = $gainG; $cm.Matrix22 = $gainB
$attr = New-Object System.Drawing.Imaging.ImageAttributes
$attr.SetColorMatrix($cm)
$attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)

$dst = New-Object System.Drawing.Bitmap($outW, $outH)
$gfx = [System.Drawing.Graphics]::FromImage($dst)
$gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gfx.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$gfx.DrawImage($src, [System.Drawing.Rectangle]::new(0, 0, $outW, $outH),
    $cropPx.X, $cropPx.Y, $cropPx.Width, $cropPx.Height,
    [System.Drawing.GraphicsUnit]::Pixel, $attr)
$gfx.Dispose()

$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

$outPath = if ([System.IO.Path]::IsPathRooted($Out)) { $Out }
           else { Join-Path (Get-Location) $Out }
$dst.Save($outPath, $enc, $ep)
$dst.Dispose(); $roi.Dispose(); $src.Dispose()

# Верификация записанного файла: рамка обязана быть ≥254 по всем каналам
$check = [System.Drawing.Bitmap]::FromFile($outPath)
$vstats = Get-FrameStats $check
$check.Dispose()
$vMin = [math]::Min([math]::Min($vstats.MinR, $vstats.MinG), $vstats.MinB)
"OUT: $Out  ${outW}x${outH}  q=$Quality"
"  верификация: min(bg) R=$($vstats.MinR.ToString('F1')) G=$($vstats.MinG.ToString('F1')) B=$($vstats.MinB.ToString('F1'))"
if ($vMin -ge 254) { "  OK: рамка >=254 по всем каналам" }
else { "  ВНИМАНИЕ: рамка ниже 254 — фон не доведён до белого"; exit 2 }
