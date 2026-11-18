param([switch]$NoBrowser)
$fleetRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $fleetRoot
$fleetNode = Get-Command node -ErrorAction SilentlyContinue
if (-not $fleetNode) {
    $fleetBundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $fleetBundledNode) { $fleetNode = Get-Item -LiteralPath $fleetBundledNode }
}
if (-not $fleetNode) {
    Write-Host 'O Node.js 24 precisa estar instalado para abrir o sistema local.'
    Read-Host 'Pressione Enter para fechar'
    exit 1
}
try { $fleetResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:4317/api/data' -TimeoutSec 2; $fleetRunning = $fleetResponse.StatusCode -eq 200 } catch { $fleetRunning = $false }
if (-not $fleetRunning) {
    $fleetExecutable = if ($fleetNode.Source) { $fleetNode.Source } else { $fleetNode.FullName }
    Start-Process -FilePath $fleetExecutable -ArgumentList 'scripts/preview.mjs' -WorkingDirectory $fleetRoot -WindowStyle Hidden
    for ($fleetAttempt = 0; $fleetAttempt -lt 30; $fleetAttempt++) {
        try { $fleetResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:4317/api/data' -TimeoutSec 1; if ($fleetResponse.StatusCode -eq 200) { $fleetRunning = $true; break } } catch {}
        Start-Sleep -Milliseconds 300
    }
}
if ($fleetRunning) {
    Write-Output 'Minha Frota pronta em http://127.0.0.1:4317'
    if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:4317' }
} else {
    Write-Host 'Nao foi possivel abrir o controle. Verifique se a porta 4317 esta livre.'
    if (-not $NoBrowser) { Read-Host 'Pressione Enter para fechar' }
    exit 1
}
