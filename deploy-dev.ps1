# Despliega main en el servidor de desarrollo (AlmaLinux) por SSH.
#   1. git push origin main (local)
#   2. en el servidor: git pull, pnpm install si cambiaron dependencias,
#      build del client (sin dejar el sitio caido) y reinicio de la API via nodemon.
#
# Uso:  .\deploy-dev.ps1            deploy normal
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

$remote = @'
set -e
source ~/.nvm/nvm.sh >/dev/null 2>&1 || true
cd ~/Salvatore

echo "==> git pull (servidor)"
git fetch -q origin
# Cambios locales en el servidor: si ya son identicos a origin/main se descartan,
# si no, se aborta para no pisar nada.
DIRTY=""
for f in $(git diff --name-only); do
  if git show "origin/main:$f" 2>/dev/null | cmp -s - "$f"; then
    git checkout -q -- "$f"
  else
    echo "ERROR: cambio local sin commitear en el servidor: $f"; DIRTY=1
  fi
done
[ -n "$DIRTY" ] && exit 1

OLD=$(git rev-parse HEAD)
git merge -q --ff-only origin/main
NEW=$(git rev-parse HEAD)

if [ "$OLD" = "$NEW" ] && [ "$FORCE" != "1" ]; then
  echo "El servidor ya esta en $(git log --oneline -1). Nada que desplegar (usar -Force para rebuild)."
  exit 0
fi

if [ "$FORCE" = "1" ]; then
  CHANGED=$(printf 'api/\nclient/\n')
else
  CHANGED=$(git diff --name-only "$OLD" "$NEW")
  echo "Commits nuevos:"; git log --oneline "$OLD..$NEW" | sed 's/^/  /'
fi

if echo "$CHANGED" | grep -q '^client/'; then
  cd ~/Salvatore/client
  if echo "$CHANGED" | grep -qE '^client/(package\.json|pnpm-lock\.yaml)$'; then
    echo "==> pnpm install (client)"; pnpm install --frozen-lockfile
  fi
  echo "==> build client"
  pnpm exec tsc -b
  # Se compila en otra carpeta y se intercambia al final: vite preview sigue
  # sirviendo la version anterior durante el build (y si el build falla).
  pnpm exec vite build --outDir dist_new --emptyOutDir
  rm -rf dist_old && mv dist dist_old && mv dist_new dist && rm -rf dist_old
fi

if echo "$CHANGED" | grep -q '^api/'; then
  cd ~/Salvatore/api
  if echo "$CHANGED" | grep -qE '^api/(package\.json|pnpm-lock\.yaml)$'; then
    echo "==> pnpm install (api)"; pnpm install --frozen-lockfile
  fi
  echo "==> reinicio API (nodemon)"
  touch index.js
  sleep 5
  if ss -ltn | grep -q ':3023 '; then echo "API escuchando en :3023"; else echo "ERROR: la API no esta escuchando en :3023"; exit 1; fi
fi

if [ "$FORCE" != "1" ]; then
  MIG=$(git diff --name-only --diff-filter=A "$OLD" "$NEW" -- api/migrations)
  if [ -n "$MIG" ]; then
    echo ""
    echo "ATENCION: migraciones nuevas (NO se aplican solas, correrlas a mano):"
    echo "$MIG" | sed 's/^/  /'
  fi
fi

echo ""
echo "OK: servidor en $(cd ~/Salvatore && git log --oneline -1)"
'@

$f = if ($Force) { '1' } else { '0' }
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($remote -replace "`r`n", "`n")))
Write-Host "==> deploy en $Server" -ForegroundColor Cyan
ssh -o ConnectTimeout=10 $Server "echo $b64 | base64 -d | FORCE=$f bash"
if ($LASTEXITCODE -ne 0) { Write-Host 'Deploy fallo' -ForegroundColor Red; exit 1 }
Write-Host 'Deploy terminado' -ForegroundColor Green
