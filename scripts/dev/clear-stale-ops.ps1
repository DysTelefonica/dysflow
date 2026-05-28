$paths = @('C:\00repos', 'C:\Proyectos')
$found = Get-ChildItem -Path $paths -Recurse -Filter 'operations.json' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\.dysflow\\runtime\\' }

foreach ($f in $found) {
    Write-Host "Clearing: $($f.FullName)"
    '{"records":[]}' | Set-Content $f.FullName -Encoding UTF8
}

Write-Host "Done. Cleared $($found.Count) file(s)."
