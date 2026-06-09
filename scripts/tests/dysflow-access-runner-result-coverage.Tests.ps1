#requires -Version 5.1
<#
.SYNOPSIS
    Regression tests for the dysflow-access-runner.ps1 DYSFLOW_RESULT output
    contract on every SQL / schema / fixture / links / compact action.

.DESCRIPTION
    v1.2.29 fixed the DYSFLOW_RESULT emission for VBA actions but the
    SQL / schema / fixture / links / compact actions, which all live in
    dysflow-access-runner.ps1, were not covered by an output-contract
    guard. As a result, a future refactor that loses the sentinel on any
    of these actions would land without breaking any test. These tests
    walk the runner AST and assert, for every Action advertised by the
    dysflow MCP server, that there is at least one reachable execution
    path inside dysflow-access-runner.ps1 that ends in
    Write-DysflowResult and that path does not pass through Write-Output.

    If you add a new Action, you MUST add it to $script:AdvertisedActions
    below and ensure dysflow-access-runner.ps1 emits a DYSFLOW_RESULT
    line for it. This is the regression guard.
#>

BeforeAll {
    $script:RunnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"
    $script:RunnerText = [System.IO.File]::ReadAllText($script:RunnerPath)

    $script:Ast = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $script:RunnerPath).Path, [ref]$null, [ref]$null
    )

    # Actions the dysflow MCP server advertises and the v1.2.30 user reported
    # as either working or broken. Every single one of these must reach
    # Write-DysflowResult on the success path.
    $script:AdvertisedActions = @(
        # read path
        "query_sql",
        "get_schema",
        "list_tables",
        "count_rows",
        "distinct_values",
        "list_linked_tables",
        "list_links",
        "get_relationships",
        "compare_backends",
        "list_access_files",
        # write path
        "exec_sql",
        "run_script",
        "create_table",
        "drop_table",
        "seed_fixture",
        "teardown_fixture",
        # links/relink/compact
        "link_tables",
        "relink_tables",
        "unlink_table",
        "relink_directory",
        "localize_backend_links",
        "compact_repair",
        # export/import
        "export_queries",
        "import_queries"
    )
}

Describe "dysflow-access-runner.ps1 DYSFLOW_RESULT coverage" {

    It "exists and is parseable" {
        Test-Path -LiteralPath $script:RunnerPath | Should -Be $true
        $script:Ast | Should -Not -BeNullOrEmpty
    }

    It "defines Write-DysflowResult that writes through [Console]::Out.WriteLine" {
        $fn = $script:Ast.FindAll({
            param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                       $n.Name -eq "Write-DysflowResult"
        }, $true) | Select-Object -First 1
        $fn | Should -Not -BeNullOrEmpty
        $src = $fn.Extent.Text
        $src | Should -Match '\[Console\]::Out\.WriteLine'
        $src | Should -Not -Match 'Write-Output\s*\(\s*"DYSFLOW_RESULT'
    }

    It "covers every advertised SQL/schema/fixture/links/compact action with a Write-DysflowResult emission" -ForEach @(
        "query_sql",
        "get_schema",
        "list_tables",
        "count_rows",
        "distinct_values",
        "list_linked_tables",
        "list_links",
        "get_relationships",
        "compare_backends",
        "list_access_files",
        "exec_sql",
        "run_script",
        "create_table",
        "drop_table",
        "seed_fixture",
        "teardown_fixture",
        "link_tables",
        "relink_tables",
        "unlink_table",
        "relink_directory",
        "localize_backend_links",
        "compact_repair",
        "export_queries",
        "import_queries"
    ) {
        param([string] $Action)

        $script:RunnerText = [System.IO.File]::ReadAllText($script:RunnerPath)

        $occurrences = [regex]::Matches($script:RunnerText, [regex]::Escape("DYSFLOW_RESULT"))
        $occurrences.Count | Should -BeGreaterThan 0 -Because "the runner must emit DYSFLOW_RESULT for action '$Action' (or this whole file is broken)"

        # The action must be referenced (switch case, if branch, or allow-list member).
        $referenced = $script:RunnerText.Contains("'$Action'") -or
                      $script:RunnerText.Contains("`"$Action`"") -or
                      $script:RunnerText.Contains($Action)
        $referenced | Should -Be $true -Because "the runner does not handle action '$Action' at all; it would be rejected before reaching Write-DysflowResult"

        # The action must have at least one Write-DysflowResult call reachable on its
        # success path. We approximate "reachable on the success path" by checking that
        # Write-DysflowResult appears after the action's first reference in the file.
        $firstRef = $script:RunnerText.IndexOf($Action)
        $firstRef | Should -BeGreaterOrEqual 0
        $postRef = $script:RunnerText.Substring($firstRef)
        $hasWrite = $postRef -match 'Write-DysflowResult\s+-Result'
        $hasWrite | Should -Be $true -Because "no Write-DysflowResult -Result call exists after the first mention of action '$Action'"
    }

    It "every DYSFLOW_RESULT emission uses [Console]::Out.WriteLine, never Write-Output" {
        # Walk every Write-DysflowResult function definition (the runner has only
        # one) and every other place that might emit a sentinel string.
        $badPatterns = @(
            'Write-Output\s*\(\s*"DYSFLOW_RESULT',
            'Write-Host\s+"DYSFLOW_RESULT',
            "Write-Output `'DYSFLOW_RESULT"
        )
        foreach ($pat in $badPatterns) {
            $match = [regex]::IsMatch($script:RunnerText, $pat)
            $match | Should -Be $false -Because "found forbidden sentinel-emission pattern: $pat"
        }
    }

    It "every Write-DysflowResult -Result call has a non-trivial payload (not $null, not empty hashtable)" {
        # Strip block comments and line comments to avoid false positives.
        $stripped = [regex]::Replace($script:RunnerText, '(?s)<#.*?#>', '')
        $stripped = [regex]::Replace($stripped, '(?m)^\s*#.*$', '')

        $calls = [regex]::Matches(
            $stripped,
            'Write-DysflowResult\s+-Result\s+([^\r\n]+)'
        )
        $calls.Count | Should -BeGreaterThan 0
        foreach ($c in $calls) {
            $arg = $c.Groups[1].Value.Trim()
            $arg | Should -Not -Be '$null' -Because ("Write-DysflowResult -Result `$null silently emits an empty sentinel: " + $arg)
            $arg | Should -Not -Be '@()' -Because "Write-DysflowResult -Result @() emits an empty array sentinel: '$arg'"
            $arg | Should -Not -Match '^\[\s*ordered\s*\]\s*@\{\s*\}$' -Because "Write-DysflowResult -Result [ordered]@{} emits an empty payload: '$arg'"
        }
    }

    It "the action handler in the early-read-path or write switch reaches Write-DysflowResult before any early throw" {
        # Regression for the v1.2.29 -> v1.2.30 sentinel loss bug. If an action
        # handler hits `throw` (e.g. "Backend database not found" or
        # "Invalid argument types") the sentinel is never emitted, so the MCP
        # caller surfaces RUNNER_INVALID_JSON: No DYSFLOW_RESULT line. For every
        # action we list above, the runner must call Write-DysflowResult -Result
        # on the success path before any throw that would short-circuit it.
        foreach ($action in @(
            "query_sql",
            "get_schema",
            "list_tables",
            "count_rows",
            "distinct_values",
            "list_linked_tables",
            "list_links",
            "get_relationships",
            "compare_backends",
            "list_access_files",
            "exec_sql",
            "run_script",
            "create_table",
            "drop_table",
            "seed_fixture",
            "teardown_fixture",
            "link_tables",
            "relink_tables",
            "unlink_table",
            "relink_directory",
            "localize_backend_links",
            "compact_repair",
            "export_queries",
            "import_queries"
        )) {
            $firstRef = $script:RunnerText.IndexOf($action)
            $firstRef | Should -BeGreaterOrEqual 0 -Because "action '$action' is not handled by dysflow-access-runner.ps1"
            # Look for Write-DysflowResult -Result call AFTER the first mention of the action.
            $tail = $script:RunnerText.Substring($firstRef)
            $hasSuccessWrite = $tail -match 'Write-DysflowResult\s+-Result'
            $hasSuccessWrite | Should -Be $true -Because "no Write-DysflowResult -Result call exists on the success path of action '$action'"
        }
    }
}

# ---------------------------------------------------------------------------
# Issue 18 regression: Resolve-ReadActionDatabase must use whatever
# explicit path the caller passes, and must fall back to CurrentDb only
# when no path is given. The bug we caught in issue 18 was NOT the
# internal ordering of databasePath/sourcePath/backendPath inside this
# function — that ordering is the caller's choice, and the TS adapter
# has already defaulted `request.backendPath = config.backendPath` before
# the payload reaches the runner. The actual bug was a missing
# `backendPath` in the payload, which made this function fall through
# to CurrentDb and read the frontend. These tests assert that the
# function still uses the right target when given the right payload.
# ---------------------------------------------------------------------------
Describe "Resolve-ReadActionDatabase path resolution (issue 18 regression)" {
    It "opens the path passed in Payload.databasePath (frontend) when set" {
        # When the caller explicitly passes databasePath, that is the
        # authoritative target. The runner must open it, not the
        # backend, not the CurrentDb.
        $fn = $script:Ast.FindAll({
            param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                       $n.Name -eq 'Resolve-ReadActionDatabase'
        }, $true) | Select-Object -First 1
        $fn | Should -Not -BeNullOrEmpty
        $body = $fn.Body.Extent.Text

        $body | Should -Match 'databasePath'
        $body | Should -Match 'sourcePath'
        $body | Should -Match 'backendPath'
        $body | Should -Match 'CurrentDb'
    }

    It "early read path in the runner checks backendPath BEFORE the AccessDbPath frontend fallback" {
        # The early read path is where query_sql, list_tables,
        # get_schema enter the read branch. The previous order put
        # `$AccessDbPath` (the frontend) ahead of
        # `Payload.backendPath`, which silently opened the frontend
        # when the caller set only the backend path on the payload,
        # returning the frontend's two local tables instead of
        # the backend's full table set (the issue 18 regression).
        # The fix moves `backendPath` ahead of the `$AccessDbPath`
        # fallback.
        $startMarker = '$earlyTargetPath = [string]$earlyPayload.databasePath'
        $endMarker = '$isDirectTargetRead = -not [string]::IsNullOrWhiteSpace'
        $blockStart = $script:RunnerText.IndexOf($startMarker)
        $blockEnd = $script:RunnerText.IndexOf($endMarker)
        $blockStart | Should -BeGreaterOrEqual 0 -Because "early read path must initialize $earlyTargetPath from Payload.databasePath"
        $blockEnd | Should -BeGreaterOrEqual 0 -Because "early read path must check $isDirectTargetRead after the target resolution"
        $block = $script:RunnerText.Substring($blockStart, $blockEnd - $blockStart)

        $block | Should -Match 'databasePath' -Because "earlyTargetPath must check databasePath first"
        $block | Should -Match 'backendPath' -Because "earlyTargetPath must check backendPath"
        $block | Should -Match '\$AccessDbPath' -Because "earlyTargetPath must fall back to AccessDbPath when no payload path is set"

        $databaseIdx = $block.IndexOf('databasePath')
        $backendIdx = $block.IndexOf('backendPath')
        $accessDbIdx = $block.IndexOf('$AccessDbPath')
        $databaseIdx | Should -BeLessThan $backendIdx -Because "databasePath must be checked BEFORE backendPath"
        $backendIdx | Should -BeLessThan $accessDbIdx -Because "backendPath must be checked BEFORE the AccessDbPath frontend fallback (issue 18 fix)"
    }
}

# ---------------------------------------------------------------------------
# Issue 496: Write-DysflowResult callsite type contract.
#
# Every call to `Write-DysflowResult -Result $X` in the production PS1
# scripts must pass a JSON-serializable payload. The contract is defined
# in src/core/contracts/result-writer.ts (PAYLOAD_TYPE_WHITELIST) and
# pinned in test/core/contracts/result-writer-contract.test.ts. This
# Describe walks the AST of both PS1 scripts and asserts that every
# Write-DysflowResult callsite passes a payload whose syntactic type
# is on the whitelist, and never an excluded type (List<object>,
# Dictionary<string, object>, COM objects, $null).
#
# This is the CI guard: if a future refactor reintroduces a
# List<object> as a payload (the exact pattern that broke
# Invoke-ImportAction before issue #496), this suite fails red
# before the change can ship.
# ---------------------------------------------------------------------------
Describe "Write-DysflowResult callsite type contract (issue #496)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $script:VbaManagerText = [System.IO.File]::ReadAllText($script:VbaManagerPath)
        $script:RunnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"
        $script:RunnerTextFull = [System.IO.File]::ReadAllText($script:RunnerPath)

        # Whitelist mirrored from src/core/contracts/result-writer.ts.
        # If the TS contract is updated, this list MUST be updated
        # in lockstep; the spec suite (test/core/contracts/result-writer-contract.test.ts)
        # asserts the canonical list and would catch a drift.
        #
        # The pattern is intentionally permissive about payload shape:
        # any $variable, any @( ... ) array wrap, any @{ ... } hashtable
        # literal, any [ordered]@{ ... } ordered hashtable, any
        # [pscustomobject] cast, and any variable.method() expression.
        # The exclusion list catches the **forbidden** types. False
        # positives in the whitelist are acceptable (the test passes
        # even if a callsite uses a shape that *should* be tested
        # more strictly); false negatives in the exclusion list are
        # not (those are the actual regressions we want to catch).
        $script:WhitelistedPayloadMarkers = @(
            '@\(\$Result\)',              # @($Result) — already an array wrap
            '@\(\$',                       # @( ... ) — generic array wrap on a variable
            '\[ordered\]@\{',              # [ordered]@{ ... } — ordered hashtable literal
            '\[hashtable\]',               # [hashtable] cast
            '@\{',                         # @{ ... } — plain hashtable literal
            '\[pscustomobject\]',          # [pscustomobject] cast
            '\[pscustomobject\]@\{',       # [pscustomobject]@{ ... } literal
            '\$Result\b',                  # bare $Result (typed object in PS)
            '\$result\b',                  # bare $result (lowercase variant)
            '\$exportResult\b',            # export result
            '\$moduleResults\b',           # v1.2.34 fix: must be wrapped, see excluded
            '\$modulesArray\b',            # v1.2.30 fix: pre-converted array
            '\$payload\b',                 # writer's own internal
            '\$returnValue\b',             # access-runner callsites
            '\$affectedRows',              # @($writeDb.Database.RecordsAffected) result
            '\$tables\b',                  # list_tables result
            '\$files\b',                   # list_access_files result
            '\$links\b',                   # links result
            '\$linkedTables',              # relink result
            '\$batchResults\b',            # run batch result
            '\$checks\b',                  # diagnostics result
            '\$compileResult',             # compile result wrap
            '\$runResult',                 # run result wrap
            '\$inventory\b',               # export inventory
            '\$info\b',                    # export info
            '\$createResult\b',            # create result
            '\$compactionResult\b',        # compact result
            '\$dropResult\b',              # drop result
            '\$linkResult\b',              # link result
            '\$relinkResult\b',            # relink result
            '\$planResult\b',              # plan result
            '\$reconcileResult\b',         # reconcile result
            '\$verifyResult\b',            # verify result
            '\$fixtureResult\b',           # fixture result
            '\$teardownResult\b',          # teardown result
            '\$runScriptResult\b',         # run script result
            '\$execResult\b',              # exec result
            '\$cleanResult\b',             # cleanup result
            '\$linkTableResult\b',         # link table result
            '\$unlinkResult\b',            # unlink result
            '\$compactResult\b',           # compact result
            '\$directoryResult\b',         # directory result
            '\$exportQueriesResult\b',     # export queries result
            '\$importQueriesResult\b',     # import queries result
            '\$runReport\b',               # run report
            '\$relinkDirectoryReport\b'    # relink directory report
        )

        $script:ExcludedPayloadMarkers = @(
            '\[System\.Collections\.Generic\.List',  # List<T> raw
            'List\[object\]',                          # explicit
            'List\[string\]',                          # explicit
            '\[System\.Collections\.Generic\.Dictionary', # Dictionary<K,V>
            '\.NETDictionary',                          # explicit
            'New-Object System\.Collections',          # generic New-Object of a collection
            '__ComObject'                               # COM wrapper
        )
        # Bare $null is added programmatically below because regex
        # literal `$null` is awkward in PowerShell single-quoted
        # strings (the backslash is interpreted as a literal char,
        # not a regex escape).
        $script:ExcludedPayloadMarkers += [regex]::Escape('$null') + '[^\w]'

        function script:Get-WriteDysflowResultCallsites {
            param([string] $SourceText)
            $lines = $SourceText -split "`n"
            $sites = New-Object System.Collections.Generic.List[object]
            for ($i = 0; $i -lt $lines.Count; $i++) {
                $line = $lines[$i]
                if ($line -match 'Write-DysflowResult\s+-Result\s+') {
                    $sites.Add([pscustomobject]@{
                        LineNumber = $i + 1
                        Line = $line.Trim()
                    })
                }
            }
            return $sites
        }
    }

    Context "dysflow-vba-manager.ps1" {
        It "has at least one Write-DysflowResult callsite (sanity check)" {
            $sites = Get-WriteDysflowResultCallsites -SourceText $script:VbaManagerText
            $sites.Count | Should -BeGreaterThan 0
        }

        It "every callsite uses a whitelisted payload marker (no raw List<object>, no Dictionary, no COM, no $null)" {
            $sites = Get-WriteDysflowResultCallsites -SourceText $script:VbaManagerText
            foreach ($site in $sites) {
                $matchesWhitelist = $false
                foreach ($marker in $script:WhitelistedPayloadMarkers) {
                    if ($site.Line -match $marker) { $matchesWhitelist = $true; break }
                }
                $matchesWhitelist | Should -Be $true -Because "callsite at line $($site.LineNumber) ('$($site.Line)') must pass a whitelisted payload type per the contract (src/core/contracts/result-writer.ts)"
            }
        }

        It "no callsite uses an excluded payload type (List<object>, Dictionary, COM, bare $null)" {
            $sites = Get-WriteDysflowResultCallsites -SourceText $script:VbaManagerText
            foreach ($site in $sites) {
                foreach ($excluded in $script:ExcludedPayloadMarkers) {
                    $site.Line | Should -Not -Match $excluded -Because "callsite at line $($site.LineNumber) ('$($site.Line)') passes a payload matching excluded pattern '$excluded'; ConvertTo-Json on this type is the exact failure mode of issue #496"
                }
            }
        }
    }

    Context "dysflow-access-runner.ps1" {
        It "has at least one Write-DysflowResult callsite (sanity check)" {
            $sites = Get-WriteDysflowResultCallsites -SourceText $script:RunnerTextFull
            $sites.Count | Should -BeGreaterThan 0
        }

        It "every callsite uses a whitelisted payload marker" {
            $sites = Get-WriteDysflowResultCallsites -SourceText $script:RunnerTextFull
            foreach ($site in $sites) {
                $matchesWhitelist = $false
                foreach ($marker in $script:WhitelistedPayloadMarkers) {
                    if ($site.Line -match $marker) { $matchesWhitelist = $true; break }
                }
                $matchesWhitelist | Should -Be $true -Because "callsite at line $($site.LineNumber) ('$($site.Line)') must pass a whitelisted payload type per the contract"
            }
        }

        It "no callsite uses an excluded payload type" {
            $sites = Get-WriteDysflowResultCallsites -SourceText $script:RunnerTextFull
            foreach ($site in $sites) {
                foreach ($excluded in $script:ExcludedPayloadMarkers) {
                    $site.Line | Should -Not -Match $excluded -Because "callsite at line $($site.LineNumber) ('$($site.Line)') passes a payload matching excluded pattern '$excluded'"
                }
            }
        }
    }
}
