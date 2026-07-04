# Design: MCP Contract Safety — Honest Schema-vs-Runtime Parity

## Technical Approach

One architectural principle drives all three PRs: **every field advertised in an MCP tool's `inputSchema` MUST either be honored at runtime or be marked deprecated.** Today four contract-truth defects leak through this rule:

1. **#5** `run_vba` / `dysflow_vba_execute` advertise "compiled project" semantics but their contracts claim `read-only`. The handler at `canonical-handlers.ts:42-62` runs any compiled VBA. There is no default-deny when `allowedProcedures` is unconfigured.
2. **#6a** `dysflow_query_execute` (write mode) does not advertise `allowTables`/`denyTables` in `QUERY_EXECUTE_SCHEMA`, even though `AccessQueryRequest` (`core/contracts/index.ts:197-198`) carries both fields and `scripts/dysflow-access-runner.ps1:1062-1072` already enforces them for the legacy `exec_sql` path.
3. **#6b** `dysflow_access_cleanup` uses a bare `(validatedInput) => validatedInput as {operationId, accessPath, force?}` cast at `tools.ts:151-153` that drops every other `CLEANUP_SCHEMA` field. The legacy alias already uses `buildCleanupRequest` (`alias-tools.ts:88-108`) and passes all 13 fields through.
4. **#7** `.github/workflows/release.yml` invokes `softprops/action-gh-release@v3` without `name:`, so the release title can drift from the tag — AGENTS.md says "must equal" but nothing fails the job on drift.

The chain reuses existing builders and validators; no core signature changes. PR1 adds default-deny logic to `canonical-handlers.ts`. PR2 wires `allowTables`/`denyTables` through `QUERY_EXECUTE_SCHEMA` and replaces the modern cleanup cast with the existing `buildCleanupRequest`. PR3 adds a `release-title-guard.yml` workflow that fails the job on `event.release.title !== event.release.tag_name`.

**⚠ Spec-vs-code gap surfaced (must be resolved before PR1):** The proposal claims the gate at `handleMcpVbaExecute` covers the trio `run_vba` / `dysflow_vba_execute` / `test_vba`. Reading the code: `test_vba` does NOT go through `handleMcpVbaExecute` — it routes via `MCP_TOOL_ROUTES.test_vba` (`dispatch-routes.ts:29`) → `vbaSyncToolService` → `VbaExecutionAdapter.executeTestVba` (`src/adapters/vba-sync/vba-execution-adapter.ts:293-325`). The gate at `canonical-handlers.ts` covers only `run_vba` and `dysflow_vba_execute`. **Decision (proposal-aligned):** PR1 reclassifies `test_vba`'s contract metadata only (description + `writeGate: "conditional"`); runtime gating for `test_vba` is filed as Open Question #1 and out of PR1 scope. A consumer could otherwise call `test_vba` with a fake `procedureName` to bypass the gate — explicit decision needed before merge.

## Architecture Decisions

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| A | Default-deny gate location | `ensureProcedureAllowed` (`canonical-handlers.ts:26-40`) flips to deny when allowlist is empty AND `dryRun !== true`. | Single source of truth; both `run_vba` and `dysflow_vba_execute` go through `handleMcpVbaExecute`. Per-tool `if` blocks duplicate logic; wrapping `vbaService.execute` bypasses schema validation. |
| B | Modern cleanup handler rebuild | Reuse `buildCleanupRequest` from `alias-tools.ts`. | Single builder, parity test falls out for free. Parallel builder drifts; wider cast re-introduces the silent drop. |
| C | Query write-mode table guards | Schema add only; rely on existing `AccessQueryService.execute` pass-through. | `scripts/dysflow-access-runner.ps1:1062-1072` already enforces — schema is the only missing piece. The cast at `tools.ts:115-119` already spreads `...request`. |
| D | Release title enforcement | Both: pass `name: ${{ github.ref_name }}` AND new guard workflow on `release: [created, edited]`. | Creation-time prevents drift; edit-time catches post-creation UI edits. Failure message names both values. |
| E | CLI parity (forward-looking) | Defer per current proposal. | `vba-manager-actions/spec.md` pins it as a regression guard; PR1 doesn't write the test. |
| F | `strictContext` core enforcement | Handler-only pass-through; core ignores. | Real enforcement ripples through `stdio.ts:243-255` + `access-operation-preflight.ts`. Forward-compat carries the fields; deferred to a follow-up. |
| G | `test_vba` runtime gate | Contract-reclassify only (proposal scope). | See Open Question #1 — `test_vba` does not route through `handleMcpVbaExecute`; duplicating the gate into `VbaExecutionAdapter.executeTestVba` adds ~30-50 lines but is consistent. |

## Data Flow

```
caller ─► dysflow_vba_execute / run_vba
              │
              ▼
   validateInput(input, schema)              ← unchanged
              │
              ▼
   buildRequest(input) → AccessVbaRequest    ← gains dryRun field
              │
              ▼
   ┌──────────────────────────────────────────────────────┐
   │ ensureProcedureAllowed(name, allowed, dryRun)        │ ← MODIFIED
   │   deny if allowedProcedures empty/undefined         │
   │        AND request.dryRun !== true                   │
   └──────────────────────────────────────────────────────┘
              │ (passes)
              ▼
   services.vbaService.execute(request, onProgress)
```

## Error Code Convention

| Failure | Mechanism | Code/text at MCP boundary |
|---------|-----------|---------------------------|
| PR1 — VBA default-deny (allowlist empty + no dryRun) | `invalidInput(message)` → `MCP_INPUT_INVALID: Refusing to execute VBA procedure '<name>': project config must declare allowedProcedures ...` | `MCP_INPUT_INVALID` (existing prefix; message contains `allowedProcedures` + `dryRun`). Matches the existing pattern at `tools.test.ts:1264-1274` and `alias-tools.test.ts:64`. |
| PR1 — VBA allowlist mismatch (procedure not in list) | `invalidInput(message)` → `MCP_INPUT_INVALID: Procedure '<name>' is not in the configured allowedProcedures list.` | `MCP_INPUT_INVALID` (existing). |
| PR2 — `dysflow_query_execute` table refusal | PowerShell layer throws (`scripts/dysflow-access-runner.ps1:1069,1072`); runner wraps as `DysflowError.code = "TABLE_DENIED"` (or `"TABLE_NOT_ALLOWED"`); adapter surfaces `isError:true` text matching `/TABLE_DENIED/` (spec scenario). | `TABLE_DENIED` is the consumer-observable token. The test uses a fake `queryService` returning `failureResult({ code: "TABLE_DENIED" })`; real runner translation is out of PR2 scope. |
| PR3 — release title mismatch | GitHub Actions `exit 1` in `release-title-guard.yml` after echoing both values to stderr. | Not an MCP code; CI failure. The runner emits `Release title must equal tag_name.` + both values. |

## File Changes

### PR1 — #5 honest VBA execution contract

| File | Action | Δ |
|------|--------|---|
| `src/adapters/mcp/canonical-handlers.ts:26-40,56-57` | Modify | Flip `ensureProcedureAllowed` to default-deny; thread `dryRun` through. |
| `src/adapters/mcp/schemas/dysflow-schemas.ts:45-71` (`VBA_EXECUTE_SCHEMA`) | Modify | Add `dryRun: SCHEMA_PROPS.dryRun`. |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts:27-39` (`run_vba`) | Modify | Add `dryRun: SCHEMA_PROPS.dryRun`. |
| `src/adapters/mcp/mcp-tool-contracts.ts:56-61` (`run_vba`) | Modify | `access: "conditional-write"`, `writeGate: "conditional"`, new summary. |
| `src/adapters/mcp/mcp-tool-contracts.ts:105-111` (`dysflow_vba_execute`) | Modify | Same reclassification. |
| `src/adapters/mcp/mcp-tool-contracts.ts` (`test_vba`) | Modify | Reclassify contract metadata only (gate does NOT cover `test_vba` — see Open Question #1). |
| `src/adapters/mcp/tools.ts:91-103` | Modify | Description includes `allowlist` AND `dryRun`. |
| `src/adapters/mcp/tool-parity-registry.ts:120-123` (`run_vba`, `test_vba`) | Modify | Append gate disclaimer to descriptions. |
| `src/core/contracts/index.ts:88-104` (`AccessVbaRequest`) | Modify | Add `dryRun?: boolean`. |
| `src/adapters/mcp/alias-tools.ts:117-141` (`buildRunVbaRequest`) | Modify | Project `dryRun` from input. |
| `test/adapters/mcp/canonical-handlers.test.ts` | Modify | RED `default-deny gate when allowedProcedures unconfigured and no dryRun`. |
| `test/adapters/mcp/tools.test.ts:1247-1381` | Modify | Flip tests at lines 1284-1290 and 1342-1348 to assert REFUSAL when allowlist empty; add `dryRun:true` escape-hatch tests. |
| `test/adapters/mcp/mcp-tool-contracts.test.ts:36-99` | Modify | Update assertions: `writeGate: "conditional"`, summary contains `allowlist`/`dryRun`. |

**Core diff** — `canonical-handlers.ts:26-40`:

```diff
 function ensureProcedureAllowed(
   procedureName: string,
   allowedProcedures: readonly string[] | undefined,
+  dryRun: boolean | undefined,
 ): McpToolResult | undefined {
+  // PR1 #5: default-deny gate. Refuse to execute compiled VBA unless EITHER
+  // the project config declares a non-empty allowedProcedures list AND the
+  // procedure is in it, OR the caller explicitly passes dryRun:true.
+  if (allowedProcedures === undefined || allowedProcedures.length === 0) {
+    if (dryRun !== true) {
+      return invalidInput(
+        `Refusing to execute VBA procedure '${procedureName}': ` +
+          `project config must declare allowedProcedures (with procedure in the list) ` +
+          `OR caller must pass dryRun:true. ` +
+          `Set allowedProcedures in .dysflow/project.json to allow this procedure.`,
+      );
+    }
+    return undefined;
+  }
   if (
-    allowedProcedures !== undefined &&
-    allowedProcedures.length > 0 &&
     !allowedProcedures.includes(procedureName)
   ) {
     return invalidInput(
       `Procedure '${procedureName}' is not in the configured allowedProcedures list.`,
     );
   }
   return undefined;
 }
```

The call site at `canonical-handlers.ts:56-57` reads:

```diff
-  const allowlistError = ensureProcedureAllowed(request.procedureName, allowedProcedures);
+  const allowlistError = ensureProcedureAllowed(
+    request.procedureName,
+    allowedProcedures,
+    request.dryRun,
+  );
```

`AccessVbaRequest` (`core/contracts/index.ts:88-104`) does NOT yet carry `dryRun`. **ADD** the field to the contract type and the two `build*Request` functions (`alias-tools.ts:117-141` for legacy, `tools.ts:100` for modern).

**Core diff** — `VBA_EXECUTE_SCHEMA` and `run_vba` schemas:

```diff
 export const VBA_EXECUTE_SCHEMA: JsonObjectSchema = {
   type: "object",
   required: ["procedureName"],
   additionalProperties: false,
   properties: {
     ...
     procedureName: { type: "string", minLength: 1, description: "Public VBA procedure to execute." },
     arguments: { type: "array", items: {}, description: "Procedure arguments." },
+    dryRun: SCHEMA_PROPS.dryRun,
     ...ACCESS_OVERRIDE,
     ...STRICT_CTX,
     timeoutMs: SCHEMA_PROPS.timeoutMs,
   },
 };
```

```diff
   run_vba: {
     type: "object",
     required: ["procedureName"],
     additionalProperties: false,
     properties: {
       procedureName: SCHEMA_PROPS.procedureName,
       argsJson: SCHEMA_PROPS.argsJson,
+      dryRun: SCHEMA_PROPS.dryRun,
       ...CTX_PROPS,
       ...ACCESS_OVERRIDE,
       ...STRICT_CTX,
       timeoutMs: SCHEMA_PROPS.timeoutMs,
     },
   },
```

### PR2 — #6a + #6b modern/legacy alias parity

| File | Action | Δ |
|------|--------|---|
| `src/adapters/mcp/schemas/dysflow-schemas.ts:73-106` (`QUERY_EXECUTE_SCHEMA`) | Modify | Add `allowTables`/`denyTables`. |
| `src/adapters/mcp/tools.ts:115-119` | Verify | Spread already carries them; cast OK. |
| `src/adapters/mcp/tools.ts:151-153` | Modify | `validatedInput => buildCleanupRequest(validatedInput)`. |
| `src/core/services/query-service.ts:44-62` | Verify | PowerShell `dysflow-access-runner.ps1:1062-1072` already enforces. |
| `test/adapters/mcp/tools.test.ts` | Modify | RED: write-mode pass-through, `TABLE_DENIED` surface, read-mode ignores guards, modern cleanup parity. |
| `test/adapters/mcp/alias-tools.test.ts` | Modify | RED: legacy/modern field-set equality (ignoring `undefined`). |

**Core diff** — `QUERY_EXECUTE_SCHEMA`:

```diff
 export const QUERY_EXECUTE_SCHEMA: JsonObjectSchema = {
   type: "object",
   required: ["sql", "mode"],
   additionalProperties: false,
   properties: {
     ...
     mode: { type: "string", enum: ["read", "write"], description: "Execution mode: read or write." },
     dryRun: SCHEMA_PROPS.dryRun,
     apply: SCHEMA_PROPS.apply,
+    allowTables: SCHEMA_PROPS.allowTables,
+    denyTables: SCHEMA_PROPS.denyTables,
   },
 };
```

**Core diff** — `tools.ts:151-153` (modern cleanup):

```diff
 import { ... } from "./alias-tools.js";
 ...
       handler: async (input) =>
         handleMcpAccessCleanup(
           input,
           CLEANUP_SCHEMA,
           services,
           writesEnabled,
           writeAccessResolver,
-          (validatedInput) =>
-            validatedInput as { operationId: string; accessPath: string; force?: boolean },
+          (validatedInput) => buildCleanupRequest(validatedInput),
         ),
```

### PR3 — #7 CI release title == tag

| File | Action | Δ |
|------|--------|---|
| `.github/workflows/release.yml:79-89` | Modify | Add `name: ${{ github.ref_name }}` to `softprops/action-gh-release@v3`. |
| `.github/workflows/release-title-guard.yml` | New | `release: [created, edited]`; on mismatch, echo both values and `exit 1`. |
| `test/quality-gates/release-title-guard.test.ts` | New | Read both workflows; assert substrings + spawn a Node helper that re-runs the assertion with fixture payload; assert non-zero exit. |

**Core diff** — `release.yml`:

```diff
       - name: Create GitHub Release
         uses: softprops/action-gh-release@v3
         with:
+          name: ${{ github.ref_name }}
           files: |
             dysflow-*.tar.gz
             SHA256SUMS
             SHA256SUMS.sig
```

**New workflow** — `release-title-guard.yml` (sketch; final text in tasks.md):

```yaml
name: Release Title Guard
on:
  release:
    types: [created, edited]
permissions:
  contents: read
jobs:
  assert:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Assert title == tag_name
        run: |
          if [ "${{ github.event.release.title }}" != "${{ github.event.release.tag_name }}" ]; then
            echo "Release title must equal tag_name." >&2
            echo "  title    = ${{ github.event.release.title }}" >&2
            echo "  tag_name = ${{ github.event.release.tag_name }}" >&2
            exit 1
          fi
```

## Testing Strategy

| Layer | What to Test | Pin location |
|-------|-------------|--------------|
| PR1 gate (`vbaService` port) | Default-deny: `vbaService.execute` NOT called when allowlist empty AND no `dryRun`. Called exactly once when `dryRun:true` or procedure in allowlist. | `test/adapters/mcp/canonical-handlers.test.ts` + `test/adapters/mcp/tools.test.ts` |
| PR1 contract (`MCP_TOOL_CONTRACTS`) | `getMcpToolContract("dysflow_vba_execute")` → `writeGate: "conditional"`, `access: "conditional-write"`, summary contains `allowlist` AND `dryRun`. | `test/adapters/mcp/mcp-tool-contracts.test.ts` (extend existing lines 36-99) |
| PR1 contract (legacy) | `run_vba` same gate. Description updated. | `test/adapters/mcp/mcp-tool-contracts.test.ts` |
| PR1 schema | `VBA_EXECUTE_SCHEMA` and `run_vba` schema both declare `dryRun`. | `test/adapters/mcp/tools.test.ts:60-72` |
| PR2 schema (`QUERY_EXECUTE_SCHEMA`) | `properties.allowTables.type === "array"`, `items.type === "string"`. Same for `denyTables`. | `test/adapters/mcp/tools.test.ts` (extend) |
| PR2 query pass-through (`queryService` port) | `dysflow_query_execute` write mode captures `{allowTables:["TbX"], denyTables:["TbSecret"]}`; read mode ignores them. | `test/adapters/mcp/tools.test.ts` |
| PR2 query core-service enforcement | Fake `queryService` returns `TABLE_DENIED` failureResult when `denyTables` covers target; adapter surfaces `isError:true` text matching `/TABLE_DENIED/`. | `test/adapters/mcp/tools.test.ts` |
| PR2 cleanup parity (`cleanupService` port) | `dysflow_access_cleanup` full schema input → captured request has every field that `buildCleanupRequest` projects. Field sets equal between modern + legacy builders (ignoring `undefined`). | `test/adapters/mcp/tools.test.ts` + `test/adapters/mcp/alias-tools.test.ts` |
| PR3 CI workflow text | `release.yml` passes `name: ${{ github.ref_name }}`; guard workflow references `title` AND `tag_name`; failure path names both values. | `test/quality-gates/release-title-guard.test.ts` (new) |

E2E out of scope. `access-runner.test.ts:1358` flake is consistent across campaigns.

## Migration / Rollout

**PR1 (behavior change — BREAKING for unconfigured callers):** AGENTS.md "VBA execution default-deny" section; CHANGELOG `**BREAKING**` note (pattern from `runtime-path-safety` at `CHANGELOG.md:4-13`); `docs/mcp-examples.md` add `dryRun:true` example for `run_vba`. README unchanged (the new description is the contract). Test fixture migration: existing tests at `tools.test.ts:1284-1290` and `:1342-1348` currently assert allow-when-empty — flip to assert REFUSAL-when-empty. Add new tests for `dryRun:true` acceptance.

**PR2 (additive, non-breaking):** AGENTS.md one-liner: "`dysflow_query_execute` write mode accepts the same `allowTables`/`denyTables` as `exec_sql`." No CHANGELOG BREAKING note.

**PR3 (CI-only, no caller impact):** CHANGELOG note: "Release CI fails when title ≠ tag_name."

## PR Commit Plan

| PR | Δ Lines | Commit |
|----|---------|--------|
| 1 — `#621/1` F1 VBA default-deny | 200-280 | `fix(mcp): VBA execution default-deny gate (#621, F1)` |
| 2 — `#621/2` F2+F3 query/cleanup parity | 240-340 | `fix(mcp): modern/legacy alias parity for query write guards + cleanup pass-through (#621, F2+F3)` |
| 3 — `#621/3` F4 release-title guard | 40-80 | `ci(release): enforce title == tag_name (#621, F4)` |

Each commit body: `SDD: mcp-contract-safety`, `Issue: #621`, TDD reference, Access sync note. No AI co-author.

## Rollback per PR

- **PR1**: revert removes default-deny + schema `dryRun` + contract reclassification. Allowlist path untouched; configs keep working. Pre-bug behavior (handler runs anything) restored.
- **PR2**: revert restores the bare cast at `tools.ts:151-153`; removes `allowTables`/`denyTables` from `QUERY_EXECUTE_SCHEMA`. Modern handler drops fields again.
- **PR3**: revert deletes the guard workflow and the `name:` line. AGENTS.md manual rule is the backstop.

## Open Questions

1. **`test_vba` runtime gate (spec-vs-code gap).** The proposal lists `test_vba` as part of the gate, but `test_vba` routes through `VbaExecutionAdapter.executeTestVba`, not `handleMcpVbaExecute`. The gate as scoped covers `run_vba` and `dysflow_vba_execute` only — a caller can currently execute any compiled VBA via `test_vba` by passing `proceduresJson: '[{"procedure":"DeleteAll","args":[]}]'`. Three options: (a) leave `test_vba` ungated (current proposal scope, but inconsistent); (b) extend the gate into `VbaExecutionAdapter.executeTestVba` (parallel implementation); (c) re-route `test_vba` through `handleMcpVbaExecute` (large refactor, out of scope). **Recommendation: confirm option (a) or (b) with user before PR1 merge. If (b), PR1 grows by ~30-50 lines and needs a new schema field for `dryRun` on `test_vba`.**
2. **`vba-manager-actions` CLI parity** — proposal marks it forward-looking (PR1 does NOT write the test). **Recommendation: defer per current proposal.**
3. **`strictContext` core enforcement** — out of scope. The `AccessOperationCleanupService.cleanup()` signature at `access-operation-cleanup.ts:72-76` accepts only `{operationId, accessPath, force?}`; adding `strictContext`/`expectedAccessPath` propagation requires changes to `access-operation-preflight.ts`, `stdio.ts:243-255`, and the request resolution path. **Recommendation: defer; file a follow-up issue.**
4. **CI release-title guard on `edited`** — if a maintainer corrects the title post-creation, the guard re-fires (intended). Tag deletion would not retrigger the guard. **Recommendation: document the limit; the AGENTS.md manual rule is the backstop.**