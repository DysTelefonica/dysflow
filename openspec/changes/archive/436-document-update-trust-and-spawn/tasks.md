# Tasks: Document Update Trust Model and PowerShell Spawn shell:false

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~80 total (under review budget) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-PR |
| Chain strategy | n/a |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Docs + JSDoc + test + dead-code removal | PR 1 | All documentation; no behavior change; full `pnpm test` on completion |

## Phase 1: Documentation

- [x] 1.1 Create `docs/security/update-trust-model.md` documenting the SHA-256 update mechanism,
  the no-git-clone-fallback policy, and the `spawnPowerShellProcess` spawn trust model
  (`shell: false`, env allowlist).
- [x] 1.2 Add a link to the new doc in `AGENTS.md` under the Hard rules section.

## Phase 2: JSDoc

- [x] 2.1 Add a JSDoc block to `buildChildEnv` in `src/core/runner/powershell-executor.ts`
  describing the env allowlist and why host secrets are excluded.
- [x] 2.2 Add a JSDoc block to `spawnPowerShellProcess` in `src/core/runner/powershell-executor.ts`
  explaining `shell: false` (args as array, no shell metacharacter injection), `windowsHide: true`,
  and the env sandbox. Note caller responsibility for validating externally-derived args.

## Phase 3: Port-Level Test

- [x] 3.1 In `test/core/runner/powershell-executor.test.ts`, add a new describe block
  `"spawnPowerShellProcess — spawn security options"` with a test asserting that `mockSpawn`
  receives `{ shell: false }` as part of its options argument.

## Phase 4: Dead-Code Removal

- [x] 4.1 Verify `_GITHUB_REPO_URL` in `src/cli/commands/install/downloader.ts:7` is unused
  repo-wide. Confirm no other file references the constant.
- [x] 4.2 Remove the `_GITHUB_REPO_URL` constant from `downloader.ts`.

## Phase 5: Verification

- [x] 5.1 Run `pnpm lint` and confirm clean for modified files.
- [x] 5.2 Run `pnpm test` and confirm all suites pass; no regressions.
- [x] 5.3 Run `pnpm build` and confirm clean.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification |
|---|---|---|---|
| (pending) | Documentation + JSDoc + spawn shell:false test + dead-code cleanup | 1.1, 1.2, 2.1, 2.2, 3.1, 4.1, 4.2, 5.1, 5.2, 5.3 | `pnpm lint`, `pnpm test`, `pnpm build` |
