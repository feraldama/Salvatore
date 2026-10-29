# Vigila el servidor de desarrollo desde la PC. Lo ejecuta cada minuto la tarea
# programada "Salvatore deploy notify" (ver install-notify.ps1). Sin VPN no hace nada.
#   - Notifica cada deploy nuevo (OK o FALLO), leyendo ~/deploy/status.
#   - Notifica si la API o el client dejan de responder (2 chequeos seguidos) y
#     cuando vuelven.
#   - Avisa si el servidor lleva mas de 26 h sin backup diario. Los backups no se
#     copian a la PC: la base se trae solo al ir a hacer cambios (traer-db.ps1).
#
# Prueba manual:  .\deploy-notify.ps1 -Test
param([switch]$Test)

$Server = 'desarrollo@172.16.10.21'
$StateDir = Join-Path $env:LOCALAPPDATA 'SalvatoreDeploy'
$LastFile = Join-Path $StateDir 'last-id.txt'
$HealthFile = Join-Path $StateDir 'health-fails.txt'
$BackupAlertFile = Join-Path $StateDir 'backup-alert.txt'
# AppID de Windows PowerShell: ya registrado en el sistema, sirve para mostrar toasts.
$AppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'

function Show-Toast([string]$Title, [string[]]$Lines) {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    $texts = ($Lines | Where-Object { $_ } | ForEach-Object { "<text>$([Security.SecurityElement]::Escape($_))</text>" }) -join ''
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml("<toast><visual><binding template=`"ToastGeneric`"><text>$([Security.SecurityElement]::Escape($Title))</text>$texts</binding></visual></toast>")
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
}

if ($Test) {
    Show-Toast 'Salvatore: prueba de notificacion' @('Si ves esto, las notificaciones de deploy funcionan.')
    exit 0
}

New-Item -ItemType Directory -Force $StateDir | Out-Null
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$remote = 'cat ~/deploy/status 2>/dev/null; ' +
    'echo h_api=$(curl -s -o /dev/null -m 5 -w %{http_code} localhost:3023/); ' +
    'echo h_client=$(curl -s -o /dev/null -m 5 -w %{http_code} localhost:3024/); ' +
    'b=$(ls -1t ~/deploy/backups/diarios/*.dump 2>/dev/null | head -1); ' +
    'echo b_file=$b; echo b_mtime=$(stat -c %Y $b 2>/dev/null)'
# (sin comillas dobles: PowerShell 5.1 las elimina al pasar argumentos a ssh)
$raw = ssh -o BatchMode=yes -o ConnectTimeout=5 $Server $remote
if ($LASTEXITCODE -ne 0 -or -not $raw) { exit 0 }

$s = @{}
foreach ($line in $raw) {
    $k, $v = $line -split '=', 2
    $s[$k] = $v
}

# --- deploys ------------------------------------------------------------------
if ($s['id']) {
    $last = if (Test-Path $LastFile) { (Get-Content $LastFile -Raw).Trim() } else { '' }
    if ($s['id'] -ne $last) {
        Set-Content $LastFile $s['id']
        if ($last) {  # en la primera ejecucion solo se registra el deploy actual
            $result = if ($s['result'] -eq 'OK') { 'OK' } else { 'FALLO' }
            Show-Toast "Deploy $result ($($s['trigger']))" @("$($s['commit']) $($s['subject'])", "$($s['time']) - $($s['message'])")
        }
    }
}

# --- salud de los servicios ---------------------------------------------------
# Un deploy reinicia la API unos segundos: se avisa recien al segundo chequeo fallido.
$down = @()
if ($s['h_api'] -ne '200') { $down += "API (:3023) responde $($s['h_api'])" }
if ($s['h_client'] -ne '200') { $down += "Client (:3024) responde $($s['h_client'])" }
$fails = [int](Get-Content $HealthFile -ErrorAction SilentlyContinue)
if ($down) {
    $fails++
    Set-Content $HealthFile $fails
    if ($fails -eq 2) {
        Show-Toast 'Servidor: servicio caido' ($down + 'Logs: journalctl _SYSTEMD_USER_UNIT=salvatore-api.service')
    }
} elseif ($fails) {
    if ($fails -ge 2) { Show-Toast 'Servidor recuperado' @('La API y el client vuelven a responder.') }
    Set-Content $HealthFile 0
}

# --- backups ------------------------------------------------------------------
$age = if ($s['b_mtime']) { [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - [int64]$s['b_mtime'] } else { [int64]::MaxValue }
if ($age -gt 26 * 3600) {
    $today = Get-Date -Format 'yyyy-MM-dd'
    if ((Get-Content $BackupAlertFile -ErrorAction SilentlyContinue) -ne $today) {
        Set-Content $BackupAlertFile $today
        $detail = if ($s['b_file']) { "El ultimo backup diario es de hace $([int]($age / 3600)) h." } else { 'No hay backups diarios en el servidor.' }
        Show-Toast 'Servidor: backup atrasado' @($detail, 'Ver: systemctl --user status salvatore-backup')
    }
}
