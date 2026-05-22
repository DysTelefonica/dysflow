# Changelog

All notable changes to Dysflow will be documented in this file.

## [0.7.5] - 2026-05-22

### Fixed

- Resolved Node `DEP0190` security/deprecation warning on Windows during installation runner tasks.
- Enhanced password propagation in `relink-directory` to correctly authenticate frontend databases with the frontend password while fallback-authenticating links, and fall back to the backend password during root directory scanning.
- Recreated table links dynamically during apply mode when `SourceTableName` changes to resolve DAO collection constraints.
- Aligned MCP legacy `relink_directory` tool schema and mapper with modern CLI options (such as apply, maps, password, and timeout).
- Preserved existing `PWD` connection password in table links when no new backend password is provided.

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

- MCP progress notifications: `dysflow.vba.execute` and `dysflow.query.execute` now emit real-time `notifications/progress` frames to progress-aware clients when `_meta.progressToken` is present. Three milestones (10%/40%/90%) are emitted by the PowerShell runner via stderr side-channel. Closes #272.

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
  - `dysflow.vba.execute`
  - `dysflow.query.execute`
  - `dysflow.doctor`
  - `dysflow.access.operations.list`
  - `dysflow.access.cleanup`
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
