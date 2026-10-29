# Trae una copia de la base del servidor a la PC para probar codigo y migraciones
# con los datos actuales antes de hacer push. Despues aplica las migraciones
# locales que el servidor todavia no tiene (deploy/migrar.sh).
#
# La base local actual NO se borra: se renombra a <base>_anterior (reemplazando
# la _anterior previa). El dump descargado queda en $BackupDir.
#
# Uso:  .\traer-db.ps1                     reemplaza la base de api/.env (pide confirmacion)
#       .\traer-db.ps1 -Si                 sin confirmacion
#       .\traer-db.ps1 -SinMigrar          no aplica las migraciones locales
#       .\traer-db.ps1 -Base otra_base     restaura en otra base en vez de la de api/.env
param([switch]$Si, [switch]$SinMigrar, [string]$Base)

$Server = 'desarrollo@172.16.10.21'
$BackupDir = 'D:\Sistemas\Salvatore - Backups'
$KeepDumps = 5
$PgBin = 'D:\Archivos de programa\PostgreSQL\18\bin'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$GitBash = Join-Path (Split-Path (Split-Path (Get-Command git).Source)) 'bin\bash.exe'

function Fail([string]$msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Psql([string]$sql) {
    & "$PgBin\psql.exe" -X -q -At -v ON_ERROR_STOP=1 -d postgres -c $sql
    if ($LASTEXITCODE -ne 0) { Fail "psql: $sql" }
}

# Conexion local: la misma que usa la API (api/.env).
$cfg = @{}
Get-Content (Join-Path $Repo 'api\.env') | ForEach-Object {
    if ($_ -match '^\s*(DB_\w+)\s*=\s*(.*)$') { $cfg[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'") }
}
$env:PGHOST = $cfg['DB_HOST']
$env:PGPORT = if ($cfg['DB_PORT']) { $cfg['DB_PORT'] } else { '5432' }
$env:PGUSER = $cfg['DB_USER']
$env:PGPASSWORD = $cfg['DB_PASSWORD']
$env:PGCLIENTENCODING = 'UTF8'
$env:PGOPTIONS = '-c client_min_messages=warning'
$Db = if ($Base) { $Base } else { $cfg['DB_NAME'] }
$Old = "${Db}_anterior"
if ($Db -notmatch '^[a-z_][a-z0-9_]*$') { Fail "nombre de base invalido: $Db" }

Write-Host "Se va a reemplazar la base local '$Db' por una copia de la del servidor." -ForegroundColor Yellow
Write-Host "La actual queda como '$Old' (la '$Old' previa se borra). Conviene detener la API local." -ForegroundColor Yellow
if (-not $Si) {
    if ((Read-Host 'Continuar? (s/n)') -ne 's') { exit 1 }
}

New-Item -ItemType Directory -Force $BackupDir | Out-Null
$dump = Join-Path $BackupDir ("servidor-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmm'))

Write-Host '==> pg_dump en el servidor' -ForegroundColor Cyan
ssh -o ConnectTimeout=10 $Server 'cd ~/Salvatore && . deploy/db.sh && cargar_db ~/Salvatore && /usr/pgsql-17/bin/pg_dump -Fc -f ~/deploy/descarga.dump'
if ($LASTEXITCODE -ne 0) { Fail 'fallo el pg_dump en el servidor (VPN conectada?)' }

Write-Host "==> descarga a $dump" -ForegroundColor Cyan
scp -q "${Server}:deploy/descarga.dump" "$dump"
if ($LASTEXITCODE -ne 0) { Fail 'fallo la descarga' }
ssh $Server 'rm -f ~/deploy/descarga.dump'
Get-ChildItem $BackupDir -Filter 'servidor-*.dump' | Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $KeepDumps | Remove-Item

Write-Host "==> restauro en '$Db'" -ForegroundColor Cyan
Psql "drop database if exists $Old with (force)"
if (Psql "select 1 from pg_database where datname = '$Db'") {
    # La API local reconecta sola: se cortan las conexiones y se renombra enseguida.
    for ($i = 1; $i -le 5; $i++) {
        & "$PgBin\psql.exe" -X -q -At -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$Db' and pid <> pg_backend_pid()" | Out-Null
        & "$PgBin\psql.exe" -X -q -At -d postgres -c "alter database $Db rename to $Old"
        if ($LASTEXITCODE -eq 0) { break }
        if ($i -eq 5) { Fail "no se pudo renombrar '$Db' (detener la API local y reintentar)" }
        Start-Sleep 1
    }
}
Psql "create database $Db with template template0 encoding 'UTF8'"
& "$PgBin\pg_restore.exe" --no-owner --no-acl -d $Db "$dump"
if ($LASTEXITCODE -ne 0) { Write-Host 'AVISO: pg_restore termino con errores (ver arriba).' -ForegroundColor Yellow }

if (-not $SinMigrar) {
    Write-Host '==> migraciones locales pendientes' -ForegroundColor Cyan
    $env:DB_OVERRIDE = $Db
    & $GitBash (($Repo -replace '\\', '/') + '/deploy/migrar.sh')
    $rc = $LASTEXITCODE
    Remove-Item Env:DB_OVERRIDE
    if ($rc -ne 0) { Fail "fallo una migracion sobre la copia del servidor. Corregila antes de hacer push (la base '$Db' quedo con las anteriores aplicadas)." }
}

Write-Host ''
Write-Host "Listo: '$Db' es una copia del servidor de $(Get-Date -Format 'dd/MM/yyyy HH:mm')." -ForegroundColor Green
Write-Host "Para volver a la base anterior: drop database $Db; alter database $Old rename to $Db;"
