# Tasks: PowerShell Child Process Env Allowlist (`ps-env-allowlist`)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~35–50 (prod) + ~80–100 (test) = ~115–150 total |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (not needed — well under budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Red test + prod fix + Green | PR 1 (main) | All in one commit sequence; ~150 lines total |

---

## Phase 1: Foundation — Failing Test (RED)

- [ ] 1.1 Create `test/core/runner/powershell-executor.test.ts`. Import `POWERSHELL_SYSTEM_ENV_KEYS` and `spawnPowerShellProcess` from `src/core/runner/powershell-executor.ts`. At this point the import of `POWERSHELL_SYSTEM_ENV_KEYS` fails (symbol doesn't exist) — test file is RED by compilation.
  - Req: "POWERSHELL_SYSTEM_ENV_KEYS is a named export"

- [ ] 1.2 In that test file, add `vi.mock("node:child_process", ...)` with a hoisted `vi.fn()` spy (same pattern as `test/cli/install.test.ts`). Stub `spawn` to return `{ stdout:{on:vi.fn()}, stderr:{on:vi.fn()}, on:(ev,cb)=>{ if(ev==="close") cb(0) }, kill:vi.fn() }` so the Promise resolves. Test remains RED.
  - Req: Design — Mock convention

- [ ] 1.3 Write the four `it()` assertions (all RED at this point):
  - `SECRET_TOKEN` NOT present in captured `SpawnOptions.env` (Spec: "Host secret filtered from child env")
  - `SystemRoot` IS present (Spec: "Allowlisted system var forwarded when present on host")
  - `DYSFLOW_ACCESS_PASSWORD` from `options.env` IS present (Spec: "Caller override always forwarded")
  - `POWERSHELL_SYSTEM_ENV_KEYS` is a non-empty readonly string array containing at minimum `SystemRoot`, `PATH`, `TEMP`, `USERNAME` (Spec: "POWERSHELL_SYSTEM_ENV_KEYS is a named export")

---

## Phase 2: Core Implementation — Make Tests GREEN

- [ ] 2.1 In `src/core/runner/powershell-executor.ts`, add the exported allowlist constant directly above `spawnPowerShellProcess`:
  ```ts
  export const POWERSHELL_SYSTEM_ENV_KEYS = [
    "SystemRoot","windir","PATH","PATHEXT","TEMP","TMP",
    "USERPROFILE","USERNAME","COMPUTERNAME","LOCALAPPDATA",
    "APPDATA","HOMEDRIVE","HOMEPATH"
  ] as const;
  ```
  - Req: "POWERSHELL_SYSTEM_ENV_KEYS is a named export"

- [ ] 2.2 In the same file, add the internal `buildChildEnv()` helper (NOT exported):
  ```ts
  function buildChildEnv(override?: Record<string,string|undefined>): Record<string,string|undefined> {
    const base: Record<string,string|undefined> = {};
    for (const key of POWERSHELL_SYSTEM_ENV_KEYS) {
      if (process.env[key] !== undefined) base[key] = process.env[key];
    }
    return { ...base, ...override };
  }
  ```
  - Req: Design — "Filter semantics: copy key only if process.env[key] !== undefined"

- [ ] 2.3 Replace `env: { ...process.env, ...options.env }` at line ~33 with `env: buildChildEnv(options.env)`. No other lines change. No call sites touch.
  - Req: "Child Process Environment Isolation" — MUST NOT propagate full host `process.env`

---

## Phase 3: Verification

- [ ] 3.1 Run `vitest run test/core/runner/powershell-executor.test.ts` — all 4 tests must be GREEN.
  - Spec: "Host secret filtered", "Allowlisted var forwarded", "Caller override forwarded", "POWERSHELL_SYSTEM_ENV_KEYS named export"

- [ ] 3.2 Run full unit suite `vitest run` — zero regressions. Confirm `test/adapters/mcp/stdio.test.ts` still passes (its `expect(stdioSource).toContain("env: process.env")` asserts a different subsystem; we MUST NOT have touched it).
  - Constraint: Design — "DO NOT touch stdio.test.ts"

- [ ] 3.3 Confirm `access-runner.ts` and `vba-sync-legacy-adapter.ts` required zero changes (no call site touched).
  - Req: "Existing call sites MUST NOT require changes"

---

## Phase 4: Cleanup

- [ ] 4.1 Add `afterEach` teardown in the new test to delete `process.env.SECRET_TOKEN` and restore `process.env.SystemRoot` to its original value (prevent env pollution between tests).

- [ ] 4.2 Verify no `undefined` string literal values appear in `buildChildEnv` output (Spec: "absent var MUST NOT appear with value `undefined`"). Covered by test setup — confirm by assertion or code inspection.
