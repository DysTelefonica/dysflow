# Proposal: PowerShell Child Process Env Allowlist

## Intent

`spawnPowerShellProcess` (`src/core/runner/powershell-executor.ts:33`) spawns every
PowerShell child with `env: { ...process.env, ...options.env }`, leaking the ENTIRE
host process environment into each child. Any secret, token, or sensitive var present
in the Node host (`GH_TOKEN`, CI credentials, unrelated app secrets) is handed to a
subprocess that has no need for it. The PS scripts only read a handful of explicit
password vars (passed via `options.env`) plus a few Windows system vars. We close this
leak now because issue #350 flags it as a real attack surface and the fix is narrow.
Success = no host env var reaches a PowerShell child unless it is on an explicit
allowlist or passed deliberately via `options.env`.

## Scope

### In Scope
- Replace the `{ ...process.env, ...options.env }` spread with a `buildChildEnv(override?)`
  helper that filters `process.env` to an explicit allowlist, then overlays `override`.
- Export `POWERSHELL_SYSTEM_ENV_KEYS` (the allowlist) for testability and inspection.
- New unit test for `spawnPowerShellProcess`: a `SECRET_TOKEN` in `process.env` MUST NOT
  appear in the child env; allowlisted vars and explicit `options.env` MUST appear.

### Out of Scope
- Changing call sites (`access-runner.ts`, `vba-sync-legacy-adapter.ts`) — they already
  isolate secrets correctly via `options.env`. Zero changes there.
- Modifying the PowerShell scripts (`.ps1`) or their env consumption.
- Broader env-hygiene work across non-PowerShell subprocesses.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `access-core-runner`: adds a security requirement — the runner MUST construct the child
  process environment from an explicit system-var allowlist plus caller-provided overrides,
  and MUST NOT inherit the full host environment.

## Approach

Approach A (per exploration): centralize the fix at the single env-construction point.
Introduce `buildChildEnv(override?)` inside `powershell-executor.ts` that picks only the
keys in `POWERSHELL_SYSTEM_ENV_KEYS` from `process.env`, then spreads `override` on top.

```ts
const POWERSHELL_SYSTEM_ENV_KEYS = [
  "SystemRoot", "windir", "PATH", "PATHEXT",
  "TEMP", "TMP", "USERPROFILE", "USERNAME",
  "COMPUTERNAME", "LOCALAPPDATA", "APPDATA",
  "HOMEDRIVE", "HOMEPATH",
] as const;
```

One change point means every caller benefits automatically and no call site discipline is
required. `-NoProfile` already removes most profile-loading env dependencies.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/runner/powershell-executor.ts` | Modified | Add `POWERSHELL_SYSTEM_ENV_KEYS` + `buildChildEnv`; replace line 33 spread |
| `test/core/runner/powershell-executor.test.ts` | New | Verify SECRET_TOKEN is filtered; allowlist + override pass through |
| `src/core/runner/access-runner.ts` | Unchanged | Already passes only secrets via `options.env` |
| `src/adapters/vba-sync/vba-sync-legacy-adapter.ts` | Unchanged | Already passes only `request.env` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| MS Access COM needs a Windows var not on the list | Med | Conservative allowlist already includes `HOMEDRIVE`/`HOMEPATH`; validate via E2E |
| Future caller needs a custom var | Low | Intentional — caller adds it via `options.env` |
| Regression in existing runner behavior | Low | New unit test pins child env shape; existing tests mock the executor and stay green |

## Rollback Plan

Single-function revert: restore `env: { ...process.env, ...options.env }` at line 33,
remove `buildChildEnv` and `POWERSHELL_SYSTEM_ENV_KEYS`, delete the new test. No data
migration, no config change, no API surface change.

## Dependencies

- None. Self-contained within the runner module.

## Success Criteria

- [ ] A non-allowlisted host var (e.g. `SECRET_TOKEN`) does NOT reach the PowerShell child env.
- [ ] Allowlisted system vars and explicit `options.env` overrides DO reach the child.
- [ ] `POWERSHELL_SYSTEM_ENV_KEYS` is exported and covered by the new test.
- [ ] Existing access-runner and vba-sync tests remain green with no source changes.
