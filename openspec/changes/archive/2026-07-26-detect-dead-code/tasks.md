# Tasks: detect-dead-code (#705)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~380–430 (types + core impl + MCP wiring + tests + docs) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR — fits within budget if scoped tightly |
| Delivery strategy | force-chained (cached) |
| Chain strategy | stacked-to-main (only if scope grows; otherwise single PR) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Medium

## Size Exception (resolved post-implementation)

The original line-count forecast (380–430) was exceeded by the
implementation: the final tree diff came in at **~880 changed lines**
(see `verify.md` § "Source-tree diff vs the previous verify"). The user
explicitly approved a **single PR despite the >400-line budget** because
(a) the diff is overwhelmingly tests (~410 lines of new TDD coverage
across the affected modules) and (b) splitting the work would force the
reviewer to read the spec, design, and implementation in pieces
without the unified GREEN signal the focused tests provide.

This is the documented `size:exception` per the cross-project
`workload-budget` rule. No chained/stacked split is required.
Subsequent remediation commits (the review blocker fixes documented in
`verify.md`) remain scoped to the same single PR.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Core `detectDeadCode` + types in `vba-procedure-service.ts` | PR 1 | RED tests → GREEN core; pure function, no I/O |
| 2 | MCP wiring (tools.ts + contracts + schema) | PR 1 | Same PR as Unit 1 — same tool, different concern |
| 3 | Contract tests + docs | PR 1 | Same PR — final verification slice |

> `force-chained` is cached per session defaults but the actual line estimate is within budget. If scope stays scoped to the design, a single PR is sufficient. If the change grows above 450 lines, re-evaluate chained PRs.

---

## Phase 1: RED Core Tests — `vba-procedure-service.ts`

- [x] 1.1 Add RED test `detectDeadCode_unreferenced_procedure_returns_dead` in `test/core/services/vba-procedure-service.test.ts`: `ModA.UnusedProc` defined alone, call `detectDeadCode({ ModA }, { scope: "binary" })`, assert `UnusedProc` in `findings` with `risk: "Low"`, `kind: "sub"`
- [x] 1.2 Add RED test `detectDeadCode_string_literal_does_not_count`: `ModA.UnusedProc` + `ModB` with `Application.Run "UnusedProc"`, assert `UnusedProc` dead
- [x] 1.3 Add RED test `detectDeadCode_comment_does_not_count`: `ModA.UnusedProc` + `ModB` with `' TODO UnusedProc`, assert dead
- [x] 1.4 Add RED test `detectDeadCode_substring_does_not_count`: `ModA.UnusedProc` + `ModB.MyUnusedProcCaller`, assert dead
- [x] 1.5 Add RED test `detectDeadCode_cross_module_reference_omits_live`: `ModA.Producer` calls `ModB.Consumer`, assert `Consumer` absent from findings
- [x] 1.6 Add RED test `detectDeadCode_autoexec_excluded`: `AutoExec` defined with zero refs, assert absent from findings
- [x] 1.7 Add RED test `detectDeadCode_form_load_excluded`: `Form_Load` defined, zero refs, assert absent
- [x] 1.8 Add RED test `detectDeadCode_control_event_handler_excluded`: `cmdSave_Click` defined, zero refs, assert absent
- [x] 1.9 Add RED test `detectDeadCode_public_const_high_risk`: `ModA` has `Public Const MY_CONST = 42` with no refs, assert `risk: "High"` on the finding
- [x] 1.10 Add RED test `detectDeadCode_module_narrow_scope`: `ModA.UnusedA`, `ModB.UnusedB`, `ModB.UsedProc` referenced, narrow to `"ModB"`, assert only `UnusedB` returned, `risk: "Med"`
- [x] 1.11 Add RED test `detectDeadCode_evidence_includes_scanned_modules_and_snippet`: for any dead finding, assert `evidence.scannedModules` is sorted array, `evidence.definitionSnippet` is non-empty string
- [x] 1.12 Add RED regression pin `findVbaReferences_call_syntax_zero_refs`: `'Call UnusedProc` in source, `findVbaReferences` returns 0 refs for `UnusedProc`
- [x] 1.13 Add RED regression pin `findVbaReferences_application_run_zero_refs`: `Application.Run "ProcName"` in source, `findVbaReferences` returns 0 refs for `ProcName`
- [x] 1.14 Add RED regression pin `findVbaReferences_existing_2ref_case_unchanged`: existing test case with 2 references still returns 2 after the patch

## Phase 2: GREEN Core Implementation — `vba-procedure-service.ts`

- [x] 2.1 Export new types: `DeadCodeKind`, `DeadCodeRisk`, `DeadCodeFinding`, `DeadCodeReport`, `EXCLUDED_NAME_PATTERNS` from `src/core/services/vba-procedure-service.ts`
- [x] 2.2 Add `EXCLUDED_NAME_PATTERNS` regex allowlist: `AutoExec`, `Form_|Report_|Class_` lifecycle, `_[A-Z]\w+$` control events, `Auto(?:Exec|Open|Close|Exit|New|Compact)`, `NewConnection$` — case-insensitive
- [x] 2.3 Patch `findVbaReferences`: after `removeComment` and before `searchRegex.test(cleanLine)`, derive `searchLine = stripStrings(cleanLine)` and run the regex on `searchLine` only; `isDefinitionLine` continues to use `cleanLine` (definition phase untouched)
- [x] 2.4 Implement `detectDeadCode(modules: Record<string,string>, opts?: { module?: string, scope?: string }): DeadCodeReport | undefined`:
  - Collect all procedures via `listVbaProcedures` across specified modules
  - For each symbol, run `findVbaReferences` (stripStrings-patched)
  - Skip if any non-excluded reference found
  - Skip if symbol matches `EXCLUDED_NAME_PATTERNS`
  - Compute risk: `Low` = private proc/function/property; `Med` = public or module-narrowed; `High` = public/global module-level const/variable/type/enum
  - Return `DeadCodeReport { scope, module?, scannedModules, scannedAt, findings[], summary { total, low, med, high } }`, or `undefined` when a requested module constraint does not resolve

## Phase 3: RED Adapter/Contract Tests

- [x] 3.1 Add RED test in `test/adapters/mcp/` — tool registered in `MODERN_TOOL_NAMES`: assert `createDysflowMcpTools(...).find(t => t.name === "dysflow_detect_dead_code")` is defined
- [x] 3.2 Add RED test — contract is `read-only / writeGate: none`: assert `getMcpToolContract("dysflow_detect_dead_code")` returns `{ access: "read-only", writeGate: "none" }`
- [x] 3.3 Add RED test — schema rejects bad input: assert `DETECT_DEAD_CODE_SCHEMA` has `additionalProperties: false` and rejects `{ scope: "bogus" }`
- [x] 3.4 Add RED test — handler never opens Access: mock Access/spawn check, call handler, assert no Access invocation

## Phase 4: GREEN MCP Wiring

- [x] 4.1 Append `"dysflow_detect_dead_code"` to `MODERN_TOOL_NAMES` in `src/adapters/mcp/tools.ts`
- [x] 4.2 Add `DETECT_DEAD_CODE_SCHEMA` to `src/adapters/mcp/schemas/dysflow-schemas.ts`: `projectId?, contextId?, modules: Record<string,string>, module?: string, scope?: "binary"|"source"|"module", kind?: VbaProcedureKindFilter` + `additionalProperties: false`
- [x] 4.3 Add `modernContracts.dysflow_detect_dead_code` entry in `src/adapters/mcp/mcp-tool-contracts.ts`: `{ access: "read-only", writeGate: "none", summary: "Read-only MCP contract." }`
- [x] 4.4 Wire handler in `src/adapters/mcp/tools.ts`: inline `modules` → call `detectDeadCode` directly; else `resolveAllProjectModules(input, destinationRoot, ctx)` → call; on `undefined` return `MODULE_NOT_FOUND`; never open Access or spawn PowerShell

## Phase 5: GREEN Contract Tests — complete

- [x] 5.1 Complete all Phase 3 RED tests to GREEN
- [x] 5.2 Add integration test — `dysflow_detect_dead_code` available when writes disabled: `createDysflowMcpTools(services, false)` includes the tool and handler returns `ok: true` with no `MCP_WRITES_DISABLED`

## Phase 6: Documentation

- [x] 6.1 Add `dysflow_detect_dead_code` payload to `docs/mcp-examples.md`: inline-modules example and project-scope example with expected `findings[]` shape

## Verification Commands

```bash
# Run core unit tests
pnpm test -- --run test/core/services/vba-procedure-service.test.ts

# Run adapter contract tests
pnpm test -- --run test/adapters/mcp/

# Full suite
pnpm test -- --run

# Type check
pnpm exec tsc --noEmit
```

Expected evidence after GREEN:
- All 14 RED core tests + 4 contract tests pass
- `pnpm test` clean
- `dysflow_detect_dead_code` in `get_capabilities` output (`toolsVisible` count increments)
- No `dispatch-routes.ts` or `mcp-tool-registry.ts` changes

---

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|--------|-----------|-----------|--------------|------------|
| `<sha>` | `<subject>` | `<task ids>` | `<tests/manual checks>` | `<N/A — read-only>` |
