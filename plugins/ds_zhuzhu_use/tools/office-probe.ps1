# office-probe.ps1 — 只看注册表里有没有 Office 的 COM ProgID，不启动 Office。
# 输出一行：word=1 excel=1 ppt=1 （1 表示可用，0 表示没装）
$ids = @{
    word  = @('Word.Application', 'KWPS.Application')
    excel = @('Excel.Application', 'KET.Application')
    ppt   = @('PowerPoint.Application', 'KWPP.Application')
}
$out = @()
foreach ($kind in @('word', 'excel', 'ppt')) {
    $found = 0
    foreach ($id in $ids[$kind]) {
        try {
            $t = [Type]::GetTypeFromProgID($id)
            if ($t -ne $null) { $found = 1; break }
        } catch {}
    }
    $out += ($kind + '=' + $found)
}
Write-Output ($out -join ' ')
