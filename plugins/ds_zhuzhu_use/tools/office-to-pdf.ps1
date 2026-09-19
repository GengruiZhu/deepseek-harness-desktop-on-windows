# office-to-pdf.ps1 — 用本机 Office 的 COM 接口把 Office 文档渲染成 PDF。
# 这样字体/版式/列宽/图表都是 Office 自己算的，而不是我们拿 XML 拼出来的近似。
# 用法: pwsh -File office-to-pdf.ps1 -In <src> -Out <pdf> -Kind word|excel|ppt
param(
    [Parameter(Mandatory = $true)][string]$In,
    [Parameter(Mandatory = $true)][string]$Out,
    [Parameter(Mandatory = $true)][ValidateSet('word', 'excel', 'ppt')][string]$Kind
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Invoke-WithCom([string[]]$progIds, [scriptblock]$body) {
    foreach ($id in $progIds) {
        $app = $null
        try { $app = New-Object -ComObject $id } catch { continue }
        try {
            & $body $app
            return $true
        } catch {
            Write-Error ("$id 失败: " + $_.Exception.Message.Split("`n")[0])
        } finally {
            try { $app.Quit() } catch {}
            try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) } catch {}
        }
    }
    return $false
}

$ok = $false
switch ($Kind) {
    'word' {
        # 17 = wdExportFormatPDF
        $ok = Invoke-WithCom @('Word.Application', 'KWPS.Application') {
            param($app)
            $app.Visible = $false
            $app.DisplayAlerts = 0
            $doc = $app.Documents.Open($In, $false, $true)
            try { $doc.ExportAsFixedFormat($Out, 17) } finally { $doc.Close(0) }
        }
    }
    'excel' {
        # 0 = xlTypePDF；导出前把所有列收进一页宽，否则打印版式会把字裁掉
        $ok = Invoke-WithCom @('Excel.Application', 'KET.Application') {
            param($app)
            $app.Visible = $false
            $app.DisplayAlerts = $false
            $wb = $app.Workbooks.Open($In, 0, $true)
            try {
                foreach ($ws in $wb.Worksheets) {
                    try {
                        $ws.PageSetup.Zoom = $false
                        $ws.PageSetup.FitToPagesWide = 1
                        $ws.PageSetup.FitToPagesTall = $false
                        $ws.PageSetup.Orientation = 2   # 横向，宽表更合适
                    } catch {}
                }
                $wb.ExportAsFixedFormat(0, $Out)
            } finally { $wb.Close($false) }
        }
    }
    'ppt' {
        # 32 = ppSaveAsPDF
        $ok = Invoke-WithCom @('PowerPoint.Application', 'KWPP.Application') {
            param($app)
            $pres = $app.Presentations.Open($In, $true, $false, $false)
            try { $pres.SaveAs($Out, 32) } finally { $pres.Close() }
        }
    }
}

if (-not $ok) { Write-Error '没有可用的 Office（未安装、或文件被占用/受保护）'; exit 1 }
if (-not (Test-Path -LiteralPath $Out)) { Write-Error '转换结束但没有生成 PDF'; exit 2 }
$size = (Get-Item -LiteralPath $Out).Length
if ($size -lt 1000) { Write-Error ('生成的 PDF 异常小: ' + $size + ' 字节'); exit 3 }
Write-Output ('OK ' + $size)
