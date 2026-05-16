# Changelog

All notable changes to Dysflow will be documented in this file.

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

## [Unreleased]

- Next milestones and features will be tracked in future releases.
