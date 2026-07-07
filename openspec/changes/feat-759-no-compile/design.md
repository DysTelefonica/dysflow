# Design: feat-759-no-compile

**Change**: `feat-759-no-compile` · **GH**: #759 (comment 4896478041) · **Version**: v1.19.0 · **Branch**: `fix/mcp-friction-consolidation-v1.18`
**Delivery**: 2 chained PRs (PR-1 = Slice 1; PR-2 = Slices 2 + 3 + 4). Strict TDD per `web-tdd-philosophy` adapted to the dysflow hex/port model in `docs/testing/testing-philosophy.md`.

## Why a design for this epic

Four slices across TS (~20 files) + PowerShell (`dysflow-vba-manager.ps1`) + tests (~14 files) + docs (7 files). Roughly **1500 LOC changed across 30+ files**, with three independent axes of break: (a) a direct MCP tool disappears, (b) two schema properties stop being accepted, (c) a hard-coded Access `acCmdCompileAndSaveAllModules` call becomes a structurally different `acCmdSaveAllModules`. The design MUST lock down the per-slice attack plan before implementation starts because a misordered merge leaves consumers on a release that *removed the tool but kept the parameter* (or vice versa), which is worse than either state alone. Test discipline: per `web-tdd-philosophy` Hard Rules, every slice ships its RED tests in the SAME PR that flips them GREEN — never "fix the test later" — and the broken-project fixture is the regression-proofing anchor that survives any behaviour-preserving refactor of the persistence path.

## Module layout (TS side)

```
src/
  adapters/mcp/
    mcp-tool-registry.ts        # Slice 3: drop compile_vba from VBA_SYNC_TOOL_NAMES
    dispatch-routes.ts          # Slice 3: drop compile_vba route
    dispatch-factory.ts         # Slice 3: drop compile_vba branch mention
    schemas/vba-sync-schemas.ts # Slice 2: drop compile/rollbackOnCompileFail; Slice 3: drop compile_vba schema
    tool-parity-registry.ts     # Slice 3: drop compile_vba description
    vba-sync/
      vba-execution-adapter.ts  # Slice 2: drop dead params.compile; Slice 3: drop EXECUTION_MAPPINGS.compile_vba
      vba-sync-adapter.ts       # Slice 3: drop handles("compile_vba") + execute branch
      vba-modules-adapter.ts    # Slice 2: drop COMPILE_MAPPING + post-import compile block + rollbackOnCompileFail
  shared/validation/
    schema-props.ts             # Slice 2: drop SCHEMA_PROPS.compile
    http-schemas.ts             # Slice 2: drop compile from HTTP mirror
  adapters/http/server.ts       # Slice 2: drop compile param mirror

scripts/
  dysflow-vba-manager.ps1       # Slice 1: 126 → 280 at :2205 / :2247 / drop :2662
                                # Slice 3: drop Invoke-CompileAction (:4252), Invoke-CompileVbaProject (:2848), New-CompileFailureResult (:2821)

tests/ (mirror the production tree)
  adapters/vba-sync/*.test.ts            # Slice 2 + 3
  adapters/mcp/*.test.ts                 # Slice 2 + 3
  shared/validation/*.test.ts            # Slice 2
  core/contracts/vba-sync-port.test.ts   # Slice 2 + 3
  quality-gates/*.test.ts                # Slice 3
  docs/agents-mcp-workflow-recipes.test.ts  # Slice 4
  e2e/
    import-modules-broken-project.e2e.test.ts  # Slice 1 — NEW (regression anchor)
    compile-error-capture.e2e.test.ts          # Slice 3 — DELETED
    import-modules-*.e2e.test.ts, form-codebehind-stale-import.e2e.test.ts  # Slice 2 + 3

openspec/
  specs/vba-manager-actions/spec.md        # Slice 4: drop compile reqs; ADD save-only persistence req
  specs/access-operation-contracts/spec.md # Slice 4: drop compile verbs

docs/                                      # Slice 4 sweep
README.md, AGENTS.md, docs/mcp-examples.md, docs/release-checklist.md,
docs/testing/e2e-battery.md, docs/testing/repo-quality-gates.md, docs/tech-debt/TRACKING.md
CHANGELOG.md                              # v1.19.0 entry closes the loop
```

## Module layout (PS side)

Exact sites in `scripts/dysflow-vba-manager.ps1` (line numbers verified by direct read):

| Line | Site | Slice | Action |
|---|---|---|---|
| `:2205` | `Remove-AccessObjectOrComponent` — bare `RunCommand(126)` inside `try { ... } catch { Write-Debug ... }` (no fallback) | 1 | `RunCommand(126)` → `RunCommand(280)` |
| `:2247` | Force/friction branch (after `RunCommand(4)` compact) — bare `RunCommand(126)` inside `try { ... } catch {}` | 1 | `RunCommand(126)` → `RunCommand(280)` |
| `:2662` | `Save-VbaProjectModules` first attempt (the `:2668` `DoCmd.RunCommand(280)` is already the fallback) | 1 | drop the `:2662` attempt; keep the `:2668` fallback as the canonical save path |
| `:2821` | `function New-CompileFailureResult` — emits `code = "VBA_COMPILE_ERROR"` envelope | 3 | remove function |
| `:2848` | `function Invoke-CompileVbaProject` (incl. `:2859` first 126 + `:2873` retry 126) | 3 | remove function + the two 126 sites disappear with it |
| `:4252` | `function Invoke-CompileAction` — top-level compile dispatcher (calls `Invoke-CompileVbaProject`) | 3 | remove function |

**Replacement pattern** (Slice 1): every `RunCommand(126)` site in the persistence paths becomes a bare `RunCommand(280)`. No fallback needed — 280 saves modules without compiling, so it cannot fail because of pre-existing project compile state.

## Data flow — Slice 1 (decoupling 126 → 280)

**Before (broken):** caller → `delete_module(force:true)` → TS adapter → PS runner → `Remove-AccessObjectOrComponent` → `VBComponents.Remove(component)` → `try { RunCommand(126) } catch { Write-Debug }` (silent on broken projects) → `Resolve-ExistingComponentName` re-check fires → throw `"Active lock detected: the VBA component 'X' remains in the project after deletion attempt."` → TS adapter surfaces `MCP_REMOVE_FAILED` → caller cannot proceed.

**After Slice 1:** caller → `delete_module(force:true)` → TS adapter → PS runner → `Remove-AccessObjectOrComponent` → `VBComponents.Remove(component)` → `RunCommand(280)` (save-only, no compile coupling) → `Resolve-ExistingComponentName` re-check confirms absence → return `status:"ok"` → caller proceeds. `import_modules` against the same broken project then succeeds because there is no longer a failed-deletion residue and `Save-VbaProjectModules` standardised on the `:2668` 280 path. No compile probe, no error envelope, no Active-lock.

## Data flow — Slice 2 (drop compile param)

**Before:** caller → `import_modules({ compile: true })` → Zod schema (`additionalProperties:false` currently allows `compile` + `rollbackOnCompileFail`) → adapter → `vba-modules-adapter.ts` post-import compile block fires (`truthy(params.compile)`) → PS runner invokes `Invoke-CompileVbaProject` → on failure, `rollbackOnCompileFail:true` rolls back imported modules.

**After Slice 2:** caller → `import_modules({ compile: true })` → Zod schema (`additionalProperties:false` rejects unknown `compile`) → adapter returns `{ ok: false, error: { code: "MCP_INPUT_INVALID", message: "Unknown property: compile" } }` BEFORE any PS invocation. Same path for `rollbackOnCompileFail: true`. `test_vba` schema does not expose `compile` at all; the dead `truthy(params.compile)` check in `executeTestVba` is removed (it was unreachable from MCP and is now also unreachable from any internal caller).

## Data flow — Slice 3 (drop compile_vba tool)

**Before:** caller → MCP `tools/list` includes `compile_vba` (count 68) → caller invokes `compile_vba` → dispatch resolves to `dispatch-routes.compile_vba` (`{ kind: "vba-sync", mutatesBinary: true }`) → `vba-sync-adapter.handles("compile_vba")` → `EXECUTION_MAPPINGS.compile_vba` → PS `Invoke-CompileAction` → `Invoke-CompileVbaProject` → `RunCommand(126)` (sites `:2859` / `:2873`) → on failure: `New-CompileFailureResult` envelope with `code: "VBA_COMPILE_ERROR"` → TS adapter maps to `error.details.code = "VBA_COMPILE_ERROR"`.

**After Slice 3:** caller → MCP `tools/list` does NOT include `compile_vba` (count 67) → caller invokes `compile_vba` → dispatch returns `tool-not-found` (`-32601: Method not found`) BEFORE any PS invocation. No `VBA_COMPILE_ERROR` envelope is constructible; `New-CompileFailureResult` no longer exists; `EXECUTION_MAPPINGS.compile_vba` key no longer exists; `VBA_SYNC_TOOL_NAMES`, `MCP_TOOL_ROUTES`, `tool-parity-registry`, `dispatch-factory`, `vba-sync-adapter.handles/execute`, and `vba-sync-schemas.compile_vba` schema are all empty of the name. `dysflow_get_capabilities.toolsVisible` drops 68 → 67.

## Error model

After Slice 3 the error taxonomy drops `VBA_COMPILE_ERROR`. Remaining codes that touch mutation paths (verified per current `src/core/errors/` + `src/adapters/vba-sync/error-mapping.ts`):

| Code | Surface | Status after Slice 3 |
|---|---|---|
| `MCP_INPUT_INVALID` | Schema-level rejection (Zod `additionalProperties:false`) | Unchanged; now also rejects `compile` / `rollbackOnCompileFail` from Slice 2 |
| `VBA_IMPORT_PHASE_FAILED` | Adapter-level import phase failure | Unchanged |
| `VBA_ACCESS_LOCKED` / `ACCESS_DATABASE_LOCKED` | DB lock collision | Unchanged |
| `VB_NAME_MISMATCH`, `DUPLICATE_OPTION_DIRECTIVE`, `IMPORT_TRUNCATED` | Per-module typed errors | Unchanged |
| `VBA_COMPILE_ERROR` | Compile-time project failure | **Removed** — unreachable by construction |
| `RUNNER_INVALID_JSON` | Result sentinel missing | Unchanged (orthogonal) |

The contract change is additive-only at the call site: every existing error code keeps the same shape; `VBA_COMPILE_ERROR` simply no longer appears in any envelope.

## Test discipline (web-tdd-philosophy adapted to dysflow hex/port model)

Per `web-tdd-philosophy` Hard Rules + `testing-philosophy.md` "test at the ports": mock only the I/O seam (Access COM runner / filesystem), assert on observable outcomes (return value, persisted state, capability surface), never on internal call order or private flags.

### Slice 1 — RED → GREEN → REFACTOR

- **RED — Pester (`scripts/tests/dysflow-vba-manager.Tests.ps1`):** new `Describe "Remove-AccessObjectOrComponent — broken-project persistence"` block. Builds a fake `$AccessApplication` whose `RunCommand(126)` returns normally BUT whose `VBComponents.Remove` triggers a re-check that would surface the Active-lock (the script's `Resolve-ExistingComponentName` returns the module name). Asserts the call ends in `status:"ok"` and that `RunCommand(280)` was invoked on the `DoCmd` object (NOT `RunCommand(126)` on the application). Three paths: (happy) clean delete; (sad) deleted-but-Active-lock-check fires; (edge) `RunCommand(280)` itself throws → outer fallback loop kicks in.
- **RED — real-Access E2E (`test/e2e/import-modules-broken-project.e2e.test.ts`):** constructs a project config + a fixture `.cls` whose body is `Sub Bad : End Sub` (intentionally incomplete — `Sub` with no `()` and no body — guaranteed not to compile). Asserts end-to-end: `delete_module(force:true)` succeeds; subsequent `import_modules` succeeds; `verify_code` reports `ok: true` against the now-broken-but-persisted project. This is the **regression anchor**: if Slice 1's PS changes regress, this E2E fails. **Must run on Windows + real Access** (no mocks on the runner path).
- **GREEN:** replace `RunCommand(126)` at `:2205` and `:2247` with `RunCommand(280)`; drop the `:2662` first attempt in `Save-VbaProjectModules`. No new helpers — the three sites stay uniform and audit-friendly.
- **REFACTOR:** none warranted at this layer; the diff is already minimal.

### Slice 2 — RED → GREEN → REFACTOR

- **RED — vitest (`test/adapters/mcp/schemas/vba-sync-schemas.test.ts`):** new atoms asserting (a) `import_modules({ compile: true })` produces `MCP_INPUT_INVALID` from Zod `additionalProperties:false`; (b) `import_modules({ rollbackOnCompileFail: true })` produces the same; (c) `import_all({ compile: true })` produces the same; (d) `test_vba` schema's property keys do NOT include `compile`.
- **RED — vitest (`test/shared/validation/schema-props.test.ts`):** asserts `SCHEMA_PROPS.compile === undefined` after import (the import-side error is the catch).
- **RED — vitest (`test/adapters/vba-sync/vba-modules-adapter.test.ts`):** asserts the post-import compile branch is gone — the adapter returns the import result without invoking any compile step.
- **GREEN:** drop `compile` and `rollbackOnCompileFail` from `import_modules` / `import_all` Zod schemas; drop `SCHEMA_PROPS.compile` from `schema-props.ts:144–148`; drop the dead `truthy(params.compile)` check in `executeTestVba`; drop `COMPILE_MAPPING` and the post-import compile block in `vba-modules-adapter.ts:26–31`; drop the HTTP mirror in `http-schemas.ts` + `http/server.ts`.
- **REFACTOR:** none — the diff is mechanical removal.

### Slice 3 — RED → GREEN → REFACTOR

- **RED — vitest (`test/adapters/mcp/mcp-tool-registry.test.ts` + `dysflow-get-capabilities-tool.test.ts`):** asserts `VBA_SYNC_TOOL_NAMES` does NOT contain `compile_vba`; `MCP_TOOL_ROUTES` has no `compile_vba` key; `EXECUTION_MAPPINGS` has no `compile_vba`; `dysflow_get_capabilities.toolsVisible` decreases by exactly 1.
- **RED — vitest (`test/adapters/vba-sync/vba-execution-adapter.test.ts`, `vba-sync-adapter.test.ts`):** asserts `handles()` returns `false` for `compile_vba`; `execute()` branch is unreachable; `EXECUTION_MAPPINGS.compile_vba` access throws `undefined`.
- **RED — vitest (`test/shared/validation/schema-props.test.ts` + `test/adapters/mcp/schemas/vba-sync-schemas.test.ts`):** asserts no `compile_vba` schema is exported; `tool-parity-registry.test.ts` asserts no `compile_vba` description entry.
- **RED — Pester (`scripts/tests/dysflow-vba-manager.Tests.ps1`):** asserts `Invoke-CompileAction`, `Invoke-CompileVbaProject`, `New-CompileFailureResult` no longer exist as script functions (AST scan).
- **RED — vitest (`test/e2e/compile-error-capture.e2e.test.ts` deletion + `test/quality-gates/mcp-e2e-compile-vba-mojibake-pin.test.ts` deletion):** confirm both files are removed and no other test references them by path.
- **GREEN:** remove `compile_vba` from `mcp-tool-registry.ts:11`, `dispatch-routes.ts`, `dispatch-factory.ts`, `tool-parity-registry.ts`, `vba-execution-adapter.ts:25` (EXECUTION_MAPPINGS), `vba-sync-adapter.ts` (`handles` + `execute`), `vba-sync-schemas.ts:161–165` (schema). Delete the two E2E/quality-gate test files. Drop `VBA_COMPILE_ERROR` from the adapter error-mapping and from the PS runner's compile functions. Remove `Invoke-CompileAction` (`:4252`), `Invoke-CompileVbaProject` (`:2848`, plus its `:2859` / `:2873` 126 sites), `New-CompileFailureResult` (`:2821`) from `scripts/dysflow-vba-manager.ps1`. Update `E2E_testing/mcp-e2e.mjs` (drop `compile:false` and the `compile_vba` call at `:280`).
- **REFACTOR:** the action-map fixtures (`mcp-tool-action-map`, `mcp-tool-action-map-source`) lose the `compile_vba` entry; one-line updates.

### Slice 4 — Docs sweep

Not really RED/GREEN — verification is the audit script at the end:

```
grep -rnE '\bcompile\b' \
  README.md AGENTS.md docs/mcp-examples.md docs/release-checklist.md \
  docs/testing/repo-quality-gates.md docs/testing/e2e-battery.md \
  docs/tech-debt/TRACKING.md \
  src/ scripts/ openspec/specs/vba-manager-actions/spec.md \
  openspec/specs/access-operation-contracts/spec.md \
  src/adapters/mcp/tool-parity-registry.ts
# Expected: 0 matches. (compilerOptions from tsconfig is a known false positive in a separate file.)
```

`openspec/specs/vba-manager-actions/spec.md` and `openspec/specs/access-operation-contracts/spec.md` get the deltas from the spec phase plus the v1.19.0 CHANGELOG entry closing the loop. `docs/archive/**` and historical `CHANGELOG.md` entries retain `compile` references as record.

## Invariants preserved

1. **Existing callers of `import_modules`, `import_all`, `delete_module`, `test_vba`** (without compile params) — completely unaffected. Slice 2's param removal is purely additive at the rejection boundary.
2. **Existing callers of every other tool** (`list_tables`, `get_schema`, `query_execute`, `verify_code`, `link_tables`, `relink_tables`, `compact_repair`, `seed_fixture`, `teardown_fixture`, `create_table`, `drop_table`, `dysflow_get_capabilities`, etc.) — completely unaffected. Slice 3's tool removal touches only `compile_vba` and the registry/route/description artefacts.
3. **The Active-lock bug must be REPRODUCIBLE without the fix (test the test) BEFORE the fix ships, then NOT reproducible after.** This is the cardinal invariant of Slice 1. The Pester and E2E RED tests assert the bug is fixed by asserting the symptom is absent — if either test could pass on the broken code, the test is wrong.
4. **The broken-project fixture E2E** (`test/e2e/import-modules-broken-project.e2e.test.ts`) **runs on Windows + Access** — no mocks on the runner path. The persistence layer is not mockable for this regression; it must hit real Access.

## Refactor-safety check

Per `testing-philosophy.md`: tests assert OUTCOME, not IMPLEMENTATION. The RED tests in every slice assert observable outcomes (status envelopes, capability counts, function existence by AST scan, behaviour on a broken project) — never "the call sequence was X then Y". So a behaviour-preserving refactor of, say, `Remove-AccessObjectOrComponent` (renaming helpers, reordering the `try`/`catch`, swapping `Resolve-ExistingComponentName` for an equivalent check) will NOT break the suite. If it does, the test is wrong.

What the audit script catches if a future commit reverts:
- **Slice 1 reverted (restore 126):** the broken-project E2E fails because Active-lock resurfaces; the Pester atom fails because `RunCommand(126)` was invoked instead of `RunCommand(280)`; the audit grep re-finds the 126 sites.
- **Slice 2 reverted (restore compile param):** the vitest atoms fail because `import_modules({ compile: true })` no longer returns `MCP_INPUT_INVALID`; the schema test fails because `SCHEMA_PROPS.compile` is defined again.
- **Slice 3 reverted (restore compile_vba):** the tool-registry test fails because `compile_vba` is back in `VBA_SYNC_TOOL_NAMES`; `toolsVisible` is back at 68; the Pester AST scan finds `Invoke-CompileAction` again; the audit grep re-finds `VBA_COMPILE_ERROR` references.
- **Slice 4 reverted (restore doc references):** the audit script returns matches; the v1.19.0 CHANGELOG entry is gone.

Every regression is caught at multiple layers (test + grep + capability surface) so no single missed signal allows a quiet rollback.

## Sub-slice risks

| Slice | Risk | Mitigation |
|---|---|---|
| 1 | `Save-VbaProjectModules` callers outside the mutation path may rely on the 126-first behaviour (some callers expect "save-after-compile" semantics for downstream consumers) | Grep `Save-VbaProjectModules` callers; only the 3 sites listed are mutation persistence; all three are in scope. Verified. |
| 1 | The `:2205` site is inside a `try { ... } catch { Write-Debug }` — removing the 126 without adding a fallback leaves the outer catch to absorb a 280 failure. This is acceptable: 280 is structurally less likely to fail than 126 (no compile coupling). | Add an `Out-Null` or `try/catch` wrapper around the new 280 line matching the existing style. |
| 2 | HTTP mirror (`http-schemas.ts`, `http/server.ts`) — easy to forget; HTTP API exposes the same params as MCP | Test asserts `POST /vba/import` with `compile:true` returns HTTP 400 with `MCP_INPUT_INVALID`; same assertion for MCP. |
| 2 | `rollbackOnCompileFail` removal is a behaviour loss for consumers relying on atomic import — the v1.19.0 CHANGELOG entry must call this out explicitly | Migration note in CHANGELOG. |
| 3 | `tool-parity-registry.ts` description is consumed by other tools (UI, docs generator) — removing it must not orphan a generator | grep consumers; update or remove downstream generators. |
| 3 | `vba-inline-execution` ALSO compiles a temp module internally — DO NOT touch (different concern, per `openspec/specs/vba-inline-execution/spec.md`). | Out of scope per proposal. |
| 4 | `docs/archive/**` references must stay untouched; the audit script must explicitly exclude them | Audit script uses explicit path allowlist, not a recursive glob. |
| 4 | `compilerOptions` from `tsconfig.json` is a known false-positive — the audit grep is `\bcompile\b`, which DOES match "compileOptions". | Run the audit on `src/` while excluding `tsconfig*.json`. |

## Out of scope confirmation

- `verify_code` stays (read-only source/binary diff). Untouched.
- `CHANGELOG.md` historical entries at lines 186, 193, 290–308, 366, 419, 459, 467, 514, 530, 592, 611, 743, 829, 1257, 1445, 1941 stay (record, not change).
- `docs/archive/**` stays (historical record).
- `openspec/changes/archive/**` historical SDD artifacts stay.
- `openspec/specs/vba-inline-execution/spec.md` stays (inline execution compiles a temp module — different concern, no `acCmdCompileAndSaveAllModules` against the user's project).
- Bug 2 (MCP client caches old adapter version after `dysflow update`) — separate concern, tracked independently.
- `toolsVisible` count assertion: the project also adds tools over time, so the "67" count is correct only as of v1.19.0. The acceptance test asserts "drops by exactly 1" relative to the pre-PR count, not "equals 67" absolutely — guards against spurious count drift.

## Per-PR commit plan

### PR-1 = Slice 1 (non-breaking; fixes Active-lock bug)

| # | Subject | Files | ΔLOC |
|---|---|---|---|
| 1 | `test(ps): add broken-project fixture E2E for delete + import (RED)` | `test/e2e/import-modules-broken-project.e2e.test.ts` (new), `scripts/tests/dysflow-vba-manager.Tests.ps1` | +120 |
| 2 | `fix(ps): persist mutations via save-only (RunCommand 280) in delete paths (GREEN)` | `scripts/dysflow-vba-manager.ps1` (3 sites) | ≤10 |
| 3 | `test(ps): drop Pester assertion that referenced 126` | `scripts/tests/dysflow-vba-manager.Tests.ps1` | ≤15 |

PR-1 total: **3 files, ≤145 changed lines, ≤400 review budget.** Ships immediately on `staging`.

### PR-2 = Slices 2 + 3 + 4 (hard break; breaking surface + docs)

| # | Subject | Files | ΔLOC |
|---|---|---|---|
| 1 | `feat(mcp): remove compile + rollbackOnCompileFail params from import schemas (BREAKING)` | `src/adapters/mcp/schemas/vba-sync-schemas.ts`, `src/shared/validation/http-schemas.ts`, `src/adapters/http/server.ts` | ≤80 |
| 2 | `feat(mcp): drop SCHEMA_PROPS.compile and dead params.compile check` | `src/shared/validation/schema-props.ts`, `src/adapters/vba-sync/vba-execution-adapter.ts` (`executeTestVba`), `src/adapters/vba-sync/vba-modules-adapter.ts` | ≤100 |
| 3 | `feat(mcp): remove compile_vba tool end-to-end (BREAKING)` | `src/adapters/mcp/mcp-tool-registry.ts`, `dispatch-routes.ts`, `dispatch-factory.ts`, `tool-parity-registry.ts`, `schemas/vba-sync-schemas.ts`, `src/adapters/vba-sync/vba-execution-adapter.ts`, `vba-sync-adapter.ts` | ≤200 |
| 4 | `feat(mcp): drop VBA_COMPILE_ERROR from error taxonomy` | TS error-mapping, adapter tests | ≤60 |
| 5 | `chore(ps): remove Invoke-Compile* and New-CompileFailureResult from dysflow-vba-manager.ps1` | `scripts/dysflow-vba-manager.ps1` (3 functions), PS tests | ≤80 |
| 6 | `test: drop compile_vba + compile:true test cases; delete compile-error-capture and mcp-e2e-compile-vba-mojibake-pin tests` | ~10 vitest files + 2 deletions | ≤250 |
| 7 | `chore(e2e): drop compile:false and compile_vba from mcp-e2e.mjs` | `E2E_testing/mcp-e2e.mjs` | ≤10 |
| 8 | `docs: sweep compile references from README, AGENTS, mcp-examples, release-checklist, e2e-battery, repo-quality-gates, TRACKING, tool-parity-registry, mcp-tool-contracts` | 7 docs files + 2 source files | ≤200 |
| 9 | `docs(openspec): drop compile requirements from vba-manager-actions and access-operation-contracts specs; add Save-only persistence requirement` | `openspec/specs/vba-manager-actions/spec.md`, `openspec/specs/access-operation-contracts/spec.md` | ≤100 |
| 10 | `docs(changelog): add v1.19.0 entry closing the compile surface loop` | `CHANGELOG.md` | ≤30 |

PR-2 total: **~30 files, ≤1110 changed lines across 10 commits; per-commit ≤400 lines.** Review budget per commit: 400 lines (force-chained). The maintainer pushes commit 11 (tag `v1.19.0` + GitHub release) in a separate push per the GH comment.

PR boundary keeps Slice 1 reviewable as a focused bug fix and prevents consumers from sitting on a release that already removed the tool but still had the parameter (or vice versa).

## Strict discipline notes

- All PS line numbers verified by direct file read against `scripts/dysflow-vba-manager.ps1` (4760 lines). Confirmed: `:2205` (delete bare 126), `:2247` (force/friction bare 126), `:2662` (Save-VbaProjectModules first attempt 126), `:2668` (the existing 280 fallback — **note: not `:2669` as the issue comment said; this proposal corrects that drift**), `:2821` (New-CompileFailureResult), `:2848` (Invoke-CompileVbaProject declaration), `:2859` + `:2873` (the two 126 sites inside Invoke-CompileVbaProject), `:4252` (Invoke-CompileAction).
- The change folder already exists at `openspec/changes/feat-759-no-compile/` with `exploration.md`, `proposal.md`, and the two spec deltas. This `design.md` completes the change folder for the design phase.
- No memory save required — this design synthesises prior SDD artefacts (exploration + proposal + specs) plus verified line numbers; no new non-obvious discoveries warrant a `mem_save`.
- No implementation has been started. This is a design artefact only.