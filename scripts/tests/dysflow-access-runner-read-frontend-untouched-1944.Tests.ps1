#Requires -Modules Pester
#Requires -Version 5.1

# Issue #1944 — a read-only query tool must leave every .accdb byte-identical.
# The runner script runs end to end in a child process against the mock COM
# layer (DYSFLOW_MOCK_COM=1): no real Access or DAO engine is created. The mock
# records each database open with its read-only flag and appends a byte to any
# file it opens read-write, so a write-capable open of the frontend shows up as
# a changed hash, exactly as a real engine holding the file read-write may.

BeforeAll {
    $script:runnerPath = (Resolve-Path (Join-Path $PSScriptRoot '..\dysflow-access-runner.ps1')).Path
    $script:shellPath = (Get-Process -Id $PID).Path
    $script:fixtureRoots = @()

    function Get-Sha256 {
        param([string] $Path)
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try { return [System.BitConverter]::ToString($sha.ComputeHash([System.IO.File]::ReadAllBytes($Path))) }
        finally { $sha.Dispose() }
    }

    function New-ReadFixture {
        $root = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1944-" + [guid]::NewGuid().ToString('N'))
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
        }
    }

    function Invoke-RunnerRead {
        param($Fixture, [hashtable] $Payload)
        $saved = @{}
        foreach ($name in 'DYSFLOW_MOCK_COM', 'DYSFLOW_MOCK_OPEN_LOG', 'DYSFLOW_MOCK_SIMULATE_WRITES') {
            $saved[$name] = [Environment]::GetEnvironmentVariable($name)
        }
        try {
            $env:DYSFLOW_MOCK_COM = '1'
            $env:DYSFLOW_MOCK_OPEN_LOG = $Fixture.OpenLog
            $env:DYSFLOW_MOCK_SIMULATE_WRITES = '1'
            # An explicit command line quotes the JSON the same way on 5.1 and 7.
            $json = ($Payload | ConvertTo-Json -Compress).Replace('"', '\"')
            $startInfo = New-Object System.Diagnostics.ProcessStartInfo
            $startInfo.FileName = $script:shellPath
            $startInfo.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$($script:runnerPath)`" " +
                "-AccessDbPath `"$($Fixture.Frontend)`" -Operation query -PayloadJson `"$json`" -OperationId op-1944"
            $startInfo.UseShellExecute = $false
            $startInfo.RedirectStandardOutput = $true
            $startInfo.RedirectStandardError = $true
            $process = [System.Diagnostics.Process]::Start($startInfo)
            $stderrTask = $process.StandardError.ReadToEndAsync()
            $output = $process.StandardOutput.ReadToEnd() + "`n" + $stderrTask.Result
            $process.WaitForExit()
            $opens = @()
            if (Test-Path -LiteralPath $Fixture.OpenLog) {
                $opens = @(Get-Content -LiteralPath $Fixture.OpenLog | ForEach-Object {
                        $kind, $readOnly, $path = $_ -split '\|', 3
                        [pscustomobject]@{ Kind = $kind; ReadOnly = $readOnly -eq 'True'; Path = $path }
                    })
            }
            return [pscustomobject]@{ Output = (@($output) -join "`n"); Opens = $opens }
        } finally {
            foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
        }
    }
}

AfterAll {
    foreach ($root in $script:fixtureRoots) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
}

Describe 'Issue #1944 — read-only query tools leave every .accdb byte-identical' {
    It 'query_execute mode:read with a backend databasePath opens only the backend, read-only' {
        $fixture = New-ReadFixture
        $frontendHash = Get-Sha256 $fixture.Frontend
        $backendHash = Get-Sha256 $fixture.Backend

        $run = Invoke-RunnerRead -Fixture $fixture -Payload @{
            accessPath = $fixture.Frontend
            databasePath = $fixture.Backend
            target = 'backend'
            mode = 'read'
            sql = 'SELECT * FROM Clientes'
        }

        Get-Sha256 $fixture.Frontend | Should -Be $frontendHash
        Get-Sha256 $fixture.Backend | Should -Be $backendHash
        $run.Opens.Count | Should -Be 1 -Because $run.Output
        $run.Opens[0].Kind | Should -Be 'dao'
        $run.Opens[0].ReadOnly | Should -BeTrue
        $run.Opens[0].Path | Should -Be $fixture.Backend
    }

    It '<action> mode:read opens the frontend only read-only, never through Access' -ForEach @(
        @{ action = 'list_links' },
        @{ action = 'export_queries' }
    ) {
        $fixture = New-ReadFixture
        $frontendHash = Get-Sha256 $fixture.Frontend

        $run = Invoke-RunnerRead -Fixture $fixture -Payload @{
            action = $action
            mode = 'read'
            databasePath = $fixture.Frontend
        }

        Get-Sha256 $fixture.Frontend | Should -Be $frontendHash -Because $run.Output
        @($run.Opens | Where-Object { $_.Kind -eq 'access' }).Count | Should -Be 0
        @($run.Opens | Where-Object { -not $_.ReadOnly }).Count | Should -Be 0
        @($run.Opens | Where-Object { $_.Path -eq $fixture.Frontend }).Count | Should -Be 1
        $run.Output | Should -Match 'DYSFLOW_RESULT'
        $run.Output | Should -Not -Match '"ok":false'
    }

    It 'list_links returns the linked tables it read from the frontend' {
        $fixture = New-ReadFixture
        $mockData = @{
            TableDefs = @(
                @{ Name = 'TbLocal'; Connect = ''; Fields = @('ID') },
                @{ Name = 'TbAnexos'; Connect = ";DATABASE=$($fixture.Backend)"; Fields = @('ID') }
            )
            QueryDefs = @()
            Relations = @()
        }
        $fixturePath = Join-Path $fixture.Root 'mock.json'
        Set-Content -LiteralPath $fixturePath -Value ($mockData | ConvertTo-Json -Depth 5) -Encoding UTF8
        $savedFixture = $env:DYSFLOW_MOCK_FIXTURE_PATH
        try {
            $env:DYSFLOW_MOCK_FIXTURE_PATH = $fixturePath
            $run = Invoke-RunnerRead -Fixture $fixture -Payload @{
                action = 'list_links'
                mode = 'read'
                databasePath = $fixture.Frontend
            }
        } finally {
            $env:DYSFLOW_MOCK_FIXTURE_PATH = $savedFixture
        }

        $resultLine = ($run.Output -split "`n" | Where-Object { $_ -like 'DYSFLOW_RESULT *' } | Select-Object -Last 1)
        $result = ($resultLine -replace '^DYSFLOW_RESULT ', '') | ConvertFrom-Json
        @($result.links).Count | Should -Be 1 -Because $run.Output
        $result.links[0].name | Should -Be 'TbAnexos'
        $result.links[0].backendPath | Should -Be $fixture.Backend
    }

    It 'the write simulator does change the bytes of a database opened read-write' {
        # Guards the fake itself: without it, an unchanged hash would prove nothing.
        $fixture = New-ReadFixture
        $before = Get-Sha256 $fixture.Frontend
        $saved = $env:DYSFLOW_MOCK_SIMULATE_WRITES
        try {
            $env:DYSFLOW_MOCK_SIMULATE_WRITES = '1'
            . (Join-Path $PSScriptRoot '..\lib\dysflow-mock-com.ps1')
            Register-MockDatabaseOpen -Kind 'dao' -DatabasePath $fixture.Frontend -ReadOnly $false
        } finally {
            $env:DYSFLOW_MOCK_SIMULATE_WRITES = $saved
        }
        Get-Sha256 $fixture.Frontend | Should -Not -Be $before
    }
}
