# Proposal: Document Update Trust Model and PowerShell Spawn shell:false

## Intent

Issue #436 (Critical, audit C2) identified that the Dysflow update path lacked explicit
documentation of its trust model, and that the PowerShell spawn security properties
(`shell: false`, env sandbox) were undocumented. The insecure git-clone fallback was
already removed in commit `499d5e4`; this change closes the remaining acceptance criteria:
documentation, a port-level test for `shell: false`, and dead-code cleanup.

## Scope

### In Scope
- Add a `docs/security/update-trust-model.md` documenting the SHA-256 update mechanism,
  the absence of a git-clone fallback, and the PowerShell spawn trust model.
- Add JSDoc to `spawnPowerShellProcess` and `buildChildEnv` in
  `src/core/runner/powershell-executor.ts` explaining `shell: false`, `windowsHide: true`,
  and the env allowlist.
- Add a port-level test in `test/core/runner/powershell-executor.test.ts` asserting the
  spawn is called with `shell: false`.
- Remove the dead `_GITHUB_REPO_URL` constant from
  `src/cli/commands/install/downloader.ts` (leftover from the removed fallback).
- Link the new security doc from `AGENTS.md`.

### Out of Scope
- Changes to the update mechanism itself.
- Changes to `looksLikeReadOnlySql`, query services, or any other core behavior.
- New CLI commands or MCP tools.

## Capabilities

### Modified Capabilities
- `product-cli`: the spec gains a requirement that the update path MUST verify SHA-256
  checksums and MUST NOT fall back to a source-build or git-clone path.

## Approach

Documentation-first: write the trust model doc to capture the as-is behavior (already
safe post-499d5e4). Then make the test suite explicitly verify the `shell: false`
invariant at the spawn boundary so a future regression would be caught. Remove dead code
that was left over from the removed fallback.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docs/security/update-trust-model.md` | New | Trust model for update path and spawn boundary |
| `AGENTS.md` | Modified | Links to the new security doc |
| `src/core/runner/powershell-executor.ts` | Modified | JSDoc on `buildChildEnv` and `spawnPowerShellProcess` |
| `src/cli/commands/install/downloader.ts` | Modified | Remove dead `_GITHUB_REPO_URL` constant |
| `test/core/runner/powershell-executor.test.ts` | Modified | New test: spawn called with `shell: false` |
| `openspec/changes/436-document-update-trust-and-spawn/` | New | SDD change artifacts |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| JSDoc wording causes confusion about caller responsibility | Low | Explicitly state callers must validate externally-derived args |
| Dead-code removal breaks a reference | Low | Repo-wide search confirms `_GITHUB_REPO_URL` only appears in downloader.ts |

## Success Criteria

- [ ] `docs/security/update-trust-model.md` exists and documents the SHA-256 mechanism,
  the no-fallback policy, and the spawn trust model.
- [ ] `spawnPowerShellProcess` and `buildChildEnv` have JSDoc explaining `shell: false`
  and the env sandbox.
- [ ] A port-level test asserts `spawn` receives `{ shell: false }`.
- [ ] `_GITHUB_REPO_URL` is removed; no remaining references in the repo.
- [ ] `pnpm lint`, `pnpm test`, and `pnpm build` are all clean.
