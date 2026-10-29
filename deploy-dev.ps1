# Push + deploy inmediato en el servidor de desarrollo, mostrando la salida.
# No es obligatorio: el servidor despliega solo cada vez que llega un push a main
# (salvatore-deploy.timer, ver deploy/). Esto sirve para no esperar al minuto y
# ver el resultado en la consola.
#
# Uso:  .\deploy-dev.ps1            push + deploy
#       .\deploy-dev.ps1 -Force     rebuild/reinicio aunque no haya commits nuevos
#       .\deploy-dev.ps1 -NoPush    no hace git push (solo actualiza el servidor)
#
# Requiere VPN conectada y la clave SSH autorizada en el servidor.
param([switch]$Force, [switch]$NoPush)

$Server = 'desarrollo@172.16.10.21'
Set-Location $PSScriptRoot

$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne 'main') {
    Write-Host "Estas en la rama '$branch'. El servidor sigue a main." -ForegroundColor Red
    exit 1
}

$pending = git status --porcelain
if ($pending) {
    Write-Host 'AVISO: hay cambios sin commitear; NO se van a desplegar:' -ForegroundColor Yellow
    $pending | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

if (-not $NoPush) {
    Write-Host '==> git push origin main' -ForegroundColor Cyan
    git push origin main
    if ($LASTEXITCODE -ne 0) { Write-Host 'git push fallo' -ForegroundColor Red; exit 1 }
}

$opts = if ($Force) { '--force' } else { '' }
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Write-Host "==> deploy en $Server" -ForegroundColor Cyan
ssh -o ConnectTimeout=10 $Server "bash ~/Salvatore/deploy/server-deploy.sh $opts"
if ($LASTEXITCODE -ne 0) { Write-Host 'Deploy fallo' -ForegroundColor Red; exit 1 }
Write-Host 'Deploy terminado' -ForegroundColor Green
