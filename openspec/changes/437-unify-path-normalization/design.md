# Design: Unify Path Normalization with Portable isAbsolutePath

## Technical Approach

Add a single pure function `isAbsolutePath` to `src/core/utils/path-utils.ts` that recognizes
Windows-style paths as absolute on any host platform. Replace all four `node:path.isAbsolute`
call sites with this function. Fix the cleanup consistency asymmetry as a bundled improvement.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Location of `isAbsolutePath` | `src/core/utils/path-utils.ts` | New standalone file; inline at each call site | Already the home for path-related pure utilities; auto-exported via `index.ts` |
| POSIX check ordering | Test `/` first, then `\\`, then drive-letter regex | Single combined regex | Ordered guards are O(1) and short-circuit; the regex for drive letters is the only non-trivial case |
| Drive-letter regex | `/^[A-Za-z]:[/\\]/` | `/^[A-Za-z]:\//` (forward-slash only) | Must also accept backslash separator for paths sourced from Windows config files |
| UNC prefix | `startsWith("\\\\")` | Part of the drive-letter regex | Keeps the three cases visually distinct and independently testable |
| Cleanup asymmetry | Replace `normalizePathForMatching(...).includes(...)` with `pathMatchesAccessPath` | Keep as-is | `pathMatchesAccessPath` is the existing higher-level function for this exact check; using the lower-level primitives directly was an oversight |

## Data Flow

```text
config JSON (Windows accessPath "C:/db/project.accdb")
       │
       ▼
resolveProjectPath(value, projectRoot)
       │  isAbsolutePath("C:/db/project.accdb") → true   ← was: node:path.isAbsolute → false on Linux
       ▼
  resolve("C:/db/project.accdb")                          ← path preserved correctly
       │
       ▼
DysflowConfig.accessPath = "C:/db/project.accdb"         ← round-trips correctly on any host
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/core/utils/path-utils.ts` | Add | `isAbsolutePath(value: string): boolean` — POSIX + Windows drive-letter + UNC detection |
| `src/core/config/dysflow-config.ts` | Modify | Remove `isAbsolute` from `node:path` import; add `isAbsolutePath` to utils import; replace two usages |
| `src/adapters/vba-sync/vba-execution-adapter.ts` | Modify | Remove `isAbsolute` from `node:path` import; add `isAbsolutePath` to utils import; replace one usage |
| `src/cli/commands/setup.ts` | Modify | Remove `isAbsolute` from `node:path` import; add `isAbsolutePath` utils import; replace one usage |
| `src/core/operations/access-operation-cleanup.ts` | Modify | Replace inline `normalizePathForMatching` chain with `pathMatchesAccessPath` |
| `test/core/utils/path-utils.test.ts` | Add | 13 pure-function tests covering Windows, UNC, POSIX, and relative path forms |

## Interfaces / Contracts

```typescript
// src/core/utils/path-utils.ts (new export)
export function isAbsolutePath(value: string): boolean;
```

- No new error codes, no schema changes, no runtime migration.
- Clean-architecture boundary preserved: the new utility is in `src/core/utils`, with no adapter imports.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Pure unit | `isAbsolutePath` with Windows, UNC, POSIX, and relative inputs | Direct calls in `test/core/utils/path-utils.test.ts`; no I/O |
| Port-level (existing) | `resolveExecutionTarget` preserves Windows `accessPath` on POSIX host | Existing `vba-sync-adapter.test.ts` test that writes `C:/db/project.accdb` to tmpdir — now passes on Linux CI |

Tests assert observable behavior (returned value), not internal implementation. The `isAbsolutePath`
function is a pure function, so unit tests are the right tool (per testing-philosophy.md §"Unit —
only for pure/algorithmic complexity").

## Open Questions

None.
