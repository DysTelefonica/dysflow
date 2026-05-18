# Design: Repo Engineering Hardening

## Technical Approach

Harden repo engineering in reviewable slices without changing product behavior. Add quality gates around the existing Node/TypeScript/Vitest stack, reconcile issue #160 because `setup.ts` already emits `Invalid Dysflow project registry JSON` without the registry path, implement #156 around `FileAccessOperationRegistry`, then start #157 with characterization-backed seams for `VbaSyncLegacyService`.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| CI scope | GitHub Actions runs `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`, lint, and coverage on PR/push. | Local-only checks. | Gates must be enforceable before work expands. |
| Lint/coverage | Add minimal project-owned scripts first; coverage starts with a realistic floor and ratchets later. | Introduce a full style migration now. | Avoids a noisy formatting PR and keeps the first slice reviewable. |
| #160 | Treat as reconciliation/documentation unless current code regresses. | Re-implement the fix. | `src/cli/commands/setup.ts` and `test/cli/commands.test.ts` already assert the sanitized error. |
| #156 locking | Keep the in-process promise queue, add cross-process file locking around read-modify-write. | One-writer policy only. | Multiple MCP/Dysflow processes can share the operations file; policy alone does not protect writes. |
| #157 refactor | Extract small internal helpers behind existing public `VbaSyncLegacyService.execute`. | Rewrite the service. | Existing parity/config/tests are broad; seams reduce cognitive load without behavior risk. |

## Data Flow

```text
CLI/MCP operation
  -> FileAccessOperationRegistry.withFileLock
  -> process-local queue
  -> cross-process lock file/acquire timeout
  -> read records -> mutate -> atomic write -> release
```

CI gates run independently of Access: mocked Vitest tests, TypeScript build, lint, and coverage. Access-dependent behavior remains behind existing test doubles.

## File Changes

| File | Action | Description |
|---|---|---|
| `.github/workflows/ci.yml` | Create | Install pnpm dependencies and run test/build/lint/coverage gates. |
| `package.json` | Modify | Add `lint`, `coverage`, and CI-safe scripts; keep `test` and `build`. |
| `vitest.config.ts` | Modify | Enable coverage config and exclude generated/dist artifacts. |
| `src/core/operations/access-operation-registry.ts` | Modify | Add lock acquire/release helpers and atomic write behavior for file-backed registry. |
| `test/core/runner/access-operation-registry.test.ts` | Modify | Add inter-process/lock contention tests plus stale-lock behavior if implemented. |
| `src/cli/commands/setup.ts` | Verify/possibly no-op | Confirm #160 remains path-safe; only adjust if regression is found. |
| `test/cli/commands.test.ts` | Verify/modify | Keep explicit malformed-registry assertion path-free. |
| `src/core/services/vba-sync-legacy-service.ts` | Modify | Extract first cohesive helper group, likely import planning or form catalog helpers. |
| `test/core/services/vba-sync-legacy-service.test.ts` | Modify | Add characterization tests before each seam extraction. |
| `docs/` or issue comments | Modify | Document #160 resolution and chained PR sequencing if needed. |

## Interfaces / Contracts

No public CLI/MCP contract changes. Internal lock options may extend `FileAccessOperationRegistryOptions`:

```ts
lockTimeoutMs?: number;
staleLockMs?: number;
```

Defaults must preserve existing constructor behavior.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | registry lock acquire/release, malformed JSON, stale lock, metadata cloning | Vitest temp dirs and injected timing where needed |
| Unit | `VbaSyncLegacyService` seams preserve outputs/errors | Existing executor doubles plus new characterization tests |
| CLI | setup malformed registry error hides path | Existing `runCli`/`handleSetupCommand` tests |
| CI | gates are wired | Workflow/config tests or package-script assertions, then real CI run |

## Migration / Rollout

No data migration required. Roll out as chained PRs: quality baseline, #160 reconciliation, #156 lock, then one small #157 seam. Each PR stays under the 400-line review budget or requires `size:exception`.

## Open Questions

- [ ] Exact coverage threshold after first `pnpm coverage` baseline.
- [ ] Preferred lock implementation: dependency-free lock-file directory vs adding a small locking package.
