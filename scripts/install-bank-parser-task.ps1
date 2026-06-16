$ErrorActionPreference = "Stop"

$TaskName = "StreamingMayor BreB Parser"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$WorkerPath = Join-Path $ProjectRoot "scripts\bank-email-worker.py"
$LogDir = Join-Path $ProjectRoot "logs"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not (Test-Path $WorkerPath)) {
    throw "No existe el worker: $WorkerPath"
}

$PyCommand = Get-Command py -ErrorAction SilentlyContinue

if ($null -eq $PyCommand) {
    $PyCommand = Get-Command python -ErrorAction SilentlyContinue
}

if ($null -eq $PyCommand) {
    throw "No encontré py ni python en el PATH."
}

$PythonExe = $PyCommand.Source

Write-Host "Instalando tarea: $TaskName"
Write-Host "Proyecto: $ProjectRoot"
Write-Host "Python: $PythonExe"
Write-Host "Worker: $WorkerPath"

$Action = New-ScheduledTaskAction `
    -Execute $PythonExe `
    -Argument "`"$WorkerPath`"" `
    -WorkingDirectory "$ProjectRoot"

$Trigger = New-ScheduledTaskTrigger -AtLogOn

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 30)

try {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Description "Worker automático para leer pagos Bre-B / Llaves desde Gmail e insertarlos en Supabase." `
        -Force | Out-Null

    Write-Host ""
    Write-Host "Tarea instalada correctamente: $TaskName"
    Write-Host "Se ejecutará cuando inicies sesión en Windows."
    Write-Host ""
    Write-Host "Para iniciarla ahora:"
    Write-Host "Start-ScheduledTask -TaskName `"$TaskName`""
    Write-Host ""
    Write-Host "Para ver logs:"
    Write-Host "Get-Content `"$ProjectRoot\logs\bank-parser-worker.log`" -Tail 80 -Wait"
}
catch {
    Write-Host ""
    Write-Host "No se pudo instalar la tarea."
    Write-Host "Error:"
    Write-Host $_.Exception.Message
    Write-Host ""
    Write-Host "Solución alternativa: abre PowerShell como Administrador y vuelve a ejecutar:"
    Write-Host "powershell -ExecutionPolicy Bypass -File scripts\install-bank-parser-task.ps1"
    exit 1
}