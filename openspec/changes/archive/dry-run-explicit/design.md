# Design: Dry-Run Explicit Warning

## Technical Approach

Keep existing safe dry-run behavior in `src/adapters/mcp/tools.ts`, but make omitted-flag dry-run visible for write-capable legacy MCP paths. `resolveIsDryRun(input): boolean` remains the canonical boolean resolver; a narrow adapter-local helper will add metadata for whether dry-run was selected because both `apply` and `dryRun` were omitted. Responses keep the normal core result at `content[0]`; the warning is appended as an additional text item only when the request defaulted.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Change `resolveIsDryRun` to return an object | Richer data but breaks existing callers/tests and violates the spec's boolean contract | Keep `resolveIsDryRun(input): boolean`; add `resolveDryRunState(input)` that delegates to it |
| Emit warning from core/query services | Central but leaks MCP presentation policy into core | Emit in MCP adapter only, preserving core/adapters dependency direction |
| Prepend/replace warning content | Highly visible but breaks clients reading `content[0]` | Append `DRY_RUN_DEFAULT:` after translated content |
| Warn on every `dryRun:true` | Simple but mislabels intentional dry-runs | Warn only when both flags are absent |

## Data Flow

```text
MCP handler input
  ├─ validateInput(schema)
  ├─ resolveDryRunState(input)
  │    └─ resolveIsDryRun(input)
  ├─ optional write guard when !isDryRun
  ├─ execute core service / legacy dispatch
  └─ translateCoreResultToMcpContent(result)
       └─ append DRY_RUN_DEFAULT warning when defaulted write-capable path
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/adapters/mcp/tools.ts` | Modify | Export `resolveIsDryRun`; add `resolveDryRunState` and response-append helper; apply only in `handleValidatedLegacyWrite` and write-capable branches of `createLegacyDispatchTool`. |
| `test/adapters/mcp/tools.dry-run.test.ts` | Modify | Add RED tests for omitted flags on `exec_sql` and dispatched `relink_directory`, asserting sentinel presence and `content[0]` stability; assert no warning for `dryRun:true`, `dryRun:false`, and `apply:true`. |
| `test/adapters/mcp/tools.test.ts` | Modify | Add/adjust focused integration coverage only if needed for primary response shape with existing fake services. |

## Interfaces / Contracts

```ts
export function resolveIsDryRun(input: unknown): boolean;

type DryRunState = {
  isDryRun: boolean;
  wasDefault: boolean;
};
```

`wasDefault` is true only when `isDryRun === true`, `input` is an object, and neither `apply` nor `dryRun` is an own property. The warning text must contain `DRY_RUN_DEFAULT:` and should explain that omitted `apply`/`dryRun` caused a safe dry-run.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Canonical resolution and default metadata | Extend `tools.dry-run.test.ts` through handler behavior; no database or process access. |
| Adapter integration | Legacy write result shape | Use existing fake services to prove `content[0]` remains JSON result and sentinel is appended. |
| Regression | No false positives | Assert explicit `dryRun:true`, `dryRun:false`, and `apply:true` do not include `DRY_RUN_DEFAULT:`. |

Strict TDD applies in implementation: write failing Vitest assertions before production edits, then run `pnpm test` and `pnpm build` during verification, not in this design phase.

## Migration / Rollout

No migration required. The change is response-only and preserves execution semantics. Rollback removes the append helper/tests and leaves existing dry-run defaults intact.

## Open Questions

None.
