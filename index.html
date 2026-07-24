$ErrorActionPreference = "Stop"

$repository = "F:\acomp"
$logDirectory = Join-Path $env:LOCALAPPDATA "PainelFaetec"
$logPath = Join-Path $logDirectory "atualizador.log"
$lockPath = Join-Path $env:TEMP "painel-faetec-atualizador.lock"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

if (Test-Path -LiteralPath $lockPath) {
  $lockAge = (Get-Date) - (Get-Item -LiteralPath $lockPath).LastWriteTime
  if ($lockAge.TotalMinutes -lt 10) {
    exit 0
  }
  Remove-Item -LiteralPath $lockPath -Force
}

New-Item -ItemType File -Path $lockPath -Force | Out-Null

try {
  Set-Location -LiteralPath $repository
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format s) - Iniciando consulta."

  & node "scripts\update-process-v2.mjs" 2>&1 |
    ForEach-Object { Add-Content -LiteralPath $logPath -Value $_ }

  if ($LASTEXITCODE -ne 0) {
    throw "A consulta terminou com código $LASTEXITCODE."
  }

  $dataChanged = git status --porcelain -- "data/processo.json"
  if (-not $dataChanged) {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format s) - Nenhuma novidade."
    exit 0
  }

  git add -- "data/processo.json"
  git commit -m "Atualiza andamento do processo SEI"
  git push origin main

  if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível publicar a atualização."
  }

  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format s) - Atualização publicada."
} catch {
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format s) - Erro: $($_.Exception.Message)"
  exit 1
} finally {
  Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
}
