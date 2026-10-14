$ErrorActionPreference = 'Stop'
$anotaRoot = Split-Path -Parent $PSScriptRoot
$anotaNode = (Get-Command node -ErrorAction Stop).Source
$anotaNext = Join-Path $anotaRoot 'node_modules\next\dist\bin\next'
if (-not (Test-Path -LiteralPath $anotaNext)) { throw 'Instale as dependências com pnpm install antes de iniciar.' }
$anotaLogs = Join-Path $anotaRoot '.data'
New-Item -ItemType Directory -Path $anotaLogs -Force | Out-Null
Start-Process -FilePath $anotaNode -ArgumentList @('"' + $anotaNext + '"', 'dev', '--webpack', '--port', '3100') -WorkingDirectory $anotaRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $anotaLogs 'dev.stdout.log') -RedirectStandardError (Join-Path $anotaLogs 'dev.stderr.log')
Write-Output 'Anota Aí iniciando: http://localhost:3100'
