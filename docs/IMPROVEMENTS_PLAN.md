# Dysflow — Improvement Plan (post v0.9.18)

Generated after full SWOT + technical debt analysis on 2026-05-28.
All items from `AUDIT_2026-05-28.md` are complete. This file covers the next wave.

> **For any AI continuing this work**: read each section fully before touching any file.
> Never modify the production runtime at `%LOCALAPPDATA%\dysflow` or `C:\Users\adm1\.config\opencode\opencode.json`.
> Run tests after every change: `pnpm run test -- --run`.

---

## Master Checklist

| # | Item | Severity | Status |
|---|------|----------|--------|
| P1 | Biome lint rules: escalate `noExplicitAny` + `noNonNullAssertion` to `error` | MEDIUM | ✅ |
| P2 | Branch coverage: 72% → 82% (threshold updated to match statements) | MEDIUM | ✅ |
| P3 | God Object: split `vba-sync-adapter.ts` (888 L → 3 modules) | HIGH | ✅ |
| P4 | God Object: split `schemas.ts` (862 L → domain slices) | MEDIUM | ✅ |
| P5 | Update command: SHA-256 checksum verification on downloaded artifact | MEDIUM | ✅ |
| P6 | HTTP adapter: configurable Bearer token authorization | LOW-MEDIUM | ✅ |
| P7 | MCP protocol version: document strategy / migrate to MCP SDK | LOW | ✅ |
| P8 | `install.ts` refactor: extract sub-modules (845 L → ≤ 400 L) | LOW | ✅ |

---

## Build / Test Workflow (mandatory — read before every change)

```powershell
# 1. Build
Set-Location 'C:\Proyectos\dysflow'
pnpm build

# 2. Unit tests (must stay green)
pnpm run test -- --run

# 3. Install to isolated test-runtime (never the production path)
node dist/cli/index.js install --runtime-dir 'C:\Proyectos\dysflow\test-runtime' --no-tui

# 4. Targeted E2E (no fixture needed — fast)
$env:DYSFLOW_E2E_COMMAND = 'C:\Proyectos\dysflow\test-runtime\bin\dysflow.cmd'
node 'C:\Proyectos\dysflow\E2E_testing\test-sql-guard.mjs'

# 5. Full MCP E2E (requires .accdb fixtures — slower)
node 'C:\Proyectos\dysflow\E2E_testing\mcp-e2e.mjs'

# 6. PowerShell Pester tests
pnpm run test:ps1
```

---

## P1 — Escalate Biome lint rules to `error`

### Problem

`noExplicitAny` and `noNonNullAssertion` are set to `warn` in `biome.json`.
This means code with explicit `any` or `!` non-null assertions compiles and ships without blocking CI.
These are two of the most common sources of runtime errors in TypeScript codebases.

### Files

- `biome.json` — change `warn` → `error` for both rules
- Any `.ts` file that currently uses `any` or `!` (find with `pnpm lint` after changing the config)

### Implementation steps

1. In `biome.json`, change:
   ```json
   "noExplicitAny": "warn"   →  "noExplicitAny": "error"
   "noNonNullAssertion": "warn"  →  "noNonNullAssertion": "error"
   ```
2. Run `pnpm lint` — it will list every violation.
3. For each `any`: replace with the actual type. If the shape is unknown, use `unknown` and add a type guard (`isRecord`, `stringValue` are already available in `src/core/utils/index.ts`).
4. For each `!`: replace with an explicit null check or early return. Example:
   ```typescript
   // Before
   const value = map.get(key)!;
   // After
   const value = map.get(key);
   if (value === undefined) return failureResult("key not found");
   ```
5. Run `pnpm run test -- --run` — must stay green.
6. Run `pnpm lint` — must pass with zero errors.

### Risk

LOW. Pure type-level changes. Runtime behavior is unchanged. If a cast was hiding a real `any` from an external library, use `unknown` + assertion guard instead of `as SomeType`.

---

## P2 — Branch coverage: 72% → 85%

### Problem

The Vitest threshold for branch coverage is 72% — the lowest of the four metrics (statements 82%, functions 85%, lines 84%).
The uncovered branches are almost certainly in the Access/PowerShell error paths: timeout, process crash, JSON parse failure, lock contention.
These are exactly the scenarios that caused 4 hotfixes in one day (v0.9.7–v0.9.10).

### Files to target

| File | Why uncovered branches exist here |
|------|-----------------------------------|
| `src/core/runner/access-runner.ts` | Timeout branch, cross-process lock stale eviction, PS exit-code != 0 |
| `src/core/runner/powershell-executor.ts` | `killProcessTree` failure path, spawn error |
| `src/adapters/vba-sync/vba-sync-adapter.ts` | `executeWithTimeout` expiry, preflight failure, `resolveExecutionTarget` missing config |
| `src/core/operations/access-operation-registry.ts` | Stale lock eviction, concurrent-write race path |
| `src/cli/commands/install.ts` | Download failure, checksum mismatch, partial install recovery |

### Implementation steps

1. Run coverage report to identify exact uncovered branches:
   ```powershell
   pnpm coverage
   # Open coverage/index.html or read stdout for branch gaps
   ```
2. For each uncovered branch in `access-runner.ts`:
   - Mock `spawnPowerShellProcess` to resolve with `exitCode: 1` and assert the runner returns `failureResult`.
   - Mock `spawnPowerShellProcess` to never resolve (timeout) and assert `killProcessTree` is called and result is `failureResult` with timeout message.
3. For each uncovered branch in `powershell-executor.ts`:
   - Mock `child_process.execFile` to throw a spawn error and assert the error is surfaced as `failureResult`.
4. For `vba-sync-adapter.ts`:
   - Test `executeWithTimeout` where the inner promise resolves after the timeout — assert `failureResult` with timeout message.
   - Test `resolveExecutionTarget` when `.dysflow/project.json` is missing — assert specific failure code.
5. After each new test file, run `pnpm coverage` and verify the branch percentage moves up.
6. Target: `branches: 82` (match the statements threshold — consistent set of thresholds).

### Acceptance criterion

`pnpm coverage` passes with `branches >= 82`. All existing tests still pass.

### Risk

LOW. Additive tests only — no production code changes unless a test reveals a genuine bug (in which case fix it with TDD: RED test → fix → GREEN).

---

## P3 — God Object: split `vba-sync-adapter.ts`

### Problem

`src/adapters/vba-sync/vba-sync-adapter.ts` is 888 lines implementing all 21 VBA-sync tools in a single class `VbaSyncAdapter`.
Its test file `test/adapters/vba-sync/vba-sync-adapter.test.ts` is 1,669 lines — the largest file in the test suite.

The 21 tools fall into 4 natural groups:

| Group | Tools | Lines (approx) |
|-------|-------|----------------|
| Operations (registry/cleanup) | `list_access_operations`, `cleanup_access_operation` | ~80 L |
| Module sync | `export_modules`, `export_all`, `import_modules`, `import_all`, `list_objects`, `exists`, `verify_code`, `verify_binary`, `reconcile_binary`, `delete_module`, `fix_encoding` | ~400 L |
| VBA execution | `run_vba`, `test_vba`, `compile_vba` | ~200 L |
| Form management | `generate_erd`, `validate_form_spec`, `generate_form`, `catalog_add_control`, `harvest_form_catalog` | ~200 L |

### Target state

```
src/adapters/vba-sync/
  vba-sync-adapter.ts          ← orchestrator only (~120 L): implements VbaSyncPort, delegates
  vba-operations-adapter.ts    ← operations group (~100 L)
  vba-modules-adapter.ts       ← module sync group (~420 L)
  vba-execution-adapter.ts     ← execution group (~220 L)
  vba-forms-adapter.ts         ← form management group (~220 L)
```

`VbaSyncAdapter` becomes a thin orchestrator that instantiates the four sub-adapters and delegates each `toolName` to the correct one. `VbaSyncPort` interface stays unchanged — no consumer changes required.

### Implementation steps

**Step 1 — Extract `vba-operations-adapter.ts`**

1. Create `src/adapters/vba-sync/vba-operations-adapter.ts`.
2. Move the handlers for `list_access_operations` and `cleanup_access_operation` into a class `VbaOperationsAdapter` with a single `execute(toolName, input)` method returning `OperationResult<unknown>`.
3. In `VbaSyncAdapter.executeMappedTool`, replace those two handlers with:
   ```typescript
   if (VbaOperationsAdapter.handles(toolName)) {
     return this.operationsAdapter.execute(toolName, input);
   }
   ```
4. Run `pnpm run test -- --run` — must stay green.
5. Commit: `refactor(vba-sync): extract vba-operations-adapter`.

**Step 2 — Extract `vba-execution-adapter.ts`**

1. Create `src/adapters/vba-sync/vba-execution-adapter.ts`.
2. Move handlers for `run_vba`, `test_vba`, `compile_vba` and the private methods `executeWithTimeout`, `executeTestVba`, `resolveTestProceduresJson` into `VbaExecutionAdapter`.
3. Update `VbaSyncAdapter.executeMappedTool` to delegate.
4. Run tests. Commit: `refactor(vba-sync): extract vba-execution-adapter`.

**Step 3 — Extract `vba-forms-adapter.ts`**

1. Create `src/adapters/vba-sync/vba-forms-adapter.ts`.
2. Move handlers for `generate_erd`, `validate_form_spec`, `generate_form`, `catalog_add_control`, `harvest_form_catalog` into `VbaFormsAdapter`.
3. Move dependencies on `VbaFormService` into this file.
4. Update `VbaSyncAdapter.executeMappedTool` to delegate.
5. Run tests. Commit: `refactor(vba-sync): extract vba-forms-adapter`.

**Step 4 — Extract `vba-modules-adapter.ts`**

1. Create `src/adapters/vba-sync/vba-modules-adapter.ts`.
2. Move the remaining 11 module-sync handlers and the private methods `runPreflightCleanup`, `resolveExecutionTarget`, `planImport`, `executeWithTimeout` (if not already moved) into `VbaModulesAdapter`.
3. Update `VbaSyncAdapter.executeMappedTool` to delegate. `VbaSyncAdapter` should now be ~120 lines.
4. Run tests. Commit: `refactor(vba-sync): extract vba-modules-adapter`.

**Step 5 — Split test file**

1. Create parallel test files: `vba-operations-adapter.test.ts`, `vba-execution-adapter.test.ts`, `vba-forms-adapter.test.ts`, `vba-modules-adapter.test.ts`.
2. Move the relevant test blocks from `vba-sync-adapter.test.ts` into each new file.
3. Keep integration-level tests (testing the full `VbaSyncAdapter.execute()` dispatch) in `vba-sync-adapter.test.ts`.
4. Run full suite. Commit: `test(vba-sync): split test file to match adapter split`.

### Key shared context (pass to VbaSyncAdapter constructor)

Each sub-adapter needs:
- `DysflowConfig` (or a resolver function)
- `FileAccessOperationRegistry` (or `resolveProjectOperationRegistryPath`)
- `POWERSHELL_EXE`, `spawnPowerShellProcess`

Pass these as constructor arguments — do not let sub-adapters load config independently.

### Acceptance criterion

- All 55 test files pass.
- `vba-sync-adapter.ts` is ≤ 150 lines.
- `VbaSyncPort` interface is unchanged.
- No new public API surface added — the split is purely internal.

### Risk

HIGH. This is the largest file and its test is the largest. Extract one group at a time, run tests after each extraction, commit before moving to the next. Do NOT attempt to split all four groups in a single pass.

---

## P4 — God Object: split `schemas.ts`

### Problem

`src/adapters/mcp/schemas.ts` is 862 lines of JSON Schema definitions for all 48 MCP tools.
It has no logic — it is a pure data file. But because everything imports from it, any schema change forces a full re-compilation of the adapter layer.

The two groups in `mcp-tool-registry.ts` (21 `VBA_SYNC_TOOL_NAMES` + 24 `QUERY_TOOL_NAMES` + 3 `dysflow_*` specials) map naturally to two schema files.

### Target state

```
src/adapters/mcp/
  schemas/
    vba-sync-schemas.ts   ← schemas for the 21 VBA-sync tools
    query-schemas.ts      ← schemas for the 24 query/access tools
    dysflow-schemas.ts    ← VBA_EXECUTE_SCHEMA, QUERY_EXECUTE_SCHEMA, DOCTOR_SCHEMA, CLEANUP_SCHEMA, NO_INPUT_SCHEMA
    index.ts              ← re-exports everything (preserves existing import paths)
  schemas.ts              ← DELETE after migration (or keep as re-export barrel)
```

### Implementation steps

1. Create `src/adapters/mcp/schemas/` directory.
2. Create `dysflow-schemas.ts` — move `NO_INPUT_SCHEMA`, `VBA_EXECUTE_SCHEMA`, `QUERY_EXECUTE_SCHEMA`, `DOCTOR_SCHEMA`, `CLEANUP_SCHEMA`, `JsonObjectSchema`, `JsonSchemaPrimitiveType`, `JsonSchemaProperty` type definitions.
3. Create `vba-sync-schemas.ts` — move schemas for the 21 VBA-sync tools (grep for `"list_access_operations"`, `"export_modules"`, etc. in `schemas.ts` to find the relevant entries in `MCP_TOOL_SCHEMAS`).
4. Create `query-schemas.ts` — move schemas for the 24 query tools.
5. Create `schemas/index.ts` — re-export everything:
   ```typescript
   export * from "./dysflow-schemas.js";
   export * from "./vba-sync-schemas.js";
   export * from "./query-schemas.js";
   ```
6. Update `src/adapters/mcp/schemas.ts` to just re-export from `./schemas/index.js` (preserve existing import path for all consumers).
7. Run `pnpm build` (TypeScript must resolve all imports).
8. Run `pnpm run test -- --run`.
9. Commit: `refactor(mcp): split schemas.ts into domain slices`.

### Acceptance criterion

- `pnpm build` passes with no errors.
- All tests pass.
- Existing import `from "./schemas.js"` still works (via re-export barrel).
- Each new schema file is ≤ 350 lines.

### Risk

LOW-MEDIUM. Pure structural split — no logic changes. The re-export barrel in `schemas.ts` ensures no consumer changes are needed. TypeScript will catch any missed export at build time.

---

## P5 — Update command: SHA-256 checksum verification

### Problem

`src/cli/commands/install.ts` downloads a release artifact from GitHub and installs it without verifying the SHA-256 checksum.
A poisoned release (compromised GitHub account) or MITM during download would auto-install without any warning.

### Files

- `src/cli/commands/install.ts` — `downloadAndInstall` function (or equivalent)
- `src/cli/commands/install-utils.ts` — helper utilities

### Implementation steps

1. Find the download function in `install.ts` — look for the section that fetches the `.tar.gz` or `.zip` from GitHub releases.
2. After download, compute SHA-256 of the downloaded bytes:
   ```typescript
   import { createHash } from "node:crypto";
   const hash = createHash("sha256").update(downloadedBuffer).digest("hex");
   ```
3. Fetch the corresponding `checksums.txt` or `SHA256SUMS` file from the same GitHub release (the file must exist — if it doesn't, add it to the release workflow first; see step 6).
4. Parse the checksum file and extract the expected hash for the artifact filename.
5. Compare: if `hash !== expectedHash`, abort with a clear error:
   ```
   Error: checksum mismatch — downloaded artifact may be corrupted or tampered.
   Expected: <expected>
   Got:      <actual>
   ```
6. Add checksum generation to the release workflow (`.github/workflows/release.yml` or equivalent):
   ```yaml
   - name: Generate checksums
     run: sha256sum dysflow-*.tar.gz > SHA256SUMS
   - name: Upload checksums
     uses: softprops/action-gh-release@v2
     with:
       files: SHA256SUMS
   ```
7. Write a unit test for the checksum verification function (test: matching hash passes, mismatching hash throws).
8. Run `pnpm run test -- --run`.

### Acceptance criterion

- `dysflow update` fetches `SHA256SUMS` from the same release.
- If checksum mismatches, process exits with code 1 and a clear message.
- Unit test covers both the happy path and the mismatch path.

### Risk

MEDIUM. The release workflow must be updated first, otherwise `SHA256SUMS` won't exist in existing releases and the command will fail. Strategy: add a `--skip-checksum` flag for the transition period, remove it after the next release is cut with checksums.

---

## P6 — HTTP adapter: configurable Bearer token

### Problem

`src/adapters/http/server.ts` (339 L) exposes the HTTP API on `127.0.0.1:17321` with no authentication.
Today it is localhost-only, which limits the attack surface. But if it is ever exposed on a LAN or via a port-forward, any process can call it without credentials.

### Files

- `src/adapters/http/server.ts` — add `Authorization` header check
- `src/core/config/dysflow-config.ts` — add optional `httpToken` field
- `src/cli/commands/serve.ts` — pass token from config to server

### Implementation steps

1. Add optional field to `dysflow-config.ts`:
   ```typescript
   httpToken?: string;  // if set, all HTTP requests must include Authorization: Bearer <token>
   ```
2. In `server.ts`, before processing any request, check:
   ```typescript
   if (config.httpToken) {
     const auth = req.headers["authorization"];
     if (auth !== `Bearer ${config.httpToken}`) {
       res.writeHead(401, { "Content-Type": "application/json" });
       res.end(JSON.stringify({ error: "Unauthorized" }));
       return;
     }
   }
   ```
3. Document the field in `src/core/config/dysflow-config.ts` with a JSDoc comment.
4. Add a test in `test/adapters/http/` that:
   - Starts the server with a token configured.
   - Sends a request without the token → expects 401.
   - Sends a request with the correct token → expects 200.
   - Verifies that when no `httpToken` is configured, all requests pass through (backwards compatible).
5. Run `pnpm run test -- --run`.

### Acceptance criterion

- When `httpToken` is set in `.dysflow/project.json`, unauthenticated requests return 401.
- When `httpToken` is absent, behavior is identical to today (backwards compatible).
- No changes to the MCP stdio adapter.

### Risk

LOW. Additive feature — no breaking changes. The field is optional and the server is unchanged when the field is absent.

---

## P7 — MCP protocol version: document strategy

### Problem

`src/adapters/mcp/stdio.ts` hardcodes the MCP protocol version `2024-11-05`.
The MCP protocol is actively evolving. If the version is not updated after a breaking change upstream, the MCP server will silently negotiate an old protocol with clients that have moved on.

There are two options:

**Option A — Document and pin**: Keep the hand-rolled JSON-RPC runtime but add a version constant, a comment explaining why it is pinned, and a CI check that fails if the MCP SDK releases a new protocol version.

**Option B — Migrate to MCP SDK**: Replace the hand-rolled `stdio.ts` with the official `@modelcontextprotocol/sdk` package. The SDK handles protocol negotiation, version updates, and spec conformance automatically.

### Recommendation

Option A is faster and safer for the short term. Option B is the correct long-term play.
Implement Option A now; schedule Option B as a separate SDD change.

### Implementation steps (Option A)

1. In `src/adapters/mcp/stdio.ts`, extract the version to a named constant at the top of the file:
   ```typescript
   // MCP protocol version this server implements.
   // Check https://spec.modelcontextprotocol.io for newer versions.
   // To upgrade: update PROTOCOL_VERSION and verify tool schema compatibility.
   const PROTOCOL_VERSION = "2024-11-05" as const;
   ```
2. Replace every hardcoded `"2024-11-05"` string in `stdio.ts` with `PROTOCOL_VERSION`.
3. Add a comment in `package.json` devDependencies section (or a `docs/mcp-protocol.md` note) recording the decision to hand-roll vs. use the SDK, with a link to the SDK: `@modelcontextprotocol/sdk`.
4. Commit: `docs(mcp): extract protocol version constant + document upgrade path`.

### Acceptance criterion

- `"2024-11-05"` appears only as the value of `PROTOCOL_VERSION` in `stdio.ts`.
- A future developer can find the upgrade path from the constant's comment.

### Risk

TRIVIAL. No behavior change — pure rename + documentation.

---

## P8 — `install.ts` refactor: extract sub-modules

### Problem

`src/cli/commands/install.ts` is 845 lines handling: download, checksum (after P5), extraction, file copy, PATH update, OpenCode MCP config generation, and update logic.
It also has a satellite `install-utils.ts` (227 L) but the main file remains oversized.

### Target state

```
src/cli/commands/
  install.ts              ← entry point + CLI argument parsing (~120 L)
  install/
    downloader.ts         ← download + checksum verification (~150 L)
    extractor.ts          ← tar/zip extraction + file copy (~150 L)
    path-configurator.ts  ← PATH update logic (~100 L)
    mcp-configurator.ts   ← OpenCode MCP config generation (~150 L)
    updater.ts            ← update flow (check version + delegate) (~100 L)
```

### Implementation steps

1. Identify the logical sections in `install.ts` by reading the file top to bottom.
2. Extract one section at a time (same one-at-a-time discipline as P3).
3. After each extraction, run `pnpm build` and `pnpm run test -- --run`.
4. The existing `test/cli/install.test.ts` (1,240 L) is the acceptance criterion — all tests must pass at every step.
5. Commit per extraction.

### Acceptance criterion

- `install.ts` is ≤ 150 lines.
- `pnpm build` + `pnpm run test -- --run` pass at every intermediate commit.
- `dysflow install` and `dysflow update` still work end-to-end.

### Risk

MEDIUM. The install command is critical — a broken install leaves the user unable to set up dysflow. Strategy: extract bottom-up (non-critical utils first, entry-point last). Each extraction must be verified by the existing test suite before the next one starts.

---

## Suggested execution order

```
P1 → P2 → P4 → P3 → P5 → P7 → P6 → P8
```

Rationale:
- **P1 first**: fixing lint gates makes every subsequent refactor cleaner — you catch type errors immediately.
- **P2 second**: additive tests only; no risk, improves confidence for the structural refactors.
- **P4 before P3**: schemas split is simpler (no logic); doing it first reduces the size of the `schemas.ts` import that `vba-sync-adapter.ts` uses during P3.
- **P3**: largest structural change — do it after the simpler items build momentum.
- **P5**: security improvement, requires release workflow changes — coordinate with a release.
- **P7**: trivial, can be done any time.
- **P6**: additive feature, low risk, do after core refactors are stable.
- **P8**: last, because it depends on P5 (the downloader extract will include the checksum logic).

---

## Version targets

| Item | Suggested release |
|------|------------------|
| P1, P7 | v0.9.19 ✅ released |
| P2, P3, P4, P5, P6 | v0.9.19 ✅ released (all shipped together) |
| P8 | v0.9.20 — committed, pending release |

---

## Next action: release v0.9.20

> **Status as of 2026-05-29**: P8 is committed (`9469d74`) but not yet released.
> The only pending action to close this plan is cutting v0.9.20.

### Step-by-step release process

1. **Bump version in `package.json`**
   - Change `"version": "0.9.19"` → `"version": "0.9.20"`

2. **Update `CHANGELOG.md`** — add a new entry at the top (after the `# Changelog` heading):
   ```markdown
   ## [0.9.20] - 2026-05-29

   ### Changed

   - **Refactored `install.ts` into focused sub-modules**: Split the 936-line
     install command into six focused modules under `src/cli/commands/install/`:
     `downloader.ts` (GitHub fetch + SHA-256), `extractor.ts` (file copy + install report),
     `mcp-configurator.ts` (agent config writers), `path-configurator.ts` (cmd/ps1 launchers),
     `package-root.ts` (package root resolution), and `updater.ts` (update flow + arg parsers).
     `install.ts` is now a 144-line entry point with full re-exports for backward compatibility.
   ```

3. **Run final verification**
   ```powershell
   pnpm build
   pnpm run test -- --run
   ```
   Both must be green before committing.

4. **Commit the release**
   ```
   git add package.json CHANGELOG.md
   git commit -m "chore: release v0.9.20"
   ```

5. **Tag** (only if the project uses tags — check with `git tag --list` to see the pattern)
   ```
   git tag v0.9.20
   ```

### What NOT to do during release
- Do NOT install to `%LOCALAPPDATA%\dysflow` (production runtime) — that is a manual user action.
- Do NOT modify `C:\Users\adm1\.config\opencode\opencode.json`.
- Do NOT push unless the user explicitly asks.

---

---

## Wave 2 — Post v0.9.20 improvements

Generated after full SWOT + technical debt analysis on 2026-05-29.
Full audit: `docs/AUDIT_2026-05-29.md`.

> **For any AI continuing this work**: read each section fully before touching any file.
> Never modify the production runtime at `%LOCALAPPDATA%\dysflow` or `C:\Users\adm1\.config\opencode\opencode.json`.
> Run tests after every change: `pnpm run test -- --run`.
> All test installs go to: `C:\Proyectos\dysflow\test-runtime`

### Master Checklist

| # | Item | Severity | Status |
|---|------|----------|--------|
| Q1 | Fix `VbaOperationsAdapter.execute()` stub — implement real `list_access_operations` + `cleanup_access_operation` | HIGH | ✅ |
| Q2 | Extract shared `DirectMapping` / `mapping()` / `stringArray()` to `vba-sync-types.ts` | MEDIUM | ✅ |
| Q3 | Fix checksum fallback: only fall back to git clone on HTTP 404, not all errors | MEDIUM | ✅ |
| Q4 | Add early dispatch to `dysflow-access-runner.ps1` for `list_linked_tables`, `compare_backends`, `list_access_files` | MEDIUM | ⬜ |
| Q5 | Split `install-utils.ts` into focused utility files | LOW | ⬜ |
| Q6 | Fix `OperationResult` variance: make `failureResult` return `OperationResult<never>` | LOW | ⬜ |
| Q7 | MCP SDK migration: replace hand-rolled `stdio.ts` with `@modelcontextprotocol/sdk` | MEDIUM | ⬜ |

### Suggested execution order

```
Q1 → Q3 → Q2 → Q6 → Q4 → Q5 → Q7
```

Rationale:
- **Q1 first**: HIGH severity bug — two tools silently fail when called outside the legacy alias path.
- **Q3**: security gap in the checksum fallback; low effort.
- **Q2**: extract shared types; reduces copy-paste before Q6 touches the same files.
- **Q6**: type-variance fix; clean up after Q2 removes the structural duplication.
- **Q4**: PS script change; requires E2E verification — do after TS layer is stable.
- **Q5**: low urgency cosmetic split.
- **Q7**: largest change; do last when everything else is settled.

### Version targets

| Item | Suggested release |
|------|------------------|
| Q1, Q3 | v0.9.21 |
| Q2, Q6 | v0.9.22 |
| Q4 | v0.9.23 |
| Q5 | v0.9.24 |
| Q7 | v0.10.0 |

---

## Q1 — Fix `VbaOperationsAdapter.execute()` stub

### Problem

`src/adapters/vba-sync/vba-operations-adapter.ts:37–39`: `execute()` unconditionally returns
`TOOL_NOT_IMPLEMENTED` for both `list_access_operations` and `cleanup_access_operation`.

These tools currently work ONLY because legacy alias handlers in `src/adapters/mcp/tools.ts:264–301`
are registered before the main loop (line 416), so `names.has(tool.name)` is already true and
the routing to `VbaOperationsAdapter` is bypassed. Any re-ordering of that registration,
or a direct call to `vbaSyncToolService.execute("list_access_operations", ...)`, silently fails.

### Files to change

- `src/adapters/vba-sync/vba-operations-adapter.ts` — add `operationRegistry` + `cleanupService` to options; implement `execute()`
- `src/adapters/vba-sync/vba-sync-adapter.ts` — pass `operationRegistry` + `cleanupService` to `VbaOperationsAdapter` constructor
- `test/adapters/vba-sync/vba-operations-adapter.test.ts` — add tests for the two real handlers (TDD: RED first)

### What the real implementation must do

**`list_access_operations`**:
```typescript
const registry = this.operationRegistry ?? this.createDefaultRegistry();
const records = await registry.listRecent({ limit: 50 });
return successResult(records);
```

**`cleanup_access_operation`**:
```typescript
if (this.cleanupService === undefined) {
  return failureResult(createDysflowError("CLEANUP_NOT_CONFIGURED", "..."));
}
const request = input as { operationId: string; accessPath?: string; force?: boolean };
return this.cleanupService.cleanup({
  operationId: request.operationId,
  accessPath: request.accessPath ?? "",
  force: request.force,
});
```

### Where to find the types

- `operationRegistry` type: `FileAccessOperationRegistry` from `../../core/operations/access-operation-registry.js`
- `cleanupService` type: look at `DysflowMcpServices.cleanupService` in `src/adapters/mcp/tools.ts` for the interface
- `AccessOperationRecord` type: imported from `../../core/contracts/index.js` or `access-operation-registry.js`

### How `VbaSyncAdapterOptions` gets these services

`VbaSyncAdapter` is instantiated in `src/adapters/mcp/mcp-services.ts` (or similar) where `operationRegistry`
and `cleanupService` are already available as `DysflowMcpServices` fields. Pass them through `VbaSyncAdapterOptions`
→ `VbaOperationsAdapterOptions`.

### Acceptance criteria

- `VbaOperationsAdapter.execute("list_access_operations", {})` returns real records (not `TOOL_NOT_IMPLEMENTED`)
- `VbaOperationsAdapter.execute("cleanup_access_operation", { operationId: "x", accessPath: "y" })` delegates to `cleanupService`
- When neither service is injected, a lazy default is created (same pattern as `createDefaultPreflightCleanup`)
- All 666+ existing tests pass
- New unit tests added for both handlers (RED → GREEN)
