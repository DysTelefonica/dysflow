$ErrorActionPreference = 'Stop'

Describe 'relink-directory thin PowerShell transport' {
    BeforeAll {
        $script:ModulePath = Join-Path $PSScriptRoot '..\lib\dysflow-relink-directory-transport.psm1'
        Import-Module $script:ModulePath -Force
    }

    It 'executes only the file order and apply plans returned by the core' {
        $script:events = [System.Collections.Generic.List[string]]::new()
        $script:inspected = [System.Collections.Generic.List[string]]::new()
        $script:applied = [System.Collections.Generic.List[string]]::new()

        $core = {
            param($Event, $Payload)
            $script:events.Add($Event)
            if ($Event -eq 'start') {
                return [pscustomobject]@{
                    kind = 'inspect'
                    state = [pscustomobject]@{ token = 'state-1' }
                    files = @('C:\root\b.accdb', 'C:\root\a.accdb')
                }
            }
            if ($Event -eq 'inspections-completed') {
                return [pscustomobject]@{
                    kind = 'apply'
                    state = [pscustomobject]@{ token = 'state-2' }
                    continueOnError = $true
                    plans = @(
                        [pscustomobject]@{ filePath = 'C:\root\b.accdb'; createBackup = $true; actions = @() },
                        [pscustomobject]@{ filePath = 'C:\root\a.accdb'; createBackup = $false; actions = @() }
                    )
                }
            }
            if ($Event -eq 'apply-completed') {
                return [pscustomobject]@{
                    kind = 'complete'
                    report = [pscustomobject]@{ mode = 'apply'; filesScanned = 2; errors = @('first failed') }
                }
            }
            throw "Unexpected event $Event"
        }
        $enumerate = { @([pscustomobject]@{ filePath = 'ignored' }) }
        $inspect = {
            param($FilePath)
            $script:inspected.Add($FilePath)
            [pscustomobject]@{ filePath = $FilePath; tables = @() }
        }
        $apply = {
            param($Plan)
            $script:applied.Add([string]$Plan.filePath)
            if ($Plan.filePath -like '*b.accdb') {
                return [pscustomobject]@{ filePath = $Plan.filePath; openError = 'first failed'; actionResults = @() }
            }
            [pscustomobject]@{ filePath = $Plan.filePath; actionResults = @() }
        }

        $result = Invoke-RelinkDirectoryTransport `
            -Payload ([pscustomobject]@{ rootPath = 'C:\root'; dryRun = $false }) `
            -CoreDecision $core `
            -EnumerateFiles $enumerate `
            -InspectFile $inspect `
            -ApplyFile $apply `
            -WriteProgress { param($Percent, $Message, $Total) }

        $script:events | Should -Be @('start', 'inspections-completed', 'apply-completed')
        $script:inspected | Should -Be @('C:\root\b.accdb', 'C:\root\a.accdb')
        $script:applied | Should -Be @('C:\root\b.accdb', 'C:\root\a.accdb')
        $result.relinkDirectory.filesScanned | Should -Be 2
    }

    It 'returns a completed dry-run without calling the apply primitive' {
        $script:applyCalls = 0
        $core = {
            param($Event, $Payload)
            if ($Event -eq 'start') {
                return [pscustomobject]@{ kind = 'inspect'; state = @{}; files = @('C:\root\a.accdb') }
            }
            return [pscustomobject]@{
                kind = 'complete'
                report = [pscustomobject]@{ mode = 'dry-run'; filesScanned = 1; errors = @() }
            }
        }

        $result = Invoke-RelinkDirectoryTransport `
            -Payload ([pscustomobject]@{ rootPath = 'C:\root'; dryRun = $true }) `
            -CoreDecision $core `
            -EnumerateFiles { @([pscustomobject]@{ filePath = 'C:\root\a.accdb' }) } `
            -InspectFile { param($FilePath) [pscustomobject]@{ filePath = $FilePath; tables = @() } } `
            -ApplyFile { param($Plan) $script:applyCalls++; throw 'must not apply' } `
            -WriteProgress { param($Percent, $Message, $Total) }

        $script:applyCalls | Should -Be 0
        $result.relinkDirectory.mode | Should -Be 'dry-run'
    }
}
