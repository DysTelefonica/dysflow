#requires -Version 5.1
<#
Test file: dysflow-vba-manager-unicode-roundtrip.Tests.ps1

Reproduces and locks down the Unicode encoding bug reported by the EXPEDIENTES
consumer on 2026-06-27. Root cause:

  - PowerShell 7 changed the semantics of `-split "<delim>", -1`.
  - In PS5.x, -1 meant "no limit" (return all substrings).
  - In PS7, -1 returns a single-element array containing the WHOLE input.
  - `Normalize-VbaImportText`, `Split-CodeBehindSection`, and the form/report
    suffix builder all used `-split "`n", -1`, expecting "no limit".
  - On PS7 the whole VBA module arrived as a single "line"; the leading
    `Attribute VB_Name` was consumed as a metadata skip, the function returned
    an empty string, and the import temp file ended up empty. That caused
    CodeModule.AddFromFile to wipe the module — and silently stripped every
    Unicode character (`Sí`, `§`, `—`, etc.) because the helper never reached
    the ANSI-write step on the real content.

Fix:
  - Omit the `-1` limit parameter on all three `-split "`n", ...` sites in
    `scripts/dysflow-vba-manager.ps1`. Default `-split` returns all substrings
    on both PS5.x and PS7.

Scope:
  - These tests are STRUCTURAL Pester tests — they exercise the encoding
    helpers directly (via AST extraction, same pattern as
    `scripts/tests/dysflow-vba-manager.Tests.ps1`). They do NOT require Access
    COM and can run in any Pester 5+ environment.
  - For end-to-end coverage against Access COM see
    `test/e2e/import-export-unicode.e2e.test.ts`.
#>

BeforeAll {
    $script:VbaManagerPath = Join-Path $PSScriptRoot "..\dysflow-vba-manager.ps1"
    if (-not (Test-Path -LiteralPath $script:VbaManagerPath)) {
        throw "dysflow-vba-manager.ps1 not found at $script:VbaManagerPath"
    }
    $script:ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)

    $requiredFunctions = @(
        "Convert-Utf8CodeImportToAnsiTempFile"
        "Convert-Utf8ToAnsiTempFile"
        "Normalize-VbaImportText"
        "Normalize-Newlines"
        "Split-CodeBehindSection"
        "Test-IsVbaImportMetadataLine"
        "Test-IsVbaOptionDirectiveLine"
        "Write-Utf8NoBom"
        "Convert-AnsiToUtf8NoBom"
    )
    foreach ($fn in $requiredFunctions) {
        $fnAst = $script:ast.FindAll({
                $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                $args[0].Name -eq $fn
            }, $true) | Select-Object -First 1
        if (-not $fnAst) {
            throw "Required function '$fn' not found in $($script:VbaManagerPath)"
        }
        Invoke-Expression $fnAst.Extent.Text
    }

    $script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $script:Ansi1252 = [System.Text.Encoding]::GetEncoding(1252)
}

Describe "Convert-Utf8CodeImportToAnsiTempFile — Unicode round-trip (EXPEDIENTES bug)" {

    It "writes a non-empty ANSI temp file for a multi-line UTF-8 .bas module (PS7 regression)" {
        # Regression guard for the root-cause bug: `-split "`n", -1` used to
        # collapse the whole module into one line on PS7, leaving the temp
        # file empty. The sanitized output must be at least as large as the
        # body (Attribute VB_Name + Option Explicit are stripped, but the
        # executable body is preserved verbatim).
        $sandbox = Join-Path (Join-Path $PSScriptRoot "..\..\test-runtime") (
            "unicode-roundtrip-" + [guid]::NewGuid().ToString("N")
        )
        [System.IO.Directory]::CreateDirectory($sandbox) | Out-Null
        try {
            $crlf = [char]13 + [char]10
            $unicodeSi  = [string][char]0xED        # í (U+00ED) — Windows-1252 byte 0xED
            $unicodeSec = [string][char]0xA7        # § (U+00A7) — Windows-1252 byte 0xA7
            $unicodeOrd = [string][char]0xBA        # º (U+00BA) — Windows-1252 byte 0xBA
            $unicodeEm  = [string][char]0x2014      # — (U+2014) — Windows-1252 byte 0x97

            $content = @(
                "Attribute VB_Name = ""Demo"""
                "Option Explicit"
                "Public Sub Demo()"
                ("    MsgBox ""S" + $unicodeSi + """")
                ("    Debug.Print EnumSiNo.S" + $unicodeSi)
                ("    Call Helper(""n" + $unicodeOrd + """, """ + $unicodeSec + """)")
                ("    ' comentario con dash " + $unicodeEm)
                "End Sub"
            ) -join $crlf

            $src = Join-Path $sandbox "source.bas"
            [System.IO.File]::WriteAllText($src, $content, $script:Utf8NoBom)

            $tgt = Join-Path $sandbox "imported.ansi.bas"
            Convert-Utf8CodeImportToAnsiTempFile -InputPath $src -TempPath $tgt

            $outBytes = [System.IO.File]::ReadAllBytes($tgt)
            $outBytes.Length | Should -BeGreaterThan 0 -Because "PS7 -split regression must NOT collapse the module to an empty file"

            $outText = [System.IO.File]::ReadAllText($tgt, $script:Ansi1252)
            $outText.Length | Should -BeGreaterThan 0
        }
        finally {
            if (Test-Path -LiteralPath $sandbox) {
                [System.IO.Directory]::Delete($sandbox, $true)
            }
        }
    }

    It "preserves the Windows-1252 codepoints for Sí, §, º, — inside a UTF-8 source" {
        # Byte-level contract: the sanitized ANSI output must contain the
        # same Windows-1252 bytes that Access expects to read back via
        # CodeModule.AddFromFile.
        $sandbox = Join-Path (Join-Path $PSScriptRoot "..\..\test-runtime") (
            "unicode-codepoints-" + [guid]::NewGuid().ToString("N")
        )
        [System.IO.Directory]::CreateDirectory($sandbox) | Out-Null
        try {
            $crlf = [char]13 + [char]10
            $si  = [string][char]0xED
            $sec = [string][char]0xA7
            $ord = [string][char]0xBA
            $em  = [string][char]0x2014

            $content = @(
                "Attribute VB_Name = ""Demo"""
                "Option Explicit"
                "Public Sub Demo()"
                ("    MsgBox ""S" + $si + """")
                ("    Debug.Print EnumSiNo.S" + $si)
                ("    Call Helper(""n" + $ord + """, """ + $sec + """)")
                ("    ' dash " + $em + " end")
                "End Sub"
            ) -join $crlf

            $src = Join-Path $sandbox "source.bas"
            [System.IO.File]::WriteAllText($src, $content, $script:Utf8NoBom)

            $tgt = Join-Path $sandbox "imported.ansi.bas"
            Convert-Utf8CodeImportToAnsiTempFile -InputPath $src -TempPath $tgt

            $outBytes = [System.IO.File]::ReadAllBytes($tgt)

            # Each codepoint must appear in the ANSI output as its
            # Windows-1252 byte.
            @(0xED, 0xBA, 0xA7, 0x97) | ForEach-Object {
                $byte = $_
                ($outBytes -contains $byte) | Should -BeTrue -Because (
                    "byte 0x{0:X2} (Windows-1252 codepoint) must survive the import sanitization" -f $byte
                )
            }

            # Read back as Windows-1252 to assert round-trip string integrity.
            $roundTrip = [System.IO.File]::ReadAllText($tgt, $script:Ansi1252)
            $roundTrip.Contains("S" + $si)        | Should -BeTrue -Because "Sí must round-trip"
            $roundTrip.Contains($sec)            | Should -BeTrue -Because "§ must round-trip"
            $roundTrip.Contains("n" + $ord)      | Should -BeTrue -Because "nº must round-trip"
            $roundTrip.Contains($em)             | Should -BeTrue -Because "— must round-trip (U+2014 lives at 0x97 in Windows-1252)"
        }
        finally {
            if (Test-Path -LiteralPath $sandbox) {
                [System.IO.Directory]::Delete($sandbox, $true)
            }
        }
    }
}

Describe "Split-CodeBehindSection — split limit does NOT collapse to a single line on PS7" {
    # Same root cause (`-split "`n", -1`) in a different helper. The split
    # section is used by the form/report document path to find the
    # `CodeBehindForm` / `CodeBehindReport` marker. If the helper sees the
    # whole document as one line, it can never locate the marker and the
    # code-behind sync is silently skipped.
    It "finds the CodeBehindForm marker in a multi-line form.txt" {
        $crlf = [char]13 + [char]10
        $formText = @(
            "Version =21"
            "VersionRequired =20"
            "Begin Form"
            "    Caption = ""Demo"""
            "End"
            "CodeBehindForm"
            "Attribute VB_Name = ""Form_Demo"""
            "Option Compare Database"
            "Option Explicit"
            "Public Sub Demo()"
            "End Sub"
        ) -join $crlf

        $result = Split-CodeBehindSection -Text $formText
        $result | Should -Not -BeNullOrEmpty -Because "marker must be located even when split returns multiple lines"
        $result.MarkerLine.Trim() | Should -Be "CodeBehindForm"
    }
}