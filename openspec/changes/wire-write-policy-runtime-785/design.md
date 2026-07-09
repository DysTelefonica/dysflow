# Design — wire risk-based write execution policy to MCP dispatch path

## Architecture overview

```
   createDysflowMcpTools (tools.ts)
     ↓ writeExecutionPolicy (already destructured line 505)
   registerMcpTools (dispatch.ts) ← NEW: 6th parameter
     ↓ for each generated route name
   createDispatchTool (dispatch-factory.ts) ← NEW: 6th parameter + injects effective default
     ↓ synthesize { ...normalizedInput, dryRun: ... } when caller omitted dryRun/apply
     ↓ keep explicit caller intent untouched
     ↓ preserve export-source guard check before forwarding to vbaSyncToolService
   vbaSyncToolService.execute(name, normalizedInput)
     ↓ VbaModulesAdapter.execute / VbaExecutionAdapter.execute
     ↓ no longer hardcode "params.dryRun !== false" — sees forwarded effective default
```

The `writeExecutionPolicy` value flows from `createDysflowMcpTools` (which already destructures it from `options.writeExecutionPolicy` in v2.1.0) to every generated dispatch tool. The dispatch factory applies the policy at the boundary before forwarding.

## Seam: dispatch-factory.ts

`createDispatchTool(name, services, writesEnabled, writeAccessResolver, env)` gains a 6th positional parameter `writeExecutionPolicy: WriteExecutionPolicy = "safe-by-default"`. Inside the handler:

1. **Pre-write input normalization (NEW)**: if the caller did not pass `dryRun` AND did not pass `apply` AND the policy is consulted (i.e. `route.kind === "vba-sync"` or `route.kind === "query-maintenance"`), the helper `resolveEffectiveDryRunInput(name, writeExecutionPolicy, normalizedInput)` returns a normalized copy with `dryRun: false` injected when the effective default is `false` (developer + routine-dev-write), or with the existing default `true` if the route uses one. **Explicit caller intent always wins.**

2. **Existing write-gate (UNCHANGED)**: `isDryRun` calculation at `dispatch-factory.ts:170-195` continues to gate `writesDisabled(name)`. Because `apply: true` / `dryRun: false` remain explicit, the gate still consults the right value.

3. **Export-source guard (NEW)**: before the `vba-sync` switch arm calls `vbaSyncToolService.execute`, when `route.kind === "vba-sync"` AND the active policy resolution yields `requiresConfirmOverwriteSource === true` AND the call is in execute mode (i.e. effective `dryRun === false`) AND `params.confirmOverwriteSource !== true`, refuse with `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION`. The error carries the resolved export destination, the active source root, and the remediation.

The seam lives in `dispatch-factory.ts` because it already owns the write-gate + the per-route dispatch decision. Putting it there keeps the policy check adjacent to the existing gate so review can confirm they don't bypass each other.

## Helper: resolveEffectiveDryRunInput

```ts
// new file: src/adapters/mcp/write-execution-dispatch.ts
import type { WriteExecutionPolicy } from "../../core/runtime/write-execution-policy.js";
import { effectiveDryRunDefaultForTool } from "./mcp-tool-risks.js";

export function resolveEffectiveDryRunInput(
  name: string,
  mode: WriteExecutionPolicy,
  input: unknown,
): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;
  // Explicit caller intent — must not be overridden.
  if (Object.hasOwn(record, "dryRun") || Object.hasOwn(record, "apply")) return record;
  const effective = effectiveDryRunDefaultForTool(name, mode);
  // Route-specific overrides: keep form mutation / catalog tools default-dry-run
  // (they have service-level defaults that this helper must not flatten).
  // The dispatch-factory.ts tool-specific isDryRun list (form_add_control,
  // form_move_control, form_rename_control, form_deserialize,
  // create_form_from_template, catalog_add_control, generate_form) is preserved
  // unchanged — those tools do not consult the policy default.
  if (
    name === "form_add_control" ||
    name === "form_move_control" ||
    name === "form_rename_control" ||
    name === "form_deserialize" ||
    name === "create_form_from_template" ||
    name === "catalog_add_control" ||
    name === "generate_form"
  ) {
    return record;
  }
  return { ...record, dryRun: effective };
}
```

The form mutation / catalog family keeps its existing dispatch behavior because their service-level default is "plan", not "execute", and overriding it would be a backwards-incompatible behavior shift outside the scope of #785.

## Adapters: drop the hardcoded `params.dryRun !== false` rule

`src/adapters/vba-sync/vba-modules-adapter.ts:230-235` simplifies. The dispatcher already injects `dryRun` when the caller is silent, so the adapter becomes:

```ts
const dryRun = params.dryRun === true;
if (dryRun && (toolName === "import_all" || toolName === "import_modules")) {
  return this.planImport(toolName, params);
}
if (dryRun && toolName === "delete_module") {
  return this.planDelete(params);
}
```

`src/adapters/vba-sync/vba-execution-adapter.ts:353,404` receives the same simplification. `apply: true` continues to express commit explicitly (no auto-injection); `run_vba` keeps its `runOptions` semantics unchanged.

## Export-source guard: runtime enforcement

Adds `src/adapters/mcp/write-execution-guard.ts` exporting `enforceExportSourceGuard({ toolName, input, mode, projectRoot, accessPath })`:

1. Reads `MCP_TOOL_ROUTES[toolName].risk` from `mcp-tool-risks.ts`.
2. Calls `resolveWriteExecutionPolicy({ mode, risk })` to read `requiresConfirmOverwriteSource`.
3. If `false`, returns `undefined` (no guard fires).
4. Otherwise reads `params.exportPath` and `params.destinationRoot` (the real export destination), normalizes via `pathOverlapsSourceRoot`, and:
   - If destination does NOT overlap source root, returns `undefined`.
   - If `params.confirmOverwriteSource === true`, returns `undefined`.
   - Else returns a structured error: `{ code: "EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION", message, remediation, details: { toolName, destination, sourceRoot, requestedFields } }`.

`path-overlap.ts` already has `buildOverlapCandidates` + `DEFAULT_MANAGED_SOURCE_FOLDERS`, so the guard is testable with synthetic paths in unit tests.

## Forward declarations

- `src/adapters/mcp/tools.ts:493` `createDysflowMcpTools` already destructures `writeExecutionPolicy`; only needs to forward it to `registerMcpTools(...)` (line where it calls `registerMcpTools`).
- `src/adapters/mcp/dispatch.ts:52` `registerMcpTools` adds `writeExecutionPolicy` as the 7th parameter (after `allowedProcedures`).
- `src/adapters/mcp/dispatch-factory.ts:91` `createDispatchTool` adds `writeExecutionPolicy` as the 6th parameter (after `env`).

## Backwards compatibility

- `safe-by-default` mode (default): identical behavior to v2.1.0. Existing tests should pass unchanged.
- `developer` mode: only `import_modules` / `import_all` / `test_vba` / `import_queries` / `link_tables` / `relink_tables` / `localize_backend_links` / `generate_form` / `catalog_add_control` / `generate_erd` / `seed_fixture` (everything in `MODERN_TOOL_RISK` + `ALIAS_TOOL_RISK` classified as `routine-dev-write`) flip to execute-by-default.
- Export-source guard only fires in `developer` mode; in `safe-by-default` mode the existing dry-run default preempts it.

## Test strategy

Capa-by-capa TDD discipline (matches the v2.1.0 release):

- **Capa 1**: `dispatch-write-policy-normalize.test.ts` — pure helper table with `(toolName, mode, input)` triples; is the single source of truth for default injection behavior.
- **Capa 2**: drop hardcoded default in `vba-modules-adapter.ts`; add `vba-modules-adapter-write-policy.test.ts` for `import_modules` / `import_all` / `delete_module` truth table. Run the existing 2620 tests as the regression net.
- **Capa 3**: same cleanup in `vba-execution-adapter.ts`; `vba-execution-adapter-write-policy.test.ts` for `test_vba` / `run_vba` truth table.
- **Capa 4**: `export-source-guard.test.ts` (new) — full matrix from #783 §Scope item 3: exact source-root match refused, nested managed folder refused, external path allowed, case-insensitive Windows, explicit `confirmOverwriteSource: true` allowed, `safe-by-default` mode never refuses.
- **Capa 5**: regression lock — `dispatch-write-policy-allowWrites-overrides.test.ts`, `dispatch-write-policy-allowlist-overrides.test.ts`, `dispatch-write-policy-caller-intent-wins.test.ts` (`dryRun: true`, `apply: true`, etc.); capabilities consistency test (`get_capabilities.effectiveDryRunDefault[t] === effectiveDryRunDefaultForTool(t, mode)` already shipped; new test asserts the actual execution path matches).
- **Docs**: README §3a / §3b already exist; add a one-paragraph "Runtime enforcement live in v2.1.1" bullet.

## Rollback strategy

Single flag downstream: revert the PR + release v2.1.0 is intact + functional (zero risk to existing projects on `safe-by-default`). Projects on `developer` mode need a one-line config edit OR the rollback. No data-loss risk.
