# Spec — pester-test-contract (#585)

> Behavior contract for Pester tests in `scripts/tests/`. The tests must not
> assert on PowerShell source body text, statement order, or function-name
> pins. They must express behavior through a port-level call (real function
> invocation, mock COM object, mock filesystem) and AST extraction is loader-
> only.

## Requirement R1 — `dysflow-access-com.Tests.ps1` does not pin function names

Each `It "defines X"` assertion (`scripts/tests/dysflow-access-com.Tests.ps1:50-72`)
is replaced by a behavior contract: after the module is dot-sourced, the
function must be callable.

#### Scenario: Get-ProcessIdFromHwnd is callable after module import

- **Given** `scripts/lib/dysflow-access-com.ps1` is dot-sourced
- **When** the test asks for `Get-Command Get-ProcessIdFromHwnd -ErrorAction Stop`
- **Then** no error is raised
- **And** `Get-Command` returns a `FunctionInfo` (not `$null`)

> All 8 `It "defines X"` assertions (Get-ProcessIdFromHwnd, Get-MsAccessProcessesBounded,
> Get-MsAccessProcesses, Stop-AccessPidAndWait, Get-AccessLockFilePath,
> Close-TargetAccessDbIfOpen, and any other) are converted 1:1 to the
> callability contract. The test count is preserved (8 in / 8 out).

## Requirement R2 — `dysflow-vba-manager.Tests.ps1:66-82` does not assert source text

The two source-text assertions (UTF-8 OutputEncoding regex match; `.Name`
assignment count) are replaced by behavior contracts on extracted helpers.
The helpers are tiny, pure, and the production function calls them in both
branches (CopyObject + Add) so the original risk (CopyObject non-ASCII name
mangling) remains covered.

#### Scenario: `Set-ScriptOutputEncodingUtf8` sets `[Console]::OutputEncoding` to UTF-8

- **Given** a fresh test scope with `[Console]::OutputEncoding` reset to ASCII
- **When** the helper `Set-ScriptOutputEncodingUtf8` is called
- **Then** `[Console]::OutputEncoding.CodePage` is `65001` (UTF-8)
- **And** `[Console]::OutputEncoding.WebName` is `utf-8`

#### Scenario: `Set-VbComponentNameSafe` assigns `.Name` to the component

- **Given** a PSCustomObject mock with a `Name` property setter
- **When** the helper `Set-VbComponentNameSafe -Component $mock -Name "Módulo1"` is called
- **Then** `$mock.Name` equals `"Módulo1"`
- **And** no exception is raised

#### Scenario: `New-VbComponentFromCodeFile` calls `Set-VbComponentNameSafe` in BOTH branches

- **Given** the AST of `scripts/dysflow-vba-manager.ps1`
- **When** the test counts `Set-VbComponentNameSafe` calls inside `New-VbComponentFromCodeFile`
- **Then** the count is `>= 2` (one in the CopyObject branch, one in the Add branch)
- **And** the assertion reads the call list via AST (the function-call nodes' targets), NOT by matching the regex `\$newComponent\.Name = \$ModuleName` on the function body text.

> The risk "non-ASCII names get mangled in CopyObject" is now covered by:
> 1. The helper unit test (the Unicode-safe setter works).
> 2. The AST call-count test (the helper is invoked in both branches).
> Together they pin the behavior without coupling to a specific variable
> name (`$newComponent`) or assignment syntax.

## Requirement R3 — `dysflow-access-runner-result-coverage.Tests.ps1:248-264` does not assert textual order

The textual-order assertion on the `Resolve-ReadActionDatabase` block is
replaced by a behavior contract on a pure path-resolver helper extracted from
the production function.

#### Scenario: `Resolve-ReadActionTargetPath` priority order is `databasePath` → `sourcePath` → `backendPath` → empty

- **Given** the helper `Resolve-ReadActionTargetPath` is loaded from
  `scripts/dysflow-access-runner.ps1` via AST extraction
- **When** called with a payload object that has only `databasePath = "C:\a.accdb"`
- **Then** the returned target is `"C:\a.accdb"`
- **When** called with a payload that has `sourcePath = "C:\b.accdb"` and no `databasePath`
- **Then** the returned target is `"C:\b.accdb"`
- **When** called with a payload that has `backendPath = "C:\c.accdb"` and no `databasePath`/`sourcePath`
- **Then** the returned target is `"C:\c.accdb"`
- **When** called with an empty payload
- **Then** the returned target is empty (`""` or `$null` — the test pins whichever the production function returns)

#### Scenario: the original function `Resolve-ReadActionDatabase` still produces the right target via the new helper

- **Given** the AST of `scripts/dysflow-access-runner.ps1`
- **When** the test verifies that `Resolve-ReadActionDatabase` calls
  `Resolve-ReadActionTargetPath` (or the equivalent path-resolution expression)
- **Then** the call exists
- **And** no textual-order assertion is made on the original function body

> The original 1 test is replaced by 1 behavior test (priority order) plus
> 1 AST-level call-existence check (no source-text coupling). Net Pester
> count is preserved (1 in / 1+ in — extra tests acceptable if they cover
> additional scenarios from the spec).

## Requirement R4 — AST extraction is loader-only

No Pester test under `scripts/tests/` may use AST to read a function body
text, a list of source statements in order, or a regex match against
`$script:ExtractedText`. AST `FindAll` / `Find` calls are only used to locate
function definitions and Invoke-Expression them into the test scope.

#### Scenario: grep over Pester tests finds no `Get-Content -Raw` followed by `Should -Match` against PowerShell source

- **Given** `scripts/tests/*.Tests.ps1`
- **When** a structural check looks for the source-text pattern (`$script:X | Should -Match` where `$script:X` is derived from `Get-Content -Raw`)
- **Then** the pattern is absent (or only present where it tests a documented exception with a regression note)

> This is the regression guard for the refactor itself: a future change that
> re-introduces source-text assertions will trip this quality gate.
