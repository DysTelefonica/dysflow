# Changelog

All notable changes to Dysflow will be documented in this file.

## [Unreleased]

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
