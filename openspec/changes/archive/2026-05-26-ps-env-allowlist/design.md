# Design: PowerShell Child Process Env Allowlist

## Technical Approach

Close the env leak at the single construction point inside
`spawnPowerShellProcess` (`src/core/runner/powershell-executor.ts:33`). Today the
child inherits the full host env via `{ ...process.env, ...options.env }`. We
replace that with `buildChildEnv(options.env)`, which copies ONLY an explicit
system-var allowlist from `process.env`, then overlays caller-provided
`options.env`. This satisfies the modified `access-core-runner` security
requirement: the runner builds child env from an allowlist plus caller
overrides and never inherits the full host env. No call sites change —
`access-runner.ts` and `vba-sync-legacy-adapter.ts` already isolate secrets via
`options.env`.

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|----------|--------|-----------------------|-----------|
| Where to fix | Centralize in `spawnPowerShellProcess` env construction | Filter at each call site; wrapper module | One choke point → every caller benefits, no call-site discipline, smallest diff, single-function rollback |
| Allowlist visibility | Export `POWERSHELL_SYSTEM_ENV_KEYS` as `as const` | Keep private | Needed for direct unit assertion of allowed keys; `as const` gives literal types and a frozen contract |
| Helper shape | Internal `buildChildEnv(override?)` returning a plain record | Inline filter; class/config | Pure, testable in isolation, mirrors existing functional style of the module |
| Filter semantics | Copy key only if `process.env[key] !== undefined` | Always copy (would inject `undefined`) | Avoids passing keys absent on the host; override still wins via spread order |

## Data Flow

    options.env (secrets/overrides) ─┐
                                     ▼
    process.env ──filter(allowlist)──► base ──spread override──► child env
                                                                    │
                                                                    ▼
                                                   spawn(powershell.exe, args, { env })

Non-allowlisted host vars (e.g. `SECRET_TOKEN`, `GH_TOKEN`) are dropped before
`base` is built, so they never reach the spawned process.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/runner/powershell-executor.ts` | Modify | Add `POWERSHELL_SYSTEM_ENV_KEYS` (exported) + `buildChildEnv()` (internal); replace line 33 `env:` spread with `env: buildChildEnv(options.env)` |
| `test/core/runner/powershell-executor.test.ts` | Create | Unit test: `SECRET_TOKEN` filtered out; `SystemRoot` (allowlist) + `options.env` overrides pass through |
| `src/core/runner/access-runner.ts` | Unchanged | Already passes only secrets via `options.env` |
| `src/adapters/vba-sync/vba-sync-legacy-adapter.ts` | Unchanged | Already passes only `request.env` |

## Interfaces / Contracts

```ts
export const POWERSHELL_SYSTEM_ENV_KEYS = [
  "SystemRoot", "windir", "PATH", "PATHEXT",
  "TEMP", "TMP", "USERPROFILE", "USERNAME",
  "COMPUTERNAME", "LOCALAPPDATA", "APPDATA",
  "HOMEDRIVE", "HOMEPATH",
] as const;

function buildChildEnv(
  override?: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const base: Record<string, string | undefined> = {};
  for (const key of POWERSHELL_SYSTEM_ENV_KEYS) {
    if (process.env[key] !== undefined) base[key] = process.env[key];
  }
  return { ...base, ...override };
}
```

`buildChildEnv` stays internal (not exported) — the allowlist constant is the
public contract; the helper is exercised indirectly through the captured
`spawn` options, or imported via a type-only/`@internal` path if the test
imports it directly.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | Host secret filtered; allowlist + override pass through | New `powershell-executor.test.ts`; mock `node:child_process.spawn`, capture its 3rd arg (`SpawnOptions`), assert on `.env` |
| Unit | `POWERSHELL_SYSTEM_ENV_KEYS` exported | Import constant, assert membership |
| Integration/E2E | Access COM still works without leaked env | Existing `access-fixture.e2e` / relink E2E stay green (validates allowlist completeness) |

Mock pattern follows the project convention (`vi.mock("node:module", factory)`
with a hoisted `vi.fn()`, as in `test/cli/install.test.ts`). The `spawn` mock
must return a minimal child stub so the promise settles:

```ts
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));
// stub return: { stdout:{on}, stderr:{on}, on:(ev,cb)=> ev==="close" && cb(0), kill:()=>{} }
```

Test discipline: set `process.env.SECRET_TOKEN` and `process.env.SystemRoot`
in setup, restore/delete both in `afterEach` (or save+restore the prior values)
so global env is not polluted. Assert the captured options `.env` has
`SystemRoot` and the override key, and does NOT have `SECRET_TOKEN`.

## Constraints

- DO NOT touch `test/adapters/mcp/stdio.test.ts`. Its
  `expect(stdioSource).toContain("env: process.env")` asserts the MCP adapter,
  which is a separate subsystem from the PS executor. Out of scope.

## Migration / Rollout

No migration required. Single-function revert restores the original spread and
removes the constant, helper, and new test (per proposal rollback plan).

## Open Questions

- [ ] If MS Access COM needs a Windows var not on the allowlist, surface it via
      E2E and add the key (likely candidates already covered:
      `HOMEDRIVE`/`HOMEPATH`/`LOCALAPPDATA`). Validate during apply.
