#Requires -Modules Pester
<#
.SYNOPSIS
    WU-4 export-manifest tests (Refs #1724) — verify that Get-ExportArtifactRecord
    emits a canonical per-artifact record for the three BOM flavors the
    canonicalizer contract distinguishes: UTF-8 (with BOM), UTF-16LE, and UTF-32
    (the latter as "unsupported" so the consumer knows the bytes will need a
    special codec branch before the canonicalizer can read them).

.NOTES
    Pure-PowerShell AST loader mirroring scripts/tests/dysflow-vba-manager-issue1007.Tests.ps1.
    - No live Access COM.
    - No live Pester Runspace.
    - No mocks of static exports.
    - Fixture reads limited to existing scripts/tests/fixtures/*.bas files for the
      UTF-8 BOM case. UTF-16LE and UTF-32 BOMs are synthesized at runtime through
      `[System.IO.File]::WriteAllBytes` against a temp directory the test owns
      and cleans up so the existing scripts/tests/fixtures/ tree stays untouched
      (Refs #1724 brief: NEVER modify scripts/tests/fixtures/).
#>

Describe "WU-4 export-manifest — Get-ExportArtifactRecord (Refs #1724)" {

    BeforeAll {
        $scriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $scriptPath).Path, [ref]$null, [ref]$null
        )

        $getFn = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Get-ExportArtifactRecord' },
            $true
        ) | Select-Object -First 1
        $getFn | Should -Not -BeNullOrEmpty `
            -Because "Get-ExportArtifactRecord must be defined for the WU-4 manifest emit"
        . ([ScriptBlock]::Create($getFn.Extent.Text))

        # SHA-256 needs the crypto provider. In a fresh Pester Runspace without
        # the rest of the script dot-sourced, the type is still available via
        # System.Security.Cryptography; just reference it so PowerShell resolves
        # the assembly up front.
        [void][System.Security.Cryptography.SHA256]

        $writeFn = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Write-ExportManifest' },
            $true
        ) | Select-Object -First 1
        $writeFn | Should -Not -BeNullOrEmpty `
            -Because "Write-ExportManifest must be defined for the WU-4 manifest emit"
        . ([ScriptBlock]::Create($writeFn.Extent.Text))

        $writeUtf8 = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Write-Utf8NoBom' },
            $true
        ) | Select-Object -First 1
        $writeUtf8 | Should -Not -BeNullOrEmpty `
            -Because "Write-Utf8NoBom is required to round-trip the manifest sidecar"
        . ([ScriptBlock]::Create($writeUtf8.Extent.Text))
    }

    # --------------------------------------------------------------------
    # UTF-8 BOM fixture: re-uses the EXISTING scripts/tests/fixtures/utf8bom-original.bas
    # without modifying it. Per-test temp root is created inline so AfterAll
    # scoping (which Pester 5 isolates per container) is not required.
    # --------------------------------------------------------------------
    It "returns codec=utf-8 with correct sha256/byteLength/moduleName/fileType/relativePath (existing UTF-8 BOM fixture)" {
        $fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-export-manifest-utf8-" + [guid]::NewGuid().ToString("N"))
        try {
            [void](New-Item -Path $fixtureRoot -ItemType Directory -Force)
            $fixturePath = Join-Path -Path $fixtureRoot -ChildPath "ProbeModule.bas"
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot "fixtures" "utf8bom-original.bas") -Destination $fixturePath -Force

            $record = Get-ExportArtifactRecord -Path $fixturePath -Root $fixtureRoot

            $record | Should -Not -BeNullOrEmpty
            $record.moduleName | Should -Be "ProbeModule"
            $record.fileType | Should -Be "bas"
            $record.relativePath | Should -Be "ProbeModule.bas"
            $record.codec | Should -Be "utf-8"

            $expectedBytes = (Get-Item -LiteralPath $fixturePath).Length
            $record.byteLength | Should -Be $expectedBytes

            # SHA-256 must be 64 lowercase hex chars for any non-empty file.
            $record.sha256 | Should -Match "^[0-9a-f]{64}$"

            # Independently compute the expected hash and confirm equality. This
            # guards against accidental changes to the BOM detection that could
            # shift which bytes the SHA pipeline sees (we feed it the BOM bytes
            # too — the spec doesn't strip them).
            $bytes = [System.IO.File]::ReadAllBytes($fixturePath)
            $sha = [System.Security.Cryptography.SHA256]::Create()
            try {
                $sb = New-Object System.Text.StringBuilder(64)
                foreach ($b in $sha.ComputeHash($bytes)) { [void]$sb.AppendFormat("{0:x2}", $b) }
                $expected = $sb.ToString()
            } finally {
                $sha.Dispose()
            }
            $record.sha256 | Should -Be $expected
        } finally {
            if (Test-Path -LiteralPath $fixtureRoot) {
                Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }

    # --------------------------------------------------------------------
    # UTF-16LE BOM: synthesized at runtime in a test-owned temp dir so the
    # existing scripts/tests/fixtures/ tree stays untouched.
    # --------------------------------------------------------------------
    It "returns codec=utf-16le on a UTF-16LE BOM fixture" {
        $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-export-manifest-utf16-" + [guid]::NewGuid().ToString("N"))
        try {
            [void](New-Item -Path $tmpDir -ItemType Directory -Force)
            $utf16Path = Join-Path -Path $tmpDir -ChildPath "LegacyModule.bas"
            $content = "Attribute VB_Name = ""LegacyModule""`r`nPublic Sub Run()`r`nEnd Sub`r`n"
            # UTF-16LE BOM = FF FE; encode the body as UTF-16LE (little-endian, no
            # auto-prepended BOM because [Encoding]::Unicode.GetBytes() does not add it).
            $body = [System.Text.Encoding]::Unicode.GetBytes($content)
            $bom = [byte[]](0xFF, 0xFE)
            $bytes = New-Object 'System.Collections.Generic.List[byte]'
            $bytes.AddRange($bom)
            $bytes.AddRange($body)
            [System.IO.File]::WriteAllBytes($utf16Path, $bytes.ToArray())

            $record = Get-ExportArtifactRecord -Path $utf16Path -Root $tmpDir

            $record | Should -Not -BeNullOrEmpty
            $record.moduleName | Should -Be "LegacyModule"
            $record.fileType | Should -Be "bas"
            $record.relativePath | Should -Be "LegacyModule.bas"
            $record.codec | Should -Be "utf-16le"
            $record.sha256 | Should -Match "^[0-9a-f]{64}$"
            $record.byteLength | Should -Be (Get-Item -LiteralPath $utf16Path).Length
        } finally {
            if (Test-Path -LiteralPath $tmpDir) {
                Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }

    # --------------------------------------------------------------------
    # UTF-32 LE BOM: synthesized at runtime. The codec detection must surface
    # "unsupported" so the consumer knows the bytes need a special branch
    # before the canonicalizer can read them.
    # --------------------------------------------------------------------
    It "returns codec=unsupported on a UTF-32 LE BOM fixture" {
        $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-export-manifest-utf32-" + [guid]::NewGuid().ToString("N"))
        try {
            [void](New-Item -Path $tmpDir -ItemType Directory -Force)
            $utf32Path = Join-Path -Path $tmpDir -ChildPath "UnsupportedModule.bas"
            # UTF-32 LE BOM = FF FE 00 00 — a 4-byte prefix that the canonicalizer
            # contract (DESIGN §"Codec selection") rejects as "unsupported".
            $prefix = [byte[]](0xFF, 0xFE, 0x00, 0x00)
            $body = [System.Text.Encoding]::UTF8.GetBytes("Attribute VB_Name = ""UnsupportedModule""`r`n")
            $combined = New-Object 'System.Collections.Generic.List[byte]'
            $combined.AddRange($prefix)
            $combined.AddRange($body)
            [System.IO.File]::WriteAllBytes($utf32Path, $combined.ToArray())

            $record = Get-ExportArtifactRecord -Path $utf32Path -Root $tmpDir

            $record | Should -Not -BeNullOrEmpty
            $record.moduleName | Should -Be "UnsupportedModule"
            $record.fileType | Should -Be "bas"
            $record.relativePath | Should -Be "UnsupportedModule.bas"
            $record.codec | Should -Be "unsupported"
            $record.sha256 | Should -Match "^[0-9a-f]{64}$"
        } finally {
            if (Test-Path -LiteralPath $tmpDir) {
                Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
