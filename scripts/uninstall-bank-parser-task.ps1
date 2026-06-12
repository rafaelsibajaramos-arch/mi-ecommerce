param(
    [string]$TaskName = "StreamingMayor BreB Parser"
)

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($null -eq $task) {
    Write-Host "No existe la tarea: $TaskName" -ForegroundColor Yellow
    exit 0
}

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Tarea eliminada: $TaskName" -ForegroundColor Green
