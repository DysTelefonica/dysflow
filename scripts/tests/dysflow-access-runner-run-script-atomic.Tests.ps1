#requires -Version 5.1

$runnerPath = Join-Path $PSScriptRoot '..\dysflow-access-runner.ps1'
$tokens = $null
$parseErrors = $null
$runnerAst = [System.Management.Automation.Language.Parser]::ParseFile(
    $runnerPath,
    [ref] $tokens,
    [ref] $parseErrors
)
if ($parseErrors.Count -gt 0) {
    throw "Unable to parse production runner: $($parseErrors[0].Message)"
}

function Import-RunnerFunction {
    param(
        [Parameter(Mandatory = $true)] [string] $Name,
        [Parameter(Mandatory = $false)] [bool] $Required = $true
    )
    $functionAst = $runnerAst.Find(
        {
            param($node)
            $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                $node.Name -eq $Name
        },
        $true
    )
    if ($null -eq $functionAst) {
        if ($Required) { throw "Production function $Name was not found." }
        return $false
    }
    $definition = $functionAst.Extent.Text -replace
        "^function\s+$([regex]::Escape($Name))",
        "function script:$Name"
    Invoke-Expression $definition
    return $true
}

[void](Import-RunnerFunction -Name 'Resolve-SandboxedPath')
[void](Import-RunnerFunction -Name 'Split-SqlStatements')
[void](Import-RunnerFunction -Name 'Invoke-WriteAction')

# RED compatibility only: before the production seam exists, route through the
# current production branch so the tests fail on observable transaction behavior
# rather than failing during discovery. Once added, the real function replaces it.
if (-not (Import-RunnerFunction -Name 'Invoke-RunScriptAction' -Required $false)) {
    function script:Invoke-RunScriptAction {
        param($Database, $TransactionWorkspace, $Payload)
        return Invoke-WriteAction -Database $Database -Action 'run_script' -Payload $Payload
    }
}

function script:New-FakeDatabase {
    param(
        [string[]] $InitialRows = @(),
        [bool] $Transactions = $true
    )
    $database = [PSCustomObject]@{
        Transactions = $Transactions
        Rows = [System.Collections.ArrayList]::new()
        Executed = [System.Collections.ArrayList]::new()
    }
    foreach ($row in $InitialRows) { [void]$database.Rows.Add($row) }
    $database | Add-Member -MemberType ScriptMethod -Name Execute -Value {
        param([string] $Sql, [int] $Options)
        [void]$this.Executed.Add($Sql)
        if ($Sql -match '^INSERT\s+(.+)$') {
            [void]$this.Rows.Add($Matches[1])
            return
        }
        if ($Sql -match '^FAIL\b') {
            throw "DAO rejected sensitive SQL: $Sql"
        }
    }
    return $database
}

function script:New-FakeWorkspace {
    param(
        [Parameter(Mandatory = $true)] $Database,
        [bool] $RollbackFails = $false
    )
    $workspace = [PSCustomObject]@{
        Database = $Database
        BeginCount = 0
        CommitCount = 0
        RollbackCount = 0
        RollbackFails = $RollbackFails
        Snapshot = @()
    }
    $workspace | Add-Member -MemberType ScriptMethod -Name BeginTrans -Value {
        $this.BeginCount++
        $this.Snapshot = @($this.Database.Rows)
    }
    $workspace | Add-Member -MemberType ScriptMethod -Name CommitTrans -Value {
        $this.CommitCount++
    }
    $workspace | Add-Member -MemberType ScriptMethod -Name Rollback -Value {
        $this.RollbackCount++
        if ($this.RollbackFails) { throw 'simulated rollback failure' }
        $this.Database.Rows.Clear()
        foreach ($row in $this.Snapshot) { [void]$this.Database.Rows.Add($row) }
    }
    return $workspace
}

function script:Invoke-TestRunScript {
    param(
        [Parameter(Mandatory = $true)] [string] $Sql,
        [Parameter(Mandatory = $true)] [bool] $DryRun,
        [Parameter(Mandatory = $true)] $Database,
        [Parameter(Mandatory = $false)] $Workspace
    )
    $scriptPath = Join-Path $script:TestRoot 'script.sql'
    Set-Content -LiteralPath $scriptPath -Value $Sql -NoNewline
    $payload = [PSCustomObject]@{
        scriptPath = $scriptPath
        rootPath = $script:TestRoot
        dryRun = $DryRun
    }
    return Invoke-RunScriptAction `
        -Database $Database `
        -TransactionWorkspace $Workspace `
        -Payload $payload
}

Describe 'run_script atomic transaction contract (#1455)' {
    BeforeEach {
        $script:TestRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1455-" + [guid]::NewGuid().ToString('N'))
        [void](New-Item -ItemType Directory -Path $script:TestRoot)
    }
    AfterEach {
        Remove-Item -LiteralPath $script:TestRoot -Recurse -Force
    }
    It 'previews every statement and count without opening a transaction or mutating data' {
        $database = New-FakeDatabase -InitialRows @('seed')
        $workspace = New-FakeWorkspace -Database $database
        $result = Invoke-TestRunScript -Sql 'INSERT first; INSERT second' -DryRun $true -Database $database -Workspace $workspace
        $result.dryRun | Should -BeTrue
        $result.statementCount | Should -Be 2
        $result.transactional | Should -BeFalse
        @($database.Rows) | Should -Be @('seed')
        @($database.Executed).Count | Should -Be 0
        $workspace.BeginCount | Should -Be 0
    }
    It 'commits all statements as one owned transaction on success' {
        $database = New-FakeDatabase -InitialRows @('seed')
        $workspace = New-FakeWorkspace -Database $database
        $result = Invoke-TestRunScript -Sql 'INSERT first; INSERT second' -DryRun $false -Database $database -Workspace $workspace
        @($database.Rows) | Should -Be @('seed', 'first', 'second')
        $result.statementCount | Should -Be 2
        $result.transactional | Should -BeTrue
        $workspace.BeginCount | Should -Be 1
        $workspace.CommitCount | Should -Be 1
        $workspace.RollbackCount | Should -Be 0
    }
    It 'rolls back earlier writes when a later statement fails and identifies only its position' {
        $database = New-FakeDatabase -InitialRows @('seed')
        $workspace = New-FakeWorkspace -Database $database
        $message = $null
        try {
            Invoke-TestRunScript -Sql 'INSERT first; FAIL SECRET_customer_email; INSERT third' -DryRun $false -Database $database -Workspace $workspace
        } catch {
            $message = $_.Exception.Message
        }
        $message | Should -Match 'statement 2 of 3'
        $message | Should -Not -Match 'SECRET_customer_email'
        $message | Should -Match 'rolled back'
        @($database.Rows) | Should -Be @('seed')
        $workspace.CommitCount | Should -Be 0
        $workspace.RollbackCount | Should -Be 1
    }
    It 'reports rollback failure without leaking the failed SQL or claiming atomicity' {
        $database = New-FakeDatabase -InitialRows @('seed')
        $workspace = New-FakeWorkspace -Database $database -RollbackFails $true
        $message = $null
        try {
            Invoke-TestRunScript -Sql 'INSERT first; FAIL SECRET_customer_email; INSERT third' -DryRun $false -Database $database -Workspace $workspace
        } catch {
            $message = $_.Exception.Message
        }
        $message | Should -Match 'rollback failed'
        $message | Should -Match 'statement 2 of 3'
        $message | Should -Match 'atomicity could not be confirmed'
        $message | Should -Not -Match 'SECRET_customer_email'
        $workspace.CommitCount | Should -Be 0
        $workspace.RollbackCount | Should -Be 1
    }
    It 'runs read-only statements inside the same bounded transaction without changing data' {
        $database = New-FakeDatabase -InitialRows @('seed')
        $workspace = New-FakeWorkspace -Database $database
        $result = Invoke-TestRunScript -Sql 'SELECT first; SELECT second' -DryRun $false -Database $database -Workspace $workspace
        @($database.Rows) | Should -Be @('seed')
        $result.statementCount | Should -Be 2
        $workspace.BeginCount | Should -Be 1
        $workspace.CommitCount | Should -Be 1
        $workspace.RollbackCount | Should -Be 0
    }
    It 'fails closed before execution when the database cannot guarantee transactions' {
        $database = New-FakeDatabase -InitialRows @('seed') -Transactions $false
        $workspace = New-FakeWorkspace -Database $database
        { Invoke-TestRunScript -Sql 'INSERT first; INSERT second' -DryRun $false -Database $database -Workspace $workspace } |
            Should -Throw '*does not support transactions*'
        @($database.Rows) | Should -Be @('seed')
        @($database.Executed).Count | Should -Be 0
        $workspace.BeginCount | Should -Be 0
    }
}
