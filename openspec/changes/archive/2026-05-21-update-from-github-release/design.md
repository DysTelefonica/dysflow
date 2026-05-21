# Design: Update from Latest GitHub Release

## Technical Approach

Keep `handleUpdateCommand` as the CLI boundary. Add a small `ReleaseUpdateProvider` contract that resolves a buildable package root for the latest release, then reuse existing `installRuntime()` with that package root.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Update source | GitHub latest release provider | Local checkout only | Matches installed-user expectation. |
| Testability | Inject provider through command context | Mock global `fetch`/process | Keeps tests deterministic and avoids real network/build. |
| Install path | Reuse `installRuntime()` | Duplicate copy logic | Avoids launcher/docs/runtime drift. |
| Tooling | Download/build temporary source workspace | Require user to git pull | Removes developer checkout requirement; keeps no release assets needed. |

## Data Flow

    handleUpdateCommand
      ├─ read installed app/package.json
      ├─ provider.resolveLatestPackage()
      │    └─ latest version + packageRoot
      ├─ compare versions / --force
      └─ installRuntime(runtimePaths, provider packageRoot)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/cli/commands/install.ts` | Modify | Add provider interface, default GitHub provider, update orchestration. |
| `test/cli/install.test.ts` | Modify | Add RED/GREEN tests for newer release, skip, force, and failure. |
| `README.md` | Modify | Explain GitHub-backed `dysflow update`. |
| `CHANGELOG.md` | Modify | Document feature release. |
| `package.json` | Modify | Minor version bump after feature completion. |

## Interfaces / Contracts

```ts
export type ReleaseUpdateProvider = {
  resolveLatestPackage(): Promise<{ version: string; packageRoot: string; cleanup?: () => Promise<void> }>;
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | update comparison and provider failure | Inject fake provider in `handleUpdateCommand`. |
| Integration | runtime copy from resolved release package | Temp package roots in Vitest. |
| CLI | help/dispatch unchanged | Existing command tests. |

## Migration / Rollout

No migration required. Existing runtime layout stays unchanged.

## Open Questions

None.
