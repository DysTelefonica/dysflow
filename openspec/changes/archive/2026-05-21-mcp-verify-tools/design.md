# Design: MCP Verify Tools

## Technical Approach

Implement the verify/reconcile slice inside the existing MCP adapter → core service boundary. `createDysflowMcpTools` continues to validate per-tool JSON schemas, expose only implemented legacy tools in tools/list, and dispatch VBA-sync tools to `legacyToolService`. `VbaSyncLegacyService` owns the safe comparison workflow: resolve the project target, export Access VBA to a temporary directory, compare that export with `destinationRoot`, return deterministic summaries, and always remove the temporary export root.

This preserves the configured dependency direction: adapters depend on core; core does not depend on adapters. It also preserves legacy MCP compatibility by keeping hidden unsupported stubs callable while avoiding normal tools/list exposure.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Safe binary inspection | Reuse the existing VBA manager `Export` action into `mkdtemp(tmpdir())` | Export into `destinationRoot`; add a new PowerShell verify action | Existing export already knows Access/VBA semantics. Temp export prevents source overwrite and avoids expanding the PowerShell surface. |
| Result contract | Return `matched`, `different`, `missingInSource`, `missingInBinary`, `dryRun:true`, `willModifyAccess:false`; add `diffs` only for `diff:true` | Return raw diff text; always include diffs | Structured summaries are testable and compact. Diff snippets stay opt-in to reduce payload size. |
| Reconcile behavior | `reconcile_binary` reuses compare and returns a recommendation only | Apply import/export changes automatically | The spec forbids mutation in this slice; explicit follow-up workflows are safer for Access databases. |
| Stub visibility | Mark `init_project` and `normalize_documents` hidden but callable with unsupported payloads | Remove handlers; expose not-implemented tools | Hidden stubs keep backward-compatible direct calls without advertising unavailable tools. |

## Data Flow

```text
tools/list ──→ createDysflowMcpTools ──→ visible implemented legacy tools

tools/call verify_* / reconcile_binary
  └─ validate LEGACY_TOOL_SCHEMAS[name]
     └─ legacyToolService.execute(name, input)
        └─ VbaSyncLegacyService
           ├─ resolveExecutionTarget + strict context checks
           ├─ preflight cleanup
           ├─ VBA manager Export → tempExportRoot
           ├─ compareVbaSourceTrees(destinationRoot, tempExportRoot, moduleNames, diff)
           └─ rm(tempExportRoot, recursive/force)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/services/vba-sync-legacy-service.ts` | Modify | Add verify/reconcile execution paths, temporary export, source-tree comparison, opt-in snippets, and `exists` alias mapping. |
| `src/core/config/dysflow-config.ts` | Modify | Allow matching repo-local `projectId` calls to load `.dysflow/project.json`; reject mismatches with `CONFIG_PROJECT_ID_MISMATCH`. |
| `src/adapters/mcp/tools.ts` | Modify | Add schemas for verify/reconcile, allow `exists.name` and `exists.moduleName`, hide unsupported stubs, and route implemented VBA-sync tools to `legacyToolService`. |
| `src/adapters/mcp/legacy-parity-registry.ts` | Modify | Mark `verify_code`, `verify_binary`, and `reconcile_binary` implemented for parity/tool metadata. |
| `test/core/services/vba-sync-legacy-service.test.ts` | Modify | Cover temp export, no source overwrite, module filtering, dry-run reconcile, and alias mapping. |
| `test/core/config/dysflow-config.test.ts` | Modify | Cover repo-local config resolution by matching `projectId`, `allowWrites`, async loading, and mismatch rejection. |
| `test/adapters/mcp/tools.test.ts` | Modify | Cover visible verify/reconcile tools, hidden unsupported stubs, service dispatch, schemas, and no legacy not-implemented leakage. |
| `README.md` | Modify | Document AI agent setup, repo-local `.dysflow/project.json`, projectId usage, and safe operation cleanup. |
| `E2E_testing/**` | Add | Include the MCP E2E harness, exported source, local project config, and run artifacts needed to reproduce validation. |

## Interfaces / Contracts

Verify payload shape:

```ts
{
  operation: "verify_code" | "verify_binary" | "reconcile_binary";
  ok: boolean;
  dryRun: true;
  willModifyAccess: false;
  sourceRoot: string;
  matched: ComparisonEntry[];
  different: ComparisonEntry[];
  missingInSource: ComparisonEntry[];
  missingInBinary: ComparisonEntry[];
  diffs?: DiffEntry[];
  recommendation?: string; // reconcile_binary only
}
```

Inputs accept `projectId`, `contextId`, path overrides, strict context fields, `moduleNames`, and `diff`. `exists` accepts `name` and `moduleName` as equivalent aliases.

Repo-local config resolution is part of this slice: when a caller provides `projectId`, Dysflow first resolves the current worktree's `.dysflow/project.json` and accepts the call only if the requested id matches the config id. This keeps short MCP calls traceable while avoiding the deprecated global registry.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | Source/binary compare outcomes and diff snippets | Vitest with temp directories and fake `VbaManagerExecutor`. |
| Integration | MCP registry visibility, validation, and dispatch | In-process `createDysflowMcpTools` tests with fake services. |
| Build | Type safety across adapter/core contracts | `pnpm build`. |

Strict TDD remains active: add/keep failing Vitest coverage before production changes, then run `pnpm test` and `pnpm build`.

## Migration / Rollout

No data migration required. Deliver as forced chained PR slice #1 with maintainer-approved size exception for README + E2E artifacts. Defer `init_project` and `normalize_documents` implementation to later issues.

## Open Questions

None.
