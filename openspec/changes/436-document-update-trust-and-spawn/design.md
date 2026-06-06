# Design: Document Update Trust Model and PowerShell Spawn shell:false

## Technical Approach

No production behavior changes. All three changes (JSDoc, security doc, dead-code removal)
are documentation and test additions on top of the already-correct implementation.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Security doc location | `docs/security/update-trust-model.md` | Inline in AGENTS.md; inside downloader.ts JSDoc | Separate file keeps the doc reviewable, linkable, and easy to grow. AGENTS.md gets a one-line pointer. |
| JSDoc placement | Both `buildChildEnv` and `spawnPowerShellProcess` | Only `spawnPowerShellProcess` | `buildChildEnv` is the function that enforces the allowlist; `spawnPowerShellProcess` is the public API callers see. Both need docs. |
| Port-level test assertion | Assert `mockSpawn.mock.calls.at(0)?.[2].shell === false` | Assert via spy on `spawn` options | The existing test file already intercepts `spawn` via `vi.mock("node:child_process")`; reusing the same `mockSpawn` mock is the lowest-friction, consistent approach. The assertion is behavioral (the process spawn boundary received `shell: false`) not internal. |
| Dead-code scope | Remove only `_GITHUB_REPO_URL` | Remove `GITHUB_LATEST_RELEASE_API` too | `GITHUB_LATEST_RELEASE_API` is used in `resolveLatestRelease`. Only `_GITHUB_REPO_URL` is truly dead (underscore-prefixed, zero references). |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Port: spawn options | `spawnPowerShellProcess` passes `shell: false` to the OS spawn call | Mock `node:child_process` (already mocked); assert options arg contains `shell: false` |
| Regression | All existing executor tests stay green | `pnpm test` |

The `shell: false` assertion is behavioral at the spawn port: the test checks what the
spawn adapter (the OS process boundary) received, not how the function is implemented
internally. A future refactor that accidentally sets `shell: true` would turn this test
red — which is exactly the desired behavior.

## File Changes

| File | Action | Description |
|---|---|---|
| `docs/security/update-trust-model.md` | New | Trust model document |
| `AGENTS.md` | Modify | Add link to trust model under Hard rules |
| `src/core/runner/powershell-executor.ts` | Modify | JSDoc on `buildChildEnv` and `spawnPowerShellProcess` |
| `src/cli/commands/install/downloader.ts` | Modify | Remove dead `_GITHUB_REPO_URL` constant (line 7) |
| `test/core/runner/powershell-executor.test.ts` | Modify | New describe block: `spawn security options` with `shell: false` test |
| `openspec/changes/436-document-update-trust-and-spawn/` | New | SDD change artifacts |

## Open Questions

None.
