# Design: Windows Process Adapters

Move concrete `node:child_process`-backed Windows process implementations from `src/core/operations/windows-processes.ts` into `src/adapters/process/windows-processes.ts`. Core retains port types (`ProcessInspector`, `ProcessKiller`, `ProcessScanner`, `OsProcessInfo`) and pure parsing helpers. No behavior change.

## Technical Approach

Direct module move: relocate the three concrete classes (`WindowsMsAccessProcessInspector`, `WindowsProcessKiller`, `WindowsMsAccessProcessScanner`) plus their internal helpers (`buildCimWithFallbackScript`, `normalizeMainWindowHandle`, `DMTF_PATTERN`, `CIM_JOB_TIMEOUT_SEC`) and the `node:child_process`/`node:util` imports to the adapter-owned file. Pure parsing functions (`parseCimDateTimeToIso`, `normalizeProcessList`, `PROCESS_INSPECTOR_TIMEOUT_MS`) stay in core — they have no OS dependency and are tested independently. Repoint four composition roots.

## Architecture Decisions

### Decision: What moves vs. what stays in core

| Option | What moves | Tradeoff | Decision |
|--------|-----------|----------|----------|
| A: Move everything | Classes + parsing helpers | Clean single-file deletion; parsing tests must move or re-import | Rejected — parsing is pure, belongs in core domain |
| B: Move classes only | Classes + child_process helpers + PS script builder | Parsing stays tested at core boundary; adapter re-exports `normalizeProcessList` for scanner | **Chosen** — cleanest hexagonal boundary |
| C: Move classes, keep PS strings in core | Classes move, PowerShell script strings stay | Core still owns Windows implementation detail | Rejected — defeats the purpose |

### Decision: Test relocation strategy

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Move test file to `test/adapters/process/` | Follows implementation; adapter tests own adapter code | **Chosen** |
| Keep test in core, re-import from adapter | Avoids file move; core test imports adapter (wrong direction) | Rejected |

### Decision: Re-export for normalizeProcessList

The scanner calls `normalizeProcessList` which lives in core. Two options:

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Adapter imports `normalizeProcessList` from core directly | Clean; adapter depends on core (correct direction) | **Chosen** |
| Re-export from adapter | Unnecessary indirection | Rejected |

## Data Flow

```
Composition roots (MCP/HTTP/VBA-sync/Runner)
    │
    ├──→ import from src/adapters/process/windows-processes.ts
    │       ├── WindowsMsAccessProcessInspector
    │       ├── WindowsProcessKiller
    │       └── WindowsMsAccessProcessScanner
    │             └── calls normalizeProcessList from core
    │
    └──→ inject into core ports
            ├── ProcessInspector
            ├── ProcessKiller
            └── ProcessScanner
                    │
                    └──→ AccessOperationPreflightCleanupService (core)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/adapters/process/windows-processes.ts` | Create | New adapter-owned module: three classes + PS helpers + child_process import |
| `src/core/operations/windows-processes.ts` | Modify | Remove classes, PS helpers, child_process import; keep `parseCimDateTimeToIso`, `normalizeProcessList`, `PROCESS_INSPECTOR_TIMEOUT_MS` |
| `src/core/runner/access-runner.ts` | Modify | Import classes from `../../adapters/process/windows-processes.js` instead of `../operations/windows-processes.js` |
| `src/adapters/http/http-services-factory.ts` | Modify | Import from `../process/windows-processes.js` instead of `../../core/operations/windows-processes.js` |
| `src/adapters/mcp/stdio.ts` | Modify | Import from `../process/windows-processes.js` instead of `../../core/operations/windows-processes.js` |
| `src/adapters/vba-sync/vba-operations-adapter.ts` | Modify | Dynamic import path changes to `../process/windows-processes.js` |
| `test/adapters/process/windows-processes.test.ts` | Create | Relocated from `test/core/operations/`; imports from adapter path |
| `test/core/operations/windows-processes.test.ts` | Delete | Replaced by adapter test |

## Interfaces / Contracts

No new interfaces. The existing port types in `src/core/operations/access-operation-cleanup.ts` remain unchanged:

```typescript
// Unchanged — core owns these
type OsProcessInfo = { pid: number; name: string; startTime?: string; commandLine?: string; mainWindowHandle?: number };
type ProcessInspector = { getProcess(pid: number): Promise<OsProcessInfo | undefined> };
type ProcessKiller = { kill(pid: number): Promise<void> };
type ProcessScanner = { listProcesses(): Promise<OsProcessInfo[]> };
```

Adapter module exports the same three class names with identical signatures. Callers see no API change.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (core) | `parseCimDateTimeToIso`, `normalizeProcessList` | Existing tests stay at `test/core/operations/` — pure parsing, no OS deps |
| Unit (adapter) | Classes, PS script building, child_process mock | Relocated test at `test/adapters/process/` — mocks `node:child_process`, asserts script shapes and error propagation |
| Boundary | Core has no `child_process` import | Add grep-based assertion or rely on existing dependency-boundary checks |
| Regression | `pnpm test` + `pnpm build` pass | Standard CI gate |

## Migration / Rollout

No migration required. Single commit with file moves and import rewrites. Revert restores original module.

## Open Questions

- None — exploration and spec already resolved all ambiguity. Ready for tasks.
