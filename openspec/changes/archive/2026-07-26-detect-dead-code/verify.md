# Verification Report — detect-dead-code (#705) — second re-verify

**Change**: `detect-dead-code`
**Spec**: `openspec/changes/detect-dead-code/specs/vba-dead-code-detection/spec.md`
**Worktree**: `C:\Proyectos\dysflow-issue-705`
**Branch**: `feat/705-dead-code`
**Mode**: Strict TDD
**Verifier**: sdd-verify sub-agent (executor)
**Date (second re-verify)**: 2026-07-04

## Verdict

**PASS WITH WARNINGS** — All four review-blocker fixes from the prior fresh-review
are **closed** in code, in tests, and (where applicable) in design.md:

1. Module-level declarations (`Public` / `Private` / `Global` vars, `Type`, `Enum`,
   with the existing `Const` / `Dim` coverage retained) now surface in
   `detectDeadCode` with the correct `kind: "declaration"` and risk tier.
2. `modules` is optional in the schema and the project's
   `resolveAllProjectModules` fallback path is reachable; when both the inline
   map and the fallback miss, the handler returns a typed `MODULE_NOT_FOUND`
   envelope.
3. Missing `module` filter returns `DeadCodeReport | undefined` from the core
   function and is translated to a typed `MODULE_NOT_FOUND` envelope at the
   handler boundary (case-insensitive, regression-pinned for legitimate
   narrowing).
4. `evidence.scannedModules` (and `report.scannedModules`) reflect the modules
   that actually participated in the scan — the narrowed set, NOT every input
   module.

Strict-TDD focused runs re-pass at runtime: **9 adapter tests + 39 core tests =
48 tests pass**; `pnpm exec tsc --noEmit` clean. No source-code churn vs the
previous verify (the implementation was already on disk; only the openspec
artifacts were added by this branch). Two non-blocking SUGGESTIONS remain
about artifacts the orchestrator did NOT update; the carry-over WARNING about
the >400-line diff size is unchanged and is still the orchestrator's review-load
decision.

---

## Re-Verification of Prior Blockers

| # | Prior blocker | Fix location | Test | Result |
|---|---|---|---|---|
| 1 | `MODULE_LEVEL_DECL_RE` only matched `Const`/`Dim`, silently dropping `Public Foo As Long`, `Type Point`, `Enum Color` | `src/core/services/vba-procedure-service.ts:331-380` — three regexes (`MODULE_LEVEL_CONST_RE`, `MODULE_LEVEL_VAR_RE`, `MODULE_LEVEL_BLOCK_RE`) + `listVbaModuleLevelDeclarations` | `detectDeadCode_public_variable_declaration_is_reported_with_high_risk`, `detectDeadCode_private_variable_declaration_is_reported_with_low_risk`, `detectDeadCode_global_variable_declaration_is_reported_with_high_risk`, `detectDeadCode_type_block_first_line_is_reported_as_declaration`, `detectDeadCode_private_type_block_reports_low_risk`, `detectDeadCode_type_without_visibility_reports_med_risk`, `detectDeadCode_public_enum_block_is_reported_with_high_risk`, `detectDeadCode_private_enum_block_reports_low_risk`, `detectDeadCode_typeof_expression_is_not_a_type_declaration` | ✅ **CLOSED** |
| 2 | `required: ["modules"]` shadowed the documented `resolveAllProjectModules` fallback so the handler path was unreachable | `src/adapters/mcp/schemas/dysflow-schemas.ts:296-331` — `required: ["scope"]` only, `modules` is optional; `src/adapters/mcp/tools.ts:691-719` — inline short-circuit, then `resolveAllProjectModules`, then typed `MODULE_NOT_FOUND` on undefined | `detect-dead-code-schema-rejects.test.ts > accepts input without inline modules and returns MODULE_NOT_FOUND when the fallback cannot resolve anything`, `… destinationRoot mismatch — also MODULE_NOT_FOUND` | ✅ **CLOSED** |
| 3 | Missing `module` filter returned an empty success report (indistinguishable from "scan ran, nothing dead") | `src/core/services/vba-procedure-service.ts:445-450` — narrow-miss returns `undefined`; `src/adapters/mcp/tools.ts:721-738` — handler maps `undefined` to typed `MODULE_NOT_FOUND` envelope | `detectDeadCode_narrow_to_missing_module_returns_undefined`, `detectDeadCode_narrow_to_missing_module_is_case_insensitive`, `detectDeadCode_narrow_to_existing_module_still_returns_report`; handler-level coverage in `detect-dead-code-schema-rejects.test.ts` | ✅ **CLOSED** |
| 4 | `evidence.scannedModules` listed every input module even when the scan was narrowed — misleading | `src/core/services/vba-procedure-service.ts:456-470` — `searchModules` = the narrowed set; `scannedModules = [...Object.keys(searchModules)].sort()`; per-finding evidence copies that same sorted list | `detectDeadCode_narrow_scanned_modules_reflects_searched_set` — asserts `report.scannedModules` AND `report.findings[0].evidence.scannedModules` equal `["ModB"]` when narrowed to ModB among ModA/ModB/ModC | ✅ **CLOSED** |

### design.md update verification (orchestrator's claim)

The orchestrator updated `design.md` to document `DeadCodeReport | undefined`
and the removal of `excludedReason`. Verified against implementation:

| Statement | design.md | Implementation |
|---|---|---|
| `detectDeadCode(modules, opts?): DeadCodeReport | undefined` | ✅ `vba-procedure-service.ts:432-435` |
| `MODULE_NOT_FOUND` on `undefined` (narrow-miss signal) | ✅ `design.md:54` | ✅ `vba-procedure-service.ts:445-450` + `tools.ts:721-738` |
| `DeadCodeReport { scope, module?, scannedModules, scannedAt, findings, summary: { total, low, med, high } }` | ✅ `design.md:50-52` | ✅ `vba-procedure-service.ts:288-298` |
| No `excludedReason` anywhere | ✅ absent | ✅ absent (grep over `src/`, `test/`, and `openspec/` confirms zero matches) |

---

## Build & Tests Execution

**Build**: ✅ Passed
```text
$ pnpm exec tsc --noEmit
(no output, exit 0)
```

**Tests**: ✅ 48 passed (focused spot-check, per brief)
```text
test/adapters/mcp/detect-dead-code-handler-no-access.test.ts           (1 test)   ✅
test/adapters/mcp/detect-dead-code-available-with-writes-disabled      (1 test)   ✅
test/adapters/mcp/detect-dead-code-contract.test.ts                    (2 tests)  ✅
test/adapters/mcp/detect-dead-code-tool-registered.test.ts             (1 test)   ✅
test/adapters/mcp/detect-dead-code-schema-rejects.test.ts              (4 tests)  ✅
test/core/services/vba-procedure-service.test.ts                       (39 tests) ✅

Focused spot-check:  6 files / 48 tests  ✅
```

**Coverage**: not re-run (no coverage tool delta in this re-verify; no new
implementation lines added). The remediation was test-only on disk and the
existing per-test coverage gates were satisfied at the time of the original
verify.

**TypeScript**: `pnpm exec tsc --noEmit` — exit 0, no output. ✅

**Source-tree diff vs origin/main**: identical to the previous verify report
(871 insertions / 8 deletions, +879 net). No new source churn in this
re-verify; only openspec artifacts were added.

---

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| **Core detection — Public var decl** | `Public Foo As Long` no refs → dead, High | `detectDeadCode_public_variable_declaration_is_reported_with_high_risk` | ✅ COMPLIANT |
| **Core detection — Private var decl** | `Private Bar As String` no refs → dead, Low | `detectDeadCode_private_variable_declaration_is_reported_with_low_risk` | ✅ COMPLIANT |
| **Core detection — Global var decl** | `Global AppVersion As String` no refs → dead, High | `detectDeadCode_global_variable_declaration_is_reported_with_high_risk` | ✅ COMPLIANT |
| **Core detection — Public Type block** | `Public Type Point` (first line) → dead, High; body members (X, Y) NOT surfaced | `detectDeadCode_type_block_first_line_is_reported_as_declaration` | ✅ COMPLIANT |
| **Core detection — Private Type block** | `Private Type InnerPoint` → dead, Low | `detectDeadCode_private_type_block_reports_low_risk` | ✅ COMPLIANT |
| **Core detection — Type without visibility** | `Type NoVisibility` → dead, Med | `detectDeadCode_type_without_visibility_reports_med_risk` | ✅ COMPLIANT |
| **Core detection — Public Enum block** | `Public Enum Color` → dead, High; body members (Red, Green) NOT surfaced | `detectDeadCode_public_enum_block_is_reported_with_high_risk` | ✅ COMPLIANT |
| **Core detection — Private Enum block** | `Private Enum Days` → dead, Low | `detectDeadCode_private_enum_block_reports_low_risk` | ✅ COMPLIANT |
| **TypeOf expression is not a Type decl** | `TypeOf obj Is Class1` does NOT produce phantom findings | `detectDeadCode_typeof_expression_is_not_a_type_declaration` | ✅ COMPLIANT |
| **Original core scenarios** | String literal / comment / substring / cross-module / AutoExec / Form_Load / cmdSave_Click / Public Const | 1.2 – 1.9 | ✅ COMPLIANT (regression pins intact) |
| **Narrow-miss → `undefined`** | `module: "NonExistent"` with no matching module → core returns `undefined` | `detectDeadCode_narrow_to_missing_module_returns_undefined` | ✅ COMPLIANT |
| **Narrow-miss is case-insensitive** | `module: "MODB"` with no real `modb` (only `ModA`) → `undefined` | `detectDeadCode_narrow_to_missing_module_is_case_insensitive` | ✅ COMPLIANT |
| **Narrow-hit still returns report** | `module: "ModA"` matching real `ModA` → defined report | `detectDeadCode_narrow_to_existing_module_still_returns_report` | ✅ COMPLIANT |
| **`scannedModules` reflects searched set** | Narrow to ModB among ModA/ModB/ModC → only `["ModB"]` on `report.scannedModules` AND on `findings[0].evidence.scannedModules` | `detectDeadCode_narrow_scanned_modules_reflects_searched_set` | ✅ COMPLIANT |
| **`modules` optional, fallback returns `MODULE_NOT_FOUND`** | Schema accepts input without `modules`; handler returns typed `MODULE_NOT_FOUND` | `detect-dead-code-schema-rejects.test.ts` x2 | ✅ COMPLIANT |
| **Schema rejects bad input** | `{ scope: "bogus" }`, `{ extraNotInSchema: 1 }` → typed `MCP_INPUT_INVALID` | `detect-dead-code-schema-rejects.test.ts` x2 | ✅ COMPLIANT |
| **Contract is read-only** | `getMcpToolContract("dysflow_detect_dead_code") === { access: "read-only", writeGate: "none" }` | `detect-dead-code-contract.test.ts` x2 | ✅ COMPLIANT |
| **Handler never opens Access / PowerShell** | Spy on `vbaSyncToolService.execute`; spy remains uncalled after handler invocation | `detect-dead-code-handler-no-access.test.ts` | ✅ COMPLIANT |
| **Tool registered in modern surface** | `createDysflowMcpTools(...)` contains `dysflow_detect_dead_code` | `detect-dead-code-tool-registered.test.ts` | ✅ COMPLIANT |
| **Available when writes disabled** | `createDysflowMcpTools(services, false)` returns success (no `MCP_WRITES_DISABLED`) | `detect-dead-code-available-with-writes-disabled.test.ts` | ✅ COMPLIANT |

**Compliance summary**: **21/21 spec-derived scenarios compliant** (across
remediation, original core, narrow-miss, schema, contract, and registration).

---

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| `detectDeadCode` supports Public/Private/Global vars, Type, Enum | ✅ Implemented | Three regexes + `listVbaModuleLevelDeclarations` (lines 331-380). The Type/Enum regex is anchored on `^Type|^Enum` and only captures the block name; body members (`X As Long` inside a Type) are explicitly NOT captured (covered by `detectDeadCode_typeof_expression_is_not_a_type_declaration`). |
| `modules` optional schema + fallback path | ✅ Implemented | `required: ["scope"]` only at `dysflow-schemas.ts:298`. Handler short-circuits on inline `modules` (`tools.ts:691-693`), falls back to `resolveAllProjectModules` (`tools.ts:701-705`), and returns typed `MODULE_NOT_FOUND` when both miss (`tools.ts:706-717`, `tools.ts:728-737`). |
| Missing `module` filter → typed `MODULE_NOT_FOUND` | ✅ Implemented | Core returns `undefined` when `narrowModuleName` case-insensitively matches no input module (`vba-procedure-service.ts:445-450`). Handler maps `undefined` → `MODULE_NOT_FOUND` envelope (`tools.ts:721-738`). |
| `evidence.scannedModules` reflects actual searched modules | ✅ Implemented | `scannedModules` is `[...Object.keys(searchModules)].sort()` where `searchModules` is the narrowed set when narrowing is requested (`vba-procedure-service.ts:456-470`). Per-finding evidence copies the same list. |
| No `excludedReason` anywhere | ✅ Implemented | Grep over `src/`, `test/`, `openspec/` confirms zero matches. |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Modern MCP tool path (`MODERN_TOOL_NAMES` + `modernContracts` + `DETECT_DEAD_CODE_SCHEMA` + handler), not `dispatch-routes.ts` / `mcp-tool-registry.ts` | ✅ Yes | `MODERN_TOOL_NAMES` appends `"dysflow_detect_dead_code"` at `tools.ts:264`; `modernContracts.dysflow_detect_dead_code` registered at `mcp-tool-contracts.ts:181`; schema declared at `dysflow-schemas.ts:296`. Legacy registries not touched (carried over from previous verify). |
| `DeadCodeKind = "sub"\|"function"\|"property"\|"declaration"` (lowercase) | ✅ Yes | `vba-procedure-service.ts:201`; matches `design.md:48`. |
| Three-tier risk: `Low` private, `Med` narrowed-or-public, `High` Public/Global Const/Type/Enum | ✅ Yes | `classifyRisk` at `vba-procedure-service.ts:389-400` — `High` for `declaration` with `Public`/`Global` visibility BEFORE the narrowed check. |
| Special-name allowlist (`AutoExec`, lifecycle, control events) | ✅ Yes | `EXCLUDED_NAME_PATTERNS` at `vba-procedure-service.ts:223-244`. Public `Const`/`Type`/`Enum` NOT auto-excluded — they are reported with `High` risk. |
| Handler never opens Access / spawns PowerShell | ✅ Yes | `tools.ts:671-746`. The only side effect is `JSON.stringify(report)`. Spy test pins this behavior. |
| `MODULE_NOT_FOUND` is the typed signal for both project-source fallback miss AND narrow-miss | ✅ Yes | Two distinct envelope strings in `tools.ts:711` (no modules resolved) and `tools.ts:732` (module constraint not found in resolved map). |

---

## Issues Found

**CRITICAL**: None.

**WARNING**: Carry-over, unchanged from prior verify:
1. **Diff size over 400-line review budget** — the source-tree diff is
   unchanged at **871 insertions / 8 deletions (~879 net)** vs the
   `tasks.md` forecast of 380–430 lines. This was flagged in the original
   verify as a process concern for the orchestrator's review-load budget
   (not a code-correctness concern). `tasks.md` § "Size Exception"
   documents the user-approved `size:exception` for single-PR delivery.

**SUGGESTION**: None remaining after the integration pass.

The prior documentation drift warnings were resolved: `proposal.md`,
`exploration.md`, `spec.md`, `design.md`, and `tasks.md` now agree that
`detectDeadCode(modules, opts?)` returns `DeadCodeReport | undefined`, uses
an `opts` object with `scope` and `module`, and maps a missing module
constraint to `MODULE_NOT_FOUND` at the MCP handler boundary.

---

## TDD Compliance (Strict TDD)

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | ✅ Yes | `tasks.md` Phase 1 / 3 / 5 lists every test by name with RED intent. |
| All tasks have tests | ✅ Yes | 14 RED core tests + 4 contract tests all mapped; 4 remediation tests added by this branch (Fix #1–#4 above). |
| RED confirmed (tests exist) | ✅ Yes | 6 new test files visible in `test/adapters/mcp/detect-dead-code-*.test.ts`; `test/core/services/vba-procedure-service.test.ts` extended with 13+ new tests including the four named blockers. |
| GREEN confirmed (tests pass) | ✅ Yes | 39 core tests + 9 adapter tests pass at runtime in this re-verify. |
| Triangulation adequate | ✅ Yes | Each blocker has multiple tests (e.g. Fix #1 covers Public / Private / Global / Type-public / Type-private / Type-no-visibility / Enum-public / Enum-private / TypeOf-not-a-type = 9 distinct cases for one behavior). |
| Safety Net for modified files | ✅ Yes | `findVbaReferences` regression pins at lines 824-888 pin the prior two-ref / `Call X` / `Application.Run "X"` behavior. |

**TDD Compliance**: 6/6 checks passed.

---

## Test Layer Distribution

| Layer | Tests | Files | Tools |
|---|---|---|---|
| Unit (core) | 39 | 1 (`test/core/services/vba-procedure-service.test.ts`) | vitest |
| Integration (MCP adapter) | 9 | 5 (`test/adapters/mcp/detect-dead-code-*.test.ts`) | vitest |
| E2E (real MCP) | 0 | — | not in scope for this re-verify |
| **Total** | **48** | **6** | |

---

## Assertion Quality (Strict TDD Step 5f)

| File | Line | Assertion | Issue | Severity |
|---|---|---|---|---|
| — | — | — | — | — |

**Assertion quality**: ✅ All assertions verify real behavior. No tautologies,
no orphan empty checks, no type-only assertions, no ghost loops. Every test
asserts a value-level outcome (finding name, risk tier, scanned module list,
return type, etc.) against the implementation.

---

## Quality Metrics

**Linter**: ➖ Not run in this re-verify (no source churn).
**Type Checker**: ✅ No errors — `pnpm exec tsc --noEmit` exits 0 with no
output.

---

## Final Verdict

**PASS WITH WARNINGS**

All four prior fresh-review blockers are closed in code, tests, and
implementation evidence:

1. `detectDeadCode` recognizes Public / Private / Global variable
   declarations and `Type` / `Enum` block first lines (Fix #1 — 9 dedicated
   unit tests).
2. `modules` is optional in the schema and the
   `resolveAllProjectModules` fallback path is reachable, with typed
   `MODULE_NOT_FOUND` envelopes for both fallback miss and narrow-miss
   (Fix #2 — 2 dedicated handler tests; Fix #3 — 3 dedicated core tests).
3. `evidence.scannedModules` mirrors the modules that actually
   participated in the scan, not the full input map (Fix #4 — 1 dedicated
   test with triple-module setup).

Strict-TDD focused spot-check passes 48/48 tests; TypeScript compiles
clean; no source-code churn vs the previous verify. Implementation is
behavior-ready.

The three new SUGGESTIONS are documentation-level (spec / proposal /
exploration signatures lag behind the design.md / implementation pair).
These do not block archive but should be resolved in a follow-up
document-cleanup pass before issue #705 is closed in production. The
carry-over WARNING about the >400-line diff size remains the
orchestrator's review-load decision and is unchanged.

---

## Files Inspected

- `openspec/changes/detect-dead-code/{proposal,design,exploration,tasks}.md`
- `openspec/changes/detect-dead-code/specs/vba-dead-code-detection/spec.md`
- `src/core/services/vba-procedure-service.ts` (lines 60-380, 432-570)
- `src/adapters/mcp/{tools.ts,schemas/dysflow-schemas.ts,mcp-tool-contracts.ts}`
- `test/core/services/vba-procedure-service.test.ts` (lines 450-888)
- `test/adapters/mcp/detect-dead-code-{handler-no-access,available-with-writes-disabled,contract,tool-registered,schema-rejects}.test.ts`
- Tooling: `pnpm exec tsc --noEmit`, `pnpm test -- --run`