# Design: Decompose dysflow-vba-manager.ps1 Dispatcher

## Technical Approach

Replicate the P6 pattern proven in `dysflow-access-runner.ps1` (PR #383): extract each
of the 10 inline dispatcher arms (lines 2961-3258) into a named `Invoke-*Action` function
that receives ALL state as explicit parameters — zero script-scope reads. The dispatcher
`try/finally` becomes a thin router: each `if/elseif` arm reduces to a one-line call
`$result = Invoke-XxxAction -...`. Behavior is unchanged (pure refactor). Each function is
tested behaviorally via AST extraction + `Invoke-Expression` with I/O collaborators stubbed
through `function script:` overrides and `PSCustomObject` + `ScriptMethod` fakes.

The `finally` block (Close-AccessDatabase) and pre-dispatch setup (Resolve-* paths,
ModuleNamesJson parsing → `$normalizedModules`) stay in the router; only the per-arm body moves.

## Architecture Decisions

### Decision: Each arm becomes a pure `Invoke-*Action` with explicit params

**Choice**: Pass `$session`, `$normalizedModules`, `$ModulesPath`, `$Json`, etc. as parameters.
**Alternatives**: keep reading script-scope; pass a single `$Context` hashtable.
**Rationale**: Explicit params make the implicit coupling visible and testable — a missing
dependency fails the behavioral test immediately. A `$Context` bag would re-hide coupling.
Matches P6 (`Invoke-QuerySqlReadAction -Database -Sql`).

### Decision: `Invoke-ImportAction` returns a result object, not a script-scope flag

**Choice**: Return `[pscustomobject]@{ CreatedComponentNames=[string[]]; Total=int }`.
The router calls `Save-VbaProjectModules` when `$result.CreatedComponentNames.Count -gt 0`.
**Alternatives**: keep mutating `$script:importCreatedNewComponents`; `[ref]` out-param.
**Rationale**: The flag was the #1 leak risk. A return object is the same shape `Import-VbaModule`
already uses (`CreatedNewComponent`/`RequiresExplicitSave`), keeps the function pure, and lets
the test assert the signal directly. The retry loop and `$lastErrors` accumulation stay INSIDE
`Invoke-ImportAction`; only the post-loop Save decision moves to the router.

### Decision: COM/IO seams stubbed via `function script:` override (P6)

**Choice**: Tests override helper functions (`Export-VbaModule`, `Import-VbaModule`,
`Get-FrontendInventory`, `Remove-AccessObjectOrComponent`, `Save-VbaProjectModules`,
`Export-DataStructure`, `Invoke-AccessProcedure*`, `Fix-EncodingInSrc/Access`) and pass a
`$session`/`$vbProject` fake (`PSCustomObject` + `ScriptMethod` exposing `VBComponents.Item`,
`AccessApplication`). Assert on captured args + return, never on call order or source text.
**Rationale**: Exact P6 seam. `Open-AccessDatabase` is NOT called inside the arms — the router
opens the session and passes it in, so no COM activation in tests.

## Data Flow

    CLI/MCP ─→ router (Resolve paths, parse ModuleNamesJson → $normalizedModules)
                  │   opens $session = Open-AccessDatabase  (except ERD / Fix-Encoding Src)
                  ▼
              Invoke-XxxAction(-Session/-VbProject/-AccessApplication, -NormalizedModules, -ModulesPath, -Json, ...)
                  │   → returns result object / writes ##MODULE_RESULTS / status text
                  ▼
              router: Import only → if result.CreatedComponentNames → Save-VbaProjectModules
                  │
              finally → Close-AccessDatabase -Session

## Invoke-*Action Signatures

| Function | Parameters | Returns / Side-effect | Stubbed seams |
|----------|-----------|----------------------|---------------|
| `Invoke-ExportAction` | `-Session -NormalizedModules -ModulesPath [-Json]` | exports each target | `Export-VbaModule`, `Get-ComponentExtension`, fake `VBComponents` |
| `Invoke-ImportAction` | `-Session -NormalizedModules -ModulesPath -ImportMode [-Json]` | `[pscustomobject]@{CreatedComponentNames;Total}` + `##MODULE_RESULTS`; throws on pending | `Import-VbaModule`, `Resolve-ExistingComponentName` |
| `Invoke-DeleteAction` | `-Session -NormalizedModules [-Json]` | `##MODULE_RESULTS`; throws on failures | `Remove-AccessObjectOrComponent` |
| `Invoke-ListObjectsAction` | `-Session [-Json]` | JSON or status text | `Get-FrontendInventory` |
| `Invoke-ExistsAction` | `-Session -ModuleName [-Json]` | JSON or status text | `Get-ExistsInfo` |
| `Invoke-RunProcedureAction` | `-Session -ProcedureName -ProcedureArgsJson [-Json]` | run result JSON/text | `Convert-ProcedureArgsJson`, `Invoke-AccessProcedure` |
| `Invoke-RunTestsAction` | `-Session -ProceduresJson -ProceduresJsonFile [-Json]` | batch results JSON | `Invoke-AccessProcedureBatch`, `Get-Content` |
| `Invoke-CompileAction` | `-Session [-Json]` | compile result JSON/text | `Invoke-CompileVbaProject` |
| `Invoke-GenerateErdAction` | `-BackendPath -DestinationRoot -ErdPath -Password [-Json]` | writes .md, status text | `Export-DataStructure`, filesystem |
| `Invoke-FixEncodingAction` | `-Session -ModulesPath -NormalizedModules -Location -AccessPath -Password -AllowStartupExecution [-Json]` | counts + status | `Fix-EncodingInSrc`, `Fix-EncodingInAccess` |

Note: `-Session` carries `.VbProject` + `.AccessApplication`; arms read both off it (matches
current arms). `Invoke-FixEncodingAction` opens its own session only for `Access`/`Both` — keep
that branch INSIDE the function so the Src-only path needs no COM (router passes `$null` session).

## AST Extraction Mechanic (reusable)

Each `Describe` uses the identical P6 `BeforeAll`, parameterized only by function name:

```powershell
BeforeAll {
    $script:ManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
    $ast = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $script:ManagerPath).Path, [ref]$null, [ref]$null)
    $fnAst = $ast.FindAll({ $args[0] -is
        [System.Management.Automation.Language.FunctionDefinitionAst] -and
        $args[0].Name -eq 'Invoke-ExportAction' }, $true) | Select-Object -First 1
    if (-not $fnAst) { throw "Invoke-ExportAction not found" }
    Invoke-Expression $fnAst.Extent.Text
}
```

## Fragile Test Migration

| Current fragile asset | Replacement |
|----------------------|-------------|
| `dysflow-vba-manager.Tests.ps1` "COM cleanup — try/finally pattern in source text" (`$SourceText | Should -Match ...`, lines 78-128) | Remove. The extracted behavioral tests already prove COM cleanup behavior. Keep only structural AST "function exists" checks. |
| `test/scripts-vba-manager.test.ts` `script.split("\n")` body-navigation + `toContain` (lines 17-106) | Replace with **wiring change-detectors**: assert the dispatcher router CALLS each `Invoke-*Action` (e.g. `script.toContain("Invoke-ExportAction")` inside the `Export` arm) — proves wiring, survives internal refactor. Keep the Goal B/E detectors that test cross-cutting helpers untouched if still valid. |

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/dysflow-vba-manager.ps1` | Modify | Add 10 `Invoke-*Action` functions; reduce dispatcher arms to one-line calls; router keeps setup + finally + Import Save decision |
| `scripts/tests/dysflow-vba-manager.Tests.ps1` | Modify | Add behavioral Pester per `Invoke-*`; remove source-text `Should -Match` context |
| `test/scripts-vba-manager.test.ts` | Modify | Replace `split()`/`toContain` body navigation with wiring change-detectors |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Behavioral (Pester) | each `Invoke-*Action` routing/return | AST extract + stub seams; assert captured args + return |
| Encoding | `Import-VbaModule`/`Fix-Encoding` ANSI↔UTF8 pipeline | byte-content asserts over `.bas/.cls/.form.txt` fixtures BEFORE extracting slices 6-7 |
| Wiring (vitest) | router → `Invoke-*` delegation | change-detector `toContain` per arm |
| COM Integration | live Access | stays SKIPPED (unchanged) |

## PR Boundaries (7 slices, stacked-to-main, ≤400 lines, baseline green before/after)

Confirm explore's order: S1 Export · S2 ListObjects+Exists · S3 GenerateErd · S4 Delete ·
S5 Compile+RunProcedure · S6 RunTests+FixEncoding · S7 Import (largest, retry loop, last).
Rationale unchanged: ERD + Fix-Encoding(Src) skip COM session = easiest seam; Import carries
the retry loop + created-components signal = highest risk, lands last.

## Migration / Rollout

No data migration. Each slice is `git revert`-able independently; restores the inline arm and
drops the `Invoke-*` + tests. No CLI param, MCP tool contract, or Access behavior changes.

## Open Questions

- [ ] None blocking. `RotManager` C# (session machinery, lines 970-1153) stays OUT of scope —
      do NOT move it; the `Add-Type` idempotency guard must remain untouched.
