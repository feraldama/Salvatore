# Registra la tarea programada que ejecuta deploy-notify.ps1 cada minuto, oculta
# (via wscript, para que no parpadee una consola). Idempotente.
# Desinstalar:  Unregister-ScheduledTask -TaskName 'Salvatore deploy notify' -Confirm:$false
$TaskName = 'Salvatore deploy notify'
$StateDir = Join-Path $env:LOCALAPPDATA 'SalvatoreDeploy'
$Script = Join-Path $PSScriptRoot 'deploy-notify.ps1'
$Vbs = Join-Path $StateDir 'deploy-notify.vbs'

New-Item -ItemType Directory -Force $StateDir | Out-Null
# En VBScript las comillas dentro de un string se duplican.
$cmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' + $Script + '""'
Set-Content $Vbs ('CreateObject("WScript.Shell").Run "' + $cmd + '", 0, False') -Encoding ASCII

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//B //Nologo ""$Vbs"""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Tarea '$TaskName' registrada (cada minuto)."
