# Muestra una notificacion de Windows cuando el servidor de desarrollo termina un
# deploy (OK o FALLO). Lee ~/deploy/status del servidor por SSH. Lo ejecuta cada
# minuto la tarea programada "Salvatore deploy notify" (ver install-notify.ps1).
# Sin VPN no hace nada.
#
# Prueba manual:  .\deploy-notify.ps1 -Test
param([switch]$Test)

$Server = 'desarrollo@172.16.10.21'
$StateDir = Join-Path $env:LOCALAPPDATA 'SalvatoreDeploy'
$LastFile = Join-Path $StateDir 'last-id.txt'
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
$raw = ssh -o BatchMode=yes -o ConnectTimeout=5 $Server 'cat ~/deploy/status 2>/dev/null'
if ($LASTEXITCODE -ne 0 -or -not $raw) { exit 0 }

$s = @{}
foreach ($line in $raw) {
    $k, $v = $line -split '=', 2
    $s[$k] = $v
}

$last = if (Test-Path $LastFile) { (Get-Content $LastFile -Raw).Trim() } else { '' }
if ($s['id'] -eq $last) { exit 0 }
Set-Content $LastFile $s['id']
if (-not $last) { exit 0 }  # primera ejecucion: solo registra el deploy actual

if ($s['result'] -eq 'OK') {
    $title = "Deploy OK ($($s['trigger']))"
} else {
    $title = "Deploy FALLO ($($s['trigger']))"
}
Show-Toast $title @("$($s['commit']) $($s['subject'])", "$($s['time']) - $($s['message'])")
