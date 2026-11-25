#Requires -Modules Pester
#Requires -Version 5.1

# Issue #2017 — a query_execute write on the frontend must not depend on
# Microsoft Access. A frontend whose own startup blocks on a modal dialog left
# a hidden MSACCESS.EXE behind that dialog until RUNNER_TIMEOUT. The write only
# needs the DAO engine, so the runner opens the frontend with DAO and the
# frontend password, and never starts Access.Application for it.
#
# The runner script runs end to end in a child process against the mock COM
# layer (DYSFLOW_MOCK_COM=1). The mock records every Access spawn and every
# DAO open (with its connect string), so the test reads what the runner did
# to the databases, not how it is written.

BeforeAll {
    $script:runnerPath = (Resolve-Path (Join-Path $PSScriptRoot '..\dysflow-access-runner.ps1')).Path
    $script:shellPath = (Get-Process -Id $PID).Path
    $script:fixtureRoots = @()

    function New-WriteFixture {
        $root = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-2017-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $root | Out-Null
        $script:fixtureRoots += $root
        $frontend = Join-Path $root 'App.accdb'
        $backend = Join-Path $root 'App_Datos.accdb'
        [System.IO.File]::WriteAllBytes($frontend, [byte[]](1, 2, 3, 4))
        [System.IO.File]::WriteAllBytes($backend, [byte[]](5, 6, 7, 8))
        return [pscustomobject]@{
            Root = $root
            Frontend = $frontend
            Backend = $backend
            OpenLog = Join-Path $root 'opens.log'
            ConnectLog = Join-Path $root 'connects.log'
        }
    }

    function Invoke-RunnerWrite {
        param($Fixture, [hashtable] $Payload)
        $names = 'DYSFLOW_MOCK_COM', 'DYSFLOW_MOCK_OPEN_LOG', 'DYSFLOW_MOCK_CONNECT_LOG',
            'DYSFLOW_ACCESS_PASSWORD', 'ACCESS_VBA_PASSWORD', 'DYSFLOW_BACKEND_PASSWORD'
        $saved = @{}
        foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name) }
        try {
            $env:DYSFLOW_MOCK_COM = '1'
            $env:DYSFLOW_MOCK_OPEN_LOG = $Fixture.OpenLog
            $env:DYSFLOW_MOCK_CONNECT_LOG = $Fixture.ConnectLog
            $env:DYSFLOW_ACCESS_PASSWORD = 'fe-secret'
            $env:ACCESS_VBA_PASSWORD = $null
            $env:DYSFLOW_BACKEND_PASSWORD = 'be-secret'
            $json = ($Payload | ConvertTo-Json -Compress).Replace('"', '\"')
            $startInfo = New-Object System.Diagnostics.ProcessStartInfo
            $startInfo.FileName = $script:shellPath
            $startInfo.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$($script:runnerPath)`" " +
                "-AccessDbPath `"$($Fixture.Frontend)`" -Operation query -PayloadJson `"$json`" -OperationId op-2017"
            $startInfo.UseShellExecute = $false
            $startInfo.RedirectStandardOutput = $true
            $startInfo.RedirectStandardError = $true
            $process = [System.Diagnostics.Process]::Start($startInfo)
            $stderrTask = $process.StandardError.ReadToEndAsync()
            $stdout = $process.StandardOutput.ReadToEnd()
            $stderr = $stderrTask.Result
            $process.WaitForExit()
            $opens = @()
            if (Test-Path -LiteralPath $Fixture.OpenLog) {
                $opens = @(Get-Content -LiteralPath $Fixture.OpenLog | ForEach-Object {
                        $kind, $readOnly, $path = $_ -split '\|', 3
                        [pscustomobject]@{ Kind = $kind; ReadOnly = $readOnly -eq 'True'; Path = $path }
                    })
            }
            $connects = @()
            if (Test-Path -LiteralPath $Fixture.ConnectLog) {
                $connects = @(Get-Content -LiteralPath $Fixture.ConnectLog | ForEach-Object {
                        $path, $connect = $_ -split '\|', 2
                        [pscustomobject]@{ Path = $path; Connect = $connect }
                    })
            }
            $resultLine = $stdout -split "`r?`n" | Where-Object { $_ -like 'DYSFLOW_RESULT *' } | Select-Object -Last 1
            $result = $null
            if ($resultLine) { $result = ($resultLine -replace '^DYSFLOW_RESULT ', '') | ConvertFrom-Json }
            return [pscustomobject]@{
                ExitCode = $process.ExitCode
                Output = "$stdout`n$stderr"
                Stderr = $stderr
                Result = $result
                Opens = $opens
                Connects = $connects
            }
        } finally {
            foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
        }
    }
}

AfterAll {
    foreach ($root in $script:fixtureRoots) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
}

Describe 'Issue #2017 — query_execute writes on the frontend never start Access' {
    It 'an applied frontend write runs through DAO with the frontend password and starts no Access' {
        $fixture = New-WriteFixture

        $run = Invoke-RunnerWrite -Fixture $fixture -Payload @{
            sql = "UPDATE TbConfiguracionBackends SET RutaDirectorioAplicacion_LOCAL = 'C:\App' WHERE Id = 1"
            mode = 'write'
            dryRun = $false
            databasePath = $fixture.Frontend
        }

        $run.ExitCode | Should -Be 0 -Because $run.Output
        $run.Result.affectedRows | Should -Be 1
        @($run.Opens | Where-Object { $_.Kind -like 'access*' }).Count | Should -Be 0 -Because 'a frontend write must not depend on Access starting'
        $run.Stderr | Should -Not -Match 'DYSFLOW_ACCESS_PROCESS'
        @($run.Opens | Where-Object { $_.Kind -eq 'dao' -and $_.Path -eq $fixture.Frontend -and -not $_.ReadOnly }).Count | Should -Be 1
        @($run.Connects | Where-Object { $_.Path -eq $fixture.Frontend }).Connect | Should -Be ';PWD=fe-secret'
        $run.Output | Should -Not -Match 'be-secret'
    }

    It 'the frontend is matched by its full path, whatever the case of the configured path' {
        $fixture = New-WriteFixture

        $run = Invoke-RunnerWrite -Fixture $fixture -Payload @{
            sql = 'DELETE FROM TbLocal WHERE Id = 1'
            mode = 'write'
            dryRun = $false
            databasePath = $fixture.Frontend.ToUpperInvariant()
        }

        $run.ExitCode | Should -Be 0 -Because $run.Output
        @($run.Opens | Where-Object { $_.Kind -like 'access*' }).Count | Should -Be 0
        @($run.Connects).Connect | Should -Be ';PWD=fe-secret'
    }

    It 'an applied write that names no database runs on the frontend with the frontend password' {
        $fixture = New-WriteFixture

        $run = Invoke-RunnerWrite -Fixture $fixture -Payload @{
            sql = 'DELETE FROM TbLocal WHERE Id = 1'
            mode = 'write'
            dryRun = $false
        }

        $run.ExitCode | Should -Be 0 -Because $run.Output
        @($run.Opens | Where-Object { $_.Kind -like 'access*' }).Count | Should -Be 0
        @($run.Connects | Where-Object { $_.Path -eq $fixture.Frontend }).Connect | Should -Be ';PWD=fe-secret'
    }

    It 'an applied backend write keeps opening the backend with the backend password' {
        $fixture = New-WriteFixture

        $run = Invoke-RunnerWrite -Fixture $fixture -Payload @{
            sql = "UPDATE Clientes SET Nombre = 'x' WHERE ID = 1"
            mode = 'write'
            dryRun = $false
            databasePath = $fixture.Backend
        }

        $run.ExitCode | Should -Be 0 -Because $run.Output
        $run.Result.affectedRows | Should -Be 1
        @($run.Opens | Where-Object { $_.Kind -eq 'access' }).Count | Should -Be 0 -Because 'a direct backend write never opens the frontend in Access'
        @($run.Opens | Where-Object { $_.Kind -eq 'dao' -and $_.Path -eq $fixture.Frontend }).Count | Should -Be 0
        @($run.Connects | Where-Object { $_.Path -eq $fixture.Backend }).Connect | Should -Be ';PWD=be-secret'
    }
}
