# Proposal: Decompose dysflow-vba-manager.ps1 Dispatcher

## Intent

`scripts/dysflow-vba-manager.ps1` is a **3263-line monolithic dispatcher**. All ten action arms
(`Export`, `Import`, `Delete`, `List-Objects`, `Exists`, `Run-Procedure`, `Run-Tests`, `Compile`,
`Generate-ERD`, `Fix-Encoding`) live as 12–120-line inline blocks inside a single `try/finally` at
lines 2924–3258, dispatched by an `if/elseif` chain that reads script-scoped globals (`$session`,
`$normalizedModules`, `$ModulesPath`, `$Json`, `$importCreatedNewComponents`) directly.

This is the **#1 weakness** in the repo's technical-debt assessment: the most critical VBA-sync
logic — module import/export, encoding conversion, COM session handling — has the **weakest test
coverage**. The Pester suite covers only ~17 pure helpers plus two bounded-process tests; every
action dispatch arm is untested, and the existing structural tests assert on **raw source text**
(`$script:SourceText | Should -Match '...'`) — exactly the implementation-coupled smell our testing
philosophy rejects. The vitest companion (`test/scripts-vba-manager.test.ts`) navigates function
bodies via `script.split("\n")` and asserts `toContain(...)`, equally brittle.

We fix this **now**, before more logic accretes on the monolith, by replicating the proven **P6
extraction pattern** already landed for `dysflow-access-runner.ps1` (PR #383): extract each
dispatcher arm into a named `Invoke-*` function with explicit parameters, test it via AST
extraction + I/O-stub seams, and replace the brittle wiring tests with behavior-preserving
change-detectors.

**Success looks like**: every action arm is an independently testable `Invoke-*` function with
behavioral Pester coverage; observable behavior of the script is **byte-for-byte unchanged**; the
brittle source-text and `split("\n")` assertions are gone; future VBA-sync work has a refactor-safe
foundation.

## Scope

### In Scope
- Extract the 10 dispatcher arms (lines 2924–3258) into named `Invoke-*` functions, each receiving
  all required state as **explicit parameters** (no implicit script-scope access).
- Reduce the dispatcher `if/elseif` chain to a thin router that calls the extracted functions.
- Add behavioral Pester tests per extracted function using the P6 pattern (AST extraction via
  `[Parser]::ParseFile` + `Invoke-Expression`, I/O stubbed through `function script:` overrides).
- Replace the brittle source-text Pester assertions and the `test/scripts-vba-manager.test.ts`
  `split("\n")` assertions with **wiring change-detectors** (same transformation P6 did for
  `access-runner.ts`).

### Out of Scope
- **External CLI signatures** of the script (the `param()` block, accepted `-Action` values,
  parameter names) — UNCHANGED. Callers (MCP adapter, CLI) see an identical interface.
- **MCP tool contract** — no tool name, schema, input, or output shape changes.
- **Access behavior** — COM/DAO sequences, encoding pipeline, retry semantics preserved exactly.
- The C# `RotManager` class and `Open-AccessDatabase`/`Close-AccessDatabase` session machinery —
  not refactored in this change (high risk, no test seam yet; deferred).
- New features, new actions, performance work, or any behavior change. This is a **pure refactor**.

## Central Invariant

**Observable behavior does not change** — this is a pure internal reorganization plus tests. The
north star from `docs/testing/testing-philosophy.md` applies directly: *a test must survive any
internal refactor that preserves observable behavior.* No existing behavioral test should break. If
a test breaks **only because it was coupled to source text or call order**, the test is the defect —
it gets migrated to a behavioral or wiring-change-detector form, not preserved as-is.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None. No spec-level requirement changes. The script's behavior, CLI surface, and MCP contract are
identical before and after.

## Approach

Land as **7 stacked-to-main PRs**, each **≤ 400 changed lines**, ordered from lowest coupling/risk
to highest (Import last). Each slice follows the **strict-TDD P6 cycle**:

1. **Baseline green** — run `pnpm test:ps1` (Pester) and `pnpm test` (vitest) to confirm the suite
   passes before touching anything.
2. **Behavioral Pester first (RED)** — write the behavioral test for the not-yet-extracted
   function (AST extraction will fail to find it → red).
3. **Extract** — move the inline arm into the named `Invoke-*` function with explicit parameters;
   reduce the dispatcher arm to a one-line call.
4. **GREEN** — Pester + vitest pass.
5. **Migrate wiring tests** — replace the brittle source-text / `split("\n")` assertions covering
   the touched arm with wiring change-detectors.

| Slice / PR | Actions extracted | Source lines | Est. PR size | Risk |
|---|---|---|---|---|
| **1** | `Invoke-ExportAction` | 2961–3007 | ~250L | Low |
| **2** | `Invoke-ListObjectsAction`, `Invoke-ExistsAction` (read-only) | 3128–3158 | ~200L | Very Low |
| **3** | `Invoke-GenerateErdAction` (independent, no COM session) | 3204–3240 | ~200L | Low |
| **4** | `Invoke-DeleteAction` | 3099–3126 | ~200L | Low |
| **5** | `Invoke-CompileAction`, `Invoke-RunProcedureAction` | 3160–3202 | ~250L | Low |
| **6** | `Invoke-RunTestsAction`, `Invoke-FixEncodingAction` (encoding) | 3174–3186, 3242–3258 | ~250L | Low-Medium |
| **7** | `Invoke-ImportAction` (largest, retry loop) | 3008–3097 | ~400L | Medium |

Order rationale: `Generate-ERD` and `Fix-Encoding` (Src path) skip the COM session, so they are the
easiest to seam. `Import` carries the retry loop and the `$importCreatedNewComponents` flag, so it
lands last with the most test scaffolding established. Each PR merges to main in order; later slices
do not block earlier ones at the file level beyond the shrinking dispatcher.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/dysflow-vba-manager.ps1` | Modified | Add 10 `Invoke-*` functions; dispatcher becomes a thin router (3263L → reorganized, net larger from function scaffolding) |
| `scripts/tests/dysflow-vba-manager.Tests.ps1` | Modified | Add behavioral tests per `Invoke-*`; remove source-text `Should -Match` assertions |
| `test/scripts-vba-manager.test.ts` | Modified | Replace `split("\n")` + `toContain` assertions with wiring change-detectors |
| `scripts/dysflow-access-runner.ps1` | Reference only | P6 extraction pattern source |
| `scripts/tests/dysflow-access-runner.Tests.ps1` | Reference only | P6 Pester test pattern source |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Script-scope coupling: extracted function misses an implicit `$session`/`$normalizedModules`/`$ModulesPath`/`$Json` dependency | Medium | Pass ALL state as explicit params; behavioral Pester test exercises the real arm logic and fails if a param is missing |
| `$importCreatedNewComponents` flag leaks: Import arm sets a script-scope flag that triggers `Save-VbaProjectModules` | Medium | `Invoke-ImportAction` returns the signal in its result object; caller reads the return, not a global. Pester test asserts the flag round-trips |
| Encoding (mojibake) regression: `Convert-AnsiToUtf8NoBom` / `Convert-Utf8ToAnsiTempFile` pipeline in Export/Import | Medium | Slice 6 + 7 add behavioral encoding tests over `.bas`/`.cls`/`.form.txt` fixtures BEFORE extraction; assert byte content, not call order |
| `RotManager` C# `Add-Type` idempotency guard disturbed | Low | Out of scope — session machinery not refactored; guard `(-not ([PSTypeName]"RotManager").Type)` untouched |
| Brittle existing tests block the refactor | Medium | Migrate the source-text / `split("\n")` assertions to behavioral/wiring form as part of the same slice that touches the arm |
| Baseline not actually green before starting | Low | Step 1 of every slice runs `pnpm test:ps1` + `pnpm test` and confirms green before any edit |
| Production runtime contamination | Low | HARD RULE: never touch `%LOCALAPPDATA%\dysflow` or OpenCode MCP config; all validation runs against repo test fixtures / `test-runtime/` |

## Rollback Plan

Each PR is independently revertable via `git revert <merge-commit>` on main. Stacked-to-main order
means a revert restores the inline arm for that action and drops its `Invoke-*` function plus tests;
no data migration, no config schema change, no CLI/MCP surface impact.

## Verification

- Each slice validated locally on **Windows 11** with `pnpm test:ps1` (Pester) **and** `pnpm test`
  (vitest) — both green before and after.
- COM-dependent integration paths remain SKIPPED (require live Access); behavioral tests use stub
  seams, not live COM.
- Final state: dispatcher is a thin router; all 10 arms are `Invoke-*` functions with behavioral
  coverage; no source-text or `split("\n")` assertions remain.

## Success Criteria

- [ ] All 10 dispatcher arms extracted into named `Invoke-*` functions with explicit parameters
- [ ] Dispatcher `if/elseif` chain reduced to thin one-line-per-arm routing
- [ ] Each `Invoke-*` has behavioral Pester coverage via the P6 AST-extraction + stub-seam pattern
- [ ] All source-text `Should -Match` assertions removed from `dysflow-vba-manager.Tests.ps1`
- [ ] `test/scripts-vba-manager.test.ts` `split("\n")` assertions replaced with wiring change-detectors
- [ ] Each of the 7 PRs lands under 400 changed lines
- [ ] `pnpm test:ps1` and `pnpm test` pass green after every slice on Windows 11
- [ ] No change to CLI param surface, MCP tool contract, or Access behavior
