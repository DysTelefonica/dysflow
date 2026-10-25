# Issue #1868 — a failed LoadFromText import must not leave errors.txt in the
# repository. Access writes errors.txt next to the database; the runner reads
# its text into the error envelope and then removes the file.

Describe "Read-AndRemoveImportErrorsFile (#1868)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Read-AndRemoveImportErrorsFile' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Read-AndRemoveImportErrorsFile not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text
    }

    It "returns the error text and removes the file" {
        $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1868-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        try {
            $path = Join-Path $dir "errors.txt"
            [System.IO.File]::WriteAllText($path, "Error in line 931. Value not suitable for this property.", [System.Text.Encoding]::GetEncoding(1252))

            $text = Read-AndRemoveImportErrorsFile -Path $path

            $text | Should -Match "Value not suitable for this property"
            (Test-Path -LiteralPath $path) | Should -BeFalse
        } finally {
            Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "returns null and creates nothing when no errors.txt exists" {
        $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1868-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        try {
            $path = Join-Path $dir "errors.txt"
            Read-AndRemoveImportErrorsFile -Path $path | Should -BeNullOrEmpty
            (Test-Path -LiteralPath $path) | Should -BeFalse
        } finally {
            Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
