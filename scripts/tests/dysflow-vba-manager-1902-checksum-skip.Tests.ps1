#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1902: an export must not rewrite a form whose only difference from the
    existing file is the Access `Checksum` serialization line.
.NOTES
    Pure PowerShell. Loads Write-Utf8NoBom from the script AST, no Access required.
#>

BeforeAll {
    $scriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
    $tokens = $null
    $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
    $writeFn = $ast.FindAll(
        { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
          $args[0].Name -eq 'Write-Utf8NoBom' },
        $true
    ) | Select-Object -First 1
    . ([ScriptBlock]::Create($writeFn.Extent.Text))

    $script:Utf8 = New-Object System.Text.UTF8Encoding($false)
    $script:Root = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1902-" + [guid]::NewGuid().ToString("N"))
    [void](New-Item -Path $script:Root -ItemType Directory -Force)
    $script:OldTime = [datetime]::new(2000, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)

    function New-Form([string]$Path, [string]$Text) {
        [System.IO.File]::WriteAllText($Path, $Text, $script:Utf8)
        [System.IO.File]::SetLastWriteTimeUtc($Path, $script:OldTime)
    }
}

AfterAll {
    if ($script:Root -and (Test-Path -LiteralPath $script:Root)) {
        Remove-Item -LiteralPath $script:Root -Recurse -Force
    }
}

Describe "Write-Utf8NoBom -SkipChecksumOnlyChanges (#1902)" {
    BeforeEach {
        $script:Path = Join-Path $script:Root ("form-" + [guid]::NewGuid().ToString("N") + ".form.txt")
        $script:Existing = "Version =21`nBegin Form`n    Checksum =77107938`n    Width =6994`nEnd`n"
    }

    It "does not rewrite when only the Checksum line differs (bytes and mtime intact)" {
        New-Form $script:Path $script:Existing
        $requested = $script:Existing -replace "Checksum =77107938", "Checksum =-1113117800"

        Write-Utf8NoBom -Path $script:Path -Text $requested -SkipUnchanged -SkipChecksumOnlyChanges

        [System.IO.File]::ReadAllText($script:Path, $script:Utf8) | Should -BeExactly $script:Existing
        [System.IO.File]::GetLastWriteTimeUtc($script:Path) | Should -Be $script:OldTime
    }

    It "writes when Checksum and another line differ" {
        New-Form $script:Path $script:Existing
        $requested = $script:Existing -replace "Checksum =77107938", "Checksum =-1113117800" -replace "Width =6994", "Width =7000"

        Write-Utf8NoBom -Path $script:Path -Text $requested -SkipUnchanged -SkipChecksumOnlyChanges

        [System.IO.File]::ReadAllText($script:Path, $script:Utf8) | Should -BeExactly $requested
        [System.IO.File]::GetLastWriteTimeUtc($script:Path) | Should -Not -Be $script:OldTime
    }

    It "does not rewrite when the requested text is identical" {
        New-Form $script:Path $script:Existing

        Write-Utf8NoBom -Path $script:Path -Text $script:Existing -SkipUnchanged -SkipChecksumOnlyChanges

        [System.IO.File]::GetLastWriteTimeUtc($script:Path) | Should -Be $script:OldTime
    }
}
