# Design: PowerShell Executor Port Extraction

## Technical Approach

Formalize the `PowerShellExecutor` port type already defined locally in `access-runner.ts:104-108` as a first-class core contract. Move the concrete `powershell.exe`/`spawnPowerShellProcess` implementation out of `src/core/runner/powershell-executor.ts` into an adapter-owned module. Inject the executor from each composition root. The local `spawnPowerShell` wrapper in `access-runner.ts:608-651` stays where it is (it bridges the low-level `PowerShellProcessOptions` shape to the higher-level `PowerShellExecutor` contract) but becomes the adapter's responsibility to provide.

## Architecture Decisions

| Decision | Option A | Option B | Rationale |
|----------|----------|----------|-----------|
| Where does `PowerShellExecutor` type live? | `src/core/contracts/index.ts` | Keep in `access-runner.ts` | Contracts file is the canonical hexagonal boundary; already exports `VbaSyncPort` there. |
| Where does concrete spawn move? | New `src/adapters/powershell/` adapter module | Inline in each composition root | Single implementation, reused by CLI/MCP/HTTP/VBA-sync; avoids duplication. |
| How is the default wired? | Each composition root imports adapter default | Runner auto-resolves via adapter registry | Composition-root injection keeps core free of adapter knowledge; matches existing `executor?` pattern. |
| Does `vba-sync-adapter.ts` keep its direct import? | No — it gets the executor injected or resolves from adapter module | Keep direct import | VBA-sync is an adapter itself; it should import the adapter-owned implementation, not reach into core. |

## Data Flow

```
Composition Root (CLI / MCP / HTTP)
  └─ imports default PowerShellExecutor from src/adapters/powershell/
       └─ passes executor to AccessPowerShellRunner via options.executor
            └─ runner invokes executor(command, args, options)
                 └─ executor spawns process, returns PowerShellExecutionResult

vba-sync-adapter
  └─ imports PowerShellExecutor from src/adapters/powershell/ (not from core)
       └─ spawns PowerShell for VBA module export/import operations
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/contracts/index.ts` | Modify | Export `PowerShellExecutor`, `PowerShellExecutionResult`, `PowerShellExecutorOptions`, `AccessProcessOwnership` types (moved from access-runner). |
| `src/core/runner/access-runner.ts` | Modify | Remove import of `POWERSHELL_EXE`, `spawnPowerShellProcess` from `powershell-executor.js`. Re-export types from contracts for backward compat. Remove local `spawnPowerShell` default — constructor requires executor. |
| `src/core/runner/powershell-executor.ts` | Delete | Concrete spawn logic moves to adapter. |
| `src/adapters/powershell/default-executor.ts` | Create | Owns `POWERSHELL_EXE`, `spawnPowerShellProcess`, `buildChildEnv`, `killProcessTree`, and the `spawnPowerShell` bridge. Exports `createDefaultPowerShellExecutor()`. |
| `src/cli/commands/access.ts` | Modify | Import default executor from adapter; pass to `AccessPowerShellRunner`. |
| `src/cli/commands/doctor.ts` | Modify | Same composition-root wiring. |
| `src/adapters/mcp/stdio.ts` | Modify | Same composition-root wiring. |
| `src/adapters/http/http-services-factory.ts` | Modify | Same composition-root wiring. |
| `src/adapters/vba-sync/vba-sync-adapter.ts` | Modify | Replace core import with adapter-side import. |
| `test/core/runner/access-runner*.test.ts` | Modify | Inject fake executor in tests; remove any module-path assertions. |
| `test/core/runner/powershell-executor.test.ts` | Move | Becomes `test/adapters/powershell/default-executor.test.ts`. |

## Interfaces / Contracts

```typescript
// src/core/contracts/index.ts — new exports
export type PowerShellExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  accessProcess?: AccessProcessOwnership;
};

export type PowerShellExecutorOptions = {
  timeoutMs: number;
  operationId: string;
  accessPath: string;
  env?: Record<string, string | undefined>;
  onAccessProcessCaptured(process: AccessProcessOwnership): Promise<void>;
  onProgress?: AccessRunnerProgressCallback;
};

export type PowerShellExecutor = (
  command: string,
  args: readonly string[],
  options: PowerShellExecutorOptions,
) => Promise<PowerShellExecutionResult>;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Port boundary: core consumes `PowerShellExecutor` by injection | Inject fake executor in `access-runner.test.ts`; assert it is called with expected args. |
| Unit | Default executor behavior | Move `powershell-executor.test.ts` to adapter path; test spawn, timeout, env sandbox, kill-tree. |
| Integration | Existing regression suite | `pnpm test` and `pnpm build` must remain green. |
| E2E | Runner operations through real executor | Existing `mcp-e2e.mjs` validates end-to-end behavior preservation. |

## Migration / Rollout

No data migration required. Composition-root changes are compile-time: missing imports fail the build. Feature flag not needed — behavior is identical.

**Rollout sequence:**
1. Create `src/adapters/powershell/default-executor.ts` with concrete implementation.
2. Export port types from `src/core/contracts/index.ts`.
3. Update `access-runner.ts` to remove concrete imports; require executor in constructor.
4. Wire each composition root.
5. Update vba-sync adapter import.
6. Move test file.

## Open Questions

- None — the port shape already exists locally in `access-runner.ts:104-108` and is well-understood.
