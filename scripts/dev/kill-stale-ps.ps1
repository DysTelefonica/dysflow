$stale = Get-Process powershell, pwsh -ErrorAction SilentlyContinue |
    Where-Object { (Get-Date) - $_.StartTime -gt [TimeSpan]::FromMinutes(5) }

Write-Host "Found $($stale.Count) old PowerShell process(es):"
$stale | Select-Object Id, StartTime, CPU | Format-Table -AutoSize

foreach ($p in $stale) {
    Write-Host "Killing PID $($p.Id) (started $($p.StartTime))"
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}
Write-Host "Done."
