# Changelog

All notable changes to Dysflow will be documented in this file.

## [v1.2.9] - 2026-06-01

### Fixed

- **MSACCESS.EXE zombies, `RUNNER_TIMEOUT`/RPC failures, and uncleanable stale operations under WMI hang.** When Access COM operations left a hung MSACCESS.EXE (observed in CONDOR staging), the recovery paths themselves could hang because WMI/CIM enumeration — the very thing that stalls under a zombie/network-I/O condition — sat on the cleanup path. Symptoms: `RUNNER_TIMEOUT` after `test_vba`/`doctor`, `RUNNER_FAILED` with RPC unavailable `0x800706BA`, cleanup refused with `CLEANUP_PROCESS_START_TIME_MISMATCH`, and `timed_out` records with `accessPid:null`/`processStartTime:null` that could never be retired because `Get-CimInstance Win32_Process` timed out. Hardened across the runtime: (A) `windows-processes.ts` now runs every CIM query inside a bounded PowerShell `Start-Job`/`Wait-Job -Timeout` and falls back to `Get-Process -Name MSACCESS`, returning partial process info instead of hanging — the scanner only reports, it never kills by name. (B) both `dysflow-access-runner.ps1` and `dysflow-vba-manager.ps1` route every Access-PID lookup/fallback through a reusable bounded-WMI helper (no bare `Get-CimInstance Win32_Process` left on a cleanup path); `hWndAccessApp` → `GetWindowThreadProcessId` stays the primary PID capture and the `DYSFLOW_ACCESS_PROCESS` marker is now emitted from that primary path (no WMI on the success path) so the registry records the exact PID as early as possible. (C) `powershell-executor.ts` no longer fire-and-forgets `taskkill` on timeout/abort — it awaits the kill (bounded so a stuck `taskkill` cannot hang the executor). (D) `cleanup(force:true)` now retires a `timed_out` null-PID record even when the process scanner fails, emitting a "registry retired only; process ownership unknown" diagnostic, while still never killing a process it does not own and still refusing to kill on a genuine owned-PID start-time mismatch. (E) the start-time guard that produced false `CLEANUP_PROCESS_START_TIME_MISMATCH` (the PowerShell side wrote 7 fractional digits via `.ToString('o')` while the inspector emitted 3, and the two capture sources — WMI `CreationDate` vs `Get-Process.StartTime` — can differ at sub-second precision for the same process) is replaced by a tolerant whole-second comparison (`sameProcessStartTime`), with the PowerShell scripts normalized to millisecond ISO and the `Get-Process` fallback corrected to emit UTC. No new dependencies; registry JSON shape and PowerShell 5.1 compatibility preserved. Closes #376.

## [v1.2.8] - 2026-06-01

### Changed

- **Testing base hardened to a port-level criterion (internal; no product/runtime change vs v1.2.7).** Established the repository testing criterion — refactor-safety as the north star, test at the ports (real domain logic, mock only I/O adapters), coverage as a regression floor rather than a target — and anchored it in `docs/testing/testing-philosophy.md`, a new root `AGENTS.md` (canonical agent guide, imported by `CLAUDE.md` so it applies to every agent), and a cross-reference from `docs/testing/repo-quality-gates.md`. Removed the implementation-coupled assertions surfaced by an audit (tui install seam injection instead of module `vi.mock`; assert on outputs instead of `vi.spyOn`/`toHaveBeenCalledWith` on internal collaborators in the vba-sync adapters and powershell executor). Encapsulated the leaked `VbaSyncAdapter.formService` getter and `VbaFormsAdapter.formService` field (no production caller depended on them). Branch coverage raised 78.28% → 82.08% locally (81.15% on Linux CI, +86 branches) with port-level tests only; the enforced branch threshold floor was raised 77 → 80 (CI on Linux is the authoritative gate). Widened the vitest `testTimeout` to 15s to remove load-induced timeout flakes in the access-runner concurrency/lock tests. Closes #372, #373, #374, #375.

## [v1.2.7] - 2026-05-31

### Fixed

- **CI E2E gate restored to green (test drift).** `test/scripts-access-runner.test.ts` asserted on a literal PowerShell source string (`$rs = $readDb.Database.OpenRecordset(...)`) that no longer existed after the read path was refactored into the `Invoke-QuerySqlReadAction` / `Resolve-ReadActionDatabase` helpers. The assertion was re-pointed to the current code (verified present in the script). No product/runtime change vs v1.2.6. Verified green: integration vitest (`scripts-access-runner` + `access-relink-directory*` = 16 tests), Pester (98 passed / 0 failed / 4 COM-skips), and the MCP E2E (104/104, 0 zombies). Note: `test/e2e/access-fixture.e2e.test.ts` skips in CI (its `*.accdb` fixtures are gitignored); it only runs where real fixtures are present and currently expects sanitized fixtures (hardcoded backend password) rather than the password-protected production copies.

## [v1.2.6] - 2026-05-31

### Fixed

- **MSACCESS.EXE zombies leaked by every Access.Application operation (migration regression).** Operations that open the Access COM Application — link_tables, relink_tables, localize_backend_links, relink_directory, create_table, export_modules/export_all, compile_vba, test_vba, verify_code, delete_module, fix_encoding, harvest_form_catalog, run_vba — left a lingering MSACCESS.EXE process. Under a heavy run (e.g. a VBA test battery) these accumulated, locked the database, and caused subsequent `compile_vba`/`import` to hang. Root cause: the migrated PowerShell scripts had lost the deterministic process-ID capture the pre-migration skill used. `dysflow-access-runner.ps1` had no `hWndAccessApp` capture at all; `dysflow-vba-manager.ps1` captured it but then overwrote it unconditionally with an ambiguous process-diff that failed when multiple instances existed (emitting "se detectaron varias instancias … no se pudo identificar"). Restored the deterministic capture in both scripts: immediately after creating `Access.Application`, the exact owning PID is read via `$access.hWndAccessApp` → Win32 `GetWindowThreadProcessId`; the process-diff/command-line heuristic is now only a last-resort fallback. Validated by the real MCP E2E against the live runtime: **104/104 pass, 0 zombie-check failures** (was 88/104 with 16 zombie failures).

## [v1.2.5] - 2026-05-31

### Added

- **`dysflow doctor` now flags project-local OpenCode MCP config drift.** Beyond detecting a dysflow MCP `command` that points at a non-existent entrypoint (v1.2.3), doctor now warns when a project-local `opencode.json` redefines the dysflow MCP `command` and it is out of alignment with the global OpenCode config — the authoritative source of how the MCP should be invoked. The warning names both config files and shows the global (expected) vs local (found) command, so a stale per-repo override that would silently break the MCP in that repo becomes visible. Per-repo config should carry at most project-specific `env`, never redefine the command. Read-only; doctor never modifies config.

## [v1.2.4] - 2026-05-31

### Fixed

- **Stale "running" operations with a dead PID could never be cleaned and blocked new operations.** `dysflow_access_cleanup` returned `CLEANUP_PROCESS_NOT_FOUND` (even with `force: true`) when the recorded Access PID no longer existed, and pre-flight cleanup skipped `running` records entirely (`running` was not in its eligible set). A registry entry left `running` after a manually-killed or crashed Access process — common after a heavy VBA test battery — therefore stuck forever and blocked subsequent `compile_vba` / `test_vba`. Now, when the recorded PID is verifiably gone, gated cleanup retires the entry as `cleaned` (there is nothing to kill), and pre-flight reconciles dead-PID `running` entries — while never terminating a genuinely-live matching Access process (alive + `MSACCESS.EXE` + matching start time is left untouched).

## [v1.2.3] - 2026-05-31

### Fixed

- **Version string stuck at 1.1.0**: `package.json` was never bumped past 1.1.0 despite the v1.2.0–v1.2.2 releases, so `dysflow update` version comparison and the MCP `serverInfo.version` reported a stale 1.1.0 even when the v1.2.2 code (including the MSACCESS zombie-cleanup fix) was installed. Bumped to 1.2.3 so update detection and diagnostics report the real version.
- **CRLF formatting errors**: `src/cli/commands/install/extractor.ts` and `test/core/runner/access-runner.test.ts` had CRLF line endings that failed `biome check`. Reformatted to restore a green lint gate.

### Added

- **`dysflow doctor` OpenCode MCP wiring check**: doctor now detects when the resolved OpenCode `dysflow` MCP `command` points to an entrypoint that does not exist (for example a stale project-local `opencode.json` override left by a previous architecture) and warns with the offending path and which config file it came from — turning a silent "MCP won't connect" failure into an actionable diagnostic. Checks both the global and project-local OpenCode config; project-local wins, mirroring OpenCode's merge order.

## [v1.2.2] - 2026-05-30

### Fixed

- **`dysflow update` / `dysflow install` crashed on npm 11.7.0**: Replaced `npm install` with `pnpm install --prod --ignore-scripts` for runtime dependency installation. npm 11.7.0 crashes with `--omit=dev` and `--legacy-peer-deps` due to a null-pointer in the peer-dependency resolver.

- **`dysflow update` hung with no timeout**: All network operations (`fetch` to GitHub API, SHA256SUMS download) and subprocess calls (`gh`, `git clone`, `pnpm install`, `pnpm build`, `tar`, `npm install`) now have explicit timeouts. Operations that exceed 30-120s now fail with a clear error instead of hanging indefinitely.

- **`dysflow update` crashed on npm 11.7.0**: `npm install --omit=dev` triggered a null-pointer crash in npm's peer-dependency resolver (`Cannot read properties of null (reading 'matches')`). Replaced with `--ignore-scripts --legacy-peer-deps` which avoids the problematic code path.

- **Lingering `MSACCESS.EXE` processes after dysflow operations**: Operations that use COM automation (`Access.Application`) were leaving orphaned Access processes running after script completion, causing database lockups and resource leaks. Root causes addressed:

  - **COM cleanup ordering**: Secondary DAO objects (`$db`, `$directDb`) are now released with `FinalReleaseComObject` before the primary `$access` application object.
  - **Deterministic process termination**: The `finally` block in `dysflow-access-runner.ps1` now waits up to 20 seconds (polling every 100ms) for the Access process to actually exit, instead of relying on fixed sleep durations.
  - **Targeted fallback kill**: If `Stop-Process` does not terminate the process within the wait window, `taskkill /F /PID` is invoked as a last resort — targeting only the PID that dysflow itself launched, never affecting other Access instances.
  - **PID capture reliability**: Added a targeted fallback that resolves the process PID by matching the database path in the process command line (covers cases where WMI/CIM timing race causes the initial capture to miss the PID, or where `New-Object Access.Application` reuses an existing COM singleton).
  - **VBA manager parity**: `dysflow-vba-manager.ps1` now has the same deterministic wait-and-fallback kill logic in `Close-AccessDatabase` (`Stop-AccessPidAndWait` with 20s timeout, `taskkill` fallback on failure).

- **`$accessPid` was `$null` after COM reuse**: When `New-Object Access.Application` returns an existing Access process (COM singleton reuse), the pre/post WMI process diff shows 0 new processes, leaving `$script:accessPid` as `$null` and causing the `finally` block to skip termination entirely. Fixed by re-resolving the PID by database path in command line at cleanup time.

- **E2E zombie verification was insufficient**: The E2E suite (`mcp-e2e.mjs`) only checked for zombies after the full test run, making it impossible to identify which specific operation leaked. Added per-call zombie checks with a 30-second wait that poll for process exit after each MCP tool invocation. Pre-existing Access processes are excluded via baseline PID snapshot at suite start.

### Added

- **`test/core/runner/access-runner.test.ts`**: 24 unit/integration tests covering PID capture, `finally` block execution guarantees, lock acquisition, and real Access process lifecycle cleanup.
- **`E2E_testing/mcp-e2e.mjs`**: Per-call zombie check after every MCP tool invocation (`<tool>:zombie-check` entries in the test report), with `waitForNoZombies()` polling and baseline PID filtering.

### Changed

- **`scripts/dysflow-access-runner.ps1`**: Refactored kill logic in `finally` block to use a `$pidToKill` variable with command-line fallback resolution, deterministic polling wait (up to 20s), and `taskkill` escalation. Removed early `exit` calls in favor of `$script:exitCode; return` so the `finally` block always runs.
- **`scripts/dysflow-vba-manager.ps1`**: Added `Find-AccessPidByDatabase` and `Stop-AccessPidAndWait` helper functions. `Close-AccessDatabase` now re-resolves PID by database path if not captured at open time, waits up to 20s for termination, and escalates to `taskkill` if the process survives.

## [1.1.0] - 2026-05-30

### Fixed

- **MCP `compare_backends` tool failure**: Resolved a critical RCW COM exception (`InvalidComObjectException`) that occurred because the helper script closed the shared `DAO.DBEngine` instance singleton, separating the active database RCW wrapper from its COM peer. Also added a fallback in `dysflow-access-runner.ps1` to resolve the target database to `$AccessDbPath` when inputs do not specify it, allowing the early dispatch path to correctly locate the frontend and backend without duplicating connections.

### Changed

- **Complete MCP SDK migration**: Removed the legacy, hand-rolled `JsonLineMcpStdioRuntime` implementation, `McpStdioRuntime` interface, and associated type signatures from `stdio.ts` (shrinking it to 317 lines).
- **Test cleanup**: Deleted deprecated `progress.test.ts` and pruned `stdio.test.ts` to keep only the isolated auxiliary and service configuration validation suites.
- **Lint auto-fix tooling**: Added `lint:fix` script in `package.json` and auto-corrected 24 formatting, import block organization, and template literal occurrences via Biome.

## [1.0.2] - 2026-05-29

### Fixed

- **Runtime install: `npm install --prefer-offline` caused `ETARGET` error**: The `--prefer-offline` flag made npm try to resolve the full lockfile including dev dependencies, failing on `@vitest/utils@4.1.7` which is not published separately. Removed the flag — npm now resolves production dependencies fresh from the registry.

## [1.0.1] - 2026-05-29

### Fixed

- **Runtime install: missing production dependencies**: `dysflow install` and `dysflow update` only copied `dist/` and `package.json` to the runtime directory but never ran `npm install`. With v1.0.0 introducing `@modelcontextprotocol/sdk` as the first true runtime dependency, the MCP server crashed with `ERR_MODULE_NOT_FOUND` on startup. The installer now runs `npm install --omit=dev --ignore-scripts` in the runtime app directory after copying `package.json`, ensuring all production dependencies are available. `--ignore-scripts` prevents the `prepare`/`prepack` build hooks from running in the production environment.

## [1.0.0] - 2026-05-29

### Changed

- **MCP SDK migration**: Replaced the hand-rolled JSON-RPC 2.0 stdio adapter (`stdio.ts`, ~320 lines)
  with `@modelcontextprotocol/sdk` v1.29.0. All protocol mechanics (framing, routing, spec
  compliance) are now handled by the SDK. Custom behaviors (exception absorption into
  `isError: true`, path sanitization in error text, hidden tools, 1 MiB size guard, progress
  notifications) are preserved via focused wrapper modules.
- **New modules**: `stdio-wrappers.ts` (errorAbsorber, sanitizer, hiddenToolRegistry),
  `stdio-size-guard.ts` (SizeLimitTransform).
- **Test harness**: migrated from `PassThrough` stream injection to `InMemoryTransport` client/server
  pairs for SDK-layer tests.
- **`SizeLimitTransform` newline fix**: the size guard was stripping the trailing `\n` before pushing lines downstream. The SDK transport uses newline delimiters to frame messages, so stripping caused it to buffer silently and never process requests. Lines are now forwarded with `\n` restored.
- No breaking changes to tool interfaces, `project.json` schema, or CLI.

## [0.10.0] - 2026-05-29

### Security

- **Closed `allowedProcedures` enforcement bypass**: The MCP `run_vba` alias and the HTTP `POST /vba/execute` route were bypassing the `allowedProcedures` allowlist entirely. Both entry points now apply the same guard as `dysflow_vba_execute`: a procedure not in the configured allowlist is rejected before any COM automation is started. HTTP returns `403 HTTP_PROCEDURE_NOT_ALLOWED`. Four new MCP tests and three new HTTP tests cover blocked, allowed, empty, and unconfigured scenarios.

- **Fixed checksum fallback scope**: `dysflow update` was falling back to git clone on any error during artifact download (including HTTP 500, 403, and checksum mismatches). The fallback now only triggers on HTTP 404. All other errors throw immediately, preventing silent installs of potentially corrupted artifacts.

### Fixed

- **`VbaOperationsAdapter.execute()` was a stub**: `list_access_operations` and `cleanup_access_operation` returned `TOOL_NOT_IMPLEMENTED` when routed through the adapter directly. Tools only worked because legacy alias handlers intercepted them first. Real logic now delegates to `operationRegistry` and `cleanupService` respectively.

### Changed

- **`failureResult` returns `OperationResult<never>`**: Changed from the generic `OperationResult<T>` to `OperationResult<never>`, eliminating three `as unknown as` double-casts in `vba-source-comparison.ts`. The `ok: false` branch never uses `T`, so `never` is the structurally correct type.

- **Extracted shared VBA sync types**: `DirectMapping` (type), `mapping()` (factory), and `stringArray()` (helper) were copy-pasted verbatim across four adapter files. Moved to `src/adapters/vba-sync/vba-sync-types.ts` and removed all duplicates.

- **Early dispatch in `dysflow-access-runner.ps1`**: `list_linked_tables`, `compare_backends`, and `list_access_files` now use direct DAO dispatch and no longer force `MSACCESS.Application` to open for read-only metadata operations.

### Documentation

- **`docs/api/http-api.md`**: Added Authentication section documenting Bearer token (`httpToken`), `401 HTTP_UNAUTHORIZED` response, and the new `403 HTTP_PROCEDURE_NOT_ALLOWED` on `/vba/execute`. Updated PowerShell and Node.js script examples to include the `Authorization` header.
- **README**: Updated version, test count (682), Safety model section for `allowedProcedures`, HTTP section for Bearer auth and `allowedProcedures`, and `project.json` example with both new fields.

## [0.9.20] - 2026-05-29

### Changed

- **Refactored `install.ts` into focused sub-modules**: Split the 936-line install command into six focused modules under `src/cli/commands/install/`: `downloader.ts` (GitHub fetch + SHA-256), `extractor.ts` (file copy + install report), `mcp-configurator.ts` (agent config writers), `path-configurator.ts` (cmd/ps1 launchers), `package-root.ts` (package root resolution), and `updater.ts` (update flow + arg parsers). `install.ts` is now a 144-line entry point with full re-exports for backward compatibility.

## [0.9.19] - 2026-05-28

### Added

- **Configurable Bearer token authorization in the HTTP adapter**: Added optional `httpToken` (and `httpTokenEnv` for custom env resolution) to project config. When configured, HTTP requests are validated using the `Authorization: Bearer <token>` header, returning a structured 401 `HTTP_UNAUTHORIZED` error envelope on invalid/missing tokens. `/health` route remains public. Exposes the `--token <token>` option in `dysflow serve`.
- **SHA-256 verification on update**: The `dysflow update` command now downloads and validates the release artifact against `SHA256SUMS` to prevent MITM/poisoned package injection.
- **MCP protocol version documentation**: Extracted the hardcoded MCP version to `PROTOCOL_VERSION` constant and documented the future MCP SDK migration path.

### Changed

- **Refactored `vba-sync-adapter.ts`**: Split the large God Object (888 lines) into smaller, domain-scoped sub-adapters: operations, modules, execution, and forms sub-adapters. Decoupled sub-adapters from config loading by passing configuration properties at instantiation.
- **Refactored `schemas.ts`**: Split the large schema repository (862 lines) into domain schema files (`vba-sync-schemas.ts`, `query-schemas.ts`, `dysflow-schemas.ts`, and a barrel index) to reduce recompilation times.
- **Biome lint rule escalation**: Escalated rules `noExplicitAny` and `noNonNullAssertion` from warning to error level. Refactored all codebase violations to use explicit types/runtime guards.
- **Vitest branch coverage**: Raised minimum branch coverage threshold from 72% to 82% and expanded unit/integration tests to cover PowerShell timeout, timeout aborts, and download failure recovery paths.

## [0.9.18] - 2026-05-28

### Changed

- **All 48 MCP tools are now first-class API.** The internal "legacy compatibility tier" distinction is gone. Tools like `query_sql`, `list_tables`, `export_modules`, `link_tables`, and the other named Access/VBA tools are official API alongside `dysflow_*` — not a compatibility surface.
- Renamed internal adapter files and symbols to reflect this: `legacy-tool-inventory.ts` → `mcp-tool-registry.ts`, `legacy-parity-registry.ts` → `tool-parity-registry.ts`, `vba-sync-legacy-adapter.ts` → `vba-sync-adapter.ts`. No behaviour change.
- Deleted `vba-sync-legacy-service.ts` — a re-export shim that had been dead (zero imports) since the service layer was restructured.

### Repository

- Moved one-off dev scripts to `scripts/dev/` and removed them from the root. Root now contains only project-level files.
- Moved audit document to `docs/`. Gitignored local AI tool state directories (`.engram/`, `.dysflow/runtime/`, `.antigravitycli/`).
- Updated all documentation (README, architecture doc, E2E guide, OpenSpec specs) to remove outdated compatibility-layer language.

## [0.9.11] - 2026-05-27

### Changed

- Synced the Access E2E fixture source snapshot, test runner, OpenSpec relink-directory artifacts, redacted Engram project export, and E2E fixture databases for machine handoff.
- Removed the hardcoded E2E backend password from exported VBA source; the fixture now reads the backend password from environment variables.

## [0.9.10] - 2026-05-26

### Fixed

- Fixed `Close-TargetAccessDbIfOpen` hanging indefinitely when zombie MSACCESS processes are stuck on unreachable network I/O (e.g. UNC paths): replaced bare `Get-CimInstance Win32_Process` with a `Start-Job` + `Wait-Job -Timeout 4` guard; if WMI does not respond within 4 seconds, falls back to `Get-Process` (no WMI) and kills all MSACCESS instances to release the lock.

## [0.9.9] - 2026-05-26

### Fixed

- Fixed four Access automation hang bugs in `dysflow-vba-manager.ps1` that caused MSACCESS.exe to never close and MCP tool calls to timeout:
  - `hWndAccessApp()` was called as a property instead of a method, silently failing PID capture via HWND.
  - `Stop-Process` was called after DAO restore operations; moved it before so the file lock is guaranteed released before DAO reopens the DB.
  - `RotManager.CloseDatabaseIfOpen` called `CloseCurrentDatabase()` but not `Quit()`, leaving zombie MSACCESS processes that accumulated across calls.
  - `Disable-StartupFeatures` now saves and removes the `AppIcon` DB property before `OpenCurrentDatabase`; UNC paths to unreachable servers caused 30-40s network timeouts inside `OpenCurrentDatabase` that raced the MCP 30s hard timeout. `Restore-StartupFeatures` restores it after Access closes.

## [0.9.8] - 2026-05-26

### Fixed

- Fixed MCP generic SQL tools so `dysflow_query_execute` and legacy `query_sql` expose and forward explicit backend/database targets, and the Access runner executes generic reads/writes against the selected database instead of the frontend. Closes #370.

## [0.9.7] - 2026-05-26

### Fixed

- Fixed OpenCode MCP startup on Windows by generating a direct Node runtime entrypoint instead of direct `.cmd` spawning. Closes #361.
- Fixed MCP `tools/call` hangs from Access project contexts by settling runner timeout/abort paths, preserving `timed_out` metadata, and returning terminal client-safe tool responses. Closes #362, #364, #365.
- Added SDD verification evidence for the MCP tool-call hang fix, including short `E2E_testing` probes for `dysflow_doctor` and `list_tables`. Closes #366.

## [0.9.6] - 2026-05-26

### Fixed

- Added safe recovery for stale `pid_unknown` Access operations after timeouts: forced cleanup and preflight can now retire unknown-PID records only when no matching `MSACCESS.EXE` process is found for the registered database path, while refusing to kill unowned Access processes. Closes #360.

## [0.9.5] - 2026-05-25

### Fixed

- **`run_script` DDL compatibility**: strip `--` line comments from SQL scripts before executing DDL statements, allowing scripts authored with standard SQL comment syntax to run without parse errors. Closes #348.

## [0.9.4] - 2026-05-25

### Fixed

- **MCP backend DDL targeting**: write/DDL tools now honor explicit `databasePath`/`backendPath` targets and can run directly against the requested backend instead of opening the configured frontend first. Closes #347.
- **Project-scoped MCP write gate**: calls that include explicit paths still resolve `allowWrites` from the matching repo `.dysflow/project.json`, preventing false `MCP_WRITES_DISABLED` failures for allowed projects.

## [0.9.3] - 2026-05-25

### Fixed

- **MCP E2E stability**: fixed `dysflow access` dry-run execution path in `Update-LinkTables` to avoid PowerShell non-operational failures during smoke tests and CI (`#346`).
- **Legacy schema compatibility**: restored acceptance of legacy form-catalog payload aliases (`spec`/`specPath`) for `catalog_add_control`.
- **Smoke harness correctness**: updated the MCP smoke harness expectations to the current tool count (`48`) and aligned form-catalog test input to include a valid empty spec payload.

## [0.9.1] - 2026-05-25

### Fixed

- Fixed `Close-TargetAccessDbIfOpen` failing during VBA import/export preflight because PowerShell `Write-Debug` catch bodies were accidentally embedded inside the C# `RotManager` `Add-Type` block (#342).

## [0.9.0] - 2026-05-25

### Features

- **MCP tool partitioning**: Split `tools.ts` to extract schemas, validator, and dispatch into separate files (`schemas.ts` and `validator.ts`) for better maintainability (#326)
- **Dependency injection & contracts**: Refactored HTTP server to use dependency injection, introduced `LegacyVbaSyncPort` to decouple core from adapters, and moved pure import plan helpers to core services (#338, #340, #341)

### PowerShell Diagnostics

- **Silent catches replaced**: Replaced all silent `catch {}` blocks in `dysflow-access-runner.ps1` and `dysflow-vba-manager.ps1` with diagnostic `Write-Debug` statements to aid troubleshooting (#327)

### Quality Gates & Test Coverage

- **Coverage improvements**: Raised `install.ts` coverage to ≥85% by testing edge cases and interactive selection, covered HTTP cleanup route, and increased `stdio.ts` coverage to ≥85% (#329, #334)
- **Tooling upgrades**: Migrated to TypeScript 6.0 and Vitest 4.0, and integrated Biome check for linting and formatting (#335, #336)

## [0.8.0] - 2026-05-24

### Features

- **`relink_directory` apply mode**: PS implementation complete — backup (.bak-*), chain resolution (depth-first, max 5 hops), apply loop with RefreshLink, `--remove-unresolved` support (#316, #318)
- **`relink_directory` verify mode**: `Test-LinkExternal` for strict-local and deny-prefix validation, non-zero exit on violations (#318)
- **Password propagation**: `Open-DatabaseWithPassword` helper in PS runner; `Invoke-RelinkDirectory` and `Resolve-LinkChain` now use `$AccessPassword`/`$BackendPassword` (#317)

### Fixed

- Fixed MCP modern tool naming: exported `MODERN_TOOL_NAMES` constant as single source of truth; regression test asserts no dots (#321)

### CI / Quality

- E2E relink-directory tests added to Windows CI job (#319)
- Pester tests now run automatically in CI (#319)
- `pnpm audit --audit-level=high` added to quality gate (#319)
- `test/integration/` added to vitest quality suite (#319)

### Dependencies

- Migrated vitest v1 → v3 (no breaking changes) (#322)
- Fixed `@vitest/coverage-v8` version pin — added `^` caret (#320)

### Tests

- 519 tests (+60 since v0.7.7)
- New dedicated tests for `serve`, `setup`, and `version` (#323)
- New integration tests for relink_directory apply mode (#316)

### Housekeeping

- Removed stale `fileExists` re-export from `install.ts` (#320)
- `coverage/` directory now gitignored (#320)
- Stale remote branches deleted (#320)
- 3 SDD changes archived: `relink-directory`, `release-fixes`, `fix-mcp-tool-name-underscores`

## [0.7.7] - 2026-05-24

### Fixed

- **Config Sync/Async Dedup**: Unified config parsing, routing, and error formatting under `loadDysflowConfigShared` and `loadProjectConfigCore` to prevent routing duplication.
- **VBA Service Split**: Extracted `VbaFormService` (form & catalog operations) and `vba-source-comparison.ts` (pure binary/source tree comparison helpers) from `VbaSyncLegacyService` while keeping stable backwards-compatible exports.
- **Install CLI Utils**: Decoupled `uninstall.ts` from `install.ts` by extracting filesystem and execution helpers to `install-utils.ts` and resolved Pester/PMR dependencies.
- **Preflight & Operations**: Removed non-null assertions in preflight cleanup and aligned `InMemoryAccessOperationRegistry` status purging with `FileRegistry` behavior.
- Updated installation instructions in `README.md` to reference the correct v0.7.7 release tag.

## [0.7.6] - 2026-05-23

### Fixed

- Renamed modern MCP tools to underscore-separated names (`dysflow_vba_execute`, `dysflow_query_execute`, `dysflow_doctor`, `dysflow_access_operations_list`, `dysflow_access_cleanup`) so PI/Codex clients that enforce `^[a-zA-Z0-9_-]+$` can load Dysflow tools. Closes #296.
- Updated installation instructions in `README.md` to reference the correct v0.7.6 release tag.

## [0.7.5] - 2026-05-22

### Fixed

- Resolved Node `DEP0190` security/deprecation warning on Windows during installation runner tasks.
- Enhanced password propagation in `relink-directory` to correctly authenticate frontend databases with the frontend password while fallback-authenticating links, and fall back to the backend password during root directory scanning.
- Recreated table links dynamically during apply mode when `SourceTableName` changes to resolve DAO collection constraints.
- Aligned MCP legacy `relink_directory` tool schema and mapper with modern CLI options (such as apply, maps, password, and timeout).
- Preserved existing `PWD` connection password in table links when no new backend password is provided.
- Propagated `recursive: false` correctly in the MCP legacy mapper instead of dropping the parameter.
- Fixed non-recursive directory scanning in the PowerShell runner script by using wildcard paths to avoid matching zero files.
- Updated installation instructions in `README.md` to reference the correct v0.7.5 release tag.

## [0.7.4] - 2026-05-22

### Fixed

- Fixed `relink-directory` PowerShell execution so protected databases are opened with `DYSFLOW_BACKEND_PASSWORD`, relinked `Connect` strings preserve `;PWD=...`, and existing linked TableDefs are refreshed without mutating immutable `SourceTableName`.

## [0.7.3] - 2026-05-22

### Fixed

- Resolved quality audit blockers: aligned `LinkClassification` contract and fixed E2E and unit test types to ensure `pnpm lint` passes cleanly.
- Added dynamic backend database password propagation to `relink-directory` command via `--password-env`.
- Secured process cleanup fallback inside VBA manager by matching full database paths instead of base filenames to prevent terminating unintended Access processes.
- Aligned documentation to reflect that the HTTP adapter is active and corrected MCP cleanup tool usage examples in `README.md`.

## [0.7.2] - 2026-05-22

### Fixed

- Fixed `spawn EINVAL` error on Windows during `dysflow update` when executing pnpm/npm update scripts. Closes #289.

## [0.7.1] - 2026-05-22

### Fixed

- Fixed PowerShell parsing error (`InvalidVariableReferenceWithDrive`) in the Access runner script (`dysflow-access-runner.ps1`) when deleting unresolved links. Closes #287.

## [0.7.0] - 2026-05-22

### Added

- `dysflow access relink-directory` command to bulk-remap linked-table backends in every Access file under a root directory. Supports dry-run (default), `--apply` mode with per-file `.bak-*` backups, `--map old=new` alias overrides, DFS chain resolution (max depth 5) with cycle detection, `--remove-unresolved` to delete unresolvable TableDef links, `--strict-local` and `--deny-prefix` exit-code guards, and `--no-backup` flag. Closes #282.

## [0.6.9] - 2026-05-22

### Added

- `dysflow uninstall` command to recursively delete runtime directories, clean machine-level markers, and surgically remove MCP configurations from Codex, OpenCode, Claude Desktop, Claude Settings, and Pi. Closes #278.

### Fixed

- Resolved path resolution bugs where global dysflow installed via pnpm symlinks exited silently without console output.
- Resolved spawn ENOENT errors when running update/install scripts on Windows (added pnpm.cmd/npm.cmd support).

## [0.6.8] - 2026-05-21

### Fixed

- `test_vba` now returns `VBA_TESTS_FAILED` when any individual VBA test result has `ok: false`, instead of propagating a success result with failing tests in the payload. Closes #273.
- `export_modules` pre-validates that every requested module name exists in VBProject before starting the export loop; returns `VBA_MODULE_NOT_FOUND` if any is missing. Closes #274.
- `catalog_add_control` now requires `controlName` and `controlType` params; returns `FORM_SPEC_INVALID` instead of silently defaulting to `UnnamedControl`/`Unknown`. Closes #275.

## [0.6.7] - 2026-05-21

### Added

- MCP progress notifications: `dysflow_vba_execute` and `dysflow_query_execute` now emit real-time `notifications/progress` frames to progress-aware clients when `_meta.progressToken` is present. Three milestones (10%/40%/90%) are emitted by the PowerShell runner via stderr side-channel. Closes #272.

## [0.6.6] - 2026-05-21

### Added

- Added support for backend database password propagation (`DYSFLOW_BACKEND_PASSWORD` / `;PWD=...`) across PowerShell runner operations (backend comparison and table link maintenance). Closes #263.
- Defined explicit backend resolution contract and schema for `localize_backend_links` tool, allowing `backendPath` fallback to config. Closes #265.
- Added a deterministic release matrix coverage gate test verification for all MCP tools. Closes #266.

### Removed

- Removed legacy MCP stub tools `init_project` and `normalize_documents` from the compatibility surface. Closes #259, #260, #255.

## [0.6.5] - 2026-05-20

### Fixed

- `dysflow install` and `dysflow update` now copy the PowerShell runtime scripts required by MCP/Access/VBA tools into `app/scripts`, preventing missing `dysflow-vba-manager.ps1` and `dysflow-access-runner.ps1` failures. Closes #251.
- Generated Windows launchers now escape the `ProgramFiles\nodejs` PATH segment correctly instead of writing a newline into the launcher.
- Legacy VBA sync now fails fast with `CONFIG_MISSING_ACCESS_PATH` when no explicit Access path or repo config can be resolved. Closes #230.
- MCP error path redaction now uses a single-pass sanitizer covered through public MCP error translation behavior. Closes #229.

### Changed

- Removed the dead legacy higher-level tool message map and use one consistent `LEGACY_TOOL_NOT_IMPLEMENTED` response. Closes #226.
- Refocused architecture boundary tests on behavior and meaningful core dependency invariants instead of brittle file/path checks. Closes #234.

## [0.6.3] - 2026-05-20

### Fixed

- `dysflow update` now reuses the runtime directory persisted by `dysflow install --runtime-dir`, so updates keep targeting the installed MCP runtime instead of silently falling back to the current Windows user's `%LOCALAPPDATA%\\dysflow`. Closes #250.

### Documentation

- Documented runtime directory precedence for install/update and clarified how OpenCode should point to custom runtime installs.

## [0.6.2] - 2026-05-19

### Changed

- Deprecated the global `%APPDATA%/dysflow/projects.json` registry path. Dysflow now relies on per-repository `.dysflow/project.json` configuration and no longer reads or writes the global registry. Closes #249.

## [0.6.1] - 2026-05-19

### Fixed

- `loadDysflowConfig` and `loadDysflowConfigAsync` now return `CONFIG_AMBIGUOUS_PROJECT_FILE` when both `.dysflow/project.json` and `dysflow.project.json` coexist in the same directory, instead of silently preferring one. Closes #61.

## [0.6.0] - 2026-05-19

### Added

- MCP write-capable tools can now be enabled per project via `.dysflow/project.json` using `"allowWrites": true`, while keeping writes disabled by default globally. Closes #244.

### Fixed

- Added pre-flight Access cleanup before modern and legacy Access operations. Dysflow now cleans stale registry-tracked operations and safely terminates orphaned `MSACCESS.EXE` processes only when their command line matches the current `.accdb` exactly. Closes #245.

## [0.5.4] - 2026-05-19

### Fixed

- Rollback release: restored the runtime behavior from `v0.5.3` after unreleased security-hardening changes on `main` caused MCP project resolution and write-gating regressions in Access/VBA worktrees.
- This release intentionally preserves the stable `v0.5.3` functionality while giving `dysflow update` a newer version to reinstall cleanly.

## [0.5.3] - 2026-05-19

### Fixed

- `test_vba` now honors explicit `proceduresJson` payloads instead of always resolving from a manifest.
- Relative `testsPath` values now resolve from the project root, so `tests/tests.vba.json` works when `destinationRoot` is `src`.
- Pipe-separated `filter` values such as `Test_A|Test_B` now select tests by OR across name, procedure, and tags.
- Empty `proceduresJson` or filters that select no tests now fail early with `VBA_NO_TESTS_SELECTED` and do not call PowerShell with an empty `-Procedures` array. Closes #211.

## [0.5.2] - 2026-05-19

### Fixed

- Hardened config and VBA sync error handling: malformed project JSON is returned as `CONFIG_PROJECT_FILE_INVALID`, `parseArgsJson` no longer leaks uncaught exceptions, and catalog write failures propagate as `VBA_CATALOG_WRITE_FAILED`. Closes #192, #193, #194.
- Removed cross-adapter HTTP→MCP coupling, made MCP write gating explicit at tool construction, and removed the dead legacy schema fallback behind a parity-tested schema map. Closes #196, #197, #200.
- Improved registry and redaction safety: single-pass record eviction, direct ISO timestamp comparisons, removal of `readRecordsUnlocked`, short Windows path redaction, and warnings for absolute registry paths outside the registry directory. Closes #198, #199, #202, #204, #205.
- Moved CI linting before test/build, removed the redundant `postinstall` build, and added TypeScript checking for test files. Closes #201, #206.

### Changed

- Deduplicated sync/async project config construction through shared pure helpers while preserving the public API. Closes #195.
- Exported the shared `truthy()` utility and named package-root traversal / subprocess buffer constants. Closes #203.

### Documentation

- Updated the Git install example to the current release tag, documented public operation-result contracts, and added an explicit Access E2E skip message. Closes #207, #208, #209.

## [0.5.1] - 2026-05-18

### Fixed

- Extracted shared PowerShell execution for Access runner and legacy VBA manager paths, reducing duplicated timeout/stdout/stderr process handling. Closes #180.
- Added async project configuration loading for production CLI, HTTP, MCP, and legacy VBA paths while keeping the existing sync API for compatibility. Closes #181.
- Added Windows CI smoke coverage for PowerShell/Access-facing integration paths. Closes #182.
- `dysflow update` now reports the installed release commit SHA when installing from a GitHub release clone. Closes #183.

## [0.5.0] - 2026-05-18

### Fixed

- `WindowsMsAccessProcessInspector` now converts WMI DMTF datetime to ISO 8601 before returning, preventing false `CLEANUP_PROCESS_START_TIME_MISMATCH` rejections during cleanup. Closes #172.
- `isReadOnlySql` rewritten with a token-aware parser that strips string literals before checking for top-level statement separators, so valid queries with semicolons in literals are accepted. Closes #173.
- E2E fixture test now asserts `rows` as an array; fixed `Convert-RecordsetRows` in the PowerShell runner to always serialize single-element results as a JSON array (not object). Closes #174.
- `dryRun: true` in `relink_tables` and other write tools is no longer blocked by the `MCP_WRITES_DISABLED` guard — dry-run operations are treated as reads and always permitted. Closes #184.
- `export_modules` and `export_all` now respect the `exportPath` parameter when provided, instead of always writing to the project `destinationRoot`/`src/`. Closes #185.
- HTTP adapter now uses `FileAccessOperationRegistry` (same as the MCP adapter), so `GET /access/operations` reflects operations from both adapters. Closes #176.

### Added

- Path sandboxing in `dysflow-access-runner.ps1` extracted into a reusable `Resolve-SandboxedPath` helper, extended to cover `importPath`, `targetPath` (compact-repair), and `scriptPath` (run_script). Significantly reduces path traversal surface.
- Oversized-line handling in the MCP stdio runtime now uses per-chunk byte counting, correctly reporting the error and continuing to process subsequent frames.
- Per-tool input schemas for all 46 legacy MCP tools: each tool now exposes only its own parameters. Closes #177.
- Coverage thresholds raised from 0% to measured baseline (statements 86%, branches 75%, functions 88%, lines 86%). CI now blocks regressions. Closes #178.

### Changed

- Unimplemented stub tools (`verify_code`, `verify_binary`, `reconcile_binary`, `init_project`, `normalize_documents`) are now hidden from `tools/list`. Agents no longer see tools that always return an error. Closes #175.
- `FileAccessOperationRegistry.get()` and `listRecent()` now bypass the write lock, eliminating unnecessary contention when agents poll for operation status. Closes #179.

## [0.4.5] - 2026-05-18

### Fixed

- Legacy VBA sync tools (`test_vba`, `compile_vba`, `import_modules`, etc.) now honour `timeoutMs` from `.dysflow/project.json` instead of always using the service-level 30 000 ms default. Explicit per-call `timeoutMs` in tool params still takes precedence.

### Added

- Documented the timeout resolution order (per-call > project config > service default) in `docs/architecture/dysflow-core-and-adapters.md`.

## [0.4.4] - 2026-05-18

### Fixed

- Closed the v0.4.3 security audit by hardening secret redaction, password transport, Windows command/path validation, MCP write gates, HTTP response headers, release tag validation, and Access query export boundaries. Closes #167, #168, #169, #170, #171.

### Added

- Added a real Access fixture E2E test that exercises HTTP diagnostics and read SQL through the production PowerShell/Access runner when local Access fixtures and Access COM are available.

## [0.4.3] - 2026-05-18

### Fixed

- HTTP server no longer returns raw config error (with internal filesystem paths) to callers when starting in degraded mode — now returns a generic `SERVICE_UNAVAILABLE` and logs the original error to stderr. Closes #159.
- CLI setup command no longer includes the registry file path in the malformed-JSON error message. Closes #160.

## [0.4.2] - 2026-05-18

### Fixed

- Hardened audit findings around malformed JSON handling, Windows CLI entrypoint URLs, TUI close/default selection safety, and degraded HTTP startup.
- Removed fragile package-version `createRequire` lookups and moved shared version comparison out of install command internals.

### Changed

- Cached legacy MCP schemas during tool registration and removed unused planned command dead code.

## [0.4.1] - 2026-05-17

### Fixed

- Allowed `dysflow update` to resolve GitHub releases in authenticated/private-repo contexts via `GH_TOKEN`/`GITHUB_TOKEN` headers or authenticated `gh` CLI fallback.

## [0.4.0] - 2026-05-17

### Added

- Made `dysflow update` fetch the latest GitHub release, build it in a temporary workspace, and install it into the local runtime.
- Added release-update coverage for newer releases, current releases, forced reinstalls, and GitHub/provider failures.

## [0.3.1] - 2026-05-17

### Fixed

- Made TUI dashboard Enter actions execute the selected option: integration selection opens/applies selected agents and Doctor runs diagnostics.

## [0.3.0] - 2026-05-17

### Added

- Added `dysflow --version` and `dysflow -v` for direct CLI/runtime version verification.

- Next milestones and features will be tracked in future releases.

## [0.2.5] - 2026-05-17

### Fixed

- Serialized file-backed Access operation registry updates to avoid losing records under concurrent requests.
- Recorded resolved project and destination roots in Access operation metadata instead of the process working directory.
- Reported runtime fallback config source truthfully when no repo project config is loaded.

## [0.2.4] - 2026-05-17

### Fixed

- Allowed registered-project import dry-runs to resolve by `projectId`/`contextId` even when the MCP server starts outside a Dysflow repo.

## [0.2.3] - 2026-05-17

### Fixed

- Fixed the generated PowerShell launcher so custom `--runtime-dir` installs set `DYSFLOW_HOME` to the selected runtime directory.

## [0.2.2] - 2026-05-17

### Fixed

- Clarified `projectId` as the canonical Engram-aligned project identity and `contextId` as optional run context.
- Added `dysflow setup --set-project-id <id>` to update `.dysflow/project.json` trace identity.
- Fixed multi-worktree project resolution so explicit registered `projectId`/`contextId` does not silently fall back to cwd.
- Added dry-run plan mode and strict context diagnostics for Access import operations.

## [0.2.1] - 2026-05-17

### Fixed

- Kept the default TUI dashboard open in interactive terminals so arrow-key navigation works until the user exits.

## [0.2.0] - 2026-05-17

### Added

- Added the first Dysflow TUI dashboard path: running `dysflow` with no command opens a branded dashboard with local/latest version status and integration menu affordances.
- Added pure TUI render helpers for the framed Dysflow header, update guidance, and integration checkbox lists.
- Added safe Dysflow MCP config detection/removal helpers for future TUI install selection flows.

## [0.1.4] - 2026-05-17

### Fixed

- Fixed self-reinstall from the profile runtime launcher by skipping runtime copy operations whose source and destination are the same path.

## [0.1.3] - 2026-05-17

### Fixed

- Fixed `dysflow install` package-root detection so a globally/profile-installed Dysflow can reinstall from any current working directory instead of looking for `./dist`.

## [0.1.2] - 2026-05-17

### Fixed

- Hardened MCP tool schemas so every array declares `items`, including legacy `rows` and VBA `arguments`, preventing OpenCode schema-load failures.
- Returned thrown tool-call failures as MCP `isError` tool results instead of JSON-RPC internal errors, keeping the AI session informed and connected.
- Allowed `dysflow mcp` to start in degraded mode when `.dysflow/project.json` is missing so clients can list tools and receive configuration errors per call.

## [0.1.1] - 2026-05-17

### Fixed

- Corrected the OpenCode MCP installer output to use the current local-server schema with `enabled`, `type`, and argv-array `command`.

## [0.1.0] - 2026-05-16

### Dysflow v0.1.0 — Initial Release: MCP Safety Baseline

Initial production release focused on making Access automation safe, observable and MCP-compatible.

#### Added

- New MCP stdio runtime entrypoint (`dysflow mcp`) with protocol-aware initialize responses.
- Core command surface:
  - `dysflow_vba_execute`
  - `dysflow_query_execute`
  - `dysflow_doctor`
  - `dysflow_access_operations_list`
  - `dysflow_access_cleanup`
- Legacy compatibility MCP tools for query/VBA/form/schema slices.
- MCP protocol maintenance instrumentation:
  - named protocol constant `MCP_PROTOCOL_VERSION`
  - documented maintenance workflow for protocol changes
  - test coverage for JSON-RPC `id: null` behavior
- Strict write safety in legacy paths (`apply`, `dryRun`, guarded write request mapping).
- Deterministic timeout ownership in legacy VBA sync path via `AbortSignal` cancellation.

#### Changed

- Centralized legacy MCP metadata (`status`, `slice`, `queryMode`) in `legacy-parity-registry`.
- MCP/HTTP/CLI command behavior aligned to a core-first, adapter-translation model.

#### Fixed / Hardened

- Unsafe cleanup behavior prevented unless operation ownership checks pass.
- Redaction and handling consistency for errors that include credentials/passwords.
- MCP protocol drift risks reduced by explicit version declaration and docs/tests.

#### Documentation

- Reworked README into production-oriented documentation.
- Added protocol maintenance guide: `docs/testing/mcp-protocol-maintenance.md`.
- Added HTTP API reference: `docs/api/http-api.md`.
- Added E2E MCP reference: `docs/testing/mcp-access-e2e.md`.
