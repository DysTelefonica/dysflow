$ErrorActionPreference = 'Stop'

BeforeAll {
    $script:Verifier = Join-Path $PSScriptRoot 'verify-examples-vs-runtime.ps1'
    $script:Root = Join-Path $TestDrive 'skill'
    $script:Examples = Join-Path $script:Root 'assets/examples'
    $script:Captures = Join-Path $TestDrive 'captures'
    New-Item -ItemType Directory -Force -Path $script:Examples,$script:Captures | Out-Null
    $catalog = @{
        schemaVersion = 'dysflow.result/v1'
        tools = @(
            @{ name='read_tool'; access='read-only'; annotations=@{readOnlyHint=$true}; inputSchema=@{type='object';additionalProperties=$false;properties=@{}}; compositionConstraints=@() },
            @{ name='write_tool'; access='conditional-write'; annotations=@{readOnlyHint=$false}; inputSchema=@{type='object';additionalProperties=$false;properties=@{apply=@{type='boolean'}}}; compositionConstraints=@() },
            @{ name='schema'; access='read-only'; annotations=@{readOnlyHint=$true}; inputSchema=@{type='object';additionalProperties=$false;properties=@{view=@{type='string';enum=@('index','compact','full');runtimeRequired=$true}}}; compositionConstraints=@() }
        )
    }
    @{ok=$true;source='structuredContent';payload=$catalog} | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $script:Captures 'full.json') -Encoding utf8NoBOM
    @{ok=$true;source='structuredContent';payload=@{adapterVersion='3.0.0';schemaVersion='dysflow.result/v1'}} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $script:Captures 'bootstrap.json') -Encoding utf8NoBOM
    $script:InvokeFixture = {
        param([string]$Body)
        Get-ChildItem -LiteralPath $script:Examples -File -ErrorAction SilentlyContinue | Remove-Item -Force
        Set-Content -LiteralPath (Join-Path $script:Examples 'fixture.md') -Value $Body -Encoding utf8NoBOM
        $report = Join-Path $TestDrive "report-$([guid]::NewGuid()).json"
        & pwsh -NoProfile -File $script:Verifier -Path $script:Root -CapturesDir $script:Captures -SkipLive -OutputJson $report | Out-Null
        [pscustomobject]@{ ExitCode=$LASTEXITCODE; Report=(Get-Content -Raw $report | ConvertFrom-Json -Depth 20) }
    }
}

Describe 'schema-derived example verification' {
    It 'accepts valid read, write-preview, and explicit schema-view examples' {
        $body = "<!-- dysflow-example tool=`"read_tool`" -->`n``````json`n{}`n```````n<!-- dysflow-example tool=`"write_tool`" -->`n``````json`n{`"apply`":false}`n```````n<!-- dysflow-example tool=`"schema`" -->`n``````json`n{`"view`":`"index`"}`n```````n"
        $result = & $script:InvokeFixture $body
        $result.ExitCode | Should -Be 0
        @($result.Report.findings).Count | Should -Be 0
        $result.Report.adapterVersion | Should -Be '3.0.0'
    }

    It 'rejects write examples without explicit canonical intent' {
        $result = & $script:InvokeFixture "<!-- dysflow-example tool=`"write_tool`" -->`n``````json`n{}`n```````n"
        $result.ExitCode | Should -Be 1
        $result.Report.findings.code | Should -Contain 'MISSING_WRITE_INTENT'
    }

    It 'rejects apply on a read-only tool' {
        $result = & $script:InvokeFixture "<!-- dysflow-example tool=`"read_tool`" -->`n``````json`n{`"apply`":false}`n```````n"
        $result.ExitCode | Should -Be 1
        $result.Report.findings.code | Should -Contain 'READ_ONLY_WRITE_INTENT'
    }

    It 'rejects omission of a runtime-required schema view' {
        $result = & $script:InvokeFixture "<!-- dysflow-example tool=`"schema`" -->`n``````json`n{}`n```````n"
        $result.ExitCode | Should -Be 1
        $result.Report.findings.code | Should -Contain 'MISSING_PARAMETER'
    }

    It 'fails closed without a complete full catalog capture' {
        $empty = Join-Path $TestDrive 'empty'
        New-Item -ItemType Directory -Path $empty | Out-Null
        { & $script:Verifier -Path $script:Root -CapturesDir $empty -SkipLive } | Should -Throw
    }
}
